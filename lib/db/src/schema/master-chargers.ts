import { pgTable, decimal, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { createMasterCommonColumns } from "./master-common";

export const masterChargersTable = pgTable("master_chargers", {
  ...createMasterCommonColumns("master_chargers"),
  manufacturer: text("manufacturer").notNull(),
  model: text("model").notNull(),
  outputVoltageV: decimal("output_voltage_v").notNull(),
  outputCurrentA: decimal("output_current_a").notNull(),
  powerKw: decimal("power_kw").notNull(),
  communicationProtocol: text("communication_protocol").notNull(),
  datasheetUrl: text("datasheet_url"),
});

export const insertChargerMasterSchema = createInsertSchema(masterChargersTable).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  revisionNumber: true 
});
export type InsertChargerMaster = z.infer<typeof insertChargerMasterSchema>;
export type ChargerMaster = typeof masterChargersTable.$inferSelect;
