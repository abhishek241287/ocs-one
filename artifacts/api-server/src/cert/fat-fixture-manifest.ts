import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const FAT_PREFIX = "FAT-E2E-";
export const FAT_MANIFEST_PATH = resolve(process.cwd(), "../../certification/fat-fixture-manifest.json");

export type SqlClient = {
  query(text: string, values?: unknown[]): Promise<{
    rows: Array<Record<string, unknown>>;
  }>;
};

export const FAT_IDS = {
  users: {
    owner: "fa110000-0000-4000-8000-000000000001",
    director: "fa110000-0000-4000-8000-000000000002",
    supervisor: "fa110000-0000-4000-8000-000000000003",
    operator: "fa110000-0000-4000-8000-000000000004",
    viewer: "fa110000-0000-4000-8000-000000000005",
    dealer: "fa110000-0000-4000-8000-000000000006",
  },
  dealer: "fa120000-0000-4000-8000-000000000001",
  masters: {
    category: "fa130000-0000-4000-8000-000000000001",
    workflow: "fa130000-0000-4000-8000-000000000002",
    cell: "fa130000-0000-4000-8000-000000000003",
    bms: "fa130000-0000-4000-8000-000000000004",
    cabinet: "fa130000-0000-4000-8000-000000000005",
    connector: "fa130000-0000-4000-8000-000000000006",
    cable: "fa130000-0000-4000-8000-000000000007",
    busbar: "fa130000-0000-4000-8000-000000000008",
    charger: "fa130000-0000-4000-8000-000000000009",
    testEquipment: "fa130000-0000-4000-8000-000000000010",
    model: "fa130000-0000-4000-8000-000000000011",
    materialCategoryCell: "fa130000-0000-4000-8000-000000000012",
    materialCategoryBms: "fa130000-0000-4000-8000-000000000013",
    materialWorkflow: "fa130000-0000-4000-8000-000000000014",
    supplier: "fa130000-0000-4000-8000-000000000015",
    materialCell: "fa130000-0000-4000-8000-000000000016",
    materialBms: "fa130000-0000-4000-8000-000000000017",
    assignmentCell: "fa130000-0000-4000-8000-000000000018",
    assignmentBms: "fa130000-0000-4000-8000-000000000019",
  },
  bom: {
    header: "fa140000-0000-4000-8000-000000000001",
    cellLine: "fa140000-0000-4000-8000-000000000002",
    bmsLine: "fa140000-0000-4000-8000-000000000003",
  },
  procurement: {
    validDraft: "fa150000-0000-4000-8000-000000000001",
    validDraftLine: "fa150000-0000-4000-8000-000000000002",
    invalidDraft: "fa150000-0000-4000-8000-000000000003",
    posted: "fa150000-0000-4000-8000-000000000004",
    cellLine: "fa150000-0000-4000-8000-000000000005",
    bmsLine: "fa150000-0000-4000-8000-000000000006",
    rejected: "fa150000-0000-4000-8000-000000000007",
    rejectedLine: "fa150000-0000-4000-8000-000000000008",
    inspection: "fa150000-0000-4000-8000-000000000009",
    inspectionCellLine: "fa150000-0000-4000-8000-000000000010",
    inspectionBmsLine: "fa150000-0000-4000-8000-000000000011",
    inspectionRejectedLine: "fa150000-0000-4000-8000-000000000012",
    transfer: "fa150000-0000-4000-8000-000000000013",
  },
  cells: {
    lot: "fa160000-0000-4000-8000-000000000001",
    matchAllocated: "fa160000-0000-4000-8000-000000000002",
    matchPending: "fa160000-0000-4000-8000-000000000003",
  },
  chargers: {
    primary: "fa170000-0000-4000-8000-000000000001",
    secondary: "fa170000-0000-4000-8000-000000000002",
    maintenance: "fa170000-0000-4000-8000-000000000003",
  },
  orders: {
    clean: "fa180000-0000-4000-8000-000000000001",
    packed: "fa180000-0000-4000-8000-000000000002",
    reject: "fa180000-0000-4000-8000-000000000003",
    raceOne: "fa180000-0000-4000-8000-000000000004",
    raceTwo: "fa180000-0000-4000-8000-000000000005",
    completion: "fa180000-0000-4000-8000-000000000006",
  },
  products: {
    dispatched: "fa190000-0000-4000-8000-000000000001",
    readyForPacking: "fa190000-0000-4000-8000-000000000002",
    nonPackable: "fa190000-0000-4000-8000-000000000003",
  },
  fulfillment: {
    dispatch: "fa1a0000-0000-4000-8000-000000000001",
    dispatchItem: "fa1a0000-0000-4000-8000-000000000002",
    registration: "fa1a0000-0000-4000-8000-000000000003",
    warranty: "fa1a0000-0000-4000-8000-000000000004",
  },
} as const;

