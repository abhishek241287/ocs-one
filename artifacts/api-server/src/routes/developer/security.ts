import { Router, type IRouter } from "express";
import { promises as fs } from "node:fs";
import path from "node:path";
import { db, usersTable, securityEventsTable } from "@workspace/db";
import { count, desc, eq, sql, gte } from "drizzle-orm";
import { requireRole } from "../../middleware/auth";
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

// ─── GET /api/developer/security — security posture dashboard (director-only) ───
router.get("/", requireRole("director"), async (_req, res) => {
  const since24h = new Date(Date.now() - DAY_MS);
  const since7d = new Date(Date.now() - 7 * DAY_MS);

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

    // 8. Event counts (histogram, 7d)
    eventCounts: eventCountRows,

    // 9. Security scan summary (SAST + privacy)
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
