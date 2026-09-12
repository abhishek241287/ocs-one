import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgSequence,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  grnLineItemsTable,
  materialUomEnum,
  materialsTable,
  suppliersTable,
} from "./inventory";
import { bomHeadersTable } from "./bom";
import {
  materialIssueNotesTable,
} from "./material-issue";
import {
  mfgOrderStagesTable,
  mfgProductionOrdersTable,
} from "./manufacturing";
import { usersTable } from "./users";

// ─── Full Inventory Management — Phase 0 foundation ──────────────────────────
//
// These tables are additive to the Battery Factory Pilot inventory model. The
// existing GRN, inspection, cell-processing transfer, and MIN tables remain
// authoritative for their current workflows until the later migration phases.

export const poStatusEnum = pgEnum("po_status", [
  "draft",
  "submitted",
  "approved",
  "partially_received",
  "fully_received",
  "closed",
  "cancelled",
]);

export const purchaseOrderNumberSequence = pgSequence("po_seq");
export const lotNumberSequence = pgSequence("lot_seq");

export const purchaseOrdersTable = pgTable(
  "purchase_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    poNumber: varchar("po_number", { length: 50 }).notNull().unique(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliersTable.id),
    status: poStatusEnum("status").notNull().default("draft"),
    orderedDate: timestamp("ordered_date", { withTimezone: true }),
    requiredDate: timestamp("required_date", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => usersTable.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    currency: varchar("currency", { length: 3 }).notNull().default("INR"),
    totalAmount: numeric("total_amount", { precision: 14, scale: 2 }),
    terms: text("terms"),
    notes: text("notes"),
    overReceiptTolerancePercent: numeric("over_receipt_tolerance_percent", {
      precision: 5,
      scale: 2,
    })
      .notNull()
      .default("5.00"),
    createdBy: uuid("created_by").notNull().references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "purchase_orders_over_receipt_tolerance_nonnegative",
      sql`${table.overReceiptTolerancePercent} >= 0`,
    ),
    index("purchase_orders_supplier_idx").on(table.supplierId),
    index("purchase_orders_status_idx").on(table.status),
  ],
);

export const purchaseOrderLinesTable = pgTable(
  "purchase_order_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrdersTable.id, { onDelete: "cascade" }),
    lineNumber: integer("line_number").notNull(),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materialsTable.id),
    orderedQty: numeric("ordered_qty", { precision: 14, scale: 3 }).notNull(),
    receivedQty: numeric("received_qty", { precision: 14, scale: 3 }).notNull().default("0"),
    rejectedQty: numeric("rejected_qty", { precision: 14, scale: 3 }).notNull().default("0"),
    cancelledQty: numeric("cancelled_qty", { precision: 14, scale: 3 }).notNull().default("0"),
    // Maintained transactionally by the procurement service. It is deliberately
    // stored for list/report performance; ledger reconciliation remains authoritative.
    openQty: numeric("open_qty", { precision: 14, scale: 3 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 14, scale: 4 }),
    uom: materialUomEnum("uom").notNull(),
    requiredDate: timestamp("required_date", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("purchase_order_lines_order_line_unique").on(
      table.purchaseOrderId,
      table.lineNumber,
    ),
    check("purchase_order_lines_ordered_qty_positive", sql`${table.orderedQty} > 0`),
    check("purchase_order_lines_received_qty_nonnegative", sql`${table.receivedQty} >= 0`),
    check("purchase_order_lines_rejected_qty_nonnegative", sql`${table.rejectedQty} >= 0`),
    check("purchase_order_lines_cancelled_qty_nonnegative", sql`${table.cancelledQty} >= 0`),
    check("purchase_order_lines_open_qty_nonnegative", sql`${table.openQty} >= 0`),
  ],
);

export const warehouseTypeEnum = pgEnum("warehouse_type", [
  "main_store",
  "qc_quarantine",
  "production_store",
  "wip",
  "cell_processing",
  "finished_goods",
  "rejected",
  "scrap",
  "dispatch",
  "transit",
]);

export const warehousesTable = pgTable(
  "warehouses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: varchar("code", { length: 20 }).notNull().unique(),
    name: varchar("name", { length: 100 }).notNull(),
    type: warehouseTypeEnum("type").notNull(),
    address: text("address"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("warehouses_active_idx").on(table.isActive)],
);

export const locationTypeEnum = pgEnum("location_type", [
  "receiving",
  "inspection",
  "storage",
  "picking",
  "staging",
  "shipping",
  "quarantine",
]);

