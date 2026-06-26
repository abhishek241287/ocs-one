import { pgTable, decimal, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { createMasterCommonColumns } from "./master-common";

export const masterBusbarsTable = pgTable("master_busbars", {
  ...createMasterCommonColumns("master_busbars"),
  material: text("material").notNull(),
  thicknessMm: decimal("thickness_mm").notNull(),
  widthMm: decimal("width_mm").notNull(),
  lengthMm: decimal("length_mm").notNull(),
  surfaceFinish: text("surface_finish").notNull(),
});

export const insertBusbarMasterSchema = createInsertSchema(masterBusbarsTable).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  revisionNumber: true 
});
export type InsertBusbarMaster = z.infer<typeof insertBusbarMasterSchema>;
export type BusbarMaster = typeof masterBusbarsTable.$inferSelect;
