import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  date,
  jsonb,
} from "drizzle-orm/pg-core";
import { masterProductsTable } from "./master-products";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const mfgStagetypeEnum = pgEnum("mfg_stage_type", [
  "cell_allocation",
  "bms_allocation",
  "assembly",
  "compression",
  "charging",
  "testing",
  "quality_control",
  "packing",
]);

export const mfgOrderStatusEnum = pgEnum("mfg_order_status", [
  "draft",
  "released",
  "in_progress",
  "completed",
  "cancelled",
]);

export const mfgOrderPriorityEnum = pgEnum("mfg_order_priority", [
  "low",
  "medium",
  "high",
]);

export const mfgStageStatusEnum = pgEnum("mfg_stage_status", [
  "pending",
  "in_progress",
  "completed",
  "approved",
  "rejected",
]);

// ─── Stage order map (for state-machine guards) ───────────────────────────────

export const STAGE_ORDER: Record<string, number> = {
  cell_allocation: 1,
  bms_allocation: 2,
  assembly: 3,
  compression: 4,
  charging: 5,
  testing: 6,
  quality_control: 7,
  packing: 8,
};

// ─── Tables ──────────────────────────────────────────────────────────────────

export const mfgProductionOrdersTable = pgTable("mfg_production_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderNumber: varchar("order_number", { length: 50 }).notNull().unique(),
  batteryNumber: varchar("battery_number", { length: 50 }).notNull().unique(),
  productId: uuid("product_id").references(() => masterProductsTable.id),
  factoryManager: text("factory_manager").notNull(),
  currentStage: mfgStagetypeEnum("current_stage"),
  status: mfgOrderStatusEnum("status").notNull().default("draft"),
  priority: mfgOrderPriorityEnum("priority").notNull().default("medium"),
  plannedStartDate: date("planned_start_date", { mode: "string" }),
  plannedEndDate: date("planned_end_date", { mode: "string" }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const mfgOrderStagesTable = pgTable("mfg_order_stages", {
  id: uuid("id").primaryKey().defaultRandom(),
  productionOrderId: uuid("production_order_id")
    .notNull()
    .references(() => mfgProductionOrdersTable.id, { onDelete: "cascade" }),
  stageType: mfgStagetypeEnum("stage_type").notNull(),
  stageOrder: integer("stage_order").notNull(),
  status: mfgStageStatusEnum("status").notNull().default("pending"),
  operatorName: text("operator_name"),
  supervisorName: text("supervisor_name"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  notes: text("notes"),
  photos: jsonb("photos").$type<{ id: string; name: string; url: string; uploadedAt: string }[]>().default([]),
  stageData: jsonb("stage_data").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const mfgBatteryGenealogyTable = pgTable("mfg_battery_genealogy", {
  id: uuid("id").primaryKey().defaultRandom(),
  productionOrderId: uuid("production_order_id")
    .notNull()
    .references(() => mfgProductionOrdersTable.id, { onDelete: "cascade" }),
  componentType: varchar("component_type", { length: 50 }).notNull(),
  componentId: uuid("component_id"),
  componentName: text("component_name").notNull(),
  quantity: integer("quantity").notNull().default(1),
  serialNumber: text("serial_number"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mfgBatteryTimelineTable = pgTable("mfg_battery_timeline", {
  id: uuid("id").primaryKey().defaultRandom(),
  productionOrderId: uuid("production_order_id")
    .notNull()
    .references(() => mfgProductionOrdersTable.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  stageType: mfgStagetypeEnum("stage_type"),
  actor: text("actor").notNull(),
  description: text("description").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Types ───────────────────────────────────────────────────────────────────

export type MfgProductionOrder = typeof mfgProductionOrdersTable.$inferSelect;
export type InsertMfgProductionOrder = typeof mfgProductionOrdersTable.$inferInsert;

export type MfgOrderStage = typeof mfgOrderStagesTable.$inferSelect;
export type InsertMfgOrderStage = typeof mfgOrderStagesTable.$inferInsert;

export type MfgBatteryGenealogy = typeof mfgBatteryGenealogyTable.$inferSelect;
export type InsertMfgBatteryGenealogy = typeof mfgBatteryGenealogyTable.$inferInsert;

export type MfgBatteryTimeline = typeof mfgBatteryTimelineTable.$inferSelect;
export type InsertMfgBatteryTimeline = typeof mfgBatteryTimelineTable.$inferInsert;
