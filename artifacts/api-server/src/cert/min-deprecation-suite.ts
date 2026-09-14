#!/usr/bin/env tsx
/**
 * Batch 72-B — MIN deprecation contract evidence.
 *
 * This suite uses a directly inserted historical MIN fixture. It proves that
 * creation is a stable 410 contract while historical reads and reversal remain
 * operational, and that the live bulk direction still rejects an active MIN.
 */

import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { FAT_IDS, actorEmail } from "./fat-fixture-manifest";

const BASE = (process.env.CERT_TARGET ?? "http://localhost:8080").replace(/\/$/, "");
const PASSWORD = process.env.FAT_TEST_PASSWORD;
const MIN_NUMBER = `P72B-MIN-${Date.now()}`;
const MIN_ID = randomUUID();
const LINE_ID = randomUUID();
const ACTOR_ID = FAT_IDS.users.supervisor;
const ORDER_ID = FAT_IDS.orders.clean;
const EXPECTED_DEPRECATED = {
  error: "DEPRECATED",
  code: "MIN_DEPRECATED",
  replacement: "POST /api/manufacturing/orders/:id/issues/bulk",
  message: "Material issue via MIN is retired. Use the certified bulk issue endpoint (reservation → allocation → WIP issue).",
};

if (!PASSWORD || PASSWORD.length < 8) {
  throw new Error("FAT_TEST_PASSWORD must be supplied out of band and contain at least 8 characters");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function login(): Promise<string> {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: actorEmail("supervisor"), password: PASSWORD }),
  });
  assert(response.ok, `Supervisor login failed: HTTP ${response.status}`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert(cookie, "Supervisor login did not return a session cookie");
  return cookie;
}

async function api(
  cookie: string,
  method: string,
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<{ status: number; body: any }> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      Cookie: cookie,
      ...extraHeaders,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed };
}

async function query<T extends Record<string, unknown>>(text: string, values: unknown[] = []): Promise<T[]> {
  return (await pool.query(text, values)).rows as T[];
}

async function insertHistoricalMin(): Promise<void> {
  const prerequisites = await query<{ order_id: string; bom_id: string; material_id: string; bom_line_id: string; grn_id: string; grn_line_id: string }>(
    `SELECT
       po.id AS order_id,
       bh.id AS bom_id,
       ml.id AS material_id,
       bl.id AS bom_line_id,
       gh.id AS grn_id,
       gli.id AS grn_line_id
     FROM mfg_production_orders po
     JOIN bom_headers bh ON bh.id = $2
     JOIN bom_lines bl ON bl.bom_id = bh.id
     JOIN master_materials ml ON ml.id = bl.material_id
     JOIN grn_line_items gli ON gli.material_id = ml.id
     JOIN grn_headers gh ON gh.id = gli.grn_id
     WHERE po.id = $1
       AND bl.id = $3
       AND gh.id = $4
       AND gli.id = $5
     LIMIT 1`,
    [ORDER_ID, "fa140000-0000-4000-8000-000000000001", "fa140000-0000-4000-8000-000000000003", "fa150000-0000-4000-8000-000000000004", "fa150000-0000-4000-8000-000000000006"],
  );
  const prerequisite = prerequisites[0];
  assert(prerequisite, "FAT canonical prerequisites are missing; run the FAT seed first");

  await pool.query(
    `INSERT INTO material_issue_notes
      (id, min_number, source_type, source_ref_id, bom_header_id, bom_revision, status, issued_by, notes)
     VALUES ($1, $2, 'PRODUCTION_ORDER', $3, $4, 1, 'posted', $5, 'P72B historical reversal fixture')`,
    [MIN_ID, MIN_NUMBER, prerequisite.order_id, prerequisite.bom_id, ACTOR_ID],
  );
  await pool.query(
    `INSERT INTO material_issue_note_lines
      (id, min_id, line_number, material_id, source_bom_line_id, required_qty, issued_qty, uom,
       grn_id, grn_line_id, supplier_lot_number, is_critical_component, traceability_required)
       SELECT $1, $2, 1, $3, $4, 1, 1, bl.uom::text::material_uom, $5, $6, gli.supplier_lot_number,
            bl.is_critical_component, bl.traceability_required
       FROM bom_lines bl
       JOIN grn_line_items gli ON gli.id = $6
      WHERE bl.id = $4`,
    [LINE_ID, MIN_ID, prerequisite.material_id, prerequisite.bom_line_id, prerequisite.grn_id, prerequisite.grn_line_id],
  );
  await pool.query(
    `INSERT INTO inventory_transactions
      (transaction_type, material_id, quantity, uom, stock_state, source_document_type,
       source_document_id, source_line_id, created_by)
     SELECT 'PRODUCTION_ISSUE', $1, -1, bl.uom::text::material_uom, 'available', 'MIN', $2, $3, $4
       FROM bom_lines bl
      WHERE bl.id = $5`,
    [prerequisite.material_id, MIN_ID, LINE_ID, ACTOR_ID, prerequisite.bom_line_id],
  );
}

