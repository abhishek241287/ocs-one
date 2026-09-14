// ─── Phase 6 — Universal Inventory Capture Framework (Constitution v2) ──────
// Schema proof only. Enforces: typed measurements, deterministic resolution
// (Option-A mappings), lifecycle immutability, provenance, reserved codes.
// No application behavior lives here.

import {
  pgTable,
  pgEnum,
  pgSequence,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  numeric,
  text,
  jsonb,
  index,
  uniqueIndex,
  check,
  foreignKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { materialsTable, materialCategoriesTable, suppliersTable } from "./inventory";

// ─── Enums ───────────────────────────────────────────────────────────────────
export const attributeDataTypeEnum = pgEnum("attribute_data_type", [
  "TEXT",
  "DECIMAL",
  "INTEGER",
  "BOOLEAN",
  "DATE",
  "DATETIME",
  "DROPDOWN", // NUMBER deliberately absent (A8)
]);
export const attributeScopeEnum = pgEnum("attribute_scope", [
  "MATERIAL",
  "LOT",
  "SERIAL",
  "RECEIPT_LINE",
  "OPERATION",
]);
export const attributeLifecycleEnum = pgEnum("attribute_lifecycle", [
  "DRAFT",
  "ACTIVE",
  "RETIRED",
]);
export const trackingModeEnum = pgEnum("tracking_mode", [
  "NONE",
  "LOT",
  "SERIAL",
  "LOT_AND_SERIAL",
]);
export const mappingScopeEnum = pgEnum("mapping_scope", ["MATERIAL", "CATEGORY"]);
export const captureStatusEnum = pgEnum("capture_status", [
  "DRAFT",
  "VALIDATED",
  "CONFIRMED",
  "CANCELLED",
]);
export const captureSourceTypeEnum = pgEnum("capture_source_type", [
  "MANUAL",
  "CSV",
  "SCAN",
  "API",
  "SYSTEM",
]);
export const captureValueOriginEnum = pgEnum("capture_value_origin", [
  "EXPLICIT",
  "DEFAULT",
  "NORMALIZED",
]);
export const captureTargetTypeEnum = pgEnum("capture_target_type", ["GRN_LINE"]); // A3 allowlist; adapters register per type
export const scanItemStateEnum = pgEnum("scan_item_state", [
  "SCANNED",
  "UNKNOWN",
  "RESOLVED",
  "VALIDATED",
  "READY",
  "CONFIRMED",
  "REMOVED",
]);
export const scanSessionStatusEnum = pgEnum("scan_session_status", [
  "DRAFT",
  "READY",
  "CONFIRMED",
  "CANCELLED",
]);
export const scanEntityTypeEnum = pgEnum("scan_entity_type", [
  "material",
  "lot",
  "serial",
  "location",
  "warehouse",
  "document",
]);

// ─── A16: reserved codes — identity/quantity/valuation are NOT attributes ────
const RESERVED_ATTRIBUTE_CODES = [
  "material_id",
  "material_code",
  "lot_id",
  "lot_number",
  "serial_id",
  "serial_number",
  "quantity",
  "warehouse_id",
  "location_id",
  "bin_id",
  "uom",
  "unit_cost",
  "price",
  "value",
  "grn_id",
  "grn_number",
  "document_id",
  "status",
];
const RESERVED_ATTRIBUTE_CODES_SQL = sql.raw(
  RESERVED_ATTRIBUTE_CODES.map((code) => `'${code}'`).join(", "),
);

// ─── Unit registry (A8) ──────────────────────────────────────────────────────
export const unitDefinitionsTable = pgTable("unit_definitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  unitCode: varchar("unit_code", { length: 20 }).unique().notNull(), // e.g. AH, V, A, MM, KG
  dimension: varchar("dimension", { length: 50 }).notNull(), // e.g. ELECTRICAL_CAPACITY
  canonicalUnit: varchar("canonical_unit", { length: 20 }).notNull(), // conversion target
  conversionFactor: numeric("conversion_factor", { precision: 18, scale: 9 })
    .notNull()
    .default("1"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Attribute definitions (A6/A7/A8/A16) ───────────────────────────────────
export const attributeDefinitionsTable = pgTable(
  "attribute_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: varchar("code", { length: 60 }).unique().notNull(), // immutable after first ACTIVE (A7, app-enforced)
    name: varchar("name", { length: 120 }).notNull(), // display name may change
    dataType: attributeDataTypeEnum("data_type").notNull(),
    scope: attributeScopeEnum("scope").notNull().default("RECEIPT_LINE"),
    unitCode: varchar("unit_code", { length: 20 }),
    allowedUnits: jsonb("allowed_units"), // subset of registry acceptable here
    precision: integer("precision"),
    scale: integer("scale"),
    minValue: numeric("min_value", { precision: 18, scale: 6 }),
    maxValue: numeric("max_value", { precision: 18, scale: 6 }),
    allowedValues: jsonb("allowed_values"), // DROPDOWN set (canonical stored forms)
    regex: varchar("regex", { length: 255 }),
    maxLength: integer("max_length"),
    requiredDefault: boolean("required_default").notNull().default(false),
    description: text("description"),
    status: attributeLifecycleEnum("status").notNull().default("DRAFT"),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid("updated_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.unitCode],
      foreignColumns: [unitDefinitionsTable.unitCode],
      name: "attribute_definitions_unit_code_fk",
    }),
    check(
      "attribute_definitions_reserved_codes",
      sql`${t.code} NOT IN (${RESERVED_ATTRIBUTE_CODES_SQL})`,
    ),
    index("attribute_definitions_status_idx").on(t.status),
  ],
);

// ─── Templates + effective-dated versions (A5/A6) ───────────────────────────
export const attributeTemplatesTable = pgTable("attribute_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: varchar("code", { length: 60 }).unique().notNull(), // immutable after first ACTIVE (A7)
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  status: attributeLifecycleEnum("status").notNull().default("DRAFT"),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const attributeTemplateVersionsTable = pgTable(
  "attribute_template_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id").notNull(),
    versionNo: integer("version_no").notNull(),
    status: attributeLifecycleEnum("status").notNull().default("DRAFT"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }), // NULL = open-ended
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.templateId],
      foreignColumns: [attributeTemplatesTable.id],
      name: "attribute_template_versions_template_fk",
    }),
    uniqueIndex("template_versions_unique_no").on(t.templateId, t.versionNo),
    index("template_versions_resolution_idx").on(
      t.templateId,
      t.status,
      t.effectiveFrom,
      t.effectiveTo,
    ),
  ],
);

