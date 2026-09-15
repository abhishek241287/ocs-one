import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import {
  type Transaction,
  grnHeadersTable,
  grnLineItemsTable,
  inventoryTransactionsTable,
  materialCategoriesTable,
  materialsTable,
  valuationDepletionsTable,
  valuationLayersTable,
} from "@workspace/db";

const QUANTITY_SCALE = 1000;
const VALUE_SCALE = 10_000_000;
const EPSILON = 1e-9;

type ValuationPolicy = "FIFO" | "WAVG";
type ReceiptCostStatus = "CAPTURED" | "MISSING" | "LEGACY";

export type ValuationMovement = {
  movementId: string;
  materialId: string;
  sourceDocumentType: string;
  sourceDocumentId: string;
  sourceLineId: string | null;
  preferredGrnLineId?: string | null;
};

type LayerRow = typeof valuationLayersTable.$inferSelect;

function toMilli(value: string | number): number {
  const scaled = Number(value) * QUANTITY_SCALE;
  if (!Number.isFinite(scaled)) throw new Error("invalid_valuation_quantity");
  return Math.round(scaled);
}

function fromMilli(value: number): string {
  return (value / QUANTITY_SCALE).toFixed(3);
}

function roundValue(value: number): string {
  if (!Number.isFinite(value)) throw new Error("invalid_valuation_value");
  return value.toFixed(7);
}

function valueFor(quantityMilli: number, unitCost: string): string {
  return roundValue((quantityMilli / QUANTITY_SCALE) * Number(unitCost));
}

function assertPositiveQuantity(quantity: string | number): number {
  const milli = toMilli(quantity);
  if (milli <= 0) throw new Error("valuation_quantity_must_be_positive");
  return milli;
}

async function policyForMaterial(
  tx: Transaction,
  materialId: string,
): Promise<ValuationPolicy> {
  const [row] = await tx
    .select({ policy: materialCategoriesTable.valuationPolicy })
    .from(materialsTable)
    .innerJoin(
      materialCategoriesTable,
      eq(materialCategoriesTable.id, materialsTable.categoryId),
    )
    .where(eq(materialsTable.id, materialId))
    .limit(1);
  if (!row) throw new Error(`valuation_material_not_found:${materialId}`);
  return row.policy;
}

/**
 * Legacy GRN rows predate 74-A and therefore have no valuation layer. Material
 * outbound paths call this under their existing transaction so legacy inventory
 * becomes an explicit LEGACY layer before it can be depleted.
 */
