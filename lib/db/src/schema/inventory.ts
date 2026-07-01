import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  numeric,
  integer,
  boolean,
  timestamp,
  date,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { createMasterCommonColumns } from "./master-common";
import { masterCellsTable } from "./master-cells";

// ─── Inventory Platform v1.0 — Phase 1, sub-step 1: Material Master ────────────
// The Material Master is the canonical definition of an inventory material. Every
// GRN (Goods Receipt Note) line will reference exactly ONE Material Master row, so
// there is a single source of truth for what a material IS, separate from how much
// of it is in stock. Built FIRST (CTO direction) so receiving/inspection/inventory
// can be layered on top. Reuses the existing masters framework unchanged.

// Linked Master Type — the component FAMILY a material represents; the discriminator of
// the GENERIC material→master bridge (CTO 2026-06-30). A CLOSED enum: each value maps to
// exactly one existing component master table (resolved in app code). Adding a new family
// (FUSE, RELAY, …) introduces both the new master table AND its enum value together — the
// linkage COLUMNS never change, so scaling to new component types never re-shapes
// master_materials (the point of a generic linked_master_type + linked_master_id over
// per-type FK columns or a Component Registry).
export const linkedMasterTypeEnum = pgEnum("linked_master_type", [
  "CELL",
  "BMS",
  "CABLE",
  "BUSBAR",
  "CONNECTOR",
  "CHARGER",
  "CABINET",
]);

// Material Usage Type — what a material IS for, independent of which master it links to.
//   INVENTORY_COMPONENT → a serialized/stockable component that links to a component
//                         master (Cell/BMS/Cable/…) and stocks inventory.
//   CONSUMABLE          → stocks inventory but has no component master (glue, paste).
//   PACKAGING           → stocks inventory, no master (carton, sticker).
//   SERVICE_ITEM        → exists in the ERP but NEVER stocks inventory (freight, labour,
//                         calibration, installation, warranty replacement) — added now so
//                         future non-inventory cost lines need no migration.
// CLOSED enum (SS-01). Like the linked master, a material's usage_type is IMMUTABLE once
// any GRN line / inventory transaction references it (enforced in the route).
export const materialUsageTypeEnum = pgEnum("material_usage_type", [
  "INVENTORY_COMPONENT",
  "CONSUMABLE",
  "PACKAGING",
  "SERVICE_ITEM",
]);

// Material Category master — an extensible lookup kept as DATA (a real row table),
// NOT a pgEnum, so a director can add a new material type live without a code change
// or migration. Mirrors the Product Category master pattern.
//
// `linkedMasterType` declares the component FAMILY every INVENTORY_COMPONENT material in
// this category links to (e.g. the "LiFePO4 Cell" category → CELL). It DRIVES the material
// picker (only masters of this family are offered) and write-time validation (a material's
// linked_master_type must equal its category's). NULL = a non-component category.
export const materialCategoriesTable = pgTable("master_material_categories", {
  ...createMasterCommonColumns("master_material_categories"),
  linkedMasterType: linkedMasterTypeEnum("linked_master_type"),
  // `engineeringMasterRequired` is the SOLE source of truth for whether materials in
  // this category MUST link a component (engineering) master. It is an independent,
  // admin-editable flag — NOT derived from `linkedMasterType`. true → a linked master
  // is mandatory; false → optional (a link, if provided, is still fully validated). No
  // category names are ever hard-coded; the validation gate reads only this column.
  engineeringMasterRequired: boolean("engineering_master_required")
    .notNull()
    .default(false),
});

// Unit of Measure — the physical unit a material is counted/stocked in. A small,
// CLOSED set bounded at the DB layer (SS-01); adding a unit is an intentional enum
// migration, unlike Category which is open data.
export const materialUomEnum = pgEnum("material_uom", [
  "PCS",
  "KG",
  "M",
  "L",
  "SET",
  "ROLL",
]);

