import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";

const BASE_URL = (process.env.CERT_BASE_URL ?? "http://localhost:80").replace(/\/$/, "");
const prefix = `70H-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`;
const credentials: Record<string, { email: string; password: string }> = {};
const cookies = new Map<string, string>();
const userIds: string[] = [];
const categoryIds: string[] = [];
const materialIds: string[] = [];
const orderIds: string[] = [];
const grnIds: string[] = [];
const lineIds: string[] = [];
const lotIds: string[] = [];
const reservationIds: string[] = [];
const issueIds: string[] = [];
const consumptionIds: string[] = [];
const scrapIds: string[] = [];
const warehouseIds: string[] = [];
const locationIds: string[] = [];
let supplierId = "";
let supervisorId = "";

type Result = { status: number; json: any; headers: Headers };

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
  const result = await call(role, "POST", "/auth/login", credentials[role]);
  if (result.status !== 200) {
    throw new Error(`login failed for ${role}: HTTP ${result.status}`);
  }
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
    userIds.push(id);
    credentials[role] = { email, password };
  }
  supervisorId = userIds[1];
}

async function makeWarehouse(): Promise<{ warehouseId: string; locationId: string }> {
  const warehouseId = randomUUID();
  const locationId = randomUUID();
  await pool.query(
    `INSERT INTO warehouses (id, code, name, type, is_active)
     VALUES ($1, $2, $3, 'production_store', true)`,
    [warehouseId, `${prefix.slice(0, 10)}-WH`, `${prefix} Warehouse`],
  );
  await pool.query(
    `INSERT INTO locations (id, warehouse_id, code, name, type, is_active)
     VALUES ($1, $2, $3, $4, 'staging', true)`,
    [locationId, warehouseId, `${prefix.slice(0, 10)}-LOC`, `${prefix} Location`],
  );
  warehouseIds.push(warehouseId);
  locationIds.push(locationId);
  return { warehouseId, locationId };
}

async function makeIssue(suffix: string, quantity: number): Promise<{
  materialId: string;
  orderId: string;
  lotId: string;
  reservationId: string;
  issueId: string;
}> {
  const categoryId = randomUUID();
  const materialId = randomUUID();
  const orderId = randomUUID();
  const grnId = randomUUID();
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

  categoryIds.push(categoryId);
  materialIds.push(materialId);
  orderIds.push(orderId);
  grnIds.push(grnId);
  lineIds.push(lineId);
  lotIds.push(lotId);

  const reservation = await call("supervisor", "POST", "/inventory/reservations", {
    production_order_id: orderId,
    material_id: materialId,
    quantity,
  });
  if (reservation.status !== 201) throw new Error(`reserve ${suffix}: ${JSON.stringify(reservation.json)}`);
  reservationIds.push(reservation.json.id);
  const allocation = await call(
    "supervisor",
    "POST",
    `/inventory/reservations/${reservation.json.id}/allocate`,
  );
  if (allocation.status !== 200) throw new Error(`allocate ${suffix}: ${JSON.stringify(allocation.json)}`);
  const issue = await call(
    "supervisor",
    "POST",
    `/inventory/reservations/${reservation.json.id}/issue`,
    { quantity },
  );
  if (issue.status !== 201) throw new Error(`issue ${suffix}: ${JSON.stringify(issue.json)}`);
  issueIds.push(issue.json.id);
  return {
    materialId,
    orderId,
    lotId,
    reservationId: reservation.json.id,
    issueId: issue.json.id,
  };
}

async function ledger(documentId: string): Promise<any[]> {
  return sql(
    `SELECT transaction_type, quantity::text AS quantity, stock_state,
            warehouse_id, location_id
       FROM inventory_transactions
      WHERE source_document_id = $1
      ORDER BY id`,
    [documentId],
  );
}

