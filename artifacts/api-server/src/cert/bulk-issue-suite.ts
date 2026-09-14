#!/usr/bin/env tsx
/**
 * Batch 72-A certification: T01-T11.
 *
 * This suite creates one isolated approved BOM with duplicate material lines,
 * drives the real bulk endpoint, and removes only its prefixed records.
 */

import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";

const BASE = (process.env.CERT_TARGET ?? "http://localhost:8080").replace(/\/$/, "");
const PASSWORD = process.env.FAT_TEST_PASSWORD;
const ACTOR_EMAIL = process.env.FAT_DIRECTOR_EMAIL ?? "fat.director@fat.local";
const prefix = `72A-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`;

if (!PASSWORD) throw new Error("FAT_TEST_PASSWORD is required out of band");

type Fixture = {
  orderId: string;
  grnId: string | null;
  lineId: string | null;
  lotId: string | null;
  materialId: string;
  materialCode: string;
};

type CellFixture = {
  grnId: string;
  lineId: string;
  lotId: string;
};

let cookie = "";
let actorId = "";
let modelId = "";
let bomId = "";
let bomLineA = "";
let bomLineB = "";
let categoryId = "";
let materialId = "";
let materialCode = "";
let materialUom = "PCS";
let warehouseId = "";
let supplierId = "";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function query<T = any>(text: string, values: unknown[] = []): Promise<T[]> {
  return (await pool.query(text, values)).rows as T[];
}

async function api(method: string, path: string, body?: unknown, key?: string): Promise<{ status: number; body: any }> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      Cookie: cookie,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed };
}

async function login(): Promise<void> {
  const result = await api("POST", "/api/auth/login", {
    email: ACTOR_EMAIL,
    password: PASSWORD,
  });
  assert(result.status === 200, `director login failed: HTTP ${result.status}`);
  const session = result.body?.user?.id;
  assert(session, "login returned no user");
  actorId = session;
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ACTOR_EMAIL, password: PASSWORD }),
  });
  cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  assert(cookie, "login returned no session cookie");
}

async function setupBom(): Promise<void> {
  const models = await query<{ id: string }>(
    "SELECT model_id AS id FROM bom_headers WHERE status = 'approved' ORDER BY revision DESC LIMIT 1",
  );
  assert(models[0], "no existing model with an approved BOM");
  modelId = models[0].id;
  categoryId = randomUUID();
  materialId = randomUUID();
  materialCode = `${prefix}-MAT`;
  await pool.query(
    `INSERT INTO master_material_categories (id,code,name,engineering_master_required)
     VALUES ($1,$2,$3,false)`,
    [categoryId, `${prefix}-CAT`, `${prefix} Category`],
  );
  await pool.query(
    `INSERT INTO master_materials
      (id,code,name,category_id,uom,usage_type,status,created_by)
     VALUES ($1,$2,$3,$4,'PCS','CONSUMABLE','active',$5)`,
    [materialId, materialCode, `${prefix} Material`, categoryId, actorId],
  );
  supplierId = (await query<{ id: string }>("SELECT id FROM master_suppliers ORDER BY created_at LIMIT 1"))[0]?.id;
  warehouseId = (await query<{ id: string }>("SELECT id FROM warehouses WHERE is_active = true ORDER BY code LIMIT 1"))[0]?.id;
  assert(supplierId && warehouseId, "72-A requires a supplier and active warehouse");

  bomId = randomUUID();
  bomLineA = randomUUID();
  bomLineB = randomUUID();
  const revision = Number((await query<{ max: string }>(
    "SELECT coalesce(max(revision), 0) AS max FROM bom_headers WHERE model_id = $1",
    [modelId],
  ))[0]?.max ?? 0) + 1;
  await pool.query(
    `INSERT INTO bom_headers
      (id,bom_number,model_id,revision,status,name,yield_percent,created_by,approved_by,approved_at)
     VALUES ($1,$2,$3,$4,'approved',$5,100,$6,$7,now())`,
    [bomId, `${prefix}-BOM`, modelId, revision, `${prefix} duplicate-material BOM`, actorId, ACTOR_EMAIL],
  );
  await pool.query(
    `INSERT INTO bom_lines
      (id,bom_id,material_id,position,quantity_per,uom,scrap_percent,is_critical_component,traceability_required,is_optional)
     VALUES ($1,$2,$3,1,1,$4,0,false,false,false),
            ($5,$2,$3,2,1,$4,0,false,false,false)`,
    [bomLineA, bomId, materialId, materialUom, bomLineB],
  );
}

