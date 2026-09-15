import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, eq } from "drizzle-orm";
import {
  db,
  grnLineItemsTable,
  inventoryLotsTable,
  inventoryReservationAllocationsTable,
  inventoryReservationsTable,
  inventoryTransactionsTable,
  outboxEventsTable,
  wipInventoryTable,
  wipIssueLinesTable,
  wipIssueNotesTable,
} from "@workspace/db";
import { ReverseWipIssueBody } from "@workspace/api-zod";
import { requireWriteRole } from "../../middleware/auth";
import { recordSecurityEvent, reqMeta } from "../../lib/security-events";
import { restoreValuationForMovement } from "../../lib/valuation-engine";

const router: IRouter = Router();
const REVERSAL_SOURCE_DOCUMENT_TYPE = "ISSUE_REVERSAL";

router.use(requireWriteRole("supervisor", "director"));

function numify(value: unknown): unknown {
  return typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)
    ? Number(value)
    : value;
}

function serializeIssueNote(
  note: Record<string, any>,
  lines: Array<Record<string, any>>,
): Record<string, unknown> {
  return {
    id: note.id,
    issue_number: note.issueNumber,
    reservation_id: note.reservationId,
    production_order_id: note.productionOrderId,
    status: note.status,
    issued_by: note.issuedBy,
    notes: note.notes ?? null,
    reversed_at: note.reversedAt ?? null,
    reversed_by: note.reversedBy ?? null,
    reversal_reason: note.reversalReason ?? null,
    created_at: note.createdAt,
    lines: lines.map((line) => ({
      id: line.id,
      reservation_allocation_id: line.reservationAllocationId,
      lot_id: line.lotId,
      quantity: numify(line.quantity),
      uom: line.uom,
    })),
  };
}

router.post("/:id/reverse", async (req: Request, res: Response): Promise<void> => {
  const parsed = ReverseWipIssueBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const actorId = req.user!.userId;
  const actorName = req.user?.email ?? null;

  const outcome = await db.transaction(async (tx) => {
    const [note] = await tx
      .select()
      .from(wipIssueNotesTable)
      .where(eq(wipIssueNotesTable.id, req.params.id as string))
      .for("update")
      .limit(1);

    if (!note) return { status: "not_found" as const };
    if (note.status !== "fully_issued") {
      return {
        status: "invalid_state" as const,
        current: note.status,
      };
    }

    // Match the issue engine's reservation-first accounting lock order before
    // locking the note's allocations, WIP rows, and source GRN lines.
    const [reservation] = await tx
      .select()
      .from(inventoryReservationsTable)
      .where(eq(inventoryReservationsTable.id, note.reservationId))
      .for("update")
      .limit(1);
    if (!reservation) return { status: "not_found" as const };

    const lines = await tx
      .select()
      .from(wipIssueLinesTable)
      .where(eq(wipIssueLinesTable.wipIssueNoteId, note.id))
      .orderBy(asc(wipIssueLinesTable.createdAt), asc(wipIssueLinesTable.id))
      .for("update");

    const wipRows = await tx
      .select()
      .from(wipInventoryTable)
      .where(eq(wipInventoryTable.wipIssueNoteId, note.id))
      .orderBy(asc(wipInventoryTable.createdAt), asc(wipInventoryTable.id))
      .for("update");

    if (!lines.length || !wipRows.length) {
      return { status: "invalid_state" as const, current: "empty_issue" };
    }

    const allocations = [];
    for (const line of lines) {
      const [allocation] = await tx
        .select()
        .from(inventoryReservationAllocationsTable)
        .where(eq(inventoryReservationAllocationsTable.id, line.reservationAllocationId))
        .for("update")
        .limit(1);
      if (!allocation || allocation.status !== "issued") {
        return {
          status: "allocation_state" as const,
          allocationId: line.reservationAllocationId,
        };
      }
      allocations.push(allocation);
    }

    for (const wip of wipRows) {
      if (
        Number(wip.remainingQty) !== Number(wip.issuedQty) ||
        Number(wip.consumedQty) !== 0 ||
        Number(wip.returnedQty) !== 0 ||
        Number(wip.scrappedQty) !== 0
      ) {
        return { status: "consumed" as const, wipId: wip.id };
      }
    }

    const lineTotal = lines.reduce((sum, line) => sum + Number(line.quantity), 0);
    const wipTotal = wipRows.reduce((sum, row) => sum + Number(row.issuedQty), 0);
    if (lineTotal !== wipTotal || Number(reservation.issuedQty) < lineTotal) {
      return { status: "accounting_conflict" as const };
    }

    const lotsById = new Map<string, typeof inventoryLotsTable.$inferSelect>();
    for (const wip of wipRows) {
      if (!wip.lotId) return { status: "source_unavailable" as const };
      const [lot] = await tx
        .select()
        .from(inventoryLotsTable)
        .where(eq(inventoryLotsTable.id, wip.lotId))
        .limit(1);
      if (!lot?.grnLineId) return { status: "source_unavailable" as const };
      lotsById.set(lot.id, lot);
    }

    // Lock each source line once, in the same deterministic WIP order used for
    // the ledger pair inserts.
    const lockedSourceLines = new Set<string>();
    for (const wip of wipRows) {
      const lot = lotsById.get(wip.lotId!);
      if (!lot?.grnLineId || lockedSourceLines.has(lot.grnLineId)) continue;
      const [sourceLine] = await tx
        .select({ id: grnLineItemsTable.id })
        .from(grnLineItemsTable)
        .where(eq(grnLineItemsTable.id, lot.grnLineId))
        .for("update")
        .limit(1);
      if (!sourceLine) return { status: "source_unavailable" as const };
      lockedSourceLines.add(sourceLine.id);
    }

    for (const wip of wipRows) {
      const lot = lotsById.get(wip.lotId!);
      const sourceLineId = lot!.grnLineId!;
      const quantity = Number(wip.issuedQty);
      const [originalWipLedger] = await tx
        .select({ id: inventoryTransactionsTable.id })
        .from(inventoryTransactionsTable)
        .where(
          and(
            eq(inventoryTransactionsTable.sourceDocumentId, note.id),
            eq(inventoryTransactionsTable.sourceLineId, sourceLineId),
            eq(inventoryTransactionsTable.stockState, "wip"),
            eq(inventoryTransactionsTable.transactionType, "WIP_RECEIPT"),
          ),
        )
        .limit(1);

      if (!originalWipLedger) {
        return { status: "ledger_unavailable" as const };
      }
      const [originalIssueMovement] = await tx
        .select({ id: inventoryTransactionsTable.id })
        .from(inventoryTransactionsTable)
        .where(
          and(
            eq(inventoryTransactionsTable.sourceDocumentId, note.id),
            eq(inventoryTransactionsTable.sourceLineId, sourceLineId),
            eq(inventoryTransactionsTable.stockState, "available"),
            eq(inventoryTransactionsTable.transactionType, "PRODUCTION_ISSUE"),
          ),
        )
        .limit(1);

      const ledgerBase = {
        materialId: reservation.materialId,
        uom: wip.uom,
        sourceDocumentType: REVERSAL_SOURCE_DOCUMENT_TYPE,
        sourceDocumentId: note.id,
        sourceLineId,
        lotId: wip.lotId,
        warehouseId: wip.warehouseId,
        locationId: wip.locationId,
        binId: lot!.binId,
        productionOrderId: note.productionOrderId,
        reversalOfId: originalWipLedger.id,
        actorId,
        actorName,
        createdBy: actorId,
      } as const;

      const reversalMovements = await tx
        .insert(inventoryTransactionsTable)
        .values([
        {
          ...ledgerBase,
          quantity: String(-quantity),
          stockState: "wip",
          transactionType: "PRODUCTION_ISSUE_REVERSAL",
        },
        {
          ...ledgerBase,
          quantity: String(quantity),
          stockState: "available",
          transactionType: "PRODUCTION_ISSUE_REVERSAL",
        },
        ])
        .returning({
          id: inventoryTransactionsTable.id,
          stockState: inventoryTransactionsTable.stockState,
        });
      const availableReversal = reversalMovements.find((movement) => movement.stockState === "available");
      if (originalIssueMovement && availableReversal) {
        await restoreValuationForMovement(tx, {
          movementId: availableReversal.id,
          reversedMovementId: availableReversal.id,
          originalMovementId: originalIssueMovement.id,
          materialId: reservation.materialId,
          sourceDocumentType: REVERSAL_SOURCE_DOCUMENT_TYPE,
          sourceDocumentId: note.id,
          sourceLineId,
          quantity: String(quantity),
        });
      }

      // The row is no longer an issued WIP balance. Zero issued_qty keeps the
      // live remaining_qty formula valid while the immutable ledger preserves
      // the original issue and both compensating movements.
      await tx
        .update(wipInventoryTable)
        .set({
          issuedQty: "0",
          remainingQty: "0",
          status: "reversed",
          updatedAt: new Date(),
        })
        .where(eq(wipInventoryTable.id, wip.id));
    }

    for (const allocation of allocations) {
      await tx
        .update(inventoryReservationAllocationsTable)
        .set({ status: "active", releasedAt: null })
        .where(eq(inventoryReservationAllocationsTable.id, allocation.id));
    }

    const newIssued = Number(reservation.issuedQty) - lineTotal;
    const newStatus =
      newIssued <= 0
        ? Number(reservation.allocatedQty) >= Number(reservation.reservedQty)
          ? "fully_allocated"
          : "partially_allocated"
        : newIssued >= Number(reservation.reservedQty)
          ? "fully_issued"
          : "partially_issued";

    const [updatedReservation] = await tx
      .update(inventoryReservationsTable)
      .set({
        issuedQty: String(newIssued),
        status: newStatus,
      })
      .where(eq(inventoryReservationsTable.id, reservation.id))
      .returning();

    const [updatedNote] = await tx
      .update(wipIssueNotesTable)
      .set({
        status: "reversed",
        reversedAt: new Date(),
        reversedBy: actorId,
        reversalReason: parsed.data.reason,
      })
      .where(eq(wipIssueNotesTable.id, note.id))
      .returning();

    await tx.insert(outboxEventsTable).values({
      aggregateType: "wip_issue_note",
      aggregateId: note.id,
      eventType: "WIP_ISSUE_REVERSED",
      payload: {
        issue_number: note.issueNumber,
        reservation_id: note.reservationId,
        production_order_id: note.productionOrderId,
        total_reversed: lineTotal,
        reason: parsed.data.reason,
        actor_id: actorId,
      },
    });

    return {
      status: "ok" as const,
      note: updatedNote,
      lines,
      reservation: updatedReservation,
    };
  });

  if (outcome.status === "not_found") {
    res.status(404).json({ error: "WIP issue note not found" });
    return;
  }
  if (outcome.status === "invalid_state") {
    res.status(409).json({
      error: `Issue note cannot be reversed from status '${outcome.current}'`,
    });
    return;
  }
  if (outcome.status === "consumed") {
    res.status(409).json({
      error: "WIP_PARTIALLY_CONSUMED",
      details: { wip_inventory_id: outcome.wipId },
    });
    return;
  }
  if (outcome.status === "allocation_state") {
    res.status(409).json({
      error: "ALLOCATION_STATE_CONFLICT",
      details: { allocation_id: outcome.allocationId },
    });
    return;
  }
  if (outcome.status === "source_unavailable") {
    res.status(409).json({
      error: "WIP_SOURCE_LINE_UNAVAILABLE",
    });
    return;
  }
  if (outcome.status === "ledger_unavailable") {
    res.status(409).json({
      error: "WIP_LEDGER_UNAVAILABLE",
    });
    return;
  }
  if (outcome.status === "accounting_conflict") {
    res.status(409).json({
      error: "WIP_ACCOUNTING_CONFLICT",
    });
    return;
  }

  void recordSecurityEvent({
    eventType: "wip.issue_reversed",
    actorId,
    actorEmail: req.user?.email ?? null,
    actorRole: req.user?.role ?? null,
    ...reqMeta(req),
    statusCode: 200,
    detail: `WIP issue ${outcome.note.issueNumber} reversed: ${parsed.data.reason}`,
  });

  res.json({
    ...serializeIssueNote(
      outcome.note as Record<string, any>,
      outcome.lines as Array<Record<string, any>>,
    ),
    reservation: {
      id: outcome.reservation.id,
      allocated_qty: numify(outcome.reservation.allocatedQty),
      issued_qty: numify(outcome.reservation.issuedQty),
      status: outcome.reservation.status,
    },
  });
});

router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const [note] = await db
    .select()
    .from(wipIssueNotesTable)
    .where(eq(wipIssueNotesTable.id, req.params.id as string))
    .limit(1);
  if (!note) {
    res.status(404).json({ error: "WIP issue note not found" });
    return;
  }

  const lines = await db
    .select()
    .from(wipIssueLinesTable)
    .where(eq(wipIssueLinesTable.wipIssueNoteId, note.id))
    .orderBy(asc(wipIssueLinesTable.createdAt), asc(wipIssueLinesTable.id));

  res.json(serializeIssueNote(note as Record<string, any>, lines as Array<Record<string, any>>));
});

export default router;