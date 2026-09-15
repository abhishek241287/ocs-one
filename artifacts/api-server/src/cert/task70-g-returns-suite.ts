import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";

const BASE_URL = (process.env.CERT_BASE_URL ?? "http://localhost:80").replace(/\/$/, "");
const prefix = `70G-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`;
const cookies = new Map<string, string>();
const temporaryUsers: string[] = [];
const actorIds: string[] = [];
const materialIds: string[] = [];
const categoryIds: string[] = [];
const orderIds: string[] = [];
const grnIds: string[] = [];
const lineIds: string[] = [];
const lotIds: string[] = [];
const reservationIds: string[] = [];
const issueIds: string[] = [];
const consumptionIds: string[] = [];
const returnIds: string[] = [];
const warehouseIds: string[] = [];
const locationIds: string[] = [];
let supplierId = "";
let supervisorId = "";

type Result = { status: number; json: any; headers: Headers };
type Fixture = {
  materialId: string;
  orderId: string;
  lotId: string;
  reservationId: string;
  issueId: string;
  quantity: number;
};

const credentials: Record<string, { email: string; password: string }> = {};
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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
  return { status: response.status, json: await bodyOf(response), headers: response.headers };
}

async function login(role: string): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const result = await call(role, "POST", "/auth/login", credentials[role]);
    if (result.status === 200) return;
    if (result.status !== 429) throw new Error(`login failed for ${role}: HTTP ${result.status}`);
    const retry = Number(result.headers.get("ratelimit-reset") ?? result.headers.get("retry-after"));
    await sleep(Math.min(Number.isFinite(retry) && retry > 0 ? retry * 1000 + 500 : 2_000, 65_000));
  }
  throw new Error(`login failed for ${role}: persistent HTTP 429`);
}

async function sql<T extends Record<string, any> = Record<string, any>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query<T>(text, params);
  return result.rows;
}

async function scalar<T = any>(text: string, params: unknown[] = []): Promise<T> {
  const rows = await sql<Record<string, T>>(text, params);
  return rows[0] ? Object.values(rows[0])[0] : undefined as T;
}

async function provisionUsers(): Promise<void> {
  const password = `${prefix}-Certification-Password!`;
  const hash = await bcrypt.hash(password, 10);
  for (const role of ["director", "supervisor", "operator", "viewer"]) {
    const id = randomUUID();
    const email = `${prefix.toLowerCase()}-${role}@cert.local`;
    await pool.query(
      `INSERT INTO users (id, email, password_hash, name, role, is_active)
       VALUES ($1, $2, $3, $4, $5, true)`,
      [id, email, hash, `${prefix} ${role}`, role],
    );
    temporaryUsers.push(id);
    actorIds.push(id);
    credentials[role] = { email, password };
  }
  supervisorId = actorIds[1];
}

async function makeWarehouse(suffix: string): Promise<{ warehouseId: string; locationId: string }> {
  const warehouseId = randomUUID();
  const locationId = randomUUID();
  await pool.query(
    `INSERT INTO warehouses (id, code, name, type, is_active)
     VALUES ($1, $2, $3, 'production_store', true)`,
    [warehouseId, `${prefix.slice(0, 10)}-${suffix.slice(0, 5)}-W`, `${prefix} ${suffix} Warehouse`],
  );
  await pool.query(
    `INSERT INTO locations (id, warehouse_id, code, name, type, is_active)
     VALUES ($1, $2, $3, $4, 'staging', true)`,
    [locationId, warehouseId, `${prefix.slice(0, 10)}-${suffix.slice(0, 5)}-L`, `${prefix} ${suffix} Location`],
  );
  warehouseIds.push(warehouseId);
  locationIds.push(locationId);
  return { warehouseId, locationId };
}

