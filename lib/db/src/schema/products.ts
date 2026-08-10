import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { masterProductsTable } from "./master-products";
import { mfgProductionOrdersTable } from "./manufacturing";
import { logisticsDealersTable } from "./logistics";
import { productCategoriesTable, productWorkflowsTable } from "./product-masters";

// ─── Unified Product Platform — serialized Product (unit) identity ─────────────
// D — the `products` table is the serialized finished-good UNIT identity created
// at exactly one gate: QC PASS (permanent rule: No Product before QC PASS).
//
// IDENTITY vs MIGRATION (CTO clarification, CW-03 §2.2): from CW-03 close the
// Product is the canonical BUSINESS identity of every finished item. The link to
// its manufacturing work order lives ONLY on `source_production_order_id`
// (product → order, one-directional). `mfg_production_orders.product_id` is the
// Model/SKU FK and is NEVER repurposed for the unit — keeping it would confuse a
// MODEL with a UNIT. Downstream `production_order_id` references are an
// implementation detail during the additive migration, not a business identity.

// Serial provenance only — downstream NEVER inspects this; it works solely with
// `official_product_serial`. BATTERY → OCS (reuse mfg_battery_seq pattern);
// MANUFACTURER is reserved for future inverter workflows (not exercised in CW-03).
export const productSerialSourceEnum = pgEnum("product_serial_source", [
  "OCS",
  "MANUFACTURER",
]);

// Lifecycle ends at delivered_to_dealer in v1.0; future states are reserved and
// deliberately NOT added (PP-003).
export const productStatusEnum = pgEnum("product_status", [
  "manufacturing",
  "qc_passed",
  "ready_for_packing",
  "packed",
  "dispatched",
  "delivered_to_dealer",
]);

export const productsTable = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Category Master (A). Required — every product has a category. CW-03 = Battery Pack.
    categoryId: uuid("category_id")
      .notNull()
      .references(() => productCategoriesTable.id),
    // Model/SKU Master (B). REQUIRED — the Product DERIVES its manufacturer via
    // model (model → manufacturer), never duplicating it here; a Product with no
    // model could not satisfy that identity contract. Backfill/QC-pass emit must
    // therefore skip-and-report any order missing a model rather than create one.
    modelId: uuid("model_id")
      .notNull()
      .references(() => masterProductsTable.id),
    // Workflow Master (C) by natural code. CW-03 = BATTERY.
    workflowCode: varchar("workflow_code", { length: 100 })
      .notNull()
      .references(() => productWorkflowsTable.code),
    // Order → unit link (one-directional). UNIQUE → idempotent QC-pass emit (no duplicate
    // Products on re-approval/retry). Nullable: MANUFACTURER-sourced units have no OCS order.
    sourceProductionOrderId: uuid("source_production_order_id")
      .unique()
      .references(() => mfgProductionOrdersTable.id),
    // The single serial every downstream module uses (one global uniqueness namespace).
    officialProductSerial: varchar("official_product_serial", { length: 100 })
      .notNull()
      .unique(),
    serialSource: productSerialSourceEnum("serial_source").notNull(),
    qcStatus: varchar("qc_status", { length: 20 }),
    productStatus: productStatusEnum("product_status").notNull().default("qc_passed"),
    currentLocation: varchar("current_location", { length: 255 }),
    dealerId: uuid("dealer_id").references(() => logisticsDealersTable.id),
    // Manufacturing completion timestamp — written EXACTLY ONCE at Product creation
    // (the QC-PASS gate) and never updated thereafter. This is the permanent
    // reference point for all downstream time-based logic: Warranty start, Inventory
    // Ageing, Dealer Stock ageing, Reports & Analytics (CTO CW-03 Phase 0 enhancement).
    // Sourced from the QC stage's immutable `approved_at` (the literal QC-PASS moment),
    // NOT the order's mutable `updated_at` — so it cannot drift if a completed order is
    // later edited. Accurate for both the live QC-pass emit and the historical backfill.
    manufacturingCompletedAt: timestamp("manufacturing_completed_at", {
      withTimezone: true,
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_products_category").on(table.categoryId),
    index("idx_products_status").on(table.productStatus),
    index("idx_products_dealer").on(table.dealerId),
    index("idx_products_location").on(table.currentLocation),
    index("idx_products_workflow").on(table.workflowCode),
    index("idx_products_model").on(table.modelId),
    index("idx_products_source_order").on(table.sourceProductionOrderId),
    // Indexed: ageing/warranty/analytics queries filter and sort on this timestamp.
    index("idx_products_mfg_completed").on(table.manufacturingCompletedAt),
  ]
);

// Category-aware lineage keyed by product_id (generalization of mfg_battery_genealogy).
// Populated at Product creation (DP-1) by copying mfg_battery_genealogy.
// The unique index prevents duplicate component rows per product — COALESCE
// sentinels handle nullable UUID (componentId) and text (serialNumber) so
// that two NULL rows for the same product+componentType are treated as equal.
export const productGenealogyTable = pgTable(
  "product_genealogy",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    componentType: varchar("component_type", { length: 50 }).notNull(),
    componentId: uuid("component_id"),
    componentName: text("component_name").notNull(),
    quantity: integer("quantity").notNull().default(1),
    serialNumber: text("serial_number"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_product_genealogy_product_id").on(table.productId),
    uniqueIndex("unique_product_genealogy").on(
      table.productId,
      table.componentType,
      sql`COALESCE(${table.componentId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      sql`COALESCE(${table.serialNumber}, '')`,
    ),
  ]
);

// Append-only Product audit timeline. Immutable (SS-03): never updated/deleted by app routes.
export const productEventsTable = pgTable(
  "product_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    actor: text("actor").notNull(),
    description: text("description").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_product_events_product_id").on(table.productId),
    index("idx_product_events_created_at").on(table.createdAt),
  ]
);

export type Product = typeof productsTable.$inferSelect;
export type InsertProduct = typeof productsTable.$inferInsert;
export type ProductGenealogy = typeof productGenealogyTable.$inferSelect;
export type InsertProductGenealogy = typeof productGenealogyTable.$inferInsert;
export type ProductEvent = typeof productEventsTable.$inferSelect;
export type InsertProductEvent = typeof productEventsTable.$inferInsert;
