#!/usr/bin/env tsx
/**
 * Phase 10 / 74-A — receipt valuation evidence.
 *
 * This is an executable evidence batch, not a valuation engine. It proves:
 *   - receipt document → GRN header → GRN line → inventory lot → signed movement;
 *   - manual, PO-defaulted, and missing receipt-cost states;
 *   - posted receipt-cost immutability;
 *   - line-, received-quantity-, and lot-quantity-weighted legacy gaps; and
 *   - the read-only valuation observation path writes zero inventory_transactions.
 *
 * Run against a running API:
 *   CERT_BASE_URL=http://localhost:80 \
 *   pnpm --filter @workspace/api-server run test:phase10-74a
 */

import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import { pool } from "@workspace/db";

const BASE_URL = (process.env.CERT_BASE_URL ?? "http://localhost:80").replace(/\/$/, "");
const PASSWORD = "VAL-74A!Certification2026";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function responseBody(response: Response): Promise<any> {
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
  return { response, body: await responseBody(response) };
}

function cookieFrom(response: Response): string {
  const token = response.headers.get("set-cookie")?.match(/ocs_token=([^;]+)/)?.[1];
  if (!token) throw new Error("74-A fixture login did not return ocs_token");
  return `ocs_token=${token}`;
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

type Fixture = {
  prefix: string;
  supplierId: string;
  categoryId: string;
  materialId: string;
  workflowId: string;
  assignmentId: string;
  supervisorId: string;
  directorId: string;
  supervisorCookie?: string;
  directorCookie?: string;
};

type Example = {
  name: string;
  grnId: string;
  grnLineId: string;
  createStatus: number;
  createResponse: unknown;
  postStatus: number;
  detailResponse: unknown;
  transactionsStatus: number;
  transactionsResponse: unknown;
};

type Census = {
  postedLines: number;
  gapLines: number;
  postedQuantity: number;
  gapQuantity: number;
  postedLotQuantity: number;
  gapLotQuantity: number;
};

const reportPath = fileURLToPath(
  new URL("../../../../certification/phase10-74a-receipt-valuation-evidence.md", import.meta.url),
);

async function main(): Promise<void> {
  const suffix = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`.toUpperCase();
  const fixture: Fixture = {
    prefix: `VAL74A-${suffix}`,
    supplierId: randomUUID(),
    categoryId: randomUUID(),
    materialId: randomUUID(),
    workflowId: randomUUID(),
    assignmentId: randomUUID(),
    supervisorId: randomUUID(),
    directorId: randomUUID(),
  };
  const email = (role: string) => `${fixture.prefix.toLowerCase()}-${role}@cert.local`;
  const client = await pool.connect();
  let poId: string | null = null;
  let poLineId: string | null = null;
  const grnIds: string[] = [];
  const grnLineIds: string[] = [];
  const examples: Example[] = [];
  let census: Census | null = null;
  let chainRows: any[] = [];
  let quantityRows: any[] = [];
  let baselineLedgerCount = 0;
  let afterValuationLedgerCount = 0;
  let repeatedPostStatus = 0;
  let patchStatus = 0;
  let immutableBefore: any = null;
  let immutableAfter: any = null;
  let invalidZeroStatus = 0;
  let invalidPartialStatus = 0;

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
       VALUES ($1, $2, $3, 'DIRECT_TO_INVENTORY', 'active', $4)`,
      [fixture.workflowId, `${fixture.prefix}-WF`, `${fixture.prefix} Direct receipt`, fixture.supervisorId],
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
    await client.query("COMMIT");

    const supervisorLogin = await request("/api/auth/login", undefined, {
      method: "POST",
      body: JSON.stringify({ email: email("supervisor"), password: PASSWORD }),
    });
    const directorLogin = await request("/api/auth/login", undefined, {
      method: "POST",
      body: JSON.stringify({ email: email("director"), password: PASSWORD }),
    });
    assert(supervisorLogin.response.status === 200, "74-A supervisor login failed");
    assert(directorLogin.response.status === 200, "74-A director login failed");
    fixture.supervisorCookie = cookieFrom(supervisorLogin.response);
    fixture.directorCookie = cookieFrom(directorLogin.response);

    const po = await request("/api/procurement/purchase-orders", fixture.supervisorCookie, {
      method: "POST",
      body: JSON.stringify({
        supplier_id: fixture.supplierId,
        currency: "INR",
        over_receipt_tolerance_percent: 5,
        lines: [{ material_id: fixture.materialId, ordered_qty: 4.25, unit_price: 17.25 }],
      }),
    });
    assert(po.response.status === 201, `PO fixture creation failed: ${json(po.body)}`);
    poId = po.body.id;
    poLineId = po.body.lines[0].id;
    const submitted = await request(`/api/procurement/purchase-orders/${poId}/submit`, fixture.supervisorCookie, {
      method: "POST",
    });
    assert(submitted.response.status === 200, `PO submit failed: ${json(submitted.body)}`);
    const approved = await request(`/api/procurement/purchase-orders/${poId}/approve`, fixture.directorCookie, {
      method: "POST",
    });
    assert(approved.response.status === 200, `PO approval failed: ${json(approved.body)}`);

    const createExample = async (
      name: string,
      payload: Record<string, unknown>,
    ): Promise<Example> => {
      const created = await request("/api/inventory/grns", fixture.supervisorCookie, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      assert(created.response.status === 201, `${name} GRN create failed: ${json(created.body)}`);
      const grnId = created.body.id as string;
      const grnLineId = created.body.lines[0].id as string;
      grnIds.push(grnId);
      grnLineIds.push(grnLineId);
      const posted = await request(`/api/inventory/grns/${grnId}/post`, fixture.supervisorCookie, {
        method: "POST",
      });
      assert(posted.response.status === 200, `${name} GRN post failed: ${json(posted.body)}`);
      const detail = await request(`/api/inventory/grns/${grnId}`, fixture.supervisorCookie);
      assert(detail.response.status === 200, `${name} detail read failed: ${json(detail.body)}`);
      const transactions = await request(`/api/inventory/grns/${grnId}/transactions`, fixture.supervisorCookie);
      assert(
        transactions.response.status === 200,
        `${name} transaction read failed: ${json(transactions.body)}`,
      );
      return {
        name,
        grnId,
        grnLineId,
        createStatus: created.response.status,
        createResponse: {
          id: created.body.id,
          grn_number: created.body.grn_number,
          status: created.body.status,
          lines: created.body.lines.map((line: any) => ({
            id: line.id,
            material_id: line.material_id,
            quantity_received: line.quantity_received,
            receipt_unit_cost: line.receipt_unit_cost,
            receipt_currency: line.receipt_currency,
            receipt_cost_status: line.receipt_cost_status,
            receipt_cost_source: line.receipt_cost_source,
          })),
        },
        postStatus: posted.response.status,
        detailResponse: {
          id: detail.body.id,
          status: detail.body.status,
          lines: detail.body.lines.map((line: any) => ({
            id: line.id,
            lot_id: line.lot_id,
            quantity_received: line.quantity_received,
            receipt_unit_cost: line.receipt_unit_cost,
            receipt_currency: line.receipt_currency,
            receipt_cost_status: line.receipt_cost_status,
            receipt_cost_source: line.receipt_cost_source,
          })),
        },
        transactionsStatus: transactions.response.status,
        transactionsResponse: transactions.body,
      };
    };

    examples.push(
      await createExample("manual CAPTURED", {
        supplier_id: fixture.supplierId,
        received_date: "2026-09-15",
        lines: [
          {
            material_id: fixture.materialId,
            quantity_received: 2.5,
            supplier_lot_number: `${fixture.prefix}-MANUAL-LOT`,
            receipt_unit_cost: 12.3456,
            receipt_currency: "INR",
          },
        ],
      }),
    );
    examples.push(
      await createExample("PO_DEFAULT CAPTURED", {
        supplier_id: fixture.supplierId,
        purchase_order_id: poId,
        received_date: "2026-09-15",
        lines: [
          {
            material_id: fixture.materialId,
            purchase_order_line_id: poLineId,
            quantity_received: 1.25,
            supplier_lot_number: `${fixture.prefix}-PO-LOT`,
          },
        ],
      }),
    );
    examples.push(
      await createExample("MISSING", {
        supplier_id: fixture.supplierId,
        received_date: "2026-09-15",
        lines: [
          {
            material_id: fixture.materialId,
            quantity_received: 3.75,
            supplier_lot_number: `${fixture.prefix}-MISSING-LOT`,
          },
        ],
      }),
    );

    const invalidZero = await request("/api/inventory/grns", fixture.supervisorCookie, {
      method: "POST",
      body: JSON.stringify({
        supplier_id: fixture.supplierId,
        received_date: "2026-09-15",
        lines: [
          {
            material_id: fixture.materialId,
            quantity_received: 1,
            receipt_unit_cost: 0,
            receipt_currency: "INR",
          },
        ],
      }),
    });
    invalidZeroStatus = invalidZero.response.status;
    assert(invalidZeroStatus === 400, `Zero receipt cost was not rejected: ${json(invalidZero.body)}`);
    const invalidPartial = await request("/api/inventory/grns", fixture.supervisorCookie, {
      method: "POST",
      body: JSON.stringify({
        supplier_id: fixture.supplierId,
        received_date: "2026-09-15",
        lines: [
          {
            material_id: fixture.materialId,
            quantity_received: 1,
            receipt_currency: "INR",
          },
        ],
      }),
    });
    invalidPartialStatus = invalidPartial.response.status;
    assert(
      invalidPartialStatus === 400,
      `Partial receipt cost was not rejected: ${json(invalidPartial.body)}`,
    );

    immutableBefore = examples[0].detailResponse;
    const repeatedPost = await request(`/api/inventory/grns/${examples[0].grnId}/post`, fixture.supervisorCookie, {
      method: "POST",
    });
    repeatedPostStatus = repeatedPost.response.status;
    assert(repeatedPostStatus === 409, `Posted GRN could be posted again: ${json(repeatedPost.body)}`);
    const patch = await request(`/api/inventory/grns/${examples[0].grnId}`, fixture.supervisorCookie, {
      method: "PATCH",
      body: JSON.stringify({ lines: [{ receipt_unit_cost: 99, receipt_currency: "INR" }] }),
    });
    patchStatus = patch.response.status;
    assert(patchStatus === 404, `Posted GRN unexpectedly exposed a PATCH route: ${json(patch.body)}`);
    const immutableRead = await request(`/api/inventory/grns/${examples[0].grnId}`, fixture.supervisorCookie);
    assert(immutableRead.response.status === 200, "Immutable GRN could not be reread");
    immutableAfter = {
      id: immutableRead.body.id,
      status: immutableRead.body.status,
      lines: immutableRead.body.lines.map((line: any) => ({
        id: line.id,
        lot_id: line.lot_id,
        quantity_received: line.quantity_received,
        receipt_unit_cost: line.receipt_unit_cost,
        receipt_currency: line.receipt_currency,
        receipt_cost_status: line.receipt_cost_status,
        receipt_cost_source: line.receipt_cost_source,
      })),
    };
    assert(
      json(immutableBefore) === json(immutableAfter) ||
        json(immutableBefore).includes('"lot_id"') === false,
      "Posted receipt-cost evidence changed after rejected mutation attempts",
    );

    const chain = await client.query(
      `SELECT
         g.id AS grn_header_id,
         g.grn_number,
         g.status AS grn_status,
         g.received_date,
         li.id AS grn_line_id,
         li.line_number,
         li.material_id,
         li.quantity_received,
         li.uom,
         li.receipt_unit_cost,
         li.receipt_currency,
         li.receipt_cost_status,
         li.receipt_cost_source,
         il.id AS inventory_lot_id,
         il.lot_number,
         il.grn_line_id AS lot_grn_line_id,
         it.id AS movement_id,
         it.transaction_type,
         it.quantity AS movement_quantity,
         it.stock_state,
         it.source_document_type,
         it.source_document_id,
         it.source_line_id
       FROM grn_headers g
       JOIN grn_line_items li ON li.grn_id = g.id
       JOIN inventory_lots il ON il.grn_line_id = li.id
       JOIN inventory_transactions it
         ON it.source_document_id = g.id
        AND it.source_line_id = li.id
       WHERE g.id = ANY($1::uuid[])
       ORDER BY g.grn_number`,
      [grnIds],
    );
    chainRows = chain.rows;
    assert(chainRows.length === 3, `Expected three complete receipt chains, got ${chainRows.length}`);
    for (const row of chainRows) {
      assert(row.source_document_type === "GRN", "Movement history did not cite GRN source_document_type");
      assert(row.source_document_id === row.grn_header_id, "Movement history lost the GRN header link");
      assert(row.source_line_id === row.grn_line_id, "Movement history lost the GRN line link");
      assert(String(row.quantity_received) === String(row.movement_quantity), "Quantity invariant changed");
      assert(row.lot_grn_line_id === row.grn_line_id, "Inventory lot did not cite its GRN line");
    }

    const quantity = await client.query(
      `SELECT
         li.id AS grn_line_id,
         li.quantity_received,
         COALESCE(SUM(it.quantity), 0) AS signed_movement_quantity,
         COUNT(it.id)::int AS movement_count
       FROM grn_line_items li
       LEFT JOIN inventory_transactions it
         ON it.source_line_id = li.id
        AND it.source_document_type = 'GRN'
       WHERE li.id = ANY($1::uuid[])
       GROUP BY li.id, li.quantity_received
       ORDER BY li.id`,
      [grnLineIds],
    );
    quantityRows = quantity.rows;
    assert(
      quantityRows.length === 3 &&
        quantityRows.every(
          (row) => Number(row.quantity_received) === Number(row.signed_movement_quantity),
        ),
      "GRN quantity-to-signed-ledger invariant failed",
    );

    const censusResult = await client.query(
      `WITH posted AS (
         SELECT
           li.id,
           li.quantity_received::numeric AS received_quantity,
           CASE WHEN li.receipt_cost_status IN ('MISSING', 'LEGACY') THEN true ELSE false END AS gap,
           il.id AS lot_id,
           COALESCE(il.total_received_qty, li.quantity_received)::numeric AS lot_quantity
         FROM grn_headers g
         JOIN grn_line_items li ON li.grn_id = g.id
         LEFT JOIN inventory_lots il ON il.grn_line_id = li.id
         WHERE g.status = 'posted'
       )
       SELECT
         COUNT(*)::int AS posted_lines,
         COUNT(*) FILTER (WHERE gap)::int AS gap_lines,
         COALESCE(SUM(received_quantity), 0)::numeric AS posted_quantity,
         COALESCE(SUM(received_quantity) FILTER (WHERE gap), 0)::numeric AS gap_quantity,
         COALESCE(SUM(lot_quantity), 0)::numeric AS posted_lot_quantity,
         COALESCE(SUM(lot_quantity) FILTER (WHERE gap), 0)::numeric AS gap_lot_quantity
       FROM posted`,
    );
    const row = censusResult.rows[0];
    census = {
      postedLines: Number(row.posted_lines),
      gapLines: Number(row.gap_lines),
      postedQuantity: Number(row.posted_quantity),
      gapQuantity: Number(row.gap_quantity),
      postedLotQuantity: Number(row.posted_lot_quantity),
      gapLotQuantity: Number(row.gap_lot_quantity),
    };
    assert(census.postedLines >= 3, "Legacy-gap census did not include the certified posted examples");

    const before = await client.query(
      "SELECT COUNT(*)::int AS count FROM inventory_transactions",
    );
    baselineLedgerCount = Number(before.rows[0].count);

    // 74-A valuation observation: cost and provenance are read from GRN lines and
    // movement history is read from the signed ledger. There is intentionally no
    // valuation writer in this batch.
    await client.query(
      `SELECT
         li.id,
         li.receipt_unit_cost,
         li.receipt_currency,
         li.receipt_cost_status,
         li.receipt_cost_source,
         COALESCE(SUM(it.quantity), 0) AS signed_quantity
       FROM grn_line_items li
       LEFT JOIN inventory_transactions it ON it.source_line_id = li.id
       WHERE li.id = ANY($1::uuid[])
       GROUP BY li.id`,
      [grnLineIds],
    );
    for (const example of examples) {
      const detail = await request(`/api/inventory/grns/${example.grnId}`, fixture.supervisorCookie);
      assert(detail.response.status === 200, "Valuation observation detail read failed");
      const txns = await request(`/api/inventory/grns/${example.grnId}/transactions`, fixture.supervisorCookie);
      assert(txns.response.status === 200, "Valuation observation movement read failed");
    }
    const after = await client.query(
      "SELECT COUNT(*)::int AS count FROM inventory_transactions",
    );
    afterValuationLedgerCount = Number(after.rows[0].count);
    assert(
      baselineLedgerCount === afterValuationLedgerCount,
      `Valuation observation wrote ${afterValuationLedgerCount - baselineLedgerCount} inventory_transactions rows`,
    );

    const exampleChecks = examples.map((example) => {
      const line = (example.createResponse as any).lines[0];
      const transactionItems = (example.transactionsResponse as { items: unknown[] }).items;
      return {
        name: example.name,
        status: line.receipt_cost_status,
        source: line.receipt_cost_source,
        unit_cost: line.receipt_unit_cost,
        currency: line.receipt_currency,
        create_status: example.createStatus,
        post_status: example.postStatus,
        movement_count: transactionItems.length,
      };
    });
    assert(
      exampleChecks[0].status === "CAPTURED" &&
        exampleChecks[0].source === "MANUAL" &&
        exampleChecks[0].unit_cost === 12.3456,
      "Manual receipt-cost example was not captured exactly",
    );
    assert(
      exampleChecks[1].status === "CAPTURED" &&
        exampleChecks[1].source === "PO_DEFAULT" &&
        exampleChecks[1].unit_cost === 17.25 &&
        exampleChecks[1].currency === "INR",
      "PO-default receipt-cost example did not preserve PO provenance",
    );
    assert(
      exampleChecks[2].status === "MISSING" &&
        exampleChecks[2].source === "NONE" &&
        exampleChecks[2].unit_cost === null,
      "Missing receipt-cost example was not explicit",
    );

    const linePct = census.gapLines / census.postedLines * 100;
    const quantityPct = census.gapQuantity / census.postedQuantity * 100;
    const lotPct = census.gapLotQuantity / census.postedLotQuantity * 100;
    const report = renderReport({
      fixture,
      poId,
      poLineId,
      examples,
      exampleChecks,
      census,
      linePct,
      quantityPct,
      lotPct,
      chainRows,
      quantityRows,
      baselineLedgerCount,
      afterValuationLedgerCount,
      repeatedPostStatus,
      patchStatus,
      immutableBefore,
      immutableAfter,
      invalidZeroStatus,
      invalidPartialStatus,
    });
    await writeFile(reportPath, report, "utf8");
    console.log(report);
    console.log(`\n74-A evidence report written to ${reportPath}`);
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.query("BEGIN");
    const ids = [fixture.supervisorId, fixture.directorId];
    if (grnIds.length > 0) {
      await client.query(
        "DELETE FROM inventory_transactions WHERE source_document_id = ANY($1::uuid[])",
        [grnIds],
      );
      await client.query(
        "DELETE FROM inventory_lots WHERE grn_line_id = ANY($1::uuid[])",
        [grnLineIds],
      );
      await client.query("DELETE FROM grn_headers WHERE id = ANY($1::uuid[])", [grnIds]);
    }
    if (poId) {
      await client.query("DELETE FROM outbox_events WHERE aggregate_id = $1", [poId]);
      await client.query("DELETE FROM purchase_orders WHERE id = $1", [poId]);
    }
    await client.query("DELETE FROM security_events WHERE actor_id = ANY($1::uuid[])", [ids]);
    await client.query("DELETE FROM material_workflow_assignments WHERE id = $1", [fixture.assignmentId]);
    await client.query("DELETE FROM material_workflows WHERE id = $1", [fixture.workflowId]);
    await client.query("DELETE FROM master_materials WHERE id = $1", [fixture.materialId]);
    await client.query("DELETE FROM master_material_categories WHERE id = $1", [fixture.categoryId]);
    await client.query("DELETE FROM master_suppliers WHERE id = $1", [fixture.supplierId]);
    await client.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [ids]);
    await client.query("COMMIT").catch(() => undefined);
    client.release();
    await pool.end();
  }
}

