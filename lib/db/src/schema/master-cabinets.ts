import { pgTable, decimal, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { createMasterCommonColumns } from "./master-common";

export const masterCabinetsTable = pgTable("master_cabinets", {
  ...createMasterCommonColumns("master_cabinets"),
  model: text("model").notNull(),
  material: text("material").notNull(),
  ipRating: text("ip_rating").notNull(),
  dimensions: text("dimensions").notNull(),
  weightKg: decimal("weight_kg").notNull(),
  colour: text("colour").notNull(),
  mountingType: text("mounting_type").notNull(),
});

export const insertCabinetMasterSchema = createInsertSchema(masterCabinetsTable).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  revisionNumber: true 
});
export type InsertCabinetMaster = z.infer<typeof insertCabinetMasterSchema>;
export type CabinetMaster = typeof masterCabinetsTable.$inferSelect;