async function cleanup(): Promise<void> {
  await pool.query("DELETE FROM mfg_battery_timeline WHERE metadata->>'minId' = $1", [MIN_ID]);
  await pool.query("DELETE FROM inventory_transactions WHERE source_document_id = $1", [MIN_ID]);
  await pool.query("DELETE FROM material_issue_reversals WHERE min_id = $1", [MIN_ID]);
  await pool.query("DELETE FROM material_issue_note_lines WHERE min_id = $1", [MIN_ID]);
  await pool.query("DELETE FROM material_issue_notes WHERE id = $1", [MIN_ID]);
}

async function main(): Promise<void> {
  const cookie = await login();
  await cleanup();
  try {
    await insertHistoricalMin();

    const deprecated = await api(cookie, "POST", `/api/manufacturing/orders/${ORDER_ID}/material-issues`, {});
    assert(deprecated.status === 410, `B-01 expected HTTP 410, got ${deprecated.status}`);
    assert(JSON.stringify(deprecated.body) === JSON.stringify(EXPECTED_DEPRECATED), `B-01 payload mismatch: ${JSON.stringify(deprecated.body)}`);
    console.log("B-01 MIN create exact 410 payload: PASS");

    const list = await api(cookie, "GET", `/api/manufacturing/orders/${ORDER_ID}/material-issues`);
    assert(list.status === 200 && list.body?.items?.some((item: any) => item.id === MIN_ID), "B-02 historical MIN missing from list");
    console.log("B-02 historical MIN list read: PASS");

    const detail = await api(cookie, "GET", `/api/manufacturing/orders/${ORDER_ID}/material-issues/${MIN_ID}`);
    assert(detail.status === 200 && detail.body?.id === MIN_ID, `B-02 detail read failed: HTTP ${detail.status}`);
    console.log("B-02 historical MIN detail read: PASS");

    const bulk = await api(
      cookie,
      "POST",
      `/api/manufacturing/orders/${ORDER_ID}/issues/bulk`,
      {},
      { "Idempotency-Key": `P72B-${MIN_ID}` },
    );
    assert(bulk.status === 409 && bulk.body?.error === "ACTIVE_MIN_EXISTS", `B-04 bulk active-MIN guard failed: ${bulk.status} ${JSON.stringify(bulk.body)}`);
    console.log("B-04 bulk rejects active MIN: PASS");

    const reversed = await api(cookie, "POST", `/api/manufacturing/orders/${ORDER_ID}/material-issues/${MIN_ID}/reverse`, {
      reason: "P72B reversal evidence",
    });
    assert(reversed.status === 200 && reversed.body?.is_reversed === true, `B-03 reversal failed: HTTP ${reversed.status}`);
    console.log("B-03 historical MIN reversal: PASS");
  } finally {
    await cleanup();
    await pool.end();
  }
}

main().catch(async (error) => {
  console.error(error);
  await cleanup().catch(() => undefined);
  await pool.end().catch(() => undefined);
  process.exitCode = 1;
});