export const attributeTemplateAttributesTable = pgTable(
  "attribute_template_attributes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateVersionId: uuid("template_version_id").notNull(),
    attributeId: uuid("attribute_id").notNull(),
    required: boolean("required").notNull().default(false),
    sequence: integer("sequence").notNull().default(0),
    defaultValue: text("default_value"), // A: default ≠ captured fact (value_origin)
    allowedValuesOverride: jsonb("allowed_values_override"),
    unitOverride: varchar("unit_override", { length: 20 }),
    validationOverride: jsonb("validation_override"), // future conditional rules extension point
  },
  (t) => [
    foreignKey({
      columns: [t.templateVersionId],
      foreignColumns: [attributeTemplateVersionsTable.id],
      name: "attribute_template_attributes_version_fk",
    }),
    foreignKey({
      columns: [t.attributeId],
      foreignColumns: [attributeDefinitionsTable.id],
      name: "attribute_template_attributes_attribute_fk",
    }),
    uniqueIndex("template_attributes_unique").on(t.templateVersionId, t.attributeId),
    index("template_attributes_order_idx").on(t.templateVersionId, t.sequence),
  ],
);

// ─── Option-A mappings (A6) — partial uniques enforce exactly-one-effective ─
export const materialTemplateMappingsTable = pgTable(
  "material_template_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: mappingScopeEnum("scope").notNull(),
    materialId: uuid("material_id"),
    categoryId: uuid("category_id"),
    templateId: uuid("template_id").notNull(),
    status: attributeLifecycleEnum("status").notNull().default("ACTIVE"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true })
      .notNull()
      .defaultNow(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.materialId],
      foreignColumns: [materialsTable.id],
      name: "material_template_mappings_material_fk",
    }),
    foreignKey({
      columns: [t.categoryId],
      foreignColumns: [materialCategoriesTable.id],
      name: "material_template_mappings_category_fk",
    }),
    foreignKey({
      columns: [t.templateId],
      foreignColumns: [attributeTemplatesTable.id],
      name: "material_template_mappings_template_fk",
    }),
    check(
      "mapping_scope_shape",
      sql`((${t.scope} = 'MATERIAL' AND ${t.materialId} IS NOT NULL AND ${t.categoryId} IS NULL)
       OR (${t.scope} = 'CATEGORY' AND ${t.categoryId} IS NOT NULL AND ${t.materialId} IS NULL))`,
    ),
    uniqueIndex("one_active_material_mapping")
      .on(t.materialId)
      .where(sql`${t.scope} = 'MATERIAL' AND ${t.status} = 'ACTIVE'`),
    uniqueIndex("one_active_category_mapping")
      .on(t.categoryId)
      .where(sql`${t.scope} = 'CATEGORY' AND ${t.status} = 'ACTIVE'`),
  ],
);