// Material Master — deliberately minimal v1.0: Code + Name (from master-common),
// Category (FK), UOM, optional Manufacturer, Active/Inactive (status, from
// master-common). Resist adding fields here until a downstream module needs them.
export const materialsTable = pgTable(
  "master_materials",
  {
    ...createMasterCommonColumns("master_materials"),
    // Required reference to the Material Category lookup. uuid FK (not free text) so
    // categories cannot be duplicated/mistyped and stay centrally managed.
    categoryId: uuid("category_id")
      .notNull()
      .references(() => materialCategoriesTable.id),
    uom: materialUomEnum("uom").notNull(),
    // Optional — many raw/packing materials are generic and have no single maker.
    manufacturer: text("manufacturer"),
    // What this material IS for (stockable component / consumable / packaging / non-stock
    // service). Drives validation + the Inventory tabs. Default keeps existing rows valid.
    usageType: materialUsageTypeEnum("usage_type")
      .notNull()
      .default("INVENTORY_COMPONENT"),
    // GENERIC material→component-master bridge (replaces the cell-only one, conceptually).
    // `linkedMasterType` says WHICH master family; `linkedMasterId` is the row in that
    // family's table. Intentionally NO DB FK — a single column cannot reference 7 different
    // tables; integrity is enforced in app code (validateLinkedMaster) and a config-integrity
    // probe, and masters are never hard-deleted so the link cannot dangle. Both NULL for
    // CONSUMABLE / PACKAGING / SERVICE_ITEM materials.
    linkedMasterType: linkedMasterTypeEnum("linked_master_type"),
    linkedMasterId: uuid("linked_master_id"),
    // D3 — Material → Cell Master bridge. KEPT (not removed) and kept in sync with the
    // generic link when linkedMasterType='CELL': the FROZEN Receive-From-Inventory /
    // material_transfers cell flow reads this column, so dropping it would break that flow.
    // For non-cell materials it stays NULL.
    cellMasterId: uuid("cell_master_id").references(() => masterCellsTable.id),
  },
  (t) => [
    // "One ACTIVE Material = one component master" (CTO refinement): at most one ACTIVE
    // material may link to a given (type,id). An old material set inactive keeps its link
    // for historical GRNs; a Rev-2 active material takes over procurement. Partial so
    // inactive duplicates and NULL links (consumables/packaging/service) are allowed.
    uniqueIndex("material_active_linked_master_unique")
      .on(t.linkedMasterType, t.linkedMasterId)
      .where(sql`${t.status} = 'active' AND ${t.linkedMasterId} IS NOT NULL`),
  ]
);

export const insertMaterialCategorySchema = createInsertSchema(materialCategoriesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  revisionNumber: true,
});
export type InsertMaterialCategory = z.infer<typeof insertMaterialCategorySchema>;
export type MaterialCategory = typeof materialCategoriesTable.$inferSelect;

export const insertMaterialSchema = createInsertSchema(materialsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  revisionNumber: true,
});
export type InsertMaterial = z.infer<typeof insertMaterialSchema>;
export type Material = typeof materialsTable.$inferSelect;

// ─── Inventory Platform v1.0 — GRN (Goods Receipt Note) ───────────────────────
// GRN records the physical RECEIPT of materials from a supplier. It is a GENERIC
// receiving document: it records WHAT was received and from WHOM, then defers WHAT
// HAPPENS NEXT to the material's assigned Material Workflow — the same architectural
// principle as the Product Platform (the workflow decides, the engine stays generic).
// The GRN engine never assumes every material follows the same inspection process.

// Supplier master — the vendor a GRN is received from. Deliberately minimal: common
// columns only (code, name, status). A GRN references a supplier by FK (supplier_id);
// free-text supplier names are not used.
export const suppliersTable = pgTable("master_suppliers", {
  ...createMasterCommonColumns("master_suppliers"),
});

export const insertSupplierSchema = createInsertSchema(suppliersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  revisionNumber: true,
});
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;
export type Supplier = typeof suppliersTable.$inferSelect;

// Post-receipt action — what a Material Workflow does to a received line AFTER the
// GRN is posted. A CLOSED enum because each value maps to BEHAVIORAL dispatch in the
// posting engine (a distinct inspection_status + stock_state), exactly like the
// Product Platform's product_creation_trigger: adding an action is an intentional
// code change (a new handler) + migration together, keeping dispatch exhaustive.
//   INCOMING_INSPECTION → received line awaits a separate Incoming Inspection
//                         workflow (inspection_status=pending, held inspection_pending).
//   DIRECT_TO_INVENTORY → no inspection workflow for this material; received stock is
//                         immediately available (e.g. packing material), inspection NULL.
export const materialPostReceiptActionEnum = pgEnum("material_post_receipt_action", [
  "INCOMING_INSPECTION",
  "DIRECT_TO_INVENTORY",
]);