export const locationsTable = pgTable(
  "locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehousesTable.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 20 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    type: locationTypeEnum("type").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("locations_warehouse_code_unique").on(table.warehouseId, table.code),
    index("locations_warehouse_idx").on(table.warehouseId),
  ],
);

export const binsTable = pgTable(
  "bins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locationsTable.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 20 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    capacity: numeric("capacity", { precision: 14, scale: 3 }),
    uom: materialUomEnum("uom"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("bins_location_code_unique").on(table.locationId, table.code),
    index("bins_location_idx").on(table.locationId),
    check("bins_capacity_positive", sql`${table.capacity} IS NULL OR ${table.capacity} > 0`),
  ],
);

export const lotStatusEnum = pgEnum("lot_status", [
  "active",
  "consumed",
  "expired",
  "quarantined",
  "rejected",
]);

export const inventoryLotsTable = pgTable(
  "inventory_lots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lotNumber: varchar("lot_number", { length: 50 }).notNull().unique(),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materialsTable.id),
    supplierLotNumber: varchar("supplier_lot_number", { length: 100 }),
    supplierId: uuid("supplier_id").references(() => suppliersTable.id),
    grnLineId: uuid("grn_line_id").references(() => grnLineItemsTable.id),
    receivedDate: timestamp("received_date", { withTimezone: true }).notNull().defaultNow(),
    expiryDate: timestamp("expiry_date", { withTimezone: true }),
    manufactureDate: timestamp("manufacture_date", { withTimezone: true }),
    status: lotStatusEnum("status").notNull().default("active"),
    totalReceivedQty: numeric("total_received_qty", { precision: 14, scale: 3 }).notNull(),
    // This is a performance projection. The signed transaction ledger is authoritative.
    remainingQty: numeric("remaining_qty", { precision: 14, scale: 3 }).notNull(),
    uom: materialUomEnum("uom").notNull(),
    warehouseId: uuid("warehouse_id").references(() => warehousesTable.id),
    locationId: uuid("location_id").references(() => locationsTable.id),
    binId: uuid("bin_id").references(() => binsTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("inventory_lots_material_idx").on(table.materialId),
    index("inventory_lots_supplier_lot_idx").on(table.supplierLotNumber),
    index("inventory_lots_location_idx").on(
      table.warehouseId,
      table.locationId,
      table.binId,
    ),
    check("inventory_lots_total_received_nonnegative", sql`${table.totalReceivedQty} >= 0`),
    check("inventory_lots_remaining_nonnegative", sql`${table.remainingQty} >= 0`),
  ],
);

export const reservationStatusEnum = pgEnum("reservation_status", [
  "active",
  "partially_allocated",
  "fully_allocated",
  "partially_issued",
  "fully_issued",
  "released",
  "cancelled",
  "expired",
]);