async function fixture(stock: number): Promise<Fixture> {
  const orderId = randomUUID();
  await pool.query(
    `INSERT INTO mfg_production_orders
      (id,order_number,battery_number,product_id,factory_manager,status,priority)
     VALUES ($1,$2,$3,$4,'72-A Manager','draft','medium')`,
    [orderId, `${prefix}-PO-${orderId.slice(0, 8)}`, `${prefix}-BAT-${orderId.slice(0, 8)}`, modelId],
  );
  let grnId: string | null = null;
  let lineId: string | null = null;
  let lotId: string | null = null;
  if (stock > 0) {
    grnId = randomUUID();
    lineId = randomUUID();
    lotId = randomUUID();
    await pool.query(
      `INSERT INTO grn_headers (id,grn_number,supplier_id,received_date,status,created_by)
       VALUES ($1,$2,$3,current_date,'posted',$4)`,
      [grnId, `${prefix.slice(0, 16)}-G-${grnId.slice(0, 8)}`, supplierId, actorId],
    );
    await pool.query(
      `INSERT INTO grn_line_items
       (id,grn_id,line_number,material_id,quantity_received,uom,accepted_qty,put_away_qty)
       VALUES ($1,$2,1,$3,$4,$5,$4,$4)`,
      [lineId, grnId, materialId, stock, materialUom],
    );
    await pool.query(
      `INSERT INTO inventory_lots
       (id,lot_number,material_id,grn_line_id,received_date,status,total_received_qty,remaining_qty,uom,warehouse_id)
       VALUES ($1,$2,$3,$4,current_date,'active',$5,$5,$6,$7)`,
      [lotId, `${prefix}-LOT-${lotId.slice(0, 8)}`, materialId, lineId, stock, materialUom, warehouseId],
    );
    await pool.query(
      `INSERT INTO inventory_transactions
       (transaction_type,material_id,quantity,uom,stock_state,lot_id,warehouse_id,
        source_document_type,source_document_id,source_line_id,created_by)
       VALUES ('GRN_RECEIPT',$1,$2,$3,'available',$4,$5,'GRN',$6,$7,$8)`,
      [materialId, stock, materialUom, lotId, warehouseId, grnId, lineId, actorId],
    );
  }
  return { orderId, grnId, lineId, lotId, materialId, materialCode };
}

async function cellFixture(): Promise<CellFixture> {
  const cell = (await query<{ id: string; uom: string }>(
    `SELECT id,uom FROM master_materials
      WHERE linked_master_type = 'CELL' AND cell_master_id IS NOT NULL
      ORDER BY code LIMIT 1`,
  ))[0];
  assert(cell, "T09 requires a cell material with a cell-master bridge");
  const grnId = randomUUID();
  const lineId = randomUUID();
  const lotId = randomUUID();
  await pool.query(
    `INSERT INTO grn_headers (id,grn_number,supplier_id,received_date,status,created_by)
     VALUES ($1,$2,$3,current_date,'posted',$4)`,
    [grnId, `${prefix.slice(0, 16)}-C-${grnId.slice(0, 8)}`, supplierId, actorId],
  );
  await pool.query(
    `INSERT INTO grn_line_items
     (id,grn_id,line_number,material_id,quantity_received,uom,accepted_qty,put_away_qty)
     VALUES ($1,$2,1,$3,1,$4,1,1)`,
    [lineId, grnId, cell.id, cell.uom],
  );
  await pool.query(
    `INSERT INTO inventory_lots
     (id,lot_number,material_id,grn_line_id,received_date,status,total_received_qty,remaining_qty,uom)
     VALUES ($1,$2,$3,$4,current_date,'active',1,1,$5)`,
    [lotId, `${prefix}-CLOT-${lotId.slice(0, 8)}`, cell.id, lineId, cell.uom],
  );
  await pool.query(
    `INSERT INTO inventory_transactions
     (transaction_type,material_id,quantity,uom,stock_state,lot_id,
      source_document_type,source_document_id,source_line_id,created_by)
     VALUES ('GRN_RECEIPT',$1,1,$2,'available',$3,'GRN',$4,$5,$6)`,
    [cell.id, cell.uom, lotId, grnId, lineId, actorId],
  );
  return { grnId, lineId, lotId };
}

