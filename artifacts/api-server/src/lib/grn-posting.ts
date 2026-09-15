import { eq, asc, inArray, sql } from "drizzle-orm";
import {
  type Transaction,
  grnHeadersTable,
  grnLineItemsTable,
  materialsTable,
  materialWorkflowAssignmentsTable,
  materialWorkflowsTable,
  inventoryTransactionsTable,
  purchaseOrdersTable,
  purchaseOrderLinesTable,
  outboxEventsTable,
  inventoryLotsTable,
} from "@workspace/db";
import { recordReceiptLayer } from "./valuation-engine";

// ─── Inventory Platform — generic GRN posting engine ─────────────────────────
// Posting a GRN turns a draft receiving document into committed stock movement.
// The engine is GENERIC: it never assumes every material on the GRN shares one
// inspection process. For each line it resolves the material's CATEGORY → assigned
// Material Workflow → `post_receipt_action`, then dispatches that action to a routing
// (mirrors the Product Platform's resolveCreationTrigger). The WORKFLOW decides what
// happens after receipt; this engine only executes the workflow's decision.
//
// Permanent separation of concerns: the Workflow decides WHEN/WHAT-NEXT (routing);
// the GRN engine decides only that one immutable inventory transaction is written per
// line, atomically with the header status change.

// Derived from the schema enum so the dispatch below is exhaustiveness-checked at
// compile time: adding a value to material_post_receipt_action without a handler here
// is a type error at the `never` assertion in `default`.
type PostReceiptAction =
  (typeof materialWorkflowsTable.$inferSelect)["postReceiptAction"];

type InspectionStatus = "pending" | "passed" | "rejected" | "partial";
type StockState = "inspection_pending" | "available";

export interface LineRouting {
  inspectionStatus: InspectionStatus | null;
  stockState: StockState;
}

/**
 * Map a workflow's post-receipt action to the line's initial inspection status +
 * the stock state of the generated inventory transaction. Exhaustive over the enum.
 *   INCOMING_INSPECTION → line awaits a separate Incoming Inspection workflow; stock
 *                         is held (inspection_pending), inspection_status = pending.
 *   DIRECT_TO_INVENTORY → no inspection process; stock immediately available,
 *                         inspection_status = NULL.
 */
export function resolvePostReceiptAction(action: PostReceiptAction): LineRouting {
  switch (action) {
    case "INCOMING_INSPECTION":
      return { inspectionStatus: "pending", stockState: "inspection_pending" };
    case "DIRECT_TO_INVENTORY":
      return { inspectionStatus: null, stockState: "available" };
    default: {
      const unhandled: never = action;
      throw new Error(`unknown_post_receipt_action:${String(unhandled)}`);
    }
  }
}

export type GrnPostResult =
  | { status: "posted"; grnId: string; lineCount: number }
  | { status: "not_found" }
  | { status: "invalid_state"; current: string }
  | { status: "no_lines" }
  | { status: "unassigned_category"; materials: { code: string; name: string }[] }
  | { status: "po_not_receivable"; current: string }
  | { status: "po_supplier_mismatch" }
  | { status: "po_line_mismatch" }
  | {
      status: "over_receipt";
      poLineId: string;
      orderedQty: number;
      receivedQty: number;
      attemptedQty: number;
      tolerancePercent: number;
    };

/**
 * Post a draft GRN inside the caller's transaction (atomic with the header status
 * change + line routing + ledger writes).
 *
 * Race-safe: the header is locked `FOR UPDATE` and the `status='draft'` guard is
 * re-checked INSIDE the lock (TOCTOU) so two concurrent posts cannot both commit.
 * A non-draft GRN returns `invalid_state` and writes nothing.
 */
