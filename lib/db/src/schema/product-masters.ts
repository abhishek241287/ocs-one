import { pgTable, pgEnum, jsonb } from "drizzle-orm/pg-core";
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

// Product Creation Trigger — the workflow-driven event at which a finished Product
// is minted (CTO CW-03 Phase 0 refinement). The WORKFLOW decides WHEN a Product is
// created; the Product Platform stays generic across categories. UNLIKE
// `stageSequence` (pure data the engine iterates), each trigger maps to BEHAVIORAL
// dispatch in the creation engine (a distinct completion gate + manufacturing-
// completion timestamp source), so it is a CLOSED enum: adding a trigger is
// intentionally a code change (a new handler) + a migration together, keeping the
// engine's dispatch exhaustive. BATTERY / INBUILT_LITHIUM → QC_PASS; HYBRID →
// INCOMING_INSPECTION_PASS (no manufacturing assembly, no battery genealogy — the
// Product is available immediately after incoming-inspection approval).
export const productCreationTriggerEnum = pgEnum("product_creation_trigger", [
  "QC_PASS",
  "INCOMING_INSPECTION_PASS",
]);

// C — Manufacturing Workflow master. `stageSequence` is DATA (ordered stage
// codes), never an enum — so future workflow codes need no enum migration. CW-03
// seeds BATTERY (active); INBUILT_LITHIUM / HYBRID are reserved data only and are
// NOT wired to any engine (the workflow-driven stage engine is UPP Phase 3).
export const productWorkflowsTable = pgTable("product_workflows", {
  ...createMasterCommonColumns("product_workflows"),
  stageSequence: jsonb("stage_sequence").$type<string[]>().notNull().default([]),
  // Workflow-driven Product creation event (see enum above). Default QC_PASS covers
  // the common manufacturing case; HYBRID overrides to INCOMING_INSPECTION_PASS in
  // the seed. Seed-authoritative in CW-03 (not exposed via the master write API).
  productCreationTrigger: productCreationTriggerEnum("product_creation_trigger")
    .notNull()
    .default("QC_PASS"),
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