// Material Workflow master — mirrors the Product Workflow master. Defines post-receipt
// routing for materials. Director-configured. `postReceiptAction` IS exposed via the
// write API (both values are implemented), unlike the Product trigger which is
// seed-authoritative.
export const materialWorkflowsTable = pgTable("material_workflows", {
  ...createMasterCommonColumns("material_workflows"),
  postReceiptAction: materialPostReceiptActionEnum("post_receipt_action")
    .notNull()
    .default("INCOMING_INSPECTION"),
});

export const insertMaterialWorkflowSchema = createInsertSchema(materialWorkflowsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  revisionNumber: true,
});
export type InsertMaterialWorkflow = z.infer<typeof insertMaterialWorkflowSchema>;
export type MaterialWorkflow = typeof materialWorkflowsTable.$inferSelect;

// Material → Workflow assignment, keyed by CATEGORY (the CTO routing examples are by
// material type = category). Kept in a SEPARATE table — NOT a column on the frozen
// Material Master / Material Category — so Material Master stays untouched. One
// workflow per category (category_id UNIQUE). Assignment is MANDATORY: a category with
// no assignment causes GRN posting to FAIL with a clear validation error — the posting
// engine never assumes a default receiving path (CTO directive: Fail Fast, Never Guess).
export const materialWorkflowAssignmentsTable = pgTable("material_workflow_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  categoryId: uuid("category_id")
    .notNull()
    .unique("material_workflow_assignments_category_unique")
    .references(() => materialCategoriesTable.id),
  workflowId: uuid("workflow_id")
    .notNull()
    .references(() => materialWorkflowsTable.id),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
export type MaterialWorkflowAssignment = typeof materialWorkflowAssignmentsTable.$inferSelect;

// ─── GRN documents ────────────────────────────────────────────────────────────

// Document status (header) — distinct from inspection status (per line). A draft is
// editable and has generated NO inventory transactions; posting commits the receipt
// (generates transactions, stamps per-line routing) and is immutable thereafter.
export const grnStatusEnum = pgEnum("grn_status", ["draft", "posted"]);

// Inspection status (per LINE) — the receiving document only INITIALIZES this from the
// line's workflow; the separate Incoming Inspection workflow drives the transitions.
// NULL = no inspection applies (DIRECT_TO_INVENTORY) or not yet posted.
export const grnInspectionStatusEnum = pgEnum("grn_inspection_status", [
  "pending",
  "passed",
  "rejected",
  "partial",
]);

export const grnHeadersTable = pgTable(
  "grn_headers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    grnNumber: varchar("grn_number", { length: 32 })
      .unique("grn_headers_grn_number_unique")
      .notNull(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliersTable.id),
    receivedDate: date("received_date", { mode: "string" }).notNull(),
    // D1 — supplier invoice number for this receipt. Procurement data that belongs on
    // the GRN; once captured it flows automatically into downstream documents (Cell
    // Lot, etc.). Nullable: not every receipt has an invoice at GRN time.
    invoiceNumber: varchar("invoice_number", { length: 100 }),
    status: grnStatusEnum("status").notNull().default("draft"),
    remarks: text("remarks"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    postedBy: uuid("posted_by"),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid("updated_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("grn_headers_supplier_idx").on(t.supplierId),
    index("grn_headers_status_idx").on(t.status),
  ],
);

export const grnLineItemsTable = pgTable(
  "grn_line_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    grnId: uuid("grn_id")
      .notNull()
      .references(() => grnHeadersTable.id, { onDelete: "cascade" }),
    lineNumber: integer("line_number").notNull(),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materialsTable.id),
    quantityReceived: numeric("quantity_received", { precision: 14, scale: 3 }).notNull(),
    // UOM snapshot at receipt time so a later Material UOM change can't rewrite history.
    uom: materialUomEnum("uom").notNull(),
    // D2 — supplier's manufacturing lot/batch number for this received line. Critical
    // for warranty & recall traceability (e.g. supplier flags lot 240612 as defective).
    // Flows into the Cell Lot on transfer. Nullable (not every material is lot-tracked).
    supplierLotNumber: varchar("supplier_lot_number", { length: 100 }),
    // Per-line — set on post from the line's workflow; NULL until posted, and NULL for
    // DIRECT_TO_INVENTORY lines (no inspection process).
    inspectionStatus: grnInspectionStatusEnum("inspection_status"),
    remarks: text("remarks"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("grn_line_items_grn_idx").on(t.grnId),
    index("grn_line_items_material_idx").on(t.materialId),
  ],
);

// ─── Inventory transaction ledger (append-only) ───────────────────────────────
// Every stock movement is one immutable row. GRN posting writes one GRN_RECEIPT per
// line. This is the source of truth for stock movement; on-hand BALANCE aggregation is
// a separate later module that PROJECTS from this ledger. No updated_at — rows are
// never mutated.
export const inventoryTransactionTypeEnum = pgEnum("inventory_transaction_type", [
  "GRN_RECEIPT",
  // Incoming Inspection movements (one inspection finalisation writes up to 3 per line):
  //   INSPECTION_RELEASE → frees the inspection_pending hold (negative quantity)
  //   INSPECTION_ACCEPT  → accepted quantity becomes available stock
  //   INSPECTION_REJECT  → rejected quantity is segregated into rejected stock
  "INSPECTION_RELEASE",
  "INSPECTION_ACCEPT",
  "INSPECTION_REJECT",
  // Material → Cell Processing transfer: moves cell-category stock OUT of available
  // inventory into manufacturing (Cell Receiving). Signed NEGATIVE quantity @available.
  // Named descriptively (not a generic ISSUE) so future issue-to-assembly/packing/scrap
  // transactions read clearly in reports.
  "MATERIAL_TRANSFER_TO_CELL_PROCESSING",
  // Material Issue Note (MIN): BOM-driven consumption of NON-CELL raw materials into
  // production. PRODUCTION_ISSUE is signed NEGATIVE @available (stock leaves inventory);
  // PRODUCTION_ISSUE_REVERSAL is signed POSITIVE @available (a reversed MIN restores it).
  // Cells are excluded — they are consumed via MATERIAL_TRANSFER_TO_CELL_PROCESSING.
  "PRODUCTION_ISSUE",
  "PRODUCTION_ISSUE_REVERSAL",
]);

// Where the moved quantity sits. inspection_pending = received but awaiting Incoming
// Inspection; available = usable stock (passed inspection or DIRECT_TO_INVENTORY);
// rejected = failed inspection, segregated from usable stock.
export const inventoryStockStateEnum = pgEnum("inventory_stock_state", [
  "inspection_pending",
  "available",
  "rejected",
]);

export const inventoryTransactionsTable = pgTable(
  "inventory_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionType: inventoryTransactionTypeEnum("transaction_type").notNull(),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materialsTable.id),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    uom: materialUomEnum("uom").notNull(),
    stockState: inventoryStockStateEnum("stock_state").notNull(),
    // Traceability back to the originating document + line (genealogy).
    sourceDocumentType: varchar("source_document_type", { length: 16 }).notNull(),
    sourceDocumentId: uuid("source_document_id").notNull(),
    sourceLineId: uuid("source_line_id").notNull(),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("inventory_transactions_material_idx").on(t.materialId),
    index("inventory_transactions_source_doc_idx").on(t.sourceDocumentId),
    index("inventory_transactions_type_idx").on(t.transactionType),
  ],
);

