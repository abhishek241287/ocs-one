// ─── SS-03 — Automated Audit Trail Verification Suite ─────────────────────────
// Permanent audit-trail certification test, the complement to SS-02:
//   SS-02 → "Can the principal do this?"     (authorization)
//   SS-03 → "Was it recorded correctly?"     (audit trail)
//
// For EVERY critical operation in the audit matrix (lib/audit-matrix.ts) this
// suite performs the real action against the live server, then reads the audit
// store and asserts the correct event was persisted with the required fields
// (event type, actor, timestamp, entity id, details). It also proves the audit
// history is IMMUTABLE — both statically (no application route UPDATE/DELETEs the
// audit tables) and at runtime (a captured record is byte-identical at the end of
// the run). Any failure exits non-zero and fails certification.
//
// All mutating work happens against a clearly-marked, throwaway cert lot and a
// uniquely-named temp user, both torn down on exit — the suite never touches
// pre-existing manufacturing or audit data (immutability is verified by re-reading
// a real record, never by mutating one).
//
// Run:  pnpm --filter @workspace/api-server run test:audit
// Env:  CERT_BASE_URL (default http://localhost:80)
//       CERT_DIRECTOR_EMAIL / CERT_DIRECTOR_PASSWORD (default admin seed)
//       CERT_AUDIT_RATELIMIT=1 — also exercise the 429 → ratelimit.exceeded path
//         by bursting the auth limiter. OFF by default because it trips the
//         in-memory auth rate limiter (cleared by an api-server restart); when
//         OFF, the rate-limit class is verified in shape-mode against the most
//         recent existing record instead of being re-triggered.
//       CERT_FORCE_FAIL=<checkId> — flips one expectation to prove the suite
//         actually fails on a mismatch (sanity check).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  db,
  cellLotsTable,
  cellsTable,
  cellLotEventsTable,
  engineeringCorrectionsTable,
  securityEventsTable,
  usersTable,
} from "@workspace/db";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { AUDIT_MATRIX, type AuditCheck, type AuditStore } from "../lib/audit-matrix";

const BASE_URL = (process.env.CERT_BASE_URL ?? "http://localhost:80").replace(/\/$/, "");
const DIRECTOR_EMAIL = process.env.CERT_DIRECTOR_EMAIL ?? "admin@ocs.local";
const DIRECTOR_PASSWORD = process.env.CERT_DIRECTOR_PASSWORD ?? "OCS@Admin2026!";
const EXERCISE_RATELIMIT = process.env.CERT_AUDIT_RATELIMIT === "1";
const FORCE_FAIL = process.env.CERT_FORCE_FAIL ?? null;

const RUN_TAG = Date.now();
const TEMP_PASSWORD = "SS03!Cert#Temp2026";
const VIEWER_EMAIL = `ss03.viewer.${RUN_TAG}@cert.local`;
const CERT_LOT_NUMBER = `SS03-CERT-${RUN_TAG}`;

type CookieJar = string | null;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function cookieFromSetCookie(setCookie: string | null): CookieJar {
  if (!setCookie) return null;
  const match = setCookie.match(/ocs_token=([^;]+)/);
  return match ? `ocs_token=${match[1]}` : null;
}

async function fetchResilient(url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, init);
    if (res.status !== 429) return res;
    const reset = Number(res.headers.get("ratelimit-reset") ?? res.headers.get("retry-after"));
    const waitMs = Math.min(Number.isFinite(reset) && reset > 0 ? reset * 1000 + 500 : 2000, 65_000);
    await res.text().catch(() => undefined);
    console.log(`   …rate limited on ${url}; waiting ${Math.round(waitMs / 1000)}s before retry`);
    await sleep(waitMs);
  }
  throw new Error(`Persistent 429 (rate limited) for ${url} — cannot certify reliably`);
}

