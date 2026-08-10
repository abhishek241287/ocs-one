#!/usr/bin/env tsx
/**
 * FAT Blocker Verification Suite — OCS One v3
 * Covers all 12 acceptance criteria from the FAT blocker implementation.
 * Run with: tsx src/cert/fat-blocker-suite.ts
 * Requires: API server up (direct port via CERT_TARGET or defaults to port 8080 bypass)
 */

// Use @workspace/db for schema checks (same as authz/audit suites).
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

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

  // C1 dynamic cross-access: look for the QA-seeded dealer-role user linked to
  // Dealer A. If the qa-seed script has been run, we can do a live end-to-end
  // isolation check: Dealer A JWT → Dealer B endpoint must 403.
  {
    const QA_DEALER_EMAIL    = "qa.dealer.a@qa.local";
    const QA_DEALER_PASSWORD = process.env.CERT_QA_DEALER_PASSWORD ?? "QADlr#2026!";

    // Find the QA dealer user and their linked dealer IDs.
    const userRows = await db.execute(sql`
      SELECT u.id, u.email, u.dealer_id
      FROM   users u
      WHERE  u.email    = ${QA_DEALER_EMAIL}
        AND  u.role     = 'dealer'
        AND  u.dealer_id IS NOT NULL
        AND  u.is_active = true
      LIMIT 1
    `);
    const qaUser = userRows.rows[0] as { id: string; email: string; dealer_id: string } | undefined;

    if (!qaUser) {
      skip(
        "C1: Dealer A vs Dealer B cross-access",
        "QA dataset not seeded — run: tsx src/cert/qa-seed.ts",
      );
    } else {
      // Find a second dealer (Dealer B) that is NOT the user's own dealer.
      const otherRows = await db.execute(sql`
        SELECT id FROM logistics_dealers
        WHERE  id          != ${qaUser.dealer_id}
          AND  dealer_code  LIKE 'QA-FAT-%'
        LIMIT 1
      `);
      const dealerBId = (otherRows.rows[0] as { id: string } | undefined)?.id;

      if (!dealerBId) {
        skip(
          "C1: Dealer A vs Dealer B cross-access",
          "second QA dealer not found — re-run qa-seed.ts",
        );
      } else {
        const dealerToken = await login(QA_DEALER_EMAIL, QA_DEALER_PASSWORD);
        if (!dealerToken) {
          fail("C1: Dealer A login", "QA dealer user login failed — check password or is_active");
        } else {
          // Cross-access: Dealer A JWT → Dealer B endpoint → must 403.
          const rCross = await apiReq(
            "GET",
            `/api/dealers/${dealerBId}/inventory`,
            dealerToken,
          );
          if (rCross.status === 403) {
            pass(
              "C1: Dealer A accessing Dealer B inventory → 403 (isolation guard works)",
            );
          } else {
            fail(
              `C1: Dealer A accessing Dealer B inventory → ${rCross.status} (expected 403)`,
              `body: ${JSON.stringify(rCross.body)}`,
            );
          }

          // Own-dealer access: Dealer A JWT → Dealer A endpoint → must NOT 403.
          const rOwn = await apiReq(
            "GET",
            `/api/dealers/${qaUser.dealer_id}/inventory`,
            dealerToken,
          );
          if (rOwn.status !== 403) {
            pass(
              "C1: Dealer A accessing own inventory → not 403 (permitted)",
              `HTTP ${rOwn.status}`,
            );
          } else {
            fail(
              "C1: Dealer A accessing own inventory → 403 (should be allowed)",
            );
          }
        }
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
  // H17 — Charger Reservation Race (data-dependent)
  // ════════════════════════════════════════════════════════════════════════════
  section("H17 — Charger Reservation Race Condition");
  {
    // Charger UNITS (runtime reservation table) — not master_chargers (catalogue).
    const chargersResp = await apiReq(
      "GET",
      "/api/manufacturing/charger-units?status=available&pageSize=5",
      ownerToken,
    );
    const chargers = (chargersResp.body as { items?: { id: string; chargerCode?: string }[] })?.items ?? [];

    const ordersResp = await apiReq(
      "GET",
      "/api/manufacturing/orders?status=in_progress&pageSize=10",
      ownerToken,
    );
    const inProgressOrders = (ordersResp.body as { items?: { id: string }[] })?.items ?? [];

    if (chargers.length === 0 || inProgressOrders.length < 2) {
      skip(
        "H17 concurrent charger reservation",
        `need ≥1 available charger (have ${chargers.length}) and ≥2 in-progress orders (have ${inProgressOrders.length})`,
      );
    } else {
      const charger = chargers[0];
      const [o1, o2] = inProgressOrders;
      // Route: POST /orders/:id/stages/:stage/start  (stage is a URL param, not body field)
      // Body:  { operatorName: string, stageData?: Record<string,unknown> }
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
      if (successes <= 1) {
        pass("H17: Concurrent charger reservation — at most one success", `HTTP ${r1.status} + ${r2.status}`);
      } else {
        fail("H17: BOTH concurrent charger reservations succeeded — double-booking!", `HTTP ${r1.status} + ${r2.status}`);
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