// ─── Material Transfer (Store → Cell Processing) ──────────────────────────────
// An immutable TRANSFER DOCUMENT for every inventory→manufacturing movement of cell
// stock. Mirrors the house document pattern (GRN/Inspection/Dispatch): a header with a
// system-generated number TRF-YYYYMMDD-NNNNNN (material_transfer_seq via nextval, never
// client-supplied). The Cell Lot references this transfer (transfer_id) instead of the
// GRN directly, giving a complete Store→Cell Processing audit trail. The signed
// MATERIAL_TRANSFER_TO_CELL_PROCESSING ledger row is the stock movement; this is the
// document. Partial transfers from one GRN line produce multiple transfers until the
// line's available balance reaches zero.
export const materialTransfersTable = pgTable(
  "material_transfers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transferNumber: varchar("transfer_number", { length: 32 })
      .unique("material_transfers_number_unique")
      .notNull(),
    fromLocation: varchar("from_location", { length: 32 }).notNull().default("STORE"),
    toLocation: varchar("to_location", { length: 32 }).notNull().default("CELL_PROCESSING"),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materialsTable.id),
    grnId: uuid("grn_id")
      .notNull()
      .references(() => grnHeadersTable.id),
    grnLineId: uuid("grn_line_id")
      .notNull()
      .references(() => grnLineItemsTable.id),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliersTable.id),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    uom: materialUomEnum("uom").notNull(),
    transferredBy: uuid("transferred_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("material_transfers_material_idx").on(t.materialId),
    index("material_transfers_grn_idx").on(t.grnId),
    index("material_transfers_grn_line_idx").on(t.grnLineId),
  ],
);

