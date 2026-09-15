import {
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  grnLineItemsTable,
  grnReceiptCostStatusEnum,
  inventoryTransactionsTable,
  materialUomEnum,
  materialsTable,
  valuationPolicyEnum,
} from "./inventory";

// ─── Phase 10 / 74-B valuation evidence ───────────────────────────────────────
//
// Quantity remains authoritative in inventory_transactions. These tables are the
// value twin only: receipt layers are created from GRN-line evidence, and depletion
// rows cite the exact signed movement that consumed them. No valuation code writes
// inventory_transactions.

export const valuationValueStatusEnum = pgEnum("valuation_value_status", [
  "CAPTURED",
  "UNKNOWN",
]);

export const valuationLayersTable = pgTable(
  "valuation_layers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    grnLineId: uuid("grn_line_id")
      .notNull()
      .unique("valuation_layers_grn_line_unique")
      .references(() => grnLineItemsTable.id),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materialsTable.id),
    receiptQuantity: numeric("receipt_quantity", { precision: 14, scale: 3 }).notNull(),
    remainingQuantity: numeric("remaining_quantity", {
      precision: 14,
      scale: 3,
    }).notNull(),
    uom: materialUomEnum("uom").notNull(),
    receiptUnitCost: numeric("receipt_unit_cost", { precision: 14, scale: 4 }),
    receiptCurrency: varchar("receipt_currency", { length: 3 }),
    receiptCostStatus: grnReceiptCostStatusEnum("receipt_cost_status").notNull(),
    policy: valuationPolicyEnum("policy").notNull(),
    receiptMovementId: uuid("receipt_movement_id")
      .notNull()
      .unique("valuation_layers_receipt_movement_unique")
      .references(() => inventoryTransactionsTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("valuation_layers_material_created_idx").on(table.materialId, table.createdAt),
    check("valuation_layers_receipt_positive", sql`${table.receiptQuantity} > 0`),
    check("valuation_layers_remaining_nonnegative", sql`${table.remainingQuantity} >= 0`),
    check(
      "valuation_layers_remaining_lte_receipt",
      sql`${table.remainingQuantity} <= ${table.receiptQuantity}`,
    ),
    check(
      "valuation_layers_cost_shape",
      sql`(${table.receiptCostStatus} = 'CAPTURED' AND ${table.receiptUnitCost} IS NOT NULL AND ${table.receiptCurrency} IS NOT NULL)
        OR (${table.receiptCostStatus} IN ('MISSING', 'LEGACY') AND ${table.receiptUnitCost} IS NULL)`,
    ),
  ],
);

export const valuationDepletionsTable = pgTable(
  "valuation_depletions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    valuationLayerId: uuid("valuation_layer_id")
      .notNull()
      .references(() => valuationLayersTable.id),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materialsTable.id),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    allocationIndex: integer("allocation_index").notNull().default(0),
    valueStatus: valuationValueStatusEnum("value_status").notNull(),
    unitCost: numeric("unit_cost", { precision: 14, scale: 4 }),
    valueAmount: numeric("value_amount", { precision: 20, scale: 7 }),
    currency: varchar("currency", { length: 3 }),
    policy: valuationPolicyEnum("policy").notNull(),
    movementId: uuid("movement_id")
      .notNull()
      .references(() => inventoryTransactionsTable.id),
    sourceDocumentType: varchar("source_document_type", { length: 32 }).notNull(),
    sourceDocumentId: uuid("source_document_id").notNull(),
    sourceLineId: uuid("source_line_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("valuation_depletions_layer_idx").on(table.valuationLayerId),
    index("valuation_depletions_movement_idx").on(table.movementId),
    index("valuation_depletions_source_doc_idx").on(
      table.sourceDocumentType,
      table.sourceDocumentId,
    ),
    check("valuation_depletions_quantity_nonzero", sql`${table.quantity} <> 0`),
    check(
      "valuation_depletions_value_shape",
      sql`(${table.valueStatus} = 'CAPTURED' AND ${table.unitCost} IS NOT NULL AND ${table.valueAmount} IS NOT NULL AND ${table.currency} IS NOT NULL)
        OR (${table.valueStatus} = 'UNKNOWN' AND ${table.unitCost} IS NULL AND ${table.valueAmount} IS NULL AND ${table.currency} IS NULL)`,
    ),
  ],
);

export type ValuationLayer = typeof valuationLayersTable.$inferSelect;
export type ValuationDepletion = typeof valuationDepletionsTable.$inferSelect;