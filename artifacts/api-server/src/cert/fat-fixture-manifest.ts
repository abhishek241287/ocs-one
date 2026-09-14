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
    reportBefore: "fa180000-0000-4000-8000-000000000007",
    reportInside: "fa180000-0000-4000-8000-000000000008",
    reportAfter: "fa180000-0000-4000-8000-000000000009",
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
  inventory: {
    warehouse: "fa1b0000-0000-4000-8000-000000000003",
    location: "fa1b0000-0000-4000-8000-000000000004",
    bmsLot: "fa1b0000-0000-4000-8000-000000000005",
  },
} as const;

export type FatRole = "owner" | "director" | "supervisor" | "operator" | "viewer" | "dealer";

export type FatFixtureContract = {
  datasetDate: string;
  warrantyEndDate: string;
  roles: readonly FatRole[];
  roleNames: Readonly<Record<FatRole, string>>;
  stages: {
    canonical: readonly string[];
    perOrder: number;
    orderCount: number;
  };
  ledger: {
    cellAvailableUnits: number;
    bmsReceivedUnits: number;
    bmsAvailableUnits: number;
    bmsWipUnits: number;
    bmsRejectedUnits: number;
    bmsInspectionPendingUnits: number;
    transactionCount: number;
    grnLines: number;
    inspectionCount: number;
    inspectionLines: number;
    transferCount: number;
  };
  cells: {
    total: number;
    acceptable: number;
    rejected: number;
    gradeACount: number;
    allocated: number;
    matchCount: number;
    matchItems: number;
    lotEventCount: number;
    correctionAnchorCount: number;
  };
  genealogy: {
    cleanOrderRows: number;
    completionOrderRows: number;
    productRows: number;
    productEventCount: number;
  };
  fulfillment: {
    dealerSnapshot: {
      code: string;
      name: string;
      address: string;
      gst: string;
      contact: string;
      mobile: string;
    };
    customerName: string;
    dispatchItemCount: number;
    warrantyPeriodMonths: number;
  };
  concurrency: {
    chargerReadyCount: number;
    raceOrderCount: number;
    pendingMatchCount: number;
    pendingMatchItems: number;
  };
  reports: {
    productionDateWindow: {
      from: string;
      to: string;
      boundaryOrders: {
        before: { id: string; createdAt: string };
        inside: { id: string; createdAt: string };
        after: { id: string; createdAt: string };
      };
    };
  };
  states: {
    bom: string;
    grn: string;
    allocatedMatch: string;
    pendingMatch: string;
    cleanOrder: string;
    raceOrder: string;
    raceStage: string;
  };
  verification: {
    recordCounts: Readonly<Record<string, number>>;
  };
};

/**
 * The executable FAT fixture contract. Seed data, the generated manifest,
 * preflight, verification, and route evidence must derive controlled
 * expectations from this value instead of maintaining local copies.
 */