export const insertMaterialTransferSchema = createInsertSchema(materialTransfersTable).omit({
  id: true,
  createdAt: true,
});
export type InsertMaterialTransfer = z.infer<typeof insertMaterialTransferSchema>;
export type MaterialTransfer = typeof materialTransfersTable.$inferSelect;

// ─── Incoming Inspection ──────────────────────────────────────────────────────
// Incoming Inspection records what OCS ACCEPTED vs REJECTED from a posted GRN — a
// SEPARATE document from the receipt. ARCHITECTURAL RULE (CTO): inspection NEVER
// modifies the GRN's receipt data (quantity_received / material / supplier / uom stay
// immutable). The GRN says what the supplier DELIVERED; the inspection says what OCS
// did with it. Inspection is LINE-BY-LINE: each pending GRN line gets its own
// accept/reject outcome (materials on one GRN may pass or fail independently), and the
// inventory ledger moves the held quantity inspection_pending → available + rejected.

// Per-line inspection outcome. partial = some accepted AND some rejected on one line.
export const incomingInspectionResultEnum = pgEnum("incoming_inspection_result", [
  "passed",
  "rejected",
  "partial",
]);

// Inspection header — one inspection per GRN (grn_id UNIQUE in v1.0; an inspection
// covers all of that GRN's inspection-pending lines). inspection_number is a race-safe
// document number (INSP-YYYYMMDD-NNNN) from incoming_inspection_seq.
export const incomingInspectionsTable = pgTable(
  "incoming_inspections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inspectionNumber: varchar("inspection_number", { length: 32 })
      .unique("incoming_inspections_number_unique")
      .notNull(),
    grnId: uuid("grn_id")
      .notNull()
      .unique("incoming_inspections_grn_unique")
      .references(() => grnHeadersTable.id),
    remarks: text("remarks"),
    inspectedBy: uuid("inspected_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("incoming_inspections_grn_idx").on(t.grnId)],
);

// Inspection line — one row per inspected GRN line. accepted_qty + rejected_qty MUST
// equal the GRN line's quantity_received (enforced in the route, both >= 0). quantity
// fields are a snapshot for an immutable record. grn_line_id is UNIQUE: a GRN line is
// inspected exactly once in v1.0.
export const incomingInspectionLinesTable = pgTable(
  "incoming_inspection_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inspectionId: uuid("inspection_id")
      .notNull()
      .references(() => incomingInspectionsTable.id, { onDelete: "cascade" }),
    grnLineId: uuid("grn_line_id")
      .notNull()
      .unique("incoming_inspection_lines_grn_line_unique")
      .references(() => grnLineItemsTable.id),
    grnId: uuid("grn_id")
      .notNull()
      .references(() => grnHeadersTable.id),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materialsTable.id),
    quantityReceived: numeric("quantity_received", { precision: 14, scale: 3 }).notNull(),
    acceptedQty: numeric("accepted_qty", { precision: 14, scale: 3 }).notNull(),
    rejectedQty: numeric("rejected_qty", { precision: 14, scale: 3 }).notNull(),
    result: incomingInspectionResultEnum("result").notNull(),
    // Required (route-enforced) whenever rejected_qty > 0 — factory traceability.
    rejectionReason: text("rejection_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("incoming_inspection_lines_inspection_idx").on(t.inspectionId),
    index("incoming_inspection_lines_grn_idx").on(t.grnId),
    index("incoming_inspection_lines_material_idx").on(t.materialId),
  ],
);

export const insertIncomingInspectionSchema = createInsertSchema(incomingInspectionsTable).omit(
  {
    id: true,
    createdAt: true,
  },
);
export type InsertIncomingInspection = z.infer<typeof insertIncomingInspectionSchema>;
export type IncomingInspection = typeof incomingInspectionsTable.$inferSelect;

export const insertIncomingInspectionLineSchema = createInsertSchema(
  incomingInspectionLinesTable,
).omit({ id: true, createdAt: true });
export type InsertIncomingInspectionLine = z.infer<typeof insertIncomingInspectionLineSchema>;
export type IncomingInspectionLine = typeof incomingInspectionLinesTable.$inferSelect;
