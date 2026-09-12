#!/usr/bin/env tsx
/**
 * Task #35 development regression for the approved Option A transfer model.
 *
 * The test creates an isolated development fixture, exercises the real
 * POST /api/inventory/transfers route, verifies the Store/material ledger and
 * Cell Processing destination domain independently, then removes only its own
 * rows. It does not use the frozen FAT candidate or modify Block 3 evidence.
 *
 * Run:
 *   CERT_BASE_URL=http://localhost:80 \
 *   pnpm --filter @workspace/api-server run test:task35-transfer-domain
 */

import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";

const BASE_URL = (process.env.CERT_BASE_URL ?? "http://localhost:80").replace(/\/$/, "");
const TEST_PASSWORD = "TASK35!Development2026";

type Fixture = {
  prefix: string;
  userId: string;
  email: string;
  supplierId: string;
  categoryId: string;
  cellMasterId: string;
  materialId: string;
  grnId: string;
  grnLineId: string;
  inspectionId: string;
  inspectionLineId: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
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

function cookieFromSetCookie(setCookie: string | null): string {
  const match = setCookie?.match(/ocs_token=([^;]+)/);
  if (!match) throw new Error("Development regression login did not return ocs_token");
  return `ocs_token=${match[1]}`;
}

async function request(path: string, init: RequestInit = {}): Promise<{ response: Response; body: any }> {
  const response = await fetch(`${BASE_URL}${path}`, init);
  return { response, body: await jsonBody(response) };
}

async function main(): Promise<void> {
  const suffix = `${Date.now().toString(36)}-${randomUUID().slice(0, 4)}`;
  const prefix = `TASK35-${suffix}`.toUpperCase();
  const fixture: Fixture = {
    prefix,
    userId: randomUUID(),
    email: `${prefix.toLowerCase()}@cert.local`,
    supplierId: randomUUID(),
    categoryId: randomUUID(),
    cellMasterId: randomUUID(),
    materialId: randomUUID(),
    grnId: randomUUID(),
    grnLineId: randomUUID(),
    inspectionId: randomUUID(),
    inspectionLineId: randomUUID(),
  };

  const client = await pool.connect();
  let transferId: string | null = null;
  let cellLotId: string | null = null;

  try {
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    const receivedDate = new Date().toISOString().slice(0, 10);
    const supplierLotNumber = `${prefix}-SUPPLIER-LOT`;

    await client.query("BEGIN");
    await client.query(
      `INSERT INTO users (id, email, password_hash, name, role, is_active)
       VALUES ($1, $2, $3, $4, 'supervisor', true)`,
      [fixture.userId, fixture.email, passwordHash, `${prefix} Supervisor`],
    );
    await client.query(
      `INSERT INTO master_suppliers (id, code, name, status, created_by)
       VALUES ($1, $2, $3, 'active', $4)`,
      [fixture.supplierId, `${prefix}-SUPPLIER`, `${prefix} Supplier`, fixture.userId],
    );
    await client.query(
      `INSERT INTO master_material_categories
       (id, code, name, linked_master_type, engineering_master_required, status, created_by)
       VALUES ($1, $2, $3, 'CELL', true, 'active', $4)`,
      [fixture.categoryId, `${prefix}-CATEGORY`, `${prefix} Cell Category`, fixture.userId],
    );
    await client.query(
      `INSERT INTO master_cells
       (id, code, name, manufacturer, model, chemistry, capacity_mah,
        nominal_voltage_v, max_voltage_v, min_voltage_v, weight_g, dimensions,
        internal_resistance_spec_mohm, cycle_life, approved_supplier, status, created_by)
       VALUES ($1, $2, $3, $4, $5, 'LiFePO4', 280000, 3.2, 3.65, 2.5, 5400,
               '173x72x207mm', 1.0, 4000, $6, 'active', $7)`,
      [
        fixture.cellMasterId,
        `${prefix}-CELL-MASTER`,
        `${prefix} Cell Master`,
        `${prefix} Cell Works`,
        `${prefix}-LFP-280`,
        `${prefix} Supplier`,
        fixture.userId,
      ],
    );
    await client.query(
      `INSERT INTO master_materials
       (id, code, name, category_id, uom, manufacturer, usage_type,
        linked_master_type, linked_master_id, cell_master_id, status, created_by)
       VALUES ($1, $2, $3, $4, 'PCS', $5, 'INVENTORY_COMPONENT',
               'CELL', $6, $6, 'active', $7)`,
      [
        fixture.materialId,
        `${prefix}-MATERIAL`,
        `${prefix} Cell Material`,
        fixture.categoryId,
        `${prefix} Cell Works`,
        fixture.cellMasterId,
        fixture.userId,
      ],
    );
    await client.query(
      `INSERT INTO grn_headers
       (id, grn_number, supplier_id, received_date, invoice_number, status,
        remarks, posted_at, posted_by, created_by)
       VALUES ($1, $2, $3, $4, $5, 'posted', $6, now(), $7, $7)`,
      [
        fixture.grnId,
        `${prefix}-GRN`,
        fixture.supplierId,
        receivedDate,
        `${prefix}-INVOICE`,
        `${prefix} Task 35 development fixture`,
        fixture.userId,
      ],
    );
    await client.query(
      `INSERT INTO grn_line_items
       (id, grn_id, line_number, material_id, quantity_received, uom,
        supplier_lot_number, inspection_status, remarks)
       VALUES ($1, $2, 1, $3, 8, 'PCS', $4, 'passed', $5)`,
      [
        fixture.grnLineId,
        fixture.grnId,
        fixture.materialId,
        supplierLotNumber,
        `${prefix} inspected cell line`,
      ],
    );
    await client.query(
      `INSERT INTO incoming_inspections
       (id, inspection_number, grn_id, remarks, inspected_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        fixture.inspectionId,
        `${prefix}-INSPECTION`,
        fixture.grnId,
        `${prefix} complete inspection`,
        fixture.userId,
      ],
    );
    await client.query(
      `INSERT INTO incoming_inspection_lines
       (id, inspection_id, grn_line_id, grn_id, material_id,
        quantity_received, accepted_qty, rejected_qty, result)
       VALUES ($1, $2, $3, $4, $5, 8, 8, 0, 'passed')`,
      [
        fixture.inspectionLineId,
        fixture.inspectionId,
        fixture.grnLineId,
        fixture.grnId,
        fixture.materialId,
      ],
    );
    await client.query(
      `INSERT INTO inventory_transactions
       (transaction_type, material_id, quantity, uom, stock_state,
        source_document_type, source_document_id, source_line_id, created_by)
       VALUES
        ('GRN_RECEIPT', $1, 8, 'PCS', 'inspection_pending', 'GRN', $2, $3, $4),
        ('INSPECTION_RELEASE', $1, -8, 'PCS', 'inspection_pending', 'INSPECTION', $5, $3, $4),
        ('INSPECTION_ACCEPT', $1, 8, 'PCS', 'available', 'INSPECTION', $5, $3, $4)`,
      [
        fixture.materialId,
        fixture.grnId,
        fixture.grnLineId,
        fixture.userId,
        fixture.inspectionId,
      ],
    );
    await client.query("COMMIT");

    const login = await request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: fixture.email, password: TEST_PASSWORD }),
    });
    assert(login.response.status === 200, `Fixture login failed: HTTP ${login.response.status}`);
    const cookie = cookieFromSetCookie(login.response.headers.get("set-cookie"));

    const transfer = await request("/api/inventory/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        grn_line_id: fixture.grnLineId,
        quantity: 3,
        received_by: `${prefix} operator`,
        remarks: `${prefix} Option A regression`,
      }),
    });
    assert(transfer.response.status === 201, `Transfer creation failed: HTTP ${transfer.response.status}`);
    assert(transfer.body?.id, "Transfer response did not contain an ID");
    transferId = transfer.body.id;
    cellLotId = transfer.body.cell_lot_id;
    assert(
      transfer.body.destination_audit?.source_movement_qty === -3 &&
        transfer.body.destination_audit?.source_available_qty === 5 &&
        transfer.body.destination_audit?.destination_quantity === 3 &&
        transfer.body.destination_audit?.generated_cell_count === 3 &&
        transfer.body.destination_audit?.reconciliation_status === "reconciled",
      "Transfer response did not expose a reconciled cross-domain destination audit",
    );

    const transferDetail = await request(`/api/inventory/transfers/${transferId}`, {
      headers: { Cookie: cookie },
    });
    assert(
      transferDetail.response.status === 200 &&
        transferDetail.body?.destination_audit?.reconciliation_status === "reconciled" &&
        transferDetail.body?.destination_audit?.source_available_qty === 5,
      "Transfer detail did not preserve the reconciled destination audit",
    );

    const stock = await request(
      `/api/inventory/stock?search=${encodeURIComponent(prefix)}&stock_state=available`,
      { headers: { Cookie: cookie } },
    );
    assert(
      stock.response.status === 200 &&
        stock.body?.items?.length === 1 &&
        stock.body.items[0].material_id === fixture.materialId &&
        stock.body.items[0].quantity === 5,
      "Raw-material stock projection overstated or omitted the remaining source balance",
    );

    const provenance = await request(`/api/inventory/stock/${fixture.materialId}/provenance`, {
      headers: { Cookie: cookie },
    });
    assert(
      provenance.response.status === 200 &&
        provenance.body?.receipts?.length === 1 &&
        provenance.body.receipts[0].grn_line_id === fixture.grnLineId &&
        provenance.body.receipts[0].remaining_available_qty === 5,
      "GRN-line provenance did not reconcile to the remaining source balance",
    );

    const picker = await request(`/api/inventory/cell-stock?search=${encodeURIComponent(prefix)}`, {
      headers: { Cookie: cookie },
    });
    assert(
      picker.response.status === 200 &&
        picker.body?.items?.length === 1 &&
        picker.body.items[0].grn_line_id === fixture.grnLineId &&
        picker.body.items[0].available_qty === 5,
      "Transfer picker did not use the net source balance",
    );

    const cellInventoryReport = await request("/api/cells/reports/inventory", {
      headers: { Cookie: cookie },
    });
    const reportLotRows =
      typeof cellInventoryReport.body === "string"
        ? cellInventoryReport.body
            .split("\n")
            .filter((line: string) => line.includes(transfer.body.transfer_number))
        : [];
    assert(
      cellInventoryReport.response.status === 200 && reportLotRows.length === 3,
      "Cell inventory report did not expose all destination cells",
    );

    const ledger = await client.query(
      `SELECT id, transaction_type, quantity, stock_state, source_document_type,
              source_document_id, source_line_id
       FROM inventory_transactions
       WHERE source_document_id = $1
       ORDER BY id`,
      [transferId],
    );
    assert(ledger.rows.length === 1, `Expected exactly one transfer ledger row, found ${ledger.rows.length}`);
    assert(
      ledger.rows[0].transaction_type === "MATERIAL_TRANSFER_TO_CELL_PROCESSING" &&
        Number(ledger.rows[0].quantity) === -3 &&
        ledger.rows[0].stock_state === "available" &&
        ledger.rows[0].source_document_type === "TRANSFER" &&
        ledger.rows[0].source_line_id === fixture.grnLineId,
      "Transfer source ledger row did not match the Option A contract",
    );

    const sourceBalance = await client.query(
      `SELECT COALESCE(SUM(quantity), 0) AS available
       FROM inventory_transactions
       WHERE source_line_id = $1 AND stock_state = 'available'`,
      [fixture.grnLineId],
    );
    assert(Number(sourceBalance.rows[0].available) === 5, "Source available balance was not 5");

    const transferRow = await client.query(
      `SELECT id, quantity, grn_line_id, supplier_id
       FROM material_transfers
       WHERE id = $1`,
      [transferId],
    );
    assert(transferRow.rows.length === 1 && Number(transferRow.rows[0].quantity) === 3, "Transfer quantity was not 3");
    assert(transferRow.rows[0].grn_line_id === fixture.grnLineId, "Transfer was not linked to the source GRN line");

    const lotRow = await client.query(
      `SELECT id, quantity_received, transfer_id, supplier_lot_number
       FROM cell_lots
       WHERE id = $1`,
      [cellLotId],
    );
    assert(lotRow.rows.length === 1 && Number(lotRow.rows[0].quantity_received) === 3, "Cell-lot destination quantity was not 3");
    assert(lotRow.rows[0].transfer_id === transferId, "Cell lot was not linked to the transfer");
    assert(lotRow.rows[0].supplier_lot_number === supplierLotNumber, "Supplier-lot traceability was not preserved");

    // The cell lot has no grn_line_id column. Resolve it back to the source GRN
    // line through the canonical material_transfers.transfer_id relationship.
    const destinationBySourceLine = await client.query(
      `SELECT l.id AS cell_lot_id, l.quantity_received, l.transfer_id,
              l.supplier_lot_number, t.grn_line_id
       FROM cell_lots l
       INNER JOIN material_transfers t ON t.id = l.transfer_id
       WHERE t.grn_line_id = $1 AND t.id = $2`,
      [fixture.grnLineId, transferId],
    );
    assert(
      destinationBySourceLine.rows.length === 1 &&
        destinationBySourceLine.rows[0].cell_lot_id === cellLotId &&
        destinationBySourceLine.rows[0].transfer_id === transferId &&
        destinationBySourceLine.rows[0].grn_line_id === fixture.grnLineId,
      "Cell-lot source-line reconciliation did not use transfer_id → material_transfers.grn_line_id",
    );

    const cells = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM cells
       WHERE lot_id = $1`,
      [cellLotId],
    );
    assert(Number(cells.rows[0].count) === 3, "Exactly three cells were not generated");

    const duplicates = await client.query(
      `SELECT source_document_type, source_document_id, source_line_id,
              transaction_type, stock_state, COUNT(*)::int AS count
       FROM inventory_transactions
       WHERE source_document_id IN ($1, $2, $3)
       GROUP BY source_document_type, source_document_id, source_line_id,
                transaction_type, stock_state
       HAVING COUNT(*) > 1`,
      [fixture.grnId, fixture.inspectionId, transferId],
    );
    assert(duplicates.rows.length === 0, "Duplicate inventory transaction group found");

    const orphans = await client.query(
      `SELECT t.id
       FROM inventory_transactions t
       LEFT JOIN grn_headers g
         ON t.source_document_type = 'GRN' AND t.source_document_id = g.id
       LEFT JOIN incoming_inspections i
         ON t.source_document_type = 'INSPECTION' AND t.source_document_id = i.id
       LEFT JOIN material_transfers mt
         ON t.source_document_type = 'TRANSFER' AND t.source_document_id = mt.id
       LEFT JOIN grn_line_items gl ON t.source_line_id = gl.id
       WHERE t.source_document_id IN ($1, $2, $3)
         AND (
           (t.source_document_type = 'GRN' AND g.id IS NULL) OR
           (t.source_document_type = 'INSPECTION' AND i.id IS NULL) OR
           (t.source_document_type = 'TRANSFER' AND mt.id IS NULL) OR
           gl.id IS NULL
         )`,
      [fixture.grnId, fixture.inspectionId, transferId],
    );
    assert(orphans.rows.length === 0, "Orphan inventory transaction found");

    const reconciliation = await client.query(
      `SELECT
         (SELECT quantity FROM material_transfers WHERE id = $1) AS transfer_quantity,
         (SELECT quantity_received FROM cell_lots WHERE id = $2) AS lot_quantity,
         (SELECT COUNT(*) FROM cells WHERE lot_id = $2) AS cell_count,
         (SELECT COALESCE(SUM(quantity), 0)
          FROM inventory_transactions
          WHERE source_line_id = $3 AND stock_state = 'available') AS source_available`,
      [transferId, cellLotId, fixture.grnLineId],
    );
    const reconciled = reconciliation.rows[0];
    assert(
      Number(reconciled.transfer_quantity) === 3 &&
        Number(reconciled.lot_quantity) === 3 &&
        Number(reconciled.cell_count) === 3 &&
        Number(reconciled.source_available) === 5,
      "Cross-domain reconciliation did not produce transfer=3, lot=3, cells=3, source=5",
    );

    console.log(
      JSON.stringify(
        {
          result: "PASS",
          model: "Option A",
          transfer_id: transferId,
          cell_lot_id: cellLotId,
          source_movement: -3,
          source_available: 5,
          transfer_quantity: 3,
          destination_quantity: 3,
          generated_cells: 3,
          route_projections: {
            stock_available: stock.body.items[0].quantity,
            provenance_remaining_available: provenance.body.receipts[0].remaining_available_qty,
            picker_available: picker.body.items[0].available_qty,
            cell_report_rows: reportLotRows.length,
          },
          duplicate_groups: duplicates.rows.length,
          orphan_rows: orphans.rows.length,
          supplier_lot_number: supplierLotNumber,
        },
        null,
        2,
      ),
    );
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.query("BEGIN");
    await client.query(`DELETE FROM security_events WHERE actor_id = $1`, [fixture.userId]);
    if (cellLotId) {
      await client.query(`DELETE FROM cell_lot_events WHERE lot_id = $1`, [cellLotId]);
      await client.query(`DELETE FROM cells WHERE lot_id = $1`, [cellLotId]);
      await client.query(`DELETE FROM cell_lots WHERE id = $1`, [cellLotId]);
    }
    if (transferId) {
      await client.query(`DELETE FROM inventory_transactions WHERE source_document_id = $1`, [transferId]);
      await client.query(`DELETE FROM material_transfers WHERE id = $1`, [transferId]);
    }
    await client.query(`DELETE FROM inventory_transactions WHERE source_line_id = $1`, [fixture.grnLineId]);
    await client.query(`DELETE FROM incoming_inspection_lines WHERE id = $1`, [fixture.inspectionLineId]);
    await client.query(`DELETE FROM incoming_inspections WHERE id = $1`, [fixture.inspectionId]);
    await client.query(`DELETE FROM grn_line_items WHERE id = $1`, [fixture.grnLineId]);
    await client.query(`DELETE FROM grn_headers WHERE id = $1`, [fixture.grnId]);
    await client.query(`DELETE FROM master_materials WHERE id = $1`, [fixture.materialId]);
    await client.query(`DELETE FROM master_cells WHERE id = $1`, [fixture.cellMasterId]);
    await client.query(`DELETE FROM master_material_categories WHERE id = $1`, [fixture.categoryId]);
    await client.query(`DELETE FROM master_suppliers WHERE id = $1`, [fixture.supplierId]);
    await client.query(`DELETE FROM users WHERE id = $1`, [fixture.userId]);
    await client.query("COMMIT");
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`✗ Task #35 transfer-domain regression failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});