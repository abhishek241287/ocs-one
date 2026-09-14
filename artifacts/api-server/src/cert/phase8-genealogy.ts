#!/usr/bin/env tsx
/**
 * Batch 73-F — isolated Phase 8 manufacturing-genealogy battery.
 *
 * The fixture is deliberately written through direct SQL because this is a
 * certification harness, not a production workflow. The API paths themselves
 * remain read-only. Every fixture row is prefixed and removed in finally.
 */

import { createHash, randomUUID } from "node:crypto";
import { db, pool, type UserRole } from "@workspace/db";
import { indexSerialInTx } from "../lib/serial-index";
import { signToken } from "../middleware/auth";

type Json = Record<string, any>;
type QueryClient = { query: (text: string, values?: unknown[]) => Promise<any> };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const BASE_URL = (process.env.CERT_BASE_URL ?? "http://localhost:80").replace(/\/$/, "");
const OWNER_EMAIL =
  process.env.CERT_OWNER_EMAIL ?? process.env.CERT_DIRECTOR_EMAIL ?? "admin@ocs.local";

function uuid(): string {
  return randomUUID();
}

function prefixCode(prefix: string, suffix: string): string {
  return `${prefix}-${suffix}`.slice(0, 50);
}

function collectCitations(value: unknown, result: Array<{ type: string; id: string }> = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectCitations(item, result));
  } else if (value && typeof value === "object") {
    const object = value as Json;
    if (
      object.document_cited &&
      typeof object.document_cited.type === "string" &&
      typeof object.document_cited.id === "string"
    ) {
      result.push(object.document_cited);
    }
    Object.values(object).forEach((child) => collectCitations(child, result));
  }
  return result;
}

function assertCitations(value: unknown, label: string): void {
  const citations = collectCitations(value);
  assert(citations.length > 0, `${label} had no cited edges`);
  for (const citation of citations) {
    assert(citation.type.length > 0 && citation.id.length > 0, `${label} has an invalid citation`);
  }
}

function cookieForUser(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  session_version: number;
}): string {
  return `ocs_token=${signToken({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role as UserRole,
    sessionVersion: Number(user.session_version),
  })}`;
}

async function sessionFor(email: string): Promise<string> {
  const result = await pool.query(
    `SELECT id, email, name, role, session_version
     FROM users
     WHERE email = $1 AND is_active = true
     LIMIT 1`,
    [email],
  );
  assert(result.rows[0], `Active certification principal ${email} is unavailable`);
  return cookieForUser(result.rows[0]);
}

async function request(path: string, cookie: string, init: RequestInit = {}): Promise<Json> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      Cookie: cookie,
      ...(init.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as Json;
  assert(response.ok, `${init.method ?? "GET"} ${path}: HTTP ${response.status} ${JSON.stringify(body)}`);
  return body;
}

type Fixture = {
  prefix: string;
  ownerId: string;
  viewerEmail: string;
  orderId: string;
  productId: string;
  serialNumber: string;
  serialUnitId: string;
  lotA: string;
  lotB: string;
  templateOneVersionId: string;
  templateTwoVersionId: string;
  capacityCode: string;
  chemistryCode: string;
  ids: {
    grnHeaders: string[];
    grnLines: string[];
    lots: string[];
    reservations: string[];
    allocations: string[];
    issueNotes: string[];
    issueLines: string[];
    wip: string[];
    consumptions: string[];
    transfers: string[];
    transferLines: string[];
    batches: string[];
    batchLines: string[];
    captures: string[];
    captureValues: string[];
    templateAttributes: string[];
    versions: string[];
    templates: string[];
    attributes: string[];
  };
};