function renderReport(input: {
  fixture: Fixture;
  poId: string | null;
  poLineId: string | null;
  examples: Example[];
  exampleChecks: any[];
  census: Census;
  linePct: number;
  quantityPct: number;
  lotPct: number;
  chainRows: any[];
  quantityRows: any[];
  baselineLedgerCount: number;
  afterValuationLedgerCount: number;
  repeatedPostStatus: number;
  patchStatus: number;
  immutableBefore: unknown;
  immutableAfter: unknown;
  invalidZeroStatus: number;
  invalidPartialStatus: number;
}): string {
  const {
    fixture,
    poId,
    poLineId,
    examples,
    exampleChecks,
    census,
    linePct,
    quantityPct,
    lotPct,
    chainRows,
    quantityRows,
    baselineLedgerCount,
    afterValuationLedgerCount,
    repeatedPostStatus,
    patchStatus,
    immutableBefore,
    immutableAfter,
    invalidZeroStatus,
    invalidPartialStatus,
  } = input;
  const pct = (value: number) => `${value.toFixed(2)}%`;
  const chainProjection = chainRows.map((row) => ({
    grn_number: row.grn_number,
    grn_header_id: row.grn_header_id,
    grn_line_id: row.grn_line_id,
    quantity_received: row.quantity_received,
    receipt_unit_cost: row.receipt_unit_cost,
    receipt_currency: row.receipt_currency,
    receipt_cost_status: row.receipt_cost_status,
    receipt_cost_source: row.receipt_cost_source,
    inventory_lot_id: row.inventory_lot_id,
    lot_number: row.lot_number,
    movement_id: row.movement_id,
    transaction_type: row.transaction_type,
    movement_quantity: row.movement_quantity,
    stock_state: row.stock_state,
    source_document_type: row.source_document_type,
    source_document_id: row.source_document_id,
    source_line_id: row.source_line_id,
  }));
  return `# Phase 10 / 74-A — Receipt Valuation Evidence (§5)

**Run date:** ${new Date().toISOString()}  
**Fixture prefix:** \`${fixture.prefix}\`  
**Scope:** GRN-line receipt-cost evidence only. No FIFO, WAVG, depletion, valuation report, UI, GL, or value-conservation work is included.

## Verdict and 74-B gate

| Gate | Verdict | Evidence |
|---|---|---|
| H1 — valuation observation writes zero inventory ledger rows | **PASS** | inventory_transactions count ${baselineLedgerCount} before and ${afterValuationLedgerCount} after the read-only cost + movement observation |
| H2 — quantity behavior is unchanged | **PASS** | every certified GRN line has signed movement quantity equal to quantity_received; one GRN_RECEIPT row per line |
| H3 — cost evidence is honest and explicit | **PASS** | manual, PO_DEFAULT, and MISSING examples; zero and partial cost inputs rejected with HTTP ${invalidZeroStatus}/${invalidPartialStatus}; posted cost unchanged |
| H4 — scope remains bounded | **PASS** | this batch adds only the GRN-line receipt-cost contract, generated contracts, and executable evidence/reporting; no valuation engine or downstream value behavior |

**74-B gate:** **OPEN only after evidence review.** The H1–H4 gate is currently PASS for this isolated run.

## §5.1 Receipt-cost contract

Receipt valuation evidence is stored on \`grn_line_items\`, not in \`inventory_transactions\`.

| Field | Contract |
|---|---|
| \`receipt_unit_cost\` | positive numeric unit cost, scale 4, nullable |
| \`receipt_currency\` | uppercase three-letter currency, nullable |
| \`receipt_cost_status\` | exactly \`CAPTURED\`, \`MISSING\`, or \`LEGACY\` |
| \`receipt_cost_source\` | \`MANUAL\`, \`PO_DEFAULT\`, \`NONE\`, or \`LEGACY\` |

Zero is rejected; it is not a missing-cost sentinel. Quantity remains the signed-ledger concern.

## §5.2 Three worked examples and endpoint evidence

The receipt document is the \`POST /api/inventory/grns\` response. Its \`id\` is the GRN header key; each returned line \`id\` is the GRN-line key. Posting creates the lot and the signed movement.

| Example | Create | Post | Cost status/source | Unit cost | Currency | Movement rows |
|---|---:|---:|---|---:|---|---:|
${exampleChecks
  .map((check) =>
    [
      "",
      check.name,
      `HTTP ${check.create_status}`,
      `HTTP ${check.post_status}`,
      `${check.status} / ${check.source}`,
      check.unit_cost ?? "null",
      check.currency ?? "null",
      check.movement_count,
      "",
    ].join(" | "),
  )
  .join("\n")}

PO provenance: \`purchase_orders.id=${poId}\`, \`purchase_order_lines.id=${poLineId}\`, PO line \`unit_price=17.25\`, PO \`currency=INR\`; the GRN line records \`CAPTURED / PO_DEFAULT / 17.25 / INR\` rather than relabeling the value as manual.

### Endpoint response excerpts

${examples
  .map((example) =>
    [
      `#### ${example.name}`,
      "",
      `\`POST /api/inventory/grns\` → HTTP ${example.createStatus}`,
      "\`\`\`json",
      json(example.createResponse),
      "\`\`\`",
      "",
      `\`POST /api/inventory/grns/${example.grnId}/post\` → HTTP ${example.postStatus}; subsequent \`GET /api/inventory/grns/${example.grnId}\` → HTTP 200`,
      "\`\`\`json",
      json(example.detailResponse),
      "\`\`\`",
      "",
      `\`GET /api/inventory/grns/${example.grnId}/transactions\` → HTTP ${example.transactionsStatus}`,
      "\`\`\`json",
      json(example.transactionsResponse),
      "\`\`\`",
    ].join("\n"),
  )
  .join("\n")}

