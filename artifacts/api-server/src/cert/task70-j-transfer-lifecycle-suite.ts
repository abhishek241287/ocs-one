import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";

const BASE_URL = (process.env.CERT_BASE_URL ?? "http://localhost:80").replace(/\/$/, "");
const prefix = `70J-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`;
const password = `${prefix}-Certification-Password!`;
const credentials: Record<string, { email: string; password: string }> = {};
const cookies = new Map<string, string>();
const userIds: string[] = [];
const materialIds: string[] = [];
const categoryIds: string[] = [];
const supplierIds: string[] = [];
const warehouseIds: string[] = [];
const locationIds: string[] = [];
const grnIds: string[] = [];
const lineIds: string[] = [];
const lotIds: string[] = [];
const requestIds: string[] = [];
const reservationIds: string[] = [];
const productionOrderIds: string[] = [];

type Result = { status: number; json: any };
type StockFixture = {
  materialId: string;
  warehouseId: string;
  locationId: string;
  lotId: string;
  lineId: string;
};

async function sql<T extends Record<string, any> = Record<string, any>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  return (await pool.query<T>(text, params)).rows;
}

async function scalar<T = any>(text: string, params: unknown[] = []): Promise<T> {
  const rows = await sql<Record<string, T>>(text, params);
  return rows[0] ? Object.values(rows[0])[0] : (undefined as T);
}

