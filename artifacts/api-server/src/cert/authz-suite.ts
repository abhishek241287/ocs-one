// ─── SS-02 — Automated authorization regression suite ─────────────────────────
// Permanent RBAC certification test. For EVERY protected endpoint in the
// authorization matrix (lib/authz-matrix.ts), this suite logs in as each of the
// seven principals (owner / director / supervisor / operator / viewer / dealer /
// anonymous), issues
// the real request against the live server, and asserts the observed outcome
// matches the documented expectation:
//   - "pass"         → status is NOT 401 and NOT 403 (the guard let the request
//                       through; the handler may still 400/404/409 on the dummy
//                       body, which is fine — we are testing the GATE, not the
//                       handler, and never create real rows).
//   - "forbidden"    → status 403
//   - "unauthorized" → status 401
//
// Any mismatch fails certification (process exits non-zero). The suite creates its
// own temporary director/supervisor/operator/viewer/dealer accounts via the
// owner-seeded register endpoint and deletes them on exit, so it leaves no residue.
//
// Run:  pnpm --filter @workspace/api-server run test:authz
// Env:  CERT_BASE_URL (default http://localhost:80)
//       CERT_DIRECTOR_EMAIL / CERT_DIRECTOR_PASSWORD (default admin seed)
//       CERT_FORCE_FAIL=<endpointId> — flips one expectation to prove the suite
//                                       actually fails on a mismatch (sanity).

import { db, logisticsDealersTable, usersTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import {
  AUTHZ_MATRIX,
  DUMMY_ID,
  PRINCIPALS,
  type AuthzEndpoint,
  type AuthzOutcome,
  type Principal,
} from "../lib/authz-matrix";

const BASE_URL = (process.env.CERT_BASE_URL ?? "http://localhost:80").replace(/\/$/, "");
// The seed admin is the platform Owner (promoted at startup). CERT_OWNER_* is
// preferred; CERT_DIRECTOR_* is still honoured for backward compatibility.
const OWNER_EMAIL = process.env.CERT_OWNER_EMAIL ?? process.env.CERT_DIRECTOR_EMAIL ?? "admin@ocs.local";
const OWNER_PASSWORD = process.env.CERT_OWNER_PASSWORD ?? process.env.CERT_DIRECTOR_PASSWORD ?? "OCS@Admin2026!";
const FORCE_FAIL = process.env.CERT_FORCE_FAIL ?? null;

// Temporary principals created for the run. Owner re-uses the seed admin; the rest —
// including a real director and an external dealer — are provisioned by the owner via
// the register endpoint and torn down on exit.
const TEMP_PASSWORD = "SS02!Cert#Temp2026";
const TEMP_DEALER_CODE = "SS02-CERT-DEALER";
const TEMP_USERS: { role: Exclude<Principal, "owner" | "anonymous">; email: string; name: string }[] = [
  { role: "director", email: "ss02.director@cert.local", name: "SS02 Director" },
  { role: "supervisor", email: "ss02.supervisor@cert.local", name: "SS02 Supervisor" },
  { role: "operator", email: "ss02.operator@cert.local", name: "SS02 Operator" },
  { role: "viewer", email: "ss02.viewer@cert.local", name: "SS02 Viewer" },
  { role: "dealer", email: "ss02.dealer@cert.local", name: "SS02 Dealer" },
];

type CookieJar = string | null; // the ocs_token cookie value, or null for anon

function cookieFromSetCookie(setCookie: string | null): CookieJar {
  if (!setCookie) return null;
  const match = setCookie.match(/ocs_token=([^;]+)/);
  return match ? `ocs_token=${match[1]}` : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch that is resilient to the global rate limiter. A 429 is NEVER a valid
 * authorization outcome — misclassifying it as "pass" would silently corrupt the
 * cert result — so on 429 we honour RateLimit-Reset (capped) and retry. If it
 * persists, we throw so the run errors loudly instead of lying.
 */
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

async function login(email: string, password: string): Promise<CookieJar> {
  const res = await fetchResilient(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`Login failed for ${email}: HTTP ${res.status}`);
  }
  const jar = cookieFromSetCookie(res.headers.get("set-cookie"));
  if (!jar) throw new Error(`No session cookie returned for ${email}`);
  return jar;
}

async function ensureTempDealer(): Promise<string> {
  const existing = await db
    .select({ id: logisticsDealersTable.id })
    .from(logisticsDealersTable)
    .where(eq(logisticsDealersTable.dealerCode, TEMP_DEALER_CODE))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const [created] = await db
    .insert(logisticsDealersTable)
    .values({
      dealerCode: TEMP_DEALER_CODE,
      dealerName: "SS-02 Certification Dealer",
      status: "active",
    })
    .returning({ id: logisticsDealersTable.id });
  if (!created) throw new Error("Failed to provision SS-02 dealer fixture");
  return created.id;
}

async function ensureTempUsers(ownerJar: CookieJar, dealerId: string): Promise<void> {
  for (const u of TEMP_USERS) {
    const res = await fetchResilient(`${BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerJar ?? "" },
      body: JSON.stringify({
        name: u.name,
        email: u.email,
        password: TEMP_PASSWORD,
        role: u.role,
      }),
    });
    // 201 created OR 409 already-exists (from a prior aborted run) are both fine.
    if (res.status !== 201 && res.status !== 409) {
      throw new Error(`Failed to provision ${u.role} (${u.email}): HTTP ${res.status}`);
    }
  }

  // Registration intentionally does not accept dealerId. Link the temporary
  // dealer principal after registration so the login token contains its own
  // dealership and the portal rows can certify the real isolation path.
  await db
    .update(usersTable)
    .set({ dealerId })
    .where(eq(usersTable.email, "ss02.dealer@cert.local"));
}

async function cleanupTempUsers(): Promise<void> {
  const emails = TEMP_USERS.map((u) => u.email);
  await db.delete(usersTable).where(inArray(usersTable.email, emails));
  await db
    .delete(logisticsDealersTable)
    .where(eq(logisticsDealersTable.dealerCode, TEMP_DEALER_CODE));
}

function classify(status: number): AuthzOutcome {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  return "pass";
}

async function callEndpoint(
  endpoint: AuthzEndpoint,
  jar: CookieJar,
  dealerId: string | null,
): Promise<number> {
  const headers: Record<string, string> = {};
  if (jar) headers.Cookie = jar;
  let body: string | undefined;
  if (endpoint.method !== "GET") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(endpoint.body ?? {});
  }
  const path =
    endpoint.dealerOwnPath && dealerId
      ? endpoint.path.replace(DUMMY_ID, dealerId)
      : endpoint.path;
  const res = await fetchResilient(`${BASE_URL}${path}`, {
    method: endpoint.method,
    headers,
    body,
  });
  // Drain body so the socket can be reused.
  await res.text().catch(() => undefined);
  return res.status;
}

interface Result {
  endpointId: string;
  method: string;
  path: string;
  principal: Principal;
  expected: AuthzOutcome;
  actual: AuthzOutcome;
  status: number;
  ok: boolean;
}

function expectedFor(endpoint: AuthzEndpoint, principal: Principal): AuthzOutcome {
  const base = endpoint.expected[principal];
  // Sanity-check hook: deliberately corrupt ONE expectation to prove the suite
  // detects mismatches (used by the intentional-fail acceptance check).
  if (FORCE_FAIL && endpoint.id === FORCE_FAIL && principal === "anonymous") {
    return base === "pass" ? "forbidden" : "pass";
  }
  return base;
}

async function main(): Promise<void> {
  console.log("─".repeat(72));
  console.log("SS-02 Authorization Suite");
  console.log(`Target: ${BASE_URL}`);
  console.log(
    `Matrix: ${AUTHZ_MATRIX.length} endpoints × ${PRINCIPALS.length} principals = ${AUTHZ_MATRIX.length * PRINCIPALS.length} assertions`,
  );
  if (FORCE_FAIL) console.log(`⚠ CERT_FORCE_FAIL active for endpoint: ${FORCE_FAIL}`);
  console.log("─".repeat(72));

  const jars: Record<Principal, CookieJar> = {
    owner: null,
    director: null,
    supervisor: null,
    operator: null,
    viewer: null,
    dealer: null,
    anonymous: null,
  };

  try {
    jars.owner = await login(OWNER_EMAIL, OWNER_PASSWORD);
    const dealerId = await ensureTempDealer();
    await ensureTempUsers(jars.owner, dealerId);
    jars.director = await login("ss02.director@cert.local", TEMP_PASSWORD);
    jars.supervisor = await login("ss02.supervisor@cert.local", TEMP_PASSWORD);
    jars.operator = await login("ss02.operator@cert.local", TEMP_PASSWORD);
    jars.viewer = await login("ss02.viewer@cert.local", TEMP_PASSWORD);
    jars.dealer = await login("ss02.dealer@cert.local", TEMP_PASSWORD);

    const results: Result[] = [];
    for (const endpoint of AUTHZ_MATRIX) {
      for (const principal of PRINCIPALS) {
        const status = await callEndpoint(endpoint, jars[principal], dealerId);
        const actual = classify(status);
        const expected = expectedFor(endpoint, principal);
        results.push({
          endpointId: endpoint.id,
          method: endpoint.method,
          path: endpoint.path,
          principal,
          expected,
          actual,
          status,
          ok: actual === expected,
        });
      }
    }

    const failures = results.filter((r) => !r.ok);

    // Per-endpoint compact report.
    for (const endpoint of AUTHZ_MATRIX) {
      const row = PRINCIPALS.map((p) => {
        const r = results.find((x) => x.endpointId === endpoint.id && x.principal === p)!;
        const mark = r.ok ? "✓" : "✗";
        return `${p[0].toUpperCase()}:${mark}${r.status}`;
      }).join("  ");
      const status = PRINCIPALS.every(
        (p) => results.find((x) => x.endpointId === endpoint.id && x.principal === p)!.ok,
      )
        ? "PASS"
        : "FAIL";
      console.log(
        `[${status}] ${endpoint.method.padEnd(6)} ${endpoint.id.padEnd(38)} ${row}`,
      );
    }

    console.log("─".repeat(72));
    if (failures.length > 0) {
      console.log(`✗ SS-02 FAILED — ${failures.length} mismatch(es):`);
      for (const f of failures) {
        console.log(
          `   ${f.method} ${f.path} [${f.principal}] expected ${f.expected}, got ${f.actual} (HTTP ${f.status})`,
        );
      }
    } else {
      console.log(
        `✓ SS-02 PASSED — all ${results.length} authorization assertions hold.`,
      );
    }
    console.log("─".repeat(72));

    process.exitCode = failures.length > 0 ? 1 : 0;
  } finally {
    await cleanupTempUsers().catch((err) => {
      console.error("⚠ Cleanup of temp users failed:", err);
    });
    // Close the DB pool so the process can exit cleanly.
    const anyDb = db as unknown as { $client?: { end?: () => Promise<void> } };
    await anyDb.$client?.end?.().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error("SS-02 suite crashed:", err);
  process.exitCode = 1;
});
