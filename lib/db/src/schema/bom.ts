import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  date,
  timestamp,
  integer,
  numeric,
  boolean,
  unique,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { masterProductsTable } from "./master-products";
import { materialsTable } from "./inventory";

// ─── Bill of Materials (MES Phase 1 — BOM Master) ─────────────────────────────
// Additive MES module. A BOM is owned by a Model (master_products) and versioned
// by revision: every revision persists (draft → approved → obsolete), and a
// manufacturing order permanently references the exact revision it was built with
// (order snapshot lands in a later phase). A BOM is NEVER overwritten — a new
// revision is created instead, so historical genealogy stays reconstructable.
//
// The header carries the costing inputs now (yield %, effective dates) and each
// line carries its own (quantity per, scrap %, alternate part) so material
// planning/costing needs no later redesign. Governance flags per line:
//   • is_critical_component  — safety/warranty-critical; surfaced in shortage/
//                              variance/QC alerts.
//   • traceability_required  — serial/lot capture is MANDATORY at consume for
//                              this line (enforced by the consumption phase).

export const bomStatusEnum = pgEnum("bom_status", ["draft", "approved", "obsolete"]);

// Header — one row per (model, revision). Immutable once approved (edits after
// approval require a new revision, not an in-place update).
export const bomHeadersTable = pgTable(
  "bom_headers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // System-generated, race-safe (BOM-YYYYMMDD-NNNNNN from bom_seq). UNIQUE.
    bomNumber: varchar("bom_number", { length: 50 }).notNull().unique(),
    // The Model/SKU this BOM builds (master_products = model master, never serialized).
    modelId: uuid("model_id")
      .notNull()
      .references(() => masterProductsTable.id),
    // Engineering revision. Revision 1 = original; every revision persists.
    revision: integer("revision").notNull().default(1),
    status: bomStatusEnum("status").notNull().default("draft"),
    name: varchar("name", { length: 255 }),
    // Costing input — expected process yield (%). Required qty scales by 1/yield.
    yieldPercent: numeric("yield_percent", { precision: 5, scale: 2 })
      .notNull()
      .default("100"),
    // Costing input — the window this revision is valid for (both optional).
    effectiveFrom: date("effective_from"),
    effectiveTo: date("effective_to"),
    notes: text("notes"),
    createdBy: varchar("created_by", { length: 255 }),
    approvedBy: varchar("approved_by", { length: 255 }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // A model cannot have two BOMs at the same revision number.
    unique("uq_bom_model_revision").on(table.modelId, table.revision),
    index("idx_bom_headers_model").on(table.modelId),
    index("idx_bom_headers_status").on(table.status),
  ]
);

// Lines — the components consumed to build one unit of the model.
export const bomLinesTable = pgTable(
  "bom_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bomId: uuid("bom_id")
      .notNull()
      .references(() => bomHeadersTable.id, { onDelete: "cascade" }),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materialsTable.id),
    // Display / consumption order within the BOM.
    position: integer("position").notNull().default(0),
    // Quantity of this material per one finished unit.
    quantityPer: numeric("quantity_per", { precision: 14, scale: 4 }).notNull(),
    // Snapshot of the material's UoM at line creation (== master_materials.uom).
    uom: varchar("uom", { length: 20 }).notNull(),
    // Costing input — expected scrap/waste (%) added on top of quantity_per.
    scrapPercent: numeric("scrap_percent", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    // Governance flags (CTO Build-Mode refinement).
    isCriticalComponent: boolean("is_critical_component").notNull().default(false),
    traceabilityRequired: boolean("traceability_required").notNull().default(false),
    // An optional line is not required to fully build the unit.
    isOptional: boolean("is_optional").notNull().default(false),
    // Alternate part — points at the primary line it can substitute (NULL = primary).
    alternateOfLineId: uuid("alternate_of_line_id").references(
      (): AnyPgColumn => bomLinesTable.id,
      { onDelete: "cascade" }
    ),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_bom_lines_bom").on(table.bomId),
    index("idx_bom_lines_material").on(table.materialId),
  ]
);

export type BomHeader = typeof bomHeadersTable.$inferSelect;
export type InsertBomHeader = typeof bomHeadersTable.$inferInsert;
export type BomLine = typeof bomLinesTable.$inferSelect;
export type InsertBomLine = typeof bomLinesTable.$inferInsert;
