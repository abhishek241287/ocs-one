import {
  pgTable,
  uuid,
  varchar,
  text,
  date,
  timestamp,
  integer,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { logisticsDealersTable } from "./logistics";
import { productsTable } from "./products";

// ─── Dispatch document (Product-Platform-driven fulfillment) ──────────────────
// The Dispatch module persists each dispatch as an immutable DOCUMENT, mirroring
// the Inventory GRN/Inspection house pattern (header + items + sequence-generated
// unique number + DB unique constraints). The Product Platform stays the source of
// truth for product STATE (products.product_status / dealer_id); the unified
// `product_events` timeline still records product.dispatched / product.dispatch_reversed.
//
// Why a document table (vs the prior events-only dispatch): the approved commercial
// requirements need DB-enforced uniqueness of the dispatch & invoice numbers (D2)
// and an append-only reversal (D4) — neither is structurally enforceable on the
// many-rows-per-dispatch product_events stream. Numbers are unique by construction
// (sequence) + UNIQUE constraint; the header is immutable after creation.

// Header — one row per dispatch. Immutable after creation (no update/PATCH route).
export const dispatchesTable = pgTable(
  "dispatches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // System-generated, race-safe (DIS-YYYYMMDD-NNNNNN from dispatch_seq). UNIQUE.
    dispatchNumber: varchar("dispatch_number", { length: 50 }).notNull().unique(),
    // Operator-entered. UNIQUE — duplicate invoices are an accounting/legal defect (D2).
    invoiceNumber: varchar("invoice_number", { length: 100 }).notNull().unique(),
    dispatchDate: date("dispatch_date").notNull(),
    dealerId: uuid("dealer_id")
      .notNull()
      .references(() => logisticsDealersTable.id),
    // Dealer commercial fields are SNAPSHOTTED at creation so the printable
    // Dispatch Note stays a frozen legal/commercial record — editing the dealer
    // master later must NOT retroactively alter an issued note. `dealer_id` keeps
    // the relational link; these columns are the document's source of truth.
    dealerCode: varchar("dealer_code", { length: 50 }).notNull(),
    dealerName: varchar("dealer_name", { length: 255 }).notNull(),
    dealerAddress: text("dealer_address"),
    dealerGst: varchar("dealer_gst", { length: 20 }),
    dealerContact: varchar("dealer_contact", { length: 255 }),
    dealerMobile: varchar("dealer_mobile", { length: 20 }),
    dispatchedBy: varchar("dispatched_by", { length: 255 }).notNull(),
    itemCount: integer("item_count").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_dispatches_dealer").on(table.dealerId),
    index("idx_dispatches_created_at").on(table.createdAt),
  ]
);

// Items — the products that left the factory on this dispatch. The serial is
// SNAPSHOTTED so the printable Dispatch Note (and history) survive a later
// re-dispatch or status change of the product.
export const dispatchItemsTable = pgTable(
  "dispatch_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dispatchId: uuid("dispatch_id")
      .notNull()
      .references(() => dispatchesTable.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => productsTable.id),
    productSerial: varchar("product_serial", { length: 100 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("uq_dispatch_items_dispatch_product").on(table.dispatchId, table.productId),
    index("idx_dispatch_items_dispatch").on(table.dispatchId),
    index("idx_dispatch_items_product").on(table.productId),
  ]
);

// Reversal — append-only. A dispatch is NEVER deleted/edited; a reversal is a new
// document referencing it (UNIQUE dispatch_id → at most one reversal per dispatch).
// The reversal restores product state (→ packed, dealer cleared) and emits events;
// the original dispatch document is preserved verbatim for audit.
export const dispatchReversalsTable = pgTable(
  "dispatch_reversals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dispatchId: uuid("dispatch_id")
      .notNull()
      .unique()
      .references(() => dispatchesTable.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    reversedBy: varchar("reversed_by", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_dispatch_reversals_dispatch").on(table.dispatchId)]
);

export type Dispatch = typeof dispatchesTable.$inferSelect;
export type InsertDispatch = typeof dispatchesTable.$inferInsert;
export type DispatchItem = typeof dispatchItemsTable.$inferSelect;
export type InsertDispatchItem = typeof dispatchItemsTable.$inferInsert;
export type DispatchReversal = typeof dispatchReversalsTable.$inferSelect;
export type InsertDispatchReversal = typeof dispatchReversalsTable.$inferInsert;
