import { eq, asc } from "drizzle-orm";
import {
  type Transaction,
  grnHeadersTable,
  grnLineItemsTable,
  materialsTable,
  materialWorkflowAssignmentsTable,
  materialWorkflowsTable,
  inventoryTransactionsTable,
} from "@workspace/db";

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
  | { status: "unassigned_category"; materials: { code: string; name: string }[] };

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
    .select({ id: grnHeadersTable.id, status: grnHeadersTable.status })
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

  for (const line of lines) {
    const routing = resolvePostReceiptAction(line.action as PostReceiptAction);

    await tx
      .update(grnLineItemsTable)
      .set({ inspectionStatus: routing.inspectionStatus })
      .where(eq(grnLineItemsTable.id, line.id));

    await tx.insert(inventoryTransactionsTable).values({
      transactionType: "GRN_RECEIPT",
      materialId: line.materialId,
      quantity: line.quantityReceived,
      uom: line.uom,
      stockState: routing.stockState,
      sourceDocumentType: "GRN",
      sourceDocumentId: grnId,
      sourceLineId: line.id,
      createdBy: actorId,
    });
  }

  await tx
    .update(grnHeadersTable)
    .set({ status: "posted", postedAt: new Date(), postedBy: actorId })
    .where(eq(grnHeadersTable.id, grnId));

  return { status: "posted", grnId, lineCount: lines.length };
}
