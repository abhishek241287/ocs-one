import { eq, and, asc } from "drizzle-orm";
import {
  type Transaction,
  grnHeadersTable,
  grnLineItemsTable,
  incomingInspectionsTable,
  incomingInspectionLinesTable,
  inventoryTransactionsTable,
} from "@workspace/db";

// ─── Inventory Platform — Incoming Inspection engine ─────────────────────────
// Incoming Inspection records what OCS ACCEPTED vs REJECTED from a posted GRN. It is
// a SEPARATE document: it NEVER mutates the GRN's receipt data (quantity_received /
// material / supplier / uom stay immutable — the GRN says what the supplier delivered).
// The only GRN field it touches is each line's inspection_status badge — the schema's
// designed reflection point for the inspection outcome, not a receipt mutation.
//
// Line-by-line: each inspection-pending GRN line gets its own accept/reject outcome,
// and the inventory ledger moves the held quantity inspection_pending → available +
// rejected. v1.0: one inspection per GRN, covering ALL of its pending lines exactly.

export interface InspectionLineInput {
  grnLineId: string;
  acceptedQty: number;
  rejectedQty: number;
  rejectionReason?: string | null;
}

export type InspectionResult =
  | { status: "created"; inspectionId: string; inspectionNumber: string; lineCount: number }
  | { status: "grn_not_found" }
  | { status: "invalid_state"; current: string }
  | { status: "already_inspected" }
  | { status: "no_pending_lines" }
  | { status: "line_mismatch"; missing: string[]; unexpected: string[] }
  | { status: "invalid_line"; grnLineId: string; reason: string };

type LineResult = (typeof incomingInspectionLinesTable.$inferInsert)["result"];

function classify(accepted: number, rejected: number): LineResult {
  if (rejected === 0) return "passed";
  if (accepted === 0) return "rejected";
  return "partial";
}

/**
 * Record (create + finalise) an Incoming Inspection inside the caller's transaction —
 * atomic across the header insert, line inserts, inventory ledger writes, and the GRN
 * line inspection_status reflection.
 *
 * Race-safe: the GRN header is locked `FOR UPDATE` and both the `status='posted'` guard
 * and the one-inspection-per-GRN guard are re-checked INSIDE the lock (TOCTOU), so two
 * concurrent submissions cannot both commit. Any failure returns a discriminated result
 * and writes nothing (the whole tx rolls back).
 */
