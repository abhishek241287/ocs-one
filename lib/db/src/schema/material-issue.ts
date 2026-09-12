import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { materialsTable, materialUomEnum } from "./inventory";
import { bomHeadersTable, bomLinesTable } from "./bom";

// ─── Material Issue Note (MIN) — BOM-driven raw-material consumption ───────────
// The MIN is the factory's standard material-issue DOCUMENT (house standard, sibling
// of GRN / Material Transfer): system-numbered MIN-YYYYMMDD-NNNNNN, it records the
// consumption of raw materials against a production order. It consumes NON-CELL BOM
// lines only — cell stock is already consumed via the existing
// MATERIAL_TRANSFER_TO_CELL_PROCESSING path; deducting cells here too would
// double-count. The actual stock movement is the signed append-only
// PRODUCTION_ISSUE / PRODUCTION_ISSUE_REVERSAL ledger rows (inventory_transactions);
// this is the immutable document, not a second ledger.
//
// Locked design decisions (task-8):
//   • R1 — the header SNAPSHOTS the exact BOM header id + revision so every Product
//          permanently records which BOM version built it (propagated at minting).
//   • R2 — each line captures a supplier batch/lot + originating GRN reference for
//          recall traceability (mandatory for traceability_required BOM lines).
//   • R4 — a posted MIN is IMMUTABLE: no edit/delete route ever .update()s it. Any
//          correction is a separate append-only reversal document (one per MIN); an
//          "active" MIN is a posted MIN with no reversal row. Reversal state is
//          DERIVED from the reversal table, never by mutating the header.
//   • R6 — a generic source_type + polymorphic source reference future-proofs the
//          document for Rework / Service / R&D / Scrap / Demo issues. v1 wires only
//          PRODUCTION_ORDER; the other source types are defined but not exercised.

// Generic issue source (R6). CLOSED enum: each value maps to a distinct upstream flow
// (only PRODUCTION_ORDER is wired in v1). Adding a source is an intentional migration +
// handler, keeping the document generic without a redesign.
export const minSourceTypeEnum = pgEnum("min_source_type", [
  "PRODUCTION_ORDER",
  "REWORK_ORDER",
  "SERVICE_ORDER",
  "R_AND_D",
  "SCRAP",
  "DEMO",
]);

// Document lifecycle. A MIN is created POSTED (there is no draft workflow) and stays
// immutable. `reversed` is reserved for future use; v1 DERIVES reversal state from the
// reversal table and NEVER updates a posted header (R4 immutability).
export const minStatusEnum = pgEnum("min_status", ["posted", "reversed"]);

export const materialIssueNotesTable = pgTable(
  "material_issue_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // System-generated, race-safe (MIN-YYYYMMDD-NNNNNN from material_issue_seq). UNIQUE.
    minNumber: varchar("min_number", { length: 32 })
      .unique("material_issue_notes_number_unique")
      .notNull(),
    // R6 — generic source. v1 = PRODUCTION_ORDER.
    sourceType: minSourceTypeEnum("source_type").notNull(),
    // Polymorphic source reference (v1 = mfg_production_orders.id). Intentionally NO DB
    // FK — a single column cannot reference the future set of source tables; the
    // PRODUCTION_ORDER handler validates existence in app code.
    sourceRefId: uuid("source_ref_id").notNull(),
    // R1 — BOM version snapshot. bomHeaderId keeps the FK (BOMs are never deleted);
    // bomRevision is copied so the version is legible even if revisions are renumbered.
    bomHeaderId: uuid("bom_header_id")
      .notNull()
      .references(() => bomHeadersTable.id),
    bomRevision: integer("bom_revision").notNull(),
    status: minStatusEnum("status").notNull().default("posted"),
    // Nullable Phase 0 dimensions preserve the immutable pilot MIN contract.
    reservationId: uuid("reservation_id"),
    warehouseId: uuid("warehouse_id"),
    locationId: uuid("location_id"),
    binId: uuid("bin_id"),
    wipInventoryId: uuid("wip_inventory_id"),
    issuedBy: uuid("issued_by"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("material_issue_notes_source_idx").on(t.sourceType, t.sourceRefId),
    index("material_issue_notes_bom_idx").on(t.bomHeaderId),
  ],
);

// Lines — one row per consumed NON-CELL BOM line. requiredQty is the computed
// requirement (quantity_per × scrap uplift × 1/yield); issuedQty is what was actually
// issued. The supplier batch/lot/GRN triple (R2) is the FIFO-suggested, issuer-confirmed
// source reference; because v1 stock nets by material (not lot-dimensioned), it is a
// traceability reference, not a per-lot balance decrement. The signed PRODUCTION_ISSUE
// ledger row for this line carries sourceLineId = this line's id (stable genealogy join).
export const materialIssueNoteLinesTable = pgTable(
  "material_issue_note_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    minId: uuid("min_id")
      .notNull()
      .references(() => materialIssueNotesTable.id, { onDelete: "cascade" }),
    lineNumber: integer("line_number").notNull(),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materialsTable.id),
    // Which BOM line this consumption fulfills (R1 traceability).
    sourceBomLineId: uuid("source_bom_line_id")
      .notNull()
      .references(() => bomLinesTable.id),
    requiredQty: numeric("required_qty", { precision: 14, scale: 4 }).notNull(),
    issuedQty: numeric("issued_qty", { precision: 14, scale: 3 }).notNull(),
    allocatedQty: numeric("allocated_qty", { precision: 14, scale: 3 }),
    uom: materialUomEnum("uom").notNull(),
    lotId: uuid("lot_id"),
    // R2 — supplier batch/lot + originating GRN reference. Mandatory (route-enforced)
    // for traceability_required lines; captured-when-available otherwise (NULL allowed).
    grnId: uuid("grn_id"),
    grnLineId: uuid("grn_line_id"),
    supplierLotNumber: varchar("supplier_lot_number", { length: 100 }),
    // Governance flags snapshotted from the BOM line at issue (surfaced in alerts).
    isCriticalComponent: boolean("is_critical_component").notNull().default(false),
    traceabilityRequired: boolean("traceability_required").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("material_issue_note_lines_min_idx").on(t.minId),
    index("material_issue_note_lines_material_idx").on(t.materialId),
    index("material_issue_note_lines_bom_line_idx").on(t.sourceBomLineId),
  ],
);

// Reversal document (R4) — one per MIN (min_id UNIQUE), mandatory reason. Restores the
// consumed stock via positive PRODUCTION_ISSUE_REVERSAL ledger rows. Append-only: the
// existence of this row marks the MIN as reversed (derived, never mutating the header).
export const materialIssueReversalsTable = pgTable(
  "material_issue_reversals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    minId: uuid("min_id")
      .notNull()
      .unique("material_issue_reversals_min_unique")
      .references(() => materialIssueNotesTable.id),
    reason: text("reason").notNull(),
    reversedBy: uuid("reversed_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("material_issue_reversals_min_idx").on(t.minId)],
);

export type MaterialIssueNote = typeof materialIssueNotesTable.$inferSelect;
export type InsertMaterialIssueNote = typeof materialIssueNotesTable.$inferInsert;
export type MaterialIssueNoteLine = typeof materialIssueNoteLinesTable.$inferSelect;
export type InsertMaterialIssueNoteLine = typeof materialIssueNoteLinesTable.$inferInsert;
export type MaterialIssueReversal = typeof materialIssueReversalsTable.$inferSelect;
export type InsertMaterialIssueReversal = typeof materialIssueReversalsTable.$inferInsert;
