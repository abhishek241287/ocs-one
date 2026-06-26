import { pgTable, decimal, integer, text, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { createMasterCommonColumns } from "./master-common";

export const masterBmsTable = pgTable("master_bms", {
  ...createMasterCommonColumns("master_bms"),
  manufacturer: text("manufacturer").notNull(),
  model: text("model").notNull(),
  currentRatingA: decimal("current_rating_a").notNull(),
  minVoltageV: decimal("min_voltage_v").notNull(),
  maxVoltageV: decimal("max_voltage_v").notNull(),
  cellSupportCount: integer("cell_support_count").notNull(),
  hasBluetooth: boolean("has_bluetooth").notNull().default(false),
  hasCan: boolean("has_can").notNull().default(false),
  hasRs485: boolean("has_rs485").notNull().default(false),
  hasUart: boolean("has_uart").notNull().default(false),
  firmwareVersion: text("firmware_version"),
  datasheetUrl: text("datasheet_url"),
});

export const insertBmsMasterSchema = createInsertSchema(masterBmsTable).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  revisionNumber: true 
});
export type InsertBmsMaster = z.infer<typeof insertBmsMasterSchema>;
export type BmsMaster = typeof masterBmsTable.$inferSelect;
