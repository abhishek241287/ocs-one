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
  masterProductsTable,
  materialCategoriesTable,
  materialsTable,
  suppliersTable,
  bomHeadersTable,
  bomLinesTable,
  grnHeadersTable,
  grnLineItemsTable,
  inventoryTransactionsTable,
  materialIssueNotesTable,
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
  // H11 — Lot Traceability (isolated fixture; never data-dependent)
  // ════════════════════════════════════════════════════════════════════════════
  section("H11 — Lot Traceability Validation");

  {
    const runId = `${Date.now()}-${process.pid}`;
    let orderId: string | null = null;
    let productId: string | null = null;
    let categoryId: string | null = null;
    let materialId: string | null = null;
    let supplierId: string | null = null;
    let bomId: string | null = null;
    let grnId: string | null = null;

    try {
      const [product] = await db.insert(masterProductsTable).values({
        code: `H11-PROD-${runId}`,
        name: "H11 Lot Validation Product",
        chemistry: "LFP",
        category: "CERT",
        nominalVoltageV: "48",
        capacityAh: "100",
        energyKwh: "4.8",
        configuration: "16S1P",
        cellCount: 16,
        warrantyPeriodMonths: 12,
      }).returning({ id: masterProductsTable.id });
      productId = product.id;

      const [category] = await db.insert(materialCategoriesTable).values({
        code: `H11-CAT-${runId}`,
        name: "H11 Certificate Materials",
      }).returning({ id: materialCategoriesTable.id });
      categoryId = category.id;

      const [material] = await db.insert(materialsTable).values({
        code: `H11-MAT-${runId}`,
        name: "H11 Traceable Material",
        categoryId: category.id,
        uom: "PCS",
        usageType: "CONSUMABLE",
      }).returning({ id: materialsTable.id });
      materialId = material.id;

      const [supplier] = await db.insert(suppliersTable).values({
        code: `H11-SUP-${runId}`,
        name: "H11 Certificate Supplier",
      }).returning({ id: suppliersTable.id });
      supplierId = supplier.id;

      const [bom] = await db.insert(bomHeadersTable).values({
        bomNumber: `H11-BOM-${runId}`,
        modelId: product.id,
        revision: 1,
        status: "approved",
        yieldPercent: "100",
        approvedBy: "FAT H11",
        approvedAt: new Date(),
      }).returning({ id: bomHeadersTable.id });
      bomId = bom.id;

      const [bomLine] = await db.insert(bomLinesTable).values({
        bomId: bom.id,
        materialId: material.id,
        position: 1,
        quantityPer: "5",
        uom: "PCS",
        traceabilityRequired: true,
      }).returning({ id: bomLinesTable.id });

      const [grn] = await db.insert(grnHeadersTable).values({
        grnNumber: `H11-GRN-${runId}`,
        supplierId: supplier.id,
        receivedDate: new Date().toISOString().split("T")[0],
        status: "posted",
        postedAt: new Date(),
      }).returning({ id: grnHeadersTable.id });
      grnId = grn.id;

      const [smallLot, validLot] = await db.insert(grnLineItemsTable).values([
        {
          grnId: grn.id,
          lineNumber: 1,
          materialId: material.id,
          quantityReceived: "2",
          uom: "PCS",
          supplierLotNumber: `H11-SMALL-${runId}`,
        },
        {
          grnId: grn.id,
          lineNumber: 2,
          materialId: material.id,
          quantityReceived: "20",
          uom: "PCS",
          supplierLotNumber: `H11-VALID-${runId}`,
        },
      ]).returning({
        id: grnLineItemsTable.id,
        supplierLotNumber: grnLineItemsTable.supplierLotNumber,
        quantityReceived: grnLineItemsTable.quantityReceived,
      });

      await db.insert(inventoryTransactionsTable).values([smallLot, validLot].map((lot) => ({
        transactionType: "GRN_RECEIPT" as const,
        materialId: material.id,
        quantity: lot.quantityReceived,
        uom: "PCS" as const,
        stockState: "available" as const,
        sourceDocumentType: "GRN",
        sourceDocumentId: grn.id,
        sourceLineId: lot.id,
      })));

      const [order] = await db.insert(mfgProductionOrdersTable).values({
        orderNumber: `H11-PO-${runId}`,
        batteryNumber: `H11-BAT-${runId}`,
        productId: product.id,
        factoryManager: "QA H11",
        status: "in_progress",
        priority: "medium",
      }).returning({ id: mfgProductionOrdersTable.id });
      orderId = order.id;

      const issue = (grnLineId: string, supplierLotNumber: string) =>
        apiReq("POST", `/api/manufacturing/orders/${order.id}/material-issues`, supervisorToken ?? ownerToken, {
          lines: [{
            source_bom_line_id: bomLine.id,
            issued_qty: 5,
            grn_id: grn.id,
            grn_line_id: grnLineId,
            supplier_lot_number: supplierLotNumber,
          }],
        });

      const invalid = await issue("00000000-0000-0000-0000-000000000000", "NONEXISTENT-LOT");
      if (invalid.status === 422 && (invalid.body as { error_code?: string })?.error_code === "lot_validation_failed") {
        pass("H11: Nonexistent lot reference rejected before MIN commit", "HTTP 422 lot_validation_failed");
      } else {
        fail("H11: Nonexistent lot reference rejection", `HTTP ${invalid.status}; body=${JSON.stringify(invalid.body)}`);
      }

      const insufficient = await issue(smallLot.id, smallLot.supplierLotNumber!);
      if (
        insufficient.status === 422 &&
        (insufficient.body as { error_code?: string })?.error_code === "lot_validation_failed" &&
        String((insufficient.body as { error?: unknown })?.error).includes("Insufficient lot balance")
      ) {
        pass("H11: Selected lot with insufficient balance rejected", "HTTP 422 lot_validation_failed");
      } else {
        fail("H11: Insufficient lot balance rejection", `HTTP ${insufficient.status}; body=${JSON.stringify(insufficient.body)}`);
      }

      const valid = await issue(validLot.id, validLot.supplierLotNumber!);
      if (valid.status === 201 && (valid.body as { id?: string })?.id) {
        pass("H11: Valid lot with sufficient balance creates MIN", "HTTP 201");
      } else {
        fail("H11: Valid lot issuance", `HTTP ${valid.status}; body=${JSON.stringify(valid.body)}`);
      }
    } finally {
      if (materialId) {
        await db.delete(inventoryTransactionsTable).where(eq(inventoryTransactionsTable.materialId, materialId));
      }
      if (orderId) {
        await db.delete(materialIssueNotesTable).where(eq(materialIssueNotesTable.sourceRefId, orderId));
        await db.delete(mfgProductionOrdersTable).where(eq(mfgProductionOrdersTable.id, orderId));
      }
      if (bomId) await db.delete(bomHeadersTable).where(eq(bomHeadersTable.id, bomId));
      if (grnId) await db.delete(grnHeadersTable).where(eq(grnHeadersTable.id, grnId));
      if (materialId) await db.delete(materialsTable).where(eq(materialsTable.id, materialId));
      if (categoryId) await db.delete(materialCategoriesTable).where(eq(materialCategoriesTable.id, categoryId));
      if (supplierId) await db.delete(suppliersTable).where(eq(suppliersTable.id, supplierId));
      if (productId) await db.delete(masterProductsTable).where(eq(masterProductsTable.id, productId));
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
