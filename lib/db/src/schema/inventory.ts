import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  numeric,
  integer,
  timestamp,
  date,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { createMasterCommonColumns } from "./master-common";

// ─── Inventory Platform v1.0 — Phase 1, sub-step 1: Material Master ────────────
// The Material Master is the canonical definition of an inventory material. Every
// GRN (Goods Receipt Note) line will reference exactly ONE Material Master row, so
// there is a single source of truth for what a material IS, separate from how much
// of it is in stock. Built FIRST (CTO direction) so receiving/inspection/inventory
// can be layered on top. Reuses the existing masters framework unchanged.

// Material Category master — an extensible lookup kept as DATA (a real row table),
// NOT a pgEnum, so a director can add a new material type live without a code change
// or migration. Mirrors the Product Category master pattern.
export const materialCategoriesTable = pgTable("master_material_categories", {
  ...createMasterCommonColumns("master_material_categories"),
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
export const materialsTable = pgTable("master_materials", {
  ...createMasterCommonColumns("master_materials"),
  // Required reference to the Material Category lookup. uuid FK (not free text) so
  // categories cannot be duplicated/mistyped and stay centrally managed.
  categoryId: uuid("category_id")
    .notNull()
    .references(() => materialCategoriesTable.id),
  uom: materialUomEnum("uom").notNull(),
  // Optional — many raw/packing materials are generic and have no single maker.
  manufacturer: text("manufacturer"),
});

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
// workflow per category (category_id UNIQUE). A category with no assignment is treated
// as DIRECT_TO_INVENTORY by the posting engine ("Packing Material → Inventory if no
// inspection workflow exists").
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
]);

// Where the moved quantity sits. inspection_pending = received but awaiting Incoming
// Inspection; available = usable stock (DIRECT_TO_INVENTORY).
export const inventoryStockStateEnum = pgEnum("inventory_stock_state", [
  "inspection_pending",
  "available",
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
