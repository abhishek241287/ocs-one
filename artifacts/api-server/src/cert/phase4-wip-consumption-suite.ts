#!/usr/bin/env tsx
/**
 * PH4-01..PH4-15 — comprehensive Phase 4 WIP / issue / consumption gate.
 *
 * This suite runs against the running development API and uses only isolated
 * development fixtures. Every fixture is removed in the finally block.
 */

import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { pool } from "@workspace/db";

const BASE_URL = (
  process.env.OCS_URL ??
  process.env.CERT_BASE_URL ??
  "http://localhost:80"
).replace(/\/$/, "");

const prefix = `PH4-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`;
const cookies = new Map<string, string>();
const credentials: Record<string, { email: string; password: string }> = {
  director: {
    email: process.env.OCS_DIRECTOR_EMAIL ?? "director@ocs.local",
    password: process.env.OCS_DIRECTOR_PASSWORD ?? "change-me",
  },
  supervisor: {
    email: process.env.OCS_SUPERVISOR_EMAIL ?? "supervisor@ocs.local",
    password: process.env.OCS_SUPERVISOR_PASSWORD ?? "change-me",
  },
  operator: {
    email: process.env.OCS_OPERATOR_EMAIL ?? "operator@ocs.local",
    password: process.env.OCS_OPERATOR_PASSWORD ?? "change-me",
  },
  viewer: {
    email: process.env.OCS_VIEWER_EMAIL ?? "viewer@ocs.local",
    password: process.env.OCS_VIEWER_PASSWORD ?? "change-me",
  },
};

const materialIds: string[] = [];
const categoryIds: string[] = [];
const orderIds: string[] = [];
const grnIds: string[] = [];
const lineIds: string[] = [];
const lotIds: string[] = [];
const warehouseIds: string[] = [];
const locationIds: string[] = [];
const reservationIds: string[] = [];
const confirmationIds: string[] = [];
const temporaryUserIds: string[] = [];
const actorIds: string[] = [];
let supplierId = "";
let supervisorId = "";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type ApiResult = { status: number; json: any; headers: Headers };

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

async function login(role: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await call(role, "POST", "/auth/login", credentials[role]);
    if (result.status === 200) return;
    if (result.status !== 429) {
      throw new Error(`login failed for ${role}: HTTP ${result.status}`);
    }
    const retry = Number(result.headers.get("ratelimit-reset") ?? result.headers.get("retry-after"));
    await sleep(Math.min(Number.isFinite(retry) && retry > 0 ? retry * 1000 + 500 : 2_000, 65_000));
  }
  throw new Error(`login failed for ${role}: persistent HTTP 429`);
}

function hasExplicitCredentials(role: string): boolean {
  const prefixName = `OCS_${role.toUpperCase()}`;
  return Boolean(
    process.env[`${prefixName}_EMAIL`] && process.env[`${prefixName}_PASSWORD`],
  );
}

async function provisionUsers(): Promise<void> {
  const password = `${prefix}-Certification-Password!`;
  const hash = await bcrypt.hash(password, 10);
  for (const role of ["director", "supervisor", "operator", "viewer"]) {
    if (hasExplicitCredentials(role)) continue;
    const id = randomUUID();
    await pool.query(
      `INSERT INTO users (id, email, password_hash, name, role, is_active)
       VALUES ($1, $2, $3, $4, $5, true)`,
      [id, `${prefix.toLowerCase()}-${role}@cert.local`, hash, `${prefix} ${role}`, role],
    );
    temporaryUserIds.push(id);
    credentials[role] = {
      email: `${prefix.toLowerCase()}-${role}@cert.local`,
      password,
    };
  }
}

async function userId(email: string): Promise<string> {
  const result = await pool.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email]);
  if (!result.rows[0]) throw new Error(`user fixture not found: ${email}`);
  return result.rows[0].id;
}

async function makeMaterial(suffix: string): Promise<{ id: string; code: string }> {
  const categoryId = randomUUID();
  const materialId = randomUUID();
  const code = `${prefix}-MAT-${suffix}`;
  await pool.query(
    `INSERT INTO master_material_categories (id, code, name, engineering_master_required)
     VALUES ($1, $2, $3, false)`,
    [categoryId, `${prefix}-CAT-${suffix}`, `${prefix} Category ${suffix}`],
  );
  await pool.query(
    `INSERT INTO master_materials
       (id, code, name, category_id, uom, usage_type)
     VALUES ($1, $2, $3, $4, 'PCS', 'CONSUMABLE')`,
    [materialId, code, `${prefix} Material ${suffix}`, categoryId],
  );
  categoryIds.push(categoryId);
  materialIds.push(materialId);
  return { id: materialId, code };
}

