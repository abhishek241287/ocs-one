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
  decimal,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { masterProductsTable } from "./master-products";
import { cellMatchesTable } from "./cell-grading";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const mfgStagetypeEnum = pgEnum("mfg_stage_type", [
  "cell_allocation",
  "assembly",
  "compression",
  "bms_allocation",
  "bms_programming",
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
  "paused",
  "completed",
  "approved",
  "rejected",
]);

export const mfgChargerStatusEnum = pgEnum("mfg_charger_status", [
  "available",
  "busy",
  "maintenance",
]);

// ─── Stage order map (for state-machine guards) ───────────────────────────────

export const STAGE_ORDER: Record<string, number> = {
  cell_allocation: 1,
  assembly: 2,
  compression: 3,
  bms_allocation: 4,
  bms_programming: 5,
  charging: 6,
  testing: 7,
  quality_control: 8,
  packing: 9,
};

// ─── Tables ──────────────────────────────────────────────────────────────────

export const mfgChargerUnitsTable = pgTable("mfg_charger_units", {
  id: uuid("id").primaryKey().defaultRandom(),
  chargerCode: varchar("charger_code", { length: 50 }).notNull().unique(),
  model: varchar("model", { length: 255 }).notNull(),
  manufacturer: varchar("manufacturer", { length: 255 }).notNull(),
  serialNumber: varchar("serial_number", { length: 255 }).notNull().unique(),
  outputVoltageV: decimal("output_voltage_v"),
  maxCurrentA: decimal("max_current_a"),
  status: mfgChargerStatusEnum("status").notNull().default("available"),
  currentOrderId: uuid("current_order_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const mfgProductionOrdersTable = pgTable(
  "mfg_production_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderNumber: varchar("order_number", { length: 50 }).notNull().unique(),
    batteryNumber: varchar("battery_number", { length: 50 }).notNull().unique(),
    productId: uuid("product_id").references(() => masterProductsTable.id),
    cellMatchId: uuid("cell_match_id").references(() => cellMatchesTable.id),
    chargerUnitId: uuid("charger_unit_id").references(() => mfgChargerUnitsTable.id),
    // Nullable until a production order is created through the full-inventory
    // snapshot workflow; existing pilot orders remain valid.
    bomSnapshotId: uuid("bom_snapshot_id"),
    factoryManager: text("factory_manager").notNull(),
    currentStage: mfgStagetypeEnum("current_stage"),
    status: mfgOrderStatusEnum("status").notNull().default("draft"),
    priority: mfgOrderPriorityEnum("priority").notNull().default("medium"),
    plannedStartDate: date("planned_start_date", { mode: "string" }),
    plannedEndDate: date("planned_end_date", { mode: "string" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_mfg_orders_status").on(table.status),
    index("idx_mfg_orders_current_stage").on(table.currentStage),
    index("idx_mfg_orders_product_id").on(table.productId),
    index("idx_mfg_orders_created_at").on(table.createdAt),
    index("idx_mfg_orders_status_stage").on(table.status, table.currentStage),
  ]
);

export const mfgOrderStagesTable = pgTable(
  "mfg_order_stages",
  {
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
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    resumedAt: timestamp("resumed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    notes: text("notes"),
    photos: jsonb("photos").$type<{ id: string; name: string; url: string; uploadedAt: string }[]>().default([]),
    stageData: jsonb("stage_data").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_mfg_stages_order_id").on(table.productionOrderId),
    index("idx_mfg_stages_order_type").on(table.productionOrderId, table.stageType),
    index("idx_mfg_stages_status").on(table.status),
  ]
);

export const mfgBatteryGenealogyTable = pgTable(
  "mfg_battery_genealogy",
  {
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
  },
  (table) => [
    index("idx_mfg_genealogy_order_id").on(table.productionOrderId),
    // Prevent duplicate component records per order — use COALESCE so nullable
    // componentId / serialNumber participate in the uniqueness check correctly
    // (PostgreSQL treats NULLs as distinct in a plain unique index, so two rows
    // with NULL componentId would both be inserted for the same order+type).
    // Zero-UUID sentinel for UUID column; empty-string sentinel for text column.
    uniqueIndex("unique_battery_genealogy").on(
      table.productionOrderId,
      table.componentType,
      sql`COALESCE(${table.componentId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      sql`COALESCE(${table.serialNumber}, '')`,
    ),
  ]
);

export const mfgBatteryTimelineTable = pgTable(
  "mfg_battery_timeline",
  {
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
  },
  (table) => [
    index("idx_mfg_timeline_order_id").on(table.productionOrderId),
    index("idx_mfg_timeline_created_at").on(table.createdAt),
  ]
);

export const mfgFormationReportsTable = pgTable(
  "mfg_formation_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productionOrderId: uuid("production_order_id")
      .notNull()
      .references(() => mfgProductionOrdersTable.id, { onDelete: "cascade" }),
    chargerUnitId: uuid("charger_unit_id").references(() => mfgChargerUnitsTable.id),
    chargerCode: varchar("charger_code", { length: 50 }),
    operator: text("operator").notNull(),
    chargeStartAt: timestamp("charge_start_at", { withTimezone: true }),
    chargeEndAt: timestamp("charge_end_at", { withTimezone: true }),
    chargeTimeMin: decimal("charge_time_min"),
    energyKwh: decimal("energy_kwh"),
    chargingCurrentA: decimal("charging_current_a"),
    startVoltageV: decimal("start_voltage_v"),
    finalVoltageV: decimal("final_voltage_v"),
    finalCurrentA: decimal("final_current_a"),
    ambientTempC: decimal("ambient_temp_c"),
    batteryTempC: decimal("battery_temp_c"),
    topBalancingRequired: boolean("top_balancing_required").notNull().default(false),
    topBalancingStartAt: timestamp("top_balancing_start_at", { withTimezone: true }),
    topBalancingEndAt: timestamp("top_balancing_end_at", { withTimezone: true }),
    finalCellVoltageSpreadMv: decimal("final_cell_voltage_spread_mv"),
    maxCellVoltageV: decimal("max_cell_voltage_v"),
    minCellVoltageV: decimal("min_cell_voltage_v"),
    voltageDiffMv: decimal("voltage_diff_mv"),
    balancingStatus: varchar("balancing_status", { length: 20 }),
    remarks: text("remarks"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_mfg_formation_order_id").on(table.productionOrderId),
  ]
);

// ─── Sprint 7 — Testing & QC enums ──────────────────────────────────────────

export const mfgTestTypeEnum = pgEnum("mfg_test_type", [
  "capacity",
  "charge_discharge",
  "protection",
  "internal_resistance",
]);

export const mfgTestResultEnum = pgEnum("mfg_test_result", [
  "pass",
  "fail",
  "warning",
]);

export const mfgQcDecisionEnum = pgEnum("mfg_qc_decision", [
  "approved",
  "rejected",
]);

export const mfgReworkStatusEnum = pgEnum("mfg_rework_status", [
  "open",
  "in_progress",
  "resolved",
  "closed",
]);

// ─── Sprint 7 — Testing & QC tables ─────────────────────────────────────────

export const mfgTestResultsTable = pgTable(
  "mfg_test_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productionOrderId: uuid("production_order_id")
      .notNull()
      .references(() => mfgProductionOrdersTable.id, { onDelete: "cascade" }),
    testType: mfgTestTypeEnum("test_type").notNull(),
    testEquipmentId: uuid("test_equipment_id"),
    testEquipmentName: text("test_equipment_name"),
    operatorName: text("operator_name").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    result: mfgTestResultEnum("result").notNull(),
    testData: jsonb("test_data").$type<Record<string, unknown>>().default({}),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_mfg_test_results_order_id").on(table.productionOrderId),
  ]
);

export const mfgQcApprovalsTable = pgTable(
  "mfg_qc_approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productionOrderId: uuid("production_order_id")
      .notNull()
      .references(() => mfgProductionOrdersTable.id, { onDelete: "cascade" }),
    decision: mfgQcDecisionEnum("decision").notNull(),
    inspectorName: text("inspector_name").notNull(),
    inspectorRole: varchar("inspector_role", { length: 100 }).notNull().default("Plant Manager"),
    digitalSignature: text("digital_signature"),
    remarks: text("remarks"),
    approvedAt: timestamp("approved_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_mfg_qc_approvals_order_id").on(table.productionOrderId),
  ]
);

export const mfgReworkTicketsTable = pgTable(
  "mfg_rework_tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketNumber: varchar("ticket_number", { length: 50 }).notNull().unique(),
    productionOrderId: uuid("production_order_id")
      .notNull()
      .references(() => mfgProductionOrdersTable.id, { onDelete: "cascade" }),
    batteryNumber: varchar("battery_number", { length: 50 }).notNull(),
    failedTests: jsonb("failed_tests").$type<string[]>().default([]),
    failureReason: text("failure_reason").notNull(),
    status: mfgReworkStatusEnum("status").notNull().default("open"),
    assignedTechnician: text("assigned_technician"),
    correctiveAction: text("corrective_action"),
    retestRequired: boolean("retest_required").notNull().default(true),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_mfg_rework_order_id").on(table.productionOrderId),
    index("idx_mfg_rework_status").on(table.status),
  ]
);

// ─── Types ───────────────────────────────────────────────────────────────────

export type MfgProductionOrder = typeof mfgProductionOrdersTable.$inferSelect;
export type InsertMfgProductionOrder = typeof mfgProductionOrdersTable.$inferInsert;

export type MfgOrderStage = typeof mfgOrderStagesTable.$inferSelect;
export type InsertMfgOrderStage = typeof mfgOrderStagesTable.$inferInsert;

export type MfgBatteryGenealogy = typeof mfgBatteryGenealogyTable.$inferSelect;
export type InsertMfgBatteryGenealogy = typeof mfgBatteryGenealogyTable.$inferInsert;

export type MfgBatteryTimeline = typeof mfgBatteryTimelineTable.$inferSelect;
export type InsertMfgBatteryTimeline = typeof mfgBatteryTimelineTable.$inferInsert;

export type MfgChargerUnit = typeof mfgChargerUnitsTable.$inferSelect;
export type InsertMfgChargerUnit = typeof mfgChargerUnitsTable.$inferInsert;

export type MfgFormationReport = typeof mfgFormationReportsTable.$inferSelect;
export type InsertMfgFormationReport = typeof mfgFormationReportsTable.$inferInsert;

export type MfgTestResult = typeof mfgTestResultsTable.$inferSelect;
export type InsertMfgTestResult = typeof mfgTestResultsTable.$inferInsert;

export type MfgQcApproval = typeof mfgQcApprovalsTable.$inferSelect;
export type InsertMfgQcApproval = typeof mfgQcApprovalsTable.$inferInsert;

export type MfgReworkTicket = typeof mfgReworkTicketsTable.$inferSelect;
export type InsertMfgReworkTicket = typeof mfgReworkTicketsTable.$inferInsert;