async function login(email: string, password: string): Promise<{ jar: CookieJar; status: number }> {
  const res = await fetchResilient(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const jar = res.ok ? cookieFromSetCookie(res.headers.get("set-cookie")) : null;
  await res.text().catch(() => undefined);
  return { jar, status: res.status };
}

// ─── Field extraction ─────────────────────────────────────────────────────────
// Map each store's concrete columns onto the four logical audit fields the CTO
// requires (actor / timestamp / entityId / details).
interface LogicalFields {
  actor: unknown;
  timestamp: unknown;
  entityId: unknown;
  details: unknown;
}
function extract(store: AuditStore, row: Record<string, unknown>): LogicalFields {
  if (store === "security") {
    return {
      actor: row.actorEmail ?? row.targetEmail ?? null,
      timestamp: row.createdAt ?? null,
      entityId: row.targetEmail ?? row.path ?? null,
      details: row.detail ?? null,
    };
  }
  return {
    actor: row.performedBy ?? null,
    timestamp: row.performedAt ?? null,
    entityId: row.lotId ?? null,
    details: row.changes ?? null,
  };
}
function present(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (v instanceof Date) return !Number.isNaN(v.getTime());
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return true;
}

// ─── Persisted-row lookups ──────────────────────────────────────────────────
const runStart = new Date();
let certLotId = "";

// ─── Semantic correctness ─────────────────────────────────────────────────────
// Presence is not enough for an audit cert — a record with the right event type but
// the wrong actor, entity, or details is a regression. These validators assert the
// persisted record carries the CORRECT identity / entity id / content, so a mis-
// attributed or malformed audit row fails certification. Returns a list of problems.
function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}
const SEMANTIC: Record<string, (r: Record<string, unknown>) => string[]> = {
  "auth.login.success": (r) =>
    [
      r.actorEmail === VIEWER_EMAIL ? "" : "actor≠viewer",
      r.statusCode === 200 ? "" : "status≠200",
    ].filter(Boolean),
  "auth.login.failed": (r) =>
    [
      r.targetEmail === VIEWER_EMAIL ? "" : "target≠viewer",
      r.actorEmail == null ? "" : "actor set on failed login",
      r.statusCode === 401 ? "" : "status≠401",
    ].filter(Boolean),
  "auth.logout": (r) => (r.actorEmail === VIEWER_EMAIL ? [] : ["actor≠viewer"]),
  "user.created": (r) =>
    [
      r.actorEmail === DIRECTOR_EMAIL ? "" : "actor≠director",
      r.targetEmail === VIEWER_EMAIL ? "" : "target≠new-user",
      typeof r.detail === "string" && r.detail.toLowerCase().includes("viewer")
        ? ""
        : "detail missing role",
    ].filter(Boolean),
  "authz.denied": (r) =>
    [
      r.actorEmail === VIEWER_EMAIL ? "" : "actor≠viewer",
      r.statusCode === 403 ? "" : "status≠403",
      typeof r.path === "string" && r.path.includes("/cells/lots") ? "" : "path≠target",
    ].filter(Boolean),
  "ratelimit.exceeded": (r) =>
    [
      r.statusCode === 429 ? "" : "status≠429",
      typeof r.path === "string" && r.path.includes("/auth/login") ? "" : "path≠login",
    ].filter(Boolean),
  lot_received: (r) => {
    const c = asObj(r.changes);
    return [
      r.performedBy === DIRECTOR_EMAIL ? "" : "actor≠director",
      r.lotId === certLotId ? "" : "entity≠certLot",
      c.lotNumber === CERT_LOT_NUMBER ? "" : "changes.lotNumber wrong",
    ].filter(Boolean);
  },
  lot_updated: (r) => {
    const c = asObj(r.changes);
    return [
      r.performedBy === DIRECTOR_EMAIL ? "" : "actor≠director",
      r.lotId === certLotId ? "" : "entity≠certLot",
      typeof r.reason === "string" && r.reason.length > 0 ? "" : "reason missing",
      "manufacturer" in c ? "" : "changes missing edited field",
    ].filter(Boolean);
  },
  cell_graded: (r) => {
    const c = asObj(r.changes);
    return [
      r.performedBy === DIRECTOR_EMAIL ? "" : "actor≠director",
      r.lotId === certLotId ? "" : "entity≠certLot",
      typeof c.cellId === "string" ? "" : "changes.cellId missing",
      typeof c.grade === "string" ? "" : "changes.grade missing",
    ].filter(Boolean);
  },
  grading_started: (r) => {
    const st = asObj(asObj(r.changes).status);
    return [
      r.performedBy === DIRECTOR_EMAIL ? "" : "actor≠director",
      st.to === "grading" ? "" : "changes.status.to≠grading",
    ].filter(Boolean);
  },
  lot_fully_graded: (r) => {
    const st = asObj(asObj(r.changes).status);
    return [
      r.performedBy === DIRECTOR_EMAIL ? "" : "actor≠director",
      st.to === "graded" ? "" : "changes.status.to≠graded",
    ].filter(Boolean);
  },
  cell_grade_corrected: (r) => {
    const c = asObj(r.changes);
    const grade = asObj(c.grade);
    return [
      r.performedBy === DIRECTOR_EMAIL ? "" : "actor≠director",
      r.lotId === certLotId ? "" : "entity≠certLot",
      typeof r.reason === "string" && r.reason.length > 0 ? "" : "correction reason missing",
      typeof c.cellId === "string" ? "" : "changes.cellId missing",
      "from" in grade && "to" in grade ? "" : "changes.grade before/after missing",
    ].filter(Boolean);
  },
};

