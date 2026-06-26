import { pgTable, decimal, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { createMasterCommonColumns } from "./master-common";

export const masterCablesTable = pgTable("master_cables", {
  ...createMasterCommonColumns("master_cables"),
  sizeSqmm: decimal("size_sqmm").notNull(),
  colour: text("colour").notNull(),
  currentRatingA: decimal("current_rating_a").notNull(),
  insulationType: text("insulation_type").notNull(),
  manufacturer: text("manufacturer").notNull(),
});

export const insertCableMasterSchema = createInsertSchema(masterCablesTable).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  revisionNumber: true 
});
export type InsertCableMaster = z.infer<typeof insertCableMasterSchema>;
export type CableMaster = typeof masterCablesTable.$inferSelect;
