#!/usr/bin/env tsx
/**
 * FK-01..FK-14 — Phase 5 cross-domain and concurrency certification gate.
 *
 * The runner creates isolated development-only fixtures, exercises the public
 * API, checks the signed ledger directly, and removes every fixture in finally.
 */

import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";

const BASE_URL = (
  process.env.OCS_URL ??
  process.env.CERT_BASE_URL ??
  "http://localhost:80"
).replace(/\/$/, "");
const prefix = `P5-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`;
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
const orderIds: string[] = [];
const reservationIds: string[] = [];
const noteIds: string[] = [];
const confirmationIds: string[] = [];
const returnIds: string[] = [];
const scrapIds: string[] = [];
const adjustmentIds: string[] = [];
const transferIds: string[] = [];

type ApiResult = { status: number; json: any; headers: Headers };
type Stock = {
  materialId: string;
  lotId: string;
  lineId: string;
  warehouseId: string;
  locationId: string;
};
type WipFixture = Stock & { orderId: string; reservationId: string; noteId: string };

async function rows<T extends Record<string, any> = Record<string, any>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  return (await pool.query<T>(text, params)).rows;
}

async function scalar<T = any>(text: string, params: unknown[] = []): Promise<T> {
  const result = await rows<Record<string, T>>(text, params);
  return result[0] ? Object.values(result[0])[0] : (undefined as T);
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

async function call(
  role: string | null,
  method: string,
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<ApiResult> {
  const headers = new Headers(extraHeaders);
  const cookie = role ? cookies.get(role) : undefined;
  if (cookie) headers.set("Cookie", cookie);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  const response = await fetch(`${BASE_URL}/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const setCookie = response.headers.get("set-cookie");
  if (role && setCookie) cookies.set(role, setCookie.split(";")[0]);
  return { status: response.status, json: await bodyOf(response), headers: response.headers };
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
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await call(role, "POST", "/auth/login", credentials[role]);
    if (result.status === 200) return;
    if (result.status !== 429) {
      throw new Error(`login failed for ${role}: HTTP ${result.status} ${JSON.stringify(result.json)}`);
    }
    const retry = Number(result.headers.get("ratelimit-reset") ?? result.headers.get("retry-after"));
    await new Promise((resolve) => setTimeout(resolve, Math.min(Number.isFinite(retry) && retry > 0 ? retry * 1000 + 500 : 2_000, 65_000)));
  }
  throw new Error(`login failed for ${role}: persistent HTTP 429`);
}

async function makeWarehouse(suffix: string): Promise<{ warehouseId: string; locationId: string }> {
  const warehouseId = randomUUID();
  const locationId = randomUUID();
  await pool.query(
    `INSERT INTO warehouses (id, code, name, type, is_active)
     VALUES ($1, $2, $3, 'production_store', true)`,
    [warehouseId, `${prefix.slice(0, 12)}-${suffix}-WH`, `${prefix} ${suffix} Warehouse`],
  );
  await pool.query(
    `INSERT INTO locations (id, warehouse_id, code, name, type, is_active)
     VALUES ($1, $2, $3, $4, 'staging', true)`,
    [locationId, warehouseId, `${prefix.slice(0, 12)}-${suffix}-LOC`, `${prefix} ${suffix} Location`],
  );
  warehouseIds.push(warehouseId);
  locationIds.push(locationId);
  return { warehouseId, locationId };
}

async function makeStock(
  suffix: string,
  quantity: number,
  warehouseId: string,
  locationId: string,
): Promise<Stock> {
  const categoryId = randomUUID();
  const materialId = randomUUID();
  const supplierId = supplierIds[0];
  const grnId = randomUUID();
  const lineId = randomUUID();
  const lotId = randomUUID();
  const receivedDate = "2026-09-12";
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
    [grnId, `${prefix.slice(0, 12)}-${suffix}-GRN`, supplierId, receivedDate, userIds[1]],
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
    [lotId, `${prefix}-${suffix}-LOT`, materialId, lineId, receivedDate, quantity, warehouseId, locationId],
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
  return { materialId, lotId, lineId, warehouseId, locationId };
}

async function makeOrder(suffix: string): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO mfg_production_orders
       (id, order_number, battery_number, factory_manager, status, priority)
     VALUES ($1, $2, $3, $4, 'draft', 'medium')`,
    [id, `${prefix}-${suffix}-PO`, `${prefix}-${suffix}-BAT`, `${prefix} Manager`],
  );
  orderIds.push(id);
  return id;
}

async function issueWip(suffix: string, quantity: number): Promise<WipFixture> {
  const source = await makeWarehouse(`S${suffix}`);
  const stock = await makeStock(suffix, quantity, source.warehouseId, source.locationId);
  const orderId = await makeOrder(suffix);
  const reservation = await call("supervisor", "POST", "/inventory/reservations", {
    production_order_id: orderId,
    material_id: stock.materialId,
    quantity,
  });
  if (reservation.status !== 201) throw new Error(`reservation failed: ${JSON.stringify(reservation.json)}`);
  reservationIds.push(reservation.json.id);
  const allocation = await call("supervisor", "POST", `/inventory/reservations/${reservation.json.id}/allocate`, {
    lot_id: stock.lotId,
    quantity,
    strategy: "FIFO",
  });
  if (allocation.status !== 200) throw new Error(`allocation failed: ${JSON.stringify(allocation.json)}`);
  const issue = await call("supervisor", "POST", `/inventory/reservations/${reservation.json.id}/issue`, {
    quantity,
    lot_id: stock.lotId,
  });
  if (issue.status !== 201) throw new Error(`issue failed: ${JSON.stringify(issue.json)}`);
  noteIds.push(issue.json.id);
  return { ...stock, orderId, reservationId: reservation.json.id, noteId: issue.json.id };
}

async function createTransfer(
  stock: Stock,
  destinationWarehouseId: string,
  destinationLocationId?: string,
  quantity = 1,
): Promise<any> {
  const result = await call("supervisor", "POST", "/inventory/transfer-requests", {
    source_warehouse_id: stock.warehouseId,
    destination_warehouse_id: destinationWarehouseId,
    lines: [{
      material_id: stock.materialId,
      lot_id: stock.lotId,
       quantity,
      source_location_id: stock.locationId,
       ...(destinationLocationId ? { destination_location_id: destinationLocationId } : {}),
    }],
  });
  if (result.status !== 201) throw new Error(`transfer create failed: ${JSON.stringify(result.json)}`);
  transferIds.push(result.json.id);
  const approved = await call("director", "POST", `/inventory/transfer-requests/${result.json.id}/approve`, {});
  if (approved.status !== 200) throw new Error(`transfer approve failed: ${JSON.stringify(approved.json)}`);
  return result.json;
}

async function postReturn(
  fixture: WipFixture,
  quantity: number,
  warehouseId: string,
  destinationLocationId?: string,
  key?: string,
): Promise<ApiResult> {
  const created = await call("supervisor", "POST", "/inventory/returns", {
    production_order_id: fixture.orderId,
    material_id: fixture.materialId,
    wip_issue_note_id: fixture.noteId,
    destination_warehouse_id: warehouseId,
    ...(destinationLocationId ? { destination_location_id: destinationLocationId } : {}),
    lot_id: fixture.lotId,
    quantity,
    reason: `${prefix} return`,
  });
  if (created.status !== 201) throw new Error(`return create failed: ${JSON.stringify(created.json)}`);
  returnIds.push(created.json.id);
  const approved = await call("director", "POST", `/inventory/returns/${created.json.id}/approve`, {});
  if (approved.status !== 200) throw new Error(`return approve failed: ${JSON.stringify(approved.json)}`);
  return call("supervisor", "POST", `/inventory/returns/${created.json.id}/post`, {}, key ? { "Idempotency-Key": key } : {});
}

async function postScrap(fixture: WipFixture, quantity: number, key?: string): Promise<ApiResult> {
  const created = await call("supervisor", "POST", "/inventory/scrap", {
    production_order_id: fixture.orderId,
    material_id: fixture.materialId,
    lot_id: fixture.lotId,
    quantity,
    reason: `${prefix} scrap`,
  });
  if (created.status !== 201) throw new Error(`scrap create failed: ${JSON.stringify(created.json)}`);
  scrapIds.push(created.json.id);
  const approved = await call("director", "POST", `/inventory/scrap/${created.json.id}/approve`, {});
  if (approved.status !== 200) throw new Error(`scrap approve failed: ${JSON.stringify(approved.json)}`);
  return call("supervisor", "POST", `/inventory/scrap/${created.json.id}/post`, {}, key ? { "Idempotency-Key": key } : {});
}

async function createConfirmation(
  fixture: WipFixture,
  actualQty: number,
  plannedQty = actualQty,
): Promise<any> {
  const result = await call("supervisor", "POST", "/inventory/consumptions", {
    production_order_id: fixture.orderId,
    material_id: fixture.materialId,
    planned_qty: plannedQty,
    actual_qty: actualQty,
    lot_id: fixture.lotId,
    reason: `${prefix} consumption`,
  });
  if (result.status !== 201) throw new Error(`consumption create failed: ${JSON.stringify(result.json)}`);
  confirmationIds.push(result.json.id);
  return result.json;
}

async function postAdjustment(
  fixture: Stock,
  quantity: number,
  type: "positive" | "negative" = "negative",
  key?: string,
): Promise<ApiResult> {
  const created = await call("supervisor", "POST", "/inventory/adjustments", {
    type,
    material_id: fixture.materialId,
    lot_id: fixture.lotId,
    warehouse_id: fixture.warehouseId,
    quantity,
    reason: `${prefix} adjustment`,
  });
  if (created.status !== 201) throw new Error(`adjustment create failed: ${JSON.stringify(created.json)}`);
  adjustmentIds.push(created.json.id);
  const submitted = await call("supervisor", "POST", `/inventory/adjustments/${created.json.id}/submit`, {});
  if (submitted.status !== 200) throw new Error(`adjustment submit failed: ${JSON.stringify(submitted.json)}`);
  const approved = await call("director", "POST", `/inventory/adjustments/${created.json.id}/approve`, {});
  if (approved.status !== 200) throw new Error(`adjustment approve failed: ${JSON.stringify(approved.json)}`);
  return call("supervisor", "POST", `/inventory/adjustments/${created.json.id}/post`, {}, key ? { "Idempotency-Key": key } : {});
}

async function wipRemaining(fixture: WipFixture): Promise<number> {
  return Number(await scalar(
    "SELECT coalesce(sum(remaining_qty), 0) FROM wip_inventory WHERE wip_issue_note_id = $1",
    [fixture.noteId],
  ));
}

async function stockBalance(fixture: Stock, state: string, warehouseId?: string): Promise<number> {
  return Number(await scalar(
    `SELECT coalesce(sum(quantity), 0) FROM inventory_transactions
     WHERE material_id = $1 AND stock_state = $2
       AND ($3::uuid IS NULL OR warehouse_id = $3)`,
    [fixture.materialId, state, warehouseId ?? null],
  ));
}

async function cleanup(): Promise<void> {
  await pool.query("BEGIN");
  try {
    const docs = [...returnIds, ...scrapIds, ...adjustmentIds, ...transferIds, ...confirmationIds, ...noteIds];
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
    }
    if (docs.length) {
      await pool.query("DELETE FROM outbox_events WHERE aggregate_id = ANY($1::uuid[])", [docs]);
      await pool.query("DELETE FROM inventory_transactions WHERE source_document_id = ANY($1::uuid[])", [docs]);
    }
    if (returnIds.length) await pool.query("DELETE FROM return_documents WHERE id = ANY($1::uuid[])", [returnIds]);
    if (scrapIds.length) await pool.query("DELETE FROM scrap_documents WHERE id = ANY($1::uuid[])", [scrapIds]);
    if (adjustmentIds.length) await pool.query("DELETE FROM inventory_adjustments WHERE id = ANY($1::uuid[])", [adjustmentIds]);
    if (confirmationIds.length) await pool.query("DELETE FROM consumption_confirmations WHERE id = ANY($1::uuid[])", [confirmationIds]);
    if (noteIds.length) {
      await pool.query("DELETE FROM wip_inventory WHERE wip_issue_note_id = ANY($1::uuid[])", [noteIds]);
      await pool.query("DELETE FROM wip_issue_lines WHERE wip_issue_note_id = ANY($1::uuid[])", [noteIds]);
      await pool.query("DELETE FROM wip_issue_notes WHERE id = ANY($1::uuid[])", [noteIds]);
    }
    if (transferIds.length) {
      await pool.query("DELETE FROM transfer_lines WHERE transfer_request_id = ANY($1::uuid[])", [transferIds]);
      await pool.query("DELETE FROM transfer_requests WHERE id = ANY($1::uuid[])", [transferIds]);
    }
    if (reservationIds.length) {
      await pool.query("DELETE FROM inventory_reservation_allocations WHERE reservation_id = ANY($1::uuid[])", [reservationIds]);
      await pool.query("DELETE FROM inventory_reservations WHERE id = ANY($1::uuid[])", [reservationIds]);
    }
    if (materialIds.length) await pool.query("DELETE FROM inventory_transactions WHERE material_id = ANY($1::uuid[])", [materialIds]);
    if (orderIds.length) await pool.query("DELETE FROM mfg_production_orders WHERE id = ANY($1::uuid[])", [orderIds]);
    if (lotIds.length) await pool.query("DELETE FROM inventory_lots WHERE id = ANY($1::uuid[])", [lotIds]);
    if (lineIds.length) await pool.query("DELETE FROM grn_line_items WHERE id = ANY($1::uuid[])", [lineIds]);
    if (grnIds.length) await pool.query("DELETE FROM grn_headers WHERE id = ANY($1::uuid[])", [grnIds]);
    if (materialIds.length) await pool.query("DELETE FROM master_materials WHERE id = ANY($1::uuid[])", [materialIds]);
    if (categoryIds.length) await pool.query("DELETE FROM master_material_categories WHERE id = ANY($1::uuid[])", [categoryIds]);
    // Login and authorization events do not all carry the fixture prefix in
    // their detail. The actor IDs are temporary and are the safe cleanup key.
    if (userIds.length) await pool.query("DELETE FROM security_events WHERE actor_id = ANY($1::uuid[])", [userIds]);
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
    await pool.query("INSERT INTO master_suppliers (id, code, name) VALUES ($1, $2, $3)", [
      supplierId,
      `${prefix}-SUP`,
      `${prefix} Supplier`,
    ]);
    const source = await makeWarehouse("SRC");
    const destination = await makeWarehouse("DST");
    await Promise.all(["director", "supervisor", "operator", "viewer"].map(login));

    const fk01 = await issueWip("01", 40);
    const confirmed = await createConfirmation(fk01, 10, 40);
    const confirmation = await call("supervisor", "POST", `/inventory/consumptions/${confirmed.id}/confirm`, {});
    const returned = await postReturn(fk01, 8, source.warehouseId);
    const scrapped = await postScrap(fk01, 6);
    check(
      "FK-01",
      confirmation.status === 200 &&
        returned.status === 200 &&
        scrapped.status === 200 &&
        (await wipRemaining(fk01)) === 16 &&
        (await stockBalance(fk01, "available")) === 8 &&
        (await stockBalance(fk01, "scrapped")) === 6,
      JSON.stringify({ confirmation: confirmation.status, returned: returned.status, scrapped: scrapped.status }),
    );

    const fk02 = await issueWip("02", 8);
    const returned02 = await postReturn(fk02, 8, fk02.warehouseId, fk02.locationId);
    const transfer02 = await createTransfer(fk02, destination.warehouseId, destination.locationId);
    const issued02 = await call("supervisor", "POST", `/inventory/transfer-requests/${transfer02.id}/issue`, {});
    const received02 = await call("supervisor", "POST", `/inventory/transfer-requests/${transfer02.id}/receive`, {
      lines: [{ line_id: transfer02.lines[0].id, quantity: 1 }],
    });
    check("FK-02", returned02.status === 200 && issued02.status === 200 && received02.status === 200, JSON.stringify({ returned02: returned02.status, issued02: issued02.status, received02: received02.status }));

    const fk03 = await makeStock("03", 10, source.warehouseId, source.locationId);
    const transfer03 = await createTransfer(fk03, destination.warehouseId);
    const issued03 = await call("supervisor", "POST", `/inventory/transfer-requests/${transfer03.id}/issue`, {});
    const received03 = await call("supervisor", "POST", `/inventory/transfer-requests/${transfer03.id}/receive`, { lines: [{ line_id: transfer03.lines[0].id, quantity: 1 }] });
    const destinationStock = { ...fk03, warehouseId: destination.warehouseId };
    const adjusted03 = await postAdjustment(destinationStock, 1, "negative");
    check("FK-03", issued03.status === 200 && received03.status === 200 && adjusted03.status === 200, JSON.stringify({ issued03: issued03.status, received03: received03.status, adjusted03: adjusted03.status }));

    const fk04 = await issueWip("04", 5);
    const beforeReservation = await scalar<string>("SELECT issued_qty::text FROM inventory_reservations WHERE id = $1", [fk04.reservationId]);
    const scrap04 = await postScrap(fk04, 2);
    const afterReservation = await scalar<string>("SELECT issued_qty::text FROM inventory_reservations WHERE id = $1", [fk04.reservationId]);
    check("FK-04", scrap04.status === 200 && beforeReservation === afterReservation && (await wipRemaining(fk04)) === 3, JSON.stringify({ scrap04: scrap04.status, beforeReservation, afterReservation }));

    const fk05 = await issueWip("05", 3);
    const read05 = await call("supervisor", "GET", `/inventory/wip-inventory?material_id=${fk05.materialId}`);
    check("FK-05", read05.status === 200 && Array.isArray(read05.json?.items ?? read05.json), JSON.stringify(read05.json));

    const fk06 = await issueWip("06", 15);
    const conf06 = await createConfirmation(fk06, 15);
    const return06 = await call("supervisor", "POST", "/inventory/returns", {
      production_order_id: fk06.orderId, material_id: fk06.materialId, wip_issue_note_id: fk06.noteId,
      destination_warehouse_id: source.warehouseId, lot_id: fk06.lotId, quantity: 15, reason: `${prefix} race return`,
    });
    returnIds.push(return06.json.id);
    await call("director", "POST", `/inventory/returns/${return06.json.id}/approve`, {});
    const race06 = await Promise.all([
      call("supervisor", "POST", `/inventory/consumptions/${conf06.id}/confirm`, {}),
      call("supervisor", "POST", `/inventory/returns/${return06.json.id}/post`, {}),
    ]);
    check("FK-06", race06.filter((r) => r.status === 200).length === 1 && race06.filter((r) => r.status === 409).length === 1, JSON.stringify(race06.map((r) => r.status)));

    const fk07 = await issueWip("07", 12);
    const return07 = await call("supervisor", "POST", "/inventory/returns", {
      production_order_id: fk07.orderId, material_id: fk07.materialId, wip_issue_note_id: fk07.noteId,
      destination_warehouse_id: source.warehouseId, lot_id: fk07.lotId, quantity: 12, reason: `${prefix} race return`,
    });
    returnIds.push(return07.json.id);
    await call("director", "POST", `/inventory/returns/${return07.json.id}/approve`, {});
    const scrap07 = await call("supervisor", "POST", "/inventory/scrap", {
      production_order_id: fk07.orderId, material_id: fk07.materialId, lot_id: fk07.lotId, quantity: 12, reason: `${prefix} race scrap`,
    });
    scrapIds.push(scrap07.json.id);
    await call("director", "POST", `/inventory/scrap/${scrap07.json.id}/approve`, {});
    const race07 = await Promise.all([
      call("supervisor", "POST", `/inventory/returns/${return07.json.id}/post`, {}),
      call("supervisor", "POST", `/inventory/scrap/${scrap07.json.id}/post`, {}),
    ]);
    check("FK-07", race07.filter((r) => r.status === 200).length === 1 && race07.filter((r) => r.status === 409).length === 1, JSON.stringify(race07.map((r) => r.status)));

    const fk08 = await issueWip("08", 12);
    const conf08 = await createConfirmation(fk08, 12);
    const scrap08 = await call("supervisor", "POST", "/inventory/scrap", {
      production_order_id: fk08.orderId, material_id: fk08.materialId, lot_id: fk08.lotId, quantity: 12, reason: `${prefix} race scrap`,
    });
    scrapIds.push(scrap08.json.id);
    await call("director", "POST", `/inventory/scrap/${scrap08.json.id}/approve`, {});
    const race08 = await Promise.all([
      call("supervisor", "POST", `/inventory/consumptions/${conf08.id}/confirm`, {}),
      call("supervisor", "POST", `/inventory/scrap/${scrap08.json.id}/post`, {}),
    ]);
    check("FK-08", race08.filter((r) => r.status === 200).length === 1 && race08.filter((r) => r.status === 409).length === 1, JSON.stringify(race08.map((r) => r.status)));

    const fk09 = await makeStock("09", 10, source.warehouseId, source.locationId);
    const adjustment09a = await call("supervisor", "POST", "/inventory/adjustments", { type: "negative", material_id: fk09.materialId, lot_id: fk09.lotId, warehouse_id: source.warehouseId, quantity: 6, reason: `${prefix} concurrent adjustment` });
    const adjustment09b = await call("supervisor", "POST", "/inventory/adjustments", { type: "negative", material_id: fk09.materialId, lot_id: fk09.lotId, warehouse_id: source.warehouseId, quantity: 6, reason: `${prefix} concurrent adjustment` });
    adjustmentIds.push(adjustment09a.json.id, adjustment09b.json.id);
    for (const id of [adjustment09a.json.id, adjustment09b.json.id]) {
      await call("supervisor", "POST", `/inventory/adjustments/${id}/submit`, {});
      await call("director", "POST", `/inventory/adjustments/${id}/approve`, {});
    }
    const race09 = await Promise.all([
      call("supervisor", "POST", `/inventory/adjustments/${adjustment09a.json.id}/post`, {}),
      call("supervisor", "POST", `/inventory/adjustments/${adjustment09b.json.id}/post`, {}),
    ]);
    check("FK-09", race09.filter((r) => r.status === 200).length === 1 && race09.filter((r) => r.status === 409).length === 1, JSON.stringify(race09.map((r) => r.status)));

    const fk10 = await makeStock("10", 10, source.warehouseId, source.locationId);
    const transfer10 = await createTransfer(fk10, destination.warehouseId, undefined, 10);
    const adjustment10 = await call("supervisor", "POST", "/inventory/adjustments", { type: "negative", material_id: fk10.materialId, lot_id: fk10.lotId, warehouse_id: source.warehouseId, quantity: 1, reason: `${prefix} transfer race` });
    adjustmentIds.push(adjustment10.json.id);
    await call("supervisor", "POST", `/inventory/adjustments/${adjustment10.json.id}/submit`, {});
    await call("director", "POST", `/inventory/adjustments/${adjustment10.json.id}/approve`, {});
    const race10 = await Promise.all([
      call("supervisor", "POST", `/inventory/transfer-requests/${transfer10.id}/issue`, {}),
      call("supervisor", "POST", `/inventory/adjustments/${adjustment10.json.id}/post`, {}),
    ]);
    check("FK-10", race10.filter((r) => r.status === 200).length === 1 && race10.filter((r) => r.status === 409).length === 1, JSON.stringify(race10.map((r) => r.status)));

    const fk11 = await makeStock("11", 10, source.warehouseId, source.locationId);
    const order11 = await makeOrder("11");
    const reserve11 = await call("supervisor", "POST", "/inventory/reservations", { production_order_id: order11, material_id: fk11.materialId, quantity: 5 });
    reservationIds.push(reserve11.json.id);
    const transfer11 = await createTransfer(fk11, destination.warehouseId);
    const race11 = await Promise.all([
      call("supervisor", "POST", `/inventory/transfer-requests/${transfer11.id}/issue`, {}),
      call("supervisor", "POST", `/inventory/reservations/${reserve11.json.id}/allocate`, { lot_id: fk11.lotId, quantity: 5 }),
    ]);
    const available11 = await stockBalance(fk11, "available", source.warehouseId);
    check("FK-11", race11.every((r) => r.status === 200) && available11 >= 0, JSON.stringify({ statuses: race11.map((r) => r.status), available11 }));

    const fk12 = await issueWip("12", 4);
    const return12 = await call("supervisor", "POST", "/inventory/returns", {
      production_order_id: fk12.orderId, material_id: fk12.materialId, wip_issue_note_id: fk12.noteId,
      destination_warehouse_id: source.warehouseId, lot_id: fk12.lotId, quantity: 2, reason: `${prefix} idem return`,
    });
    returnIds.push(return12.json.id);
    await call("director", "POST", `/inventory/returns/${return12.json.id}/approve`, {});
    const return12Key = `${prefix}-RETURN-IDEM`;
    const idemReturn = await Promise.all([
      call("supervisor", "POST", `/inventory/returns/${return12.json.id}/post`, {}, { "Idempotency-Key": return12Key }),
      call("supervisor", "POST", `/inventory/returns/${return12.json.id}/post`, {}, { "Idempotency-Key": return12Key }),
    ]);
    const returnRows12 = await scalar<string>("SELECT count(*) FROM inventory_transactions WHERE source_document_id = $1", [return12.json.id]);
    const returnOutbox12 = await scalar<string>("SELECT count(*) FROM outbox_events WHERE aggregate_id = $1", [return12.json.id]);
    check("FK-12", idemReturn.every((r) => r.status === 200) && Number(returnRows12) === 2 && Number(returnOutbox12) === 1, JSON.stringify({ statuses: idemReturn.map((r) => r.status), returnRows12, returnOutbox12 }));

    const fk13 = await issueWip("13", 3);
    const return13 = await postReturn(fk13, 1, source.warehouseId);
    const counts13 = await rows<{ ledger: string; outbox: string }>(
      `SELECT (SELECT count(*) FROM inventory_transactions WHERE source_document_type = 'return_document' AND source_document_id = $1)::text AS ledger,
              (SELECT count(*) FROM outbox_events WHERE aggregate_type = 'return_document' AND aggregate_id = $1)::text AS outbox`,
      [returnIds[returnIds.length - 1]],
    );
    check("FK-13", return13.status === 200 && Number(counts13[0]?.ledger) === 2 && Number(counts13[0]?.outbox) === 1, JSON.stringify(counts13[0]));

    const fk14 = await issueWip("14", 3);
    const conf14 = await createConfirmation(fk14, 2, 3);
    const confirmed14 = await call("supervisor", "POST", `/inventory/consumptions/${conf14.id}/confirm`, {});
    const beforeAnnotation14 = await scalar<string>(
      "SELECT count(*) FROM inventory_transactions WHERE source_document_type = 'CONSUMPTION' AND source_document_id = $1",
      [conf14.id],
    );
    const annotation14 = await call("supervisor", "POST", `/inventory/consumptions/${conf14.id}/adjust`, {
      reason: `${prefix} annotation-only correction`,
    });
    const afterAnnotation14 = await scalar<string>(
      "SELECT count(*) FROM inventory_transactions WHERE source_document_type = 'CONSUMPTION' AND source_document_id = $1",
      [conf14.id],
    );
    check("FK-14", confirmed14.status === 200 && annotation14.status === 200 && beforeAnnotation14 === afterAnnotation14 && (await wipRemaining(fk14)) === 1, JSON.stringify({ status: confirmed14.status, annotation: annotation14.status, beforeAnnotation14, afterAnnotation14 }));

    const nonnegative = await scalar<string>(
      `SELECT count(*) FROM (
         SELECT material_id, stock_state, sum(quantity) AS balance
         FROM inventory_transactions GROUP BY material_id, stock_state HAVING sum(quantity) < 0
       ) x WHERE material_id = ANY($1::uuid[])`,
      [materialIds],
    );
    check("FK-LEDGER", Number(nonnegative) === 0, `negative balances=${nonnegative}`);
  } finally {
    await cleanup();
  }

  console.log(`\nTOTAL: ${passed} PASS / ${failed} FAIL / ${passed + failed} checks`);
  if (failed > 0) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error(error);
  try {
    await cleanup();
  } catch (cleanupError) {
    console.error("cleanup failed", cleanupError);
  }
  process.exitCode = 1;
});