async function cleanupCellFixture(fixture: CellFixture): Promise<void> {
  const transfers = await query<{ id: string }>(
    "SELECT id FROM material_transfers WHERE grn_line_id = $1",
    [fixture.lineId],
  );
  for (const transfer of transfers) {
    const lots = await query<{ id: string }>(
      "SELECT id FROM cell_lots WHERE transfer_id = $1",
      [transfer.id],
    );
    for (const lot of lots) {
      await pool.query("DELETE FROM cell_lot_events WHERE lot_id = $1", [lot.id]);
      await pool.query("DELETE FROM cells WHERE lot_id = $1", [lot.id]);
      await pool.query("DELETE FROM cell_lots WHERE id = $1", [lot.id]);
    }
    await pool.query("DELETE FROM inventory_transactions WHERE source_document_id = $1", [transfer.id]);
    await pool.query("DELETE FROM material_transfers WHERE id = $1", [transfer.id]);
  }
  await pool.query("DELETE FROM inventory_transactions WHERE source_line_id = $1", [fixture.lineId]);
  await pool.query("DELETE FROM inventory_lots WHERE id = $1", [fixture.lotId]);
  await pool.query("DELETE FROM grn_line_items WHERE id = $1", [fixture.lineId]);
  await pool.query("DELETE FROM grn_headers WHERE id = $1", [fixture.grnId]);
}

async function cleanup(orderId: string, grnId: string | null, lineId: string | null, lotId: string | null): Promise<void> {
  const issues = await query<{ id: string }>(
    "SELECT id FROM wip_issue_notes WHERE production_order_id = $1",
    [orderId],
  );
  const reservations = await query<{ id: string }>(
    "SELECT id FROM inventory_reservations WHERE production_order_id = $1",
    [orderId],
  );
  const batches = await query<{ id: string }>(
    "SELECT id FROM bulk_batches WHERE production_order_id = $1",
    [orderId],
  );
  const issueIds = issues.map((row) => row.id);
  const reservationIds = reservations.map((row) => row.id);
  const batchIds = batches.map((row) => row.id);
  if (issueIds.length) {
    await pool.query("DELETE FROM inventory_transactions WHERE source_document_type = 'wip_issue_note' AND source_document_id = ANY($1::uuid[])", [issueIds]);
    await pool.query("DELETE FROM wip_inventory WHERE wip_issue_note_id = ANY($1::uuid[])", [issueIds]);
    await pool.query("DELETE FROM bulk_batch_lines WHERE wip_issue_note_id = ANY($1::uuid[])", [issueIds]);
    await pool.query("DELETE FROM wip_issue_lines WHERE wip_issue_note_id = ANY($1::uuid[])", [issueIds]);
    await pool.query("DELETE FROM outbox_events WHERE aggregate_id = ANY($1::uuid[])", [issueIds]);
    await pool.query("DELETE FROM wip_issue_notes WHERE id = ANY($1::uuid[])", [issueIds]);
  }
  if (reservationIds.length) {
    await pool.query("DELETE FROM inventory_reservation_allocations WHERE reservation_id = ANY($1::uuid[])", [reservationIds]);
    await pool.query("DELETE FROM outbox_events WHERE aggregate_id = ANY($1::uuid[])", [reservationIds]);
    await pool.query("DELETE FROM inventory_reservations WHERE id = ANY($1::uuid[])", [reservationIds]);
  }
  if (batchIds.length) {
    await pool.query("DELETE FROM bulk_batch_lines WHERE batch_id = ANY($1::uuid[])", [batchIds]);
    await pool.query("DELETE FROM outbox_events WHERE aggregate_id = ANY($1::uuid[])", [batchIds]);
    await pool.query("DELETE FROM bulk_batches WHERE id = ANY($1::uuid[])", [batchIds]);
  }
  if (grnId) {
    await pool.query("DELETE FROM inventory_transactions WHERE source_document_id = $1", [grnId]);
    await pool.query("DELETE FROM inventory_lots WHERE id = $1", [lotId]);
    await pool.query("DELETE FROM grn_line_items WHERE id = $1", [lineId]);
    await pool.query("DELETE FROM grn_headers WHERE id = $1", [grnId]);
  }
  await pool.query("DELETE FROM mfg_production_orders WHERE id = $1", [orderId]);
}

async function runCase(name: string, stock: number, body: (f: Fixture) => Promise<void>): Promise<void> {
  const f = await fixture(stock);
  try {
    await body(f);
    console.log(`${name}: PASS`);
  } finally {
    await cleanup(f.orderId, f.grnId, f.lineId, f.lotId);
  }
}

async function bulk(orderId: string, key: string, notes?: string): Promise<{ status: number; body: any }> {
  return api("POST", `/api/manufacturing/orders/${orderId}/issues/bulk`, notes === undefined ? undefined : { notes }, key);
}