async function setupFixture(): Promise<Fixture> {
  const prefix = `P73F-${uuid().slice(0, 8).toUpperCase()}`;
  const client = await pool.connect();
  const ids: Fixture["ids"] = {
    grnHeaders: [],
    grnLines: [],
    lots: [],
    reservations: [],
    allocations: [],
    issueNotes: [],
    issueLines: [],
    wip: [],
    consumptions: [],
    transfers: [],
    transferLines: [],
    batches: [],
    batchLines: [],
    captures: [],
    captureValues: [],
    templateAttributes: [],
    versions: [],
    templates: [],
    attributes: [],
  };

  try {
    await client.query("BEGIN");
    const ownerResult = await client.query(
      `SELECT id FROM users WHERE email = $1 AND is_active = true LIMIT 1`,
      [OWNER_EMAIL],
    );
    assert(ownerResult.rows[0], `Owner ${OWNER_EMAIL} is unavailable`);
    const ownerId = ownerResult.rows[0].id as string;

    const materials = await client.query(
      `SELECT id, code, uom
       FROM master_materials
       WHERE status = 'active'
       ORDER BY created_at, id
       LIMIT 2`,
    );
    assert(materials.rows.length === 2, "P73F requires two active material masters");
    const supplier = await client.query(
      `SELECT id FROM master_suppliers ORDER BY created_at, id LIMIT 1`,
    );
    const warehouses = await client.query(
      `SELECT id FROM warehouses WHERE is_active = true ORDER BY created_at, id LIMIT 2`,
    );
    const category = await client.query(
      `SELECT id FROM product_categories WHERE code = 'BATTERY_PACK' LIMIT 1`,
    );
    const model = await client.query(`SELECT id FROM master_products ORDER BY created_at, id LIMIT 1`);
    const workflow = await client.query(
      `SELECT code FROM product_workflows WHERE code = 'BATTERY' LIMIT 1`,
    );
    assert(supplier.rows[0] && category.rows[0] && model.rows[0] && workflow.rows[0], "P73F masters are unavailable");
    assert(warehouses.rows[0], "P73F requires an active warehouse");

    const materialA = materials.rows[0];
    const materialB = materials.rows[1];
    const supplierId = supplier.rows[0].id as string;
    const warehouseA = warehouses.rows[0].id as string;
    const warehouseB = warehouses.rows[1]?.id as string | undefined;
    const now = new Date().toISOString();
    const orderId = uuid();
    const productId = uuid();
    const serialNumber = `${prefix}-BATTERY-001`;
    const lotA = uuid();
    const lotB = uuid();
    const grnA = uuid();
    const grnB = uuid();
    const lineA = uuid();
    const lineB = uuid();
    ids.grnHeaders.push(grnA, grnB);
    ids.grnLines.push(lineA, lineB);
    ids.lots.push(lotA, lotB);

    await client.query(
      `INSERT INTO mfg_production_orders
        (id, order_number, battery_number, product_id, factory_manager,
         current_stage, status, priority, notes)
       VALUES ($1, $2, $3, $4, $5, 'quality_control', 'completed', 'low', $6)`,
      [
        orderId,
        prefixCode(prefix, "ORDER"),
        serialNumber,
        model.rows[0].id,
        `${prefix} certification`,
        "P73F completed QC-PASS fixture",
      ],
    );

    await client.query(
      `INSERT INTO grn_headers
        (id, grn_number, supplier_id, warehouse_id, received_date, status, created_by, remarks)
       VALUES
        ($1, $2, $3, $4, CURRENT_DATE, 'posted', $5, $6),
        ($7, $8, $3, $4, CURRENT_DATE, 'posted', $5, $9)`,
      [
        grnA,
        prefixCode(prefix, "GRN-A"),
        supplierId,
        warehouseA,
        ownerId,
        "P73F LOT-S1 cell material",
        grnB,
        prefixCode(prefix, "GRN-B"),
        "P73F bulk material",
      ],
    );
    await client.query(
      `INSERT INTO grn_line_items
        (id, grn_id, line_number, material_id, quantity_received, uom,
         supplier_lot_number, lot_id, warehouse_id, accepted_qty, rejected_qty,
         put_away_qty, inspection_status)
       VALUES
        ($1, $2, 1, $3, 10, $4, $5, $6, $7, 10, 0, 10, 'passed'),
        ($8, $9, 1, $10, 10, $11, $12, $13, $7, 10, 0, 10, 'passed')`,
      [
        lineA,
        grnA,
        materialA.id,
        materialA.uom,
        `${prefix}-SUPPLIER-LOT-S1`,
        lotA,
        warehouseA,
        lineB,
        grnB,
        materialB.id,
        materialB.uom,
        `${prefix}-SUPPLIER-LOT-S2`,
        lotB,
      ],
    );
    await client.query(
      `INSERT INTO inventory_lots
        (id, lot_number, material_id, supplier_lot_number, supplier_id, grn_line_id,
         received_date, status, total_received_qty, remaining_qty, uom, warehouse_id)
       VALUES
        ($1, $2, $3, $4, $5, $6, $7, 'active', 10, 8, $8, $9),
        ($10, $11, $12, $13, $5, $14, $7, 'active', 10, 6, $15, $9)`,
      [
        lotA,
        prefixCode(prefix, "LOT-S1"),
        materialA.id,
        `${prefix}-SUPPLIER-LOT-S1`,
        supplierId,
        lineA,
        now,
        materialA.uom,
        warehouseA,
        lotB,
        prefixCode(prefix, "LOT-S2"),
        materialB.id,
        `${prefix}-SUPPLIER-LOT-S2`,
        lineB,
        materialB.uom,
      ],
    );

    const capacityCode = `${prefix.toLowerCase()}_capacity`;
    const chemistryCode = `${prefix.toLowerCase()}_chemistry`;
    const capacityId = uuid();
    const chemistryId = uuid();
    const templateOneId = uuid();
    const templateTwoId = uuid();
    const versionOneId = uuid();
    const versionTwoId = uuid();
    ids.attributes.push(capacityId, chemistryId);
    ids.templates.push(templateOneId, templateTwoId);
    ids.versions.push(versionOneId, versionTwoId);
    await client.query(
      `INSERT INTO attribute_definitions
        (id, code, name, data_type, scope, status, allowed_values, created_by)
       VALUES
        ($1, $2, 'Capacity', 'DECIMAL', 'RECEIPT_LINE', 'ACTIVE', NULL, $3),
        ($4, $5, 'Chemistry', 'DROPDOWN', 'RECEIPT_LINE', 'ACTIVE', $6, $3)`,
      [
        capacityId,
        capacityCode,
        ownerId,
        chemistryId,
        chemistryCode,
        JSON.stringify(["LiFePO4", "NMC"]),
      ],
    );
    await client.query(
      `INSERT INTO attribute_templates
        (id, code, name, status, created_by, updated_by)
       VALUES
        ($1, $2, 'P73F battery cell template', 'ACTIVE', $3, $3),
        ($4, $5, 'P73F out-of-scope template', 'ACTIVE', $3, $3)`,
      [
        templateOneId,
        `${prefix.toLowerCase()}_cell_template`,
        ownerId,
        templateTwoId,
        `${prefix.toLowerCase()}_other_template`,
      ],
    );
    await client.query(
      `INSERT INTO attribute_template_versions
        (id, template_id, version_no, status, effective_from, created_by)
       VALUES
        ($1, $2, 1, 'ACTIVE', $3, $4),
        ($5, $6, 1, 'ACTIVE', $3, $4)`,
      [versionOneId, templateOneId, now, ownerId, versionTwoId, templateTwoId],
    );
    const templateAttributeRows = [
      [uuid(), versionOneId, capacityId, 1, 1, "Ah"],
      [uuid(), versionOneId, chemistryId, 1, 2, null],
      [uuid(), versionTwoId, capacityId, 1, 1, "Ah"],
      [uuid(), versionTwoId, chemistryId, 1, 2, null],
    ];
    ids.templateAttributes.push(...templateAttributeRows.map((row) => row[0] as string));
    for (const row of templateAttributeRows) {
      await client.query(
        `INSERT INTO attribute_template_attributes
          (id, template_version_id, attribute_id, required, sequence, unit_override)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        row,
      );
    }
    const captureId = uuid();
    const capacityValueId = uuid();
    const chemistryValueId = uuid();
    ids.captures.push(captureId);
    ids.captureValues.push(capacityValueId, chemistryValueId);
    await client.query(
      `INSERT INTO attribute_capture_instances
        (id, target_type, target_id, template_version_id, material_id, status, source_type, created_by)
       VALUES ($1, 'GRN_LINE', $2, $3, $4, 'VALIDATED', 'API', $5)`,
      [captureId, lineA, versionOneId, materialA.id, ownerId],
    );
    await client.query(
      `INSERT INTO attribute_capture_values
        (id, capture_instance_id, attribute_id, value_num, unit, value_origin)
       VALUES ($1, $2, $3, 280, 'Ah', 'EXPLICIT')`,
      [capacityValueId, captureId, capacityId],
    );
    await client.query(
      `INSERT INTO attribute_capture_values
        (id, capture_instance_id, attribute_id, value_text, value_origin)
       VALUES ($1, $2, $3, 'LiFePO4', 'EXPLICIT')`,
      [chemistryValueId, captureId, chemistryId],
    );

    const reservationA = uuid();
    const reservationB = uuid();
    const allocationA = uuid();
    const allocationB = uuid();
    ids.reservations.push(reservationA, reservationB);
    ids.allocations.push(allocationA, allocationB);
    await client.query(
      `INSERT INTO inventory_reservations
        (id, reservation_number, production_order_id, material_id, reserved_qty,
         allocated_qty, issued_qty, uom, status, lot_id, warehouse_id, created_by)
       VALUES
        ($1, $2, $3, $4, 4, 4, 4, $5, 'fully_issued', $6, $7, $8),
        ($9, $10, $3, $11, 4, 4, 4, $12, 'fully_issued', $13, $7, $8)`,
      [
        reservationA,
        prefixCode(prefix, "RES-A"),
        orderId,
        materialA.id,
        materialA.uom,
        lotA,
        warehouseA,
        ownerId,
        reservationB,
        prefixCode(prefix, "RES-B"),
        materialB.id,
        materialB.uom,
        lotB,
      ],
    );
    await client.query(
      `INSERT INTO inventory_reservation_allocations
        (id, reservation_id, lot_id, quantity, status)
       VALUES
        ($1, $2, $3, 4, 'issued'),
        ($4, $5, $6, 4, 'issued')`,
      [allocationA, reservationA, lotA, allocationB, reservationB, lotB],
    );

    const issueA = uuid();
    const issueB = uuid();
    const issueLineA = uuid();
    const issueLineB = uuid();
    ids.issueNotes.push(issueA, issueB);
    ids.issueLines.push(issueLineA, issueLineB);
    await client.query(
      `INSERT INTO wip_issue_notes
        (id, issue_number, reservation_id, production_order_id, status, issued_by, idempotency_key, notes)
       VALUES
        ($1, $2, $3, $4, 'fully_issued', $5, $6, 'P73F single issue'),
        ($7, $8, $9, $4, 'fully_issued', $5, $10, 'P73F certified bulk issue')`,
      [
        issueA,
        prefixCode(prefix, "WIP-A"),
        reservationA,
        orderId,
        ownerId,
        `${prefix}-single`,
        issueB,
        prefixCode(prefix, "WIP-B"),
        reservationB,
        `${prefix}-bulk`,
      ],
    );
    await client.query(
      `INSERT INTO wip_issue_lines
        (id, wip_issue_note_id, reservation_allocation_id, lot_id, quantity, uom)
       VALUES
        ($1, $2, $3, $4, 4, $5),
        ($6, $7, $8, $9, 4, $10)`,
      [issueLineA, issueA, allocationA, lotA, materialA.uom, issueLineB, issueB, allocationB, lotB, materialB.uom],
    );
    const batchId = uuid();
    const batchLineId = uuid();
    ids.batches.push(batchId);
    ids.batchLines.push(batchLineId);
    await client.query(
      `INSERT INTO bulk_batches
        (id, production_order_id, idempotency_key, request_hash, status, created_by)
       VALUES ($1, $2, $3, $4, 'completed', $5)`,
      [batchId, orderId, `${prefix}-bulk-batch`, createHash("sha256").update(prefix).digest("hex"), ownerId],
    );
    await client.query(
      `INSERT INTO bulk_batch_lines
        (id, batch_id, sequence, material_id, requested_qty, source_bom_line_refs,
         reservation_id, wip_issue_note_id, issued_qty)
       VALUES ($1, $2, 1, $3, 4, $4, $5, $6, 4)`,
      [batchLineId, batchId, materialB.id, JSON.stringify([`${prefix}-BOM-B`]), reservationB, issueB],
    );

    const wipA = uuid();
    const wipB = uuid();
    ids.wip.push(wipA, wipB);
    await client.query(
      `INSERT INTO wip_inventory
        (id, production_order_id, material_id, lot_id, wip_issue_note_id, warehouse_id,
         issued_qty, consumed_qty, returned_qty, scrapped_qty, remaining_qty, uom, status)
       VALUES
        ($1, $2, $3, $4, $5, $6, 4, 2, 0, 0, 2, $7, 'partially_consumed'),
        ($8, $2, $9, $10, $11, $6, 4, 0, 0, 0, 4, $12, 'active')`,
      [wipA, orderId, materialA.id, lotA, issueA, warehouseA, materialA.uom, wipB, materialB.id, lotB, issueB, materialB.uom],
    );
    const consumptionId = uuid();
    ids.consumptions.push(consumptionId);
    await client.query(
      `INSERT INTO consumption_confirmations
        (id, confirmation_number, production_order_id, material_id, lot_id, planned_qty,
         actual_qty, variance_qty, uom, status, confirmed_by, confirmed_at)
       VALUES ($1, $2, $3, $4, $5, 4, 2, -2, $6, 'confirmed', $7, $8)`,
      [consumptionId, prefixCode(prefix, "CONSUME-A"), orderId, materialA.id, lotA, materialA.uom, ownerId, now],
    );

    if (warehouseB) {
      const transferId = uuid();
      const transferLineId = uuid();
      ids.transfers.push(transferId);
      ids.transferLines.push(transferLineId);
      await client.query(
        `INSERT INTO transfer_requests
          (id, transfer_number, type, status, source_warehouse_id, destination_warehouse_id,
           requested_by, requested_at, received_by, received_at, idempotency_key, notes)
         VALUES ($1, $2, 'warehouse_to_warehouse', 'received', $3, $4, $5, $6, $5, $6, $7, $8)`,
        [transferId, prefixCode(prefix, "TRANSFER"), warehouseA, warehouseB, ownerId, now, `${prefix}-transfer`, "P73F downstream transfer"],
      );
      await client.query(
        `INSERT INTO transfer_lines
          (id, transfer_request_id, line_number, material_id, lot_id, requested_qty,
           issued_qty, received_qty, uom, status)
         VALUES ($1, $2, 1, $3, $4, 1, 1, 1, $5, 'fully_received')`,
        [transferLineId, transferId, materialA.id, lotA, materialA.uom],
      );
    }

    await client.query(
      `INSERT INTO products
        (id, category_id, model_id, workflow_code, source_production_order_id,
         official_product_serial, serial_source, qc_status, product_status, manufacturing_completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'OCS', 'passed', 'qc_passed', $7)`,
      [productId, category.rows[0].id, model.rows[0].id, workflow.rows[0].code, orderId, serialNumber, now],
    );

    await client.query("COMMIT");
    client.release();

    const indexed = await db.transaction(async (tx) =>
      indexSerialInTx(tx, {
        serialNumber,
        materialId: materialA.id,
        lotId: null,
        productionOrderId: orderId,
        productId,
        sourceDocumentType: "product",
        sourceDocumentId: productId,
        createdBy: ownerId,
      }),
    );
    assert(indexed.status === "created", "P73F output serial was not indexed");
    return {
      prefix,
      ownerId,
      viewerEmail: "viewer@ocs.local",
      orderId,
      productId,
      serialNumber,
      serialUnitId: indexed.id,
      lotA,
      lotB,
      templateOneVersionId: versionOneId,
      templateTwoVersionId: versionTwoId,
      capacityCode,
      chemistryCode,
      ids,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
    throw error;
  }
}

async function teardownFixture(fixture: Fixture): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM outbox_events WHERE aggregate_id = $1", [fixture.serialUnitId]);
    await client.query("DELETE FROM serial_units WHERE id = $1", [fixture.serialUnitId]);
    await client.query("DELETE FROM attribute_capture_values WHERE id = ANY($1::uuid[])", [fixture.ids.captureValues]);
    await client.query("DELETE FROM attribute_capture_instances WHERE id = ANY($1::uuid[])", [fixture.ids.captures]);
    await client.query("DELETE FROM attribute_template_attributes WHERE id = ANY($1::uuid[])", [fixture.ids.templateAttributes]);
    await client.query("DELETE FROM attribute_template_versions WHERE id = ANY($1::uuid[])", [fixture.ids.versions]);
    await client.query("DELETE FROM attribute_templates WHERE id = ANY($1::uuid[])", [fixture.ids.templates]);
    await client.query("DELETE FROM attribute_definitions WHERE id = ANY($1::uuid[])", [fixture.ids.attributes]);
    await client.query("DELETE FROM transfer_lines WHERE id = ANY($1::uuid[])", [fixture.ids.transferLines]);
    await client.query("DELETE FROM transfer_requests WHERE id = ANY($1::uuid[])", [fixture.ids.transfers]);
    await client.query("DELETE FROM consumption_confirmations WHERE id = ANY($1::uuid[])", [fixture.ids.consumptions]);
    await client.query("DELETE FROM wip_inventory WHERE id = ANY($1::uuid[])", [fixture.ids.wip]);
    await client.query("DELETE FROM bulk_batch_lines WHERE id = ANY($1::uuid[])", [fixture.ids.batchLines]);
    await client.query("DELETE FROM bulk_batches WHERE id = ANY($1::uuid[])", [fixture.ids.batches]);
    await client.query("DELETE FROM wip_issue_lines WHERE id = ANY($1::uuid[])", [fixture.ids.issueLines]);
    await client.query("DELETE FROM wip_issue_notes WHERE id = ANY($1::uuid[])", [fixture.ids.issueNotes]);
    await client.query("DELETE FROM inventory_reservation_allocations WHERE id = ANY($1::uuid[])", [fixture.ids.allocations]);
    await client.query("DELETE FROM inventory_reservations WHERE id = ANY($1::uuid[])", [fixture.ids.reservations]);
    await client.query("DELETE FROM products WHERE id = $1", [fixture.productId]);
    await client.query("DELETE FROM mfg_production_orders WHERE id = $1", [fixture.orderId]);
    await client.query("DELETE FROM inventory_lots WHERE id = ANY($1::uuid[])", [fixture.ids.lots]);
    await client.query("DELETE FROM grn_line_items WHERE id = ANY($1::uuid[])", [fixture.ids.grnLines]);
    await client.query("DELETE FROM grn_headers WHERE id = ANY($1::uuid[])", [fixture.ids.grnHeaders]);
    await client.query("DELETE FROM security_events WHERE event_type = 'serial.indexed' AND detail LIKE $1", [`%${fixture.prefix}%`]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function assertCitedDocuments(responses: Json[]): Promise<void> {
  const tableByType: Record<string, string> = {
    attribute_capture_value: "attribute_capture_values",
    bulk_batch_line: "bulk_batch_lines",
    consumption_confirmation: "consumption_confirmations",
    inventory_reservation: "inventory_reservations",
    inventory_reservation_allocation: "inventory_reservation_allocations",
    mfg_production_order: "mfg_production_orders",
    product: "products",
    transfer_line: "transfer_lines",
    wip_inventory: "wip_inventory",
    wip_issue_line: "wip_issue_lines",
    wip_issue_note: "wip_issue_notes",
  };
  const citations = collectCitations(responses);
  for (const citation of citations) {
    const table = tableByType[citation.type];
    assert(table, `No source table registered for citation type ${citation.type}`);
    const result = await pool.query(`SELECT 1 FROM ${table} WHERE id = $1 LIMIT 1`, [citation.id]);
    assert(result.rows[0], `Citation ${citation.type}:${citation.id} does not resolve`);
  }
}

async function main(): Promise<void> {
  const fixture = await setupFixture();
  try {
    const owner = await sessionFor(OWNER_EMAIL);
    const viewer = await sessionFor(fixture.viewerEmail);
    const passed: string[] = [];

    const upstream = await request(`/api/genealogy/upstream?production_order_id=${fixture.orderId}`, owner);
    assert(Array.isArray(upstream.inputs) && upstream.inputs.length === 2, "GT-01 did not return both material inputs");
    assert(upstream.inputs.every((input: Json) => input.bulk_issue !== undefined), "GT-01 bulk field was not projected");
    assert(upstream.inputs.some((input: Json) => input.bulk_issue), "GT-01 bulk issue path was not identified");
    assert(
      upstream.inputs.some((input: Json) => input.attributes?.some((a: Json) => a.value === 280)),
      `GT-01 capacity 280 capture was not returned: ${JSON.stringify(upstream)}`,
    );
    assert(
      upstream.inputs.some((input: Json) => input.attributes?.some((a: Json) => a.value === "LiFePO4")),
      "GT-01 chemistry capture was not returned",
    );
    assertCitations(upstream, "GT-01 upstream");
    passed.push("GT-01");

    const downstream = await request(`/api/genealogy/downstream?lot_id=${fixture.lotA}`, owner);
    assert(downstream.reservations?.length > 0, "GT-02 reservation consumer missing");
    assert(downstream.wip?.length > 0, "GT-02 WIP consumer missing");
    assert(downstream.consumptions?.length > 0, "GT-02 consumption consumer missing");
    assert(downstream.outputs?.some((output: Json) => output.serial_number === fixture.serialNumber), "GT-07 finished serial missing downstream");
    if (fixture.ids.transferLines.length > 0) assert(downstream.transfers?.length > 0, "GT-02 transfer consumer missing");
    assertCitations(downstream, "GT-02 downstream");
    passed.push("GT-02", "GT-07");

    const compositionByProduct = await request(`/api/genealogy/composition?product_id=${fixture.productId}`, owner);
    const compositionBySerial = await request(
      `/api/genealogy/composition?serial_number=${encodeURIComponent(fixture.serialNumber)}`,
      owner,
    );
    assert(JSON.stringify(compositionByProduct) === JSON.stringify(compositionBySerial), "GT-06 serial round-trip differs from product lookup");
    assert(!("component_serials" in compositionByProduct), "GT-03 exposed deferred component_serials");
    assert(compositionByProduct.consumed_lots?.some((lot: Json) => lot.lot_id === fixture.lotA), "GT-03 consumed LOT-S1 missing");
    assertCitations(compositionByProduct, "GT-03 composition");
    passed.push("GT-03", "GT-06");

    const recallPath =
      `/api/genealogy/recall?template_id=${fixture.templateOneVersionId}` +
      `&attribute_code=${encodeURIComponent(fixture.capacityCode)}&min=270&max=281`;
    const firstRecall = await request(recallPath, owner);
    const secondRecall = await request(recallPath, owner);
    assert(firstRecall.matches?.length === 1, "GT-04 capacity recall did not match LOT-S1");
    assert(firstRecall.matches[0].lot_id === fixture.lotA, "GT-04 matched the wrong lot");
    assert(createHash("sha256").update(JSON.stringify(firstRecall)).digest("hex") === createHash("sha256").update(JSON.stringify(secondRecall)).digest("hex"), "INV-GEN-04 recall hashes differ");
    const outOfScope = await request(
      `/api/genealogy/recall?template_id=${fixture.templateTwoVersionId}` +
        `&attribute_code=${encodeURIComponent(fixture.capacityCode)}&min=270&max=281`,
      owner,
    );
    assert(outOfScope.matches?.length === 0, "GT-04 second template was not scoped out");
    assertCitations(firstRecall, "GT-04 recall");
    passed.push("GT-04", "INV-GEN-04");

    await assertCitedDocuments([upstream, downstream, compositionByProduct, firstRecall]);
    passed.push("GT-05", "INV-GEN-01");

    const serialViolations = await pool.query(
      `SELECT count(*)::int AS count
       FROM serial_units su
       LEFT JOIN inventory_lots il ON il.id = su.lot_id
       LEFT JOIN attribute_capture_instances ac ON ac.id = su.capture_instance_id
       LEFT JOIN mfg_production_orders po ON po.id = su.production_order_id
       LEFT JOIN products p ON p.id = su.product_id
       WHERE su.id = $1
         AND (su.lot_id IS NOT NULL AND il.id IS NULL
           OR su.capture_instance_id IS NOT NULL AND ac.id IS NULL
           OR su.production_order_id IS NOT NULL AND po.id IS NULL
           OR su.product_id IS NOT NULL AND p.id IS NULL)`,
      [fixture.serialUnitId],
    );
    assert(Number(serialViolations.rows[0].count) === 0, "INV-GEN-02 serial FK integrity violation");
    const productViolations = await pool.query(
      `SELECT count(*)::int AS count
       FROM products p
       LEFT JOIN mfg_production_orders po ON po.id = p.source_production_order_id
       WHERE p.id = $1
         AND (po.id IS NULL OR po.status <> 'completed')`,
      [fixture.productId],
    );
    assert(Number(productViolations.rows[0].count) === 0, "INV-GEN-03 product output integrity violation");
    passed.push("INV-GEN-02", "INV-GEN-03");

    const viewerResult = await request(`/api/genealogy/composition?serial_number=${encodeURIComponent(fixture.serialNumber)}`, viewer);
    assert(viewerResult.product?.serial_number === fixture.serialNumber, "GT-07 viewer could not read genealogy");
    const writeResponse = await fetch(`${BASE_URL}/api/genealogy/upstream`, {
      method: "POST",
      headers: { Cookie: owner },
    });
    assert(writeResponse.status === 405, `Genealogy write verb returned ${writeResponse.status}`);
    passed.push("viewer-read", "read-only-405");

    console.log(JSON.stringify({
      result: "PASS",
      suite: "phase8-genealogy-battery",
      fixture: fixture.prefix,
      passed,
      wall: "regression wall must be run by the non-nested release command",
    }));
  } finally {
    await teardownFixture(fixture);
    await pool.end();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ result: "FAIL", suite: "phase8-genealogy-battery", error: String(error) }));
  process.exitCode = 1;
});