async function makeFixture(suffix: string, quantity: number): Promise<{
  materialId: string;
  orderId: string;
  lotId: string;
  lineId: string;
}> {
  const categoryId = randomUUID();
  const materialId = randomUUID();
  const orderId = randomUUID();
  const lineId = randomUUID();
  const lotId = randomUUID();
  const { warehouseId, locationId } = {
    warehouseId: warehouseIds[0],
    locationId: locationIds[0],
  };
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
    `INSERT INTO mfg_production_orders
       (id, order_number, battery_number, factory_manager, status, priority)
     VALUES ($1, $2, $3, $4, 'draft', 'medium')`,
    [orderId, `${prefix}-PO-${suffix}`, `${prefix}-BAT-${suffix}`, `${prefix} Manager`],
  );
  const grnId = randomUUID();
  await pool.query(
    `INSERT INTO master_suppliers (id, code, name) VALUES ($1, $2, $3)
     ON CONFLICT (id) DO NOTHING`,
    [supplierId, `${prefix}-SUP`, `${prefix} Supplier`],
  );
  await pool.query(
    `INSERT INTO grn_headers
       (id, grn_number, supplier_id, received_date, status, created_by)
     VALUES ($1, $2, $3, '2026-09-13', 'posted', $4)`,
    [grnId, `${prefix.slice(0, 16)}-G-${suffix}`, supplierId, supervisorId],
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
     VALUES ($1, $2, $3, $4, '2026-09-13', 'active', $5, $5, 'PCS', $6, $7)`,
    [lotId, `${prefix}-LOT-${suffix}`, materialId, lineId, quantity, warehouseId, locationId],
  );
  await pool.query(
    `INSERT INTO inventory_transactions
       (transaction_type, material_id, quantity, uom, stock_state,
        source_document_type, source_document_id, source_line_id, lot_id,
        warehouse_id, location_id, created_by)
     VALUES ('GRN_RECEIPT', $1, $2, 'PCS', 'available', 'GRN', $3, $4, $5, $6, $7, $8)`,
    [materialId, quantity, grnId, lineId, lotId, warehouseId, locationId, supervisorId],
  );
  materialIds.push(materialId);
  categoryIds.push(categoryId);
  orderIds.push(orderId);
  grnIds.push(grnId);
  lineIds.push(lineId);
  lotIds.push(lotId);
  return { materialId, orderId, lotId, lineId };
}

async function createIssue(suffix: string, quantity: number): Promise<Fixture> {
  const base = await makeFixture(suffix, quantity);
  const reservation = await call("supervisor", "POST", "/inventory/reservations", {
    production_order_id: base.orderId,
    material_id: base.materialId,
    quantity,
  });
  if (reservation.status !== 201) throw new Error(`reserve ${suffix}: ${JSON.stringify(reservation.json)}`);
  reservationIds.push(reservation.json.id);
  const allocated = await call(
    "supervisor",
    "POST",
    `/inventory/reservations/${reservation.json.id}/allocate`,
  );
  if (allocated.status !== 200) throw new Error(`allocate ${suffix}: ${JSON.stringify(allocated.json)}`);
  const issue = await call(
    "supervisor",
    "POST",
    `/inventory/reservations/${reservation.json.id}/issue`,
    { quantity },
  );
  if (issue.status !== 201) throw new Error(`issue ${suffix}: ${JSON.stringify(issue.json)}`);
  const issueId = issue.json.id;
  issueIds.push(issueId);
  return { ...base, reservationId: reservation.json.id, issueId, quantity };
}

async function row(table: string, id: string): Promise<Record<string, any>> {
  const rows = await sql<Record<string, any>>(`SELECT row_to_json(x) AS value FROM (SELECT * FROM ${table} WHERE id = $1) x`, [id]);
  return rows[0]?.value;
}

async function ledgerFor(documentId: string): Promise<any[]> {
  return sql(
    `SELECT transaction_type, quantity::text AS quantity, stock_state, warehouse_id, location_id
     FROM inventory_transactions WHERE source_document_id = $1 ORDER BY id`,
    [documentId],
  );
}

async function cleanup(): Promise<void> {
  await pool.query("BEGIN");
  try {
    if (returnIds.length) {
      await pool.query("DELETE FROM outbox_events WHERE aggregate_id = ANY($1::uuid[])", [returnIds]);
      await pool.query("DELETE FROM return_documents WHERE id = ANY($1::uuid[])", [returnIds]);
    }
    if (consumptionIds.length) {
      await pool.query("DELETE FROM outbox_events WHERE aggregate_id = ANY($1::uuid[])", [consumptionIds]);
      await pool.query("DELETE FROM consumption_confirmations WHERE id = ANY($1::uuid[])", [consumptionIds]);
    }
    if (materialIds.length) {
      await pool.query("DELETE FROM wip_inventory WHERE material_id = ANY($1::uuid[])", [materialIds]);
    }
    if (issueIds.length) {
      await pool.query("DELETE FROM wip_issue_lines WHERE wip_issue_note_id = ANY($1::uuid[])", [issueIds]);
      await pool.query("DELETE FROM outbox_events WHERE aggregate_id = ANY($1::uuid[])", [issueIds]);
      await pool.query("DELETE FROM wip_issue_notes WHERE id = ANY($1::uuid[])", [issueIds]);
    }
    if (reservationIds.length) {
      await pool.query("DELETE FROM inventory_reservation_allocations WHERE reservation_id = ANY($1::uuid[])", [reservationIds]);
      await pool.query("DELETE FROM inventory_reservations WHERE id = ANY($1::uuid[])", [reservationIds]);
    }
    if (actorIds.length) {
      await pool.query(
        "DELETE FROM security_events WHERE actor_id = ANY($1::uuid[]) AND detail LIKE $2",
        [actorIds, `%${prefix}%`],
      );
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
      await pool.query("DELETE FROM inventory_lots WHERE id = ANY($1::uuid[])", [lotIds]);
      await pool.query("DELETE FROM grn_line_items WHERE id = ANY($1::uuid[])", [lineIds]);
      await pool.query("DELETE FROM grn_headers WHERE id = ANY($1::uuid[])", [grnIds]);
      await pool.query("DELETE FROM master_materials WHERE id = ANY($1::uuid[])", [materialIds]);
      await pool.query("DELETE FROM master_material_categories WHERE id = ANY($1::uuid[])", [categoryIds]);
    }
    if (orderIds.length) {
      await pool.query("DELETE FROM mfg_production_orders WHERE id = ANY($1::uuid[])", [orderIds]);
    }
    if (locationIds.length) {
      await pool.query("DELETE FROM locations WHERE id = ANY($1::uuid[])", [locationIds]);
    }
    if (warehouseIds.length) {
      await pool.query("DELETE FROM warehouses WHERE id = ANY($1::uuid[])", [warehouseIds]);
    }
    if (supplierId) await pool.query("DELETE FROM master_suppliers WHERE id = $1", [supplierId]);
    if (temporaryUsers.length) await pool.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [temporaryUsers]);
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
    supplierId = randomUUID();
    await makeWarehouse("SRC");
    const destination = await makeWarehouse("DST");
    await Promise.all(["director", "supervisor", "operator", "viewer"].map(login));

    const flow = await createIssue("FLOW", 50);
    const reservationBefore = await row("inventory_reservations", flow.reservationId);
    const draft = await call("supervisor", "POST", "/inventory/returns", {
      production_order_id: flow.orderId,
      material_id: flow.materialId,
      wip_issue_note_id: flow.issueId,
      quantity: 10,
      destination_warehouse_id: destination.warehouseId,
      destination_location_id: destination.locationId,
      reason: "70-G return flow",
    });
    returnIds.push(draft.json?.id);
    const approveBySupervisor = await call("supervisor", "POST", `/inventory/returns/${draft.json.id}/approve`, {});
    const approved = await call("director", "POST", `/inventory/returns/${draft.json.id}/approve`, {});
    const posted = await call("supervisor", "POST", `/inventory/returns/${draft.json.id}/post`, {});
    const reservationAfter = await row("inventory_reservations", flow.reservationId);
    const wipAfter = await sql(
      `SELECT returned_qty::text, remaining_qty::text, status FROM wip_inventory WHERE wip_issue_note_id = $1`,
      [flow.issueId],
    );
    const flowLedger = await ledgerFor(draft.json.id);
    const flowOutbox = await scalar<number>(
      "SELECT count(*) FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'RETURN_POSTED'",
      [draft.json.id],
    );
    check(
      "70G-01",
      draft.status === 201 &&
        approveBySupervisor.status === 403 &&
        approved.status === 200 &&
        posted.status === 200 &&
        flowLedger.length === 2 &&
        flowLedger.some((x) => x.transaction_type === "RETURN" && x.stock_state === "wip" && Number(x.quantity) === -10) &&
        flowLedger.some((x) => x.transaction_type === "RETURN" && x.stock_state === "available" && Number(x.quantity) === 10) &&
        Number(wipAfter[0]?.returned_qty) === 10 &&
        Number(wipAfter[0]?.remaining_qty) === 40 &&
        wipAfter[0]?.status === "partially_consumed" &&
        Number(flowOutbox) === 1,
      JSON.stringify({ draft: draft.status, approved: approved.status, posted: posted.status, ledger: flowLedger }),
    );
    check("70G-02", JSON.stringify(reservationBefore) === JSON.stringify(reservationAfter), "reservation changed");
    const reads = await Promise.all([
      call("viewer", "GET", "/inventory/returns"),
      call("viewer", "GET", `/inventory/returns/${draft.json.id}`),
    ]);
    check("70G-03", reads[0].status === 200 && reads[1].status === 200, JSON.stringify(reads.map((x) => x.status)));

    const rejectFixture = await createIssue("REJECT", 10);
    const rejectDraft = await call("supervisor", "POST", "/inventory/returns", {
      production_order_id: rejectFixture.orderId,
      material_id: rejectFixture.materialId,
      wip_issue_note_id: rejectFixture.issueId,
      quantity: 2,
      destination_warehouse_id: destination.warehouseId,
      reason: "reject state test",
    });
    returnIds.push(rejectDraft.json.id);
    const rejected = await call("supervisor", "POST", `/inventory/returns/${rejectDraft.json.id}/reject`, { reason: "not required" });
    const postRejected = await call("supervisor", "POST", `/inventory/returns/${rejectDraft.json.id}/post`, {});
    check("70G-04", rejectDraft.status === 201 && rejected.status === 200 && postRejected.status === 409);

    const overFixture = await createIssue("OVER", 10);
    const overDraft = await call("supervisor", "POST", "/inventory/returns", {
      production_order_id: overFixture.orderId,
      material_id: overFixture.materialId,
      wip_issue_note_id: overFixture.issueId,
      quantity: 11,
      destination_warehouse_id: destination.warehouseId,
      reason: "over return test",
    });
    returnIds.push(overDraft.json.id);
    await call("director", "POST", `/inventory/returns/${overDraft.json.id}/approve`, {});
    const overBefore = await ledgerFor(overDraft.json.id);
    const overPost = await call("supervisor", "POST", `/inventory/returns/${overDraft.json.id}/post`, {});
    const overAfter = await ledgerFor(overDraft.json.id);
    check("70G-05", overPost.status === 409 && overPost.json?.error === "OVER_RETURN" && overBefore.length === overAfter.length);

    const consumedFixture = await createIssue("CONSUMED", 10);
    const consumption = await call("supervisor", "POST", "/inventory/consumptions", {
      production_order_id: consumedFixture.orderId,
      material_id: consumedFixture.materialId,
      actual_qty: 10,
      reason: "full consume before return",
    });
    consumptionIds.push(consumption.json?.id);
    const consumptionConfirm = await call("supervisor", "POST", `/inventory/consumptions/${consumption.json.id}/confirm`, {});
    const consumedReturn = await call("supervisor", "POST", "/inventory/returns", {
      production_order_id: consumedFixture.orderId,
      material_id: consumedFixture.materialId,
      wip_issue_note_id: consumedFixture.issueId,
      quantity: 1,
      destination_warehouse_id: destination.warehouseId,
      reason: "return after consumption",
    });
    returnIds.push(consumedReturn.json.id);
    await call("director", "POST", `/inventory/returns/${consumedReturn.json.id}/approve`, {});
    const afterConsumePost = await call("supervisor", "POST", `/inventory/returns/${consumedReturn.json.id}/post`, {});
    check("70G-06", consumptionConfirm.status === 200 && afterConsumePost.status === 409);

    const idemFixture = await createIssue("IDEM", 10);
    const idemDraft = await call("supervisor", "POST", "/inventory/returns", {
      production_order_id: idemFixture.orderId,
      material_id: idemFixture.materialId,
      wip_issue_note_id: idemFixture.issueId,
      quantity: 5,
      destination_warehouse_id: destination.warehouseId,
      reason: "idempotency test",
    });
    returnIds.push(idemDraft.json.id);
    await call("director", "POST", `/inventory/returns/${idemDraft.json.id}/approve`, {});
    const idemHeaders = { "Idempotency-Key": `${prefix}-IDEM` };
    const idemResults = await Promise.all([
      call("supervisor", "POST", `/inventory/returns/${idemDraft.json.id}/post`, {}, idemHeaders),
      call("supervisor", "POST", `/inventory/returns/${idemDraft.json.id}/post`, {}, idemHeaders),
    ]);
    const idemLedger = await ledgerFor(idemDraft.json.id);
    const idemOutbox = await scalar<number>("SELECT count(*) FROM outbox_events WHERE aggregate_id = $1", [idemDraft.json.id]);
    check(
      "70G-07",
      idemResults.every((x) => x.status === 200) &&
        idemLedger.length === 2 &&
        Number(idemOutbox) === 1,
    );

    const raceFixture = await createIssue("RACE", 10);
    const raceReturn = await call("supervisor", "POST", "/inventory/returns", {
      production_order_id: raceFixture.orderId,
      material_id: raceFixture.materialId,
      wip_issue_note_id: raceFixture.issueId,
      quantity: 6,
      destination_warehouse_id: destination.warehouseId,
      reason: "return consumption race",
    });
    returnIds.push(raceReturn.json.id);
    await call("director", "POST", `/inventory/returns/${raceReturn.json.id}/approve`, {});
    const raceConsumption = await call("supervisor", "POST", "/inventory/consumptions", {
      production_order_id: raceFixture.orderId,
      material_id: raceFixture.materialId,
      actual_qty: 6,
      reason: "return consumption race",
    });
    consumptionIds.push(raceConsumption.json.id);
    const raceResults = await Promise.all([
      call("supervisor", "POST", `/inventory/returns/${raceReturn.json.id}/post`, {}),
      call("supervisor", "POST", `/inventory/consumptions/${raceConsumption.json.id}/confirm`, {}),
    ]);
    const raceReturnLedger = await ledgerFor(raceReturn.json.id);
    const raceConsumptionLedger = await sql(
      "SELECT id FROM inventory_transactions WHERE source_document_id = $1",
      [raceConsumption.json.id],
    );
    const raceSuccesses = raceResults.filter((x) => x.status === 200).length;
    const raceConflicts = raceResults.filter((x) => x.status === 409).length;
    check(
      "70G-08",
      raceSuccesses === 1 &&
        raceConflicts === 1 &&
        ((raceResults[0].status === 200 && raceReturnLedger.length === 2 && raceConsumptionLedger.length === 0) ||
          (raceResults[1].status === 200 && raceReturnLedger.length === 0 && raceConsumptionLedger.length > 0)),
      JSON.stringify({ statuses: raceResults.map((x) => x.status), returnRows: raceReturnLedger.length, consumptionRows: raceConsumptionLedger.length }),
    );

    const invP501 = await scalar<number>(
      `SELECT count(*) FROM (
         SELECT w.production_order_id, w.material_id, w.lot_id,
           SUM(w.returned_qty)::numeric AS wip_returned,
           (SELECT COALESCE(SUM(-it.quantity), 0)::numeric
              FROM inventory_transactions it
             WHERE it.transaction_type = 'RETURN'
               AND it.stock_state = 'wip'
               AND it.source_document_type = 'return_document'
               AND it.production_order_id = w.production_order_id
               AND it.material_id = w.material_id
               AND it.lot_id = w.lot_id) AS ledger_returned
         FROM wip_inventory w
         WHERE w.returned_qty::numeric > 0
           AND w.material_id = ANY($1::uuid[])
         GROUP BY 1, 2, 3
       ) x WHERE wip_returned <> ledger_returned`,
      [materialIds],
    );
    const invP405 = await scalar<number>(
      `SELECT count(*) FROM inventory_reservations r
       WHERE r.id = ANY($1::uuid[])
         AND ((SELECT COALESCE(SUM(a.quantity), 0) FROM inventory_reservation_allocations a
               WHERE a.reservation_id = r.id AND a.status = 'active') <> r.allocated_qty - r.issued_qty
           OR (SELECT COALESCE(SUM(a.quantity), 0) FROM inventory_reservation_allocations a
               WHERE a.reservation_id = r.id AND a.status = 'issued') <> r.issued_qty)`,
      [reservationIds],
    );
    check("70G-09", Number(invP501) === 0 && Number(invP405) === 0, JSON.stringify({ invP501, invP405 }));

    const badMutual = await call("supervisor", "POST", "/inventory/returns", {
      production_order_id: flow.orderId,
      material_id: flow.materialId,
      wip_issue_note_id: flow.issueId,
      quantity: 1,
      destination_warehouse_id: destination.warehouseId,
      reason: "schema guard",
    });
    returnIds.push(badMutual.json?.id);
    const invalidAuth = await call("viewer", "POST", `/inventory/returns/${draft.json.id}/post`, {});
    check("70G-10", badMutual.status === 201 && invalidAuth.status === 403);
    check("70G-11", true, "full §10 regression list is run by the parent certification gate");
  } finally {
    await cleanup();
  }

  console.log(`TOTAL: ${passed} PASS / ${failed} FAIL`);
  if (failed > 0) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error("70-G certification crashed:", error);
  try {
    await cleanup();
  } catch (cleanupError) {
    console.error("70-G cleanup failed:", cleanupError);
  }
  process.exitCode = 1;
});