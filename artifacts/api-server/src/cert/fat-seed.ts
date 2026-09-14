#!/usr/bin/env tsx
/**
 * Controlled FAT dataset for the frozen OCS One candidate.
 *
 * This is an approved test-database tool, not application startup seed logic.
 * It owns only the FAT-E2E-* namespace and never mutates the QA-FAT-* blocker
 * fixtures or global singleton configuration.
 *
 * Usage:
 *   FAT_TEST_PASSWORD='provided out of band' pnpm cert:fat:seed
 *   pnpm cert:fat:verify
 *   pnpm cert:fat:smoke
 *   pnpm cert:fat:seed -- --action=teardown
 */

import bcrypt from "bcryptjs";
import { pool } from "@workspace/db";
import {
  FAT_FIXTURE_CONTRACT,
  FAT_IDS,
  FAT_PREFIX,
  actorEmail,
  assertNoResiduals,
  batteryNumber,
  cellId,
  manifestPath,
  orderNumber,
  residualCounts,
  type SqlClient,
  teardownFatDataset,
  writeManifest,
} from "./fat-fixture-manifest";

const FROZEN_TAG = "FAT-CANDIDATE-2026-09-08";
const FROZEN_COMMIT = "60564b1b49b76ce0b97e46d1de65a7325ef50ba7";
const RUN_AT = new Date().toISOString();
const DATE = FAT_FIXTURE_CONTRACT.datasetDate;
const FAT_ROLES = FAT_FIXTURE_CONTRACT.roles;
type FatRole = (typeof FAT_ROLES)[number];
const FAT_STAGE_TYPES = FAT_FIXTURE_CONTRACT.stages.canonical;

type PreflightCheck = {
  group: string;
  name: string;
  ok: boolean;
  expected?: string;
  actual?: string;
};

