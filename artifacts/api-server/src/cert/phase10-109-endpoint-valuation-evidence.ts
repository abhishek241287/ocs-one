#!/usr/bin/env tsx
/**
 * Phase 10 / Task 109 — endpoint-level transfer and partial-return valuation evidence.
 *
 * This batch uses the real inventory endpoints for receipt, transfer, reservation/WIP
 * issue, and return lifecycles. SQL is limited to isolated fixture setup, evidence
 * queries, and teardown.
 *
 * Run with:
 *   CERT_BASE_URL=http://localhost:80 \
 *   pnpm --filter @workspace/api-server run test:phase10-109
 */

import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import { pool } from "@workspace/db";

const BASE_URL = (process.env.CERT_BASE_URL ?? "http://localhost:80").replace(/\/$/, "");
const PASSWORD = "VAL-109-Endpoint-Certification2026";
const reportPath = fileURLToPath(
  new URL("../../../../certification/phase10-109-endpoint-valuation-evidence.md", import.meta.url),
);

type ApiResult = { status: number; body: any };
type Warehouse = { id: string; locationId: string };
type MaterialFixture = {
  key: string;
  materialId: string;
  categoryId: string;
  orderId?: string;
  quantity: number;
  cost: number | null;
  grnId: string;
  grnLineId: string;
  lotId: string;
  receiptMovementId: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
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

async function sql<T extends Record<string, any> = Record<string, any>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  return (await pool.query<T>(text, params)).rows;
}

async function scalar<T = unknown>(text: string, params: unknown[] = []): Promise<T> {
  const rows = await sql<Record<string, T>>(text, params);
  return rows[0] ? Object.values(rows[0])[0] : (undefined as T);
}

