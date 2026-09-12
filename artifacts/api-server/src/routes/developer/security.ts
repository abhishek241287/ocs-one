import { Router, type IRouter } from "express";
import { promises as fs } from "node:fs";
import path from "node:path";
import { db, usersTable, securityEventsTable } from "@workspace/db";
import { and, count, desc, eq, gte, lte, sql } from "drizzle-orm";
import { requireRole } from "../../middleware/auth";
import {
  AUDIT_MATRIX,
  DEALER_ASSIGNMENT_EVENT_TYPE,
} from "../../lib/audit-matrix";
import type {
  DealerAssignmentAuditDetail,
  DealerAssignmentAuditSnapshot,
} from "../../lib/security-events";
import {
  AUTHZ_MATRIX,
  PRINCIPALS,
  matrixSummary,
} from "../../lib/authz-matrix";
import {
  describeCspStatus,
  describeJwtConfig,
  RATE_LIMITS,
} from "../../lib/security-config";

const router: IRouter = Router();

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SecurityEventRow = typeof securityEventsTable.$inferSelect;

export interface DealerAssignmentChange {
  id: string;
  eventType: typeof DEALER_ASSIGNMENT_EVENT_TYPE;
  createdAt: Date;
  actorEmail: string | null;
  actorRole: string | null;
  targetEmail: string | null;
  previousDealership: DealerAssignmentAuditSnapshot;
  newDealership: DealerAssignmentAuditSnapshot;
}

function isSnapshot(value: unknown): value is DealerAssignmentAuditSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Record<string, unknown>;
  return (
    (typeof snapshot.id === "string" || snapshot.id === null) &&
    (typeof snapshot.code === "string" || snapshot.code === null) &&
    (typeof snapshot.name === "string" || snapshot.name === null)
  );
}

/**
 * Read the structured transition detail and retain a compatibility fallback
 * for rows written before the structured detail contract existed.
 */
function parseDealerAssignmentChange(row: SecurityEventRow): DealerAssignmentChange {
  let detail: Partial<DealerAssignmentAuditDetail> | null = null;
  if (row.detail) {
    try {
      const parsed = JSON.parse(row.detail) as Partial<DealerAssignmentAuditDetail>;
      if (
        parsed.kind === "dealer_assignment" &&
        isSnapshot(parsed.previousDealership) &&
        isSnapshot(parsed.newDealership)
      ) {
        detail = parsed;
      }
    } catch {
      // Legacy detail is handled below.
    }
  }

  if (!detail) {
    const legacy = row.detail?.match(
      /^Dealer assignment changed for .+?: (.+?) → (.+?)(?: \(([^ ]+) — (.+)\))?$/,
    );
    detail = {
      previousDealership: {
        id: legacy?.[1] && legacy[1] !== "unassigned" ? legacy[1] : null,
        code: null,
        name: null,
      },
      newDealership: {
        id: legacy?.[2] && legacy[2] !== "unassigned" ? legacy[2] : null,
        code: legacy?.[3] ?? null,
        name: legacy?.[4] ?? null,
      },
    };
  }

  return {
    id: row.id,
    eventType: DEALER_ASSIGNMENT_EVENT_TYPE,
    createdAt: row.createdAt,
    actorEmail: row.actorEmail,
    actorRole: row.actorRole,
    targetEmail: row.targetEmail ?? detail.targetEmail ?? null,
    previousDealership: detail.previousDealership!,
    newDealership: detail.newDealership!,
  };
}

/** Walk up from cwd to the repo root (the dir containing pnpm-workspace.yaml). */
async function findRepoRoot(): Promise<string> {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    try {
      await fs.access(path.join(dir, "pnpm-workspace.yaml"));
      return dir;
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return process.cwd();
}

/**
 * Read the most recent security-scan summary written by the certification
 * pipeline. Returns an honest "not yet recorded" marker when absent rather than
 * fabricating clean results — measure, don't assume.
 */
async function readScanSummary(): Promise<{
  recorded: boolean;
  generatedAt: string | null;
  dependencyAudit: unknown;
  sast: unknown;
  privacy: unknown;
  certification: unknown;
}> {
  const root = await findRepoRoot();
  const file = process.env.SECURITY_SCAN_FILE ?? path.join(root, "certification", "security-scans.json");
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      recorded: true,
      generatedAt: (parsed.generatedAt as string) ?? null,
      dependencyAudit: parsed.dependencyAudit ?? null,
      sast: parsed.sast ?? null,
      privacy: parsed.privacy ?? null,
      certification: parsed.certification ?? null,
    };
  } catch {
    return {
      recorded: false,
      generatedAt: null,
      dependencyAudit: null,
      sast: null,
      privacy: null,
      certification: null,
    };
  }
}

