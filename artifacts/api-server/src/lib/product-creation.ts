import { eq, and, sql } from "drizzle-orm";
import {
  type Transaction,
  productsTable,
  productGenealogyTable,
  productEventsTable,
  productCategoriesTable,
  mfgProductionOrdersTable,
  mfgOrderStagesTable,
  mfgBatteryGenealogyTable,
} from "@workspace/db";

// ─── Unified Product Platform — generic Product creation engine ───────────────
// The single creation path for serialized Products. Used by BOTH the QC-PASS emit
// hook and the idempotent backfill so the rules live in exactly one place.
//
// Locked CW-03 decisions encoded here:
//   • DP-1 — at creation, COPY the manufacturing genealogy into product_genealogy
//            so the Product OWNS its lineage (downstream reads from the Product).
//   • DP-2 — official_product_serial REUSES the order's battery_number (no 2nd serial).
//   • DP-3 — NO ECF baseline at creation: Product creation is a Manufacturing event,
//            recorded on the append-only product_events timeline, not an Engineering
//            Correction. ECF is reserved for future Product *corrections*.
//
// Kept GENERIC over category/workflow so Inbuilt Lithium / Hybrid inverters plug in
// later by extending `classifyOrderProduct` — the creation engine itself is unchanged.

export type ProductClassification = {
  categoryCode: string;
  workflowCode: string;
  serialSource: "OCS" | "MANUFACTURER";
};

type OrderForClassification = {
  id: string;
  batteryNumber: string;
  modelId: string | null;
};

/**
 * Resolve which Category / Workflow / serial provenance a finished order maps to.
 * CW-03: every production order is a Battery Pack (BATTERY workflow, OCS serial).
 * Future inverter workflows add cases here (derived from order/model attributes)
 * WITHOUT changing `createProductFromOrder`.
 */
export function classifyOrderProduct(
  _order: OrderForClassification,
): ProductClassification {
  return {
    categoryCode: "BATTERY_PACK",
    workflowCode: "BATTERY",
    serialSource: "OCS",
  };
}

export type ProductCreationResult =
  | { status: "created"; productId: string; serial: string }
  | { status: "exists"; productId: string; serial: string }
  | { status: "skipped"; reason: string };

/**
 * Create a serialized Product from a completed production order, inside the
 * caller's transaction (atomic with the caller's state change + audit event).
 *
 * Idempotent: a unique `source_production_order_id` guarantees at most one Product
 * per order; re-approval / retry / re-run return `exists` and write nothing.
 * Race-safe: the order row is locked `FOR UPDATE` so concurrent emit + backfill
 * cannot both insert (TOCTOU).
 */