// ─── Tracking profiles (A12) ─────────────────────────────────────────────────
export const materialInventoryProfilesTable = pgTable("material_inventory_profiles", {
  materialId: uuid("material_id")
    .primaryKey(),
  trackingMode: trackingModeEnum("tracking_mode").notNull().default("NONE"),
  updatedBy: uuid("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({
    columns: [t.materialId],
    foreignColumns: [materialsTable.id],
    name: "material_inventory_profiles_material_fk",
  }),
]);

// ─── Capture instances + typed values (A1/A3/A9/A11/A13) ────────────────────
export const attributeCaptureInstancesTable = pgTable(
  "attribute_capture_instances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    targetType: captureTargetTypeEnum("target_type").notNull(), // A3 allowlist; adapter registry validates
    targetId: uuid("target_id").notNull(), // polymorphic; GRN line id in Phase 6
    templateVersionId: uuid("template_version_id").notNull(), // pinned at session creation (A11)
    materialId: uuid("material_id").notNull(),
    status: captureStatusEnum("status").notNull().default("DRAFT"),
    sourceType: captureSourceTypeEnum("source_type").notNull(), // A13 provenance, immutable from VALIDATED
    sourceSessionId: uuid("source_session_id"),
    sourceRowRef: varchar("source_row_ref", { length: 60 }),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.templateVersionId],
      foreignColumns: [attributeTemplateVersionsTable.id],
      name: "attribute_capture_instances_version_fk",
    }),
    foreignKey({
      columns: [t.materialId],
      foreignColumns: [materialsTable.id],
      name: "attribute_capture_instances_material_fk",
    }),
    index("capture_instances_target_idx").on(t.targetType, t.targetId),
    index("capture_instances_status_idx").on(t.status),
  ],
);

export const attributeCaptureValuesTable = pgTable(
  "attribute_capture_values",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    captureInstanceId: uuid("capture_instance_id").notNull(),
    attributeId: uuid("attribute_id").notNull(),
    valueText: text("value_text"),
    valueNum: numeric("value_num", { precision: 18, scale: 6 }),
    valueBool: boolean("value_bool"),
    valueDate: timestamp("value_date", { withTimezone: true }),
    unit: varchar("unit", { length: 20 }), // canonical unit post-normalization (A8)
    valueOrigin: captureValueOriginEnum("value_origin")
      .notNull()
      .default("EXPLICIT"),
    displayCache: jsonb("display_cache"), // derived only, never authoritative
  },
  (t) => [
    foreignKey({
      columns: [t.captureInstanceId],
      foreignColumns: [attributeCaptureInstancesTable.id],
      name: "attribute_capture_values_instance_fk",
    }),
    foreignKey({
      columns: [t.attributeId],
      foreignColumns: [attributeDefinitionsTable.id],
      name: "attribute_capture_values_attribute_fk",
    }),
    uniqueIndex("capture_values_unique").on(t.captureInstanceId, t.attributeId),
    index("capture_values_attr_num_idx").on(t.attributeId, t.valueNum),
    index("capture_values_attr_text_idx").on(t.attributeId, t.valueText),
  ],
);

// ─── Universal CSV import staging (71-E, A9/A10/A11/A14/A16) ────────────────
export const importSessionStatusEnum = pgEnum("import_session_status", [
  "DRAFT",
  "VALIDATED",
  "CONFIRMED",
  "CANCELLED",
]);
export const importRowStatusEnum = pgEnum("import_row_status", [
  "PENDING",
  "VALID",
  "INVALID",
]);

export const importNumberSequence = pgSequence("import_seq");

