import { pgTable, decimal, integer, text, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { createMasterCommonColumns } from "./master-common";
import { masterBmsTable } from "./master-bms";
import { masterCabinetsTable } from "./master-cabinets";
import { masterCellsTable } from "./master-cells";

export const masterProductsTable = pgTable("master_products", {
  ...createMasterCommonColumns("master_products"),
  chemistry: text("chemistry").notNull(),
  category: text("category").notNull(),
  nominalVoltageV: decimal("nominal_voltage_v").notNull(),
  capacityAh: decimal("capacity_ah").notNull(),
  energyKwh: decimal("energy_kwh").notNull(),
  configuration: text("configuration").notNull(),
  cellCount: integer("cell_count").notNull(),
  bmsMasterId: uuid("bms_master_id").references(() => masterBmsTable.id),
  cabinetMasterId: uuid("cabinet_master_id").references(() => masterCabinetsTable.id),
  cellMasterId: uuid("cell_master_id").references(() => masterCellsTable.id),
  warrantyPeriodMonths: integer("warranty_period_months").notNull(),
  productImageUrl: text("product_image_url"),
});

export const insertProductMasterSchema = createInsertSchema(masterProductsTable).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  revisionNumber: true 
});
export type InsertProductMaster = z.infer<typeof insertProductMasterSchema>;
export type ProductMaster = typeof masterProductsTable.$inferSelect;