export function cellId(index: number): string {
  return `FAT-E2E-CELL-${String(index).padStart(3, "0")}`;
}

export function orderNumber(key: string): string {
  return `${FAT_PREFIX}ORD-${key}`;
}

export function batteryNumber(key: string): string {
  return `${FAT_PREFIX}BAT-${key}`;
}

export function actorEmail(role: keyof typeof FAT_IDS.users): string {
  return `fat.${role}@fat.local`;
}

export function manifestPath(): string {
  return FAT_MANIFEST_PATH;
}

export async function writeManifest(manifest: Record<string, unknown>): Promise<void> {
  await mkdir(dirname(FAT_MANIFEST_PATH), { recursive: true });
  await writeFile(FAT_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

type ResidualCheck = {
  name: string;
  sql: string;
  values?: unknown[];
};

const residualChecks: ResidualCheck[] = [
  { name: "users", sql: `SELECT count(*)::int AS n FROM users WHERE email LIKE $1`, values: [`fat.%@fat.local`] },
  { name: "dealers", sql: `SELECT count(*)::int AS n FROM logistics_dealers WHERE dealer_code LIKE $1`, values: [`${FAT_PREFIX}%`] },
  { name: "masters", sql: `SELECT count(*)::int AS n FROM master_products WHERE code LIKE $1`, values: [`${FAT_PREFIX}%`] },
  { name: "materials", sql: `SELECT count(*)::int AS n FROM master_materials WHERE code LIKE $1`, values: [`${FAT_PREFIX}%`] },
  { name: "boms", sql: `SELECT count(*)::int AS n FROM bom_headers WHERE bom_number LIKE $1`, values: [`${FAT_PREFIX}%`] },
  { name: "grns", sql: `SELECT count(*)::int AS n FROM grn_headers WHERE grn_number LIKE $1`, values: [`${FAT_PREFIX}%`] },
  { name: "inspections", sql: `SELECT count(*)::int AS n FROM incoming_inspections WHERE inspection_number LIKE $1`, values: [`${FAT_PREFIX}%`] },
  { name: "transfers", sql: `SELECT count(*)::int AS n FROM material_transfers WHERE transfer_number LIKE $1`, values: [`${FAT_PREFIX}%`] },
  { name: "lots", sql: `SELECT count(*)::int AS n FROM cell_lots WHERE lot_number LIKE $1`, values: [`${FAT_PREFIX}%`] },
  { name: "cells", sql: `SELECT count(*)::int AS n FROM cells WHERE cell_id LIKE $1`, values: [`${FAT_PREFIX}%`] },
  { name: "matches", sql: `SELECT count(*)::int AS n FROM cell_matches WHERE notes LIKE $1`, values: [`${FAT_PREFIX}%`] },
  { name: "orders", sql: `SELECT count(*)::int AS n FROM mfg_production_orders WHERE order_number LIKE $1`, values: [`${FAT_PREFIX}%`] },
  { name: "chargers", sql: `SELECT count(*)::int AS n FROM mfg_charger_units WHERE charger_code LIKE $1`, values: [`${FAT_PREFIX}%`] },
  { name: "products", sql: `SELECT count(*)::int AS n FROM products WHERE official_product_serial LIKE $1`, values: [`${FAT_PREFIX}%`] },
  { name: "dispatches", sql: `SELECT count(*)::int AS n FROM dispatches WHERE dispatch_number LIKE $1`, values: [`${FAT_PREFIX}%`] },
  { name: "registrations", sql: `SELECT count(*)::int AS n FROM customer_registrations WHERE registration_number LIKE $1`, values: [`${FAT_PREFIX}%`] },
  { name: "warranties", sql: `SELECT count(*)::int AS n FROM warranties WHERE warranty_number LIKE $1`, values: [`${FAT_PREFIX}%`] },
];

export async function residualCounts(client: SqlClient): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const check of residualChecks) {
    const result = await client.query(check.sql, check.values ?? []);
    counts[check.name] = Number(result.rows[0]?.n ?? 0);
  }
  return counts;
}

