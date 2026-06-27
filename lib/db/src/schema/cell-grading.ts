import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  doublePrecision,
  index,
  json,
} from "drizzle-orm/pg-core";
import { masterProductsTable } from "./master-products";
import { masterCellsTable } from "./master-cells";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const cellStatusEnum = pgEnum("cell_status", [
  "received",
  "grading",
  "approved",
  "rejected",
  "quarantine",
  "reserved",
  "allocated",
]);

export const cellGradeEnum = pgEnum("cell_grade", ["A", "B", "C", "reject"]);

export const cellMatchStatusEnum = pgEnum("cell_match_status", [
  "draft",
  "reserved",
  "allocated",
  "cancelled",
]);

export const cellLotStatusEnum = pgEnum("cell_lot_status", [
  "received",
  "grading",
  "complete",
]);

// ─── Tables ──────────────────────────────────────────────────────────────────

export const cellLotsTable = pgTable("cell_lots", {
  id: uuid("id").primaryKey().defaultRandom(),
  supplier: text("supplier").notNull(),
  manufacturer: text("manufacturer").notNull(),
  cellModel: text("cell_model").notNull(),
  cellChemistry: text("cell_chemistry").notNull().default("LiFePO4"),
  nominalCapacityAh: doublePrecision("nominal_capacity_ah").notNull(),
  lotNumber: varchar("lot_number", { length: 100 }).notNull().unique(),
  invoiceNumber: varchar("invoice_number", { length: 100 }),
  dateReceived: text("date_received").notNull(),
  quantityReceived: integer("quantity_received").notNull(),
  receivedBy: text("received_by").notNull(),
  remarks: text("remarks"),
  status: cellLotStatusEnum("status").notNull().default("received"),
  cellMasterId: uuid("cell_master_id").references(() => masterCellsTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const cellsTable = pgTable(
  "cells",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cellId: varchar("cell_id", { length: 30 }).notNull().unique(),
    lotId: uuid("lot_id").notNull().references(() => cellLotsTable.id),
    status: cellStatusEnum("status").notNull().default("received"),
    grade: cellGradeEnum("grade"),
    voltageV: doublePrecision("voltage_v"),
    capacityAh: doublePrecision("capacity_ah"),
    internalResistanceMohm: doublePrecision("internal_resistance_mohm"),
    temperatureC: doublePrecision("temperature_c"),
    gradingMachineId: text("grading_machine_id"),
    gradedBy: text("graded_by"),
    gradedAt: timestamp("graded_at", { withTimezone: true }),
    gradingNotes: text("grading_notes"),
    matchId: uuid("match_id"),
    allocationOrderId: uuid("allocation_order_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_cells_status").on(table.status),
    index("idx_cells_lot_id").on(table.lotId),
    index("idx_cells_grade").on(table.grade),
    index("idx_cells_status_grade").on(table.status, table.grade),
  ]
);

export const cellGradeConfigTable = pgTable("cell_grade_config", {
  id: integer("id").primaryKey().default(1),
  gradeAMinCapacityPct: doublePrecision("grade_a_min_capacity_pct").notNull().default(98),
  gradeAMaxIrMult: doublePrecision("grade_a_max_ir_mult").notNull().default(1.05),
  gradeBMinCapacityPct: doublePrecision("grade_b_min_capacity_pct").notNull().default(95),
  gradeBMaxIrMult: doublePrecision("grade_b_max_ir_mult").notNull().default(1.10),
  gradeCMinCapacityPct: doublePrecision("grade_c_min_capacity_pct").notNull().default(90),
  gradeCMaxIrMult: doublePrecision("grade_c_max_ir_mult").notNull().default(1.15),
  maxCapacityDiffAh: doublePrecision("max_capacity_diff_ah").notNull().default(0.5),
  maxIrDiffMohm: doublePrecision("max_ir_diff_mohm").notNull().default(2.0),
  maxVoltageDiffMv: doublePrecision("max_voltage_diff_mv").notNull().default(5.0),
  nominalIrMohm: doublePrecision("nominal_ir_mohm").notNull().default(1.0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const cellMatchesTable = pgTable(
  "cell_matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id").references(() => masterProductsTable.id),
    batteryModel: text("battery_model").notNull(),
    cellsPerBattery: integer("cells_per_battery").notNull().default(16),
    quantity: integer("quantity").notNull().default(1),
    status: cellMatchStatusEnum("status").notNull().default("draft"),
    matchScore: doublePrecision("match_score"),
    createdBy: text("created_by").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_cell_matches_status").on(table.status),
    index("idx_cell_matches_created_at").on(table.createdAt),
  ]
);

export const cellMatchItemsTable = pgTable(
  "cell_match_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => cellMatchesTable.id, { onDelete: "cascade" }),
    cellId: uuid("cell_id").notNull().references(() => cellsTable.id),
    batterySlot: integer("battery_slot").notNull(),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_cell_match_items_match_id").on(table.matchId),
    index("idx_cell_match_items_cell_id").on(table.cellId),
  ]
);

export const cellLotEventsTable = pgTable(
  "cell_lot_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => cellLotsTable.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    performedBy: text("performed_by").notNull(),
    performedAt: timestamp("performed_at", { withTimezone: true }).notNull().defaultNow(),
    changes: json("changes"),
    reason: text("reason"),
  },
  (table) => [
    index("idx_cell_lot_events_lot_id").on(table.lotId),
    index("idx_cell_lot_events_performed_at").on(table.performedAt),
  ]
);

// ─── Types ───────────────────────────────────────────────────────────────────

export type CellLot = typeof cellLotsTable.$inferSelect;
export type InsertCellLot = typeof cellLotsTable.$inferInsert;

export type Cell = typeof cellsTable.$inferSelect;
export type InsertCell = typeof cellsTable.$inferInsert;

export type CellGradeConfig = typeof cellGradeConfigTable.$inferSelect;
export type InsertCellGradeConfig = typeof cellGradeConfigTable.$inferInsert;

export type CellMatch = typeof cellMatchesTable.$inferSelect;
export type InsertCellMatch = typeof cellMatchesTable.$inferInsert;

export type CellMatchItem = typeof cellMatchItemsTable.$inferSelect;
export type InsertCellMatchItem = typeof cellMatchItemsTable.$inferInsert;

export type CellLotEvent = typeof cellLotEventsTable.$inferSelect;
export type InsertCellLotEvent = typeof cellLotEventsTable.$inferInsert;
