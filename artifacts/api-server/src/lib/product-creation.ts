import { eq, and, sql } from "drizzle-orm";
import {
  type Transaction,
  productsTable,
  productGenealogyTable,
  productEventsTable,
  productCategoriesTable,
  productWorkflowsTable,
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

  // Identity contract: a Product DERIVES its manufacturer from its model
  // (model → manufacturer, never duplicated). An order with no model cannot
  // satisfy that contract — skip-and-report rather than create a broken identity.
  if (!order.modelId) {
    return { status: "skipped", reason: "order_missing_model" };
  }

  const classification = classifyOrderProduct(order);

  // Workflow-driven creation (CTO CW-03 Phase 0): the WORKFLOW decides WHEN a
  // Product is minted, via its configured product_creation_trigger — NOT a hardcoded
  // QC-PASS condition. BATTERY / INBUILT_LITHIUM trigger at QC_PASS; HYBRID at
  // INCOMING_INSPECTION_PASS. New categories plug in by adding a trigger handler,
  // never by editing this engine's structure.
  const [workflow] = await tx
    .select({ trigger: productWorkflowsTable.productCreationTrigger })
    .from(productWorkflowsTable)
    .where(eq(productWorkflowsTable.code, classification.workflowCode))
    .limit(1);
  if (!workflow) {
    return {
      status: "skipped",
      reason: `workflow_missing:${classification.workflowCode}`,
    };
  }

  // Resolve the workflow's completion event → the immutable manufacturing-completion
  // timestamp, or a skip reason if the order has not reached it. Each trigger owns
  // its own gate + timestamp source (see resolveCreationTrigger).
  const resolved = await resolveCreationTrigger(tx, workflow.trigger, order);
  if ("skip" in resolved) {
    return { status: "skipped", reason: resolved.skip };
  }
  const manufacturingCompletedAt = resolved.completedAt;

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
    description: `Product created from order ${order.batteryNumber} (trigger: ${workflow.trigger})`,
    metadata: {
      sourceProductionOrderId: order.id,
      officialProductSerial: order.batteryNumber,
      serialSource: classification.serialSource,
      categoryCode: classification.categoryCode,
      workflowCode: classification.workflowCode,
      creationTrigger: workflow.trigger,
      genealogyCopied: lineage.length,
      manufacturingCompletedAt: manufacturingCompletedAt.toISOString(),
    },
  });

  return { status: "created", productId, serial: order.batteryNumber };
}

// ─── Workflow-driven creation triggers ───────────────────────────────────────
// Each Workflow's `product_creation_trigger` maps to exactly one handler that (a)
// gates creation on the workflow's completion event and (b) sources the immutable
// manufacturing-completion timestamp. Dispatch is exhaustive over the DB enum; a new
// trigger is added as a new case here in lockstep with the enum migration — so the
// Product Platform stays generic across categories without touching createProductFromOrder.

type OrderForTrigger = {
  id: string;
  status: string;
  updatedAt: Date;
};

type TriggerResolution = { completedAt: Date } | { skip: string };

// Derived from the schema enum (no new import) so the dispatch below is checked
// for exhaustiveness at compile time: adding a value to product_creation_trigger
// without a handler here is a type error at the `never` assertion in `default`.
type CreationTrigger = (typeof productWorkflowsTable.$inferSelect)["productCreationTrigger"];

async function resolveCreationTrigger(
  tx: Transaction,
  trigger: CreationTrigger,
  order: OrderForTrigger,
): Promise<TriggerResolution> {
  switch (trigger) {
    case "QC_PASS":
      return resolveQcPassTrigger(tx, order);
    case "INCOMING_INSPECTION_PASS":
      // Reserved for HYBRID (no manufacturing assembly / battery genealogy; the
      // Product is available immediately after incoming-inspection approval). That
      // flow does not exist in CW-03 — mint nothing until its handler is built.
      return { skip: `trigger_not_implemented:${trigger}` };
    default: {
      // Exhaustiveness guard + runtime safety net for a DB value outside the type.
      const unhandled: never = trigger;
      return { skip: `unknown_trigger:${String(unhandled)}` };
    }
  }
}

/**
 * QC_PASS — the BATTERY / INBUILT_LITHIUM completion event. Permanent rule: NO
 * Product before QC PASS, enforced HERE at the single creation boundary so no
 * integration can mint a Product for an un-passed order. An order reaches
 * `completed` only through the QC gate (qc-approval sets it on approval; the
 * sequential stage flow cannot complete the order before QC is approved).
 *
 * Completion timestamp = the QC stage's immutable `approved_at` (the literal QC-PASS
 * moment), never the order's mutable `updated_at`, so it cannot drift if a completed
 * order is later edited. Deterministic on the anomalous duplicate-QC-stage case:
 * latest approval, explicit NULLS LAST (Postgres DESC defaults NULLS FIRST) so an
 * unapproved duplicate never shadows a real approval. `updated_at` is only a
 * defensive last resort for a completed order with no QC stage row.
 */
async function resolveQcPassTrigger(
  tx: Transaction,
  order: OrderForTrigger,
): Promise<TriggerResolution> {
  if (order.status !== "completed") {
    return { skip: `order_not_qc_passed:${order.status}` };
  }
  const [qcStage] = await tx
    .select({ approvedAt: mfgOrderStagesTable.approvedAt })
    .from(mfgOrderStagesTable)
    .where(
      and(
        eq(mfgOrderStagesTable.productionOrderId, order.id),
        eq(mfgOrderStagesTable.stageType, "quality_control"),
      ),
    )
    .orderBy(sql`${mfgOrderStagesTable.approvedAt} desc nulls last`)
    .limit(1);
  return { completedAt: qcStage?.approvedAt ?? order.updatedAt };
}