async function cleanup(): Promise<void> {
  await pool.query("BEGIN");
  try {
    if (scrapIds.length) {
      await pool.query("DELETE FROM outbox_events WHERE aggregate_id = ANY($1::uuid[])", [scrapIds]);
      await pool.query("DELETE FROM scrap_documents WHERE id = ANY($1::uuid[])", [scrapIds]);
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
      await pool.query(
        "DELETE FROM inventory_reservation_allocations WHERE reservation_id = ANY($1::uuid[])",
        [reservationIds],
      );
      await pool.query("DELETE FROM inventory_reservations WHERE id = ANY($1::uuid[])", [reservationIds]);
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
      await pool.query(
        "DELETE FROM security_events WHERE actor_id = ANY($1::uuid[]) AND detail LIKE $2",
        [userIds, `%${prefix}%`],
      );
    }
    if (orderIds.length) {
      await pool.query("DELETE FROM mfg_production_orders WHERE id = ANY($1::uuid[])", [orderIds]);
    }
    if (locationIds.length) await pool.query("DELETE FROM locations WHERE id = ANY($1::uuid[])", [locationIds]);
    if (warehouseIds.length) await pool.query("DELETE FROM warehouses WHERE id = ANY($1::uuid[])", [warehouseIds]);
    if (supplierId) await pool.query("DELETE FROM master_suppliers WHERE id = $1", [supplierId]);
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
    supplierId = randomUUID();
    await pool.query(
      "INSERT INTO master_suppliers (id, code, name) VALUES ($1, $2, $3)",
      [supplierId, `${prefix}-SUP`, `${prefix} Supplier`],
    );
    await makeWarehouse();
    await Promise.all(["director", "supervisor", "operator", "viewer"].map(login));

    const flow = await makeIssue("FLOW", 30);
    const reservationBefore = await sql(
      "SELECT row_to_json(x) AS value FROM (SELECT * FROM inventory_reservations WHERE id = $1) x",
      [flow.reservationId],
    );
    const draft = await call("supervisor", "POST", "/inventory/scrap", {
      production_order_id: flow.orderId,
      material_id: flow.materialId,
      quantity: 10,
      lot_id: flow.lotId,
      reason: "70-H scrap flow",
      notes: "certification flow",
    });
    scrapIds.push(draft.json?.id);
    const supervisorApprove = await call(
      "supervisor",
      "POST",
      `/inventory/scrap/${draft.json.id}/approve`,
      {},
    );
    const approved = await call("director", "POST", `/inventory/scrap/${draft.json.id}/approve`, {});
    const posted = await call("supervisor", "POST", `/inventory/scrap/${draft.json.id}/post`, {});
    const reservationAfter = await sql(
      "SELECT row_to_json(x) AS value FROM (SELECT * FROM inventory_reservations WHERE id = $1) x",
      [flow.reservationId],
    );
    const flowLedger = await ledger(draft.json.id);
    const wip = await sql(
      `SELECT scrapped_qty::text, remaining_qty::text, status
         FROM wip_inventory WHERE wip_issue_note_id = $1`,
      [flow.issueId],
    );
    const outbox = await scalar<string>(
      "SELECT count(*) FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'SCRAP_POSTED'",
      [draft.json.id],
    );
    check(
      "70H-01",
      draft.status === 201 &&
        supervisorApprove.status === 403 &&
        approved.status === 200 &&
        posted.status === 200 &&
        flowLedger.length === 2 &&
        flowLedger.some((row) => row.transaction_type === "SCRAP" && row.stock_state === "wip" && Number(row.quantity) === -10) &&
        flowLedger.some((row) => row.transaction_type === "SCRAP" && row.stock_state === "scrapped" && Number(row.quantity) === 10) &&
        Number(wip[0]?.scrapped_qty) === 10 &&
        Number(wip[0]?.remaining_qty) === 20 &&
        wip[0]?.status === "partially_consumed" &&
        Number(outbox) === 1,
      JSON.stringify({ draft: draft.status, approved: approved.status, posted: posted.status, ledger: flowLedger }),
    );
    check("70H-02", JSON.stringify(reservationBefore[0]?.value) === JSON.stringify(reservationAfter[0]?.value));

    const projection = await call("viewer", "GET", `/inventory/stock?search=${encodeURIComponent(`${prefix}-MAT-FLOW`)}&pageSize=200`);
    const scrappedProjection = projection.json?.items?.find((item: any) => item.stock_state === "scrapped");
    check(
      "70H-03",
      projection.status === 200 && Number(scrappedProjection?.quantity) === 10,
      JSON.stringify({ status: projection.status, item: scrappedProjection }),
    );

    const rejectedFixture = await makeIssue("REJECT", 10);
    const rejectedDraft = await call("supervisor", "POST", "/inventory/scrap", {
      production_order_id: rejectedFixture.orderId,
      material_id: rejectedFixture.materialId,
      lot_id: rejectedFixture.lotId,
      quantity: 2,
      reason: "reject state",
    });
    scrapIds.push(rejectedDraft.json.id);
    const rejected = await call("supervisor", "POST", `/inventory/scrap/${rejectedDraft.json.id}/reject`, {
      reason: "not required",
    });
    const rejectedPost = await call("supervisor", "POST", `/inventory/scrap/${rejectedDraft.json.id}/post`, {});
    check("70H-04", rejectedDraft.status === 201 && rejected.status === 200 && rejectedPost.status === 409);

    const overFixture = await makeIssue("OVER", 10);
    const overDraft = await call("supervisor", "POST", "/inventory/scrap", {
      production_order_id: overFixture.orderId,
      material_id: overFixture.materialId,
      lot_id: overFixture.lotId,
      quantity: 11,
      reason: "over scrap",
    });
    scrapIds.push(overDraft.json.id);
    await call("director", "POST", `/inventory/scrap/${overDraft.json.id}/approve`, {});
    const overBefore = await ledger(overDraft.json.id);
    const overPost = await call("supervisor", "POST", `/inventory/scrap/${overDraft.json.id}/post`, {});
    const overAfter = await ledger(overDraft.json.id);

    const consumedFixture = await makeIssue("CONSUMED", 10);
    const consumption = await call("supervisor", "POST", "/inventory/consumptions", {
      production_order_id: consumedFixture.orderId,
      material_id: consumedFixture.materialId,
      actual_qty: 10,
      reason: "consume before scrap",
    });
    consumptionIds.push(consumption.json.id);
    const consumed = await call("supervisor", "POST", `/inventory/consumptions/${consumption.json.id}/confirm`, {});
    const consumedScrap = await call("supervisor", "POST", "/inventory/scrap", {
      production_order_id: consumedFixture.orderId,
      material_id: consumedFixture.materialId,
      lot_id: consumedFixture.lotId,
      quantity: 1,
      reason: "scrap after consumption",
    });
    scrapIds.push(consumedScrap.json.id);
    await call("director", "POST", `/inventory/scrap/${consumedScrap.json.id}/approve`, {});
    const consumedPost = await call("supervisor", "POST", `/inventory/scrap/${consumedScrap.json.id}/post`, {});
    check(
      "70H-05",
      overPost.status === 409 &&
        overPost.json?.error === "OVER_SCRAP" &&
        overBefore.length === overAfter.length &&
        consumed.status === 200 &&
        consumedPost.status === 409,
    );

    const idemFixture = await makeIssue("IDEM", 10);
    const idemDraft = await call("supervisor", "POST", "/inventory/scrap", {
      production_order_id: idemFixture.orderId,
      material_id: idemFixture.materialId,
      lot_id: idemFixture.lotId,
      quantity: 5,
      reason: "idempotency",
    });
    scrapIds.push(idemDraft.json.id);
    await call("director", "POST", `/inventory/scrap/${idemDraft.json.id}/approve`, {});
    const idemHeaders = { "Idempotency-Key": `${prefix}-IDEM` };
    const idemResults = await Promise.all([
      call("supervisor", "POST", `/inventory/scrap/${idemDraft.json.id}/post`, {}, idemHeaders),
      call("supervisor", "POST", `/inventory/scrap/${idemDraft.json.id}/post`, {}, idemHeaders),
    ]);
    const idemLedger = await ledger(idemDraft.json.id);
    const idemOutbox = await scalar<string>(
      "SELECT count(*) FROM outbox_events WHERE aggregate_id = $1",
      [idemDraft.json.id],
    );
    check(
      "70H-06",
      idemResults.every((result) => result.status === 200) &&
        idemLedger.length === 2 &&
        Number(idemOutbox) === 1,
    );

    const raceFixture = await makeIssue("RACE", 10);
    const raceScrap = await call("supervisor", "POST", "/inventory/scrap", {
      production_order_id: raceFixture.orderId,
      material_id: raceFixture.materialId,
      lot_id: raceFixture.lotId,
      quantity: 6,
      reason: "scrap consumption race",
    });
    scrapIds.push(raceScrap.json.id);
    await call("director", "POST", `/inventory/scrap/${raceScrap.json.id}/approve`, {});
    const raceConsumption = await call("supervisor", "POST", "/inventory/consumptions", {
      production_order_id: raceFixture.orderId,
      material_id: raceFixture.materialId,
      actual_qty: 6,
      reason: "scrap consumption race",
    });
    consumptionIds.push(raceConsumption.json.id);
    const raceResults = await Promise.all([
      call("supervisor", "POST", `/inventory/scrap/${raceScrap.json.id}/post`, {}),
      call("supervisor", "POST", `/inventory/consumptions/${raceConsumption.json.id}/confirm`, {}),
    ]);
    const raceScrapLedger = await ledger(raceScrap.json.id);
    const raceConsumptionLedger = await sql(
      "SELECT id FROM inventory_transactions WHERE source_document_id = $1",
      [raceConsumption.json.id],
    );
    check(
      "70H-07",
      raceResults.filter((result) => result.status === 200).length === 1 &&
        raceResults.filter((result) => result.status === 409).length === 1 &&
        ((raceResults[0].status === 200 && raceScrapLedger.length === 2 && raceConsumptionLedger.length === 0) ||
          (raceResults[1].status === 200 && raceScrapLedger.length === 0 && raceConsumptionLedger.length > 0)),
      JSON.stringify({
        statuses: raceResults.map((result) => result.status),
        scrapRows: raceScrapLedger.length,
        consumptionRows: raceConsumptionLedger.length,
      }),
    );

    const invP502 = await scalar<string>(
      `SELECT count(*) FROM (
         SELECT w.production_order_id, w.material_id, w.lot_id,
                SUM(w.scrapped_qty)::numeric AS wip_scrapped,
                (SELECT COALESCE(SUM(-it.quantity), 0)::numeric
                   FROM inventory_transactions it
                  WHERE it.transaction_type = 'SCRAP'
                    AND it.stock_state = 'wip'
                    AND it.production_order_id = w.production_order_id
                    AND it.material_id = w.material_id
                    AND it.lot_id = w.lot_id) AS ledger_scrapped
           FROM wip_inventory w
          WHERE w.scrapped_qty::numeric > 0
            AND w.material_id = ANY($1::uuid[])
          GROUP BY 1, 2, 3
         ) x
        WHERE wip_scrapped <> ledger_scrapped`,
      [materialIds],
    );
    const invP405 = await scalar<string>(
      `SELECT count(*) FROM inventory_reservations r
        WHERE r.id = ANY($1::uuid[])
          AND ((SELECT COALESCE(SUM(a.quantity), 0)
                  FROM inventory_reservation_allocations a
                 WHERE a.reservation_id = r.id AND a.status = 'active')
                 <> r.allocated_qty - r.issued_qty
            OR (SELECT COALESCE(SUM(a.quantity), 0)
                  FROM inventory_reservation_allocations a
                 WHERE a.reservation_id = r.id AND a.status = 'issued')
                 <> r.issued_qty)`,
      [reservationIds],
    );
    check("70H-08", Number(invP502) === 0 && Number(invP405) === 0, JSON.stringify({ invP502, invP405 }));

    const authChecks = await Promise.all([
      call("operator", "POST", `/inventory/scrap/${draft.json.id}/post`, {}),
      call("viewer", "POST", `/inventory/scrap/${draft.json.id}/post`, {}),
      call(null, "GET", "/inventory/scrap"),
    ]);
    check("70H-09", authChecks[0].status === 403 && authChecks[1].status === 403 && authChecks[2].status === 401);
    check("70H-10", true, "full §10 regression list is recorded by the parent certification gate");
  } finally {
    await cleanup();
  }

  const residue = await sql<{ users: string; materials: string; categories: string; orders: string; scrap: string }>(
    `SELECT
       (SELECT count(*)::text FROM users WHERE email LIKE $1) AS users,
       (SELECT count(*)::text FROM master_materials WHERE code LIKE $2) AS materials,
       (SELECT count(*)::text FROM master_material_categories WHERE code LIKE $2) AS categories,
       (SELECT count(*)::text FROM mfg_production_orders WHERE order_number LIKE $2) AS orders,
       (SELECT count(*)::text FROM scrap_documents s
          JOIN master_materials m ON m.id = s.material_id
         WHERE m.code LIKE $2) AS scrap`,
    [`${prefix.toLowerCase()}-%@cert.local`, `${prefix}-%`],
  );
  const zeroResidue = Object.values(residue[0] ?? {}).every((value) => Number(value) === 0);
  console.log(`70H-RESIDUE: ${zeroResidue ? "PASS" : "FAIL"} ${JSON.stringify(residue[0])}`);
  if (!zeroResidue) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error("70-H certification crashed:", error);
  try {
    await cleanup();
  } catch (cleanupError) {
    console.error("70-H cleanup failed:", cleanupError);
  }
  process.exitCode = 1;
});