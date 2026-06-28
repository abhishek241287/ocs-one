import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ─── Engineering Correction Framework (ECF) ───────────────────────────────────
// The single, permanent platform ledger for controlled engineering corrections.
// Every module (Cell Grading first; Charging/Testing/QC/Packing/Dispatch/Warranty
// in their own cert waves) records corrections here instead of inventing its own
// correction store. Module-specific tables remain the source of truth for CURRENT
// state; this table is the IMMUTABLE, append-only history — never updated/deleted.
//
// `sequence` is the ENGINEERING VERSION of the entity's record:
//   version 1 = original, version 2 = correction, version 3 = supervisor
//   correction, version 4 = engineering review, … — invaluable for warranty
//   investigations where the full evolution of a measurement must be reconstructed.

// Strongly-typed entity taxonomy (CTO requirement) — never free-text. Future
// analytics and reporting depend on this consistency from day one. Values beyond
// today's needs are reserved now so adding a module later needs no enum migration.
export const ecfEntityTypeEnum = pgEnum("ecf_entity_type", [
  "CELL",
  "BATTERY",
  "PACK",
  "SHIPMENT",
  "QC_RECORD",
  "CHARGING_SESSION",
  "TEST_RESULT",
  "WARRANTY_CASE",
  // Reserved for future modules (unused today, declared to avoid an enum migration).
  "INVERTER",
  "SOLAR_SYSTEM",
  "EV_CHARGER",
  "RAW_MATERIAL",
  "BMS",
  "CABINET",
]);

// "original" = the seq=1 baseline record; "correction" = every subsequent version.
export const ecfCorrectionTypeEnum = pgEnum("ecf_correction_type", [
  "original",
  "correction",
]);

export const engineeringCorrectionsTable = pgTable(
  "engineering_corrections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Human-facing, globally-unique reference (CORR-YYYYMMDD-NNNNNN) used by
    // customer support, warranty, audit, ERP, and reports.
    correctionId: text("correction_id").notNull().unique(),
    entityType: ecfEntityTypeEnum("entity_type").notNull(),
    // Stored as text so any module's id format (uuid, business code, etc.) fits a
    // single generic ledger without a per-module FK.
    entityId: text("entity_id").notNull(),
    // The engineering version of this record (1 = original, then incrementing).
    sequence: integer("sequence").notNull(),
    correctionType: ecfCorrectionTypeEnum("correction_type").notNull(),
    // Null for the original baseline; mandatory for every correction.
    reason: text("reason"),
    // Snapshots of the affected values before/after (null prev for the original).
    previousValue: jsonb("previous_value"),
    newValue: jsonb("new_value").notNull(),
    // Who performed the change (actor) and who approved it (may be the same).
    performedBy: text("performed_by").notNull(),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    // The domain audit event the operation also emitted on its own module timeline.
    auditEventType: text("audit_event_type").notNull(),
    // Optional engineering context — machine serial, test equipment, firmware
    // version, shift, operator station, calibration certificate, ambient temp,
    // etc. Never modelled as columns; the framework stays entity-agnostic.
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_ecf_entity").on(table.entityType, table.entityId),
    index("idx_ecf_created_at").on(table.createdAt),
    // One row per (entityType, entityId, sequence) — concurrent corrections of the
    // same entity cannot collide on a version number.
    uniqueIndex("uq_ecf_entity_seq").on(
      table.entityType,
      table.entityId,
      table.sequence
    ),
  ]
);

export type EngineeringCorrection = typeof engineeringCorrectionsTable.$inferSelect;
export type InsertEngineeringCorrection = typeof engineeringCorrectionsTable.$inferInsert;