async function jsonBody(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function call(
  role: string | null,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<Result> {
  const requestHeaders = new Headers(headers);
  const cookie = role ? cookies.get(role) : undefined;
  if (cookie) requestHeaders.set("Cookie", cookie);
  if (body !== undefined) requestHeaders.set("Content-Type", "application/json");
  const response = await fetch(`${BASE_URL}/api${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const setCookie = response.headers.get("set-cookie");
  if (role && setCookie) cookies.set(role, setCookie.split(";")[0]);
  return { status: response.status, json: await jsonBody(response) };
}

async function provisionUsers(): Promise<void> {
  const hash = await bcrypt.hash(password, 10);
  for (const role of ["director", "supervisor", "operator", "viewer"]) {
    const id = randomUUID();
    const email = `${prefix.toLowerCase()}-${role}@cert.local`;
    await pool.query(
      `INSERT INTO users (id, email, password_hash, name, role, is_active)
       VALUES ($1, $2, $3, $4, $5, true)`,
      [id, email, hash, `${prefix} ${role}`, role],
    );
    userIds.push(id);
    credentials[role] = { email, password };
  }
}

async function login(role: string): Promise<void> {
  const result = await call(role, "POST", "/auth/login", credentials[role]);
  if (result.status !== 200) throw new Error(`login failed for ${role}: HTTP ${result.status}`);
}

async function makeWarehouse(suffix: string): Promise<{ warehouseId: string; locationId: string }> {
  const warehouseId = randomUUID();
  const locationId = randomUUID();
  await pool.query(
    `INSERT INTO warehouses (id, code, name, type, is_active)
     VALUES ($1, $2, $3, 'production_store', true)`,
    [warehouseId, `${prefix.slice(0, 10)}-${suffix}-WH`, `${prefix} ${suffix} Warehouse`],
  );
  await pool.query(
    `INSERT INTO locations (id, warehouse_id, code, name, type, is_active)
     VALUES ($1, $2, $3, $4, 'staging', true)`,
    [locationId, warehouseId, `${prefix.slice(0, 10)}-${suffix}-LOC`, `${prefix} ${suffix} Location`],
  );
  warehouseIds.push(warehouseId);
  locationIds.push(locationId);
  return { warehouseId, locationId };
}

async function makeLotStock(
  suffix: string,
  quantity: number,
  warehouseId: string,
  locationId: string,
): Promise<StockFixture> {
  const categoryId = randomUUID();
  const materialId = randomUUID();
  const supplierId = supplierIds[0];
  const grnId = randomUUID();
  const lineId = randomUUID();
  const lotId = randomUUID();
  await pool.query(
    `INSERT INTO master_material_categories (id, code, name, engineering_master_required)
     VALUES ($1, $2, $3, false)`,
    [categoryId, `${prefix}-CAT-${suffix}`, `${prefix} Category ${suffix}`],
  );
  await pool.query(
    `INSERT INTO master_materials (id, code, name, category_id, uom, usage_type)
     VALUES ($1, $2, $3, $4, 'PCS', 'CONSUMABLE')`,
    [materialId, `${prefix}-MAT-${suffix}`, `${prefix} Material ${suffix}`, categoryId],
  );
  await pool.query(
    `INSERT INTO grn_headers (id, grn_number, supplier_id, received_date, status, created_by)
     VALUES ($1, $2, $3, $4, 'posted', $5)`,
    [grnId, `${prefix.slice(0, 10)}-${suffix.slice(0, 12)}-G`, supplierId, new Date().toISOString().slice(0, 10), userIds[1]],
  );
  await pool.query(
    `INSERT INTO grn_line_items
       (id, grn_id, line_number, material_id, quantity_received, uom,
        accepted_qty, put_away_qty, warehouse_id, location_id)
     VALUES ($1, $2, 1, $3, $4, 'PCS', $4, $4, $5, $6)`,
    [lineId, grnId, materialId, quantity, warehouseId, locationId],
  );
  await pool.query(
    `INSERT INTO inventory_lots
       (id, lot_number, material_id, grn_line_id, received_date, status,
        total_received_qty, remaining_qty, uom, warehouse_id, location_id)
     VALUES ($1, $2, $3, $4, $5, 'active', $6, $6, 'PCS', $7, $8)`,
    [lotId, `${prefix}-${suffix}-LOT`, materialId, lineId, new Date().toISOString().slice(0, 10), quantity, warehouseId, locationId],
  );
  await pool.query(
    `INSERT INTO inventory_transactions
       (transaction_type, material_id, quantity, uom, stock_state,
        source_document_type, source_document_id, source_line_id, lot_id,
        warehouse_id, location_id, created_by)
     VALUES ('GRN_RECEIPT', $1, $2, 'PCS', 'available', 'GRN', $3, $4, $5, $6, $7, $8)`,
    [materialId, quantity, grnId, lineId, lotId, warehouseId, locationId, userIds[1]],
  );
  categoryIds.push(categoryId);
  materialIds.push(materialId);
  grnIds.push(grnId);
  lineIds.push(lineId);
  lotIds.push(lotId);
  return { materialId, warehouseId, locationId, lotId, lineId };
}

async function makeProductionOrder(suffix: string): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO mfg_production_orders
       (id, order_number, battery_number, factory_manager, status, priority)
     VALUES ($1, $2, $3, $4, 'draft', 'medium')`,
    [id, `${prefix}-${suffix}-PO`, `${prefix}-${suffix}-BAT`, `${prefix} Manager`],
  );
  productionOrderIds.push(id);
  return id;
}

async function createRequest(
  fixtureLines: Array<{ materialId: string; lotId?: string; quantity: number; sourceLocationId?: string; sourceBinId?: string; destinationLocationId?: string; destinationBinId?: string }>,
  sourceWarehouseId: string,
  destinationWarehouseId: string,
): Promise<any> {
  const first = fixtureLines[0];
  const result = await call("supervisor", "POST", "/inventory/transfer-requests", {
    source_warehouse_id: sourceWarehouseId,
    destination_warehouse_id: destinationWarehouseId,
    notes: `${prefix} transfer request`,
    lines: fixtureLines.map((line) => ({
      material_id: line.materialId,
      quantity: line.quantity,
      lot_id: line.lotId,
      source_location_id: line.sourceLocationId ?? first.sourceLocationId,
      source_bin_id: line.sourceBinId ?? first.sourceBinId,
      destination_location_id: line.destinationLocationId ?? first.destinationLocationId,
      destination_bin_id: line.destinationBinId ?? first.destinationBinId,
    })),
  });
  if (result.status !== 201) throw new Error(`create transfer failed: ${JSON.stringify(result.json)}`);
  requestIds.push(result.json.id);
  return result.json;
}

async function approve(requestId: string): Promise<Result> {
  return call("director", "POST", `/inventory/transfer-requests/${requestId}/approve`, {});
}

async function cleanup(): Promise<void> {
  await pool.query("BEGIN");
  try {
    if (requestIds.length) {
      await pool.query("DELETE FROM outbox_events WHERE aggregate_id = ANY($1::uuid[])", [requestIds]);
      await pool.query("DELETE FROM transfer_lines WHERE transfer_request_id = ANY($1::uuid[])", [requestIds]);
      await pool.query("DELETE FROM transfer_requests WHERE id = ANY($1::uuid[])", [requestIds]);
    }
    if (reservationIds.length) {
      await pool.query(
        "DELETE FROM inventory_reservation_allocations WHERE reservation_id = ANY($1::uuid[])",
        [reservationIds],
      );
      await pool.query("DELETE FROM outbox_events WHERE aggregate_id = ANY($1::uuid[])", [reservationIds]);
      await pool.query("DELETE FROM inventory_reservations WHERE id = ANY($1::uuid[])", [reservationIds]);
    }
    if (productionOrderIds.length) {
      await pool.query("DELETE FROM mfg_production_orders WHERE id = ANY($1::uuid[])", [productionOrderIds]);
    }
    if (materialIds.length) {
      await pool.query(
        `DELETE FROM valuation_depletions
          WHERE material_id = ANY($1::uuid[])
             OR valuation_layer_id IN (
            SELECT id FROM valuation_layers WHERE material_id = ANY($1::uuid[])
          )`,
        [materialIds],
      );
      await pool.query("DELETE FROM valuation_layers WHERE material_id = ANY($1::uuid[])", [materialIds]);
      await pool.query("DELETE FROM inventory_transactions WHERE material_id = ANY($1::uuid[])", [materialIds]);
      await pool.query(
        `DELETE FROM inventory_reservation_allocations
          WHERE lot_id IN (
            SELECT id FROM inventory_lots WHERE material_id = ANY($1::uuid[])
          )`,
        [materialIds],
      );
      await pool.query("DELETE FROM inventory_lots WHERE id = ANY($1::uuid[])", [lotIds]);
      await pool.query("DELETE FROM grn_line_items WHERE id = ANY($1::uuid[])", [lineIds]);
      await pool.query("DELETE FROM grn_headers WHERE id = ANY($1::uuid[])", [grnIds]);
      await pool.query("DELETE FROM master_materials WHERE id = ANY($1::uuid[])", [materialIds]);
      await pool.query("DELETE FROM master_material_categories WHERE id = ANY($1::uuid[])", [categoryIds]);
    }
    if (userIds.length) {
      await pool.query(
        "DELETE FROM security_events WHERE actor_id = ANY($1::uuid[]) AND detail LIKE $2",
        [userIds, `%${prefix}%`],
      );
    }
    const namespaceMaterials = await pool.query<{ id: string; category_id: string | null }>(
      "SELECT id, category_id FROM master_materials WHERE code LIKE '70J-%'",
    );
    if (namespaceMaterials.rows.length) {
      const namespaceMaterialIds = namespaceMaterials.rows.map((row) => row.id);
      const namespaceCategoryIds = namespaceMaterials.rows
        .map((row) => row.category_id)
        .filter((id): id is string => Boolean(id));
      await pool.query(
        `DELETE FROM valuation_depletions
          WHERE material_id = ANY($1::uuid[])
             OR valuation_layer_id IN (
            SELECT id FROM valuation_layers WHERE material_id = ANY($1::uuid[])
          )`,
        [namespaceMaterialIds],
      );
      await pool.query("DELETE FROM valuation_layers WHERE material_id = ANY($1::uuid[])", [namespaceMaterialIds]);
      await pool.query(
        "DELETE FROM inventory_transactions WHERE material_id = ANY($1::uuid[])",
        [namespaceMaterialIds],
      );
      await pool.query(
        `DELETE FROM transfer_lines
          WHERE lot_id IN (
            SELECT id FROM inventory_lots WHERE material_id = ANY($1::uuid[])
          )`,
        [namespaceMaterialIds],
      );
      await pool.query(
        `DELETE FROM inventory_reservation_allocations
          WHERE lot_id IN (
            SELECT id FROM inventory_lots WHERE material_id = ANY($1::uuid[])
          )`,
        [namespaceMaterialIds],
      );
      await pool.query("DELETE FROM inventory_lots WHERE material_id = ANY($1::uuid[])", [namespaceMaterialIds]);
      await pool.query(
        "DELETE FROM grn_line_items WHERE material_id = ANY($1::uuid[])",
        [namespaceMaterialIds],
      );
      await pool.query(
        "DELETE FROM transfer_lines WHERE material_id = ANY($1::uuid[])",
        [namespaceMaterialIds],
      );
      await pool.query(
        `DELETE FROM inventory_reservation_allocations
          WHERE reservation_id IN (
            SELECT id FROM inventory_reservations
             WHERE material_id = ANY($1::uuid[])
          )`,
        [namespaceMaterialIds],
      );
      await pool.query(
        "DELETE FROM inventory_reservations WHERE material_id = ANY($1::uuid[])",
        [namespaceMaterialIds],
      );
      await pool.query("DELETE FROM master_materials WHERE id = ANY($1::uuid[])", [namespaceMaterialIds]);
      if (namespaceCategoryIds.length) {
        await pool.query(
          `DELETE FROM master_material_categories
           WHERE id = ANY($1::uuid[])
             AND NOT EXISTS (
               SELECT 1 FROM master_materials m WHERE m.category_id = master_material_categories.id
             )`,
          [namespaceCategoryIds],
        );
      }
    }
    if (locationIds.length) await pool.query("DELETE FROM locations WHERE id = ANY($1::uuid[])", [locationIds]);
    if (warehouseIds.length) await pool.query("DELETE FROM warehouses WHERE id = ANY($1::uuid[])", [warehouseIds]);
    if (supplierIds.length) await pool.query("DELETE FROM master_suppliers WHERE id = ANY($1::uuid[])", [supplierIds]);
    if (userIds.length) await pool.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [userIds]);
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
}

async function main(): Promise<void> {
  let passed = 0;
  let failed = 0;
  const check = (id: string, condition: boolean, detail = "") => {
    if (condition) {
      passed += 1;
      console.log(`${id}: PASS`);
    } else {
      failed += 1;
      console.log(`${id}: FAIL ${detail}`);
    }
  };

  try {
    await provisionUsers();
    const supplierId = randomUUID();
    supplierIds.push(supplierId);
    await pool.query(
      "INSERT INTO master_suppliers (id, code, name) VALUES ($1, $2, $3)",
      [supplierId, `${prefix}-SUP`, `${prefix} Supplier`],
    );
    const source = await makeWarehouse("SRC");
    const destination = await makeWarehouse("DST");
    await Promise.all(["director", "supervisor", "operator", "viewer"].map(login));

    const lotFlow = await makeLotStock("FLOW", 30, source.warehouseId, source.locationId);
    const unlotFlow = await makeLotStock("UNLOT", 20, source.warehouseId, source.locationId);
    // The second material is intentionally un-lotted at the transfer layer: its
    // receipt is represented by a warehouse-level signed ledger row.
    await pool.query("DELETE FROM inventory_transactions WHERE material_id = $1", [unlotFlow.materialId]);
    await pool.query("DELETE FROM inventory_lots WHERE id = $1", [unlotFlow.lotId]);
    lotIds.pop();
    const replacementReceipt = await pool.query<{ id: string }>(
      `INSERT INTO inventory_transactions
         (transaction_type, material_id, quantity, uom, stock_state,
          source_document_type, source_document_id, source_line_id,
          warehouse_id, location_id, created_by)
       VALUES ('GRN_RECEIPT', $1, 20, 'PCS', 'available', '70J_SEED', $2, NULL, $3, $4, $5)
       RETURNING id`,
      [unlotFlow.materialId, randomUUID(), source.warehouseId, source.locationId, userIds[1]],
    );
    await pool.query(
      `INSERT INTO valuation_layers
        (id, grn_line_id, material_id, receipt_quantity, remaining_quantity, uom,
         receipt_unit_cost, receipt_currency, receipt_cost_status, policy, receipt_movement_id)
       VALUES ($1, $2, $3, 20, 20, 'PCS', NULL, NULL, 'MISSING', 'FIFO', $4)`,
      [randomUUID(), unlotFlow.lineId, unlotFlow.materialId, replacementReceipt.rows[0].id],
    );

    const flow = await createRequest(
      [
        {
          materialId: lotFlow.materialId,
          lotId: lotFlow.lotId,
          quantity: 30,
          sourceLocationId: source.locationId,
          destinationLocationId: destination.locationId,
        },
        {
          materialId: unlotFlow.materialId,
          quantity: 20,
          sourceLocationId: source.locationId,
          destinationLocationId: destination.locationId,
        },
      ],
      source.warehouseId,
      destination.warehouseId,
    );
    const approveDenied = await call("supervisor", "POST", `/inventory/transfer-requests/${flow.id}/approve`, {});
    const approved = await approve(flow.id);
    const issued = await call("supervisor", "POST", `/inventory/transfer-requests/${flow.id}/issue`, {});
    const issueRows = await sql(
      `SELECT stock_state, transaction_type, quantity::text AS quantity, lot_id, source_line_id
         FROM inventory_transactions WHERE source_document_id = $1 ORDER BY stock_state, quantity`,
      [flow.id],
    );
    check(
      "70J-01",
      approveDenied.status === 403 &&
        approved.status === 200 &&
        issued.status === 200 &&
        issued.json.status === "in_transit" &&
        issueRows.length === 4 &&
        issueRows.filter((row) => row.stock_state === "available" && Number(row.quantity) < 0).length === 2 &&
        issueRows.filter((row) => row.stock_state === "in_transit" && Number(row.quantity) > 0).length === 2,
      JSON.stringify({ approveDenied: approveDenied.status, approved: approved.status, issued: issued.status, issueRows }),
    );

    const flowLineLot = flow.lines.find((line: any) => line.lot_id === lotFlow.lotId);
    const partial = await call("supervisor", "POST", `/inventory/transfer-requests/${flow.id}/receive`, {
      lines: [{ line_id: flowLineLot.id, quantity: 10 }],
    });
    const partialLine = partial.json?.lines?.find((line: any) => line.id === flowLineLot.id);
    check(
      "70J-02",
      partial.status === 200 &&
        partial.json.status === "in_transit" &&
        partialLine?.status === "partially_received" &&
        Number(partialLine.received_qty) === 10,
      JSON.stringify(partial.json),
    );

    const flowLineUnlot = flow.lines.find((line: any) => line.lot_id === null);
    const completed = await call("supervisor", "POST", `/inventory/transfer-requests/${flow.id}/receive`, {
      lines: [
        { line_id: flowLineLot.id, quantity: 20 },
        { line_id: flowLineUnlot.id, quantity: 20 },
      ],
    });
    const reconciled = await call("supervisor", "POST", `/inventory/transfer-requests/${flow.id}/reconcile`, {});
    const conservation = await scalar<string>(
      `SELECT count(*) FROM transfer_lines l
        WHERE l.transfer_request_id = $1 AND l.issued_qty::numeric > 0
          AND l.issued_qty::numeric <> l.received_qty::numeric +
            (SELECT coalesce(sum(it.quantity), 0)::numeric
               FROM inventory_transactions it
              WHERE it.source_document_type = 'transfer_request'
                AND it.source_document_id = l.transfer_request_id
                AND it.stock_state = 'in_transit'
                AND ((l.lot_id IS NULL AND it.source_line_id IS NULL)
                  OR (l.lot_id IS NOT NULL AND it.source_line_id = $2)))`,
      [flow.id, lotFlow.lineId],
    );
    check(
      "70J-03",
      completed.status === 200 &&
        completed.json.status === "received" &&
        reconciled.status === 200 &&
        reconciled.json.status === "reconciled" &&
        Number(conservation) === 0,
      JSON.stringify({ completed: completed.status, reconciled: reconciled.status, conservation }),
    );

    const cancelDraft = await createRequest(
      [{ materialId: lotFlow.materialId, lotId: lotFlow.lotId, quantity: 1, sourceLocationId: source.locationId, destinationLocationId: destination.locationId }],
      source.warehouseId,
      destination.warehouseId,
    );
    const cancelledDraft = await call("supervisor", "POST", `/inventory/transfer-requests/${cancelDraft.id}/cancel`, {});
    const cancelApproved = await createRequest(
      [{ materialId: lotFlow.materialId, lotId: lotFlow.lotId, quantity: 1, sourceLocationId: source.locationId, destinationLocationId: destination.locationId }],
      source.warehouseId,
      destination.warehouseId,
    );
    await approve(cancelApproved.id);
    const cancelledApproved = await call("supervisor", "POST", `/inventory/transfer-requests/${cancelApproved.id}/cancel`, {});
    const cancelRows = await scalar<string>(
      "SELECT count(*) FROM inventory_transactions WHERE source_document_id = ANY($1::uuid[])",
      [[cancelDraft.id, cancelApproved.id]],
    );
    check(
      "70J-04",
      cancelledDraft.status === 200 &&
        cancelledDraft.json.status === "cancelled" &&
        cancelledApproved.status === 200 &&
        cancelledApproved.json.status === "cancelled" &&
        Number(cancelRows) === 0,
      JSON.stringify({ draft: cancelledDraft.status, approved: cancelledApproved.status, rows: cancelRows }),
    );

    const rejectFixture = await makeLotStock("REJECT", 12, source.warehouseId, source.locationId);
    const rejectRequest = await createRequest(
      [{ materialId: rejectFixture.materialId, lotId: rejectFixture.lotId, quantity: 12, sourceLocationId: source.locationId, destinationLocationId: destination.locationId }],
      source.warehouseId,
      destination.warehouseId,
    );
    await approve(rejectRequest.id);
    await call("supervisor", "POST", `/inventory/transfer-requests/${rejectRequest.id}/issue`, {});
    const cancelInTransit = await call("supervisor", "POST", `/inventory/transfer-requests/${rejectRequest.id}/cancel`, {});
    const rejected = await call("supervisor", "POST", `/inventory/transfer-requests/${rejectRequest.id}/reject`, {
      reason: `${prefix} no longer required`,
    });
    const rejectionRows = await sql(
      `SELECT transaction_type, stock_state, quantity::text AS quantity
         FROM inventory_transactions WHERE source_document_id = $1 ORDER BY transaction_type, stock_state`,
      [rejectRequest.id],
    );
    const sourceAfterReject = await scalar<string>(
      `SELECT coalesce(sum(quantity), 0) FROM inventory_transactions
        WHERE material_id = $1 AND warehouse_id = $2 AND stock_state = 'available'`,
      [rejectFixture.materialId, source.warehouseId],
    );
    check(
      "70J-05",
      cancelInTransit.status === 409 &&
        rejected.status === 200 &&
        rejected.json.status === "rejected" &&
        rejectionRows.length === 4 &&
        rejectionRows.filter((row) => row.transaction_type === "TRANSFER_REVERSAL").length === 2 &&
        Number(sourceAfterReject) === 12,
      JSON.stringify({ cancelInTransit: cancelInTransit.status, rejected: rejected.status, rows: rejectionRows, sourceAfterReject }),
    );

    const partialRejectFixture = await makeLotStock("PARTIAL", 10, source.warehouseId, source.locationId);
    const partialRejectRequest = await createRequest(
      [{ materialId: partialRejectFixture.materialId, lotId: partialRejectFixture.lotId, quantity: 10, sourceLocationId: source.locationId, destinationLocationId: destination.locationId }],
      source.warehouseId,
      destination.warehouseId,
    );
    await approve(partialRejectRequest.id);
    await call("supervisor", "POST", `/inventory/transfer-requests/${partialRejectRequest.id}/issue`, {});
    const partialRejectLine = partialRejectRequest.lines[0];
    const receivedFour = await call("supervisor", "POST", `/inventory/transfer-requests/${partialRejectRequest.id}/receive`, {
      lines: [{ line_id: partialRejectLine.id, quantity: 4 }],
    });
    const beforePartialReject = await scalar<string>(
      "SELECT count(*) FROM inventory_transactions WHERE source_document_id = $1",
      [partialRejectRequest.id],
    );
    const rejectAfterReceive = await call("supervisor", "POST", `/inventory/transfer-requests/${partialRejectRequest.id}/reject`, {
      reason: `${prefix} partial reject`,
    });
    const overReceive = await call("supervisor", "POST", `/inventory/transfer-requests/${partialRejectRequest.id}/receive`, {
      lines: [{ line_id: partialRejectLine.id, quantity: 7 }],
    });
    const afterPartialReject = await scalar<string>(
      "SELECT count(*) FROM inventory_transactions WHERE source_document_id = $1",
      [partialRejectRequest.id],
    );
    check(
      "70J-06",
      receivedFour.status === 200 &&
        rejectAfterReceive.status === 409 &&
        overReceive.status === 409 &&
        Number(beforePartialReject) === Number(afterPartialReject),
      JSON.stringify({ receivedFour: receivedFour.status, rejectAfterReceive: rejectAfterReceive.status, overReceive: overReceive.status }),
    );

    const insufficientFixture = await makeLotStock("INSUFF", 5, source.warehouseId, source.locationId);
    const insufficientRequest = await createRequest(
      [{ materialId: insufficientFixture.materialId, lotId: insufficientFixture.lotId, quantity: 6, sourceLocationId: source.locationId, destinationLocationId: destination.locationId }],
      source.warehouseId,
      destination.warehouseId,
    );
    await approve(insufficientRequest.id);
    const insufficientBefore = await scalar<string>(
      "SELECT count(*) FROM inventory_transactions WHERE source_document_id = $1",
      [insufficientRequest.id],
    );
    const insufficientIssue = await call("supervisor", "POST", `/inventory/transfer-requests/${insufficientRequest.id}/issue`, {});
    const insufficientAfter = await scalar<string>(
      "SELECT count(*) FROM inventory_transactions WHERE source_document_id = $1",
      [insufficientRequest.id],
    );
    check(
      "70J-07",
      insufficientIssue.status === 409 &&
        insufficientIssue.json?.error === "INSUFFICIENT_STOCK_AT_SOURCE" &&
        Number(insufficientBefore) === 0 &&
        Number(insufficientAfter) === 0,
      JSON.stringify(insufficientIssue.json),
    );

    const idemIssueFixture = await makeLotStock("IDEMISSUE", 10, source.warehouseId, source.locationId);
    const idemIssueRequest = await createRequest(
      [{ materialId: idemIssueFixture.materialId, lotId: idemIssueFixture.lotId, quantity: 10, sourceLocationId: source.locationId, destinationLocationId: destination.locationId }],
      source.warehouseId,
      destination.warehouseId,
    );
    await approve(idemIssueRequest.id);
    const issueIdemKey = `${prefix}-ISSUE-IDEM`;
    const issueIdemResults = await Promise.all([
      call("supervisor", "POST", `/inventory/transfer-requests/${idemIssueRequest.id}/issue`, {}, { "Idempotency-Key": issueIdemKey }),
      call("supervisor", "POST", `/inventory/transfer-requests/${idemIssueRequest.id}/issue`, {}, { "Idempotency-Key": issueIdemKey }),
    ]);
    const issueIdemRows = await scalar<string>(
      "SELECT count(*) FROM inventory_transactions WHERE source_document_id = $1",
      [idemIssueRequest.id],
    );
    const issueIdemOutbox = await scalar<string>(
      "SELECT count(*) FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'TRANSFER_ISSUED'",
      [idemIssueRequest.id],
    );
    check(
      "70J-08",
      issueIdemResults.every((result) => result.status === 200) &&
        Number(issueIdemRows) === 2 &&
        Number(issueIdemOutbox) === 1,
      JSON.stringify({ statuses: issueIdemResults.map((result) => result.status), rows: issueIdemRows, outbox: issueIdemOutbox }),
    );

    const idemReceive = await call("supervisor", "POST", `/inventory/transfer-requests/${idemIssueRequest.id}/receive`, {
      lines: [{ line_id: idemIssueRequest.lines[0].id, quantity: 10 }],
    }, { "Idempotency-Key": `${prefix}-RECEIVE-IDEM-SETUP` });
    const receiveIdemFixture = await makeLotStock("IDEMRECEIVE", 10, source.warehouseId, source.locationId);
    const receiveIdemRequest = await createRequest(
      [{ materialId: receiveIdemFixture.materialId, lotId: receiveIdemFixture.lotId, quantity: 10, sourceLocationId: source.locationId, destinationLocationId: destination.locationId }],
      source.warehouseId,
      destination.warehouseId,
    );
    await approve(receiveIdemRequest.id);
    await call("supervisor", "POST", `/inventory/transfer-requests/${receiveIdemRequest.id}/issue`, {});
    const receiveIdemKey = `${prefix}-RECEIVE-IDEM`;
    const receiveIdemResults = await Promise.all([
      call("supervisor", "POST", `/inventory/transfer-requests/${receiveIdemRequest.id}/receive`, { lines: [{ line_id: receiveIdemRequest.lines[0].id, quantity: 10 }] }, { "Idempotency-Key": receiveIdemKey }),
      call("supervisor", "POST", `/inventory/transfer-requests/${receiveIdemRequest.id}/receive`, { lines: [{ line_id: receiveIdemRequest.lines[0].id, quantity: 10 }] }, { "Idempotency-Key": receiveIdemKey }),
    ]);
    const receiveIdemRows = await scalar<string>(
      "SELECT count(*) FROM inventory_transactions WHERE source_document_id = $1",
      [receiveIdemRequest.id],
    );
    const receiveIdemOutbox = await scalar<string>(
      "SELECT count(*) FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'TRANSFER_RECEIVED'",
      [receiveIdemRequest.id],
    );
    check(
      "70J-09",
      idemReceive.status === 200 &&
        receiveIdemResults.every((result) => result.status === 200) &&
        Number(receiveIdemRows) === 4 &&
        Number(receiveIdemOutbox) === 1,
      JSON.stringify({ setup: idemReceive.status, statuses: receiveIdemResults.map((result) => result.status), rows: receiveIdemRows, outbox: receiveIdemOutbox }),
    );

    const overlapFixture = await makeLotStock("OVERLAP", 20, source.warehouseId, source.locationId);
    const productionOrderId = await makeProductionOrder("OVERLAP");
    const reservation = await call("supervisor", "POST", "/inventory/reservations", {
      production_order_id: productionOrderId,
      material_id: overlapFixture.materialId,
      quantity: 10,
    });
    reservationIds.push(reservation.json.id);
    const overlapRequest = await createRequest(
      [{ materialId: overlapFixture.materialId, lotId: overlapFixture.lotId, quantity: 10, sourceLocationId: source.locationId, destinationLocationId: destination.locationId }],
      source.warehouseId,
      destination.warehouseId,
    );
    await approve(overlapRequest.id);
    const overlapResults = await Promise.all([
      call("supervisor", "POST", `/inventory/transfer-requests/${overlapRequest.id}/issue`, {}),
      call("supervisor", "POST", `/inventory/reservations/${reservation.json.id}/allocate`, { lot_id: overlapFixture.lotId, quantity: 10, strategy: "FIFO" }),
    ]);
    const overlapAvailable = await scalar<string>(
      `SELECT coalesce(sum(quantity), 0) FROM inventory_transactions
        WHERE material_id = $1 AND warehouse_id = $2 AND stock_state = 'available'`,
      [overlapFixture.materialId, source.warehouseId],
    );
    check(
      "70J-10",
      overlapResults[0].status === 200 &&
        overlapResults[1].status === 200 &&
        Number(overlapAvailable) >= 0,
      JSON.stringify({ statuses: overlapResults.map((result) => result.status), overlapAvailable }),
    );

    const authRequest = await createRequest(
      [{ materialId: lotFlow.materialId, lotId: lotFlow.lotId, quantity: 1, sourceLocationId: source.locationId, destinationLocationId: destination.locationId }],
      source.warehouseId,
      destination.warehouseId,
    );
    const authChecks = await Promise.all([
      call("supervisor", "POST", `/inventory/transfer-requests/${authRequest.id}/approve`, {}),
      call("operator", "POST", `/inventory/transfer-requests/${authRequest.id}/issue`, {}),
      call("viewer", "POST", `/inventory/transfer-requests/${authRequest.id}/cancel`, {}),
      call("viewer", "GET", "/inventory/transfer-requests"),
      call(null, "GET", "/inventory/transfer-requests"),
    ]);
    check(
      "70J-11",
      authChecks[0].status === 403 &&
        authChecks[1].status === 403 &&
        authChecks[2].status === 403 &&
        authChecks[3].status === 200 &&
        authChecks[4].status === 401,
      JSON.stringify(authChecks.map((result) => result.status)),
    );

    const invariant = await scalar<string>(
      `SELECT count(*) FROM (
        SELECT l.transfer_request_id, l.id,
               l.issued_qty::numeric AS issued,
               l.received_qty::numeric AS received,
               coalesce((
                 SELECT sum(it.quantity)::numeric
                   FROM inventory_transactions it
                  WHERE it.source_document_type = 'transfer_request'
                    AND it.source_document_id = l.transfer_request_id
                    AND it.stock_state = 'in_transit'
                    AND ((l.lot_id IS NULL AND it.source_line_id IS NULL)
                      OR (l.lot_id IS NOT NULL AND it.source_line_id = (
                        SELECT il.grn_line_id FROM inventory_lots il WHERE il.id = l.lot_id
                      )))
               ), 0) AS in_transit
          FROM transfer_lines l
          JOIN transfer_requests tr ON tr.id = l.transfer_request_id
         WHERE l.transfer_request_id = ANY($1::uuid[])
           AND tr.status NOT IN ('rejected', 'cancelled')
           AND l.issued_qty::numeric > 0
      ) x WHERE issued <> received + in_transit`,
      [requestIds],
    );
    const negativeBalances = await scalar<string>(
      `SELECT count(*) FROM (
        SELECT material_id, warehouse_id, stock_state, sum(quantity) AS balance
          FROM inventory_transactions
         WHERE material_id = ANY($1::uuid[])
           AND stock_state IN ('available', 'in_transit')
         GROUP BY material_id, warehouse_id, stock_state
        HAVING sum(quantity) < 0
      ) x`,
      [materialIds],
    );
    check(
      "70J-12",
      Number(invariant) === 0 && Number(negativeBalances) === 0,
      JSON.stringify({ invariant, negativeBalances }),
    );
  } finally {
    await cleanup();
  }

  const residue = await sql<Record<string, string>>(
    `SELECT
       (SELECT count(*)::text FROM users WHERE email LIKE $1) AS users,
       (SELECT count(*)::text FROM master_materials WHERE code LIKE $2) AS materials,
       (SELECT count(*)::text FROM master_material_categories WHERE code LIKE $2) AS categories,
       (SELECT count(*)::text FROM transfer_requests WHERE transfer_number LIKE $3) AS requests,
       (SELECT count(*)::text FROM inventory_transactions it
          WHERE it.source_document_type = 'transfer_request'
            AND it.source_document_id IN (
              SELECT id FROM transfer_requests WHERE transfer_number LIKE $3
            )) AS ledger_rows`,
    [`${prefix.toLowerCase()}-%@cert.local`, "70J-%", `${prefix}-%`],
  );
  const zeroResidue = Object.values(residue[0] ?? {}).every((value) => Number(value) === 0);
  console.log(`70J-RESIDUE: ${zeroResidue ? "PASS" : "FAIL"} ${JSON.stringify(residue[0])}`);
  console.log(`70J TOTAL: ${passed} PASS / ${failed} FAIL`);
  if (failed > 0 || !zeroResidue) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error("70-J certification crashed:", error);
  try {
    await cleanup();
  } catch (cleanupError) {
    console.error("70-J cleanup failed:", cleanupError);
  }
  process.exitCode = 1;
});