export const importSessionsTable = pgTable(
  "import_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importNumber: varchar("import_number", { length: 50 }).unique().notNull(),
    fileHash: varchar("file_hash", { length: 64 }).notNull(),
    filename: varchar("filename", { length: 255 }),
    templateVersionId: uuid("template_version_id")
      .notNull()
      .references(() => attributeTemplateVersionsTable.id),
    status: importSessionStatusEnum("status").notNull().default("DRAFT"),
    totalRows: integer("total_rows").notNull().default(0),
    validRows: integer("valid_rows").notNull().default(0),
    invalidRows: integer("invalid_rows").notNull().default(0),
    confirmKey: varchar("confirm_key", { length: 100 }).unique(),
    downstreamDocumentId: uuid("downstream_document_id"),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("import_sessions_status_idx").on(t.status),
    index("import_sessions_file_hash_idx").on(t.fileHash),
  ],
);

export const importRowsTable = pgTable(
  "import_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importSessionId: uuid("import_session_id")
      .notNull()
      .references(() => importSessionsTable.id, { onDelete: "cascade" }),
    rowNumber: integer("row_number").notNull(),
    raw: jsonb("raw").notNull(),
    canonical: jsonb("canonical"),
    status: importRowStatusEnum("status").notNull().default("PENDING"),
    errors: jsonb("errors"),
    grnLineId: uuid("grn_line_id"),
  },
  (t) => [
    uniqueIndex("import_rows_session_row_unique").on(t.importSessionId, t.rowNumber),
    index("import_rows_session_status_idx").on(t.importSessionId, t.status),
  ],
);

export type AttributeDefinition = typeof attributeDefinitionsTable.$inferSelect;
export type UnitDefinition = typeof unitDefinitionsTable.$inferSelect;
export type AttributeTemplate = typeof attributeTemplatesTable.$inferSelect;
export type AttributeTemplateVersion = typeof attributeTemplateVersionsTable.$inferSelect;
export type MaterialTemplateMapping = typeof materialTemplateMappingsTable.$inferSelect;
export type MaterialInventoryProfile = typeof materialInventoryProfilesTable.$inferSelect;
export type AttributeCaptureInstance = typeof attributeCaptureInstancesTable.$inferSelect;
export type AttributeCaptureValue = typeof attributeCaptureValuesTable.$inferSelect;
export type ImportSession = typeof importSessionsTable.$inferSelect;
export type ImportRow = typeof importRowsTable.$inferSelect;

// ─── Universal scan sessions (71-F, D-attr-5/A9-A12) ─────────────────────────
export const scanNumberSequence = pgSequence("scan_seq");

export const scanSessionsTable = pgTable(
  "scan_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionNumber: varchar("session_number", { length: 50 }).unique().notNull(),
    status: scanSessionStatusEnum("status").notNull().default("DRAFT"),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliersTable.id),
    templateVersionId: uuid("template_version_id").references(
      () => attributeTemplateVersionsTable.id,
    ),
    totalItems: integer("total_items").notNull().default(0),
    readyItems: integer("ready_items").notNull().default(0),
    unknownItems: integer("unknown_items").notNull().default(0),
    duplicateItems: integer("duplicate_items").notNull().default(0),
    removedItems: integer("removed_items").notNull().default(0),
    confirmKey: varchar("confirm_key", { length: 100 }).unique(),
    downstreamDocumentId: uuid("downstream_document_id"),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid("updated_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (t) => [
    index("scan_sessions_status_idx").on(t.status),
    index("scan_sessions_supplier_idx").on(t.supplierId),
  ],
);

export const scanItemsTable = pgTable(
  "scan_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => scanSessionsTable.id, { onDelete: "cascade" }),
    itemNumber: integer("item_number").notNull(),
    payloadRaw: text("payload_raw").notNull(),
    entityType: scanEntityTypeEnum("entity_type"),
    entityId: uuid("entity_id"),
    state: scanItemStateEnum("state").notNull().default("SCANNED"),
    materialId: uuid("material_id").references(() => materialsTable.id),
    lotNumber: varchar("lot_number", { length: 100 }),
    serialNumber: varchar("serial_number", { length: 100 }),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull().default("1"),
    duplicateScanCount: integer("duplicate_scan_count").notNull().default(0),
    attributes: jsonb("attributes").notNull().default([]),
    canonical: jsonb("canonical"),
    errors: jsonb("errors"),
    grnLineId: uuid("grn_line_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("scan_items_session_item_unique").on(t.sessionId, t.itemNumber),
    index("scan_items_session_state_idx").on(t.sessionId, t.state),
    index("scan_items_material_lot_idx").on(t.materialId, t.lotNumber),
    index("scan_items_material_serial_idx").on(t.materialId, t.serialNumber),
  ],
);

export type ScanSession = typeof scanSessionsTable.$inferSelect;
export type ScanItem = typeof scanItemsTable.$inferSelect;