#!/usr/bin/env tsx
/**
 * Phase 10 / Task 74-C — read-only valuation report evidence.
 *
 * The fixture is inserted directly so this certification can prove the report
 * reads without exercising or mutating any operational write path.
 */

import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import { pool } from "@workspace/db";

const BASE_URL = (process.env.CERT_BASE_URL ?? "http://localhost:80").replace(/\/$/, "");
const PASSWORD = `VAL74C-${randomUUID()}`;
const reportPath = fileURLToPath(
  new URL("../../../../certification/phase10-74c-valuation-report-evidence.md", import.meta.url),
);

type ApiResult = { status: number; body: any };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function bodyOf(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function api(
  cookies: Map<string, string>,
  role: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResult> {
  const headers = new Headers();
  const cookie = cookies.get(role);
  if (cookie) headers.set("Cookie", cookie);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookies.set(role, setCookie.split(";")[0]);
  return { status: response.status, body: await bodyOf(response) };
}

async function scalar(text: string, params: unknown[] = []): Promise<number> {
  const result = await pool.query(text, params);
  return Number(Object.values(result.rows[0] ?? {})[0] ?? 0);
}

async function main(): Promise<void> {
  const prefix = `VAL74C-${Date.now().toString(36).toUpperCase()}-${randomUUID()
    .slice(0, 8)
    .toUpperCase()}`;
  const compactCode = `V74C-${randomUUID().slice(0, 8).toUpperCase()}`;
  const actorId = randomUUID();
  const viewerId = randomUUID();
  const supplierId = randomUUID();
  const workflowId = randomUUID();
  const categoryId = randomUUID();
  const capturedMaterialId = randomUUID();
  const unknownMaterialId = randomUUID();
  const capturedGrnId = randomUUID();
  const unknownGrnId = randomUUID();
  const capturedLineId = randomUUID();
  const unknownLineId = randomUUID();
  const capturedReceiptMovementId = randomUUID();
  const unknownReceiptMovementId = randomUUID();
  const depletionMovementId = randomUUID();
  const depletionId = randomUUID();
  const depletionSourceDocumentId = randomUUID();
  const warehouseId = randomUUID();
  const locationId = randomUUID();
  const cookies = new Map<string, string>();
  const checks: { name: string; pass: boolean; detail?: unknown }[] = [];

  const check = (name: string, pass: boolean, detail?: unknown) => {
    checks.push({ name, pass, detail: pass ? undefined : detail });
    console.log(`${pass ? "PASS" : "FAIL"} ${name}${pass ? "" : ` — ${JSON.stringify(detail)}`}`);
  };

  const credentials = [
    { role: "supervisor", id: actorId, email: `${prefix.toLowerCase()}-supervisor@cert.local` },
    { role: "viewer", id: viewerId, email: `${prefix.toLowerCase()}-viewer@cert.local` },
  ];

  try {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    await pool.query(
      `INSERT INTO users (id, email, password_hash, name, role, is_active)
       VALUES ($1, $2, $3, $4, 'supervisor', true),
              ($5, $6, $3, $7, 'viewer', true)`,
      [
        actorId,
        credentials[0].email,
        passwordHash,
        `${prefix} Supervisor`,
        viewerId,
        credentials[1].email,
        `${prefix} Viewer`,
      ],
    );
    await pool.query(
      `INSERT INTO master_suppliers (id, code, name, status, created_by)
       VALUES ($1, $2, $3, 'active', $4)`,
      [supplierId, `${prefix}-SUP`, `${prefix} Supplier`, actorId],
    );
    await pool.query(
      `INSERT INTO material_workflows (id, code, name, post_receipt_action, status, created_by)
       VALUES ($1, $2, $3, 'DIRECT_TO_INVENTORY', 'active', $4)`,
      [workflowId, `${prefix}-WF`, `${prefix} Direct`, actorId],
    );
    await pool.query(
      `INSERT INTO master_material_categories
        (id, code, name, status, linked_master_type, engineering_master_required, valuation_policy, created_by)
       VALUES ($1, $2, $3, 'active', NULL, false, 'FIFO', $4)`,
      [categoryId, `${prefix}-CAT`, `${prefix} Category`, actorId],
    );
    await pool.query(
      `INSERT INTO material_workflow_assignments
        (id, category_id, workflow_id, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $4)`,
      [randomUUID(), categoryId, workflowId, actorId],
    );
    await pool.query(
      `INSERT INTO master_materials
        (id, code, name, category_id, uom, usage_type, status, created_by)
       VALUES
        ($1, $2, $3, $5, 'PCS', 'CONSUMABLE', 'active', $7),
        ($4, $8, $6, $5, 'PCS', 'CONSUMABLE', 'active', $7)`,
      [
        capturedMaterialId,
        `${prefix}-CAPTURED`,
        `${prefix} Captured`,
        unknownMaterialId,
        categoryId,
        `${prefix} Unknown`,
        actorId,
        `${prefix}-UNKNOWN`,
      ],
    );
    await pool.query(
      `INSERT INTO warehouses (id, code, name, type, is_active)
       VALUES ($1, $2, $3, 'main_store', true)`,
      [warehouseId, `${compactCode}-WH`, `${prefix} Warehouse`],
    );
    await pool.query(
      `INSERT INTO locations (id, warehouse_id, code, name, type, is_active)
       VALUES ($1, $2, $3, $4, 'storage', true)`,
      [locationId, warehouseId, `${compactCode}-LC`, `${prefix} Storage`],
    );

    const now = new Date();
    await pool.query(
      `INSERT INTO grn_headers
        (id, grn_number, supplier_id, warehouse_id, location_id, received_date, status, posted_at, posted_by, created_by)
       VALUES
        ($1, $2, $3, $7, $8, $9, 'posted', $10, $11, $11),
        ($4, $5, $6, $7, $8, $9, 'posted', $10, $11, $11)`,
      [
        capturedGrnId,
        `${prefix}-GRN-C`,
        supplierId,
        unknownGrnId,
        `${prefix}-GRN-U`,
        supplierId,
        warehouseId,
        locationId,
        now.toISOString().slice(0, 10),
        now,
        actorId,
      ],
    );
    await pool.query(
      `INSERT INTO grn_line_items
        (id, grn_id, line_number, material_id, quantity_received, uom, warehouse_id, location_id,
         accepted_qty, rejected_qty, put_away_qty, receipt_unit_cost, receipt_currency,
         receipt_cost_status, receipt_cost_source, inspection_status)
       VALUES
        ($1, $2, 1, $3, 5, 'PCS', $5, $6, 5, 0, 5, 10, 'INR', 'CAPTURED', 'MANUAL', NULL),
        ($4, $7, 1, $8, 4, 'PCS', $5, $6, 4, 0, 4, NULL, NULL, 'MISSING', 'NONE', NULL)`,
      [
        capturedLineId,
        capturedGrnId,
        capturedMaterialId,
        unknownLineId,
        warehouseId,
        locationId,
        unknownGrnId,
        unknownMaterialId,
      ],
    );
    await pool.query(
      `INSERT INTO inventory_transactions
        (id, transaction_type, material_id, quantity, uom, stock_state, warehouse_id, location_id,
         source_document_type, source_document_id, source_line_id, created_by, created_at)
       VALUES
        ($1, 'GRN_RECEIPT', $2, 5, 'PCS', 'available', $6, $7, 'GRN', $8, $9, $13, $14),
        ($3, 'GRN_RECEIPT', $4, 4, 'PCS', 'available', $6, $7, 'GRN', $10, $11, $13, $14),
        ($5, 'PRODUCTION_ISSUE', $2, -2, 'PCS', 'available', $6, $7, 'MIN', $12, $9, $13, $14)`,
      [
        capturedReceiptMovementId,
        capturedMaterialId,
        unknownReceiptMovementId,
        unknownMaterialId,
        depletionMovementId,
        warehouseId,
        locationId,
        capturedGrnId,
        capturedLineId,
        unknownGrnId,
        unknownLineId,
        depletionSourceDocumentId,
        actorId,
        now,
      ],
    );
    await pool.query(
      `INSERT INTO valuation_layers
        (id, grn_line_id, material_id, receipt_quantity, remaining_quantity, uom,
         receipt_unit_cost, receipt_currency, receipt_cost_status, policy, receipt_movement_id, created_at)
       VALUES
        ($1, $2, $3, 5, 3, 'PCS', 10, 'INR', 'CAPTURED', 'FIFO', $5, $7),
        ($4, $6, $8, 4, 4, 'PCS', NULL, NULL, 'MISSING', 'FIFO', $9, $7)`,
      [
        randomUUID(),
        capturedLineId,
        capturedMaterialId,
        randomUUID(),
        capturedReceiptMovementId,
        unknownLineId,
        now,
        unknownMaterialId,
        unknownReceiptMovementId,
      ],
    );
    const layerRows = await pool.query<{ id: string }>(
      "SELECT id FROM valuation_layers WHERE grn_line_id = $1",
      [capturedLineId],
    );
    const capturedLayerId = layerRows.rows.find((row) => row.id)?.id;
    assert(capturedLayerId, "captured valuation layer fixture was not created");
    await pool.query(
      `INSERT INTO valuation_depletions
        (id, valuation_layer_id, material_id, quantity, allocation_index, value_status,
         unit_cost, value_amount, currency, policy, movement_id, source_document_type,
         source_document_id, source_line_id, created_at)
       VALUES ($1, $2, $3, -2, 0, 'CAPTURED', 10, -20, 'INR', 'FIFO', $4, 'MIN', $5, $6, $7)`,
      [
        depletionId,
        capturedLayerId,
        capturedMaterialId,
        depletionMovementId,
        depletionSourceDocumentId,
        capturedLineId,
        now,
      ],
    );

    for (const credential of credentials) {
      const login = await api(cookies, credential.role, "POST", "/api/auth/login", {
        email: credential.email,
        password: PASSWORD,
      });
      assert(login.status === 200, `${credential.role} login failed: ${login.status}`);
    }

    const from = new Date(now.getTime() - 86400000).toISOString();
    const to = new Date(now.getTime() + 86400000).toISOString();
    const query = `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=100`;
    const beforeInventory = await scalar(
      "SELECT count(*) FROM inventory_transactions WHERE material_id = ANY($1::uuid[])",
      [[capturedMaterialId, unknownMaterialId]],
    );
    const beforeDepletions = await scalar(
      "SELECT count(*) FROM valuation_depletions WHERE material_id = ANY($1::uuid[])",
      [[capturedMaterialId, unknownMaterialId]],
    );

    const invalidUuid = await api(
      cookies,
      "viewer",
      "GET",
      "/api/reports/valuation/value-on-hand?material_id=not-a-uuid",
    );
    check(
      "invalid UUID filter is rejected",
      invalidUuid.status === 400 && invalidUuid.body?.error === "invalid_material_id",
      invalidUuid.body,
    );
    const invalidState = await api(
      cookies,
      "viewer",
      "GET",
      "/api/reports/valuation/value-on-hand?stock_state=not-a-state",
    );
    check(
      "invalid stock-state filter is rejected",
      invalidState.status === 400 && invalidState.body?.error === "invalid_stock_state",
      invalidState.body,
    );
    const invalidRange = await api(
      cookies,
      "viewer",
      "GET",
      "/api/reports/valuation/movements-at-cost?from=2026-09-16&to=2026-09-15",
    );
    check(
      "invalid date range is rejected",
      invalidRange.status === 400 && invalidRange.body?.error === "invalid_date_range",
      invalidRange.body,
    );

    const onHand = await api(
      cookies,
      "viewer",
      "GET",
      `/api/reports/valuation/value-on-hand?warehouse_id=${warehouseId}`,
    );
    check("viewer can read value-on-hand", onHand.status === 200, onHand.body);
    check(
      "unknown quantity stays separate",
      onHand.body?.summary?.unknown_quantity === 4 &&
        onHand.body?.summary?.captured_quantity === 3,
      onHand.body?.summary,
    );
    const unknownRow = onHand.body?.rows?.find(
      (row: any) => row.value_status === "UNKNOWN",
    );
    check(
      "unknown value remains NULL",
      unknownRow?.unit_cost === null &&
        unknownRow?.value_amount === null &&
        unknownRow?.currency === null,
      unknownRow,
    );
    const capturedRow = onHand.body?.rows?.find(
      (row: any) => row.value_status === "CAPTURED",
    );
    check(
      "captured on-hand reconciles to layer remainder",
      capturedRow?.quantity === 3 && capturedRow?.value_amount === 30,
      capturedRow,
    );

    const movements = await api(cookies, "viewer", "GET", `/api/reports/valuation/movements-at-cost${query}`);
    check("viewer can read movements-at-cost", movements.status === 200, movements.body);
    check(
      "movements include receipt and depletion events",
      movements.body?.rows?.some((row: any) => row.event_type === "RECEIPT") &&
        movements.body?.rows?.some((row: any) => row.event_type === "DEPLETION"),
      movements.body?.rows,
    );
    const repeatedMovements = await api(
      cookies,
      "viewer",
      "GET",
      `/api/reports/valuation/movements-at-cost${query}`,
    );
    check(
      "movement ordering is deterministic",
      JSON.stringify(movements.body?.rows) === JSON.stringify(repeatedMovements.body?.rows),
    );

    const trace = await api(
      cookies,
      "viewer",
      "GET",
      `/api/reports/valuation/layer-trace?movement_id=${depletionMovementId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
    check("viewer can read layer-trace", trace.status === 200, trace.body);
    check(
      "layer trace preserves both citations",
      trace.body?.rows?.[0]?.movement_id === depletionMovementId &&
        trace.body?.rows?.[0]?.source_document_id === depletionSourceDocumentId &&
        trace.body?.rows?.[0]?.receipt_movement_id === capturedReceiptMovementId &&
        trace.body?.rows?.[0]?.grn_line_id === capturedLineId,
      trace.body?.rows?.[0],
    );

    const afterInventory = await scalar(
      "SELECT count(*) FROM inventory_transactions WHERE material_id = ANY($1::uuid[])",
      [[capturedMaterialId, unknownMaterialId]],
    );
    const afterDepletions = await scalar(
      "SELECT count(*) FROM valuation_depletions WHERE material_id = ANY($1::uuid[])",
      [[capturedMaterialId, unknownMaterialId]],
    );
    check("report reads write zero inventory rows", beforeInventory === afterInventory);
    check("report reads write zero valuation rows", beforeDepletions === afterDepletions);
  } finally {
    await pool.query("DELETE FROM valuation_depletions WHERE id = $1", [depletionId]);
    await pool.query("DELETE FROM valuation_layers WHERE grn_line_id = ANY($1::uuid[])", [
      [capturedLineId, unknownLineId],
    ]);
    await pool.query("DELETE FROM inventory_transactions WHERE id = ANY($1::uuid[])", [
      [capturedReceiptMovementId, unknownReceiptMovementId, depletionMovementId],
    ]);
    await pool.query("DELETE FROM grn_line_items WHERE id = ANY($1::uuid[])", [
      [capturedLineId, unknownLineId],
    ]);
    await pool.query("DELETE FROM grn_headers WHERE id = ANY($1::uuid[])", [
      [capturedGrnId, unknownGrnId],
    ]);
    await pool.query("DELETE FROM material_workflow_assignments WHERE workflow_id = $1", [workflowId]);
    await pool.query("DELETE FROM master_materials WHERE id = ANY($1::uuid[])", [
      [capturedMaterialId, unknownMaterialId],
    ]);
    await pool.query("DELETE FROM master_material_categories WHERE id = $1", [categoryId]);
    await pool.query("DELETE FROM material_workflows WHERE id = $1", [workflowId]);
    await pool.query("DELETE FROM master_suppliers WHERE id = $1", [supplierId]);
    await pool.query("DELETE FROM locations WHERE id = $1", [locationId]);
    await pool.query("DELETE FROM warehouses WHERE id = $1", [warehouseId]);
    await pool.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [[actorId, viewerId]]);
    await pool.end();
  }

  const passed = checks.filter((check) => check.pass).length;
  const failed = checks.length - passed;
  const evidence = [
    "# Phase 10 / Task 74-C — valuation report evidence",
    "",
    `- Base URL: ${BASE_URL}`,
    `- Fixture prefix: ${prefix}`,
    `- Result: ${failed === 0 ? "PASS" : "FAIL"}`,
    `- Checks: ${passed} passed, ${failed} failed`,
    "",
    ...checks.map((check) => `- [${check.pass ? "x" : " "}] ${check.name}${check.detail ? ` — ${JSON.stringify(check.detail)}` : ""}`),
    "",
    "The fixture was removed in the finally block. Report endpoints were exercised through authenticated HTTP GETs only.",
    "",
  ].join("\n");
  await writeFile(reportPath, evidence);
  if (failed > 0) process.exitCode = 1;
  console.log(evidence);
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});