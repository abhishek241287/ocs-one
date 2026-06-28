import { pgTable, pgEnum, uuid, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { createMasterCommonColumns } from "./master-common";

// ─── Inventory Platform v1.0 — Phase 1, sub-step 1: Material Master ────────────
// The Material Master is the canonical definition of an inventory material. Every
// GRN (Goods Receipt Note) line will reference exactly ONE Material Master row, so
// there is a single source of truth for what a material IS, separate from how much
// of it is in stock. Built FIRST (CTO direction) so receiving/inspection/inventory
// can be layered on top. Reuses the existing masters framework unchanged.

// Material Category master — an extensible lookup kept as DATA (a real row table),
// NOT a pgEnum, so a director can add a new material type live without a code change
// or migration. Mirrors the Product Category master pattern.
export const materialCategoriesTable = pgTable("master_material_categories", {
  ...createMasterCommonColumns("master_material_categories"),
});

// Unit of Measure — the physical unit a material is counted/stocked in. A small,
// CLOSED set bounded at the DB layer (SS-01); adding a unit is an intentional enum
// migration, unlike Category which is open data.
export const materialUomEnum = pgEnum("material_uom", [
  "PCS",
  "KG",
  "M",
  "L",
  "SET",
  "ROLL",
]);

// Material Master — deliberately minimal v1.0: Code + Name (from master-common),
// Category (FK), UOM, optional Manufacturer, Active/Inactive (status, from
// master-common). Resist adding fields here until a downstream module needs them.
export const materialsTable = pgTable("master_materials", {
  ...createMasterCommonColumns("master_materials"),
  // Required reference to the Material Category lookup. uuid FK (not free text) so
  // categories cannot be duplicated/mistyped and stay centrally managed.
  categoryId: uuid("category_id")
    .notNull()
    .references(() => materialCategoriesTable.id),
  uom: materialUomEnum("uom").notNull(),
  // Optional — many raw/packing materials are generic and have no single maker.
  manufacturer: text("manufacturer"),
});

export const insertMaterialCategorySchema = createInsertSchema(materialCategoriesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  revisionNumber: true,
});
export type InsertMaterialCategory = z.infer<typeof insertMaterialCategorySchema>;
export type MaterialCategory = typeof materialCategoriesTable.$inferSelect;

export const insertMaterialSchema = createInsertSchema(materialsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  revisionNumber: true,
});
export type InsertMaterial = z.infer<typeof insertMaterialSchema>;
export type Material = typeof materialsTable.$inferSelect;