export async function recordInspection(
  tx: Transaction,
  grnId: string,
  inspectionNumber: string,
  actorId: string | null,
  lines: InspectionLineInput[],
): Promise<InspectionResult> {
  const [grn] = await tx
    .select({ id: grnHeadersTable.id, status: grnHeadersTable.status })
    .from(grnHeadersTable)
    .where(eq(grnHeadersTable.id, grnId))
    .for("update")
    .limit(1);
  if (!grn) return { status: "grn_not_found" };
  if (grn.status !== "posted") return { status: "invalid_state", current: grn.status };

  // One inspection per GRN (grn_id is UNIQUE in v1.0). Re-checked under the lock so a
  // concurrent submission cannot slip a second inspection past the unique constraint.
  const [existing] = await tx
    .select({ id: incomingInspectionsTable.id })
    .from(incomingInspectionsTable)
    .where(eq(incomingInspectionsTable.grnId, grnId))
    .limit(1);
  if (existing) return { status: "already_inspected" };

  // Pending lines = the universe this inspection must cover EXACTLY (no more, no less).
  const pending = await tx
    .select({
      id: grnLineItemsTable.id,
      materialId: grnLineItemsTable.materialId,
      quantityReceived: grnLineItemsTable.quantityReceived,
      uom: grnLineItemsTable.uom,
    })
    .from(grnLineItemsTable)
    .where(
      and(
        eq(grnLineItemsTable.grnId, grnId),
        eq(grnLineItemsTable.inspectionStatus, "pending"),
      ),
    )
    .orderBy(asc(grnLineItemsTable.lineNumber));
  if (pending.length === 0) return { status: "no_pending_lines" };

  const pendingById = new Map(pending.map((l) => [l.id, l]));

  // Reject duplicate submissions for the same GRN line outright.
  const submitted = new Map<string, InspectionLineInput>();
  for (const line of lines) {
    if (submitted.has(line.grnLineId)) {
      return { status: "invalid_line", grnLineId: line.grnLineId, reason: "duplicate" };
    }
    submitted.set(line.grnLineId, line);
  }

  // The submitted set must EXACTLY match the pending set — no missing, no extras.
  const missing = pending.filter((l) => !submitted.has(l.id)).map((l) => l.id);
  const unexpected = [...submitted.keys()].filter((id) => !pendingById.has(id));
  if (missing.length > 0 || unexpected.length > 0) {
    return { status: "line_mismatch", missing, unexpected };
  }

  // Per-line business validation against the immutable received quantity.
  for (const [grnLineId, input] of submitted) {
    const pendingLine = pendingById.get(grnLineId)!;
    const received = Number(pendingLine.quantityReceived);
    const { acceptedQty, rejectedQty } = input;

    if (!Number.isFinite(acceptedQty) || !Number.isFinite(rejectedQty)) {
      return { status: "invalid_line", grnLineId, reason: "quantities must be numbers" };
    }
    if (acceptedQty < 0 || rejectedQty < 0) {
      return { status: "invalid_line", grnLineId, reason: "quantities must be >= 0" };
    }
    if (Math.abs(acceptedQty + rejectedQty - received) > 1e-9) {
      return {
        status: "invalid_line",
        grnLineId,
        reason: `accepted (${acceptedQty}) + rejected (${rejectedQty}) must equal received (${received})`,
      };
    }
    if (rejectedQty > 0 && !input.rejectionReason?.trim()) {
      return { status: "invalid_line", grnLineId, reason: "rejection_reason is required when rejected_qty > 0" };
    }
  }

  // ── All validated — write the inspection document, ledger, and reflection. ──
  const [header] = await tx
    .insert(incomingInspectionsTable)
    .values({ inspectionNumber, grnId, inspectedBy: actorId })
    .returning({ id: incomingInspectionsTable.id });

  for (const pendingLine of pending) {
    const input = submitted.get(pendingLine.id)!;
    const received = Number(pendingLine.quantityReceived);
    const accepted = input.acceptedQty;
    const rejected = input.rejectedQty;
    const result = classify(accepted, rejected);

    await tx.insert(incomingInspectionLinesTable).values({
      inspectionId: header.id,
      grnLineId: pendingLine.id,
      grnId,
      materialId: pendingLine.materialId,
      quantityReceived: String(received),
      acceptedQty: String(accepted),
      rejectedQty: String(rejected),
      result,
      rejectionReason: rejected > 0 ? (input.rejectionReason?.trim() ?? null) : null,
    });

    // Inventory ledger: release the full hold, then add accepted + rejected. Signed
    // quantities net by stock_state when summed, so the inspection_pending hold returns
    // to 0. Zero-quantity movements are skipped (no empty ledger rows).
    await tx.insert(inventoryTransactionsTable).values({
      transactionType: "INSPECTION_RELEASE",
      materialId: pendingLine.materialId,
      quantity: String(-received),
      uom: pendingLine.uom,
      stockState: "inspection_pending",
      sourceDocumentType: "INSPECTION",
      sourceDocumentId: header.id,
      sourceLineId: pendingLine.id,
      createdBy: actorId,
    });
    if (accepted > 0) {
      await tx.insert(inventoryTransactionsTable).values({
        transactionType: "INSPECTION_ACCEPT",
        materialId: pendingLine.materialId,
        quantity: String(accepted),
        uom: pendingLine.uom,
        stockState: "available",
        sourceDocumentType: "INSPECTION",
        sourceDocumentId: header.id,
        sourceLineId: pendingLine.id,
        createdBy: actorId,
      });
    }
    if (rejected > 0) {
      await tx.insert(inventoryTransactionsTable).values({
        transactionType: "INSPECTION_REJECT",
        materialId: pendingLine.materialId,
        quantity: String(rejected),
        uom: pendingLine.uom,
        stockState: "rejected",
        sourceDocumentType: "INSPECTION",
        sourceDocumentId: header.id,
        sourceLineId: pendingLine.id,
        createdBy: actorId,
      });
    }

    // Reflect the outcome onto the GRN line's inspection_status badge ONLY (never the
    // receipt quantity/material/uom). This is the schema's designed reflection point.
    await tx
      .update(grnLineItemsTable)
      .set({ inspectionStatus: result })
      .where(eq(grnLineItemsTable.id, pendingLine.id));
  }

  return {
    status: "created",
    inspectionId: header.id,
    inspectionNumber,
    lineCount: pending.length,
  };
}
