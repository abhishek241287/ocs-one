import { eq, and, asc, sql } from "drizzle-orm";
import {
  type Transaction,
  grnHeadersTable,
  grnLineItemsTable,
  incomingInspectionsTable,
  incomingInspectionLinesTable,
  inventoryLotsTable,
  inventoryTransactionsTable,
} from "@workspace/db";

// Incoming Inspection is a separate document from the GRN. Each event accounts for
// part or all of one or more still-pending GRN lines. The signed ledger releases only
// the quantity covered by that event from inspection_pending.

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
  | { status: "no_pending_lines" }
  | { status: "line_mismatch"; missing: string[]; unexpected: string[] }
  | { status: "invalid_line"; grnLineId: string; reason: string };

type LineResult = (typeof incomingInspectionLinesTable.$inferInsert)["result"];

function classify(accepted: number, rejected: number): LineResult {
  if (rejected === 0) return "passed";
  if (accepted === 0) return "rejected";
  return "partial";
}

export async function recordInspection(
  tx: Transaction,
  grnId: string,
  inspectionNumber: string,
  actorId: string | null,
  lines: InspectionLineInput[],
): Promise<InspectionResult> {
  const [grn] = await tx
    .select({
      id: grnHeadersTable.id,
      status: grnHeadersTable.status,
      warehouseId: grnHeadersTable.warehouseId,
      locationId: grnHeadersTable.locationId,
    })
    .from(grnHeadersTable)
    .where(eq(grnHeadersTable.id, grnId))
    .for("update")
    .limit(1);

  if (!grn) return { status: "grn_not_found" };
  if (grn.status !== "posted") return { status: "invalid_state", current: grn.status };

  const pending = await tx
    .select({
      id: grnLineItemsTable.id,
      materialId: grnLineItemsTable.materialId,
      quantityReceived: grnLineItemsTable.quantityReceived,
      uom: grnLineItemsTable.uom,
      lotId: grnLineItemsTable.lotId,
      acceptedQty: grnLineItemsTable.acceptedQty,
      rejectedQty: grnLineItemsTable.rejectedQty,
    })
    .from(grnLineItemsTable)
    .where(
      and(
        eq(grnLineItemsTable.grnId, grnId),
        eq(grnLineItemsTable.inspectionStatus, "pending"),
      ),
    )
    .orderBy(asc(grnLineItemsTable.lineNumber));

  if (pending.length === 0) {
    const attemptedLine = lines[0]?.grnLineId;
    if (attemptedLine) {
      return {
        status: "invalid_line",
        grnLineId: attemptedLine,
        reason: "the GRN line has no remaining quantity to inspect",
      };
    }
    return { status: "no_pending_lines" };
  }

  const pendingById = new Map(pending.map((line) => [line.id, line]));
  const submitted = new Map<string, InspectionLineInput>();
  for (const line of lines) {
    if (submitted.has(line.grnLineId)) {
      return { status: "invalid_line", grnLineId: line.grnLineId, reason: "duplicate" };
    }
    submitted.set(line.grnLineId, line);
  }

  // The caller may inspect any subset of pending lines, but every submitted line must
  // still be pending on this locked GRN.
  const unexpected = [...submitted.keys()].filter((id) => !pendingById.has(id));
  if (unexpected.length > 0) {
    return { status: "line_mismatch", missing: [], unexpected };
  }

  for (const [grnLineId, input] of submitted) {
    const pendingLine = pendingById.get(grnLineId)!;
    const received = Number(pendingLine.quantityReceived);
    const alreadyAccepted = Number(pendingLine.acceptedQty);
    const alreadyRejected = Number(pendingLine.rejectedQty);
    const remaining = received - alreadyAccepted - alreadyRejected;
    const { acceptedQty, rejectedQty } = input;

    if (!Number.isFinite(acceptedQty) || !Number.isFinite(rejectedQty)) {
      return { status: "invalid_line", grnLineId, reason: "quantities must be numbers" };
    }
    if (acceptedQty < 0 || rejectedQty < 0) {
      return { status: "invalid_line", grnLineId, reason: "quantities must be >= 0" };
    }
    if (acceptedQty + rejectedQty <= 0 || acceptedQty + rejectedQty > remaining + 1e-9) {
      return {
        status: "invalid_line",
        grnLineId,
        reason: `inspection quantity (${acceptedQty + rejectedQty}) must be greater than zero and no more than remaining (${remaining})`,
      };
    }
    if (rejectedQty > 0 && !input.rejectionReason?.trim()) {
      return {
        status: "invalid_line",
        grnLineId,
        reason: "rejection_reason is required when rejected_qty > 0",
      };
    }
  }

  const [header] = await tx
    .insert(incomingInspectionsTable)
    .values({ inspectionNumber, grnId, inspectedBy: actorId })
    .returning({ id: incomingInspectionsTable.id });

  for (const pendingLine of pending) {
    const input = submitted.get(pendingLine.id);
    if (!input) continue;

    const received = Number(pendingLine.quantityReceived);
    const accepted = input.acceptedQty;
    const rejected = input.rejectedQty;
    const newAccepted = Number(pendingLine.acceptedQty) + accepted;
    const newRejected = Number(pendingLine.rejectedQty) + rejected;
    const complete = newAccepted + newRejected >= received - 1e-9;
    const result: LineResult = complete ? classify(newAccepted, newRejected) : "partial";

    const [event] = await tx
      .select({
        next: sql<number>`COALESCE(MAX(${incomingInspectionLinesTable.inspectionEventNumber}), 0) + 1`,
      })
      .from(incomingInspectionLinesTable)
      .where(eq(incomingInspectionLinesTable.grnLineId, pendingLine.id));

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
      inspectionEventNumber: Number(event?.next ?? 1),
    });

    const common = {
      materialId: pendingLine.materialId,
      uom: pendingLine.uom,
      lotId: pendingLine.lotId,
      warehouseId: grn.warehouseId,
      locationId: grn.locationId,
      sourceDocumentType: "INSPECTION" as const,
      sourceDocumentId: header.id,
      sourceLineId: pendingLine.id,
      createdBy: actorId,
    };

    await tx.insert(inventoryTransactionsTable).values({
      ...common,
      transactionType: "INSPECTION_RELEASE",
      quantity: String(-(accepted + rejected)),
      stockState: "inspection_pending",
    });
    if (accepted > 0) {
      await tx.insert(inventoryTransactionsTable).values({
        ...common,
        transactionType: "INSPECTION_ACCEPT",
        quantity: String(accepted),
        stockState: "available",
      });
    }
    if (rejected > 0) {
      await tx.insert(inventoryTransactionsTable).values({
        ...common,
        transactionType: "INSPECTION_REJECT",
        quantity: String(rejected),
        stockState: "rejected",
      });
    }

    await tx
      .update(grnLineItemsTable)
      .set({
        inspectionStatus: complete ? classify(newAccepted, newRejected) : "pending",
        acceptedQty: String(newAccepted),
        rejectedQty: String(newRejected),
      })
      .where(eq(grnLineItemsTable.id, pendingLine.id));

    if (pendingLine.lotId) {
      await tx
        .update(inventoryLotsTable)
        .set({
          remainingQty: String(newAccepted),
          status: complete && newAccepted === 0 ? "rejected" : "active",
        })
        .where(eq(inventoryLotsTable.id, pendingLine.lotId));
    }
  }

  return {
    status: "created",
    inspectionId: header.id,
    inspectionNumber,
    lineCount: submitted.size,
  };
}