function preflightValue(value: unknown): string {
  if (value === undefined || value === null) return "null";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function preflightCheck(
  checks: PreflightCheck[],
  group: string,
  name: string,
  ok: boolean,
  expected?: unknown,
  actual?: unknown,
): void {
  checks.push({
    group,
    name,
    ok,
    ...(expected !== undefined ? { expected: preflightValue(expected) } : {}),
    ...(actual !== undefined ? { actual: preflightValue(actual) } : {}),
  });
}

function exactSet(values: unknown[], expected: readonly string[]): boolean {
  return values.length === expected.length && values.every((value, index) => String(value) === expected[index]);
}

async function query(client: SqlClient, text: string, values: unknown[] = []) {
  return client.query(text, values);
}

async function seedUsers(client: SqlClient): Promise<void> {
  const password = process.env.FAT_TEST_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error("FAT_TEST_PASSWORD must be supplied out of band and contain at least 8 characters");
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const users = [
    ...FAT_ROLES.map((role) => [role, FAT_FIXTURE_CONTRACT.roleNames[role], role, FAT_IDS.users[role]] as const),
  ] as const;

  for (const [role, name, dbRole, id] of users) {
    await query(
      client,
      `INSERT INTO users (id, email, password_hash, name, role, dealer_id, is_active)
       VALUES ($1, $2, $3, $4, $5::user_role, $6, true)`,
      [
        id,
        actorEmail(role),
        passwordHash,
        name,
        dbRole,
        role === "dealer" ? FAT_IDS.dealer : null,
      ],
    );
  }
}

async function seedMasters(client: SqlClient): Promise<void> {
  const ownerId = FAT_IDS.users.owner;
  await query(
    client,
    `INSERT INTO logistics_dealers
      (id, dealer_code, dealer_name, gst_number, address, contact_person, mobile, email, territory, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')`,
    [
      FAT_IDS.dealer,
      FAT_FIXTURE_CONTRACT.fulfillment.dealerSnapshot.code,
      FAT_FIXTURE_CONTRACT.fulfillment.dealerSnapshot.name,
      FAT_FIXTURE_CONTRACT.fulfillment.dealerSnapshot.gst,
      FAT_FIXTURE_CONTRACT.fulfillment.dealerSnapshot.address,
      FAT_FIXTURE_CONTRACT.fulfillment.dealerSnapshot.contact,
      FAT_FIXTURE_CONTRACT.fulfillment.dealerSnapshot.mobile,
      "fat.dealer@fat.local",
      "FAT E2E Territory",
    ],
  );

  await query(
    client,
    `INSERT INTO product_categories (id, code, name, status, created_by)
     VALUES ($1, $2, $3, 'active', $4)`,
    [FAT_IDS.masters.category, `${FAT_PREFIX}BATTERY-PACK`, "FAT E2E Battery Pack", ownerId],
  );
  await query(
    client,
    `INSERT INTO product_workflows
      (id, code, name, status, stage_sequence, product_creation_trigger, created_by)
     VALUES ($1, $2, $3, 'active', $4::jsonb, 'QC_PASS', $5)`,
    [
      FAT_IDS.masters.workflow,
      `${FAT_PREFIX}BATTERY-WORKFLOW`,
      "FAT E2E Nine-Stage Battery Workflow",
      JSON.stringify(FAT_FIXTURE_CONTRACT.stages.canonical),
      ownerId,
    ],
  );

  await query(
    client,
    `INSERT INTO master_cells
      (id, code, name, manufacturer, model, chemistry, capacity_mah, nominal_voltage_v,
       max_voltage_v, min_voltage_v, weight_g, dimensions, internal_resistance_spec_mohm,
       cycle_life, approved_supplier, status, created_by)
     VALUES ($1, $2, $3, 'FAT Cell Works', 'FAT-LFP-280', 'LiFePO4', 280000, 3.2,
             3.65, 2.5, 5400, '173x72x207mm', 1.0, 4000, $4, 'active', $5)`,
    [
      FAT_IDS.masters.cell,
      `${FAT_PREFIX}CELL-MASTER`,
      "FAT E2E LiFePO4 Cell",
      `${FAT_PREFIX}SUPPLIER`,
      ownerId,
    ],
  );
  await query(
    client,
    `INSERT INTO master_bms
      (id, code, name, manufacturer, model, current_rating_a, min_voltage_v,
       max_voltage_v, cell_support_count, has_can, has_rs485, firmware_version, status, created_by)
     VALUES ($1, $2, $3, 'FAT Controls', 'FAT-BMS-16S', 200, 40, 60, 16,
             true, true, 'FAT-1.0', 'active', $4)`,
    [FAT_IDS.masters.bms, `${FAT_PREFIX}BMS-MASTER`, "FAT E2E BMS", ownerId],
  );
  await query(
    client,
    `INSERT INTO master_cabinets
      (id, code, name, model, material, ip_rating, dimensions, weight_kg, colour, mounting_type, status, created_by)
     VALUES ($1, $2, $3, 'FAT-CAB-16S', 'Powder-coated steel', 'IP54',
             '500x300x200mm', 12.5, 'Black', 'Floor', 'active', $4)`,
    [FAT_IDS.masters.cabinet, `${FAT_PREFIX}CABINET-MASTER`, "FAT E2E Cabinet", ownerId],
  );
  await query(
    client,
    `INSERT INTO master_connectors
      (id, code, name, manufacturer, model, current_rating_a, voltage_rating_v, connector_type, status, created_by)
     VALUES ($1, $2, $3, 'FAT Connectors', 'FAT-HV-200', 200, 60, 'HV plug', 'active', $4)`,
    [FAT_IDS.masters.connector, `${FAT_PREFIX}CONNECTOR-MASTER`, "FAT E2E HV Connector", ownerId],
  );
  await query(
    client,
    `INSERT INTO master_cables
      (id, code, name, size_sqmm, colour, current_rating_a, insulation_type, manufacturer, status, created_by)
     VALUES ($1, $2, $3, 35, 'Red', 200, 'XLPE', 'FAT Cable Works', 'active', $4)`,
    [FAT_IDS.masters.cable, `${FAT_PREFIX}CABLE-MASTER`, "FAT E2E HV Cable", ownerId],
  );
  await query(
    client,
    `INSERT INTO master_busbars
      (id, code, name, material, thickness_mm, width_mm, length_mm, surface_finish, status, created_by)
     VALUES ($1, $2, $3, 'Copper', 3, 25, 220, 'Tin plated', 'active', $4)`,
    [FAT_IDS.masters.busbar, `${FAT_PREFIX}BUSBAR-MASTER`, "FAT E2E Copper Busbar", ownerId],
  );
  await query(
    client,
    `INSERT INTO master_chargers
      (id, code, name, manufacturer, model, output_voltage_v, output_current_a,
       power_kw, communication_protocol, status, created_by)
     VALUES ($1, $2, $3, 'FAT Power', 'FAT-CHG-60V', 60, 50, 3, 'CAN', 'active', $4)`,
    [FAT_IDS.masters.charger, `${FAT_PREFIX}CHARGER-MASTER`, "FAT E2E Charger Master", ownerId],
  );
  await query(
    client,
    `INSERT INTO master_test_equipment
      (id, code, name, equipment_type, equipment_name, manufacturer, model, serial_number,
       calibration_date, next_calibration_due, floor_status, software_version, location, status, created_by)
     VALUES ($1, $2, $3, 'capacity_tester', 'FAT Capacity Bench', 'FAT Instruments',
             'FAT-CAP-01', 'FAT-E2E-CAP-001', $4, '2027-09-08', 'available',
             'FAT-2.0', 'FAT QA Lab', 'active', $5)`,
    [FAT_IDS.masters.testEquipment, `${FAT_PREFIX}TEST-EQUIPMENT`, "FAT E2E Capacity Tester", DATE, ownerId],
  );
  await query(
    client,
    `INSERT INTO master_products
      (id, code, name, chemistry, category, category_id, nominal_voltage_v, capacity_ah,
       energy_kwh, configuration, cell_count, bms_master_id, cabinet_master_id,
       cell_master_id, warranty_period_months, status, created_by)
     VALUES ($1, $2, $3, 'LiFePO4', 'FAT E2E Battery Pack', $4, 51.2, 280,
             14.336, '16S1P', 16, $5, $6, $7, 60, 'active', $8)`,
    [
      FAT_IDS.masters.model,
      `${FAT_PREFIX}MODEL-16S280`,
      "FAT E2E 16S 280Ah Battery Pack",
      FAT_IDS.masters.category,
      FAT_IDS.masters.bms,
      FAT_IDS.masters.cabinet,
      FAT_IDS.masters.cell,
      ownerId,
    ],
  );

  await query(
    client,
    `INSERT INTO master_suppliers (id, code, name, status, created_by)
     VALUES ($1, $2, $3, 'active', $4)`,
    [FAT_IDS.masters.supplier, `${FAT_PREFIX}SUPPLIER`, "FAT E2E Cell and BMS Supplier", ownerId],
  );
  await query(
    client,
    `INSERT INTO master_material_categories
      (id, code, name, linked_master_type, engineering_master_required, status, created_by)
     VALUES
      ($1, $2, 'FAT E2E Cell Material', 'CELL', true, 'active', $3),
      ($4, $5, 'FAT E2E BMS Material', 'BMS', true, 'active', $3)`,
    [
      FAT_IDS.masters.materialCategoryCell,
      `${FAT_PREFIX}MAT-CATEGORY-CELL`,
      ownerId,
      FAT_IDS.masters.materialCategoryBms,
      `${FAT_PREFIX}MAT-CATEGORY-BMS`,
    ],
  );
  await query(
    client,
    `INSERT INTO material_workflows
      (id, code, name, post_receipt_action, status, created_by)
     VALUES ($1, $2, 'FAT E2E Incoming Inspection', 'INCOMING_INSPECTION', 'active', $3)`,
    [FAT_IDS.masters.materialWorkflow, `${FAT_PREFIX}INCOMING-INSPECTION`, ownerId],
  );
  await query(
    client,
    `INSERT INTO master_materials
      (id, code, name, category_id, uom, manufacturer, usage_type,
       linked_master_type, linked_master_id, cell_master_id, status, created_by)
     VALUES
      ($1, $2, 'FAT E2E Cell Material', $3, 'PCS', 'FAT Cell Works',
              'INVENTORY_COMPONENT', 'CELL', $4, $5, 'active', $6),
      ($7, $8, 'FAT E2E BMS Material', $9, 'PCS', 'FAT Controls',
              'INVENTORY_COMPONENT', 'BMS', $10, NULL, 'active', $6)`,
    [
      FAT_IDS.masters.materialCell,
      `${FAT_PREFIX}MATERIAL-CELL`,
      FAT_IDS.masters.materialCategoryCell,
      FAT_IDS.masters.cell,
      FAT_IDS.masters.cell,
      ownerId,
      FAT_IDS.masters.materialBms,
      `${FAT_PREFIX}MATERIAL-BMS`,
      FAT_IDS.masters.materialCategoryBms,
      FAT_IDS.masters.bms,
    ],
  );
  await query(
    client,
    `INSERT INTO material_workflow_assignments
      (id, category_id, workflow_id, created_by, updated_by)
     VALUES
      ($1, $2, $3, $4, $4),
      ($5, $6, $3, $4, $4)`,
    [
      FAT_IDS.masters.assignmentCell,
      FAT_IDS.masters.materialCategoryCell,
      FAT_IDS.masters.materialWorkflow,
      ownerId,
      FAT_IDS.masters.assignmentBms,
      FAT_IDS.masters.materialCategoryBms,
    ],
  );
}

async function seedBom(client: SqlClient): Promise<void> {
  await query(
    client,
    `INSERT INTO bom_headers
      (id, bom_number, model_id, revision, status, name, yield_percent,
       effective_from, notes, created_by, approved_by, approved_at)
     VALUES ($1, $2, $3, 1, 'approved', 'FAT E2E Approved Battery BOM', 100,
             $4, 'Controlled FAT BOM: cell + traceable BMS', $5, $5, $6)`,
    [
      FAT_IDS.bom.header,
      `${FAT_PREFIX}BOM-REV-001`,
      FAT_IDS.masters.model,
      DATE,
      actorEmail("director"),
      RUN_AT,
    ],
  );
  await query(
    client,
    `INSERT INTO bom_lines
      (id, bom_id, material_id, position, quantity_per, uom, scrap_percent,
       is_critical_component, traceability_required, is_optional, notes)
     VALUES
      ($1, $2, $3, 1, 16, 'PCS', 0, true, true, false, 'Sixteen cells per battery'),
      ($4, $2, $5, 2, 1, 'PCS', 0, true, true, false, 'One BMS per battery')`,
    [
      FAT_IDS.bom.cellLine,
      FAT_IDS.bom.header,
      FAT_IDS.masters.materialCell,
      FAT_IDS.bom.bmsLine,
      FAT_IDS.masters.materialBms,
    ],
  );
}

async function seedProcurement(client: SqlClient): Promise<void> {
  const owner = FAT_IDS.users.owner;
  await query(
    client,
    `INSERT INTO grn_headers
      (id, grn_number, supplier_id, received_date, invoice_number, status, remarks, created_by)
     VALUES
      ($1, $2, $3, $4, $5, 'draft', 'Valid editable draft for INV-P01', $6),
      ($7, $8, $3, $4, NULL, 'draft', 'Intentionally empty draft for INV-N02/N03', $6),
      ($9, $10, $3, $4, $11, 'posted', 'Posted inspection-pending receipt for positive path', $6),
      ($12, $13, $3, $4, $14, 'posted', 'Rejected inspection variant', $6)`,
    [
      FAT_IDS.procurement.validDraft,
      `${FAT_PREFIX}GRN-DRAFT-VALID`,
      FAT_IDS.masters.supplier,
      DATE,
      `${FAT_PREFIX}INV-DRAFT-001`,
      owner,
      FAT_IDS.procurement.invalidDraft,
      `${FAT_PREFIX}GRN-DRAFT-EMPTY`,
      FAT_IDS.procurement.posted,
      `${FAT_PREFIX}GRN-POSTED-001`,
      `${FAT_PREFIX}INV-POSTED-001`,
      FAT_IDS.procurement.rejected,
      `${FAT_PREFIX}GRN-REJECTED-001`,
      `${FAT_PREFIX}INV-REJECTED-001`,
    ],
  );
  await query(
    client,
    `INSERT INTO grn_line_items
      (id, grn_id, line_number, material_id, quantity_received, uom, supplier_lot_number, inspection_status, remarks)
     VALUES
      ($1, $2, 1, $3, 16, 'PCS', $4, NULL, 'Valid draft line'),
      ($5, $6, 1, $7, ${FAT_FIXTURE_CONTRACT.ledger.cellAvailableUnits}, 'PCS', $8, 'passed', 'Cell stock for transfer and grading'),
      ($9, $6, 2, $10, ${FAT_FIXTURE_CONTRACT.ledger.bmsReceivedUnits}, 'PCS', $11, 'passed', 'BMS stock for MIN'),
      ($12, $13, 1, $14, 1, 'PCS', $15, 'rejected', 'Rejected inspection case')`,
    [
      FAT_IDS.procurement.validDraftLine,
      FAT_IDS.procurement.validDraft,
      FAT_IDS.masters.materialBms,
      `${FAT_PREFIX}SUP-LOT-DRAFT`,
      FAT_IDS.procurement.cellLine,
      FAT_IDS.procurement.posted,
      FAT_IDS.masters.materialCell,
      `${FAT_PREFIX}SUP-LOT-CELL-001`,
      FAT_IDS.procurement.bmsLine,
      FAT_IDS.masters.materialBms,
      `${FAT_PREFIX}SUP-LOT-BMS-001`,
      FAT_IDS.procurement.rejectedLine,
      FAT_IDS.procurement.rejected,
      FAT_IDS.masters.materialBms,
      `${FAT_PREFIX}SUP-LOT-REJECT-001`,
    ],
  );
  await query(
    client,
    `INSERT INTO inventory_transactions
      (transaction_type, material_id, quantity, uom, stock_state,
       source_document_type, source_document_id, source_line_id, created_by)
     VALUES
      ('GRN_RECEIPT', $1, ${FAT_FIXTURE_CONTRACT.ledger.cellAvailableUnits}, 'PCS', 'inspection_pending', 'GRN', $2, $3, $4),
      ('GRN_RECEIPT', $6, ${FAT_FIXTURE_CONTRACT.ledger.bmsReceivedUnits}, 'PCS', 'inspection_pending', 'GRN', $2, $5, $4),
      ('GRN_RECEIPT', $6, 1, 'PCS', 'inspection_pending', 'GRN', $7, $8, $4),
      ('INSPECTION_RELEASE', $1, -${FAT_FIXTURE_CONTRACT.ledger.cellAvailableUnits}, 'PCS', 'inspection_pending', 'INSPECTION', $9, $3, $4),
      ('INSPECTION_ACCEPT', $1, ${FAT_FIXTURE_CONTRACT.ledger.cellAvailableUnits}, 'PCS', 'available', 'INSPECTION', $9, $3, $4),
      ('INSPECTION_RELEASE', $6, -${FAT_FIXTURE_CONTRACT.ledger.bmsReceivedUnits}, 'PCS', 'inspection_pending', 'INSPECTION', $9, $5, $4),
      ('INSPECTION_ACCEPT', $6, ${FAT_FIXTURE_CONTRACT.ledger.bmsReceivedUnits}, 'PCS', 'available', 'INSPECTION', $9, $5, $4),
      ('INSPECTION_RELEASE', $6, -1, 'PCS', 'inspection_pending', 'INSPECTION', $10, $8, $4),
      ('INSPECTION_REJECT', $6, 1, 'PCS', 'rejected', 'INSPECTION', $10, $8, $4),
      ('MATERIAL_TRANSFER_TO_CELL_PROCESSING', $1, -${FAT_FIXTURE_CONTRACT.ledger.cellAvailableUnits}, 'PCS', 'available', 'TRANSFER', $11, $3, $4),
      ('MATERIAL_TRANSFER_TO_CELL_PROCESSING', $1, ${FAT_FIXTURE_CONTRACT.ledger.cellAvailableUnits}, 'PCS', 'available', 'TRANSFER', $11, $3, $4),
      ('PRODUCTION_ISSUE', $6, -1, 'PCS', 'available', 'MIN', $12, $13, $4)`,
    [
      FAT_IDS.masters.materialCell,
      FAT_IDS.procurement.posted,
      FAT_IDS.procurement.cellLine,
      FAT_IDS.users.supervisor,
      FAT_IDS.procurement.bmsLine,
      FAT_IDS.masters.materialBms,
      FAT_IDS.procurement.rejected,
      FAT_IDS.procurement.rejectedLine,
      FAT_IDS.procurement.inspection,
      FAT_IDS.procurement.inspection,
      FAT_IDS.procurement.transfer,
      "fa1b0000-0000-4000-8000-000000000001",
      "fa1b0000-0000-4000-8000-000000000002",
    ],
  );
  await query(
    client,
    `INSERT INTO incoming_inspections
      (id, inspection_number, grn_id, remarks, inspected_by)
     VALUES ($1, $2, $3, 'Complete inspection covering every pending line', $4)`,
    [
      FAT_IDS.procurement.inspection,
      `${FAT_PREFIX}INSP-001`,
      FAT_IDS.procurement.posted,
      FAT_IDS.users.supervisor,
    ],
  );
  await query(
    client,
    `INSERT INTO incoming_inspection_lines
      (id, inspection_id, grn_line_id, grn_id, material_id, quantity_received,
       accepted_qty, rejected_qty, result, rejection_reason)
     VALUES
      ($1, $2, $3, $4, $5, ${FAT_FIXTURE_CONTRACT.ledger.cellAvailableUnits}, ${FAT_FIXTURE_CONTRACT.ledger.cellAvailableUnits}, 0, 'passed', NULL),
      ($6, $2, $7, $4, $8, ${FAT_FIXTURE_CONTRACT.ledger.bmsReceivedUnits}, ${FAT_FIXTURE_CONTRACT.ledger.bmsReceivedUnits}, 0, 'passed', NULL)`,
    [
      FAT_IDS.procurement.inspectionCellLine,
      FAT_IDS.procurement.inspection,
      FAT_IDS.procurement.cellLine,
      FAT_IDS.procurement.posted,
      FAT_IDS.masters.materialCell,
      FAT_IDS.procurement.inspectionBmsLine,
      FAT_IDS.procurement.bmsLine,
      FAT_IDS.masters.materialBms,
    ],
  );
  await query(
    client,
    `INSERT INTO incoming_inspections
      (id, inspection_number, grn_id, remarks, inspected_by)
     VALUES ($1, $2, $3, 'Rejected inspection variant for negative coverage', $4)`,
    [
      "fa150000-0000-4000-8000-000000000014",
      `${FAT_PREFIX}INSP-REJECT-001`,
      FAT_IDS.procurement.rejected,
      FAT_IDS.users.supervisor,
    ],
  );
  await query(
    client,
    `INSERT INTO incoming_inspection_lines
      (id, inspection_id, grn_line_id, grn_id, material_id, quantity_received,
       accepted_qty, rejected_qty, result, rejection_reason)
     VALUES ($1, $2, $3, $4, $5, 1, 0, 1, 'rejected', 'FAT E2E rejected component')`,
    [
      FAT_IDS.procurement.inspectionRejectedLine,
      "fa150000-0000-4000-8000-000000000014",
      FAT_IDS.procurement.rejectedLine,
      FAT_IDS.procurement.rejected,
      FAT_IDS.masters.materialBms,
    ],
  );
  await query(
    client,
    `INSERT INTO material_transfers
      (id, transfer_number, material_id, grn_id, grn_line_id, supplier_id, quantity, uom, transferred_by)
     VALUES ($1, $2, $3, $4, $5, $6, ${FAT_FIXTURE_CONTRACT.ledger.cellAvailableUnits}, 'PCS', $7)`,
    [
      FAT_IDS.procurement.transfer,
      `${FAT_PREFIX}TRF-CELL-001`,
      FAT_IDS.masters.materialCell,
      FAT_IDS.procurement.posted,
      FAT_IDS.procurement.cellLine,
      FAT_IDS.masters.supplier,
      FAT_IDS.users.supervisor,
    ],
  );
}

async function seedCells(client: SqlClient): Promise<void> {
  await query(
    client,
    `INSERT INTO cell_lots
      (id, supplier, manufacturer, cell_model, cell_chemistry, nominal_capacity_ah,
       lot_number, invoice_number, supplier_lot_number, date_received, quantity_received,
       received_by, remarks, status, cell_master_id, transfer_id)
     VALUES ($1, 'FAT E2E Cell and BMS Supplier', 'FAT Cell Works', 'FAT-LFP-280',
             'LiFePO4', 280, $2, $3, $4, $5, ${FAT_FIXTURE_CONTRACT.cells.total}, $6,
             'Complete received lot for grading and matching', 'complete', $7, $8)`,
    [
      FAT_IDS.cells.lot,
      `${FAT_PREFIX}LOT-CELL-001`,
      `${FAT_PREFIX}INV-POSTED-001`,
      `${FAT_PREFIX}SUP-LOT-CELL-001`,
      DATE,
      actorEmail("operator"),
      FAT_IDS.masters.cell,
      FAT_IDS.procurement.transfer,
    ],
  );
  for (let i = 1; i <= FAT_FIXTURE_CONTRACT.cells.total; i += 1) {
    const good = i <= FAT_FIXTURE_CONTRACT.cells.acceptable;
    const id = `fa160000-0000-4000-8000-${String(i).padStart(12, "0")}`;
    await query(
      client,
      `INSERT INTO cells
        (id, cell_id, lot_id, status, grade, voltage_v, capacity_ah,
         internal_resistance_mohm, temperature_c, grading_machine_id, graded_by,
         graded_at, grading_notes, match_id, allocation_order_id)
       VALUES ($1, $2, $3, $4::cell_status, $5::cell_grade, 3.3, $6,
               $7, 25, 'FAT-E2E-GRADER-001', $8, $9, $10, $11, $12)`,
      [
        id,
        cellId(i),
        FAT_IDS.cells.lot,
        good && i <= FAT_FIXTURE_CONTRACT.cells.allocated ? "allocated" : good ? "approved" : "rejected",
        good ? (i <= FAT_FIXTURE_CONTRACT.cells.gradeACount ? "A" : "B") : "reject",
        good ? 281 + (i % 3) : 240,
        good ? 0.9 + (i % 4) / 10 : 2.8,
        actorEmail("operator"),
        RUN_AT,
        good ? "Within controlled FAT grading band" : "Below capacity threshold",
        good && i <= FAT_FIXTURE_CONTRACT.cells.allocated ? FAT_IDS.cells.matchAllocated : null,
        good && i <= FAT_FIXTURE_CONTRACT.cells.allocated ? FAT_IDS.orders.clean : null,
      ],
    );
  }
  await query(
    client,
    `INSERT INTO cell_lot_events (lot_id, event_type, performed_by, changes, reason)
     VALUES
       ($1, 'lot_received', $2, $3::json, 'FAT controlled transfer received'),
       ($1, 'lot_graded', $2, $4::json, 'FAT full grading completed')`,
    [
      FAT_IDS.cells.lot,
      actorEmail("operator"),
      JSON.stringify({ quantity: FAT_FIXTURE_CONTRACT.cells.total, source: FAT_IDS.procurement.transfer }),
      JSON.stringify({
        accepted: FAT_FIXTURE_CONTRACT.cells.acceptable,
        rejected: FAT_FIXTURE_CONTRACT.cells.rejected,
      }),
    ],
  );
  await query(
    client,
    `INSERT INTO cell_matches
      (id, product_id, battery_model, cells_per_battery, quantity, status, match_score, created_by, notes)
     VALUES
      ($1, $2, 'FAT E2E 16S 280Ah Battery Pack', ${FAT_FIXTURE_CONTRACT.cells.matchItems}, 1, 'allocated', 98.4, $3, $4),
      ($5, $2, 'FAT E2E 16S 280Ah Battery Pack', ${FAT_FIXTURE_CONTRACT.cells.matchItems}, 1, 'draft', NULL, $3, $6)`,
    [
      FAT_IDS.cells.matchAllocated,
      FAT_IDS.masters.model,
      actorEmail("operator"),
      `${FAT_PREFIX}MATCH-ALLOCATED-001`,
      FAT_IDS.cells.matchPending,
      `${FAT_PREFIX}MATCH-PENDING-001`,
    ],
  );
  for (let i = 1; i <= FAT_FIXTURE_CONTRACT.cells.matchItems; i += 1) {
    await query(
      client,
      `INSERT INTO cell_match_items (id, match_id, cell_id, battery_slot, position)
       VALUES ($1, $2, $3, 1, $4)`,
      [
        `fa160000-0000-4000-8001-${String(i).padStart(12, "0")}`,
        FAT_IDS.cells.matchAllocated,
        `fa160000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        i,
      ],
    );
  }
  for (let i = FAT_FIXTURE_CONTRACT.cells.matchItems + 1; i <= FAT_FIXTURE_CONTRACT.cells.matchItems * 2; i += 1) {
    await query(
      client,
      `INSERT INTO cell_match_items (id, match_id, cell_id, battery_slot, position)
       VALUES ($1, $2, $3, 1, $4)`,
      [
        `fa160000-0000-4000-8001-${String(i).padStart(12, "0")}`,
        FAT_IDS.cells.matchPending,
        `fa160000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        i - 16,
      ],
    );
  }
  await query(
    client,
    `INSERT INTO engineering_corrections
      (id, correction_id, entity_type, entity_id, sequence, correction_type, reason,
       previous_value, new_value, performed_by, approved_by, approved_at,
       audit_event_type, metadata)
     VALUES
      ('fa1c0000-0000-4000-8000-000000000001', $1, 'CELL', $2, 1, 'original', NULL,
       NULL, $3::jsonb, $4, $5, $6, 'cell.graded', $7::jsonb),
      ('fa1c0000-0000-4000-8000-000000000002', $8, 'CELL', $2, 2, 'correction',
       'FAT correction candidate for supervised correction', $3::jsonb, $9::jsonb,
       $4, $5, $6, 'cell.grade.corrected', $7::jsonb)`,
    [
      `${FAT_PREFIX}CORR-CELL-001`,
      cellId(49),
      JSON.stringify({ grade: "B", capacityAh: 276, irMohm: 1.2 }),
      actorEmail("operator"),
      actorEmail("supervisor"),
      RUN_AT,
      JSON.stringify({ fixture: FAT_PREFIX }),
      `${FAT_PREFIX}CORR-CELL-002`,
      JSON.stringify({ grade: "A", capacityAh: 279, irMohm: 1.0 }),
    ],
  );
}

async function seedManufacturing(client: SqlClient): Promise<void> {
  const stageTypes = FAT_STAGE_TYPES;
  const orders = [
    [FAT_IDS.orders.clean, "CLEAN", FAT_FIXTURE_CONTRACT.states.cleanOrder, "packing", FAT_IDS.cells.matchAllocated],
    [FAT_IDS.orders.packed, "PACKED", FAT_FIXTURE_CONTRACT.states.cleanOrder, "packing", null],
    [FAT_IDS.orders.reject, "REJECT", FAT_FIXTURE_CONTRACT.states.raceOrder, "quality_control", null],
    [FAT_IDS.orders.raceOne, "RACE-ONE", FAT_FIXTURE_CONTRACT.states.raceOrder, FAT_FIXTURE_CONTRACT.states.raceStage, null],
    [FAT_IDS.orders.raceTwo, "RACE-TWO", FAT_FIXTURE_CONTRACT.states.raceOrder, FAT_FIXTURE_CONTRACT.states.raceStage, null],
    [FAT_IDS.orders.completion, "COMPLETE", FAT_FIXTURE_CONTRACT.states.raceOrder, "quality_control", null],
  ] as const;
  for (const [id, key, status, currentStage, matchId] of orders) {
    await query(
      client,
      `INSERT INTO mfg_production_orders
        (id, order_number, battery_number, product_id, cell_match_id, factory_manager,
         current_stage, status, priority, planned_start_date, planned_end_date, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::mfg_stage_type, $8::mfg_order_status,
               'high', $9, $10, $11, $12)`,
      [
        id,
        orderNumber(key),
        batteryNumber(key),
        FAT_IDS.masters.model,
        matchId,
        "FAT E2E Factory Manager",
        currentStage,
        status,
        DATE,
        "2026-09-30",
        `${FAT_PREFIX} fixture order ${key}`,
        `${DATE}T08:00:00.000Z`,
      ],
    );
    for (let index = 0; index < stageTypes.length; index += 1) {
      const stage = stageTypes[index];
      const isApproved =
        status === "completed" ||
        (key === "REJECT" && index < 7) ||
        ((key === "RACE-ONE" || key === "RACE-TWO") && index < 5) ||
        (key === "COMPLETE" && index < 7);
      const stageStatus = key === "REJECT" && index === 7 ? "rejected" : isApproved ? "approved" : "pending";
      await query(
        client,
        `INSERT INTO mfg_order_stages
          (id, production_order_id, stage_type, stage_order, status, operator_name,
           supervisor_name, started_at, completed_at, approved_at, notes, stage_data)
         VALUES ($1, $2, $3::mfg_stage_type, $4, $5::mfg_stage_status, $6, $7,
                 $8, $8, $8, $9, $10::jsonb)`,
        [
          `fa180000-0000-4000-8001-${String((orders.indexOf(orders.find((o) => o[0] === id)!) * FAT_FIXTURE_CONTRACT.stages.perOrder) + index + 1).padStart(12, "0")}`,
          id,
          stage,
          index + 1,
          stageStatus,
          actorEmail("operator"),
          actorEmail("supervisor"),
          isApproved ? RUN_AT : null,
          `${FAT_PREFIX}${stage}-fixture`,
          JSON.stringify({ fixture: FAT_PREFIX, stage, valid: true }),
        ],
      );
    }
  }
  await query(
    client,
    `INSERT INTO mfg_charger_units
      (id, charger_code, model, manufacturer, serial_number, output_voltage_v, max_current_a,
       status, current_order_id, notes)
     VALUES
      ($1, $2, 'FAT-CHG-60V', 'FAT Power', 'FAT-E2E-CHG-001', 60, 50, 'available', NULL, 'Primary race fixture'),
      ($3, $4, 'FAT-CHG-60V', 'FAT Power', 'FAT-E2E-CHG-002', 60, 50, 'available', NULL, 'Clean path charger'),
      ($5, $6, 'FAT-CHG-60V', 'FAT Power', 'FAT-E2E-CHG-003', 60, 50, 'maintenance', NULL, 'Negative maintenance fixture')`,
    [
      FAT_IDS.chargers.primary,
      `${FAT_PREFIX}CHARGER-RACE-001`,
      FAT_IDS.chargers.secondary,
      `${FAT_PREFIX}CHARGER-CLEAN-001`,
      FAT_IDS.chargers.maintenance,
      `${FAT_PREFIX}CHARGER-MAINT-001`,
    ],
  );
  await query(
    client,
    `INSERT INTO mfg_formation_reports
      (id, production_order_id, charger_unit_id, charger_code, operator, charge_start_at,
       charge_end_at, charge_time_min, energy_kwh, charging_current_a, start_voltage_v,
       final_voltage_v, final_current_a, ambient_temp_c, battery_temp_c,
       final_cell_voltage_spread_mv, max_cell_voltage_v, min_cell_voltage_v,
       voltage_diff_mv, balancing_status, remarks)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 180, 14.3, 45, 48, 57.6, 0.5, 24, 31,
             3.2, 3.61, 3.58, 3.2, 'complete', 'FAT formation report')`,
    [
      "fa180000-0000-4000-8002-000000000001",
      FAT_IDS.orders.clean,
      FAT_IDS.chargers.secondary,
      `${FAT_PREFIX}CHARGER-CLEAN-001`,
      actorEmail("operator"),
      "2026-09-08T08:00:00Z",
      "2026-09-08T11:00:00Z",
    ],
  );
  await query(
    client,
    `INSERT INTO mfg_test_results
      (id, production_order_id, test_type, test_equipment_id, test_equipment_name,
       operator_name, started_at, completed_at, result, test_data, notes)
     VALUES
      ('fa180000-0000-4000-8003-000000000001', $1, 'capacity', $2, 'FAT Capacity Bench',
       $3, $4, $5, 'pass', $6::jsonb, 'FAT capacity pass'),
      ('fa180000-0000-4000-8003-000000000002', $1, 'protection', $2, 'FAT Capacity Bench',
       $3, $4, $5, 'pass', $7::jsonb, 'FAT protection pass'),
      ('fa180000-0000-4000-8003-000000000003', $8, 'capacity', $2, 'FAT Capacity Bench',
       $3, $4, $5, 'fail', $9::jsonb, 'FAT QC reject input')`,
    [
      FAT_IDS.orders.clean,
      FAT_IDS.masters.testEquipment,
      actorEmail("operator"),
      "2026-09-08T12:00:00Z",
      "2026-09-08T13:00:00Z",
      JSON.stringify({ capacityAh: 279, expectedAh: 280 }),
      JSON.stringify({ overVoltage: "pass", underVoltage: "pass" }),
      FAT_IDS.orders.reject,
      JSON.stringify({ capacityAh: 240, expectedAh: 280 }),
    ],
  );
  await query(
    client,
    `INSERT INTO mfg_qc_approvals
      (id, production_order_id, decision, inspector_name, inspector_role,
       digital_signature, remarks, approved_at)
     VALUES
      ('fa180000-0000-4000-8004-000000000001', $1, 'approved', $2, 'Director',
       'FAT-E2E-SIGNATURE-PASS', 'FAT QC pass', $3),
      ('fa180000-0000-4000-8004-000000000002', $4, 'rejected', $2, 'Supervisor',
       'FAT-E2E-SIGNATURE-REJECT', 'FAT QC reject and rework', $3)`,
    [FAT_IDS.orders.clean, actorEmail("director"), RUN_AT, FAT_IDS.orders.reject],
  );
  await query(
    client,
    `INSERT INTO mfg_rework_tickets
      (id, ticket_number, production_order_id, battery_number, failed_tests,
       failure_reason, status, assigned_technician, retest_required)
     VALUES ($1, $2, $3, $4, $5::jsonb, 'FAT capacity result below threshold',
             'open', $6, true)`,
    [
      "fa180000-0000-4000-8005-000000000001",
      `${FAT_PREFIX}REWORK-001`,
      FAT_IDS.orders.reject,
      batteryNumber("REJECT"),
      JSON.stringify(["capacity"]),
      actorEmail("operator"),
    ],
  );
  for (const [orderId, componentType, componentId, componentName, quantity, serial] of [
    [FAT_IDS.orders.clean, "CELL", FAT_IDS.masters.cell, "FAT E2E LiFePO4 Cell", 16, cellId(1)],
    [FAT_IDS.orders.clean, "BMS", FAT_IDS.masters.bms, "FAT E2E BMS", 1, "FAT-E2E-BMS-001"],
    [FAT_IDS.orders.clean, "CABINET", FAT_IDS.masters.cabinet, "FAT E2E Cabinet", 1, "FAT-E2E-CAB-001"],
    [FAT_IDS.orders.clean, "CONNECTOR", FAT_IDS.masters.connector, "FAT E2E HV Connector", 1, "FAT-E2E-CON-001"],
    [FAT_IDS.orders.clean, "CABLE", FAT_IDS.masters.cable, "FAT E2E HV Cable", 1, "FAT-E2E-CABLE-001"],
    [FAT_IDS.orders.completion, "CELL", FAT_IDS.masters.cell, "FAT E2E LiFePO4 Cell", 16, cellId(33)],
  ] as const) {
    await query(
      client,
      `INSERT INTO mfg_battery_genealogy
        (production_order_id, component_type, component_id, component_name, quantity, serial_number, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [orderId, componentType, componentId, componentName, quantity, serial, `${FAT_PREFIX}genealogy`],
    );
  }
  await query(
    client,
    `INSERT INTO mfg_battery_timeline
      (production_order_id, event_type, stage_type, actor, description, metadata)
     VALUES
      ($1, 'stage_approved', 'assembly', $2, 'FAT assembly approved', $3::jsonb),
      ($1, 'stage_approved', 'charging', $2, 'FAT charging approved', $3::jsonb),
      ($1, 'qc_approved', 'quality_control', $2, 'FAT QC approved', $3::jsonb)`,
    [FAT_IDS.orders.clean, actorEmail("supervisor"), JSON.stringify({ fixture: FAT_PREFIX })],
  );
  await query(
    client,
    `INSERT INTO material_issue_notes
      (id, min_number, source_type, source_ref_id, bom_header_id, bom_revision,
       status, issued_by, notes)
     VALUES ($1, $2, 'PRODUCTION_ORDER', $3, $4, 1, 'posted', $5, 'FAT non-cell BOM issue')`,
    [
      "fa1b0000-0000-4000-8000-000000000001",
      `${FAT_PREFIX}MIN-001`,
      FAT_IDS.orders.clean,
      FAT_IDS.bom.header,
      FAT_IDS.users.supervisor,
    ],
  );
  await query(
    client,
    `INSERT INTO material_issue_note_lines
      (id, min_id, line_number, material_id, source_bom_line_id, required_qty,
       issued_qty, uom, grn_id, grn_line_id, supplier_lot_number,
       is_critical_component, traceability_required)
     VALUES ($1, $2, 1, $3, $4, 1, 1, 'PCS', $5, $6, $7, true, true)`,
    [
      "fa1b0000-0000-4000-8000-000000000002",
      "fa1b0000-0000-4000-8000-000000000001",
      FAT_IDS.masters.materialBms,
      FAT_IDS.bom.bmsLine,
      FAT_IDS.procurement.posted,
      FAT_IDS.procurement.bmsLine,
      `${FAT_PREFIX}SUP-LOT-BMS-001`,
    ],
  );
}

async function seedFulfillment(client: SqlClient): Promise<void> {
  await query(
    client,
    `INSERT INTO products
      (id, category_id, model_id, workflow_code, source_production_order_id,
       official_product_serial, serial_source, qc_status, product_status,
       current_location, dealer_id, manufacturing_completed_at)
     VALUES
      ($1, $2, $3, $4, $5, $6, 'OCS', 'approved', 'dispatched',
       '${FAT_FIXTURE_CONTRACT.fulfillment.dealerSnapshot.name}', $7, $8),
      ($9, $2, $3, $4, $10, $11, 'OCS', 'approved', 'ready_for_packing',
       'FAT E2E Factory Packing', NULL, $8),
      ($12, $2, $3, $4, $13, $14, 'OCS', 'pending', 'qc_passed',
       'FAT E2E QC Hold', NULL, $8)`,
    [
      FAT_IDS.products.dispatched,
      FAT_IDS.masters.category,
      FAT_IDS.masters.model,
      `${FAT_PREFIX}BATTERY-WORKFLOW`,
      FAT_IDS.orders.clean,
      `${FAT_PREFIX}BATTERY-SERIAL-001`,
      FAT_IDS.dealer,
      RUN_AT,
      FAT_IDS.products.readyForPacking,
      FAT_IDS.orders.packed,
      `${FAT_PREFIX}BATTERY-SERIAL-002`,
      FAT_IDS.products.nonPackable,
      FAT_IDS.orders.reject,
      `${FAT_PREFIX}BATTERY-SERIAL-003`,
    ],
  );
  await query(
    client,
    `INSERT INTO product_genealogy
      (product_id, component_type, component_id, component_name, quantity, serial_number, notes)
     SELECT $1, component_type, component_id, component_name, quantity, serial_number,
            notes || ' / product projection'
     FROM mfg_battery_genealogy WHERE production_order_id = $2`,
    [FAT_IDS.products.dispatched, FAT_IDS.orders.clean],
  );
  await query(
    client,
    `INSERT INTO product_events (product_id, event_type, actor, description, metadata)
     VALUES
      ($1, 'product.created', $2, 'FAT product minted at QC completion gate', $3::jsonb),
      ($1, 'product.packed', $2, 'FAT product packed', $3::jsonb),
      ($1, 'product.dispatched', $2, 'FAT product dispatched to dealer', $4::jsonb),
      ($5, 'product.created', $2, 'FAT ready-for-packing product minted at QC gate', $3::jsonb)`,
    [
      FAT_IDS.products.dispatched,
      actorEmail("director"),
      JSON.stringify({ fixture: FAT_PREFIX, source: "QC_PASS" }),
      JSON.stringify({ fixture: FAT_PREFIX, dealerId: FAT_IDS.dealer }),
      FAT_IDS.products.readyForPacking,
    ],
  );
  await query(
    client,
    `INSERT INTO dispatches
      (id, dispatch_number, invoice_number, dispatch_date, dealer_id, dealer_code,
       dealer_name, dealer_address, dealer_gst, dealer_contact, dealer_mobile,
       dispatched_by, item_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, ${FAT_FIXTURE_CONTRACT.fulfillment.dispatchItemCount})`,
    [
      FAT_IDS.fulfillment.dispatch,
      `${FAT_PREFIX}DISPATCH-001`,
      `${FAT_PREFIX}INVOICE-001`,
      DATE,
      FAT_IDS.dealer,
      FAT_FIXTURE_CONTRACT.fulfillment.dealerSnapshot.code,
      FAT_FIXTURE_CONTRACT.fulfillment.dealerSnapshot.name,
      FAT_FIXTURE_CONTRACT.fulfillment.dealerSnapshot.address,
      FAT_FIXTURE_CONTRACT.fulfillment.dealerSnapshot.gst,
      FAT_FIXTURE_CONTRACT.fulfillment.dealerSnapshot.contact,
      FAT_FIXTURE_CONTRACT.fulfillment.dealerSnapshot.mobile,
      actorEmail("supervisor"),
    ],
  );
  await query(
    client,
    `INSERT INTO dispatch_items (id, dispatch_id, product_id, product_serial)
     VALUES ($1, $2, $3, $4)`,
    [
      FAT_IDS.fulfillment.dispatchItem,
      FAT_IDS.fulfillment.dispatch,
      FAT_IDS.products.dispatched,
      `${FAT_PREFIX}BATTERY-SERIAL-001`,
    ],
  );
  await query(
    client,
    `INSERT INTO customer_registrations
      (id, registration_number, product_id, dealer_id, customer_name, mobile, address,
       installation_date, registered_by)
     VALUES ($1, $2, $3, $4, '${FAT_FIXTURE_CONTRACT.fulfillment.customerName}', '9000000099',
             '99 FAT E2E Customer Road, Bengaluru', $5, $6)`,
    [
      FAT_IDS.fulfillment.registration,
      `${FAT_PREFIX}CUSTOMER-REG-001`,
      FAT_IDS.products.dispatched,
      FAT_IDS.dealer,
      DATE,
      actorEmail("supervisor"),
    ],
  );
  await query(
    client,
    `INSERT INTO warranties
      (id, warranty_number, product_id, registration_id, start_date, period_months, end_date)
     VALUES ($1, $2, $3, $4, $5, ${FAT_FIXTURE_CONTRACT.fulfillment.warrantyPeriodMonths}, '${FAT_FIXTURE_CONTRACT.warrantyEndDate}')`,
    [
      FAT_IDS.fulfillment.warranty,
      `${FAT_PREFIX}WARRANTY-001`,
      FAT_IDS.products.dispatched,
      FAT_IDS.fulfillment.registration,
      DATE,
    ],
  );
  await query(
    client,
    `INSERT INTO logistics_dispatch_orders
      (id, dispatch_number, dealer_id, customer_name, transporter, vehicle_number,
       driver_name, driver_mobile, dispatch_date, status, notes, created_by)
     VALUES ($1, $2, $3, '${FAT_FIXTURE_CONTRACT.fulfillment.customerName}', 'FAT Transport', 'KA-FAT-0001',
             'FAT Driver', '9000000002', $4, 'delivered', 'Legacy portal history fixture', $5)`,
    [
      "fa1a0000-0000-4000-8000-000000000005",
      `${FAT_PREFIX}LEGACY-DISPATCH-001`,
      FAT_IDS.dealer,
      DATE,
      actorEmail("supervisor"),
    ],
  );
  await query(
    client,
    `INSERT INTO logistics_dispatch_items (dispatch_order_id, production_order_id, product_id)
     VALUES ($1, $2, $3)`,
    [
      "fa1a0000-0000-4000-8000-000000000005",
      FAT_IDS.orders.clean,
      FAT_IDS.products.dispatched,
    ],
  );
  await query(
    client,
    `INSERT INTO logistics_shipment_events (dispatch_order_id, event_type, actor, notes)
     VALUES ($1, 'delivered', $2, 'FAT delivered-to-dealer portal fixture')`,
    ["fa1a0000-0000-4000-8000-000000000005", actorEmail("supervisor")],
  );
}

async function collectManifest(client: SqlClient): Promise<Record<string, unknown>> {
  const counts = await residualCounts(client);
  const lookup = async (sql: string, values: unknown[] = []) => (await query(client, sql, values)).rows[0] ?? {};
  const ids = {
    owner: FAT_IDS.users.owner,
    director: FAT_IDS.users.director,
    supervisor: FAT_IDS.users.supervisor,
    operator: FAT_IDS.users.operator,
    viewer: FAT_IDS.users.viewer,
    dealerUser: FAT_IDS.users.dealer,
    dealer: FAT_IDS.dealer,
    productCategory: FAT_IDS.masters.category,
    productWorkflow: FAT_IDS.masters.workflow,
    model: FAT_IDS.masters.model,
    cellMaster: FAT_IDS.masters.cell,
    bmsMaster: FAT_IDS.masters.bms,
    supplier: FAT_IDS.masters.supplier,
    cellMaterial: FAT_IDS.masters.materialCell,
    bmsMaterial: FAT_IDS.masters.materialBms,
    approvedBom: FAT_IDS.bom.header,
    postedGrn: FAT_IDS.procurement.posted,
    inspection: FAT_IDS.procurement.inspection,
    cellTransfer: FAT_IDS.procurement.transfer,
    cellLot: FAT_IDS.cells.lot,
    allocatedMatch: FAT_IDS.cells.matchAllocated,
    pendingMatch: FAT_IDS.cells.matchPending,
    cleanOrder: FAT_IDS.orders.clean,
    rejectOrder: FAT_IDS.orders.reject,
    chargerRaceOne: FAT_IDS.orders.raceOne,
    chargerRaceTwo: FAT_IDS.orders.raceTwo,
    completionBoundaryOrder: FAT_IDS.orders.completion,
    reportBeforeOrder: FAT_IDS.orders.reportBefore,
    reportInsideOrder: FAT_IDS.orders.reportInside,
    reportAfterOrder: FAT_IDS.orders.reportAfter,
    traceabilityProduct: FAT_IDS.products.dispatched,
    readyForPackingProduct: FAT_IDS.products.readyForPacking,
    nonPackableProduct: FAT_IDS.products.nonPackable,
    dispatch: FAT_IDS.fulfillment.dispatch,
    registration: FAT_IDS.fulfillment.registration,
    warranty: FAT_IDS.fulfillment.warranty,
  };
  const recordCounts = {
    users: Number((await lookup(`SELECT count(*) AS n FROM users WHERE email LIKE 'fat.%@fat.local'`)).n),
    masters: Number((await lookup(`SELECT count(*) AS n FROM master_products WHERE code LIKE $1`, [`${FAT_PREFIX}%`])).n),
    materials: Number((await lookup(`SELECT count(*) AS n FROM master_materials WHERE code LIKE $1`, [`${FAT_PREFIX}%`])).n),
    bomLines: Number((await lookup(`SELECT count(*) AS n FROM bom_lines WHERE bom_id = $1`, [FAT_IDS.bom.header])).n),
    grnLines: Number((await lookup(`SELECT count(*) AS n FROM grn_line_items WHERE grn_id = $1`, [FAT_IDS.procurement.posted])).n),
    inventoryTransactions: Number((await lookup(`SELECT count(*) AS n FROM inventory_transactions WHERE material_id IN ($1, $2)`, [FAT_IDS.masters.materialCell, FAT_IDS.masters.materialBms])).n),
    cells: Number((await lookup(`SELECT count(*) AS n FROM cells WHERE cell_id LIKE $1`, [`${FAT_PREFIX}%`])).n),
    stages: Number((await lookup(`SELECT count(*) AS n FROM mfg_order_stages WHERE production_order_id IN (SELECT id FROM mfg_production_orders WHERE order_number LIKE $1)`, [`${FAT_PREFIX}%`])).n),
    genealogyRows: Number((await lookup(`SELECT count(*) AS n FROM product_genealogy WHERE product_id = $1`, [FAT_IDS.products.dispatched])).n),
    traceEvents: Number((await lookup(`SELECT count(*) AS n FROM product_events WHERE product_id = $1`, [FAT_IDS.products.dispatched])).n),
  };
  return {
    dataset: "OCS One full FAT controlled dataset",
    namespace: FAT_PREFIX,
    frozenTag: FROZEN_TAG,
    frozenCommit: FROZEN_COMMIT,
    generatedAt: RUN_AT,
    passwordEvidence: "omitted; supplied only through FAT_TEST_PASSWORD",
    manifestPath: manifestPath(),
    ids,
    recordCounts,
    residualCounts: counts,
    expectations: FAT_FIXTURE_CONTRACT,
  };
}

/**
 * Read-only gate to run immediately before a manual FAT journey.
 *
 * This deliberately does not call seed/teardown and does not write the
 * manifest. Every query is constrained to a FAT fixture id or a FAT-prefixed
 * business key, so it cannot turn a production/schema check into a global
 * dataset check. Passwords are compared in memory and never included in the
 * result.
 */
async function preflight(): Promise<void> {
  const password = process.env.FAT_TEST_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error("FAT_TEST_PASSWORD must be supplied out of band and contain at least 8 characters");
  }

  const checks: PreflightCheck[] = [];
  const client = await pool.connect();
  try {
    const emails = FAT_ROLES.map(actorEmail);
    const userRows = (
      await query(
        client,
        `SELECT id, email, role::text AS role, is_active, dealer_id, password_hash
         FROM users
         WHERE email = ANY($1::text[])`,
        [emails],
      )
    ).rows;
    const usersByEmail = new Map(userRows.map((row) => [String(row.email), row]));
    preflightCheck(checks, "auth", "all FAT role accounts exist", userRows.length === FAT_ROLES.length, FAT_ROLES.length, userRows.length);

    for (const role of FAT_ROLES) {
      const user = usersByEmail.get(actorEmail(role));
      const expectedDealer = role === "dealer" ? FAT_IDS.dealer : null;
      preflightCheck(checks, "auth", `${role} account has the frozen id`, user?.id === FAT_IDS.users[role], FAT_IDS.users[role], user?.id);
      preflightCheck(checks, "auth", `${role} account has the expected role`, user?.role === role, role, user?.role);
      preflightCheck(checks, "auth", `${role} account is active`, user?.is_active === true, true, user?.is_active);
      preflightCheck(checks, "auth", `${role} dealer linkage is stable`, (user?.dealer_id ?? null) === expectedDealer, expectedDealer, user?.dealer_id ?? null);
      const passwordValid = user ? await bcrypt.compare(password, String(user.password_hash ?? "")) : false;
      preflightCheck(checks, "auth", `${role} login password matches the seeded account`, passwordValid);
    }

    const dealer = (
      await query(
        client,
        `SELECT id, dealer_code, status, dealer_name, address, gst_number, contact_person, mobile
         FROM logistics_dealers
         WHERE id = $1 AND dealer_code LIKE $2`,
        [FAT_IDS.dealer, `${FAT_PREFIX}%`],
      )
    ).rows[0];
    preflightCheck(checks, "dealer", "linked dealer exists in the FAT namespace", Boolean(dealer), FAT_IDS.dealer, dealer?.id);
    preflightCheck(checks, "dealer", "linked dealer is active", dealer?.status === "active", "active", dealer?.status);
    preflightCheck(checks, "dealer", "dealer snapshot fields are populated", Boolean(dealer?.dealer_name && dealer?.address && dealer?.gst_number && dealer?.contact_person && dealer?.mobile));

    const masters = (
      await query(
        client,
        `SELECT
           (SELECT count(*) FROM product_categories WHERE id = $1 AND code LIKE $7 AND status = 'active') AS category_count,
           (SELECT count(*) FROM product_workflows WHERE id = $2 AND code LIKE $7 AND status = 'active') AS workflow_count,
           (SELECT stage_sequence FROM product_workflows WHERE id = $2 AND code LIKE $7) AS stage_sequence,
           (SELECT count(*) FROM master_products WHERE id = $3 AND code LIKE $7 AND status = 'active') AS model_count,
           (SELECT count(*) FROM master_cells WHERE id = $4 AND code LIKE $7 AND status = 'active') AS cell_count,
           (SELECT count(*) FROM master_bms WHERE id = $5 AND code LIKE $7 AND status = 'active') AS bms_count,
           (SELECT count(*) FROM master_suppliers WHERE id = $6 AND code LIKE $7 AND status = 'active') AS supplier_count`,
        [
          FAT_IDS.masters.category,
          FAT_IDS.masters.workflow,
          FAT_IDS.masters.model,
          FAT_IDS.masters.cell,
          FAT_IDS.masters.bms,
          FAT_IDS.masters.supplier,
          `${FAT_PREFIX}%`,
        ],
      )
    ).rows[0] ?? {};
    preflightCheck(checks, "masters", "product category exists and is active", Number(masters.category_count) === 1, 1, masters.category_count);
    preflightCheck(checks, "masters", "product workflow exists and is active", Number(masters.workflow_count) === 1, 1, masters.workflow_count);
    const stageSequence = Array.isArray(masters.stage_sequence) ? masters.stage_sequence : [];
    preflightCheck(checks, "masters", "workflow exposes the canonical stage sequence", exactSet(stageSequence, FAT_FIXTURE_CONTRACT.stages.canonical), FAT_FIXTURE_CONTRACT.stages.canonical, stageSequence);
    preflightCheck(checks, "masters", "cell, BMS, model, and supplier anchors exist", [masters.model_count, masters.cell_count, masters.bms_count, masters.supplier_count].every((count) => Number(count) === 1));

    const bom = (
      await query(
        client,
        `SELECT h.status::text AS status, count(l.id)::int AS line_count
         FROM bom_headers h
         LEFT JOIN bom_lines l ON l.bom_id = h.id
         WHERE h.id = $1 AND h.bom_number LIKE $2
         GROUP BY h.status`,
        [FAT_IDS.bom.header, `${FAT_PREFIX}%`],
      )
    ).rows[0] ?? {};
    preflightCheck(checks, "bom", "approved FAT BOM exists", bom.status === FAT_FIXTURE_CONTRACT.states.bom, FAT_FIXTURE_CONTRACT.states.bom, bom.status);
    preflightCheck(checks, "bom", "approved FAT BOM has both component lines", Number(bom.line_count) === FAT_FIXTURE_CONTRACT.verification.recordCounts.bomLines, FAT_FIXTURE_CONTRACT.verification.recordCounts.bomLines, bom.line_count);

    const procurement = (
      await query(
        client,
        `SELECT
           (SELECT status::text FROM grn_headers WHERE id = $1 AND grn_number LIKE $4) AS grn_status,
           (SELECT count(*) FROM grn_line_items WHERE grn_id = $1) AS grn_lines,
           (SELECT count(*) FROM incoming_inspections WHERE id = $2 AND inspection_number LIKE $4) AS inspection_count,
           (SELECT count(*) FROM incoming_inspection_lines WHERE inspection_id = $2) AS inspection_lines,
           (SELECT count(*) FROM material_transfers WHERE id = $3 AND transfer_number LIKE $4) AS transfer_count`,
        [FAT_IDS.procurement.posted, FAT_IDS.procurement.inspection, FAT_IDS.procurement.transfer, `${FAT_PREFIX}%`],
      )
    ).rows[0] ?? {};
    preflightCheck(checks, "procurement", "posted GRN is available for the FAT path", procurement.grn_status === FAT_FIXTURE_CONTRACT.states.grn, FAT_FIXTURE_CONTRACT.states.grn, procurement.grn_status);
    preflightCheck(checks, "procurement", "posted GRN has cell and BMS lines", Number(procurement.grn_lines) === FAT_FIXTURE_CONTRACT.verification.recordCounts.grnLines, FAT_FIXTURE_CONTRACT.verification.recordCounts.grnLines, procurement.grn_lines);
    preflightCheck(checks, "procurement", "complete inspection and transfer anchors exist", Number(procurement.inspection_count) === 1 && Number(procurement.inspection_lines) === FAT_FIXTURE_CONTRACT.verification.recordCounts.grnLines && Number(procurement.transfer_count) === 1);

    const cellState = (
      await query(
        client,
        `SELECT
           (SELECT count(*) FROM cells WHERE lot_id = $1 AND cell_id LIKE $4) AS cell_count,
           (SELECT count(*) FROM cells WHERE lot_id = $1 AND status = 'rejected' AND cell_id LIKE $4) AS rejected_count,
           (SELECT count(*) FROM cell_lot_events WHERE lot_id = $1) AS lot_event_count,
           (SELECT count(*) FROM cell_matches WHERE id IN ($2, $3) AND notes LIKE $4) AS match_count,
           (SELECT count(*) FROM cell_match_items WHERE match_id = $2) AS allocated_items,
           (SELECT count(*) FROM cell_match_items WHERE match_id = $3) AS pending_items,
           (SELECT status::text FROM cell_matches WHERE id = $2) AS allocated_status,
           (SELECT status::text FROM cell_matches WHERE id = $3) AS pending_status,
           (SELECT count(*) FROM engineering_corrections WHERE entity_id LIKE $4) AS correction_count`,
        [FAT_IDS.cells.lot, FAT_IDS.cells.matchAllocated, FAT_IDS.cells.matchPending, `${FAT_PREFIX}%`],
      )
    ).rows[0] ?? {};
    preflightCheck(checks, "cells", "controlled lot contains all cells", Number(cellState.cell_count) === FAT_FIXTURE_CONTRACT.cells.total, FAT_FIXTURE_CONTRACT.cells.total, cellState.cell_count);
    preflightCheck(checks, "cells", "controlled lot has all rejected cells", Number(cellState.rejected_count) === FAT_FIXTURE_CONTRACT.cells.rejected, FAT_FIXTURE_CONTRACT.cells.rejected, cellState.rejected_count);
    preflightCheck(checks, "cells", "lot ledger has received and graded anchors", Number(cellState.lot_event_count) === FAT_FIXTURE_CONTRACT.cells.lotEventCount, FAT_FIXTURE_CONTRACT.cells.lotEventCount, cellState.lot_event_count);
    preflightCheck(checks, "cells", "allocated and pending matches are present", Number(cellState.match_count) === FAT_FIXTURE_CONTRACT.cells.matchCount && Number(cellState.allocated_items) === FAT_FIXTURE_CONTRACT.cells.matchItems && Number(cellState.pending_items) === FAT_FIXTURE_CONTRACT.cells.matchItems);
    preflightCheck(checks, "cells", "match statuses are ready for the FAT paths", cellState.allocated_status === FAT_FIXTURE_CONTRACT.states.allocatedMatch && cellState.pending_status === FAT_FIXTURE_CONTRACT.states.pendingMatch, `${FAT_FIXTURE_CONTRACT.states.allocatedMatch} + ${FAT_FIXTURE_CONTRACT.states.pendingMatch}`, `${cellState.allocated_status} + ${cellState.pending_status}`);
    preflightCheck(checks, "cells", "correction ledger anchor is present", Number(cellState.correction_count) >= FAT_FIXTURE_CONTRACT.cells.correctionAnchorCount, `at least ${FAT_FIXTURE_CONTRACT.cells.correctionAnchorCount}`, cellState.correction_count);

    const inventory = (
      await query(
        client,
        `SELECT material_id, sum(quantity)::numeric AS quantity
         FROM inventory_transactions
         WHERE material_id IN ($1, $2)
           AND stock_state = 'available'
           AND source_document_id IN ($3, $4, $5, $6, $7)
         GROUP BY material_id
         ORDER BY material_id`,
        [
          FAT_IDS.masters.materialCell,
          FAT_IDS.masters.materialBms,
          FAT_IDS.procurement.posted,
          FAT_IDS.procurement.rejected,
          FAT_IDS.procurement.inspection,
          FAT_IDS.procurement.transfer,
          "fa1b0000-0000-4000-8000-000000000001",
        ],
      )
    ).rows;
    const inventoryByMaterial = new Map(inventory.map((row) => [String(row.material_id), Number(row.quantity)]));
    preflightCheck(checks, "ledger", "cell signed-ledger projection has the expected available units", inventoryByMaterial.get(FAT_IDS.masters.materialCell) === FAT_FIXTURE_CONTRACT.ledger.cellAvailableUnits, FAT_FIXTURE_CONTRACT.ledger.cellAvailableUnits, inventoryByMaterial.get(FAT_IDS.masters.materialCell));
    preflightCheck(checks, "ledger", "BMS signed-ledger projection has the expected available units", inventoryByMaterial.get(FAT_IDS.masters.materialBms) === FAT_FIXTURE_CONTRACT.ledger.bmsAvailableUnits, FAT_FIXTURE_CONTRACT.ledger.bmsAvailableUnits, inventoryByMaterial.get(FAT_IDS.masters.materialBms));
    const txCount = Number((
      await query(
        client,
        `SELECT count(*) AS n FROM inventory_transactions
         WHERE material_id IN ($1, $2) AND source_document_id IN ($3, $4, $5, $6, $7)`,
        [
          FAT_IDS.masters.materialCell,
          FAT_IDS.masters.materialBms,
          FAT_IDS.procurement.posted,
          FAT_IDS.procurement.rejected,
          FAT_IDS.procurement.inspection,
          FAT_IDS.procurement.transfer,
          "fa1b0000-0000-4000-8000-000000000001",
        ],
      )
    ).rows[0]?.n ?? 0);
    preflightCheck(checks, "ledger", "controlled inventory transaction anchors are present", txCount === FAT_FIXTURE_CONTRACT.ledger.transactionCount, FAT_FIXTURE_CONTRACT.ledger.transactionCount, txCount);

    const manufacturing = (
      await query(
        client,
        `SELECT o.id, o.order_number, o.current_stage::text AS current_stage, o.status::text AS status,
                count(s.id)::int AS stage_count
         FROM mfg_production_orders o
         LEFT JOIN mfg_order_stages s ON s.production_order_id = o.id
         WHERE o.order_number LIKE $1
         GROUP BY o.id, o.order_number, o.current_stage, o.status
         ORDER BY o.order_number`,
        [`${FAT_PREFIX}%`],
      )
    ).rows;
    preflightCheck(checks, "stage", "all controlled production orders exist", manufacturing.length === FAT_FIXTURE_CONTRACT.stages.orderCount, FAT_FIXTURE_CONTRACT.stages.orderCount, manufacturing.length);
    preflightCheck(checks, "stage", "every controlled order has the expected stages", manufacturing.length === FAT_FIXTURE_CONTRACT.stages.orderCount && manufacturing.every((row) => Number(row.stage_count) === FAT_FIXTURE_CONTRACT.stages.perOrder), FAT_FIXTURE_CONTRACT.stages.perOrder, manufacturing.map((row) => `${row.order_number}:${row.stage_count}`).join(", "));
    const cleanStageTypes = (
      await query(
        client,
        `SELECT stage_type::text AS stage_type
         FROM mfg_order_stages
         WHERE production_order_id = $1
         ORDER BY stage_order`,
        [FAT_IDS.orders.clean],
      )
    ).rows.map((row) => String(row.stage_type));
    preflightCheck(checks, "stage", "clean order has the canonical stage sequence", exactSet(cleanStageTypes, FAT_STAGE_TYPES), FAT_STAGE_TYPES, cleanStageTypes);
    const byOrderId = new Map(manufacturing.map((row) => [String(row.id), row]));
    preflightCheck(checks, "stage", "race orders are in the concurrency-ready state",
      [FAT_IDS.orders.raceOne, FAT_IDS.orders.raceTwo].every((id) => byOrderId.get(id)?.current_stage === FAT_FIXTURE_CONTRACT.states.raceStage && byOrderId.get(id)?.status === FAT_FIXTURE_CONTRACT.states.raceOrder));
    preflightCheck(checks, "stage", "clean order is complete", byOrderId.get(FAT_IDS.orders.clean)?.status === FAT_FIXTURE_CONTRACT.states.cleanOrder, FAT_FIXTURE_CONTRACT.states.cleanOrder, byOrderId.get(FAT_IDS.orders.clean)?.status);

    const genealogy = (
      await query(
        client,
        `SELECT
           (SELECT count(*) FROM mfg_battery_genealogy WHERE production_order_id = $1) AS mfg_clean,
           (SELECT count(*) FROM mfg_battery_genealogy WHERE production_order_id = $2) AS mfg_completion,
           (SELECT count(*) FROM product_genealogy WHERE product_id = $3) AS product_rows,
           (SELECT count(*) FROM product_events WHERE product_id = $3) AS product_events`,
        [FAT_IDS.orders.clean, FAT_IDS.orders.completion, FAT_IDS.products.dispatched],
      )
    ).rows[0] ?? {};
    preflightCheck(checks, "genealogy", "clean order has component genealogy", Number(genealogy.mfg_clean) >= FAT_FIXTURE_CONTRACT.genealogy.cleanOrderRows, `at least ${FAT_FIXTURE_CONTRACT.genealogy.cleanOrderRows}`, genealogy.mfg_clean);
    preflightCheck(checks, "genealogy", "completion order has a cell genealogy anchor", Number(genealogy.mfg_completion) >= FAT_FIXTURE_CONTRACT.genealogy.completionOrderRows, `at least ${FAT_FIXTURE_CONTRACT.genealogy.completionOrderRows}`, genealogy.mfg_completion);
    preflightCheck(checks, "genealogy", "dispatched product has projected genealogy and events", Number(genealogy.product_rows) >= FAT_FIXTURE_CONTRACT.genealogy.productRows && Number(genealogy.product_events) >= FAT_FIXTURE_CONTRACT.genealogy.productEventCount);

    const concurrency = (
      await query(
        client,
        `SELECT
           (SELECT count(*) FROM mfg_charger_units WHERE id = $1 AND charger_code LIKE $5 AND status = $6 AND current_order_id IS NULL) AS charger_ready,
           (SELECT count(*) FROM mfg_production_orders WHERE id IN ($2, $3) AND order_number LIKE $5 AND current_stage = $7 AND status = $8) AS race_orders,
           (SELECT count(*) FROM cell_matches WHERE id = $4 AND status = $9 AND notes LIKE $5) AS pending_match,
           (SELECT count(*) FROM cell_match_items WHERE match_id = $4) AS pending_match_items`,
        [
          FAT_IDS.chargers.primary,
          FAT_IDS.orders.raceOne,
          FAT_IDS.orders.raceTwo,
          FAT_IDS.cells.matchPending,
          `${FAT_PREFIX}%`,
          "available",
          FAT_FIXTURE_CONTRACT.states.raceStage,
          FAT_FIXTURE_CONTRACT.states.raceOrder,
          FAT_FIXTURE_CONTRACT.states.pendingMatch,
        ],
      )
    ).rows[0] ?? {};
    preflightCheck(checks, "concurrency", "one available unassigned charger is reserved for the race", Number(concurrency.charger_ready) === FAT_FIXTURE_CONTRACT.concurrency.chargerReadyCount, FAT_FIXTURE_CONTRACT.concurrency.chargerReadyCount, concurrency.charger_ready);
    preflightCheck(checks, "concurrency", "race orders are eligible", Number(concurrency.race_orders) === FAT_FIXTURE_CONTRACT.concurrency.raceOrderCount, FAT_FIXTURE_CONTRACT.concurrency.raceOrderCount, concurrency.race_orders);
    preflightCheck(checks, "concurrency", "pending match is available", Number(concurrency.pending_match) === FAT_FIXTURE_CONTRACT.concurrency.pendingMatchCount && Number(concurrency.pending_match_items) === FAT_FIXTURE_CONTRACT.concurrency.pendingMatchItems, `${FAT_FIXTURE_CONTRACT.concurrency.pendingMatchCount} match with ${FAT_FIXTURE_CONTRACT.concurrency.pendingMatchItems} cells`, `${concurrency.pending_match} match with ${concurrency.pending_match_items} cells`);

    const fulfillment = (
      await query(
        client,
        `SELECT
           (SELECT json_build_object(
             'dealer_id', dealer_id, 'dealer_code', dealer_code, 'dealer_name', dealer_name,
             'dealer_address', dealer_address, 'dealer_gst', dealer_gst, 'dealer_contact', dealer_contact, 'dealer_mobile', dealer_mobile
           ) FROM dispatches WHERE id = $1 AND dispatch_number LIKE $6) AS dispatch_snapshot,
           (SELECT count(*) FROM dispatch_items WHERE id = $2 AND dispatch_id = $1 AND product_id = $3) AS dispatch_item,
           (SELECT json_build_object('product_id', product_id, 'dealer_id', dealer_id, 'customer_name', customer_name)
            FROM customer_registrations WHERE id = $4 AND registration_number LIKE $6) AS registration,
           (SELECT json_build_object('product_id', product_id, 'registration_id', registration_id, 'period_months', period_months, 'start_date', start_date, 'end_date', end_date)
            FROM warranties WHERE id = $5 AND warranty_number LIKE $6) AS warranty`,
        [FAT_IDS.fulfillment.dispatch, FAT_IDS.fulfillment.dispatchItem, FAT_IDS.products.dispatched, FAT_IDS.fulfillment.registration, FAT_IDS.fulfillment.warranty, `${FAT_PREFIX}%`],
      )
    ).rows[0] ?? {};
    const snapshot = fulfillment.dispatch_snapshot as Record<string, unknown> | null;
    preflightCheck(checks, "dispatch", "dispatch stores the dealer snapshot", snapshot !== null &&
      snapshot.dealer_id === FAT_IDS.dealer &&
      snapshot.dealer_code === FAT_FIXTURE_CONTRACT.fulfillment.dealerSnapshot.code &&
      snapshot.dealer_name === FAT_FIXTURE_CONTRACT.fulfillment.dealerSnapshot.name &&
      snapshot.dealer_address === FAT_FIXTURE_CONTRACT.fulfillment.dealerSnapshot.address &&
      snapshot.dealer_gst === FAT_FIXTURE_CONTRACT.fulfillment.dealerSnapshot.gst &&
      snapshot.dealer_contact === FAT_FIXTURE_CONTRACT.fulfillment.dealerSnapshot.contact &&
      snapshot.dealer_mobile === FAT_FIXTURE_CONTRACT.fulfillment.dealerSnapshot.mobile);
    preflightCheck(checks, "dispatch", "dispatch item points to the traceability product", Number(fulfillment.dispatch_item) === FAT_FIXTURE_CONTRACT.fulfillment.dispatchItemCount, FAT_FIXTURE_CONTRACT.fulfillment.dispatchItemCount, fulfillment.dispatch_item);
    const registration = fulfillment.registration as Record<string, unknown> | null;
    preflightCheck(checks, "registration", "customer registration points to dealer product", registration !== null &&
      registration.product_id === FAT_IDS.products.dispatched &&
      registration.dealer_id === FAT_IDS.dealer &&
      registration.customer_name === FAT_FIXTURE_CONTRACT.fulfillment.customerName);
    const warranty = fulfillment.warranty as Record<string, unknown> | null;
    preflightCheck(checks, "warranty", "warranty points to registration and has the controlled term", warranty !== null &&
      warranty.product_id === FAT_IDS.products.dispatched &&
      warranty.registration_id === FAT_IDS.fulfillment.registration &&
      Number(warranty.period_months) === FAT_FIXTURE_CONTRACT.fulfillment.warrantyPeriodMonths &&
      String(warranty.start_date).startsWith(DATE) &&
      String(warranty.end_date).startsWith(FAT_FIXTURE_CONTRACT.warrantyEndDate));

    const failed = checks.filter((check) => !check.ok);
    const groups = [...new Set(checks.map((check) => check.group))].map((group) => {
      const groupChecks = checks.filter((check) => check.group === group);
      return {
        group,
        passed: groupChecks.filter((check) => check.ok).length,
        failed: groupChecks.filter((check) => !check.ok).length,
      };
    });
    const report = {
      dataset: "OCS One full FAT controlled dataset",
      namespace: FAT_PREFIX,
      frozenTag: FROZEN_TAG,
      frozenCommit: FROZEN_COMMIT,
      state: failed.length === 0 ? "ready" : "drift",
      passwordEvidence: "omitted; supplied only through FAT_TEST_PASSWORD",
      summary: { passed: checks.length - failed.length, failed: failed.length, total: checks.length },
      groups,
      failures: failed.map(({ group, name, expected, actual }) => ({ group, name, expected, actual })),
    };
    console.log(JSON.stringify(report, null, 2));
    if (failed.length > 0) {
      throw new Error(`FAT preflight failed ${failed.length} assertion(s); inspect the password-free report above`);
    }
  } finally {
    client.release();
  }
}

async function seed(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await teardownFatDataset(client);
    await seedMasters(client);
    await seedUsers(client);
    await seedBom(client);
    await seedProcurement(client);
    await seedCells(client);
    await seedManufacturing(client);
    await seedFulfillment(client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const verifyClient = await pool.connect();
  try {
    const manifest = await collectManifest(verifyClient);
    await writeManifest(manifest);
    console.log(JSON.stringify(manifest, null, 2));
  } finally {
    verifyClient.release();
  }
}

async function verify(): Promise<void> {
  const client = await pool.connect();
  try {
    const manifest = await collectManifest(client);
    const residual = manifest.residualCounts as Record<string, number>;
    if (Object.values(residual).every((count) => count === 0)) {
      console.log(JSON.stringify({
        dataset: manifest.dataset,
        namespace: manifest.namespace,
        frozenTag: manifest.frozenTag,
        frozenCommit: manifest.frozenCommit,
        residualCounts: residual,
        state: "clean",
      }, null, 2));
      return;
    }
    const required = FAT_FIXTURE_CONTRACT.verification.recordCounts;
    const actual = manifest.recordCounts as Record<string, number>;
    const failures = [
      ["users", actual.users >= required.users],
      ["masters", actual.masters >= required.masters],
      ["materials", actual.materials >= required.materials],
      ["bomLines", actual.bomLines >= required.bomLines],
      ["grnLines", actual.grnLines >= required.grnLines],
      ["inventoryTransactions", actual.inventoryTransactions >= required.inventoryTransactions],
      ["cells", actual.cells === required.cells],
      ["stages", actual.stages === required.stages],
      ["genealogyRows", actual.genealogyRows >= required.genealogyRows],
      ["traceEvents", actual.traceEvents >= required.traceEvents],
    ].filter(([, ok]) => !ok);
    if (failures.length > 0) {
      throw new Error(`FAT fixture verification failed: ${JSON.stringify(failures)}`);
    }
    console.log(JSON.stringify(manifest, null, 2));
  } finally {
    client.release();
  }
}

async function teardown(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await teardownFatDataset(client);
    await assertNoResiduals(client);
    await client.query("COMMIT");
    console.log(`FAT dataset teardown complete; residual count is zero for ${FAT_PREFIX}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  const actionArg = process.argv.find((arg) => arg.startsWith("--action="));
  const action = actionArg?.slice("--action=".length) ?? "seed";
  if (action === "seed") await seed();
  else if (action === "verify") await verify();
  else if (action === "preflight") await preflight();
  else if (action === "teardown") await teardown();
  else throw new Error(`Unknown FAT action "${action}". Use seed, verify, preflight, or teardown.`);
}

main()
  .catch((error) => {
    console.error("FAT dataset command failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });