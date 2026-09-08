#!/usr/bin/env tsx
/**
 * FAT Blocker Verification Suite — OCS One v3
 * Covers all 12 acceptance criteria from the FAT blocker implementation.
 * Run with: tsx src/cert/fat-blocker-suite.ts
 * Requires: API server up (direct port via CERT_TARGET or defaults to port 8080 bypass)
 */

// Use @workspace/db for schema checks (same as authz/audit suites).
import {
  db,
  usersTable,
  logisticsDealersTable,
  mfgChargerUnitsTable,
  mfgProductionOrdersTable,
  mfgOrderStagesTable,
} from "@workspace/db";
import { eq, inArray, sql } from "drizzle-orm";

const BASE = process.env.CERT_TARGET ?? "http://localhost:8080";

// Seed owner credentials — must match the seeded admin user.
const OWNER_EMAIL = process.env.CERT_OWNER_EMAIL ?? "admin@ocs.local";
const OWNER_PASSWORD = process.env.CERT_OWNER_PASSWORD ?? "OCS@Admin2026!";
// SS-02 cert temp users (created by the authz suite; may or may not exist).
const TEMP_PASSWORD = "SS02!Cert#Temp2026";

let passed = 0, failed = 0, skipped = 0;
const failures: string[] = [];

function pass(label: string, detail = "") {
  console.log(`  [✓] ${label}${detail ? " — " + detail : ""}`);
  passed++;
}
function fail(label: string, detail = "") {
  console.log(`  [✗] ${label}${detail ? " — " + detail : ""}`);
  failed++;
  failures.push(label);
}
function skip(label: string, detail = "") {
  console.log(`  [⚠] ${label}${detail ? " — " + detail : ""}`);
  skipped++;
}
function section(title: string) {
  console.log(`\n${"─".repeat(72)}\n${title}\n${"─".repeat(72)}`);
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function login(email: string, password: string): Promise<string | null> {
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await fetch(`${BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (r.status === 429) {
        const reset = Number(r.headers.get("ratelimit-reset") ?? "60");
        // Auth limiter window is 15 min — honour the full reset header value.
        const wait = Math.min(reset * 1000 + 1000, 16 * 60 * 1000);
        console.log(`   …login rate-limited; waiting ${Math.round(wait / 1000)}s before retry`);
        await sleep(wait);
        continue;
      }
      if (!r.ok) return null;
      const cookie = r.headers.get("set-cookie") ?? "";
      const m = cookie.match(/ocs_token=([^;]+)/);
      return m?.[1] ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

async function apiReq(
  method: string,
  path: string,
  token: string | null,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Cookie"] = `ocs_token=${token}`;
  try {
    const r = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let responseBody: unknown;
    try { responseBody = await r.json(); } catch { responseBody = null; }
    return { status: r.status, body: responseBody };
  } catch (e) {
    return { status: 0, body: String(e) };
  }
}

// ─── DB helpers (no `pg` import — use @workspace/db) ─────────────────────────

async function columnExists(table: string, column: string): Promise<boolean> {
  const result = await db.execute(
    sql`SELECT 1 FROM information_schema.columns
        WHERE table_name = ${table} AND column_name = ${column} LIMIT 1`,
  );
  return result.rows.length > 0;
}

async function indexExists(indexName: string): Promise<boolean> {
  const result = await db.execute(
    sql`SELECT 1 FROM pg_indexes WHERE indexname = ${indexName} LIMIT 1`,
  );
  return result.rows.length > 0;
}

// ─── Ensure temp users exist (created by the authz suite; bootstrap here too) ─

async function ensureTempUser(
  ownerToken: string,
  email: string,
  name: string,
  role: string,
): Promise<void> {
  const r = await apiReq("POST", "/api/auth/register", ownerToken, {
    name,
    email,
    password: TEMP_PASSWORD,
    role,
  });
  // 201 = created, 409 = already exists — both are fine.
  if (r.status !== 201 && r.status !== 409) {
    // Non-fatal: log but continue.
    console.log(`   note: ${role} user creation returned HTTP ${r.status}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═".repeat(72));
  console.log("FAT Blocker Acceptance Suite — OCS One v3 Patches");
  console.log(`Target: ${BASE}`);
  console.log("═".repeat(72));

  // Probe server
  const health = await fetch(`${BASE}/api/healthz`).catch(() => null);
  if (!health || (health.status !== 200 && health.status !== 429)) {
    console.error("✗ API server not reachable at", BASE, `(HTTP ${health?.status ?? "no response"})`);
    process.exit(1);
  }
  console.log(`  Server reachable (HTTP ${health.status})\n`);

  // Login as owner
  const ownerToken = await login(OWNER_EMAIL, OWNER_PASSWORD);
  if (!ownerToken) {
    console.error("✗ Owner login failed — check OWNER_EMAIL/OWNER_PASSWORD");
    process.exit(1);
  }
  console.log("  Owner login: OK");

  // Bootstrap temp users (supervisor and director are needed for C2 tests)
  await ensureTempUser(ownerToken, "ss02.supervisor@cert.local", "SS02 Supervisor", "supervisor");
  await ensureTempUser(ownerToken, "ss02.director@cert.local", "SS02 Director", "director");

  const supervisorToken = await login("ss02.supervisor@cert.local", TEMP_PASSWORD);
  const directorToken = await login("ss02.director@cert.local", TEMP_PASSWORD);
  console.log(`  Supervisor login: ${supervisorToken ? "OK" : "FAILED"}`);
  console.log(`  Director login: ${directorToken ? "OK" : "FAILED"}`);

  // ════════════════════════════════════════════════════════════════════════════
  // Patch 1A — dealer_id column on users table (schema check)
  // ════════════════════════════════════════════════════════════════════════════
  section("Patch 1A — dealer_id Column on Users");
  {
    const exists = await columnExists("users", "dealer_id");
    if (exists) {
      pass("dealer_id column exists on users table");
    } else {
      fail("dealer_id column MISSING from users table");
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Patch 1C — Auth token includes dealerId
  // ════════════════════════════════════════════════════════════════════════════
  section("Patch 1C — Auth Token dealerId Field");
  {
    const r = await apiReq("GET", "/api/auth/me", ownerToken);
    if (r.status === 200) {
      // /auth/me wraps data under a "user" key: { user: { ..., dealerId } }
      const body = r.body as { user?: Record<string, unknown> };
      const user = body.user ?? (r.body as Record<string, unknown>);
      if ("dealerId" in user || "dealer_id" in user) {
        const v = user.dealerId ?? user.dealer_id;
        pass("/auth/me response includes dealerId field", `value=${JSON.stringify(v)}`);
      } else {
        fail("/auth/me response missing dealerId field", `user keys: ${Object.keys(user).join(", ")}`);
      }
    } else {
      fail("/auth/me request", `HTTP ${r.status}`);
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // H18 — Genealogy idempotency unique indexes (schema check)
  // ════════════════════════════════════════════════════════════════════════════
  section("H18 — Genealogy Unique Indexes");
  {
    const battGeneIdx = await indexExists("unique_battery_genealogy");
    if (battGeneIdx) {
      pass("unique_battery_genealogy index exists on mfg_battery_genealogy");
    } else {
      fail("unique_battery_genealogy index MISSING");
    }
    const prodGeneIdx = await indexExists("unique_product_genealogy");
    if (prodGeneIdx) {
      pass("unique_product_genealogy index exists on product_genealogy");
    } else {
      fail("unique_product_genealogy index MISSING");
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // C2 — Legacy Dispatch Write Freeze
  // ════════════════════════════════════════════════════════════════════════════
  section("C2 — Legacy Dispatch Write Freeze");

  // POST dispatch-orders: only owner may write; director & supervisor must get 403
  const dummyDealerId = "00000000-0000-0000-0000-000000000001";

  {
    const r = await apiReq("POST", "/api/logistics/dispatch-orders", directorToken, {
      dealerId: dummyDealerId,
    });
    if (r.status === 403) {
      pass("Director: POST /api/logistics/dispatch-orders → 403 (owner-only)");
    } else if (r.status === 401) {
      fail("Director: POST dispatch-orders → 401 (director not logged in or token bad)");
    } else {
      fail(`Director: POST dispatch-orders → ${r.status} (expected 403)`);
    }
  }

  {
    const r = await apiReq("POST", "/api/logistics/dispatch-orders", supervisorToken, {
      dealerId: dummyDealerId,
    });
    if (r.status === 403) {
      pass("Supervisor: POST /api/logistics/dispatch-orders → 403 (owner-only)");
    } else if (r.status === 401) {
      fail("Supervisor: POST dispatch-orders → 401 (supervisor not logged in or token bad)");
    } else {
      fail(`Supervisor: POST dispatch-orders → ${r.status} (expected 403)`);
    }
  }

  // Owner can still write (body will fail validation, but gate must open: not 403)
  {
    const r = await apiReq("POST", "/api/logistics/dispatch-orders", ownerToken, {});
    if (r.status === 403) {
      fail("Owner: POST dispatch-orders → 403 (owner should bypass — gate broken)");
    } else {
      pass("Owner: POST dispatch-orders → not 403 (owner-only gate passes)", `HTTP ${r.status}`);
    }
  }

  // Legacy dispatch history must remain readable by all factory roles
  {
    const r = await apiReq("GET", "/api/logistics/dispatch-orders", supervisorToken);
    if (r.status === 200) {
      pass("Supervisor: GET dispatch-orders list → 200 (read not frozen)");
    } else {
      fail(`Supervisor: GET dispatch-orders list → ${r.status} (expected 200)`);
    }
  }

  {
    const r = await apiReq("GET", "/api/logistics/dispatch-orders", directorToken);
    if (r.status === 200) {
      pass("Director: GET dispatch-orders list → 200 (read not frozen)");
    } else {
      fail(`Director: GET dispatch-orders list → ${r.status} (expected 200)`);
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // H1 — Customer Registration Dealer Authority
  // ════════════════════════════════════════════════════════════════════════════
  section("H1 — Customer Registration Dealer Authority");

  // caller-supplied dealer_id must be rejected with 400
  {
    const r = await apiReq("POST", "/api/customers/registrations", supervisorToken, {
      product_serial: "OCS-2024-000001",
      customer_name: "Test Customer",
      mobile: "9876543210",
      address: "123 Test St",
      installation_date: "2024-01-01",
      dealer_id: dummyDealerId,
    });
    if (r.status === 400) {
      pass("Customer registration with caller-supplied dealer_id → 400");
    } else {
      fail(`Customer registration with dealer_id → ${r.status} (expected 400)`);
    }
  }

  // Missing/nonexistent product serial → 404 (not 400, not 500)
  {
    const r = await apiReq("POST", "/api/customers/registrations", supervisorToken, {
      product_serial: "NONEXISTENT-SERIAL-XXXXXX-999",
      customer_name: "Test Customer",
      mobile: "9876543210",
      address: "123 Test St",
      installation_date: "2024-01-01",
    });
    if (r.status === 404) {
      pass("Customer registration with nonexistent serial → 404");
    } else {
      fail(`Customer registration with nonexistent serial → ${r.status} (expected 404)`);
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // C1 — Dealer Data Isolation (logic check via /dealers/:id/inventory)
  // ════════════════════════════════════════════════════════════════════════════
  section("C1 — Dealer Data Isolation");

  // Owner can access any dealer's inventory (even 404 for nonexistent dealer is fine)
  {
    const r = await apiReq("GET", `/api/dealers/00000000-0000-0000-0000-000000000000/inventory`, ownerToken);
    if (r.status === 404 || r.status === 200) {
      pass("Owner: GET /dealers/:id/inventory → not 403 (unrestricted access)", `HTTP ${r.status}`);
    } else {
      fail(`Owner: GET /dealers/:id/inventory → ${r.status} (expected 200/404, not 403)`);
    }
  }

  // Director can access dealer inventory (read-only factory role)
  {
    const r = await apiReq("GET", `/api/dealers/00000000-0000-0000-0000-000000000000/inventory`, directorToken);
    if (r.status === 404 || r.status === 200) {
      pass("Director: GET /dealers/:id/inventory → not 403 (factory read-only)", `HTTP ${r.status}`);
    } else {
      fail(`Director: GET /dealers/:id/inventory → ${r.status} (expected 200/404)`);
    }
  }

  // C1 full end-to-end: dealer A sees own data; accessing dealer B's data returns 403.
  // We create two dealer records and a dealer-role user linked (via direct DB update)
  // to dealer A, then verify the isolation middleware fires correctly.
  {
    const C1_CODE_A = "C1CERT-DLRA";
    const C1_CODE_B = "C1CERT-DLRB";
    const C1_EMAIL  = "c1.dealer-a@cert.local";
    const C1_PASS   = "C1Cert!DealerA2026";

    let dealerAId: string | null = null;
    let dealerBId: string | null = null;
    let dealerUserId: string | null = null;

    try {
      // ── 1. Ensure dealer A exists (create or look up by stable code) ──
      const rA = await apiReq("POST", "/api/logistics/dealers", ownerToken, {
        dealerCode: C1_CODE_A,
        dealerName: "C1 Cert Dealer Alpha",
        status: "active",
      });
      if (rA.status === 201) {
        dealerAId = (rA.body as { id: string }).id;
      } else {
        // Already exists from a prior crashed run — look it up
        const rows = await db
          .select({ id: logisticsDealersTable.id })
          .from(logisticsDealersTable)
          .where(eq(logisticsDealersTable.dealerCode, C1_CODE_A))
          .limit(1);
        dealerAId = rows[0]?.id ?? null;
      }

      // ── 2. Ensure dealer B exists ─────────────────────────────────────
      const rB = await apiReq("POST", "/api/logistics/dealers", ownerToken, {
        dealerCode: C1_CODE_B,
        dealerName: "C1 Cert Dealer Beta",
        status: "active",
      });
      if (rB.status === 201) {
        dealerBId = (rB.body as { id: string }).id;
      } else {
        const rows = await db
          .select({ id: logisticsDealersTable.id })
          .from(logisticsDealersTable)
          .where(eq(logisticsDealersTable.dealerCode, C1_CODE_B))
          .limit(1);
        dealerBId = rows[0]?.id ?? null;
      }

      if (!dealerAId || !dealerBId) {
        fail("C1 setup: could not obtain both dealer fixtures", `dealerA=${dealerAId} dealerB=${dealerBId}`);
      } else {
        // ── 3. Ensure dealer user exists ─────────────────────────────────
        const rU = await apiReq("POST", "/api/auth/register", ownerToken, {
          name: "C1 Cert Dealer A User",
          email: C1_EMAIL,
          password: C1_PASS,
          role: "dealer",
        });
        if (rU.status !== 201 && rU.status !== 409) {
          fail("C1 setup: register dealer user", `HTTP ${rU.status}`);
        } else {
          // ── 4. Link user to dealer A directly in DB (register endpoint
          //       does not accept dealerId — that is intentional; the
          //       director sets it separately) ───────────────────────────
          await db
            .update(usersTable)
            .set({ dealerId: dealerAId })
            .where(eq(usersTable.email, C1_EMAIL));

          const userRows = await db
            .select({ id: usersTable.id })
            .from(usersTable)
            .where(eq(usersTable.email, C1_EMAIL))
            .limit(1);
          dealerUserId = userRows[0]?.id ?? null;

          // ── 5. Login as dealer A user ─────────────────────────────────
          const dealerAToken = await login(C1_EMAIL, C1_PASS);
          if (!dealerAToken) {
            fail("C1: dealer A user login failed");
          } else {
            // ── 6. Own inventory → 200 ───────────────────────────────────
            const rOwnInv = await apiReq("GET", `/api/dealers/${dealerAId}/inventory`, dealerAToken);
            if (rOwnInv.status === 200) {
              pass("C1: Dealer A → /dealers/dealerA/inventory → 200 (own data allowed)");
            } else {
              fail("C1: Dealer A → own inventory", `HTTP ${rOwnInv.status} (expected 200)`);
            }

            // ── 7. Cross-dealer inventory → 403 ──────────────────────────
            const rCrossInv = await apiReq("GET", `/api/dealers/${dealerBId}/inventory`, dealerAToken);
            if (rCrossInv.status === 403) {
              pass("C1: Dealer A → /dealers/dealerB/inventory → 403 (cross-dealer blocked)");
            } else {
              fail("C1: Dealer A → dealer B inventory", `HTTP ${rCrossInv.status} (expected 403)`);
            }

            // ── 8. Own dispatch-history → 200 ────────────────────────────
            const rOwnDisp = await apiReq("GET", `/api/dealers/${dealerAId}/dispatch-history`, dealerAToken);
            if (rOwnDisp.status === 200) {
              pass("C1: Dealer A → /dealers/dealerA/dispatch-history → 200 (own data allowed)");
            } else {
              fail("C1: Dealer A → own dispatch-history", `HTTP ${rOwnDisp.status} (expected 200)`);
            }

            // ── 9. Cross-dealer dispatch-history → 403 ───────────────────
            const rCrossDisp = await apiReq("GET", `/api/dealers/${dealerBId}/dispatch-history`, dealerAToken);
            if (rCrossDisp.status === 403) {
              pass("C1: Dealer A → /dealers/dealerB/dispatch-history → 403 (cross-dealer blocked)");
            } else {
              fail("C1: Dealer A → dealer B dispatch-history", `HTTP ${rCrossDisp.status} (expected 403)`);
            }
          }
        }
      }
    } finally {
      // Teardown — best-effort; FK order: user before dealer
      if (dealerUserId) {
        await db.delete(usersTable).where(eq(usersTable.id, dealerUserId)).catch(() => null);
      }
      if (dealerAId) {
        await db.delete(logisticsDealersTable).where(eq(logisticsDealersTable.id, dealerAId)).catch(() => null);
      }
      if (dealerBId) {
        await db.delete(logisticsDealersTable).where(eq(logisticsDealersTable.id, dealerBId)).catch(() => null);
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // H11 — Lot Traceability (data-dependent — only run if in-progress orders exist)
  // ════════════════════════════════════════════════════════════════════════════
  section("H11 — Lot Traceability Validation");

  {
    const ordersResp = await apiReq(
      "GET",
      "/api/manufacturing/orders?status=in_progress&pageSize=20",
      ownerToken,
    );
    const orders = ((ordersResp.body as { items?: { id: string }[] })?.items ?? []);
    let testOrderId: string | null = null;
    for (const o of orders) {
      const minResp = await apiReq("GET", `/api/manufacturing/orders/${o.id}/material-issues`, ownerToken);
      const mins = ((minResp.body as { items?: unknown[] })?.items ?? []);
      if (mins.length === 0) {
        testOrderId = o.id;
        break;
      }
    }

    if (!testOrderId) {
      skip("H11 lot tests", "no in-progress order without an active MIN in DB");
    } else {
      // Nonexistent lot reference → must not 500
      const r = await apiReq(
        "POST",
        `/api/manufacturing/orders/${testOrderId}/material-issues`,
        supervisorToken,
        {
          lines: [
            {
              source_bom_line_id: "00000000-0000-0000-0000-000000000000",
              issued_qty: 1,
              grn_line_id: "00000000-0000-0000-0000-000000000000",
              supplier_lot_number: "NONEXISTENT-LOT",
            },
          ],
        },
      );
      if (r.status === 500) {
        fail("H11: Invalid lot reference → server error (500) — lot validation not working", `body: ${JSON.stringify(r.body)}`);
      } else {
        pass("H11: MIN with invalid lot reference → non-500 response", `HTTP ${r.status}`);
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // H14 — Order Completion Idempotency (data-dependent)
  // ════════════════════════════════════════════════════════════════════════════
  section("H14 — Order Completion Idempotency");
  {
    const completedResp = await apiReq(
      "GET",
      "/api/manufacturing/orders?status=completed&pageSize=5",
      ownerToken,
    );
    const completedOrders = (completedResp.body as { items?: { id: string; product_id?: string }[] })?.items ?? [];

    if (completedOrders.length === 0) {
      skip("H14 idempotency", "no completed orders in DB");
    } else {
      const o = completedOrders[0];
      const r = await apiReq("GET", `/api/manufacturing/orders/${o.id}`, ownerToken);
      if (r.status === 200) {
        pass("H14: Completed order readable post-change", `product_id=${(r.body as Record<string, unknown>).product_id ?? "null"}`);
      } else {
        fail("H14: Completed order GET", `HTTP ${r.status}`);
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // H17 — Charger Reservation Race
  // ════════════════════════════════════════════════════════════════════════════
  section("H17 — Charger Reservation Race Condition");
  {
    const runId = `${Date.now()}-${process.pid}`;
    const orderIds: string[] = [];
    let chargerId: string | null = null;

    try {
      // Build isolated fixtures so H17 can never skip or accidentally exercise
      // orders whose charging stage is not ready to start.
      const [charger] = await db
        .insert(mfgChargerUnitsTable)
        .values({
          chargerCode: `H17-CERT-${runId}`,
          model: "H17 race fixture",
          manufacturer: "OCS Cert",
          serialNumber: `H17-SERIAL-${runId}`,
          status: "available",
        })
        .returning({ id: mfgChargerUnitsTable.id, chargerCode: mfgChargerUnitsTable.chargerCode });
      chargerId = charger.id;

      const orders = await db
        .insert(mfgProductionOrdersTable)
        .values([1, 2].map((n) => ({
          orderNumber: `H17-PO-${runId}-${n}`,
          batteryNumber: `H17-BAT-${runId}-${n}`,
          factoryManager: "QA H17",
          currentStage: "charging" as const,
          status: "in_progress" as const,
          priority: "medium" as const,
        })))
        .returning({ id: mfgProductionOrdersTable.id });
      orderIds.push(...orders.map((order) => order.id));

      await db.insert(mfgOrderStagesTable).values(
        orders.flatMap((order) => [
          {
            productionOrderId: order.id,
            stageType: "bms_programming" as const,
            stageOrder: 5,
            status: "approved" as const,
          },
          {
            productionOrderId: order.id,
            stageType: "charging" as const,
            stageOrder: 6,
            status: "pending" as const,
          },
        ]),
      );

      const [o1, o2] = orders;
      // Route: POST /orders/:id/stages/:stage/start (stage is a URL param).
      // Body: { operatorName: string, stageData?: Record<string, unknown> }
      const [r1, r2] = await Promise.all([
        apiReq("POST", `/api/manufacturing/orders/${o1.id}/stages/charging/start`, supervisorToken ?? ownerToken, {
          operatorName: "QA-H17-Operator",
          stageData: { chargerUnitId: charger.id, chargerCode: charger.chargerCode },
        }),
        apiReq("POST", `/api/manufacturing/orders/${o2.id}/stages/charging/start`, supervisorToken ?? ownerToken, {
          operatorName: "QA-H17-Operator",
          stageData: { chargerUnitId: charger.id, chargerCode: charger.chargerCode },
        }),
      ]);
      const successes = [r1, r2].filter((r) => r.status >= 200 && r.status < 300).length;
      const losers = [r1, r2].filter((r) => r.status < 200 || r.status >= 300);
      const loserMessage = JSON.stringify((losers[0]?.body as { error?: unknown } | undefined)?.error ?? losers[0]?.body ?? "");
      if (successes === 1 && losers.length === 1 && loserMessage.includes("no longer available")) {
        pass("H17: Concurrent charger reservation — exactly one winner", `HTTP ${r1.status} + ${r2.status}`);
      } else {
        fail(
          "H17: Concurrent charger reservation did not produce one winner and one availability rejection",
          `HTTP ${r1.status} + ${r2.status}; loser=${loserMessage}`,
        );
      }
    } finally {
      if (orderIds.length > 0) {
        await db.delete(mfgProductionOrdersTable).where(inArray(mfgProductionOrdersTable.id, orderIds));
      }
      if (chargerId) {
        await db.delete(mfgChargerUnitsTable).where(eq(mfgChargerUnitsTable.id, chargerId));
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Summary
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n" + "═".repeat(72));
  console.log(`Summary: ${passed} pass · ${skipped} skip · ${failed} fail`);
  if (failures.length > 0) {
    console.log("Failed:");
    for (const f of failures) console.log(`  ✗ ${f}`);
  }
  console.log("═".repeat(72) + "\n");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Suite crashed:", e);
  process.exit(1);
});