export async function assertNoResiduals(client: SqlClient): Promise<void> {
  const counts = await residualCounts(client);
  const residuals = Object.entries(counts).filter(([, count]) => count !== 0);
  if (residuals.length > 0) {
    throw new Error(`FAT teardown left residual rows: ${JSON.stringify(Object.fromEntries(residuals))}`);
  }
}

/**
 * Prefix-scoped teardown. The ordering is intentionally explicit rather than
 * relying on captured IDs or cascades: certification runners can recover from
 * an interrupted seed and still remove every row created by this dataset.
 */
export async function teardownFatDataset(client: SqlClient): Promise<void> {
  const statements = [
    `UPDATE users SET dealer_id = NULL WHERE email LIKE 'fat.%@fat.local'`,
    `UPDATE mfg_charger_units SET current_order_id = NULL WHERE charger_code LIKE '${FAT_PREFIX}%'`,
    `DELETE FROM warranties WHERE warranty_number LIKE '${FAT_PREFIX}%'`,
    `DELETE FROM customer_registrations WHERE registration_number LIKE '${FAT_PREFIX}%'`,
    `DELETE FROM dispatch_reversals WHERE dispatch_id IN (SELECT id FROM dispatches WHERE dispatch_number LIKE '${FAT_PREFIX}%')`,
    `DELETE FROM dispatch_items WHERE dispatch_id IN (SELECT id FROM dispatches WHERE dispatch_number LIKE '${FAT_PREFIX}%')`,
    `DELETE FROM dispatches WHERE dispatch_number LIKE '${FAT_PREFIX}%'`,
    `DELETE FROM logistics_shipment_events WHERE dispatch_order_id IN (SELECT id FROM logistics_dispatch_orders WHERE dispatch_number LIKE '${FAT_PREFIX}%')`,
    `DELETE FROM logistics_dispatch_items WHERE dispatch_order_id IN (SELECT id FROM logistics_dispatch_orders WHERE dispatch_number LIKE '${FAT_PREFIX}%')`,
    `DELETE FROM logistics_dispatch_orders WHERE dispatch_number LIKE '${FAT_PREFIX}%'`,
    `DELETE FROM product_events WHERE product_id IN (SELECT id FROM products WHERE official_product_serial LIKE '${FAT_PREFIX}%')`,
    `DELETE FROM product_genealogy WHERE product_id IN (SELECT id FROM products WHERE official_product_serial LIKE '${FAT_PREFIX}%')`,
    `DELETE FROM products WHERE official_product_serial LIKE '${FAT_PREFIX}%'`,
    `DELETE FROM engineering_corrections WHERE entity_id LIKE '${FAT_PREFIX}%' OR entity_id IN (SELECT id::text FROM cells WHERE cell_id LIKE '${FAT_PREFIX}%')`,
    `DELETE FROM material_issue_reversals WHERE min_id IN (SELECT id FROM material_issue_notes WHERE min_number LIKE '${FAT_PREFIX}%')`,
    `DELETE FROM material_issue_note_lines WHERE min_id IN (SELECT id FROM material_issue_notes WHERE min_number LIKE '${FAT_PREFIX}%')`,
    `DELETE FROM material_issue_notes WHERE min_number LIKE '${FAT_PREFIX}%'`,
    `DELETE FROM mfg_rework_tickets WHERE ticket_number LIKE '${FAT_PREFIX}%'`,
    `DELETE FROM mfg_test_results WHERE production_order_id IN (SELECT id FROM mfg_production_orders WHERE order_number LIKE '${FAT_PREFIX}%')`,
    `DELETE FROM mfg_qc_approvals WHERE production_order_id IN (SELECT id FROM mfg_production_orders WHERE order_number LIKE '${FAT_PREFIX}%')`,
    `DELETE FROM mfg_formation_reports WHERE production_order_id IN (SELECT id FROM mfg_production_orders WHERE order_number LIKE '${FAT_PREFIX}%')`,
    `DELETE FROM mfg_battery_timeline WHERE production_order_id IN (SELECT id FROM mfg_production_orders WHERE order_number LIKE '${FAT_PREFIX}%')`,
    `DELETE FROM mfg_battery_genealogy WHERE production_order_id IN (SELECT id FROM mfg_production_orders WHERE order_number LIKE '${FAT_PREFIX}%')`,
    `DELETE FROM mfg_order_stages WHERE production_order_id IN (SELECT id FROM mfg_production_orders WHERE order_number LIKE '${FAT_PREFIX}%')`,
    `DELETE FROM mfg_production_orders WHERE order_number LIKE '${FAT_PREFIX}%'`,
    `DELETE FROM cell_match_items WHERE match_id IN (SELECT id FROM cell_matches WHERE notes LIKE '${FAT_PREFIX}%')`,
    `DELETE FROM cell_matches WHERE notes LIKE '${FAT_PREFIX}%'`,
    `DELETE FROM cell_lot_events WHERE lot_id IN (SELECT id FROM cell_lots WHERE lot_number LIKE '${FAT_PREFIX}%')`,
    `DELETE FROM cells WHERE cell_id LIKE '${FAT_PREFIX}%'`,
    `DELETE FROM cell_lots WHERE lot_number LIKE '${FAT_PREFIX}%'`,
    `DELETE FROM inventory_transactions WHERE source_document_id IN (SELECT id FROM grn_headers WHERE grn_number LIKE '${FAT_PREFIX}%') OR source_document_id IN (SELECT id FROM material_transfers WHERE transfer_number LIKE '${FAT_PREFIX}%') OR material_id IN (SELECT id FROM master_materials WHERE code LIKE '${FAT_PREFIX}%')`,
    `DELETE FROM incoming_inspection_lines WHERE inspection_id IN (SELECT id FROM incoming_inspections WHERE inspection_number LIKE '${FAT_PREFIX}%')`,
    `DELETE FROM incoming_inspections WHERE inspection_number LIKE '${FAT_PREFIX}%'`,
    `DELETE FROM material_transfers WHERE transfer_number LIKE '${FAT_PREFIX}%'`,
    `DELETE FROM grn_line_items WHERE grn_id IN (SELECT id FROM grn_headers WHERE grn_number LIKE '${FAT_PREFIX}%')`,
    `DELETE FROM grn_headers WHERE grn_number LIKE '${FAT_PREFIX}%'`,
    `DELETE FROM bom_lines WHERE bom_id IN (SELECT id FROM bom_headers WHERE bom_number LIKE '${FAT_PREFIX}%')`,
    `DELETE FROM bom_headers WHERE bom_number LIKE '${FAT_PREFIX}%'`,
    `DELETE FROM material_workflow_assignments WHERE id IN ('${FAT_IDS.masters.assignmentCell}', '${FAT_IDS.masters.assignmentBms}')`,
    `DELETE FROM master_materials WHERE code LIKE '${FAT_PREFIX}%'`,
    `DELETE FROM master_material_categories WHERE code LIKE '${FAT_PREFIX}%'`,
    `DELETE FROM material_workflows WHERE code LIKE '${FAT_PREFIX}%'`,
    `DELETE FROM master_suppliers WHERE code LIKE '${FAT_PREFIX}%'`,
    `DELETE FROM master_products WHERE code LIKE '${FAT_PREFIX}%'`,
    `DELETE FROM product_workflows WHERE code LIKE '${FAT_PREFIX}%'`,
    `DELETE FROM product_categories WHERE code LIKE '${FAT_PREFIX}%'`,
    `DELETE FROM master_test_equipment WHERE code LIKE '${FAT_PREFIX}%'`,
    `DELETE FROM master_chargers WHERE code LIKE '${FAT_PREFIX}%'`,
    `DELETE FROM master_busbars WHERE code LIKE '${FAT_PREFIX}%'`,
    `DELETE FROM master_cables WHERE code LIKE '${FAT_PREFIX}%'`,
    `DELETE FROM master_connectors WHERE code LIKE '${FAT_PREFIX}%'`,
    `DELETE FROM master_cabinets WHERE code LIKE '${FAT_PREFIX}%'`,
    `DELETE FROM master_bms WHERE code LIKE '${FAT_PREFIX}%'`,
    `DELETE FROM master_cells WHERE code LIKE '${FAT_PREFIX}%'`,
    `DELETE FROM mfg_charger_units WHERE charger_code LIKE '${FAT_PREFIX}%'`,
    `DELETE FROM logistics_dealers WHERE dealer_code LIKE '${FAT_PREFIX}%'`,
    `DELETE FROM users WHERE email LIKE 'fat.%@fat.local'`,
  ];

  for (const statement of statements) {
    await client.query(statement);
  }
}