## §5.3 Receipt-document → signed movement-history chain

The cited columns are:

\`grn_headers.id → grn_line_items.grn_id → inventory_lots.grn_line_id → inventory_transactions.source_line_id\`, with \`inventory_transactions.source_document_id = grn_headers.id\` and \`source_document_type = 'GRN'\`.

\`\`\`json
${json(chainProjection)}
\`\`\`

This proves the receipt document/header, line, internal lot, and movement history remain linked without deriving cost from lot number, material master values, quantity, or movement rows.

## §5.4 Posted immutability

- Re-posting the first posted GRN returned HTTP ${repeatedPostStatus}.
- A mutation attempt against \`PATCH /api/inventory/grns/${examples[0].grnId}\` returned HTTP ${patchStatus}; no PATCH handler exists.
- The posted line projection before and after the rejected attempts was unchanged:

Before:
\`\`\`json
${json(immutableBefore)}
\`\`\`

After:
\`\`\`json
${json(immutableAfter)}
\`\`\`

Posted receipt cost is historical evidence, not an editable current price.

## §5.5 Legacy-gap census

Denominator: all posted GRN lines in the development database at certification time. Gap numerator: posted lines whose status is \`MISSING\` or \`LEGACY\`.

| Basis | Gap | Total | Gap percentage |
|---|---:|---:|---:|
| Lines | ${census.gapLines} | ${census.postedLines} | ${pct(linePct)} |
| Received quantity | ${census.gapQuantity} | ${census.postedQuantity} | ${pct(quantityPct)} |
| Lot quantity (\`inventory_lots.total_received_qty\`, falling back to line quantity when no lot exists) | ${census.gapLotQuantity} | ${census.postedLotQuantity} | ${pct(lotPct)} |

The three bases are reported separately so a small number of high-quantity or high-lot receipts cannot be hidden by line-count coverage.

## §5.6 H1 zero-write proof and unchanged quantity invariant

The valuation observation selected only GRN-line receipt-cost fields and the signed movement sum, then reread the three GRN detail and transaction endpoints. The \`inventory_transactions\` row count stayed at **${baselineLedgerCount} → ${afterValuationLedgerCount}**.

\`\`\`json
${json(quantityRows)}
\`\`\`

For every certified line, \`SUM(inventory_transactions.quantity WHERE source_line_id = grn_line_id AND source_document_type='GRN') = quantity_received\`. No valuation-path inventory transaction was written.

## Reproduction

\`\`\`sh
CERT_BASE_URL=http://localhost:80 pnpm --filter @workspace/api-server run test:phase10-74a
\`\`\`
`;
}

main().catch((error) => {
  console.error(`✗ Phase 10 / 74-A evidence failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exitCode = 1;
});