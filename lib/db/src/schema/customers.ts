import {
  pgTable,
  uuid,
  varchar,
  text,
  date,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { productsTable } from "./products";
import { logisticsDealersTable } from "./logistics";

// ─── G3 — Customer Registration (product ownership) ───────────────────────────
// The minimal end-customer ownership record for a dispatched Product. One
// registration per Product (UNIQUE product_id): a serialized unit is owned by
// exactly one customer. Works for ALL three product types (Battery, Lithium
// Inverter, Hybrid Inverter) because it keys off the unified `products` table via
// the official serial — it never inspects the workflow/category/serial source.
// installation_date is the anchor for G4 Warranty (warranty starts from install).
export const customerRegistrationsTable = pgTable(
  "customer_registrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    registrationNumber: varchar("registration_number", { length: 50 })
      .notNull()
      .unique(),
    // One registration per serialized unit.
    productId: uuid("product_id")
      .notNull()
      .unique()
      .references(() => productsTable.id),
    dealerId: uuid("dealer_id")
      .notNull()
      .references(() => logisticsDealersTable.id),
    customerName: varchar("customer_name", { length: 255 }).notNull(),
    mobile: varchar("mobile", { length: 20 }).notNull(),
    address: text("address").notNull(),
    installationDate: date("installation_date").notNull(),
    registeredBy: varchar("registered_by", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_customer_reg_product").on(table.productId),
    index("idx_customer_reg_dealer").on(table.dealerId),
    index("idx_customer_reg_mobile").on(table.mobile),
  ]
);

// ─── G4 — Warranty (common engine, all three product types) ───────────────────
// One warranty per Product (UNIQUE product_id), created together with the customer
// registration (installation_date → start_date). period_months is snapshotted from
// the Model at creation so a later Model edit never retroactively changes an issued
// warranty. Effective status is COMPUTED, never a drifting stored column:
//   voided_at set          → "void"
//   else today > end_date  → "expired"
//   else                   → "active"
// Only the void action is persisted (voided_at / void_reason / voided_by).
export const warrantiesTable = pgTable(
  "warranties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    warrantyNumber: varchar("warranty_number", { length: 50 }).notNull().unique(),
    productId: uuid("product_id")
      .notNull()
      .unique()
      .references(() => productsTable.id),
    registrationId: uuid("registration_id")
      .notNull()
      .references(() => customerRegistrationsTable.id),
    startDate: date("start_date").notNull(),
    periodMonths: integer("period_months").notNull(),
    endDate: date("end_date").notNull(),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),
    voidedBy: varchar("voided_by", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_warranty_product").on(table.productId),
    index("idx_warranty_end_date").on(table.endDate),
  ]
);

export type CustomerRegistration = typeof customerRegistrationsTable.$inferSelect;
export type InsertCustomerRegistration = typeof customerRegistrationsTable.$inferInsert;
export type Warranty = typeof warrantiesTable.$inferSelect;
export type InsertWarranty = typeof warrantiesTable.$inferInsert;