function queryString(value: unknown): string | null | "invalid" {
  if (value == null || value === "") return null;
  if (Array.isArray(value) || typeof value !== "string") return "invalid";
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseDateFilter(value: unknown): string | null | "invalid" {
  const dateString = queryString(value);
  if (dateString === "invalid" || dateString === null) return dateString;
  if (!DATE_ONLY_RE.test(dateString)) return "invalid";

  const date = new Date(`${dateString}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== dateString
  ) {
    return "invalid";
  }
  return dateString;
}

// ─── GET /api/developer/security — security posture dashboard (director-only) ───
router.get("/", requireRole("director"), async (req, res) => {
  const targetEmail = queryString(req.query.targetEmail);
  const from = parseDateFilter(req.query.from);
  const to = parseDateFilter(req.query.to);

  if (
    targetEmail === "invalid" ||
    (targetEmail !== null && !EMAIL_RE.test(targetEmail)) ||
    from === "invalid" ||
    to === "invalid"
  ) {
    res.status(400).json({
      error: "targetEmail must be a valid email and from/to must be valid YYYY-MM-DD dates",
    });
    return;
  }

  if (from && to && from > to) {
    res.status(400).json({ error: "from must be on or before to" });
    return;
  }

  const since24h = new Date(Date.now() - DAY_MS);
  const since7d = new Date(Date.now() - 7 * DAY_MS);
  const assignmentFilterConditions = [
    eq(securityEventsTable.eventType, DEALER_ASSIGNMENT_EVENT_TYPE),
    ...(targetEmail ? [eq(securityEventsTable.targetEmail, targetEmail.toLowerCase())] : []),
    ...(from ? [gte(securityEventsTable.createdAt, new Date(`${from}T00:00:00.000Z`))] : []),
    ...(to ? [lte(securityEventsTable.createdAt, new Date(`${to}T23:59:59.999Z`))] : []),
  ];
  const assignmentFilterWhere = and(...assignmentFilterConditions);
  const last7dAssignmentWhere = and(
    ...assignmentFilterConditions,
    gte(securityEventsTable.createdAt, since7d),
  );

  const [
    usersByRoleRows,
    activeUsersRow,
    eventCountRows,
    failedLogins24hRow,
    failedLoginsRecent,
    rateLimitEventsRecent,
    accountCreationsRecent,
    permissionFailuresRecent,
    auditActivityRecent,
    dealerAssignmentChangesCountRow,
    dealerAssignmentChangesFilteredCountRow,
    dealerAssignmentChangesRecent,
    scan,
  ] = await Promise.all([
    // 1. Users by role
    db
      .select({ role: usersTable.role, total: count() })
      .from(usersTable)
      .groupBy(usersTable.role),
    db.select({ total: count() }).from(usersTable).where(eq(usersTable.isActive, true)),
    // Event type histogram (last 7 days)
    db
      .select({ eventType: securityEventsTable.eventType, total: count() })
      .from(securityEventsTable)
      .where(gte(securityEventsTable.createdAt, since7d))
      .groupBy(securityEventsTable.eventType)
      .orderBy(desc(count())),
    // 3. Failed logins (24h count)
    db
      .select({ total: count() })
      .from(securityEventsTable)
      .where(
        sql`${securityEventsTable.eventType} = 'auth.login.failed' AND ${securityEventsTable.createdAt} >= ${since24h}`,
      ),
    db
      .select()
      .from(securityEventsTable)
      .where(eq(securityEventsTable.eventType, "auth.login.failed"))
      .orderBy(desc(securityEventsTable.createdAt))
      .limit(20),
    // 4. Rate-limit events
    db
      .select()
      .from(securityEventsTable)
      .where(eq(securityEventsTable.eventType, "ratelimit.exceeded"))
      .orderBy(desc(securityEventsTable.createdAt))
      .limit(20),
    // 5. Account creation log
    db
      .select()
      .from(securityEventsTable)
      .where(eq(securityEventsTable.eventType, "user.created"))
      .orderBy(desc(securityEventsTable.createdAt))
      .limit(20),
    // 6. Permission failures (403)
    db
      .select()
      .from(securityEventsTable)
      .where(eq(securityEventsTable.eventType, "authz.denied"))
      .orderBy(desc(securityEventsTable.createdAt))
      .limit(20),
    // 7. Audit activity (all recent events)
    db
      .select()
      .from(securityEventsTable)
      .orderBy(desc(securityEventsTable.createdAt))
      .limit(30),
    // Dedicated dealer-account history. This exact event type is also declared
    // in AUDIT_MATRIX, so the dashboard cannot silently drift to a display-only
    // label or a different event name.
    db
      .select({ total: count() })
      .from(securityEventsTable)
      .where(last7dAssignmentWhere),
    db
      .select({ total: count() })
      .from(securityEventsTable)
      .where(assignmentFilterWhere),
    db
      .select()
      .from(securityEventsTable)
      .where(assignmentFilterWhere)
      .orderBy(desc(securityEventsTable.createdAt))
      .limit(30),
    // 8. Scan / dependency / certification summary from disk
    readScanSummary(),
  ]);

  const usersByRole = Object.fromEntries(
    usersByRoleRows.map((r) => [r.role, r.total]),
  );

  // Authorization matrix grouped for display.
  const matrixByGroup: Record<string, typeof AUTHZ_MATRIX> = {};
  for (const ep of AUTHZ_MATRIX) {
    (matrixByGroup[ep.group] ??= []).push(ep);
  }

  const eventTotals = new Map(eventCountRows.map((row) => [row.eventType, row.total]));
  const auditEventCounts = AUDIT_MATRIX
    .filter((check) => check.store === "security")
    .map((check) => ({
      id: check.id,
      action: check.action,
      eventType: check.expectedEventType,
      total: eventTotals.get(check.expectedEventType) ?? 0,
    }));

  res.json({
    generatedAt: new Date().toISOString(),

    // 1. Users by role
    usersByRole: {
      counts: usersByRole,
      activeTotal: activeUsersRow[0]?.total ?? 0,
    },

    // 2. Endpoint authorization matrix
    authorizationMatrix: {
      summary: matrixSummary(),
      principals: PRINCIPALS,
      groups: matrixByGroup,
    },

    // 3. Failed logins
    failedLogins: {
      last24h: failedLogins24hRow[0]?.total ?? 0,
      recent: failedLoginsRecent,
    },

    // 4. Rate-limit events
    rateLimitEvents: {
      policies: RATE_LIMITS,
      recent: rateLimitEventsRecent,
    },

    // 5. Account creation log
    accountCreations: accountCreationsRecent,

    // 6. Permission failures (403)
    permissionFailures: permissionFailuresRecent,

    // 7. Audit activity feed
    auditActivity: auditActivityRecent,

    // 8. Dedicated dealer-account history and count (last 7d / recent 30)
    dealerAssignmentChanges: {
      last7d: dealerAssignmentChangesCountRow[0]?.total ?? 0,
      filteredCount: dealerAssignmentChangesFilteredCountRow[0]?.total ?? 0,
      recent: dealerAssignmentChangesRecent.map(parseDealerAssignmentChange),
      filters: {
        targetEmail: targetEmail?.toLowerCase() ?? null,
        from,
        to,
      },
    },

    // 9. Event counts (histogram, 7d)
    eventCounts: eventCountRows,
    // Matrix-backed counts include zero-count audited events, which makes the
    // dashboard's summary consistent with the certification contract.
    auditEventCounts,

    // 10. Security scan summary (SAST + privacy)
    securityScan: {
      recorded: scan.recorded,
      generatedAt: scan.generatedAt,
      sast: scan.sast,
      privacy: scan.privacy,
    },

    // 10. Dependency audit
    dependencyAudit: {
      recorded: scan.recorded,
      generatedAt: scan.generatedAt,
      result: scan.dependencyAudit,
    },

    // 11. CSP status
    cspStatus: describeCspStatus(),

    // 12. JWT / session config + certification status
    jwtConfig: describeJwtConfig(),
    certificationStatus: {
      recorded: scan.recorded,
      generatedAt: scan.generatedAt,
      result: scan.certification,
    },
  });
});

export default router;
