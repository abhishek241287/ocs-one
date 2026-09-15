#!/usr/bin/env tsx
/**
 * REC-01..REC-10 receiving, inspection, lot, and put-away certification.
 *
 * Run against a running API:
 *   CERT_BASE_URL=http://localhost:80 pnpm --filter @workspace/api-server run test:receiving
 */

import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";

const BASE_URL = (process.env.CERT_BASE_URL ?? "http://localhost:80").replace(/\/$/, "");
const PASSWORD = "REC-01!Certification2026";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function body(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request(path: string, cookie: string | undefined, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("Cookie", cookie);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  return { response, body: await body(response) };
}

function cookieFrom(response: Response): string {
  const token = response.headers.get("set-cookie")?.match(/ocs_token=([^;]+)/)?.[1];
  if (!token) throw new Error("Certification login did not return ocs_token");
  return `ocs_token=${token}`;
}

type Fixture = {
  prefix: string;
  supplierId: string;
  categoryId: string;
  materialId: string;
  workflowId: string;
  assignmentId: string;
  warehouseId: string;
  locationId: string;
  binId: string;
  supervisorId: string;
  directorId: string;
  supervisorCookie?: string;
  directorCookie?: string;
};

async function main(): Promise<void> {
  const suffix = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`.toUpperCase();
  const fixture: Fixture = {
    prefix: `RECCERT-${suffix}`,
    supplierId: randomUUID(),
    categoryId: randomUUID(),
    materialId: randomUUID(),
    workflowId: randomUUID(),
    assignmentId: randomUUID(),
    warehouseId: randomUUID(),
    locationId: randomUUID(),
    binId: randomUUID(),
    supervisorId: randomUUID(),
    directorId: randomUUID(),
  };
  const email = (role: string) => `${fixture.prefix.toLowerCase()}-${role}@cert.local`;
  const client = await pool.connect();
  let poId: string | null = null;
  let poLineId: string | null = null;
  let grnId: string | null = null;
  let grnLineId: string | null = null;
  let firstLotId: string | null = null;
  let passed = 0;

  const run = async (label: string, test: () => Promise<void>) => {
    await test();
    passed += 1;
    console.log(`${label} PASS`);
  };

  try {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO users (id, email, password_hash, name, role, is_active)
       VALUES ($1, $2, $3, $4, 'supervisor', true),
              ($5, $6, $3, $7, 'director', true)`,
      [
        fixture.supervisorId,
        email("supervisor"),
        passwordHash,
        `${fixture.prefix} Supervisor`,
        fixture.directorId,
        email("director"),
        `${fixture.prefix} Director`,
      ],
    );
    await client.query(
      `INSERT INTO master_suppliers (id, code, name, status, created_by)
       VALUES ($1, $2, $3, 'active', $4)`,
      [fixture.supplierId, `${fixture.prefix}-SUP`, `${fixture.prefix} Supplier`, fixture.supervisorId],
    );
    await client.query(
      `INSERT INTO master_material_categories
       (id, code, name, linked_master_type, engineering_master_required, status, created_by)
       VALUES ($1, $2, $3, NULL, false, 'active', $4)`,
      [fixture.categoryId, `${fixture.prefix}-CAT`, `${fixture.prefix} Category`, fixture.supervisorId],
    );
    await client.query(
      `INSERT INTO material_workflows (id, code, name, post_receipt_action, status, created_by)
       VALUES ($1, $2, $3, 'INCOMING_INSPECTION', 'active', $4)`,
      [fixture.workflowId, `${fixture.prefix}-WF`, `${fixture.prefix} Incoming Inspection`, fixture.supervisorId],
    );
    await client.query(
      `INSERT INTO master_materials
       (id, code, name, category_id, uom, usage_type, status, created_by)
       VALUES ($1, $2, $3, $4, 'KG', 'CONSUMABLE', 'active', $5)`,
      [fixture.materialId, `${fixture.prefix}-MAT`, `${fixture.prefix} Material`, fixture.categoryId, fixture.supervisorId],
    );
    await client.query(
      `INSERT INTO material_workflow_assignments
       (id, category_id, workflow_id, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $4)`,
      [fixture.assignmentId, fixture.categoryId, fixture.workflowId, fixture.supervisorId],
    );
    await client.query(
      `INSERT INTO warehouses (id, code, name, type, is_active)
       VALUES ($1, $2, $3, 'main_store', true)`,
      [fixture.warehouseId, `${suffix.slice(0, 10)}-WH`, `${fixture.prefix} Warehouse`],
    );
    await client.query(
      `INSERT INTO locations (id, warehouse_id, code, name, type, is_active)
       VALUES ($1, $2, $3, $4, 'storage', true)`,
      [fixture.locationId, fixture.warehouseId, `${suffix.slice(0, 9)}-LOC`, `${fixture.prefix} Location`],
    );
    await client.query(
      `INSERT INTO bins (id, location_id, code, name, is_active)
       VALUES ($1, $2, $3, $4, true)`,
      [fixture.binId, fixture.locationId, `${suffix.slice(0, 9)}-BIN`, `${fixture.prefix} Bin`],
    );
    await client.query("COMMIT");

    const supervisorLogin = await request("/api/auth/login", undefined, {
      method: "POST",
      body: JSON.stringify({ email: email("supervisor"), password: PASSWORD }),
    });
    const directorLogin = await request("/api/auth/login", undefined, {
      method: "POST",
      body: JSON.stringify({ email: email("director"), password: PASSWORD }),
    });
    assert(supervisorLogin.response.status === 200, "Supervisor fixture login failed");
    assert(directorLogin.response.status === 200, "Director fixture login failed");
    fixture.supervisorCookie = cookieFrom(supervisorLogin.response);
    fixture.directorCookie = cookieFrom(directorLogin.response);

    const po = await request("/api/procurement/purchase-orders", fixture.supervisorCookie, {
      method: "POST",
      body: JSON.stringify({
        supplier_id: fixture.supplierId,
        currency: "INR",
        over_receipt_tolerance_percent: 5,
        lines: [{ material_id: fixture.materialId, ordered_qty: 100, unit_price: 10 }],
      }),
    });
    assert(po.response.status === 201, `PO fixture creation failed: ${JSON.stringify(po.body)}`);
    poId = po.body.id;
    poLineId = po.body.lines[0].id;
    const submit = await request(`/api/procurement/purchase-orders/${poId}/submit`, fixture.supervisorCookie, { method: "POST" });
    assert(submit.response.status === 200, "PO fixture submit failed");
    const approve = await request(`/api/procurement/purchase-orders/${poId}/approve`, fixture.directorCookie, { method: "POST" });
    assert(approve.response.status === 200, "PO fixture approval failed");

    await run("REC-01 partial PO receipt", async () => {
      const result = await request("/api/inventory/grns", fixture.supervisorCookie, {
        method: "POST",
        body: JSON.stringify({
          supplier_id: fixture.supplierId,
          purchase_order_id: poId,
          received_date: "2026-09-12",
          warehouse_id: fixture.warehouseId,
          lines: [{ material_id: fixture.materialId, purchase_order_line_id: poLineId, quantity_received: 60 }],
        }),
      });
      assert(result.response.status === 201, `Partial GRN creation failed: ${JSON.stringify(result.body)}`);
      grnId = result.body.id;
      grnLineId = result.body.lines[0].id;
    });

    await run("REC-02 posting creates internal lot", async () => {
      const result = await request(`/api/inventory/grns/${grnId}/post`, fixture.supervisorCookie, { method: "POST" });
      assert(result.response.status === 200, `GRN posting failed: ${JSON.stringify(result.body)}`);
      const line = result.body.lines[0];
      assert(line.lot_id && /^LOT-\d{8}-\d+$/.test((await request(`/api/inventory/lots/${line.lot_id}`, fixture.supervisorCookie)).body.data.lot_number), "Internal lot was not created");
      assert(line.inspection_status === "pending", "GRN line did not enter inspection_pending");
      firstLotId = line.lot_id;
    });

    await run("REC-03 PO quantities update after posting", async () => {
      const result = await request(`/api/procurement/purchase-orders/${poId}`, fixture.supervisorCookie);
      const line = result.body.lines[0];
      assert(String(line.received_qty) === "60" && String(line.open_qty) === "40", "PO quantities were not updated");
      assert(result.body.status === "partially_received", "PO status was not partially_received");
    });

    await run("REC-04 independent line inspection event", async () => {
      const result = await request(`/api/inventory/grns/${grnId}/inspect`, fixture.supervisorCookie, {
        method: "POST",
        body: JSON.stringify({ lines: [{ grn_line_id: grnLineId, accepted_qty: 50, rejected_qty: 10, rejection_reason: "damaged packaging" }] }),
      });
      assert(result.response.status === 201, `Inspection failed: ${JSON.stringify(result.body)}`);
      const detail = await request(`/api/inventory/grns/${grnId}`, fixture.supervisorCookie);
      const line = detail.body.lines[0];
      assert(String(line.accepted_qty) === "50" && String(line.rejected_qty) === "10" && line.inspection_status === "partial", "Inspection projection is incorrect");
    });

    await run("REC-05 inspection overage validation", async () => {
      const result = await request(`/api/inventory/grns/${grnId}/inspect`, fixture.supervisorCookie, {
        method: "POST",
        body: JSON.stringify({ lines: [{ grn_line_id: grnLineId, accepted_qty: 1, rejected_qty: 0 }] }),
      });
      assert(result.response.status === 422, "Inspection overage was not rejected");
    });

    await run("REC-06 put-away updates physical location", async () => {
      const result = await request(`/api/inventory/grns/${grnId}/put-away`, fixture.supervisorCookie, {
        method: "POST",
        body: JSON.stringify({ grn_line_id: grnLineId, warehouse_id: fixture.warehouseId, location_id: fixture.locationId, bin_id: fixture.binId, quantity: 50 }),
      });
      assert(result.response.status === 200 && result.body.data.location_id === fixture.locationId, `Put-away failed: ${JSON.stringify(result.body)}`);
    });

    await run("REC-07 concurrent over-receipt is blocked", async () => {
      const drafts = await Promise.all(
        [30, 30].map((quantity_received) =>
          request("/api/inventory/grns", fixture.supervisorCookie, {
            method: "POST",
            body: JSON.stringify({
              supplier_id: fixture.supplierId,
              purchase_order_id: poId,
              received_date: "2026-09-12",
              lines: [{ material_id: fixture.materialId, purchase_order_line_id: poLineId, quantity_received }],
            }),
          }),
        ),
      );
      assert(drafts.every((draft) => draft.response.status === 201), "Concurrent GRN drafts were not created");
      const results = await Promise.all(
        drafts.map((draft) => request(`/api/inventory/grns/${draft.body.id}/post`, fixture.supervisorCookie, { method: "POST" })),
      );
      const statuses = results.map((result) => result.response.status).sort();
      assert(
        statuses.join(",") === "200,422" &&
          results.some((result) => String(result.body?.error ?? "").includes("Over-receipt")),
        `Concurrent over-receipt did not produce one winner and one blocked post: ${JSON.stringify(results.map((r) => r.body))}`,
      );
    });

    await run("REC-08 non-PO GRN remains supported", async () => {
      const result = await request("/api/inventory/grns", fixture.supervisorCookie, {
        method: "POST",
        body: JSON.stringify({
          supplier_id: fixture.supplierId,
          received_date: "2026-09-12",
          lines: [{ material_id: fixture.materialId, quantity_received: 25 }],
        }),
      });
      assert(result.response.status === 201, "Non-PO GRN was rejected");
    });

    await run("REC-09 ledger balances inspection states", async () => {
      const rows = await client.query(
        `SELECT stock_state, SUM(quantity::numeric) AS quantity
         FROM inventory_transactions
         WHERE source_document_type = 'INSPECTION'
           AND source_document_id IN (SELECT id FROM incoming_inspections WHERE grn_id = $1)
         GROUP BY stock_state`,
        [grnId],
      );
      const byState = new Map(rows.rows.map((row) => [row.stock_state, Number(row.quantity)]));
      assert(byState.get("inspection_pending") === -60, "Inspection pending ledger release is incorrect");
      assert(byState.get("available") === 50 && byState.get("rejected") === 10, "Inspection state ledger balances are incorrect");
    });

    await run("REC-10 full rejection marks lot rejected", async () => {
      const draft = await request("/api/inventory/grns", fixture.supervisorCookie, {
        method: "POST",
        body: JSON.stringify({
          supplier_id: fixture.supplierId,
          received_date: "2026-09-12",
          lines: [{ material_id: fixture.materialId, quantity_received: 10 }],
        }),
      });
      assert(draft.response.status === 201, "Full-rejection GRN draft was not created");
      const posted = await request(`/api/inventory/grns/${draft.body.id}/post`, fixture.supervisorCookie, { method: "POST" });
      assert(posted.response.status === 200, "Full-rejection GRN did not post");
      const line = posted.body.lines[0];
      const inspected = await request(`/api/inventory/grns/${draft.body.id}/inspect`, fixture.supervisorCookie, {
        method: "POST",
        body: JSON.stringify({ lines: [{ grn_line_id: line.id, accepted_qty: 0, rejected_qty: 10, rejection_reason: "failed incoming inspection" }] }),
      });
      assert(inspected.response.status === 201, "Full rejection inspection failed");
      const lot = await request(`/api/inventory/lots/${line.lot_id}`, fixture.supervisorCookie);
      assert(lot.response.status === 200 && lot.body.data.status === "rejected", "Rejected lot did not receive rejected status");
    });

    await run("CONC-02 repeated inspection is cumulative and then idempotently blocked", async () => {
      const draft = await request("/api/inventory/grns", fixture.supervisorCookie, {
        method: "POST",
        body: JSON.stringify({
          supplier_id: fixture.supplierId,
          received_date: "2026-09-12",
          lines: [{ material_id: fixture.materialId, quantity_received: 10 }],
        }),
      });
      assert(draft.response.status === 201, "Repeated-inspection GRN draft was not created");
      const posted = await request(`/api/inventory/grns/${draft.body.id}/post`, fixture.supervisorCookie, { method: "POST" });
      assert(posted.response.status === 200, "Repeated-inspection GRN did not post");
      const lineId = posted.body.lines[0].id;

      const first = await request(`/api/inventory/grns/${draft.body.id}/inspect`, fixture.supervisorCookie, {
        method: "POST",
        body: JSON.stringify({ lines: [{ grn_line_id: lineId, accepted_qty: 5, rejected_qty: 0 }] }),
      });
      const second = await request(`/api/inventory/grns/${draft.body.id}/inspect`, fixture.supervisorCookie, {
        method: "POST",
        body: JSON.stringify({ lines: [{ grn_line_id: lineId, accepted_qty: 5, rejected_qty: 0 }] }),
      });
      assert(first.response.status === 201 && second.response.status === 201, "Repeated inspection events were not accepted");

      const eventCount = await client.query(
        `SELECT COUNT(*)::int AS count
         FROM incoming_inspection_lines
         WHERE grn_line_id = $1`,
        [lineId],
      );
      assert(eventCount.rows[0].count === 2, "Repeated inspection did not create two line events");

      const duplicate = await request(`/api/inventory/grns/${draft.body.id}/inspect`, fixture.supervisorCookie, {
        method: "POST",
        body: JSON.stringify({ lines: [{ grn_line_id: lineId, accepted_qty: 1, rejected_qty: 0 }] }),
      });
      assert(duplicate.response.status === 422, "Completed-line reinspection was not blocked");
      const afterCount = await client.query(
        `SELECT COUNT(*)::int AS count
         FROM incoming_inspection_lines
         WHERE grn_line_id = $1`,
        [lineId],
      );
      assert(afterCount.rows[0].count === 2, "Blocked reinspection changed inspection history");
    });

    await run("CONC-03 repeated GRN posting does not create a duplicate lot", async () => {
      const draft = await request("/api/inventory/grns", fixture.supervisorCookie, {
        method: "POST",
        body: JSON.stringify({
          supplier_id: fixture.supplierId,
          received_date: "2026-09-12",
          lines: [{ material_id: fixture.materialId, quantity_received: 7 }],
        }),
      });
      assert(draft.response.status === 201, "Duplicate-post GRN draft was not created");
      const firstPost = await request(`/api/inventory/grns/${draft.body.id}/post`, fixture.supervisorCookie, { method: "POST" });
      const secondPost = await request(`/api/inventory/grns/${draft.body.id}/post`, fixture.supervisorCookie, { method: "POST" });
      assert(firstPost.response.status === 200 && secondPost.response.status === 409, "Repeated GRN post did not return the expected conflict");
      const lotCount = await client.query(
        `SELECT COUNT(*)::int AS count
         FROM inventory_lots
         WHERE grn_line_id = $1`,
        [firstPost.body.lines[0].id],
      );
      assert(lotCount.rows[0].count === 1, "Repeated GRN post created a duplicate lot");
    });

    console.log(JSON.stringify({ result: "PASS", cases: passed, fixture_prefix: fixture.prefix }, null, 2));
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.query("BEGIN");
    const ids = [fixture.supervisorId, fixture.directorId];
    await client.query(`DELETE FROM security_events WHERE actor_id = ANY($1::uuid[])`, [ids]);
    // Valuation is an append-only child of the signed receipt movement. Remove
    // depletion rows and receipt layers before deleting the quantity ledger.
    await client.query(
      `DELETE FROM valuation_depletions
        WHERE valuation_layer_id IN (
          SELECT id FROM valuation_layers
           WHERE grn_line_id IN (
             SELECT id FROM grn_line_items
              WHERE grn_id IN (SELECT id FROM grn_headers WHERE supplier_id = $1)
           )
        )
           OR movement_id IN (
          SELECT id FROM inventory_transactions
           WHERE source_document_id IN (
             SELECT id FROM grn_headers WHERE supplier_id = $1
             UNION
             SELECT id FROM incoming_inspections
              WHERE grn_id IN (SELECT id FROM grn_headers WHERE supplier_id = $1)
           )
        )`,
      [fixture.supplierId],
    );
    await client.query(
      `DELETE FROM valuation_layers
        WHERE grn_line_id IN (
          SELECT id FROM grn_line_items
           WHERE grn_id IN (SELECT id FROM grn_headers WHERE supplier_id = $1)
        )
           OR receipt_movement_id IN (
          SELECT id FROM inventory_transactions
           WHERE source_document_id IN (
             SELECT id FROM grn_headers WHERE supplier_id = $1
             UNION
             SELECT id FROM incoming_inspections
              WHERE grn_id IN (SELECT id FROM grn_headers WHERE supplier_id = $1)
           )
        )`,
      [fixture.supplierId],
    );
    await client.query(
      `DELETE FROM inventory_transactions
       WHERE source_document_id IN (
         SELECT id FROM grn_headers WHERE supplier_id = $1
         UNION
         SELECT id FROM incoming_inspections WHERE grn_id IN (SELECT id FROM grn_headers WHERE supplier_id = $1)
       )`,
      [fixture.supplierId],
    );
    await client.query(`DELETE FROM inventory_lots WHERE supplier_id = $1`, [fixture.supplierId]);
    await client.query(`DELETE FROM incoming_inspections WHERE grn_id IN (SELECT id FROM grn_headers WHERE supplier_id = $1)`, [fixture.supplierId]);
    await client.query(`DELETE FROM grn_headers WHERE supplier_id = $1`, [fixture.supplierId]);
    await client.query(`DELETE FROM purchase_orders WHERE supplier_id = $1`, [fixture.supplierId]);
    await client.query(`DELETE FROM material_workflow_assignments WHERE category_id = $1`, [fixture.categoryId]);
    await client.query(`DELETE FROM material_workflows WHERE id = $1`, [fixture.workflowId]);
    await client.query(`DELETE FROM master_materials WHERE id = $1`, [fixture.materialId]);
    await client.query(`DELETE FROM master_material_categories WHERE id = $1`, [fixture.categoryId]);
    await client.query(`DELETE FROM bins WHERE id = $1`, [fixture.binId]);
    await client.query(`DELETE FROM locations WHERE id = $1`, [fixture.locationId]);
    await client.query(`DELETE FROM warehouses WHERE id = $1`, [fixture.warehouseId]);
    await client.query(`DELETE FROM master_suppliers WHERE id = $1`, [fixture.supplierId]);
    await client.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [ids]);
    await client.query("COMMIT").catch(() => undefined);
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`✗ Receiving certification failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});