async function findSecurityEvent(
  eventType: string,
  match?: { actorEmail?: string; targetEmail?: string },
): Promise<Record<string, unknown> | null> {
  const rows = await db
    .select()
    .from(securityEventsTable)
    .where(and(eq(securityEventsTable.eventType, eventType), gte(securityEventsTable.createdAt, runStart)))
    .orderBy(desc(securityEventsTable.createdAt))
    .limit(25);
  const hit = rows.find((r) => {
    if (match?.actorEmail && r.actorEmail !== match.actorEmail) return false;
    if (match?.targetEmail && r.targetEmail !== match.targetEmail) return false;
    return true;
  });
  return (hit as Record<string, unknown>) ?? null;
}

async function findLotEvent(eventType: string): Promise<Record<string, unknown> | null> {
  const [row] = await db
    .select()
    .from(cellLotEventsTable)
    .where(and(eq(cellLotEventsTable.lotId, certLotId), eq(cellLotEventsTable.eventType, eventType)))
    .orderBy(desc(cellLotEventsTable.performedAt))
    .limit(1);
  return (row as Record<string, unknown>) ?? null;
}

// ─── Triggers — perform the real operations that must be audited ─────────────
async function runTriggers(directorJar: CookieJar): Promise<{ viewerLoginRowId: string | null }> {
  // user.created — director registers a uniquely-named viewer (always 201).
  const reg = await fetchResilient(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: directorJar ?? "" },
    body: JSON.stringify({ name: "SS03 Viewer", email: VIEWER_EMAIL, password: TEMP_PASSWORD, role: "viewer" }),
  });
  if (reg.status !== 201) throw new Error(`Could not provision cert viewer: HTTP ${reg.status}`);
  await reg.text().catch(() => undefined);

  // auth.login.failed — wrong password for the viewer.
  await login(VIEWER_EMAIL, "wrong-password");

  // auth.login.success — viewer logs in (also gives us a viewer jar).
  const viewerLogin = await login(VIEWER_EMAIL, TEMP_PASSWORD);
  if (!viewerLogin.jar) throw new Error("Viewer login failed — cannot exercise audit triggers");

  // authz.denied — viewer attempts a write it is not allowed to perform (403).
  await fetchResilient(`${BASE_URL}/api/cells/lots`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: viewerLogin.jar },
    body: JSON.stringify({}),
  }).then((r) => r.text().catch(() => undefined));

  // auth.logout — log the viewer out (do this AFTER authz.denied which needs the jar).
  await fetchResilient(`${BASE_URL}/api/auth/logout`, {
    method: "POST",
    headers: { Cookie: viewerLogin.jar },
  }).then((r) => r.text().catch(() => undefined));

  // Capture the viewer's login.success row id now for the immutability re-read.
  const loginRow = await findSecurityEvent("auth.login.success", { actorEmail: VIEWER_EMAIL });
  const viewerLoginRowId = (loginRow?.id as string) ?? null;

  // ── Domain events on a throwaway cert lot (director acts) ──
  // lot_received — create the lot (2 cells so we can drive grading_started + fully_graded).
  const lotRes = await fetchResilient(`${BASE_URL}/api/cells/lots`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: directorJar ?? "" },
    body: JSON.stringify({
      supplier: "SS03 CERT SUPPLIER",
      manufacturer: "SS03 CERT",
      cellModel: "SS03-CELL",
      cellChemistry: "LiFePO4",
      nominalCapacityAh: 280,
      lotNumber: CERT_LOT_NUMBER,
      dateReceived: "2026-06-28",
      quantityReceived: 2,
      receivedBy: DIRECTOR_EMAIL,
    }),
  });
  if (lotRes.status !== 201) throw new Error(`Cert lot creation failed: HTTP ${lotRes.status}`);
  const lot = (await lotRes.json()) as { id: string };
  certLotId = lot.id;

  // lot_updated — edit a non-remarks field (remarks-only edits emit remarks_updated).
  await fetchResilient(`${BASE_URL}/api/cells/lots/${certLotId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: directorJar ?? "" },
    body: JSON.stringify({ manufacturer: "SS03 CERT (edited)", reason: "SS-03 audit verification" }),
  }).then((r) => r.text().catch(() => undefined));

  // Fetch the two cell ids for grading.
  const cells = await db
    .select({ id: cellsTable.id, cellId: cellsTable.cellId })
    .from(cellsTable)
    .where(eq(cellsTable.lotId, certLotId))
    .orderBy(cellsTable.cellId);
  if (cells.length !== 2) throw new Error(`Expected 2 cert cells, found ${cells.length}`);

  // cell_graded + grading_started — grade cell #1 (received → grading).
  // cell_graded + lot_fully_graded — grade cell #2 (grading → graded).
  for (const c of cells) {
    const g = await fetchResilient(`${BASE_URL}/api/cells/${c.id}/grade`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: directorJar ?? "" },
      body: JSON.stringify({
        voltageV: 3.2,
        capacityAh: 280,
        internalResistanceMohm: 1.0,
        gradedBy: DIRECTOR_EMAIL,
      }),
    });
    if (g.status !== 200) throw new Error(`Grading cell ${c.cellId} failed: HTTP ${g.status}`);
    await g.text().catch(() => undefined);
  }

  // cell_grade_corrected — director corrects the first (now approved) cell with a
  // mandatory reason. Exercises the DEF-CW02-006 controlled correction workflow.
  const corr = await fetchResilient(`${BASE_URL}/api/cells/${cells[0].id}/correct`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: directorJar ?? "" },
    body: JSON.stringify({
      voltageV: 3.2,
      capacityAh: 270,
      internalResistanceMohm: 1.1,
      correctedBy: DIRECTOR_EMAIL,
      correctionReason: "SS-03 audit verification — corrected measurement",
    }),
  });
  if (corr.status !== 200) throw new Error(`Correcting cell ${cells[0].cellId} failed: HTTP ${corr.status}`);
  await corr.text().catch(() => undefined);

  // ratelimit.exceeded — opt-in burst against the auth limiter (20 / 15min).
  if (EXERCISE_RATELIMIT) {
    for (let i = 0; i < 25; i++) {
      const r = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: VIEWER_EMAIL, password: "burst" }),
      });
      await r.text().catch(() => undefined);
      if (r.status === 429) break;
    }
  }

  return { viewerLoginRowId };
}

// ─── Immutability: no application route may UPDATE/DELETE an audit table ──────
// Two detection paths: (a) Drizzle query-builder mutations (`.update(table)` /
// `.delete(table)`), (b) raw SQL touching the physical table names (UPDATE /
// DELETE FROM / TRUNCATE / INSERT … ON CONFLICT … DO UPDATE). Pattern-based static
// analysis can never be exhaustive, so it is paired with the runtime byte-identical
// re-read below — together they make a silent mutation regression very hard to miss.
function staticImmutabilityViolations(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const srcRoot = join(here, ".."); // artifacts/api-server/src
  const violations: string[] = [];
  // The ECF ledger (engineering_corrections) is append-only forever, so it is
  // protected by the same no-UPDATE/DELETE static + runtime guards as the two
  // audit stores. The cert dir (this suite's own teardown) is excluded above.
  const drizzleTables = ["securityEventsTable", "cellLotEventsTable", "engineeringCorrectionsTable"];
  const physicalTables = ["security_events", "cell_lot_events", "engineering_corrections"];
  const drizzleRe = new RegExp(`\\.(update|delete)\\(\\s*(${drizzleTables.join("|")})\\b`);
  const rawRe = new RegExp(
    `\\b(update|delete\\s+from|truncate(?:\\s+table)?|insert\\s+into)\\b[\\s\\S]{0,80}?\\b(${physicalTables.join("|")})\\b`,
    "i",
  );

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "cert") continue; // the suite's own teardown is allowed
        walk(full);
        continue;
      }
      if (!full.endsWith(".ts")) continue;
      const src = readFileSync(full, "utf8");
      src.split("\n").forEach((line, i) => {
        if (drizzleRe.test(line) || rawRe.test(line))
          violations.push(`${full.replace(srcRoot, "src")}:${i + 1} → ${line.trim()}`);
      });
    }
  };
  walk(srcRoot);
  return violations;
}

// ─── Rate-limit logging wiring (static) ──────────────────────────────────────
// In default shape-mode the ratelimit.exceeded check reads a historical row, which
// cannot prove the CURRENT 429 handler still records the event. This asserts the
// recording call is still present in app.ts so a removed-logging regression fails
// certification even when the live 429 burst is not exercised.
function ratelimitWiringPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const appFile = join(here, "..", "app.ts");
  try {
    const src = readFileSync(appFile, "utf8");
    return /eventType:\s*["']ratelimit\.exceeded["']/.test(src);
  } catch {
    return false;
  }
}

async function deepEqualPersisted(
  store: AuditStore,
  id: string,
  snapshot: string,
): Promise<boolean> {
  const table = store === "security" ? securityEventsTable : cellLotEventsTable;
  const [row] = await db.select().from(table).where(eq(table.id, id)).limit(1);
  if (!row) return false;
  return JSON.stringify(row) === snapshot;
}

// ─── Cleanup — remove the throwaway fixture (cells → events → lot → user) ─────
async function cleanup(): Promise<void> {
  if (certLotId) {
    // Remove the ECF ledger rows for the cert lot's cells (entityId = cell id).
    const certCells = await db
      .select({ id: cellsTable.id })
      .from(cellsTable)
      .where(eq(cellsTable.lotId, certLotId))
      .catch(() => [] as { id: string }[]);
    if (certCells.length > 0) {
      await db
        .delete(engineeringCorrectionsTable)
        .where(
          and(
            eq(engineeringCorrectionsTable.entityType, "CELL"),
            inArray(engineeringCorrectionsTable.entityId, certCells.map((c) => c.id)),
          ),
        )
        .catch(() => undefined);
    }
    await db.delete(cellsTable).where(eq(cellsTable.lotId, certLotId)).catch(() => undefined);
    await db.delete(cellLotEventsTable).where(eq(cellLotEventsTable.lotId, certLotId)).catch(() => undefined);
    await db.delete(cellLotsTable).where(eq(cellLotsTable.id, certLotId)).catch(() => undefined);
  }
  await db.delete(usersTable).where(inArray(usersTable.email, [VIEWER_EMAIL])).catch(() => undefined);
}

interface CheckResult {
  check: AuditCheck;
  ok: boolean;
  status: string;
  missing: string[];
}

function expectedEventType(check: AuditCheck): string {
  if (FORCE_FAIL && check.id === FORCE_FAIL) return "__never_emitted__";
  return check.expectedEventType;
}

async function main(): Promise<void> {
  console.log("─".repeat(72));
  console.log("SS-03 Audit Trail Verification Suite");
  console.log(`Target: ${BASE_URL}`);
  console.log(
    `Matrix: ${AUDIT_MATRIX.length} audited operations across security_events + cell_lot_events`,
  );
  if (!EXERCISE_RATELIMIT) console.log("ratelimit.exceeded: shape-mode (set CERT_AUDIT_RATELIMIT=1 to re-trigger)");
  if (FORCE_FAIL) console.log(`⚠ CERT_FORCE_FAIL active for check: ${FORCE_FAIL}`);
  console.log("─".repeat(72));

  const results: CheckResult[] = [];
  let immutabilityOk = true;
  const immutabilityNotes: string[] = [];

  try {
    const { jar: directorJar, status } = await login(DIRECTOR_EMAIL, DIRECTOR_PASSWORD);
    if (!directorJar) throw new Error(`Director login failed: HTTP ${status}`);

    const { viewerLoginRowId } = await runTriggers(directorJar);

    // Snapshot two real records for the runtime immutability re-read.
    const lotReceivedRow = await findLotEvent("lot_received");
    const lotSnapshotId = (lotReceivedRow?.id as string) ?? null;
    const lotSnapshot = lotReceivedRow ? JSON.stringify(lotReceivedRow) : null;
    let loginSnapshot: string | null = null;
    if (viewerLoginRowId) {
      const [r] = await db
        .select()
        .from(securityEventsTable)
        .where(eq(securityEventsTable.id, viewerLoginRowId))
        .limit(1);
      loginSnapshot = r ? JSON.stringify(r) : null;
    }

    // Snapshot a real ECF ledger record (the cert correction appended one) to
    // prove the append-only ledger is byte-identical after the run.
    let ledgerSnapshotId: string | null = null;
    let ledgerSnapshot: string | null = null;
    if (certLotId) {
      const certCellIds = await db
        .select({ id: cellsTable.id })
        .from(cellsTable)
        .where(eq(cellsTable.lotId, certLotId));
      if (certCellIds.length > 0) {
        const [ledgerRow] = await db
          .select()
          .from(engineeringCorrectionsTable)
          .where(
            and(
              eq(engineeringCorrectionsTable.entityType, "CELL"),
              inArray(engineeringCorrectionsTable.entityId, certCellIds.map((c) => c.id)),
            ),
          )
          .orderBy(desc(engineeringCorrectionsTable.createdAt))
          .limit(1);
        ledgerSnapshotId = (ledgerRow?.id as string) ?? null;
        ledgerSnapshot = ledgerRow ? JSON.stringify(ledgerRow) : null;
      }
    }

    // Verify each matrix check.
    for (const check of AUDIT_MATRIX) {
      const evType = expectedEventType(check);
      let row: Record<string, unknown> | null = null;

      if (check.store === "cell_lot") {
        row = await findLotEvent(evType);
      } else if (check.id === "ratelimit.exceeded" && !EXERCISE_RATELIMIT) {
        // Shape-mode: verify the most recent existing record's field integrity.
        const [latest] = await db
          .select()
          .from(securityEventsTable)
          .where(eq(securityEventsTable.eventType, evType))
          .orderBy(desc(securityEventsTable.createdAt))
          .limit(1);
        row = (latest as Record<string, unknown>) ?? null;
      } else {
        const match =
          check.id === "auth.login.failed" || check.id === "user.created"
            ? { targetEmail: VIEWER_EMAIL }
            : check.id === "ratelimit.exceeded"
              ? undefined
              : { actorEmail: VIEWER_EMAIL };
        row = await findSecurityEvent(evType, match);
      }

      const missing: string[] = [];
      let statusText: string;

      if (!row) {
        missing.push("event not recorded");
        statusText = "no event";
      } else {
        const fields = extract(check.store, row);
        (["actor", "timestamp", "entityId", "details"] as const).forEach((f) => {
          if (check.requires[f] && !present(fields[f])) missing.push(f);
        });
        // Semantic correctness — beyond presence, the record must carry the right
        // actor / entity / content. A mis-attributed or malformed row fails cert.
        const semantic = SEMANTIC[check.id];
        if (semantic) missing.push(...semantic(row));
        // Default-mode ratelimit relies on a historical row, so it can't prove the
        // CURRENT 429 path still logs — guard that gap with a static wiring assertion.
        if (check.id === "ratelimit.exceeded" && !EXERCISE_RATELIMIT && !ratelimitWiringPresent()) {
          missing.push("ratelimit.exceeded logging not wired in app.ts");
        }
        statusText =
          check.id === "ratelimit.exceeded" && !EXERCISE_RATELIMIT ? "shape" : "recorded";
      }

      results.push({ check, ok: missing.length === 0, status: statusText, missing });
    }

    // ── Immutability: static scan + runtime re-read ──
    const staticViolations = staticImmutabilityViolations();
    if (staticViolations.length > 0) {
      immutabilityOk = false;
      immutabilityNotes.push(`static: application route mutates an audit table:`);
      staticViolations.forEach((v) => immutabilityNotes.push(`    ${v}`));
    } else {
      immutabilityNotes.push("static: no UPDATE/DELETE of audit tables in application routes ✓");
    }

    if (lotSnapshotId && lotSnapshot) {
      const same = await deepEqualPersisted("cell_lot", lotSnapshotId, lotSnapshot);
      if (!same) {
        immutabilityOk = false;
        immutabilityNotes.push("runtime: cell_lot_events row changed during run ✗");
      } else {
        immutabilityNotes.push("runtime: cell_lot_events record byte-identical after run ✓");
      }
    } else {
      immutabilityOk = false;
      immutabilityNotes.push("runtime: could not capture a cell_lot_events record to re-read ✗");
    }

    if (viewerLoginRowId && loginSnapshot) {
      const same = await deepEqualPersisted("security", viewerLoginRowId, loginSnapshot);
      if (!same) {
        immutabilityOk = false;
        immutabilityNotes.push("runtime: security_events row changed during run ✗");
      } else {
        immutabilityNotes.push("runtime: security_events record byte-identical after run ✓");
      }
    }

    if (ledgerSnapshotId && ledgerSnapshot) {
      const [row] = await db
        .select()
        .from(engineeringCorrectionsTable)
        .where(eq(engineeringCorrectionsTable.id, ledgerSnapshotId))
        .limit(1);
      const same = row ? JSON.stringify(row) === ledgerSnapshot : false;
      if (!same) {
        immutabilityOk = false;
        immutabilityNotes.push("runtime: engineering_corrections row changed during run ✗");
      } else {
        immutabilityNotes.push("runtime: engineering_corrections record byte-identical after run ✓");
      }
    } else {
      immutabilityOk = false;
      immutabilityNotes.push("runtime: could not capture an engineering_corrections record to re-read ✗");
    }

    // ── Report ──
    for (const r of results) {
      const reqd = (["actor", "timestamp", "entityId", "details"] as const)
        .filter((f) => r.check.requires[f])
        .map((f) => f[0].toUpperCase())
        .join("");
      const mark = r.ok ? "PASS" : "FAIL";
      const detail = r.ok ? r.status : `MISSING ${r.missing.join(",")}`;
      console.log(
        `[${mark}] ${r.check.store.padEnd(9)} ${r.check.expectedEventType.padEnd(22)} fields:${reqd.padEnd(4)} ${detail}`,
      );
    }
    console.log("─".repeat(72));
    console.log("Immutability:");
    immutabilityNotes.forEach((n) => console.log(`  ${n}`));
    console.log("─".repeat(72));

    const failures = results.filter((r) => !r.ok);
    if (failures.length > 0 || !immutabilityOk) {
      console.log(
        `✗ SS-03 FAILED — ${failures.length} audit mismatch(es)${immutabilityOk ? "" : " + immutability violation"}.`,
      );
      process.exitCode = 1;
    } else {
      console.log(
        `✓ SS-03 PASSED — all ${results.length} audited operations recorded correctly; audit history immutable.`,
      );
      process.exitCode = 0;
    }
    console.log("─".repeat(72));
  } finally {
    await cleanup().catch((err) => console.error("⚠ Cleanup failed:", err));
    const anyDb = db as unknown as { $client?: { end?: () => Promise<void> } };
    await anyDb.$client?.end?.().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error("SS-03 suite crashed:", err);
  process.exitCode = 1;
});