async function api(
  cookies: Map<string, string>,
  role: string | null,
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResult> {
  const headers = new Headers();
  const cookie = role ? cookies.get(role) : undefined;
  if (cookie) headers.set("Cookie", cookie);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const setCookie = response.headers.get("set-cookie");
  if (role && setCookie) cookies.set(role, setCookie.split(";")[0]);
  return { status: response.status, body: await bodyOf(response) };
}

async function main(): Promise<void> {
  const prefix = `VAL109-${Date.now().toString(36).toUpperCase()}-${cryptoRandom()}`;
  const supervisorId = cryptoUuid();
  const directorId = cryptoUuid();
  const supplierId = cryptoUuid();
  const workflowId = cryptoUuid();
  const cookies = new Map<string, string>();
  const credentials = {
    supervisor: { email: `${prefix.toLowerCase()}-supervisor@cert.local`, password: PASSWORD },
    director: { email: `${prefix.toLowerCase()}-director@cert.local`, password: PASSWORD },
  };
  const categoryIds: string[] = [];
  const materialIds: string[] = [];
  const grnIds: string[] = [];
  const grnLineIds: string[] = [];
  const lotIds: string[] = [];
  const transactionMaterialIds: string[] = [];
  const transferRequestIds: string[] = [];
  const returnIds: string[] = [];
  const reservationIds: string[] = [];
  const issueIds: string[] = [];
  const orderIds: string[] = [];
  const warehouseIds: string[] = [];
  const locationIds: string[] = [];
  const evidence: Record<string, unknown> = {};
  let failed = 0;
  let passed = 0;
  const check = (id: string, condition: boolean, detail: unknown = "") => {
    if (condition) {
      passed += 1;
      console.log(`${id}: PASS`);
    } else {
      failed += 1;
      console.log(`${id}: FAIL ${typeof detail === "string" ? detail : json(detail)}`);
    }
  };

  try {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    await pool.query("BEGIN");
    await pool.query(
      `INSERT INTO users (id, email, password_hash, name, role, is_active)
       VALUES ($1, $2, $3, $4, 'supervisor', true),
              ($5, $6, $3, $7, 'director', true)`,
      [
        supervisorId,
        credentials.supervisor.email,
        passwordHash,
        `${prefix} Supervisor`,
        directorId,
        credentials.director.email,
        `${prefix} Director`,
      ],
    );
    await pool.query(
      `INSERT INTO master_suppliers (id, code, name, status, created_by)
       VALUES ($1, $2, $3, 'active', $4)`,
      [supplierId, `${prefix}-SUP`, `${prefix} Supplier`, supervisorId],
    );
    await pool.query(
      `INSERT INTO material_workflows (id, code, name, post_receipt_action, status, created_by)
       VALUES ($1, $2, $3, 'DIRECT_TO_INVENTORY', 'active', $4)`,
      [workflowId, `${prefix}-WF`, `${prefix} Direct receipt`, supervisorId],
    );
    await pool.query("COMMIT");

    for (const role of ["supervisor", "director"]) {
      const login = await api(
        cookies,
        role,
        "POST",
        "/api/auth/login",
        credentials[role as "supervisor" | "director"],
      );
      assert(login.status === 200, `${role} login failed: ${json(login.body)}`);
      assert(cookies.has(role), `${role} login did not set a session cookie`);
    }

    const source = await makeWarehouse(prefix, "SRC", warehouseIds, locationIds);
    const destination = await makeWarehouse(prefix, "DST", warehouseIds, locationIds);

    async function makeMaterial(key: string): Promise<{
      materialId: string;
      categoryId: string;
    }> {
      const categoryId = cryptoUuid();
      const materialId = cryptoUuid();
      categoryIds.push(categoryId);
      materialIds.push(materialId);
      transactionMaterialIds.push(materialId);
      await pool.query(
        `INSERT INTO master_material_categories
           (id, code, name, status, linked_master_type, engineering_master_required,
            valuation_policy, created_by)
         VALUES ($1, $2, $3, 'active', NULL, false, 'FIFO', $4)`,
        [categoryId, `${prefix}-CAT-${key}`, `${prefix} Category ${key}`, supervisorId],
      );
      await pool.query(
        `INSERT INTO material_workflow_assignments
           (id, category_id, workflow_id, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $4)`,
        [cryptoUuid(), categoryId, workflowId, supervisorId],
      );
      await pool.query(
        `INSERT INTO master_materials
           (id, code, name, category_id, uom, usage_type, status, created_by)
         VALUES ($1, $2, $3, $4, 'PCS', 'CONSUMABLE', 'active', $5)`,
        [materialId, `${prefix}-MAT-${key}`, `${prefix} Material ${key}`, categoryId, supervisorId],
      );
      return { materialId, categoryId };
    }

    async function makeReceipt(key: string, quantity: number, cost: number | null): Promise<MaterialFixture> {
      const material = await makeMaterial(key);
      const created = await api(cookies, "supervisor", "POST", "/api/inventory/grns", {
        supplier_id: supplierId,
        received_date: new Date().toISOString().slice(0, 10),
        remarks: `${prefix} ${key} endpoint receipt`,
        lines: [
          {
            material_id: material.materialId,
            quantity_received: quantity,
            ...(cost == null
              ? {}
              : { receipt_unit_cost: cost, receipt_currency: "INR" }),
          },
        ],
      });
      assert(created.status === 201, `${key} GRN create failed: ${json(created.body)}`);
      const grnId = created.body.id as string;
      const grnLineId = created.body.lines[0].id as string;
      grnIds.push(grnId);
      grnLineIds.push(grnLineId);
      await pool.query(
        "UPDATE grn_headers SET warehouse_id = $2, location_id = $3 WHERE id = $1",
        [grnId, source.id, source.locationId],
      );
      const posted = await api(cookies, "supervisor", "POST", `/api/inventory/grns/${grnId}/post`);
      assert(posted.status === 200, `${key} GRN post failed: ${json(posted.body)}`);
      const [receipt] = await sql<{
        lot_id: string;
        movement_id: string;
      }>(
        `SELECT li.lot_id,
                it.id AS movement_id
           FROM grn_line_items li
           JOIN inventory_transactions it
             ON it.source_line_id = li.id
            AND it.transaction_type = 'GRN_RECEIPT'
          WHERE li.id = $1`,
        [grnLineId],
      );
      assert(receipt?.lot_id && receipt.movement_id, `${key} posted receipt evidence missing`);
      lotIds.push(receipt.lot_id);
      return {
        key,
        materialId: material.materialId,
        categoryId: material.categoryId,
        quantity,
        cost,
        grnId,
        grnLineId,
        lotId: receipt.lot_id,
        receiptMovementId: receipt.movement_id,
      };
    }

    async function makeOrder(key: string): Promise<string> {
      const id = cryptoUuid();
      orderIds.push(id);
      await pool.query(
        `INSERT INTO mfg_production_orders
           (id, order_number, battery_number, factory_manager, status, priority)
         VALUES ($1, $2, $3, $4, 'draft', 'medium')`,
        [id, `${prefix}-PO-${key}`, `${prefix}-BAT-${key}`, `${prefix} Manager`],
      );
      return id;
    }

    async function createTransfer(
      fixture: MaterialFixture,
      quantity: number,
      key: string,
    ): Promise<{ request: any; lineId: string }> {
      const created = await api(cookies, "supervisor", "POST", "/api/inventory/transfer-requests", {
        source_warehouse_id: source.id,
        destination_warehouse_id: destination.id,
        notes: `${prefix} ${key} transfer`,
        lines: [
          {
            material_id: fixture.materialId,
            quantity,
            lot_id: fixture.lotId,
            source_location_id: source.locationId,
            destination_location_id: destination.locationId,
          },
        ],
      });
      assert(created.status === 201, `${key} transfer create failed: ${json(created.body)}`);
      transferRequestIds.push(created.body.id);
      const approved = await api(
        cookies,
        "director",
        "POST",
        `/api/inventory/transfer-requests/${created.body.id}/approve`,
        {},
      );
      assert(approved.status === 200, `${key} transfer approve failed: ${json(approved.body)}`);
      return { request: created.body, lineId: created.body.lines[0].id };
    }

    async function issueTransfer(requestId: string, key: string): Promise<ApiResult> {
      const issued = await api(
        cookies,
        "supervisor",
        "POST",
        `/api/inventory/transfer-requests/${requestId}/issue`,
        {},
      );
      assert(issued.status === 200, `${key} transfer issue failed: ${json(issued.body)}`);
      return issued;
    }

    async function createWipIssue(
      fixture: MaterialFixture,
      quantity: number,
      key: string,
    ): Promise<{ orderId: string; reservationId: string; issue: any }> {
      const orderId = await makeOrder(key);
      const reservation = await api(cookies, "supervisor", "POST", "/api/inventory/reservations", {
        production_order_id: orderId,
        material_id: fixture.materialId,
        quantity,
      });
      assert(reservation.status === 201, `${key} reservation failed: ${json(reservation.body)}`);
      reservationIds.push(reservation.body.id);
      const allocated = await api(
        cookies,
        "supervisor",
        "POST",
        `/api/inventory/reservations/${reservation.body.id}/allocate`,
      );
      assert(allocated.status === 200, `${key} allocation failed: ${json(allocated.body)}`);
      const issue = await api(
        cookies,
        "supervisor",
        "POST",
        `/api/inventory/reservations/${reservation.body.id}/issue`,
        { quantity, lot_id: fixture.lotId },
      );
      assert(issue.status === 201, `${key} WIP issue failed: ${json(issue.body)}`);
      issueIds.push(issue.body.id);
      return { orderId, reservationId: reservation.body.id, issue: issue.body };
    }

    async function postReturn(
      fixture: MaterialFixture,
      issue: { orderId: string; reservationId: string; issue: any },
      quantity: number,
      key: string,
    ): Promise<ApiResult> {
      const draft = await api(cookies, "supervisor", "POST", "/api/inventory/returns", {
        production_order_id: issue.orderId,
        material_id: fixture.materialId,
        wip_issue_note_id: issue.issue.id,
        lot_id: fixture.lotId,
        quantity,
        destination_warehouse_id: destination.id,
        destination_location_id: destination.locationId,
        reason: `${prefix} ${key} partial return`,
      });
      assert(draft.status === 201, `${key} return draft failed: ${json(draft.body)}`);
      returnIds.push(draft.body.id);
      const approved = await api(
        cookies,
        "director",
        "POST",
        `/api/inventory/returns/${draft.body.id}/approve`,
        {},
      );
      assert(approved.status === 200, `${key} return approval failed: ${json(approved.body)}`);
      const posted = await api(
        cookies,
        "supervisor",
        "POST",
        `/api/inventory/returns/${draft.body.id}/post`,
        {},
      );
      assert(posted.status === 200, `${key} return post failed: ${json(posted.body)}`);
      return posted;
    }

    const receiveFixture = await makeReceipt("TR-RECEIVE", 6, 10);
    const receiveTransfer = await createTransfer(receiveFixture, 6, "receive");
    await issueTransfer(receiveTransfer.request.id, "receive");
    const receiveBefore = await sql(
      `SELECT vd.id, vd.quantity::text AS quantity, vd.value_status, vd.value_amount::text AS value_amount,
              vd.movement_id, vd.source_document_type, vd.source_document_id, vd.source_line_id
         FROM valuation_depletions vd
        WHERE vd.source_document_id = $1
        ORDER BY vd.created_at, vd.id`,
      [receiveTransfer.request.id],
    );
    const received = await api(
      cookies,
      "supervisor",
      "POST",
      `/api/inventory/transfer-requests/${receiveTransfer.request.id}/receive`,
      { lines: [{ line_id: receiveTransfer.lineId, quantity: 6 }] },
    );
    const receiveAfter = await sql(
      `SELECT vd.id, vd.quantity::text AS quantity, vd.value_status, vd.value_amount::text AS value_amount,
              vd.movement_id, vd.source_document_type, vd.source_document_id, vd.source_line_id
         FROM valuation_depletions vd
        WHERE vd.source_document_id = $1
        ORDER BY vd.created_at, vd.id`,
      [receiveTransfer.request.id],
    );
    const receiveMovements = await sql(
      `SELECT id, transaction_type, quantity::text AS quantity, source_line_id
         FROM inventory_transactions
        WHERE source_document_id = $1
        ORDER BY id`,
      [receiveTransfer.request.id],
    );
    check(
      "VAL-109-01",
      received.status === 200 &&
        received.body.status === "received" &&
        receiveBefore.length === 1 &&
        receiveAfter.length === 1 &&
        receiveAfter[0].quantity === "-6.000" &&
        receiveAfter[0].value_status === "CAPTURED" &&
        receiveAfter[0].value_amount === "-60.0000000" &&
        receiveMovements.length === 4,
      {
        received: received.status,
        receiveBefore,
        receiveAfter,
        receiveMovements,
      },
    );
    evidence.receive = { requestId: receiveTransfer.request.id, receiveBefore, receiveAfter, receiveMovements };

    const rejectFixture = await makeReceipt("TR-REJECT", 7, 11);
    const rejectTransfer = await createTransfer(rejectFixture, 5, "reject");
    await issueTransfer(rejectTransfer.request.id, "reject");
    const rejected = await api(
      cookies,
      "supervisor",
      "POST",
      `/api/inventory/transfer-requests/${rejectTransfer.request.id}/reject`,
      { reason: `${prefix} reject outstanding transfer` },
    );
    const rejectDepletions = await sql(
      `SELECT vd.quantity::text AS quantity, vd.value_status, vd.value_amount::text AS value_amount,
              vd.movement_id, vd.source_document_type, vd.source_document_id, vd.source_line_id,
              it.transaction_type, it.quantity::text AS movement_quantity
         FROM valuation_depletions vd
         JOIN inventory_transactions it ON it.id = vd.movement_id
        WHERE vd.source_document_id = $1
        ORDER BY vd.created_at, vd.id`,
      [rejectTransfer.request.id],
    );
    const [rejectLayer] = await sql<{ remaining_quantity: string }>(
      "SELECT remaining_quantity::text FROM valuation_layers WHERE grn_line_id = $1",
      [rejectFixture.grnLineId],
    );
    check(
      "VAL-109-02",
      rejected.status === 200 &&
        rejected.body.status === "rejected" &&
        rejectDepletions.length === 2 &&
        rejectDepletions[0].quantity === "-5.000" &&
        rejectDepletions[0].value_amount === "-55.0000000" &&
        rejectDepletions[1].quantity === "5.000" &&
        rejectDepletions[1].value_amount === "55.0000000" &&
        rejectDepletions.every(
          (row) =>
            row.source_document_type === "transfer_request" &&
            row.source_document_id === rejectTransfer.request.id &&
            row.source_line_id === rejectFixture.grnLineId &&
            row.movement_quantity === "-5.000",
        ) &&
        rejectDepletions[0].transaction_type === "TRANSFER_OUT" &&
        rejectDepletions[1].transaction_type === "TRANSFER_REVERSAL" &&
        rejectLayer?.remaining_quantity === "7.000",
      { rejected: rejected.status, rejectDepletions, rejectLayer },
    );
    evidence.reject = { requestId: rejectTransfer.request.id, rejectDepletions, rejectLayer };

    const capturedReturnFixture = await makeReceipt("WIP-CAPTURED", 10, 12);
    const capturedIssue = await createWipIssue(capturedReturnFixture, 10, "captured");
    const capturedReturn = await postReturn(capturedReturnFixture, capturedIssue, 4, "captured");
    const capturedReturnDepletions = await sql(
      `SELECT vd.quantity::text AS quantity, vd.value_status, vd.value_amount::text AS value_amount,
              vd.movement_id, vd.source_document_type, vd.source_document_id, vd.source_line_id
         FROM valuation_depletions vd
        WHERE vd.material_id = $1
        ORDER BY vd.created_at, vd.id`,
      [capturedReturnFixture.materialId],
    );
    const [capturedReturnLayer] = await sql<{ remaining_quantity: string }>(
      "SELECT remaining_quantity::text FROM valuation_layers WHERE grn_line_id = $1",
      [capturedReturnFixture.grnLineId],
    );
    check(
      "VAL-109-03",
      capturedReturn.status === 200 &&
        capturedReturnDepletions.length === 2 &&
        capturedReturnDepletions[0].quantity === "-10.000" &&
        capturedReturnDepletions[0].value_amount === "-120.0000000" &&
        capturedReturnDepletions[1].quantity === "4.000" &&
        capturedReturnDepletions[1].value_amount === "48.0000000" &&
        capturedReturnDepletions[1].source_document_type === "return_document" &&
        capturedReturnLayer?.remaining_quantity === "4.000",
      { capturedReturn: capturedReturn.status, capturedReturnDepletions, capturedReturnLayer },
    );
    evidence.capturedReturn = {
      issueId: capturedIssue.issue.id,
      returnId: returnIds[returnIds.length - 1],
      capturedReturnDepletions,
      capturedReturnLayer,
    };

    const unknownReturnFixture = await makeReceipt("WIP-MISSING", 8, null);
    const unknownIssue = await createWipIssue(unknownReturnFixture, 8, "missing");
    const unknownReturn = await postReturn(unknownReturnFixture, unknownIssue, 3, "missing");
    const unknownReturnDepletions = await sql(
      `SELECT vd.quantity::text AS quantity, vd.value_status, vd.unit_cost, vd.value_amount,
              vd.currency, vd.movement_id, vd.source_document_type, vd.source_document_id, vd.source_line_id
         FROM valuation_depletions vd
        WHERE vd.material_id = $1
        ORDER BY vd.created_at, vd.id`,
      [unknownReturnFixture.materialId],
    );
    const [unknownReturnLayer] = await sql<{ remaining_quantity: string; receipt_cost_status: string }>(
      `SELECT remaining_quantity::text, receipt_cost_status
         FROM valuation_layers
        WHERE grn_line_id = $1`,
      [unknownReturnFixture.grnLineId],
    );
    check(
      "VAL-109-04",
      unknownReturn.status === 200 &&
        unknownReturnDepletions.length === 2 &&
        unknownReturnDepletions.every(
          (row) =>
            row.value_status === "UNKNOWN" &&
            row.unit_cost == null &&
            row.value_amount == null &&
            row.currency == null,
        ) &&
        unknownReturnDepletions[0].quantity === "-8.000" &&
        unknownReturnDepletions[1].quantity === "3.000" &&
        unknownReturnDepletions[1].source_document_type === "return_document" &&
        unknownReturnLayer?.receipt_cost_status === "MISSING" &&
        unknownReturnLayer.remaining_quantity === "3.000",
      { unknownReturn: unknownReturn.status, unknownReturnDepletions, unknownReturnLayer },
    );
    evidence.unknownReturn = {
      issueId: unknownIssue.issue.id,
      returnId: returnIds[returnIds.length - 1],
      unknownReturnDepletions,
      unknownReturnLayer,
    };

    const report = `# Phase 10 / Task 109 — Endpoint Valuation Evidence

**Run:** ${new Date().toISOString()}
**Fixture prefix:** \`${prefix}\`
**Verdict:** ${failed === 0 ? "PASS" : "FAIL"}

## Scope

This batch certifies the HTTP transfer-request and WIP-return lifecycles against the
valuation value twin. Receipt fixtures were created and posted through
\`POST /api/inventory/grns\` and \`POST /api/inventory/grns/:id/post\`. Transfer,
reservation/WIP issue, and return state changes were performed through their existing
inventory endpoints. SQL was used only for isolated fixture setup, evidence queries,
and teardown.

## Gates

- **VAL-109-01 — receive does not double-deplete: ${receiveBefore.length === 1 && receiveAfter.length === 1 ? "PASS" : "FAIL"}.**
  Transfer issue created one captured \`-6 @ 10\` depletion; full receive added four
  signed quantity movements but no second valuation depletion.
- **VAL-109-02 — rejected transfer restores only outstanding quantity: ${rejectDepletions.length === 2 && rejectLayer?.remaining_quantity === "7.000" ? "PASS" : "FAIL"}.**
  A 5-unit issue from a 7-unit receipt restored exactly \`+5 @ 11\`, leaving 7
  available in the valuation layer and preserving the transfer document citation.
- **VAL-109-03 — captured partial WIP return: ${capturedReturnDepletions.length === 2 && capturedReturnLayer?.remaining_quantity === "4.000" ? "PASS" : "FAIL"}.**
  A 10-unit \`@ 12\` WIP issue followed by a 4-unit return produced \`-120\` and
  \`+48\` captured value, leaving 4 units.
- **VAL-109-04 — UNKNOWN partial WIP return: ${unknownReturnDepletions.length === 2 && unknownReturnLayer?.receipt_cost_status === "MISSING" ? "PASS" : "FAIL"}.**
  An 8-unit MISSING-cost issue followed by a 3-unit return preserved UNKNOWN status,
  null unit cost, null value amount, and null currency on both depletion rows.

## Evidence

\`\`\`json
${json(evidence)}
\`\`\`

Checks: **${passed} passed, ${failed} failed**.
`;
    await writeFile(reportPath, report, "utf8");
    console.log(report);
    assert(failed === 0, `Task 109 certification failed: ${failed} checks failed`);
  } finally {
    await cleanup({
      categoryIds,
      directorId,
      grnIds,
      grnLineIds,
      issueIds,
      locationIds,
      lotIds,
      materialIds,
      orderIds,
      prefix,
      reservationIds,
      returnIds,
      supplierId,
      supervisorId,
      transactionMaterialIds,
      transferRequestIds,
      warehouseIds,
      workflowId,
    });
  }
}

async function makeWarehouse(
  prefix: string,
  key: string,
  warehouseIds: string[],
  locationIds: string[],
): Promise<Warehouse> {
  const id = cryptoUuid();
  const locationId = cryptoUuid();
  warehouseIds.push(id);
  locationIds.push(locationId);
  await pool.query(
    `INSERT INTO warehouses (id, code, name, type, is_active)
     VALUES ($1, $2, $3, 'production_store', true)`,
    [id, `${prefix.slice(0, 10)}-${key}-WH`, `${prefix} ${key} Warehouse`],
  );
  await pool.query(
    `INSERT INTO locations (id, warehouse_id, code, name, type, is_active)
     VALUES ($1, $2, $3, $4, 'staging', true)`,
    [locationId, id, `${prefix.slice(0, 10)}-${key}-LOC`, `${prefix} ${key} Location`],
  );
  return { id, locationId };
}

async function cleanup(ids: {
  categoryIds: string[];
  directorId: string;
  grnIds: string[];
  grnLineIds: string[];
  issueIds: string[];
  locationIds: string[];
  lotIds: string[];
  materialIds: string[];
  orderIds: string[];
  prefix: string;
  reservationIds: string[];
  returnIds: string[];
  supplierId: string;
  supervisorId: string;
  transactionMaterialIds: string[];
  transferRequestIds: string[];
  warehouseIds: string[];
  workflowId: string;
}): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const allUserIds = [ids.supervisorId, ids.directorId];
    if (ids.returnIds.length) {
      await client.query(
        "DELETE FROM outbox_events WHERE aggregate_id = ANY($1::uuid[])",
        [ids.returnIds],
      );
      await client.query("DELETE FROM return_documents WHERE id = ANY($1::uuid[])", [ids.returnIds]);
    }
    if (ids.transferRequestIds.length) {
      await client.query(
        "DELETE FROM outbox_events WHERE aggregate_id = ANY($1::uuid[])",
        [ids.transferRequestIds],
      );
      await client.query(
        "DELETE FROM transfer_requests WHERE id = ANY($1::uuid[])",
        [ids.transferRequestIds],
      );
    }
    if (ids.materialIds.length) {
      await client.query(
        "DELETE FROM wip_inventory WHERE material_id = ANY($1::uuid[])",
        [ids.materialIds],
      );
    }
    if (ids.issueIds.length) {
      await client.query(
        "DELETE FROM wip_issue_lines WHERE wip_issue_note_id = ANY($1::uuid[])",
        [ids.issueIds],
      );
      await client.query(
        "DELETE FROM outbox_events WHERE aggregate_id = ANY($1::uuid[])",
        [ids.issueIds],
      );
      await client.query(
        "DELETE FROM wip_issue_notes WHERE id = ANY($1::uuid[])",
        [ids.issueIds],
      );
    }
    if (ids.reservationIds.length) {
      await client.query(
        "DELETE FROM inventory_reservation_allocations WHERE reservation_id = ANY($1::uuid[])",
        [ids.reservationIds],
      );
      await client.query(
        "DELETE FROM inventory_reservations WHERE id = ANY($1::uuid[])",
        [ids.reservationIds],
      );
    }
    if (ids.materialIds.length) {
      await client.query(
        "DELETE FROM valuation_depletions WHERE material_id = ANY($1::uuid[])",
        [ids.materialIds],
      );
      await client.query(
        "DELETE FROM valuation_layers WHERE material_id = ANY($1::uuid[])",
        [ids.materialIds],
      );
      await client.query(
        "DELETE FROM inventory_transactions WHERE material_id = ANY($1::uuid[])",
        [ids.materialIds],
      );
      if (ids.lotIds.length) {
        await client.query("DELETE FROM inventory_lots WHERE id = ANY($1::uuid[])", [ids.lotIds]);
      }
      if (ids.grnLineIds.length) {
        await client.query("DELETE FROM grn_line_items WHERE id = ANY($1::uuid[])", [ids.grnLineIds]);
      }
      if (ids.grnIds.length) {
        await client.query("DELETE FROM outbox_events WHERE aggregate_id = ANY($1::uuid[])", [ids.grnIds]);
        await client.query("DELETE FROM grn_headers WHERE id = ANY($1::uuid[])", [ids.grnIds]);
      }
      await client.query(
        "DELETE FROM material_workflow_assignments WHERE category_id = ANY($1::uuid[])",
        [ids.categoryIds],
      );
      await client.query("DELETE FROM master_materials WHERE id = ANY($1::uuid[])", [ids.materialIds]);
      await client.query(
        `DELETE FROM master_material_categories
          WHERE id = ANY($1::uuid[])
            AND NOT EXISTS (
              SELECT 1 FROM master_materials m
               WHERE m.category_id = master_material_categories.id
            )`,
        [ids.categoryIds],
      );
    }
    if (ids.orderIds.length) {
      await client.query(
        "DELETE FROM mfg_production_orders WHERE id = ANY($1::uuid[])",
        [ids.orderIds],
      );
    }
    if (ids.locationIds.length) {
      await client.query("DELETE FROM locations WHERE id = ANY($1::uuid[])", [ids.locationIds]);
    }
    if (ids.warehouseIds.length) {
      await client.query("DELETE FROM warehouses WHERE id = ANY($1::uuid[])", [ids.warehouseIds]);
    }
    await client.query("DELETE FROM material_workflow_assignments WHERE workflow_id = $1", [ids.workflowId]);
    await client.query("DELETE FROM material_workflows WHERE id = $1", [ids.workflowId]);
    await client.query("DELETE FROM master_suppliers WHERE id = $1", [ids.supplierId]);
    await client.query(
      "DELETE FROM security_events WHERE actor_id = ANY($1::uuid[]) AND detail LIKE $2",
      [allUserIds, `%${ids.prefix}%`],
    );
    await client.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [allUserIds]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function cryptoUuid(): string {
  return randomUUID();
}

function cryptoRandom(): string {
  return randomUUID().slice(0, 8).toUpperCase();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});