export async function postGrn(
  tx: Transaction,
  grnId: string,
  actorId: string | null,
): Promise<GrnPostResult> {
  const [grn] = await tx
    .select({
      id: grnHeadersTable.id,
      status: grnHeadersTable.status,
      supplierId: grnHeadersTable.supplierId,
      purchaseOrderId: grnHeadersTable.purchaseOrderId,
      warehouseId: grnHeadersTable.warehouseId,
      locationId: grnHeadersTable.locationId,
    })
    .from(grnHeadersTable)
    .where(eq(grnHeadersTable.id, grnId))
    .for("update")
    .limit(1);
  if (!grn) return { status: "not_found" };
  if (grn.status !== "draft") return { status: "invalid_state", current: grn.status };

  // Resolve every line's routing in one pass: material → category → workflow
  // assignment → post_receipt_action. A LEFT JOIN exposes lines whose category has
  // NO assigned workflow (action === null) so we can FAIL FAST rather than guess.
  const lines = await tx
    .select({
      id: grnLineItemsTable.id,
      materialId: grnLineItemsTable.materialId,
      materialCode: materialsTable.code,
      materialName: materialsTable.name,
      quantityReceived: grnLineItemsTable.quantityReceived,
      uom: grnLineItemsTable.uom,
      purchaseOrderLineId: grnLineItemsTable.purchaseOrderLineId,
      lotId: grnLineItemsTable.lotId,
      supplierLotNumber: grnLineItemsTable.supplierLotNumber,
      action: materialWorkflowsTable.postReceiptAction,
    })
    .from(grnLineItemsTable)
    .innerJoin(materialsTable, eq(materialsTable.id, grnLineItemsTable.materialId))
    .leftJoin(
      materialWorkflowAssignmentsTable,
      eq(materialWorkflowAssignmentsTable.categoryId, materialsTable.categoryId),
    )
    .leftJoin(
      materialWorkflowsTable,
      eq(materialWorkflowsTable.id, materialWorkflowAssignmentsTable.workflowId),
    )
    .where(eq(grnLineItemsTable.grnId, grnId))
    .orderBy(asc(grnLineItemsTable.lineNumber));
  if (lines.length === 0) return { status: "no_lines" };

  let poReceipt:
    | {
        poId: string;
        fromStatus: "approved" | "partially_received";
        lineUpdates: Array<{ id: string; receivedQty: number; openQty: number }>;
        nextStatus: "partially_received" | "fully_received";
      }
    | undefined;

  if (grn.purchaseOrderId) {
    // GRN headers are locked above, but separate draft GRNs can still race on the
    // same PO. A transaction-scoped advisory lock gives every receiving path a
    // deterministic serialization point before reading PO quantities.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`purchase-order:${grn.purchaseOrderId}`}))`,
    );
    const [po] = await tx
      .select({
        id: purchaseOrdersTable.id,
        supplierId: purchaseOrdersTable.supplierId,
        status: purchaseOrdersTable.status,
        tolerancePercent: purchaseOrdersTable.overReceiptTolerancePercent,
      })
      .from(purchaseOrdersTable)
      .where(eq(purchaseOrdersTable.id, grn.purchaseOrderId))
      .for("update")
      .limit(1);

    if (!po || !["approved", "partially_received"].includes(po.status)) {
      return { status: "po_not_receivable", current: po?.status ?? "missing" };
    }
    if (po.supplierId !== grn.supplierId) return { status: "po_supplier_mismatch" };
    if (lines.some((line) => !line.purchaseOrderLineId)) {
      return { status: "po_line_mismatch" };
    }

    const poLines = await tx
      .select()
      .from(purchaseOrderLinesTable)
      .where(eq(purchaseOrderLinesTable.purchaseOrderId, po.id))
      .orderBy(asc(purchaseOrderLinesTable.lineNumber))
      .for("update");
    const poLineById = new Map(poLines.map((line) => [line.id, line]));
    const attemptedByLine = new Map<string, number>();
    for (const line of lines) {
      const poLine = poLineById.get(line.purchaseOrderLineId!);
      if (!poLine || poLine.materialId !== line.materialId || poLine.uom !== line.uom) {
        return { status: "po_line_mismatch" };
      }
      attemptedByLine.set(
        poLine.id,
        (attemptedByLine.get(poLine.id) ?? 0) + Number(line.quantityReceived),
      );
    }

    const tolerancePercent = Number(po.tolerancePercent);
    for (const [poLineId, attemptedQty] of attemptedByLine) {
      const poLine = poLineById.get(poLineId)!;
      const orderedQty = Number(poLine.orderedQty);
      const receivedQty = Number(poLine.receivedQty);
      const maxReceivable = orderedQty * (1 + tolerancePercent / 100);
      if (receivedQty + attemptedQty > maxReceivable + 1e-9) {
        return {
          status: "over_receipt",
          poLineId,
          orderedQty,
          receivedQty,
          attemptedQty,
          tolerancePercent,
        };
      }
    }

    const lineUpdates = poLines.map((poLine) => {
      const receivedQty =
        Number(poLine.receivedQty) + (attemptedByLine.get(poLine.id) ?? 0);
      const openQty = Math.max(
        Number(poLine.orderedQty) -
          receivedQty -
          Number(poLine.rejectedQty) -
          Number(poLine.cancelledQty),
        0,
      );
      return { id: poLine.id, receivedQty, openQty };
    });
    poReceipt = {
      poId: po.id,
      fromStatus: po.status as "approved" | "partially_received",
      lineUpdates,
      nextStatus: lineUpdates.every((line) => line.openQty <= 0)
        ? "fully_received"
        : "partially_received",
    };
  }

  // Mandatory workflow assignment (CTO directive — Fail Fast, Never Guess): the system
  // never assumes a default receiving path. If any material's category has no assigned
  // Material Workflow, posting fails and writes NOTHING (the whole tx rolls back).
  const unassigned = lines.filter((l) => l.action == null);
  if (unassigned.length > 0) {
    return {
      status: "unassigned_category",
      materials: unassigned.map((l) => ({ code: l.materialCode, name: l.materialName })),
    };
  }

  // Lock every referenced material row FOR UPDATE before writing the first inventory
  // transaction. The material-write path (usage/link edit) also locks the material
  // FOR UPDATE and only allows a change while NO GRN line / inventory transaction
  // exists (isMaterialLinkLocked). Without a shared lock, a concurrent link edit and
  // this first receipt could interleave — the edit reads "not locked yet" while we
  // insert the first transaction under the old link. Taking the same row lock here
  // serializes the two paths so a material's link can never change under committed stock.
  const materialIds = [...new Set(lines.map((l) => l.materialId))];
  await tx
    .select({ id: materialsTable.id })
    .from(materialsTable)
    .where(inArray(materialsTable.id, materialIds))
    .for("update");

  for (const line of lines) {
    const routing = resolvePostReceiptAction(line.action as PostReceiptAction);
    const receivedQty = Number(line.quantityReceived);
    const directToInventory = routing.inspectionStatus === null;
    const lotSequence = await tx.execute<{ seq: string }>(
      sql`SELECT nextval('lot_seq') AS seq`,
    );
    const sequence = Number(lotSequence.rows[0]?.seq);
    if (!Number.isFinite(sequence)) {
      throw new Error("Unable to allocate inventory lot number");
    }
    const now = new Date();
    const lotDate = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
    const [lot] = await tx
      .insert(inventoryLotsTable)
      .values({
        lotNumber: `LOT-${lotDate}-${String(sequence).padStart(4, "0")}`,
        materialId: line.materialId,
        supplierLotNumber: line.supplierLotNumber,
        supplierId: grn.supplierId,
        grnLineId: line.id,
        totalReceivedQty: String(receivedQty),
        remainingQty: String(directToInventory ? receivedQty : receivedQty),
        uom: line.uom,
        warehouseId: grn.warehouseId,
        locationId: grn.locationId,
      })
      .returning({ id: inventoryLotsTable.id });

    await tx
      .update(grnLineItemsTable)
      .set({
        inspectionStatus: routing.inspectionStatus,
        lotId: lot.id,
        acceptedQty: directToInventory ? String(receivedQty) : "0",
        rejectedQty: "0",
      })
      .where(eq(grnLineItemsTable.id, line.id));

    const [movement] = await tx
      .insert(inventoryTransactionsTable)
      .values({
      transactionType: "GRN_RECEIPT",
      materialId: line.materialId,
      quantity: line.quantityReceived,
      uom: line.uom,
      stockState: routing.stockState,
      lotId: lot.id,
      warehouseId: grn.warehouseId,
      locationId: grn.locationId,
      sourceDocumentType: "GRN",
      sourceDocumentId: grnId,
      sourceLineId: line.id,
      createdBy: actorId,
      })
      .returning({ id: inventoryTransactionsTable.id });

    await recordReceiptLayer(tx, {
      grnLineId: line.id,
      movementId: movement.id,
      materialId: line.materialId,
      quantity: line.quantityReceived,
      uom: line.uom,
    });
  }

  if (poReceipt) {
    for (const line of poReceipt.lineUpdates) {
      await tx
        .update(purchaseOrderLinesTable)
        .set({
          receivedQty: String(line.receivedQty),
          openQty: String(line.openQty),
        })
        .where(eq(purchaseOrderLinesTable.id, line.id));
    }
    await tx
      .update(purchaseOrdersTable)
      .set({ status: poReceipt.nextStatus, updatedAt: new Date() })
      .where(eq(purchaseOrdersTable.id, poReceipt.poId));
    await tx.insert(outboxEventsTable).values({
      aggregateType: "purchase_order",
      aggregateId: poReceipt.poId,
      eventType: "PO_RECEIPT_RECORDED",
      payload: {
        purchase_order_id: poReceipt.poId,
        grn_id: grnId,
        from_status: poReceipt.fromStatus,
        to_status: poReceipt.nextStatus,
        actor_id: actorId,
        lines: poReceipt.lineUpdates.map((line) => ({
          purchase_order_line_id: line.id,
          received_qty: line.receivedQty,
          open_qty: line.openQty,
        })),
      },
    });
  }

  await tx
    .update(grnHeadersTable)
    .set({ status: "posted", postedAt: new Date(), postedBy: actorId })
    .where(eq(grnHeadersTable.id, grnId));

  return { status: "posted", grnId, lineCount: lines.length };
}