async function assertBulkAtomicEvidence(batchId: string, expectedPairs: number): Promise<void> {
  const pairs = await query<{
    issue_id: string;
    source_line_id: string;
    lot_id: string;
    negative_count: string;
    positive_count: string;
    negative_qty: string;
    positive_qty: string;
  }>(
    `SELECT
       it.source_document_id AS issue_id,
       it.source_line_id,
       it.lot_id,
       count(*) FILTER (
         WHERE it.transaction_type = 'PRODUCTION_ISSUE'
           AND it.stock_state = 'available'
           AND it.quantity < 0
       ) AS negative_count,
       count(*) FILTER (
         WHERE it.transaction_type = 'WIP_RECEIPT'
           AND it.stock_state = 'wip'
           AND it.quantity > 0
       ) AS positive_count,
       coalesce(sum(it.quantity) FILTER (
         WHERE it.transaction_type = 'PRODUCTION_ISSUE'
           AND it.stock_state = 'available'
       ), 0) AS negative_qty,
       coalesce(sum(it.quantity) FILTER (
         WHERE it.transaction_type = 'WIP_RECEIPT'
           AND it.stock_state = 'wip'
       ), 0) AS positive_qty
     FROM inventory_transactions it
     JOIN bulk_batch_lines bbl ON bbl.wip_issue_note_id = it.source_document_id
     WHERE bbl.batch_id = $1
     GROUP BY it.source_document_id, it.source_line_id, it.lot_id`,
    [batchId],
  );
  assert(pairs.length === expectedPairs, `G5 expected ${expectedPairs} ledger pairs, found ${pairs.length}`);
  for (const pair of pairs) {
    assert(
      pair.negative_count === "1" &&
        pair.positive_count === "1" &&
        Number(pair.negative_qty) < 0 &&
        Number(pair.positive_qty) > 0 &&
        Math.abs(Number(pair.negative_qty)) === Number(pair.positive_qty),
      `G5 ledger pair is not balanced: ${JSON.stringify(pair)}`,
    );
  }
  console.log("G5 ledger pairs: PASS");

  const outbox = await query<{ n: string }>(
    `SELECT count(*) AS n
       FROM outbox_events
      WHERE aggregate_type = 'bulk_batch'
        AND aggregate_id = $1
        AND event_type = 'BULK_ISSUE_CREATED'`,
    [batchId],
  );
  assert(outbox[0]?.n === "1", `G9 expected one BULK_ISSUE_CREATED event, found ${outbox[0]?.n ?? "0"}`);
  console.log("G9 single bulk outbox event: PASS");
}

