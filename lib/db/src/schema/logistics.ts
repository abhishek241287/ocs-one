import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  timestamp,
  date,
  decimal,
  index,
} from "drizzle-orm/pg-core";
import { mfgProductionOrdersTable } from "./manufacturing";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const logisticsDealerStatusEnum = pgEnum("logistics_dealer_status", [
  "active",
  "inactive",
]);

export const logisticsDispatchStatusEnum = pgEnum("logistics_dispatch_status", [
  "draft",
  "confirmed",
  "loaded",
  "in_transit",
  "delivered",
  "cancelled",
]);

export const logisticsShipmentEventTypeEnum = pgEnum("logistics_shipment_event_type", [
  "ready_for_dispatch",
  "loaded",
  "in_transit",
  "delivered",
  "received_by_dealer",
]);

// ─── Dealers ──────────────────────────────────────────────────────────────────

export const logisticsDealersTable = pgTable("logistics_dealers", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealerCode: varchar("dealer_code", { length: 50 }).notNull().unique(),
  dealerName: varchar("dealer_name", { length: 255 }).notNull(),
  gstNumber: varchar("gst_number", { length: 20 }),
  address: text("address"),
  contactPerson: varchar("contact_person", { length: 255 }),
  mobile: varchar("mobile", { length: 20 }),
  email: varchar("email", { length: 255 }),
  territory: varchar("territory", { length: 255 }),
  creditLimit: decimal("credit_limit", { precision: 14, scale: 2 }).default("0"),
  status: logisticsDealerStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Dispatch Orders ──────────────────────────────────────────────────────────

export const logisticsDispatchOrdersTable = pgTable(
  "logistics_dispatch_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dispatchNumber: varchar("dispatch_number", { length: 50 }).notNull().unique(),
    dealerId: uuid("dealer_id").references(() => logisticsDealersTable.id),
    customerName: varchar("customer_name", { length: 255 }),
    transporter: varchar("transporter", { length: 255 }),
    vehicleNumber: varchar("vehicle_number", { length: 50 }),
    driverName: varchar("driver_name", { length: 255 }),
    driverMobile: varchar("driver_mobile", { length: 20 }),
    dispatchDate: date("dispatch_date"),
    status: logisticsDispatchStatusEnum("status").notNull().default("draft"),
    notes: text("notes"),
    createdBy: varchar("created_by", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_dispatch_orders_status").on(table.status),
    index("idx_dispatch_orders_dealer_id").on(table.dealerId),
    index("idx_dispatch_orders_created_at").on(table.createdAt),
  ]
);

// ─── Dispatch Items (junction: dispatch order ↔ battery) ──────────────────────

export const logisticsDispatchItemsTable = pgTable(
  "logistics_dispatch_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dispatchOrderId: uuid("dispatch_order_id")
      .notNull()
      .references(() => logisticsDispatchOrdersTable.id, { onDelete: "cascade" }),
    productionOrderId: uuid("production_order_id")
      .notNull()
      .unique()
      .references(() => mfgProductionOrdersTable.id),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_dispatch_items_order_id").on(table.dispatchOrderId),
  ]
);

// ─── Shipment Events (audit log) ──────────────────────────────────────────────

export const logisticsShipmentEventsTable = pgTable(
  "logistics_shipment_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dispatchOrderId: uuid("dispatch_order_id")
      .notNull()
      .references(() => logisticsDispatchOrdersTable.id, { onDelete: "cascade" }),
    eventType: logisticsShipmentEventTypeEnum("event_type").notNull(),
    actor: varchar("actor", { length: 255 }),
    notes: text("notes"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_shipment_events_dispatch_id").on(table.dispatchOrderId),
  ]
);