async function makeOrder(suffix: string): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO mfg_production_orders
       (id, order_number, battery_number, factory_manager, status, priority)
     VALUES ($1, $2, $3, $4, 'draft', 'medium')`,
    [id, `${prefix}-PO-${suffix}`, `${prefix}-BAT-${suffix}`, `${prefix} Manager`],
  );
  orderIds.push(id);
  return id;
}

async function receive(
  materialId: string,
  quantity: number,
  suffix: string,
  receivedDate = "2026-09-12",
): Promise<{ grnId: string; lineId: string; lotId: string }> {
  const grnId = randomUUID();
  const lineId = randomUUID();
  const lotId = randomUUID();
  const warehouseId = warehouseIds[0];
  const locationId = locationIds[0];
  await pool.query(
    `INSERT INTO grn_headers
       (id, grn_number, supplier_id, received_date, status, created_by)
     VALUES ($1, $2, $3, $4, 'posted', $5)`,
    [grnId, `${prefix.slice(0, 16)}-G-${suffix}`, supplierId, receivedDate, supervisorId],
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
    [lotId, `${prefix}-LOT-${suffix}`, materialId, lineId, receivedDate, quantity, warehouseId, locationId],
  );
  await pool.query(
    `INSERT INTO inventory_transactions
       (transaction_type, material_id, quantity, uom, stock_state,
        source_document_type, source_document_id, source_line_id, created_by)
     VALUES ('GRN_RECEIPT', $1, $2, 'PCS', 'available', 'GRN', $3, $4, $5)`,
    [materialId, quantity, grnId, lineId, supervisorId],
  );
  await pool.query(
    "UPDATE grn_line_items SET lot_id = $1 WHERE id = $2",
    [lotId, lineId],
  );
  grnIds.push(grnId);
  lineIds.push(lineId);
  lotIds.push(lotId);
  return { grnId, lineId, lotId };
}

async function reserve(orderId: string, materialId: string, quantity: number): Promise<ApiResult> {
  const result = await call("supervisor", "POST", "/inventory/reservations", {
    production_order_id: orderId,
    material_id: materialId,
    quantity,
  });
  if (result.status === 201 && result.json?.id) reservationIds.push(result.json.id);
  return result;
}

async function allocate(reservationId: string, quantity?: number): Promise<ApiResult> {
  return call(
    "supervisor",
    "POST",
    `/inventory/reservations/${reservationId}/allocate`,
    quantity === undefined ? undefined : { quantity },
  );
}

async function stockRows(code: string): Promise<any[]> {
  const result = await call(
    "viewer",
    "GET",
    `/inventory/stock?search=${encodeURIComponent(code)}&pageSize=200`,
  );
  if (result.status !== 200) throw new Error(`stock read failed: ${result.status}`);
  return result.json?.items ?? [];
}

async function stockQty(code: string, state: string): Promise<number> {
  const rows = await stockRows(code);
  return rows
    .filter((row) => row.stock_state === state)
    .reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);
}

async function activeAllocationSum(reservationId: string): Promise<number> {
  const result = await call("viewer", "GET", `/inventory/reservations/${reservationId}`);
  return (result.json?.allocations ?? [])
    .filter((allocation: any) => allocation.status === "active")
    .reduce((sum: number, allocation: any) => sum + Number(allocation.quantity), 0);
}

async function invariantCount(name: string, query: string): Promise<boolean> {
  const result = await pool.query(query);
  const count = Number(result.rows[0]?.count ?? 0);
  console.log(`${name}: ${count === 0 ? "PASS" : `FAIL (${count} rows)`}`);
  return count === 0;
}

async function runInvariants(): Promise<boolean> {
  const checks = await Promise.all([
    invariantCount(
      "INV-RES-01",
      `SELECT count(*) FROM inventory_reservations
       WHERE reserved_qty < allocated_qty OR allocated_qty < issued_qty`,
    ),
    invariantCount(
      "INV-RES-02",
      `SELECT count(*) FROM inventory_reservation_allocations
       WHERE quantity <= 0`,
    ),
    invariantCount(
      "INV-RES-03",
      `SELECT count(*) FROM inventory_reservation_allocations a
       LEFT JOIN inventory_reservations r ON r.id = a.reservation_id
       WHERE r.id IS NULL`,
    ),
    invariantCount(
      "INV-RES-04",
      `SELECT count(*) FROM inventory_reservations r
       WHERE status IN ('active','partially_allocated','fully_allocated','partially_issued','fully_issued')
       AND EXISTS (
         SELECT 1 FROM inventory_reservations r2
         WHERE r2.id <> r.id
           AND r2.production_order_id = r.production_order_id
           AND r2.material_id = r.material_id
           AND r2.status IN ('active','partially_allocated','fully_allocated','partially_issued','fully_issued')
           AND COALESCE(r2.lot_id, '00000000-0000-0000-0000-000000000000'::uuid)
             = COALESCE(r.lot_id, '00000000-0000-0000-0000-000000000000'::uuid)
       )`,
    ),
    invariantCount(
      "INV-RES-05",
      `SELECT count(*) FROM inventory_reservation_allocations
       WHERE status NOT IN ('active','issued','released','cancelled')`,
    ),
    invariantCount(
      "INV-RES-06",
      `SELECT count(*) FROM inventory_reservations
       WHERE reserved_qty < 0 OR allocated_qty < 0 OR issued_qty < 0`,
    ),
    invariantCount(
      "INV-RES-07",
      `SELECT count(*) FROM inventory_reservation_allocations a
       WHERE a.status = 'active'
       AND NOT EXISTS (SELECT 1 FROM inventory_reservations r WHERE r.id = a.reservation_id)`,
    ),
    invariantCount(
      "INV-RES-08",
      `SELECT count(*) FROM inventory_transactions
       WHERE source_document_type IN ('reservation','reservation_allocation')`,
    ),
    invariantCount(
      "INV-P4-01",
      `SELECT count(*) FROM (
         SELECT material_id,
           SUM(reserved_qty - issued_qty) AS held,
           (SELECT COALESCE(SUM(quantity), 0) FROM inventory_transactions i
            WHERE i.material_id = r.material_id AND i.stock_state = 'available') +
           (SELECT COALESCE(SUM(quantity), 0) FROM inventory_transactions i
            WHERE i.material_id = r.material_id AND i.stock_state = 'wip') AS physical
         FROM inventory_reservations r
         WHERE r.status IN ('active','partially_allocated','fully_allocated','partially_issued','fully_issued')
         GROUP BY material_id
       ) x WHERE held > physical`,
    ),
    invariantCount(
      "INV-P4-02",
      `SELECT count(*) FROM wip_inventory
       WHERE remaining_qty <> issued_qty - consumed_qty - returned_qty - scrapped_qty
          OR remaining_qty < 0`,
    ),
    invariantCount(
      "INV-P4-03",
      `SELECT count(*) FROM (
         SELECT w.production_order_id, w.material_id,
           SUM(w.remaining_qty) AS row_wip,
           (SELECT COALESCE(SUM(i.quantity), 0)
            FROM inventory_transactions i
            WHERE i.stock_state = 'wip'
              AND i.production_order_id = w.production_order_id
              AND i.material_id = w.material_id) AS ledger_wip
         FROM wip_inventory w
         WHERE w.status IN ('active','partially_consumed')
         GROUP BY w.production_order_id, w.material_id
       ) x WHERE row_wip <> ledger_wip`,
    ),
    invariantCount(
      "INV-P4-04",
      `SELECT count(*) FROM consumption_confirmations
       WHERE variance_qty <> actual_qty - planned_qty
          OR status NOT IN ('draft','confirmed','adjusted','rejected')`,
    ),
    invariantCount(
      "INV-P4-05",
      `SELECT count(*) FROM inventory_reservations r
       WHERE (SELECT COALESCE(SUM(a.quantity), 0)
              FROM inventory_reservation_allocations a
              WHERE a.reservation_id = r.id AND a.status = 'active')
             <> r.allocated_qty - r.issued_qty
          OR (SELECT COALESCE(SUM(a.quantity), 0)
              FROM inventory_reservation_allocations a
              WHERE a.reservation_id = r.id AND a.status = 'issued')
             <> r.issued_qty`,
    ),
  ]);
  const negativeBalances = await pool.query<{ material_id: string; stock_state: string; balance: string }>(
    `SELECT material_id, stock_state, SUM(quantity)::text AS balance
     FROM inventory_transactions
     GROUP BY material_id, stock_state
     HAVING SUM(quantity) < 0`,
  );
  const newNegativeBalances = negativeBalances.rows.filter((row) =>
    materialIds.includes(row.material_id),
  );
  const baselineNegativeBalances = negativeBalances.rows.filter(
    (row) => !materialIds.includes(row.material_id),
  );
  if (newNegativeBalances.length === 0) {
    console.log("LEDGER-NONNEGATIVE: PASS");
  } else {
    console.log(`LEDGER-NONNEGATIVE: FAIL (${newNegativeBalances.length} new rows)`);
  }
  if (baselineNegativeBalances.length) {
    console.log(
      `LEDGER-NONNEGATIVE baseline exception: ${JSON.stringify(baselineNegativeBalances)}`,
    );
  }
  const hygiene = await Promise.all([
    Promise.resolve(newNegativeBalances.length === 0),
    invariantCount(
      "LEDGER-NO-RESERVATION-SOURCE",
      `SELECT count(*) FROM inventory_transactions
       WHERE source_document_type IN ('reservation','reservation_allocation')`,
    ),
  ]);
  return [...checks, ...hygiene].every(Boolean);
}

async function cleanup(): Promise<void> {
  await pool.query("BEGIN");
  try {
    const reservations = await pool.query<{ id: string }>(
      `SELECT id FROM inventory_reservations
       WHERE id = ANY($1::uuid[]) OR production_order_id = ANY($2::uuid[])
          OR material_id = ANY($3::uuid[])`,
      [reservationIds, orderIds, materialIds],
    );
    const ids = reservations.rows.map((row) => row.id);
    const notes = ids.length
      ? await pool.query<{ id: string }>(
          "SELECT id FROM wip_issue_notes WHERE reservation_id = ANY($1::uuid[])",
          [ids],
        )
      : { rows: [] as { id: string }[] };
    const noteIds = notes.rows.map((row) => row.id);

    if (actorIds.length) {
      await pool.query(
        `DELETE FROM security_events WHERE actor_id = ANY($1::uuid[]) AND detail LIKE $2`,
        [actorIds, `%${prefix}%`],
      );
    }
    if (materialIds.length) {
      await pool.query("DELETE FROM wip_inventory WHERE material_id = ANY($1::uuid[])", [materialIds]);
    }
    if (noteIds.length) {
      await pool.query("DELETE FROM outbox_events WHERE aggregate_id = ANY($1::uuid[])", [noteIds]);
      await pool.query("DELETE FROM wip_issue_lines WHERE wip_issue_note_id = ANY($1::uuid[])", [noteIds]);
      await pool.query("DELETE FROM wip_issue_notes WHERE id = ANY($1::uuid[])", [noteIds]);
    }
    if (ids.length) {
      await pool.query("DELETE FROM outbox_events WHERE aggregate_id = ANY($1::uuid[])", [ids]);
      await pool.query("DELETE FROM inventory_reservation_allocations WHERE reservation_id = ANY($1::uuid[])", [ids]);
      await pool.query("DELETE FROM inventory_reservations WHERE id = ANY($1::uuid[])", [ids]);
    }
    if (confirmationIds.length) {
      await pool.query("DELETE FROM outbox_events WHERE aggregate_id = ANY($1::uuid[])", [confirmationIds]);
      await pool.query("DELETE FROM consumption_confirmations WHERE id = ANY($1::uuid[])", [confirmationIds]);
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
    }
    if (lineIds.length) {
      await pool.query("DELETE FROM inventory_lots WHERE id = ANY($1::uuid[])", [lotIds]);
      await pool.query("DELETE FROM grn_line_items WHERE id = ANY($1::uuid[])", [lineIds]);
      await pool.query("DELETE FROM grn_headers WHERE id = ANY($1::uuid[])", [grnIds]);
    }
    if (locationIds.length) {
      await pool.query("DELETE FROM locations WHERE id = ANY($1::uuid[])", [locationIds]);
    }
    if (warehouseIds.length) {
      await pool.query("DELETE FROM warehouses WHERE id = ANY($1::uuid[])", [warehouseIds]);
    }
    if (orderIds.length) {
      await pool.query("DELETE FROM mfg_production_orders WHERE id = ANY($1::uuid[])", [orderIds]);
    }
    if (materialIds.length) {
      await pool.query("DELETE FROM master_materials WHERE id = ANY($1::uuid[])", [materialIds]);
    }
    if (categoryIds.length) {
      await pool.query("DELETE FROM master_material_categories WHERE id = ANY($1::uuid[])", [categoryIds]);
    }
    if (supplierId) await pool.query("DELETE FROM master_suppliers WHERE id = $1", [supplierId]);
    if (temporaryUserIds.length) {
      await pool.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [temporaryUserIds]);
    }
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
    await Promise.all(["director", "supervisor", "operator", "viewer"].map(login));
    supervisorId = await userId(credentials.supervisor.email);
    actorIds.push(
      await userId(credentials.director.email),
      supervisorId,
      await userId(credentials.operator.email),
      await userId(credentials.viewer.email),
    );
    supplierId = randomUUID();
    await pool.query(
      "INSERT INTO master_suppliers (id, code, name) VALUES ($1, $2, $3)",
      [supplierId, `${prefix}-SUP`, `${prefix} Supplier`],
    );
    const warehouseId = randomUUID();
    const locationId = randomUUID();
    await pool.query(
      `INSERT INTO warehouses (id, code, name, type, is_active)
       VALUES ($1, $2, $3, 'production_store', true)`,
      [warehouseId, `${prefix.slice(0, 14)}-WH`, `${prefix} Warehouse`],
    );
    await pool.query(
      `INSERT INTO locations (id, warehouse_id, code, name, type, is_active)
       VALUES ($1, $2, $3, $4, 'staging', true)`,
      [locationId, warehouseId, `${prefix.slice(0, 14)}-LOC`, `${prefix} Location`],
    );
    warehouseIds.push(warehouseId);
    locationIds.push(locationId);

    // PH4-01 Partial issue.
    {
      const material = await makeMaterial("P01");
      const order = await makeOrder("P01");
      await receive(material.id, 50, "P01");
      const reservation = await reserve(order, material.id, 50);
      const allocation = await allocate(reservation.json.id);
      const issue = await call("supervisor", "POST", `/inventory/reservations/${reservation.json.id}/issue`, { quantity: 20 });
      const detail = await call("viewer", "GET", `/inventory/reservations/${reservation.json.id}`);
      check("PH4-01", allocation.status === 200 && issue.status === 201 &&
        detail.json?.status === "partially_issued" &&
        Number(detail.json?.issued_qty) === 20 &&
        (await activeAllocationSum(reservation.json.id)) === 30, JSON.stringify(issue.json));
    }

    // PH4-02 Full issue.
    {
      const material = await makeMaterial("P02");
      const order = await makeOrder("P02");
      await receive(material.id, 40, "P02");
      const reservation = await reserve(order, material.id, 40);
      await allocate(reservation.json.id);
      const issue = await call("supervisor", "POST", `/inventory/reservations/${reservation.json.id}/issue`, {});
      const detail = await call("viewer", "GET", `/inventory/reservations/${reservation.json.id}`);
      check("PH4-02", issue.status === 201 && detail.json?.status === "fully_issued" &&
        Number(detail.json?.issued_qty) === 40, JSON.stringify(detail.json));
    }

    // PH4-03 Forced lot: explicitly select the later received lot, not list order.
    {
      const material = await makeMaterial("P03");
      const order = await makeOrder("P03");
      await receive(material.id, 30, "P03-EARLY", "2026-09-10");
      const late = await receive(material.id, 20, "P03-LATE", "2026-09-12");
      const reservation = await reserve(order, material.id, 50);
      await allocate(reservation.json.id);
      const lateGrn = await call("supervisor", "GET", `/inventory/grns/${late.grnId}`);
      const forced = lateGrn.json?.lines?.find((line: any) => line.id === late.lineId)?.lot_id;
      const issue = await call("supervisor", "POST", `/inventory/reservations/${reservation.json.id}/issue`, {
        quantity: 10,
        lot_id: forced,
      });
      check("PH4-03", lateGrn.status === 200 && forced === late.lotId &&
        issue.status === 201 && issue.json?.lines?.[0]?.lot_id === forced,
      JSON.stringify({ lateGrn: lateGrn.json, forced, issue: issue.json }));
    }

    // PH4-04 Reservation interaction.
    {
      const material = await makeMaterial("P04");
      const order = await makeOrder("P04");
      await receive(material.id, 60, "P04");
      const reservation = await reserve(order, material.id, 60);
      await allocate(reservation.json.id);
      await call("supervisor", "POST", `/inventory/reservations/${reservation.json.id}/issue`, { quantity: 25 });
      const over = await call("supervisor", "POST", `/inventory/reservations/${reservation.json.id}/issue`, { quantity: 50 });
      const okay = await call("supervisor", "POST", `/inventory/reservations/${reservation.json.id}/issue`, { quantity: 35 });
      const detail = await call("viewer", "GET", `/inventory/reservations/${reservation.json.id}`);
      check("PH4-04", over.status === 409 && okay.status === 201 &&
        detail.json?.status === "fully_issued" && Number(detail.json?.issued_qty) === 60,
        `${over.status}/${okay.status}`);
    }

    // PH4-05 Partial consumption.
    {
      const material = await makeMaterial("P05");
      const order = await makeOrder("P05");
      await receive(material.id, 50, "P05");
      const reservation = await reserve(order, material.id, 50);
      await allocate(reservation.json.id);
      await call("supervisor", "POST", `/inventory/reservations/${reservation.json.id}/issue`, {});
      const draft = await call("supervisor", "POST", "/inventory/consumptions", {
        production_order_id: order, material_id: material.id, actual_qty: 20, planned_qty: 50,
      });
      confirmationIds.push(draft.json.id);
      const confirmed = await call("supervisor", "POST", `/inventory/consumptions/${draft.json.id}/confirm`, {});
      const wip = await call("viewer", "GET", `/inventory/wip-inventory?material_id=${material.id}`);
      check("PH4-05", confirmed.status === 200 && wip.json?.items?.[0]?.status === "partially_consumed" &&
        Number(wip.json?.items?.[0]?.remaining_qty) === 30 && await stockQty(material.code, "wip") === 30,
        JSON.stringify(wip.json));
    }

    // PH4-06 Full consumption.
    {
      const material = await makeMaterial("P06");
      const order = await makeOrder("P06");
      await receive(material.id, 30, "P06");
      const reservation = await reserve(order, material.id, 30);
      await allocate(reservation.json.id);
      await call("supervisor", "POST", `/inventory/reservations/${reservation.json.id}/issue`, {});
      const draft = await call("supervisor", "POST", "/inventory/consumptions", {
        production_order_id: order, material_id: material.id, actual_qty: 30,
      });
      confirmationIds.push(draft.json.id);
      await call("supervisor", "POST", `/inventory/consumptions/${draft.json.id}/confirm`, {});
      const wip = await call("viewer", "GET", `/inventory/wip-inventory?material_id=${material.id}`);
      check("PH4-06", wip.json?.items?.[0]?.status === "fully_consumed" &&
        Number(wip.json?.items?.[0]?.remaining_qty) === 0 && await stockQty(material.code, "wip") === 0,
        JSON.stringify(wip.json));
    }

    // PH4-07 Variance.
    {
      const material = await makeMaterial("P07");
      const order = await makeOrder("P07");
      await receive(material.id, 50, "P07");
      const reservation = await reserve(order, material.id, 50);
      await allocate(reservation.json.id);
      await call("supervisor", "POST", `/inventory/reservations/${reservation.json.id}/issue`, {});
      const draft = await call("supervisor", "POST", "/inventory/consumptions", {
        production_order_id: order, material_id: material.id, actual_qty: 35, planned_qty: 50,
      });
      confirmationIds.push(draft.json.id);
      check("PH4-07", draft.status === 201 && Number(draft.json?.variance_qty) === -15,
        JSON.stringify(draft.json));
    }

    // PH4-08 Invalid transitions. The unallocated reservation uses a separate
    // production order so the active-identity constraint cannot mask the 409.
    {
      const material = await makeMaterial("P08");
      const allocatedOrder = await makeOrder("P08-ALLOCATED");
      const unallocatedOrder = await makeOrder("P08-UNALLOCATED");
      await receive(material.id, 10, "P08");
      const unallocated = await reserve(unallocatedOrder, material.id, 1);
      const allocated = await reserve(allocatedOrder, material.id, 9);
      await allocate(allocated.json.id);
      const issueUnallocated = await call("supervisor", "POST", `/inventory/reservations/${unallocated.json.id}/issue`, {});
      await call("supervisor", "POST", `/inventory/reservations/${allocated.json.id}/issue`, {});
      const draft = await call("supervisor", "POST", "/inventory/consumptions", {
        production_order_id: allocatedOrder, material_id: material.id, actual_qty: 5,
      });
      confirmationIds.push(draft.json.id);
      await call("supervisor", "POST", `/inventory/consumptions/${draft.json.id}/confirm`, {});
      const confirmAgain = await call("supervisor", "POST", `/inventory/consumptions/${draft.json.id}/confirm`, {});
      const draftAdjustment = await call("supervisor", "POST", "/inventory/consumptions", {
        production_order_id: allocatedOrder, material_id: material.id, actual_qty: 1,
      });
      confirmationIds.push(draftAdjustment.json.id);
      const adjustDraft = await call("supervisor", "POST", `/inventory/consumptions/${draftAdjustment.json.id}/adjust`, { reason: "x" });
      const over = await call("supervisor", "POST", "/inventory/consumptions", {
        production_order_id: allocatedOrder, material_id: material.id, actual_qty: 999,
      });
      confirmationIds.push(over.json.id);
      const overConfirm = await call("supervisor", "POST", `/inventory/consumptions/${over.json.id}/confirm`, {});
      check("PH4-08", issueUnallocated.status === 409 && confirmAgain.status === 409 &&
        adjustDraft.status === 409 && overConfirm.status === 409,
        `${issueUnallocated.status}/${confirmAgain.status}/${adjustDraft.status}/${overConfirm.status}`);
    }

    // PH4-09 Issue idempotency and confirmation double-submit.
    {
      const material = await makeMaterial("P09");
      const order = await makeOrder("P09");
      await receive(material.id, 40, "P09");
      const reservation = await reserve(order, material.id, 40);
      await allocate(reservation.json.id);
      const key = `${prefix}-IDEMPOTENCY`;
      const [first, replay] = await Promise.all([
        call("supervisor", "POST", `/inventory/reservations/${reservation.json.id}/issue`, { quantity: 10 }, { "idempotency-key": key }),
        call("supervisor", "POST", `/inventory/reservations/${reservation.json.id}/issue`, { quantity: 10 }, { "idempotency-key": key }),
      ]);
      const draft = await call("supervisor", "POST", "/inventory/consumptions", {
        production_order_id: order, material_id: material.id, actual_qty: 5,
      });
      confirmationIds.push(draft.json.id);
      const [confirmA, confirmB] = await Promise.all([
        call("supervisor", "POST", `/inventory/consumptions/${draft.json.id}/confirm`, {}),
        call("supervisor", "POST", `/inventory/consumptions/${draft.json.id}/confirm`, {}),
      ]);
      const issueStatuses = [first.status, replay.status].sort((a, b) => a - b);
      const confirmStatuses = [confirmA.status, confirmB.status].sort((a, b) => a - b);
      check("PH4-09", issueStatuses[0] === 200 && issueStatuses[1] === 201 &&
        first.json?.id === replay.json?.id && confirmStatuses[0] === 200 &&
        confirmStatuses[1] === 409, `${first.status}/${replay.status}/${confirmA.status}/${confirmB.status}`);
    }

    // PH4-10a Competing reservations and concurrent issue: exactly 201/409
    // for both races, with parentheses around the mixed conditions.
    {
      const material = await makeMaterial("P10");
      const order = await makeOrder("P10");
      await receive(material.id, 100, "P10");
      const [r1, r2] = await Promise.all([
        reserve(order, material.id, 60),
        reserve(order, material.id, 60),
      ]);
      const winner = r1.status === 201 ? r1 : r2;
      await allocate(winner.json.id);
      const [i1, i2] = await Promise.all([
        call("supervisor", "POST", `/inventory/reservations/${winner.json.id}/issue`, {}),
        call("supervisor", "POST", `/inventory/reservations/${winner.json.id}/issue`, {}),
      ]);
      const reservationStatuses = [r1.status, r2.status].sort((a, b) => a - b);
      const issueStatuses = [i1.status, i2.status].sort((a, b) => a - b);
      const detail = await call("viewer", "GET", `/inventory/reservations/${winner.json.id}`);
      check("PH4-10a", reservationStatuses[0] === 201 && reservationStatuses[1] === 409 &&
        issueStatuses[0] === 201 && issueStatuses[1] === 409 &&
        Number(detail.json?.issued_qty) <= 60,
        `${r1.status}/${r2.status}/${i1.status}/${i2.status}`);
    }

    // PH4-10b Concurrent consumption across two drafts.
    {
      const material = await makeMaterial("P10B");
      const order = await makeOrder("P10B");
      await receive(material.id, 30, "P10B");
      const reservation = await reserve(order, material.id, 30);
      await allocate(reservation.json.id);
      await call("supervisor", "POST", `/inventory/reservations/${reservation.json.id}/issue`, {});
      const [draftA, draftB] = await Promise.all([
        call("supervisor", "POST", "/inventory/consumptions", { production_order_id: order, material_id: material.id, actual_qty: 20 }),
        call("supervisor", "POST", "/inventory/consumptions", { production_order_id: order, material_id: material.id, actual_qty: 20 }),
      ]);
      confirmationIds.push(draftA.json.id, draftB.json.id);
      const [confirmA, confirmB] = await Promise.all([
        call("supervisor", "POST", `/inventory/consumptions/${draftA.json.id}/confirm`, {}),
        call("supervisor", "POST", `/inventory/consumptions/${draftB.json.id}/confirm`, {}),
      ]);
      const statuses = [confirmA.status, confirmB.status].sort((a, b) => a - b);
      check("PH4-10b", statuses[0] === 200 && statuses[1] === 409, `${confirmA.status}/${confirmB.status}`);
    }

    // PH4-10c Issue/consumption overlap; compare WIP rows with only WIP stock
    // rows, not the endpoint's intentionally unfiltered legacy state set.
    {
      const material = await makeMaterial("P10C");
      const order = await makeOrder("P10C");
      await receive(material.id, 50, "P10C");
      const reservation = await reserve(order, material.id, 50);
      await allocate(reservation.json.id);
      await call("supervisor", "POST", `/inventory/reservations/${reservation.json.id}/issue`, { quantity: 20 });
      const draft = await call("supervisor", "POST", "/inventory/consumptions", {
        production_order_id: order, material_id: material.id, actual_qty: 10,
      });
      confirmationIds.push(draft.json.id);
      const [confirmed, issued] = await Promise.all([
        call("supervisor", "POST", `/inventory/consumptions/${draft.json.id}/confirm`, {}),
        call("supervisor", "POST", `/inventory/reservations/${reservation.json.id}/issue`, { quantity: 15 }),
      ]);
      const wip = await call("viewer", "GET", `/inventory/wip-inventory?material_id=${material.id}&pageSize=50`);
      const remaining = (wip.json?.items ?? []).reduce((sum: number, row: any) => sum + Number(row.remaining_qty), 0);
      const ledgerWip = await stockQty(material.code, "wip");
      check("PH4-10c", confirmed.status === 200 && issued.status === 201 &&
        remaining === ledgerWip, `confirm=${confirmed.status} issue=${issued.status} row=${remaining} ledger=${ledgerWip}`);
    }

    // PH4-11 Ledger reconciliation through projections.
    {
      const material = await makeMaterial("P11");
      const order = await makeOrder("P11");
      await receive(material.id, 45, "P11");
      const before = await stockQty(material.code, "available");
      const reservation = await reserve(order, material.id, 45);
      await allocate(reservation.json.id);
      await call("supervisor", "POST", `/inventory/reservations/${reservation.json.id}/issue`, {});
      const afterAvailable = await stockQty(material.code, "available");
      const afterWip = await stockQty(material.code, "wip");
      check("PH4-11", before === 45 && afterAvailable === 0 && afterWip === 45,
        `${before}/${afterAvailable}/${afterWip}`);
    }

    // PH4-12 Authorization matrix and WIP read.
    {
      const material = await makeMaterial("P12");
      const order = await makeOrder("P12");
      await receive(material.id, 5, "P12");
      const reservation = await reserve(order, material.id, 5);
      const operator = await call("operator", "POST", `/inventory/reservations/${reservation.json.id}/issue`, {});
      const viewer = await call("viewer", "POST", `/inventory/reservations/${reservation.json.id}/issue`, {});
      const anonymous = await call(null, "POST", `/inventory/reservations/${reservation.json.id}/issue`, {});
      const read = await call("viewer", "GET", "/inventory/wip-inventory?pageSize=1");
      check("PH4-12", operator.status === 403 && viewer.status === 403 &&
        anonymous.status === 401 && read.status === 200,
        `${operator.status}/${viewer.status}/${anonymous.status}/${read.status}`);
    }

    // PH4-13 Reverse and re-issue loop.
    {
      const material = await makeMaterial("P13");
      const order = await makeOrder("P13");
      await receive(material.id, 25, "P13");
      const reservation = await reserve(order, material.id, 25);
      await allocate(reservation.json.id);
      const issue = await call("supervisor", "POST", `/inventory/reservations/${reservation.json.id}/issue`, {});
      const reverse = await call("supervisor", "POST", `/inventory/wip-issues/${issue.json.id}/reverse`, { reason: "phase 4 loop" });
      const beforeReissue = await call("viewer", "GET", `/inventory/reservations/${reservation.json.id}`);
      const reissue = await call("supervisor", "POST", `/inventory/reservations/${reservation.json.id}/issue`, { quantity: 25 });
      const afterReissue = await call("viewer", "GET", `/inventory/reservations/${reservation.json.id}`);
      check("PH4-13", reverse.status === 200 && beforeReissue.json?.status === "fully_allocated" &&
        Number(beforeReissue.json?.issued_qty) === 0 && reissue.status === 201 &&
        afterReissue.json?.status === "fully_issued",
        `${reverse.status}/${beforeReissue.json?.status}/${reissue.status}/${afterReissue.json?.status}`);
    }

    // PH4-14 INV-P4-05 client-side allocation evidence.
    {
      const material = await makeMaterial("P14");
      const order = await makeOrder("P14");
      await receive(material.id, 30, "P14");
      const reservation = await reserve(order, material.id, 30);
      await allocate(reservation.json.id);
      await call("supervisor", "POST", `/inventory/reservations/${reservation.json.id}/issue`, { quantity: 12 });
      const detail = await call("viewer", "GET", `/inventory/reservations/${reservation.json.id}`);
      const active = (detail.json?.allocations ?? []).filter((row: any) => row.status === "active")
        .reduce((sum: number, row: any) => sum + Number(row.quantity), 0);
      const issued = (detail.json?.allocations ?? []).filter((row: any) => row.status === "issued")
        .reduce((sum: number, row: any) => sum + Number(row.quantity), 0);
      check("PH4-14", active === Number(detail.json?.allocated_qty) - Number(detail.json?.issued_qty) &&
        issued === Number(detail.json?.issued_qty), `active=${active} issued=${issued}`);
    }

    // PH4-15 Read projections.
    {
      const material = await makeMaterial("P15");
      const order = await makeOrder("P15");
      await receive(material.id, 20, "P15");
      const reservation = await reserve(order, material.id, 20);
      await allocate(reservation.json.id);
      await call("supervisor", "POST", `/inventory/reservations/${reservation.json.id}/issue`, { quantity: 20 });
      const stock = await call("viewer", "GET", `/inventory/stock?search=${material.code}&pageSize=200`);
      const wip = await call("viewer", "GET", `/inventory/wip-inventory?material_id=${material.id}`);
      const stockWip = (stock.json?.items ?? [])
        .filter((row: any) => row.stock_state === "wip")
        .reduce((sum: number, row: any) => sum + Number(row.wip_qty ?? row.quantity ?? 0), 0);
      check("PH4-15", stock.status === 200 && wip.status === 200 &&
        stockWip === 20 && Number(wip.json?.items?.[0]?.issued_qty) === 20,
        JSON.stringify({ stock: stock.json?.items, wip: wip.json?.items }));
    }

    const invariantPass = await runInvariants();
    console.log(`\nTOTAL: ${passed} PASS / ${failed} FAIL / INVARIANTS ${invariantPass ? "PASS" : "FAIL"} (${passed + failed} checks)`);
    if (failed > 0 || !invariantPass) process.exitCode = 1;
  } catch (error) {
    console.error("SUITE ERROR:", error);
    process.exitCode = 1;
  } finally {
    try {
      await cleanup();
    } catch (error) {
      console.error("CLEANUP ERROR:", error);
      process.exitCode = 1;
    }
    await pool.end();
  }
}

void main();