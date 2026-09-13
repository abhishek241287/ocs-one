import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";

const BASE_URL = (process.env.CERT_BASE_URL ?? "http://localhost:80").replace(/\/$/, "");
const prefix = `70I-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`;
const credentials: Record<string, { email: string; password: string }> = {};
const cookies = new Map<string, string>();
const userIds: string[] = [];
const categoryIds: string[] = [];
const materialIds: string[] = [];
const grnIds: string[] = [];
const lineIds: string[] = [];
const lotIds: string[] = [];
const orderIds: string[] = [];
const warehouseIds: string[] = [];
const locationIds: string[] = [];
const reservationIds: string[] = [];
const issueIds: string[] = [];
const adjustmentIds: string[] = [];
const consumptionIds: string[] = [];
let supplierId = "";
let supervisorId = "";

type Result = { status: number; json: any };

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

async function login(role: string): Promise<void> {
  const result = await call(role, "POST", "/auth/login", credentials[role]);
  if (result.status !== 200) throw new Error(`login failed for ${role}: HTTP ${result.status}`);
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

async function makeStock(
  suffix: string,
  quantity: number,
  lotScoped: boolean,
  withOrder = false,
): Promise<{
  materialId: string;
  warehouseId: string;
  locationId: string;
  lotId: string | null;
  orderId: string | null;
  reservationId?: string;
}> {
  const categoryId = randomUUID();
  const materialId = randomUUID();
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
  categoryIds.push(categoryId);
  materialIds.push(materialId);

  let lotId: string | null = null;
  let lineId: string | null = null;
  if (lotScoped) {
    const grnId = randomUUID();
    lineId = randomUUID();
    lotId = randomUUID();
    await pool.query(
      `INSERT INTO grn_headers (id, grn_number, supplier_id, received_date, status, created_by)
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
    grnIds.push(grnId);
    lineIds.push(lineId);
    lotIds.push(lotId);
    await pool.query(
      `INSERT INTO inventory_transactions
         (transaction_type, material_id, quantity, uom, stock_state,
          source_document_type, source_document_id, source_line_id, lot_id,
          warehouse_id, location_id, created_by)
       VALUES ('GRN_RECEIPT', $1, $2, 'PCS', 'available', 'GRN', $3, $4, $5, $6, $7, $8)`,
      [materialId, quantity, grnId, lineId, lotId, warehouseId, locationId, supervisorId],
    );
  } else {
    await pool.query(
      `INSERT INTO inventory_transactions
         (transaction_type, material_id, quantity, uom, stock_state,
          source_document_type, source_document_id, source_line_id,
          warehouse_id, location_id, created_by)
       VALUES ('GRN_RECEIPT', $1, $2, 'PCS', 'available', 'CERT_SEED', $3, NULL, $4, $5, $6)`,
      [materialId, quantity, randomUUID(), warehouseId, locationId, supervisorId],
    );
  }

  let orderId: string | null = null;
  let reservationId: string | undefined;
  if (withOrder) {
    orderId = randomUUID();
    await pool.query(
      `INSERT INTO mfg_production_orders
         (id, order_number, battery_number, factory_manager, status, priority)
       VALUES ($1, $2, $3, $4, 'draft', 'medium')`,
      [orderId, `${prefix}-PO-${suffix}`, `${prefix}-BAT-${suffix}`, `${prefix} Manager`],
    );
    orderIds.push(orderId);
  }
  if (lotScoped && lineId) {
    grnIds.push(...[]);
  }
  return { materialId, warehouseId, locationId, lotId, orderId, reservationId };
}

async function createAdjustment(
  role: string,
  fixture: { materialId: string; warehouseId: string; locationId: string; lotId: string | null },
  type: "positive" | "negative",
  quantity: number,
): Promise<any> {
  const result = await call(role, "POST", "/inventory/adjustments", {
    material_id: fixture.materialId,
    warehouse_id: fixture.warehouseId,
    location_id: fixture.locationId,
    lot_id: fixture.lotId ?? undefined,
    type,
    quantity,
    reason: `${prefix} ${type} adjustment`,
    count_reference: `${prefix}-${type}`,
  });
  if (result.status !== 201) throw new Error(`create adjustment failed: ${JSON.stringify(result.json)}`);
  adjustmentIds.push(result.json.id);
  return result.json;
}

async function prepareAdjustment(
  fixture: { materialId: string; warehouseId: string; locationId: string; lotId: string | null },
  type: "positive" | "negative",
  quantity: number,
): Promise<any> {
  const draft = await createAdjustment("supervisor", fixture, type, quantity);
  const submit = await call("supervisor", "POST", `/inventory/adjustments/${draft.id}/submit`, {});
  if (submit.status !== 200) throw new Error(`submit failed: ${JSON.stringify(submit.json)}`);
  const approve = await call("director", "POST", `/inventory/adjustments/${draft.id}/approve`, {});
  if (approve.status !== 200) throw new Error(`approve failed: ${JSON.stringify(approve.json)}`);
  return draft;
}

async function cleanup(): Promise<void> {
  await pool.query("BEGIN");
  try {
    const aggregateIds = [...adjustmentIds, ...consumptionIds, ...issueIds, ...reservationIds].filter(Boolean);
    if (aggregateIds.length) {
      await pool.query("DELETE FROM outbox_events WHERE aggregate_id = ANY($1::uuid[])", [aggregateIds]);
    }
    if (adjustmentIds.length) {
      await pool.query("DELETE FROM inventory_adjustments WHERE id = ANY($1::uuid[])", [adjustmentIds]);
    }
    if (consumptionIds.length) {
      await pool.query("DELETE FROM consumption_confirmations WHERE id = ANY($1::uuid[])", [consumptionIds]);
    }
    if (materialIds.length) {
      await pool.query("DELETE FROM wip_inventory WHERE material_id = ANY($1::uuid[])", [materialIds]);
    }
    if (issueIds.length) {
      await pool.query("DELETE FROM wip_issue_lines WHERE wip_issue_note_id = ANY($1::uuid[])", [issueIds]);
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

    const flow = await makeStock("FLOW", 40, true);
    const positive = await prepareAdjustment(flow, "positive", 5);
    const positiveLedgerBefore = await scalar<string>(
      "SELECT count(*) FROM inventory_transactions WHERE source_document_id = $1",
      [positive.id],
    );
    const positivePost = await call("supervisor", "POST", `/inventory/adjustments/${positive.id}/post`, {});
    const positiveLedger = await sql(
      `SELECT transaction_type, quantity::text AS quantity, stock_state, source_line_id
         FROM inventory_transactions WHERE source_document_id = $1`,
      [positive.id],
    );
    const positiveOutbox = await scalar<string>(
      "SELECT count(*) FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'ADJUSTMENT_POSTED'",
      [positive.id],
    );
    check(
      "70I-01",
      positivePost.status === 200 &&
        Number(positiveLedgerBefore) === 0 &&
        positiveLedger.length === 1 &&
        positiveLedger[0].transaction_type === "ADJUSTMENT_IN" &&
        Number(positiveLedger[0].quantity) === 5 &&
        positiveLedger[0].stock_state === "available" &&
        positiveLedger[0].source_line_id !== null &&
        Number(positiveOutbox) === 1 &&
        Number(positivePost.json.variance) === 5,
      JSON.stringify({ status: positivePost.status, ledger: positiveLedger }),
    );

    const negative = await prepareAdjustment(flow, "negative", 10);
    const negativePost = await call("supervisor", "POST", `/inventory/adjustments/${negative.id}/post`, {});
    const negativeLedger = await sql(
      `SELECT transaction_type, quantity::text AS quantity, stock_state
         FROM inventory_transactions WHERE source_document_id = $1`,
      [negative.id],
    );
    check(
      "70I-02",
      negativePost.status === 200 &&
        negativeLedger.length === 1 &&
        negativeLedger[0].transaction_type === "ADJUSTMENT_OUT" &&
        Number(negativeLedger[0].quantity) === -10 &&
        negativeLedger[0].stock_state === "available",
    );

    const noLot = await call("supervisor", "POST", "/inventory/adjustments", {
      material_id: flow.materialId,
      warehouse_id: flow.warehouseId,
      type: "negative",
      quantity: 1,
      reason: `${prefix} no lot`,
    });
    check("70I-03", noLot.status === 422 && noLot.json?.error === "NEGATIVE_ADJUSTMENT_REQUIRES_LOT");

    const over = await prepareAdjustment(flow, "negative", 999);
    const overBefore = await scalar<string>(
      "SELECT count(*) FROM inventory_transactions WHERE source_document_id = $1",
      [over.id],
    );
    const overPost = await call("supervisor", "POST", `/inventory/adjustments/${over.id}/post`, {});
    const overAfter = await scalar<string>(
      "SELECT count(*) FROM inventory_transactions WHERE source_document_id = $1",
      [over.id],
    );
    check(
      "70I-04",
      overPost.status === 409 &&
        overPost.json?.error === "NEGATIVE_STOCK_PREVENTED" &&
        Number(overBefore) === 0 &&
        Number(overAfter) === 0,
    );

    const unlot = await makeStock("UNLOT", 3, false);
    const warehousePositive = await prepareAdjustment(unlot, "positive", 4);
    const warehousePositivePost = await call(
      "supervisor",
      "POST",
      `/inventory/adjustments/${warehousePositive.id}/post`,
      {},
    );
    const warehouseLedger = await sql(
      `SELECT quantity::text AS quantity, lot_id, source_line_id
         FROM inventory_transactions WHERE source_document_id = $1`,
      [warehousePositive.id],
    );
    check(
      "70I-05",
      warehousePositivePost.status === 200 &&
        warehouseLedger.length === 1 &&
        Number(warehouseLedger[0].quantity) === 4 &&
        warehouseLedger[0].lot_id === null &&
        warehouseLedger[0].source_line_id === null,
    );

    const idem = await makeStock("IDEM", 10, true);
    const idemAdjustment = await prepareAdjustment(idem, "negative", 5);
    const idemHeaders = { "Idempotency-Key": `${prefix}-IDEM` };
    const idemResults = await Promise.all([
      call("supervisor", "POST", `/inventory/adjustments/${idemAdjustment.id}/post`, {}, idemHeaders),
      call("supervisor", "POST", `/inventory/adjustments/${idemAdjustment.id}/post`, {}, idemHeaders),
    ]);
    const idemLedger = await scalar<string>(
      "SELECT count(*) FROM inventory_transactions WHERE source_document_id = $1",
      [idemAdjustment.id],
    );
    const idemOutbox = await scalar<string>(
      "SELECT count(*) FROM outbox_events WHERE aggregate_id = $1",
      [idemAdjustment.id],
    );
    check(
      "70I-06",
      idemResults.every((result) => result.status === 200) &&
        Number(idemLedger) === 1 &&
        Number(idemOutbox) === 1,
      JSON.stringify(idemResults.map((result) => result.status)),
    );

    const race = await makeStock("RACE", 40, true);
    const raceA = await prepareAdjustment(race, "negative", 30);
    const raceB = await prepareAdjustment(race, "negative", 30);
    const raceResults = await Promise.all([
      call("supervisor", "POST", `/inventory/adjustments/${raceA.id}/post`, {}),
      call("supervisor", "POST", `/inventory/adjustments/${raceB.id}/post`, {}),
    ]);
    const raceRows = await sql(
      `SELECT source_document_id, quantity::text AS quantity
         FROM inventory_transactions
        WHERE source_document_type = 'inventory_adjustment'
          AND source_document_id IN ($1, $2)`,
      [raceA.id, raceB.id],
    );
    check(
      "70I-07",
      raceResults.filter((result) => result.status === 200).length === 1 &&
        raceResults.filter((result) => result.status === 409).length === 1 &&
        raceRows.length === 1 &&
        Number(raceRows[0].quantity) === -30,
      JSON.stringify({ statuses: raceResults.map((result) => result.status), rows: raceRows }),
    );

    const overlap = await makeStock("OVERLAP", 40, true, true);
    const reservation = await call("supervisor", "POST", "/inventory/reservations", {
      production_order_id: overlap.orderId,
      material_id: overlap.materialId,
      quantity: 20,
    });
    reservationIds.push(reservation.json.id);
    const allocation = await call(
      "supervisor",
      "POST",
      `/inventory/reservations/${reservation.json.id}/allocate`,
    );
    const overlapAdjustment = await prepareAdjustment(overlap, "negative", 10);
    const overlapResults = await Promise.all([
      call("supervisor", "POST", `/inventory/adjustments/${overlapAdjustment.id}/post`, {}),
      call(
        "supervisor",
        "POST",
        `/inventory/reservations/${reservation.json.id}/issue`,
        { quantity: 20 },
      ),
    ]);
    if (overlapResults[1].status === 201 && overlapResults[1].json?.id) {
      issueIds.push(overlapResults[1].json.id);
    }
    const overlapAvailable = await scalar<string>(
      `SELECT coalesce(sum(quantity), 0) FROM inventory_transactions
        WHERE material_id = $1 AND warehouse_id = $2 AND stock_state = 'available'`,
      [overlap.materialId, overlap.warehouseId],
    );
    check(
      "70I-08",
      allocation.status === 200 &&
        overlapResults.every((result) => [200, 201, 409].includes(result.status)) &&
        Number(overlapAvailable) >= 0,
      JSON.stringify({ allocation: allocation.status, overlap: overlapResults.map((result) => result.status), available: overlapAvailable }),
    );

    const annotation = await makeStock("ANNOTATION", 10, true, true);
    const annotationReservation = await call("supervisor", "POST", "/inventory/reservations", {
      production_order_id: annotation.orderId,
      material_id: annotation.materialId,
      quantity: 5,
    });
    reservationIds.push(annotationReservation.json.id);
    await call("supervisor", "POST", `/inventory/reservations/${annotationReservation.json.id}/allocate`);
    const annotationIssue = await call(
      "supervisor",
      "POST",
      `/inventory/reservations/${annotationReservation.json.id}/issue`,
      { quantity: 5 },
    );
    issueIds.push(annotationIssue.json.id);
    const consumption = await call("supervisor", "POST", "/inventory/consumptions", {
      production_order_id: annotation.orderId,
      material_id: annotation.materialId,
      actual_qty: 5,
      reason: `${prefix} annotation`,
    });
    consumptionIds.push(consumption.json.id);
    const confirmed = await call(
      "supervisor",
      "POST",
      `/inventory/consumptions/${consumption.json.id}/confirm`,
      {},
    );
    const beforeAdjust = await scalar<string>(
      "SELECT count(*) FROM inventory_transactions WHERE source_document_id = $1",
      [consumption.json.id],
    );
    const annotationAdjusted = await call(
      "supervisor",
      "POST",
      `/inventory/consumptions/${consumption.json.id}/adjust`,
      { reason: `${prefix} annotation only` },
    );
    const afterAdjust = await scalar<string>(
      "SELECT count(*) FROM inventory_transactions WHERE source_document_id = $1",
      [consumption.json.id],
    );
    check(
      "70I-09",
      confirmed.status === 200 &&
        annotationAdjusted.status === 200 &&
        Number(beforeAdjust) === Number(afterAdjust),
      JSON.stringify({ confirmed: confirmed.status, adjusted: annotationAdjusted.status, beforeAdjust, afterAdjust }),
    );

    const authDraft = await createAdjustment("supervisor", flow, "positive", 1);
    const authChecks = await Promise.all([
      call("supervisor", "POST", `/inventory/adjustments/${authDraft.id}/approve`, {}),
      call("operator", "POST", `/inventory/adjustments/${authDraft.id}/post`, {}),
      call("viewer", "POST", `/inventory/adjustments/${authDraft.id}/post`, {}),
      call("viewer", "GET", "/inventory/adjustments"),
      call(null, "GET", "/inventory/adjustments"),
      call("supervisor", "POST", `/inventory/adjustments/${authDraft.id}/submit`, {}),
    ]);
    check(
      "70I-10",
      authChecks[0].status === 403 &&
        authChecks[1].status === 403 &&
        authChecks[2].status === 403 &&
        authChecks[3].status === 200 &&
        authChecks[4].status === 401 &&
        authChecks[5].status === 200,
      JSON.stringify(authChecks.map((result) => result.status)),
    );

    const invP503 = await scalar<string>(
      `SELECT count(*) FROM inventory_adjustments a
        WHERE a.status = 'posted' AND (
          (SELECT count(*) FROM inventory_transactions it
            WHERE it.source_document_type = 'inventory_adjustment'
              AND it.source_document_id = a.id) <> 1
          OR (SELECT count(*) FROM inventory_transactions it
            WHERE it.source_document_type = 'inventory_adjustment'
              AND it.source_document_id = a.id
              AND it.transaction_type = (
                CASE WHEN a.type = 'positive' THEN 'ADJUSTMENT_IN' ELSE 'ADJUSTMENT_OUT' END
              )::inventory_transaction_type
              AND ((a.type = 'positive' AND it.quantity::numeric > 0)
                OR (a.type = 'negative' AND it.quantity::numeric < 0))) <> 1
        )`,
    );
    const orphanAdjustments = await scalar<string>(
      `SELECT count(*) FROM inventory_transactions it
        WHERE it.source_document_type = 'inventory_adjustment'
          AND NOT EXISTS (
            SELECT 1 FROM inventory_adjustments a
             WHERE a.id = it.source_document_id AND a.status = 'posted'
          )`,
    );
    const negativeBalances = await scalar<string>(
      `SELECT count(*) FROM (
        SELECT material_id, warehouse_id, sum(quantity) AS balance
          FROM inventory_transactions
         WHERE stock_state = 'available'
         GROUP BY material_id, warehouse_id
        HAVING sum(quantity) < 0
      ) x`,
    );
    check(
      "70I-11",
      Number(invP503) === 0 && Number(orphanAdjustments) === 0 && Number(negativeBalances) === 0,
      JSON.stringify({ invP503, orphanAdjustments, negativeBalances }),
    );
  } finally {
    await cleanup();
  }

  const residue = await sql<Record<string, string>>(
    `SELECT
       (SELECT count(*)::text FROM users WHERE email LIKE $1) AS users,
       (SELECT count(*)::text FROM master_materials WHERE code LIKE $2) AS materials,
       (SELECT count(*)::text FROM inventory_adjustments a
          JOIN master_materials m ON m.id = a.material_id
         WHERE m.code LIKE $2) AS adjustments`,
    [`${prefix.toLowerCase()}-%@cert.local`, `${prefix}-%`],
  );
  const zeroResidue = Object.values(residue[0] ?? {}).every((value) => Number(value) === 0);
  console.log(`70I-RESIDUE: ${zeroResidue ? "PASS" : "FAIL"} ${JSON.stringify(residue[0])}`);
  if (failed > 0 || !zeroResidue) process.exitCode = 1;
  console.log(`70I TOTAL: ${passed} PASS / ${failed} FAIL`);
}

main().catch(async (error) => {
  console.error("70-I certification crashed:", error);
  try {
    await cleanup();
  } catch (cleanupError) {
    console.error("70-I cleanup failed:", cleanupError);
  }
  process.exitCode = 1;
});