async function ensureLayersForMaterial(
  tx: Transaction,
  materialId: string,
): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`valuation-material:${materialId}`}))`,
  );

  const policy = await policyForMaterial(tx, materialId);
  const rows = await tx
    .select({
      grnLineId: grnLineItemsTable.id,
      materialId: grnLineItemsTable.materialId,
      quantity: inventoryTransactionsTable.quantity,
      uom: inventoryTransactionsTable.uom,
      movementId: inventoryTransactionsTable.id,
      receiptUnitCost: grnLineItemsTable.receiptUnitCost,
      receiptCurrency: grnLineItemsTable.receiptCurrency,
      receiptCostStatus: grnLineItemsTable.receiptCostStatus,
    })
    .from(grnLineItemsTable)
    .innerJoin(
      grnHeadersTable,
      and(
        eq(grnHeadersTable.id, grnLineItemsTable.grnId),
        eq(grnHeadersTable.status, "posted"),
      ),
    )
    .innerJoin(
      inventoryTransactionsTable,
      and(
        eq(inventoryTransactionsTable.sourceLineId, grnLineItemsTable.id),
        eq(inventoryTransactionsTable.transactionType, "GRN_RECEIPT"),
        gt(inventoryTransactionsTable.quantity, "0"),
      ),
    )
    .leftJoin(
      valuationLayersTable,
      eq(valuationLayersTable.grnLineId, grnLineItemsTable.id),
    )
    .where(
      and(
        eq(grnLineItemsTable.materialId, materialId),
        isNull(valuationLayersTable.id),
      ),
    )
    .orderBy(asc(inventoryTransactionsTable.createdAt), asc(grnLineItemsTable.id));

  for (const row of rows) {
    await tx
      .insert(valuationLayersTable)
      .values({
        grnLineId: row.grnLineId,
        materialId: row.materialId,
        receiptQuantity: row.quantity,
        remainingQuantity: row.quantity,
        uom: row.uom,
        receiptUnitCost: row.receiptUnitCost,
        receiptCurrency: row.receiptCurrency,
        receiptCostStatus: row.receiptCostStatus as ReceiptCostStatus,
        policy,
        receiptMovementId: row.movementId,
      })
      .onConflictDoNothing({ target: valuationLayersTable.grnLineId });
  }
}

/**
 * Create the 74-A value twin for a committed GRN_RECEIPT movement. This helper
 * is called in the same transaction as the signed quantity movement.
 */
export async function recordReceiptLayer(
  tx: Transaction,
  args: {
    grnLineId: string;
    movementId: string;
    materialId: string;
    quantity: string;
    uom: string;
  },
): Promise<void> {
  const policy = await policyForMaterial(tx, args.materialId);
  const [line] = await tx
    .select({
      receiptUnitCost: grnLineItemsTable.receiptUnitCost,
      receiptCurrency: grnLineItemsTable.receiptCurrency,
      receiptCostStatus: grnLineItemsTable.receiptCostStatus,
    })
    .from(grnLineItemsTable)
    .where(eq(grnLineItemsTable.id, args.grnLineId))
    .limit(1);
  if (!line) throw new Error(`valuation_grn_line_not_found:${args.grnLineId}`);

  await tx
    .insert(valuationLayersTable)
    .values({
      grnLineId: args.grnLineId,
      materialId: args.materialId,
      receiptQuantity: args.quantity,
      remainingQuantity: args.quantity,
      uom: args.uom as any,
      receiptUnitCost: line.receiptUnitCost,
      receiptCurrency: line.receiptCurrency,
      receiptCostStatus: line.receiptCostStatus as ReceiptCostStatus,
      policy,
      receiptMovementId: args.movementId,
    })
    .onConflictDoNothing({ target: valuationLayersTable.grnLineId });
}

type Allocation = { layer: LayerRow; quantityMilli: number };

function fifoAllocations(layers: LayerRow[], requestedMilli: number): Allocation[] {
  const allocations: Allocation[] = [];
  let remaining = requestedMilli;
  for (const layer of layers) {
    if (remaining <= 0) break;
    const available = toMilli(layer.remainingQuantity);
    const take = Math.min(remaining, available);
    if (take > 0) allocations.push({ layer, quantityMilli: take });
    remaining -= take;
  }
  return allocations;
}

function weightedAllocations(layers: LayerRow[], requestedMilli: number): Allocation[] {
  const totalMilli = layers.reduce(
    (sum, layer) => sum + toMilli(layer.remainingQuantity),
    0,
  );
  if (totalMilli <= 0) return [];

  const allocations = layers.map((layer) => ({
    layer,
    quantityMilli: Math.min(
      toMilli(layer.remainingQuantity),
      Math.floor((requestedMilli * toMilli(layer.remainingQuantity)) / totalMilli),
    ),
  }));
  let remainder =
    requestedMilli - allocations.reduce((sum, item) => sum + item.quantityMilli, 0);
  for (const allocation of allocations) {
    if (remainder <= 0) break;
    const capacity = toMilli(allocation.layer.remainingQuantity) - allocation.quantityMilli;
    const extra = Math.min(remainder, capacity);
    allocation.quantityMilli += extra;
    remainder -= extra;
  }
  return allocations.filter((allocation) => allocation.quantityMilli > 0);
}

async function lockLayers(
  tx: Transaction,
  materialId: string,
  preferredGrnLineId?: string | null,
): Promise<LayerRow[]> {
  const predicates = [
    eq(valuationLayersTable.materialId, materialId),
    gt(valuationLayersTable.remainingQuantity, "0"),
  ];
  if (preferredGrnLineId) {
    predicates.push(eq(valuationLayersTable.grnLineId, preferredGrnLineId));
  }
  return tx
    .select()
    .from(valuationLayersTable)
    .where(and(...predicates))
    .orderBy(asc(valuationLayersTable.createdAt), asc(valuationLayersTable.id))
    .for("update");
}

/**
 * Consume value from receipt layers for an already-created negative quantity
 * movement. The signed movement row is the event citation; this function only
 * updates valuation layers and appends valuation_depletions.
 */
export async function depleteValuationForMovement(
  tx: Transaction,
  args: ValuationMovement & { quantity: string | number },
): Promise<void> {
  const requestedMilli = assertPositiveQuantity(args.quantity);
  await ensureLayersForMaterial(tx, args.materialId);
  const policy = await policyForMaterial(tx, args.materialId);
  const layers = await lockLayers(tx, args.materialId, args.preferredGrnLineId);
  const availableMilli = layers.reduce(
    (sum, layer) => sum + toMilli(layer.remainingQuantity),
    0,
  );
  if (availableMilli + EPSILON < requestedMilli) {
    throw new Error(
      `valuation_insufficient_layers:${args.materialId}:need=${fromMilli(requestedMilli)}:available=${fromMilli(availableMilli)}`,
    );
  }

  const allocations =
    policy === "FIFO"
      ? fifoAllocations(layers, requestedMilli)
      : weightedAllocations(layers, requestedMilli);
  const allocatedMilli = allocations.reduce(
    (sum, allocation) => sum + allocation.quantityMilli,
    0,
  );
  if (allocatedMilli !== requestedMilli) {
    throw new Error("valuation_allocation_mismatch");
  }

  for (const allocation of allocations) {
    const layer = allocation.layer;
    const captured =
      layer.receiptCostStatus === "CAPTURED" &&
      layer.receiptUnitCost != null &&
      layer.receiptCurrency != null;
    await tx
      .update(valuationLayersTable)
      .set({
        remainingQuantity: fromMilli(
          toMilli(layer.remainingQuantity) - allocation.quantityMilli,
        ),
      })
      .where(eq(valuationLayersTable.id, layer.id));

    await tx.insert(valuationDepletionsTable).values({
      valuationLayerId: layer.id,
      materialId: args.materialId,
      quantity: fromMilli(-allocation.quantityMilli),
      allocationIndex: allocations.indexOf(allocation),
      valueStatus: captured ? "CAPTURED" : "UNKNOWN",
      unitCost: captured ? layer.receiptUnitCost : null,
      valueAmount: captured
        ? `-${valueFor(allocation.quantityMilli, layer.receiptUnitCost!)}`
        : null,
      currency: captured ? layer.receiptCurrency : null,
      policy,
      movementId: args.movementId,
      sourceDocumentType: args.sourceDocumentType,
      sourceDocumentId: args.sourceDocumentId,
      sourceLineId: args.sourceLineId,
    });
  }
}

/**
 * Restore the exact layers cited by an earlier movement, used by transactional
 * reversal writers. Restorations are positive depletion entries, keeping the
 * conservation equation append-only and preserving the original document chain.
 */
export async function restoreValuationForMovement(
  tx: Transaction,
  args: ValuationMovement & {
    reversedMovementId: string;
    originalMovementId: string;
    quantity?: string | number;
  },
): Promise<void> {
  const original = await tx
    .select()
    .from(valuationDepletionsTable)
    .where(eq(valuationDepletionsTable.movementId, args.originalMovementId))
    .orderBy(
      asc(valuationDepletionsTable.allocationIndex),
      asc(valuationDepletionsTable.createdAt),
      asc(valuationDepletionsTable.id),
    );
  if (original.length === 0) return;

  let remainingToRestore =
    args.quantity == null
      ? original.reduce((sum, depletion) => sum + toMilli(depletion.quantity) * -1, 0)
      : assertPositiveQuantity(args.quantity);

  for (const depletion of original) {
    if (remainingToRestore <= 0) break;
    const originalQuantityMilli = toMilli(depletion.quantity) * -1;
    const quantityMilli = Math.min(remainingToRestore, originalQuantityMilli);
    const [layer] = await tx
      .select()
      .from(valuationLayersTable)
      .where(eq(valuationLayersTable.id, depletion.valuationLayerId))
      .for("update")
      .limit(1);
    if (!layer) throw new Error(`valuation_layer_not_found:${depletion.valuationLayerId}`);

    await tx
      .update(valuationLayersTable)
      .set({
        remainingQuantity: fromMilli(
          toMilli(layer.remainingQuantity) + quantityMilli,
        ),
      })
      .where(eq(valuationLayersTable.id, layer.id));

    const captured = depletion.valueStatus === "CAPTURED";
    await tx.insert(valuationDepletionsTable).values({
      valuationLayerId: layer.id,
      materialId: args.materialId,
      quantity: fromMilli(quantityMilli),
      allocationIndex: depletion.allocationIndex,
      valueStatus: captured ? "CAPTURED" : "UNKNOWN",
      unitCost: captured ? depletion.unitCost : null,
      valueAmount: captured
        ? args.quantity == null && quantityMilli === originalQuantityMilli && depletion.valueAmount
          ? (-Number(depletion.valueAmount)).toFixed(7)
          : valueFor(quantityMilli, depletion.unitCost!)
        : null,
      currency: captured ? depletion.currency : null,
      policy: depletion.policy,
      movementId: args.reversedMovementId,
      sourceDocumentType: args.sourceDocumentType,
      sourceDocumentId: args.sourceDocumentId,
      sourceLineId: args.sourceLineId,
    });
    remainingToRestore -= quantityMilli;
  }
  if (remainingToRestore > 0) {
    throw new Error(
      `valuation_restore_exceeds_original:${args.originalMovementId}:need=${fromMilli(remainingToRestore)}`,
    );
  }
}