async function main(): Promise<void> {
  await login();
  await setupBom();
  try {
    await runCase("T01 full BOM issue", 4, async (f) => {
      const r = await bulk(f.orderId, `${prefix}-T01`);
      assert(r.status === 201 && r.body.lines?.length === 1, `T01 unexpected response ${r.status}: ${JSON.stringify(r.body)}`);
      await assertBulkAtomicEvidence(r.body.id, r.body.lines.reduce((sum: number, line: any) => sum + line.lots.length, 0));
    });
    await runCase("T02 duplicate-material aggregation", 4, async (f) => {
      const r = await bulk(f.orderId, `${prefix}-T02`);
      assert(r.status === 201, `T02 HTTP ${r.status}`);
      assert(r.body.lines[0].source_bom_line_refs.length === 2, "T02 did not preserve both BOM references");
      await assertBulkAtomicEvidence(r.body.id, r.body.lines.reduce((sum: number, line: any) => sum + line.lots.length, 0));
      const count = (await query<{ n: string }>(
        "SELECT count(*) AS n FROM inventory_reservations WHERE production_order_id = $1",
        [f.orderId],
      ))[0]?.n;
      assert(count === "1", "T02 created more than one reservation");
    });
    await runCase("T03 atomic insufficient-stock rollback", 0, async (f) => {
      const r = await bulk(f.orderId, `${prefix}-T03`);
      assert(r.status === 409 && r.body.error === "INSUFFICIENT_STOCK", `T03 HTTP ${r.status}`);
      const n = (await query<{ n: string }>("SELECT count(*) AS n FROM bulk_batches WHERE production_order_id = $1", [f.orderId]))[0]?.n;
      assert(n === "0", "T03 left a batch after rollback");
    });
    await runCase("T04 partial reservation policy", 1, async (f) => {
      const reservation = await api("POST", "/api/inventory/reservations", {
        production_order_id: f.orderId,
        material_id: materialId,
        quantity: 2,
        allow_partial: true,
      });
      assert(reservation.status === 201, `T04 reservation HTTP ${reservation.status}`);
      const r = await bulk(f.orderId, `${prefix}-T04`);
      assert(r.status === 409 && r.body.error === "ACTIVE_RESERVATION", `T04 HTTP ${r.status}`);
    });
    await runCase("T05 sequential replay", 4, async (f) => {
      const key = `${prefix}-T05`;
      const first = await bulk(f.orderId, key);
      const second = await bulk(f.orderId, key, "replay");
      assert(first.status === 201 && second.status === 200 && first.body.id === second.body.id, "T05 replay mismatch");
    });
    let firstFixture: Fixture | undefined;
    await runCase("T06 idempotency conflict", 4, async (f) => {
      firstFixture = f;
      const first = await bulk(f.orderId, `${prefix}-T06`);
      assert(first.status === 201, "T06 setup request failed");
      const other = await fixture(4);
      try {
        const conflict = await bulk(other.orderId, `${prefix}-T06`);
        assert(conflict.status === 409 && conflict.body.error === "IDEMPOTENCY_CONFLICT", "T06 conflict not rejected");
      } finally {
        await cleanup(other.orderId, other.grnId, other.lineId, other.lotId);
      }
    });
    void firstFixture;
    await runCase("T07 same-key race", 4, async (f) => {
      const key = `${prefix}-T07`;
      const [a, b] = await Promise.all([bulk(f.orderId, key), bulk(f.orderId, key)]);
      assert([a.status, b.status].sort().join(",") === "200,201", `T07 statuses ${a.status},${b.status}`);
      const n = (await query<{ n: string }>("SELECT count(*) AS n FROM bulk_batches WHERE production_order_id = $1", [f.orderId]))[0]?.n;
      assert(n === "1", "T07 created more than one batch");
    });
    await runCase("T08 bulk versus allocation race", 4, async (f) => {
      const reservation = await api("POST", "/api/inventory/reservations", {
        production_order_id: f.orderId,
        material_id: materialId,
        quantity: 2,
      });
      assert(reservation.status === 201, "T08 reservation setup failed");
      const [allocation, bulkResult] = await Promise.all([
        api("POST", `/api/inventory/reservations/${reservation.body.id}/allocate`, {}),
        bulk(f.orderId, `${prefix}-T08`),
      ]);
      assert(allocation.status === 200, `T08 allocation HTTP ${allocation.status}`);
      assert(bulkResult.status === 409, `T08 bulk HTTP ${bulkResult.status}`);
    });
    await runCase("T09 bulk versus transfer race", 4, async (f) => {
      const cell = await cellFixture();
      try {
        const [a, b] = await Promise.all([
          bulk(f.orderId, `${prefix}-T09`),
          api("POST", "/api/inventory/transfers", { grn_line_id: cell.lineId, quantity: 1 }),
        ]);
        assert(a.status === 201 && b.status === 201, `T09 statuses ${a.status}/${b.status}`);
      } finally {
        await cleanupCellFixture(cell);
      }
    });
    await runCase("T10 active MIN rejection", 4, async (f) => {
      await pool.query(
        `INSERT INTO material_issue_notes
          (id,min_number,source_type,source_ref_id,bom_header_id,bom_revision,status,issued_by)
         VALUES ($1,$2,'PRODUCTION_ORDER',$3,$4,1,'posted',$5)`,
        [randomUUID(), `${prefix}-MIN`, f.orderId, bomId, actorId],
      );
      const r = await bulk(f.orderId, `${prefix}-T10`);
      assert(r.status === 409 && r.body.error === "ACTIVE_MIN_EXISTS", `T10 HTTP ${r.status}`);
    });
    await runCase("T11 stage-gate paths", 4, async (f) => {
      const before = await query<{ n: string }>(
        "SELECT count(*) AS n FROM bulk_batches WHERE production_order_id = $1 AND status = 'completed'",
        [f.orderId],
      );
      assert(before[0]?.n === "0", "T11 precondition was not empty");
      const r = await bulk(f.orderId, `${prefix}-T11`);
      assert(r.status === 201, `T11 bulk HTTP ${r.status}`);
      const after = await query<{ n: string }>(
        "SELECT count(*) AS n FROM bulk_batches WHERE production_order_id = $1 AND status = 'completed'",
        [f.orderId],
      );
      assert(after[0]?.n === "1", "T11 completed batch not persisted");
    });
  } finally {
    await pool.query("DELETE FROM material_issue_notes WHERE min_number = $1", [`${prefix}-MIN`]);
    await pool.query("DELETE FROM bom_lines WHERE bom_id = $1", [bomId]);
    await pool.query("DELETE FROM bom_headers WHERE id = $1", [bomId]);
    await pool.query("DELETE FROM master_materials WHERE id = $1", [materialId]);
    await pool.query("DELETE FROM master_material_categories WHERE id = $1", [categoryId]);
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});