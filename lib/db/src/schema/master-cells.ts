import { pgTable, decimal, integer, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { createMasterCommonColumns } from "./master-common";

export const masterCellsTable = pgTable("master_cells", {
  ...createMasterCommonColumns("master_cells"),
  manufacturer: text("manufacturer").notNull(),
  model: text("model").notNull(),
  chemistry: text("chemistry").notNull(),
  capacityMah: decimal("capacity_mah").notNull(),
  nominalVoltageV: decimal("nominal_voltage_v").notNull(),
  maxVoltageV: decimal("max_voltage_v").notNull(),
  minVoltageV: decimal("min_voltage_v").notNull(),
  weightG: decimal("weight_g").notNull(),
  dimensions: text("dimensions").notNull(),
  internalResistanceSpecMohm: decimal("internal_resistance_spec_mohm").notNull(),
  cycleLife: integer("cycle_life").notNull(),
  datasheetUrl: text("datasheet_url"),
  approvedSupplier: text("approved_supplier"),
});

export const insertCellMasterSchema = createInsertSchema(masterCellsTable).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  revisionNumber: true 
});
export type InsertCellMaster = z.infer<typeof insertCellMasterSchema>;
export type CellMaster = typeof masterCellsTable.$inferSelect;