export async function createProductFromOrder(
  tx: Transaction,
  orderId: string,
  actor: string,
): Promise<ProductCreationResult> {
  // Lock the order row first — serializes concurrent creators on the same order.
  const [order] = await tx
    .select({
      id: mfgProductionOrdersTable.id,
      batteryNumber: mfgProductionOrdersTable.batteryNumber,
      modelId: mfgProductionOrdersTable.productId,
      status: mfgProductionOrdersTable.status,
      // Last-resort fallback only (see manufacturing_completed_at resolution below).
      updatedAt: mfgProductionOrdersTable.updatedAt,
    })
    .from(mfgProductionOrdersTable)
    .where(eq(mfgProductionOrdersTable.id, orderId))
    .for("update")
    .limit(1);
  if (!order) return { status: "skipped", reason: "order_not_found" };

  // Idempotency check inside the locked window.
  const [existing] = await tx
    .select({
      id: productsTable.id,
      serial: productsTable.officialProductSerial,
    })
    .from(productsTable)
    .where(eq(productsTable.sourceProductionOrderId, order.id))
    .limit(1);
  if (existing) {
    return { status: "exists", productId: existing.id, serial: existing.serial };
  }

  // Permanent rule: NO Product before QC PASS. Enforced HERE at the single
  // creation boundary (not just by caller convention) so future integrations
  // cannot accidentally mint a Product for an un-passed order. An order reaches
  // `completed` only through the QC gate — qc-approval sets it on approval, and
  // the sequential stage flow can only complete the order after QC is approved.
  if (order.status !== "completed") {
    return { status: "skipped", reason: `order_not_qc_passed:${order.status}` };
  }

  // Identity contract: a Product DERIVES its manufacturer from its model
  // (model → manufacturer, never duplicated). An order with no model cannot
  // satisfy that contract — skip-and-report rather than create a broken identity.
  if (!order.modelId) {
    return { status: "skipped", reason: "order_missing_model" };
  }

  const classification = classifyOrderProduct(order);

  const [category] = await tx
    .select({ id: productCategoriesTable.id })
    .from(productCategoriesTable)
    .where(eq(productCategoriesTable.code, classification.categoryCode))
    .limit(1);
  if (!category) {
    return {
      status: "skipped",
      reason: `category_missing:${classification.categoryCode}`,
    };
  }

  // Manufacturing completion timestamp — written ONCE here at the QC-PASS gate and
  // never updated; the permanent downstream reference for Warranty / Inventory
  // Ageing / Dealer Stock / Reports / Analytics. The authoritative source is the
  // QC stage's `approvedAt` — the literal QC-PASS moment. It is IMMUTABLE for our
  // purposes: it lives on the stage row, set once at approval, and is never touched
  // by order edits (`PATCH /orders/:id` only mutates order columns), so unlike the
  // order's `updated_at` it cannot drift if a completed order is later edited. It is
  // already set in the same tx before the live QC-pass emit calls us, and persists
  // for historical orders consumed by the backfill. `updated_at` is only a defensive
  // last resort for the (anomalous) case of a completed order with no QC stage row.
  const [qcStage] = await tx
    .select({ approvedAt: mfgOrderStagesTable.approvedAt })
    .from(mfgOrderStagesTable)
    .where(
      and(
        eq(mfgOrderStagesTable.productionOrderId, order.id),
        eq(mfgOrderStagesTable.stageType, "quality_control"),
      ),
    )
    // Deterministic in the anomalous case of duplicate QC stage rows: pick the
    // latest approval (the actual QC-PASS moment). Explicit NULLS LAST (Postgres
    // DESC defaults to NULLS FIRST) so an unapproved duplicate (approvedAt NULL)
    // never shadows a real approved row.
    .orderBy(sql`${mfgOrderStagesTable.approvedAt} desc nulls last`)
    .limit(1);
  const manufacturingCompletedAt = qcStage?.approvedAt ?? order.updatedAt;

  // DP-2: reuse the order's battery_number as the single official serial.
  const [product] = await tx
    .insert(productsTable)
    .values({
      categoryId: category.id,
      modelId: order.modelId,
      workflowCode: classification.workflowCode,
      sourceProductionOrderId: order.id,
      officialProductSerial: order.batteryNumber,
      serialSource: classification.serialSource,
      qcStatus: "passed",
      productStatus: "qc_passed",
      manufacturingCompletedAt,
    })
    .returning({ id: productsTable.id });

  const productId = product.id;

  // DP-1: copy the manufacturing genealogy so the Product owns its lineage.
  const lineage = await tx
    .select()
    .from(mfgBatteryGenealogyTable)
    .where(eq(mfgBatteryGenealogyTable.productionOrderId, order.id));
  if (lineage.length > 0) {
    await tx.insert(productGenealogyTable).values(
      lineage.map((g) => ({
        productId,
        componentType: g.componentType,
        componentId: g.componentId,
        componentName: g.componentName,
        quantity: g.quantity,
        serialNumber: g.serialNumber,
        notes: g.notes,
      })),
    );
  }

  // DP-3: record creation as a Manufacturing event on the append-only timeline.
  await tx.insert(productEventsTable).values({
    productId,
    eventType: "product.created",
    actor,
    description: `Product created at QC PASS from order ${order.batteryNumber}`,
    metadata: {
      sourceProductionOrderId: order.id,
      officialProductSerial: order.batteryNumber,
      serialSource: classification.serialSource,
      categoryCode: classification.categoryCode,
      workflowCode: classification.workflowCode,
      genealogyCopied: lineage.length,
      manufacturingCompletedAt: manufacturingCompletedAt.toISOString(),
    },
  });

  return { status: "created", productId, serial: order.batteryNumber };
}