export const inventoryReservationsTable = pgTable(
  "inventory_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reservationNumber: varchar("reservation_number", { length: 50 }).notNull().unique(),
    productionOrderId: uuid("production_order_id")
      .notNull()
      .references(() => mfgProductionOrdersTable.id),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materialsTable.id),
    reservedQty: numeric("reserved_qty", { precision: 14, scale: 3 }).notNull(),
    allocatedQty: numeric("allocated_qty", { precision: 14, scale: 3 }).notNull().default("0"),
    issuedQty: numeric("issued_qty", { precision: 14, scale: 3 }).notNull().default("0"),
    uom: materialUomEnum("uom").notNull(),
    status: reservationStatusEnum("status").notNull().default("active"),
    lotId: uuid("lot_id").references(() => inventoryLotsTable.id),
    warehouseId: uuid("warehouse_id").references(() => warehousesTable.id),
    locationId: uuid("location_id").references(() => locationsTable.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdBy: uuid("created_by").notNull().references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: uuid("cancelled_by").references(() => usersTable.id),
    cancellationReason: text("cancellation_reason"),
  },
  (table) => [
    // Reservation is an accounting overlay. It intentionally has no ledger row.
    uniqueIndex("inventory_reservations_active_identity_unique")
      .on(
        table.productionOrderId,
        table.materialId,
        sql`COALESCE(${table.lotId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      )
      .where(
        sql`${table.status} IN ('active', 'partially_allocated', 'fully_allocated', 'partially_issued')`,
      ),
    index("inventory_reservations_material_idx").on(table.materialId, table.warehouseId),
    index("inventory_reservations_order_idx").on(table.productionOrderId),
    check("inventory_reservations_reserved_nonnegative", sql`${table.reservedQty} >= 0`),
    check("inventory_reservations_allocated_nonnegative", sql`${table.allocatedQty} >= 0`),
    check("inventory_reservations_issued_nonnegative", sql`${table.issuedQty} >= 0`),
    check("inventory_reservations_reserved_allocated", sql`${table.reservedQty} >= ${table.allocatedQty}`),
    check("inventory_reservations_allocated_issued", sql`${table.allocatedQty} >= ${table.issuedQty}`),
  ],
);

export const adjustmentTypeEnum = pgEnum("adjustment_type", ["positive", "negative"]);
export const adjustmentStatusEnum = pgEnum("adjustment_status", [
  "draft",
  "submitted",
  "approved",
  "posted",
  "rejected",
]);

export const inventoryAdjustmentsTable = pgTable(
  "inventory_adjustments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adjustmentNumber: varchar("adjustment_number", { length: 50 }).notNull().unique(),
    type: adjustmentTypeEnum("type").notNull(),
    status: adjustmentStatusEnum("status").notNull().default("draft"),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materialsTable.id),
    lotId: uuid("lot_id").references(() => inventoryLotsTable.id),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehousesTable.id),
    locationId: uuid("location_id").references(() => locationsTable.id),
    binId: uuid("bin_id").references(() => binsTable.id),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    uom: materialUomEnum("uom").notNull(),
    systemQty: numeric("system_qty", { precision: 14, scale: 3 }).notNull(),
    physicalQty: numeric("physical_qty", { precision: 14, scale: 3 }).notNull(),
    variance: numeric("variance", { precision: 14, scale: 3 }).notNull(),
    reason: varchar("reason", { length: 255 }).notNull(),
    notes: text("notes"),
    countReference: varchar("count_reference", { length: 50 }),
    approvedBy: uuid("approved_by").references(() => usersTable.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    postedBy: uuid("posted_by").references(() => usersTable.id),
    createdBy: uuid("created_by").notNull().references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("inventory_adjustments_stock_idx").on(
      table.materialId,
      table.warehouseId,
      table.locationId,
      table.binId,
    ),
    check("inventory_adjustments_quantity_positive", sql`${table.quantity} > 0`),
    check("inventory_adjustments_variance_matches_physical_system", sql`${table.variance} = ${table.physicalQty} - ${table.systemQty}`),
  ],
);

export const returnStatusEnum = pgEnum("return_status", [
  "draft",
  "approved",
  "posted",
  "rejected",
]);

export const returnDocumentsTable = pgTable(
  "return_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    returnNumber: varchar("return_number", { length: 50 }).notNull().unique(),
    productionOrderId: uuid("production_order_id")
      .notNull()
      .references(() => mfgProductionOrdersTable.id),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materialsTable.id),
    lotId: uuid("lot_id").references(() => inventoryLotsTable.id),
    originalIssueId: uuid("original_issue_id").references(() => materialIssueNotesTable.id),
    sourceWarehouseId: uuid("source_warehouse_id")
      .notNull()
      .references(() => warehousesTable.id),
    sourceLocationId: uuid("source_location_id").references(() => locationsTable.id),
    destinationWarehouseId: uuid("destination_warehouse_id")
      .notNull()
      .references(() => warehousesTable.id),
    destinationLocationId: uuid("destination_location_id").references(() => locationsTable.id),
    destinationBinId: uuid("destination_bin_id").references(() => binsTable.id),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    uom: materialUomEnum("uom").notNull(),
    reason: varchar("reason", { length: 255 }).notNull(),
    status: returnStatusEnum("status").notNull().default("draft"),
    approvedBy: uuid("approved_by").references(() => usersTable.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    postedBy: uuid("posted_by").references(() => usersTable.id),
    createdBy: uuid("created_by").notNull().references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("return_documents_order_idx").on(table.productionOrderId),
    check("return_documents_quantity_positive", sql`${table.quantity} > 0`),
  ],
);

export const scrapStatusEnum = pgEnum("scrap_status", [
  "draft",
  "approved",
  "posted",
  "rejected",
]);

export const scrapDocumentsTable = pgTable(
  "scrap_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scrapNumber: varchar("scrap_number", { length: 50 }).notNull().unique(),
    productionOrderId: uuid("production_order_id")
      .notNull()
      .references(() => mfgProductionOrdersTable.id),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materialsTable.id),
    lotId: uuid("lot_id").references(() => inventoryLotsTable.id),
    serialNumber: varchar("serial_number", { length: 100 }),
    stageId: uuid("stage_id").references(() => mfgOrderStagesTable.id),
    sourceWarehouseId: uuid("source_warehouse_id")
      .notNull()
      .references(() => warehousesTable.id),
    sourceLocationId: uuid("source_location_id").references(() => locationsTable.id),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    uom: materialUomEnum("uom").notNull(),
    reason: varchar("reason", { length: 255 }).notNull(),
    notes: text("notes"),
    status: scrapStatusEnum("status").notNull().default("draft"),
    approvedBy: uuid("approved_by").references(() => usersTable.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    postedBy: uuid("posted_by").references(() => usersTable.id),
    createdBy: uuid("created_by").notNull().references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("scrap_documents_order_idx").on(table.productionOrderId),
    check("scrap_documents_quantity_positive", sql`${table.quantity} > 0`),
  ],
);

export const consumptionStatusEnum = pgEnum("consumption_status", [
  "draft",
  "confirmed",
  "adjusted",
  "rejected",
]);

export const bomSnapshotsTable = pgTable(
  "bom_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productionOrderId: uuid("production_order_id")
      .notNull()
      .unique()
      .references(() => mfgProductionOrdersTable.id),
    bomId: uuid("bom_id")
      .notNull()
      .references(() => bomHeadersTable.id),
    bomRevision: integer("bom_revision").notNull(),
    snapshotAt: timestamp("snapshot_at", { withTimezone: true }).notNull().defaultNow(),
    snappedBy: uuid("snapped_by").notNull().references(() => usersTable.id),
    totalMaterialCost: numeric("total_material_cost", { precision: 14, scale: 2 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("bom_snapshots_bom_idx").on(table.bomId, table.bomRevision),
    check("bom_snapshots_revision_positive", sql`${table.bomRevision} > 0`),
  ],
);

export const bomSnapshotLinesTable = pgTable(
  "bom_snapshot_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bomSnapshotId: uuid("bom_snapshot_id")
      .notNull()
      .references(() => bomSnapshotsTable.id, { onDelete: "cascade" }),
    lineNumber: integer("line_number").notNull(),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materialsTable.id),
    plannedQty: numeric("planned_qty", { precision: 14, scale: 3 }).notNull(),
    uom: materialUomEnum("uom").notNull(),
    scrapFactor: numeric("scrap_factor", { precision: 5, scale: 2 }).notNull().default("0"),
    yieldPercent: numeric("yield_percent", { precision: 5, scale: 2 }).notNull().default("100"),
    alternateMaterialId: uuid("alternate_material_id").references(() => materialsTable.id),
    isTraceable: boolean("is_traceable").notNull().default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("bom_snapshot_lines_snapshot_line_unique").on(
      table.bomSnapshotId,
      table.lineNumber,
    ),
    index("bom_snapshot_lines_material_idx").on(table.materialId),
    check("bom_snapshot_lines_planned_qty_positive", sql`${table.plannedQty} > 0`),
    check("bom_snapshot_lines_scrap_factor_nonnegative", sql`${table.scrapFactor} >= 0`),
    check("bom_snapshot_lines_yield_percent_range", sql`${table.yieldPercent} > 0 AND ${table.yieldPercent} <= 100`),
  ],
);

export const consumptionConfirmationsTable = pgTable(
  "consumption_confirmations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    confirmationNumber: varchar("confirmation_number", { length: 50 }).notNull().unique(),
    productionOrderId: uuid("production_order_id")
      .notNull()
      .references(() => mfgProductionOrdersTable.id),
    stageId: uuid("stage_id").references(() => mfgOrderStagesTable.id),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materialsTable.id),
    lotId: uuid("lot_id").references(() => inventoryLotsTable.id),
    bomSnapshotLineId: uuid("bom_snapshot_line_id").references(() => bomSnapshotLinesTable.id),
    plannedQty: numeric("planned_qty", { precision: 14, scale: 3 }).notNull(),
    actualQty: numeric("actual_qty", { precision: 14, scale: 3 }).notNull(),
    varianceQty: numeric("variance_qty", { precision: 14, scale: 3 }).notNull(),
    uom: materialUomEnum("uom").notNull(),
    scrapQty: numeric("scrap_qty", { precision: 14, scale: 3 }).notNull().default("0"),
    returnQty: numeric("return_qty", { precision: 14, scale: 3 }).notNull().default("0"),
    reason: varchar("reason", { length: 255 }),
    status: consumptionStatusEnum("status").notNull().default("draft"),
    confirmedBy: uuid("confirmed_by").notNull().references(() => usersTable.id),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    adjustedBy: uuid("adjusted_by").references(() => usersTable.id),
    adjustedAt: timestamp("adjusted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("consumption_confirmations_order_idx").on(table.productionOrderId),
    check("consumption_confirmations_planned_nonnegative", sql`${table.plannedQty} >= 0`),
    check("consumption_confirmations_actual_nonnegative", sql`${table.actualQty} >= 0`),
    check("consumption_confirmations_variance_formula", sql`${table.varianceQty} = ${table.actualQty} - ${table.plannedQty}`),
    check("consumption_confirmations_scrap_nonnegative", sql`${table.scrapQty} >= 0`),
    check("consumption_confirmations_return_nonnegative", sql`${table.returnQty} >= 0`),
  ],
);

export const wipStatusEnum = pgEnum("wip_status", [
  "active",
  "partially_consumed",
  "fully_consumed",
]);

export const wipInventoryTable = pgTable(
  "wip_inventory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productionOrderId: uuid("production_order_id")
      .notNull()
      .references(() => mfgProductionOrdersTable.id),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materialsTable.id),
    lotId: uuid("lot_id").references(() => inventoryLotsTable.id),
    issueId: uuid("issue_id").references(() => materialIssueNotesTable.id),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehousesTable.id),
    locationId: uuid("location_id").references(() => locationsTable.id),
    issuedQty: numeric("issued_qty", { precision: 14, scale: 3 }).notNull(),
    consumedQty: numeric("consumed_qty", { precision: 14, scale: 3 }).notNull().default("0"),
    returnedQty: numeric("returned_qty", { precision: 14, scale: 3 }).notNull().default("0"),
    scrappedQty: numeric("scrapped_qty", { precision: 14, scale: 3 }).notNull().default("0"),
    // Performance cache maintained in the same transaction as ledger movements.
    remainingQty: numeric("remaining_qty", { precision: 14, scale: 3 }).notNull(),
    uom: materialUomEnum("uom").notNull(),
    status: wipStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("wip_inventory_order_material_lot_issue_unique").on(
      table.productionOrderId,
      table.materialId,
      table.lotId,
      table.issueId,
    ),
    index("wip_inventory_order_idx").on(table.productionOrderId),
    check("wip_inventory_issued_nonnegative", sql`${table.issuedQty} >= 0`),
    check("wip_inventory_consumed_nonnegative", sql`${table.consumedQty} >= 0`),
    check("wip_inventory_returned_nonnegative", sql`${table.returnedQty} >= 0`),
    check("wip_inventory_scrapped_nonnegative", sql`${table.scrappedQty} >= 0`),
    check("wip_inventory_remaining_nonnegative", sql`${table.remainingQty} >= 0`),
    check(
      "wip_inventory_remaining_formula",
      sql`${table.remainingQty} = ${table.issuedQty} - ${table.consumedQty} - ${table.returnedQty} - ${table.scrappedQty}`,
    ),
  ],
);

export const transferTypeEnum = pgEnum("transfer_type", [
  "warehouse_to_warehouse",
  "location_to_location",
  "bin_to_bin",
  "store_to_production",
  "production_to_store",
]);

export const transferStatusEnum = pgEnum("transfer_status", [
  "draft",
  "approved",
  "issued",
  "in_transit",
  "received",
  "reconciled",
  "cancelled",
  "rejected",
]);

export const transferLineStatusEnum = pgEnum("transfer_line_status", [
  "pending",
  "issued",
  "partially_received",
  "fully_received",
  "rejected",
]);

export const transferRequestsTable = pgTable(
  "transfer_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transferNumber: varchar("transfer_number", { length: 50 }).notNull().unique(),
    type: transferTypeEnum("type").notNull(),
    status: transferStatusEnum("status").notNull().default("draft"),
    sourceWarehouseId: uuid("source_warehouse_id")
      .notNull()
      .references(() => warehousesTable.id),
    sourceLocationId: uuid("source_location_id").references(() => locationsTable.id),
    sourceBinId: uuid("source_bin_id").references(() => binsTable.id),
    destinationWarehouseId: uuid("destination_warehouse_id")
      .notNull()
      .references(() => warehousesTable.id),
    destinationLocationId: uuid("destination_location_id").references(() => locationsTable.id),
    destinationBinId: uuid("destination_bin_id").references(() => binsTable.id),
    requestedBy: uuid("requested_by").notNull().references(() => usersTable.id),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    approvedBy: uuid("approved_by").references(() => usersTable.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    issuedBy: uuid("issued_by").references(() => usersTable.id),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    receivedBy: uuid("received_by").references(() => usersTable.id),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    cancelledBy: uuid("cancelled_by").references(() => usersTable.id),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancellationReason: text("cancellation_reason"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("transfer_requests_status_idx").on(table.status),
    index("transfer_requests_source_idx").on(table.sourceWarehouseId),
    index("transfer_requests_destination_idx").on(table.destinationWarehouseId),
    check(
      "transfer_requests_distinct_warehouses",
      sql`${table.sourceWarehouseId} <> ${table.destinationWarehouseId}`,
    ),
  ],
);

export const transferLinesTable = pgTable(
  "transfer_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transferRequestId: uuid("transfer_request_id")
      .notNull()
      .references(() => transferRequestsTable.id, { onDelete: "cascade" }),
    lineNumber: integer("line_number").notNull(),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materialsTable.id),
    lotId: uuid("lot_id").references(() => inventoryLotsTable.id),
    requestedQty: numeric("requested_qty", { precision: 14, scale: 3 }).notNull(),
    issuedQty: numeric("issued_qty", { precision: 14, scale: 3 }),
    receivedQty: numeric("received_qty", { precision: 14, scale: 3 }),
    uom: materialUomEnum("uom").notNull(),
    status: transferLineStatusEnum("status").notNull().default("pending"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("transfer_lines_request_line_unique").on(
      table.transferRequestId,
      table.lineNumber,
    ),
    index("transfer_lines_material_idx").on(table.materialId),
    check("transfer_lines_requested_positive", sql`${table.requestedQty} > 0`),
    check("transfer_lines_issued_nonnegative", sql`${table.issuedQty} IS NULL OR ${table.issuedQty} >= 0`),
    check("transfer_lines_received_nonnegative", sql`${table.receivedQty} IS NULL OR ${table.receivedQty} >= 0`),
  ],
);

// Outbox events are written in the same transaction as the business mutation.
// Workers may retry publication; processedAt is the projection status, not the
// business event's source of truth.
export const outboxEventsTable = pgTable(
  "outbox_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    aggregateType: varchar("aggregate_type", { length: 64 }).notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    retryCount: integer("retry_count").notNull().default(0),
    lastError: text("last_error"),
  },
  (table) => [
    index("outbox_events_unprocessed_idx").on(table.processedAt, table.occurredAt),
    index("outbox_events_aggregate_idx").on(table.aggregateType, table.aggregateId),
    check("outbox_events_retry_count_nonnegative", sql`${table.retryCount} >= 0`),
  ],
);

export const reconciliationStatusEnum = pgEnum("inventory_reconciliation_status", [
  "passed",
  "failed",
]);

export const inventoryReconciliationReportsTable = pgTable(
  "inventory_reconciliation_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    status: reconciliationStatusEnum("status").notNull(),
    violationCount: integer("violation_count").notNull().default(0),
    violations: jsonb("violations").$type<unknown[]>().notNull().default([]),
  },
  (table) => [
    index("inventory_reconciliation_reports_run_idx").on(table.runAt),
    check("inventory_reconciliation_reports_violation_count_nonnegative", sql`${table.violationCount} >= 0`),
  ],
);

export type PurchaseOrder = typeof purchaseOrdersTable.$inferSelect;
export type PurchaseOrderLine = typeof purchaseOrderLinesTable.$inferSelect;
export type Warehouse = typeof warehousesTable.$inferSelect;
export type Location = typeof locationsTable.$inferSelect;
export type Bin = typeof binsTable.$inferSelect;
export type InventoryLot = typeof inventoryLotsTable.$inferSelect;
export type InventoryReservation = typeof inventoryReservationsTable.$inferSelect;
export type InventoryAdjustment = typeof inventoryAdjustmentsTable.$inferSelect;
export type ReturnDocument = typeof returnDocumentsTable.$inferSelect;
export type ScrapDocument = typeof scrapDocumentsTable.$inferSelect;
export type ConsumptionConfirmation = typeof consumptionConfirmationsTable.$inferSelect;
export type WipInventory = typeof wipInventoryTable.$inferSelect;
export type TransferRequest = typeof transferRequestsTable.$inferSelect;
export type TransferLine = typeof transferLinesTable.$inferSelect;
export type OutboxEvent = typeof outboxEventsTable.$inferSelect;
export type InventoryReconciliationReport =
  typeof inventoryReconciliationReportsTable.$inferSelect;