export const FAT_FIXTURE_CONTRACT = {
  datasetDate: "2026-09-08",
  warrantyEndDate: "2031-09-08",
  roles: ["owner", "director", "supervisor", "operator", "viewer", "dealer"],
  roleNames: {
    owner: "FAT E2E Owner",
    director: "FAT E2E Director",
    supervisor: "FAT E2E Supervisor",
    operator: "FAT E2E Operator",
    viewer: "FAT E2E Viewer",
    dealer: "FAT E2E Dealer",
  },
  stages: {
    canonical: [
      "cell_allocation",
      "assembly",
      "compression",
      "bms_allocation",
      "bms_programming",
      "charging",
      "testing",
      "quality_control",
      "packing",
    ],
    perOrder: 9,
    orderCount: 6,
  },
  ledger: {
    cellAvailableUnits: 64,
    bmsReceivedUnits: 2,
    bmsAvailableUnits: 1,
    bmsWipUnits: 1,
    bmsRejectedUnits: 1,
    bmsInspectionPendingUnits: 0,
    transactionCount: 13,
    grnLines: 2,
    inspectionCount: 1,
    inspectionLines: 2,
    transferCount: 1,
  },
  cells: {
    total: 64,
    acceptable: 60,
    rejected: 4,
    gradeACount: 48,
    allocated: 16,
    matchCount: 2,
    matchItems: 16,
    lotEventCount: 2,
    correctionAnchorCount: 2,
  },
  genealogy: {
    cleanOrderRows: 5,
    completionOrderRows: 1,
    productRows: 5,
    productEventCount: 3,
  },
  fulfillment: {
    dealerSnapshot: {
      code: `${FAT_PREFIX}DLR-A`,
      name: "FAT E2E Dealer Alpha",
      address: "1 FAT E2E Industrial Estate, Bengaluru",
      gst: "29FATE2E0001Z5",
      contact: "FAT Dealer Desk",
      mobile: "9000000001",
    },
    customerName: "FAT E2E Customer",
    dispatchItemCount: 1,
    warrantyPeriodMonths: 60,
  },
  concurrency: {
    chargerReadyCount: 1,
    raceOrderCount: 2,
    pendingMatchCount: 1,
    pendingMatchItems: 16,
  },
  reports: {
    productionDateWindow: {
      from: "2026-09-08T00:00:00.000Z",
      to: "2026-09-08T23:59:59.999Z",
      boundaryOrders: {
        before: {
          id: "fa180000-0000-4000-8000-000000000007",
          createdAt: "2026-09-07T23:59:59.999Z",
        },
        inside: {
          id: "fa180000-0000-4000-8000-000000000008",
          createdAt: "2026-09-08T12:00:00.000Z",
        },
        after: {
          id: "fa180000-0000-4000-8000-000000000009",
          createdAt: "2026-09-09T00:00:00.000Z",
        },
      },
    },
  },
  states: {
    bom: "approved",
    grn: "posted",
    allocatedMatch: "allocated",
    pendingMatch: "draft",
    cleanOrder: "completed",
    raceOrder: "in_progress",
    raceStage: "charging",
  },
  verification: {
    recordCounts: {
      users: 6,
      masters: 1,
      materials: 2,
      bomLines: 2,
      grnLines: 2,
      inventoryTransactions: 13,
      cells: 64,
      stages: 54,
      genealogyRows: 5,
      traceEvents: 3,
    },
  },
} as const satisfies FatFixtureContract;

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
      { name: "warehouses", sql: `SELECT count(*)::int AS n FROM warehouses WHERE code LIKE $1`, values: [`${FAT_PREFIX}%`] },
      { name: "locations", sql: `SELECT count(*)::int AS n FROM locations WHERE code LIKE $1`, values: [`${FAT_PREFIX}%`] },
      { name: "inventoryLots", sql: `SELECT count(*)::int AS n FROM inventory_lots WHERE lot_number LIKE $1`, values: [`${FAT_PREFIX}%`] },
      { name: "bulkBatches", sql: `SELECT count(*)::int AS n FROM bulk_batches WHERE idempotency_key LIKE $1`, values: [`${FAT_PREFIX}%`] },
      { name: "wipIssues", sql: `SELECT count(*)::int AS n FROM wip_issue_notes WHERE notes LIKE $1`, values: [`${FAT_PREFIX}%`] },
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
    `DELETE FROM inventory_transactions
     WHERE source_document_type = 'wip_issue_note'
       AND source_document_id IN (SELECT id FROM wip_issue_notes WHERE production_order_id IN (SELECT id FROM mfg_production_orders WHERE order_number LIKE '${FAT_PREFIX}%'))`,
    `DELETE FROM outbox_events
     WHERE aggregate_id IN (
       SELECT id FROM bulk_batches WHERE idempotency_key LIKE '${FAT_PREFIX}%'
       UNION SELECT reservation_id FROM bulk_batch_lines WHERE batch_id IN (SELECT id FROM bulk_batches WHERE idempotency_key LIKE '${FAT_PREFIX}%')
       UNION SELECT wip_issue_note_id FROM bulk_batch_lines WHERE batch_id IN (SELECT id FROM bulk_batches WHERE idempotency_key LIKE '${FAT_PREFIX}%')
       UNION SELECT id FROM wip_issue_notes WHERE production_order_id IN (SELECT id FROM mfg_production_orders WHERE order_number LIKE '${FAT_PREFIX}%')
     )`,
    `DELETE FROM wip_inventory
     WHERE wip_issue_note_id IN (SELECT id FROM wip_issue_notes WHERE production_order_id IN (SELECT id FROM mfg_production_orders WHERE order_number LIKE '${FAT_PREFIX}%'))`,
    `DELETE FROM bulk_batch_lines WHERE batch_id IN (SELECT id FROM bulk_batches WHERE idempotency_key LIKE '${FAT_PREFIX}%')`,
    `DELETE FROM wip_issue_lines WHERE wip_issue_note_id IN (SELECT id FROM wip_issue_notes WHERE production_order_id IN (SELECT id FROM mfg_production_orders WHERE order_number LIKE '${FAT_PREFIX}%'))`,
    `DELETE FROM wip_issue_notes WHERE production_order_id IN (SELECT id FROM mfg_production_orders WHERE order_number LIKE '${FAT_PREFIX}%') OR notes LIKE '${FAT_PREFIX}%'`,
    `DELETE FROM inventory_reservation_allocations WHERE reservation_id IN (SELECT id FROM inventory_reservations WHERE production_order_id IN (SELECT id FROM mfg_production_orders WHERE order_number LIKE '${FAT_PREFIX}%'))`,
    `DELETE FROM inventory_reservations WHERE production_order_id IN (SELECT id FROM mfg_production_orders WHERE order_number LIKE '${FAT_PREFIX}%')`,
    `DELETE FROM bulk_batches WHERE idempotency_key LIKE '${FAT_PREFIX}%'`,
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
    `DELETE FROM cell_lot_events WHERE lot_id IN (SELECT id FROM cell_lots WHERE lot_number LIKE '${FAT_PREFIX}%' OR transfer_id IN (SELECT id FROM material_transfers WHERE material_id IN (SELECT id FROM master_materials WHERE code LIKE '${FAT_PREFIX}%')))`,
    `DELETE FROM cells WHERE cell_id LIKE '${FAT_PREFIX}%' OR lot_id IN (SELECT id FROM cell_lots WHERE lot_number LIKE '${FAT_PREFIX}%' OR transfer_id IN (SELECT id FROM material_transfers WHERE material_id IN (SELECT id FROM master_materials WHERE code LIKE '${FAT_PREFIX}%')))`,
    `DELETE FROM cell_lots WHERE lot_number LIKE '${FAT_PREFIX}%' OR transfer_id IN (SELECT id FROM material_transfers WHERE material_id IN (SELECT id FROM master_materials WHERE code LIKE '${FAT_PREFIX}%'))`,
    `DELETE FROM inventory_transactions WHERE source_document_id IN (SELECT id FROM grn_headers WHERE grn_number LIKE '${FAT_PREFIX}%' OR supplier_id IN (SELECT id FROM master_suppliers WHERE code LIKE '${FAT_PREFIX}%')) OR source_document_id IN (SELECT id FROM material_transfers WHERE transfer_number LIKE '${FAT_PREFIX}%' OR supplier_id IN (SELECT id FROM master_suppliers WHERE code LIKE '${FAT_PREFIX}%')) OR material_id IN (SELECT id FROM master_materials WHERE code LIKE '${FAT_PREFIX}%')`,
    `DELETE FROM inventory_lots WHERE lot_number LIKE '${FAT_PREFIX}%' OR material_id IN (SELECT id FROM master_materials WHERE code LIKE '${FAT_PREFIX}%') OR supplier_id IN (SELECT id FROM master_suppliers WHERE code LIKE '${FAT_PREFIX}%')`,
    `DELETE FROM incoming_inspection_lines WHERE inspection_id IN (SELECT id FROM incoming_inspections WHERE inspection_number LIKE '${FAT_PREFIX}%' OR grn_id IN (SELECT id FROM grn_headers WHERE grn_number LIKE '${FAT_PREFIX}%' OR supplier_id IN (SELECT id FROM master_suppliers WHERE code LIKE '${FAT_PREFIX}%'))) OR material_id IN (SELECT id FROM master_materials WHERE code LIKE '${FAT_PREFIX}%')`,
    `DELETE FROM incoming_inspections WHERE inspection_number LIKE '${FAT_PREFIX}%' OR grn_id IN (SELECT id FROM grn_headers WHERE grn_number LIKE '${FAT_PREFIX}%' OR supplier_id IN (SELECT id FROM master_suppliers WHERE code LIKE '${FAT_PREFIX}%'))`,
    `DELETE FROM material_transfers WHERE transfer_number LIKE '${FAT_PREFIX}%' OR material_id IN (SELECT id FROM master_materials WHERE code LIKE '${FAT_PREFIX}%') OR supplier_id IN (SELECT id FROM master_suppliers WHERE code LIKE '${FAT_PREFIX}%')`,
    // API-created document numbers are globally generated, so their dependent
    // lines can still reference a controlled FAT material without carrying the
    // FAT prefix themselves. Remove those dependent lines before their masters;
    // leave the unrelated document header intact.
    `DELETE FROM grn_line_items WHERE grn_id IN (SELECT id FROM grn_headers WHERE grn_number LIKE '${FAT_PREFIX}%' OR supplier_id IN (SELECT id FROM master_suppliers WHERE code LIKE '${FAT_PREFIX}%')) OR material_id IN (SELECT id FROM master_materials WHERE code LIKE '${FAT_PREFIX}%')`,
    `DELETE FROM grn_headers WHERE grn_number LIKE '${FAT_PREFIX}%' OR supplier_id IN (SELECT id FROM master_suppliers WHERE code LIKE '${FAT_PREFIX}%')`,
    `DELETE FROM locations WHERE code LIKE '${FAT_PREFIX}%'`,
    `DELETE FROM warehouses WHERE code LIKE '${FAT_PREFIX}%'`,
    `DELETE FROM material_workflow_assignments
     WHERE id IN ('${FAT_IDS.masters.assignmentCell}', '${FAT_IDS.masters.assignmentBms}')
        OR category_id IN (SELECT id FROM master_material_categories WHERE code LIKE '${FAT_PREFIX}%')
        OR workflow_id IN (SELECT id FROM material_workflows WHERE code LIKE '${FAT_PREFIX}%')`,
    `DELETE FROM bom_lines WHERE bom_id IN (SELECT id FROM bom_headers WHERE bom_number LIKE '${FAT_PREFIX}%' OR model_id IN (SELECT id FROM master_products WHERE code LIKE '${FAT_PREFIX}%')) OR material_id IN (SELECT id FROM master_materials WHERE code LIKE '${FAT_PREFIX}%')`,
    `DELETE FROM bom_headers WHERE bom_number LIKE '${FAT_PREFIX}%' OR model_id IN (SELECT id FROM master_products WHERE code LIKE '${FAT_PREFIX}%')`,
    `DELETE FROM material_issue_note_lines WHERE material_id IN (SELECT id FROM master_materials WHERE code LIKE '${FAT_PREFIX}%')`,
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