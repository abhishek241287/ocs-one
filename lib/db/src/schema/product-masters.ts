import { pgTable, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { createMasterCommonColumns } from "./master-common";

// ─── Unified Product Platform — Category & Workflow masters ───────────────────
// Two orthogonal masters from the frozen UPP v1.0 design. Kept import-free so the
// `products` unit table and `master_products` can both reference them without an
// import cycle.

// A — Product Category master (Battery Pack / Inbuilt Lithium Inverter / Hybrid
// Inverter). Only Battery Pack is exercised in CW-03; the others are seeded as
// reserved data.
export const productCategoriesTable = pgTable("product_categories", {
  ...createMasterCommonColumns("product_categories"),
});

// C — Manufacturing Workflow master. `stageSequence` is DATA (ordered stage
// codes), never an enum — so future workflow codes need no enum migration. CW-03
// seeds BATTERY (active); INBUILT_LITHIUM / HYBRID are reserved data only and are
// NOT wired to any engine (the workflow-driven stage engine is UPP Phase 3).
export const productWorkflowsTable = pgTable("product_workflows", {
  ...createMasterCommonColumns("product_workflows"),
  stageSequence: jsonb("stage_sequence").$type<string[]>().notNull().default([]),
});

export const insertProductCategorySchema = createInsertSchema(productCategoriesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  revisionNumber: true,
});
export type InsertProductCategory = z.infer<typeof insertProductCategorySchema>;
export type ProductCategory = typeof productCategoriesTable.$inferSelect;

export const insertProductWorkflowSchema = createInsertSchema(productWorkflowsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  revisionNumber: true,
});
export type InsertProductWorkflow = z.infer<typeof insertProductWorkflowSchema>;
export type ProductWorkflow = typeof productWorkflowsTable.$inferSelect;
