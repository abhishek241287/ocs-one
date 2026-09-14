import { createHash } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  type Executor,
  type Transaction,
  bulkBatchLinesTable,
  bulkBatchesTable,
  db,
  inventoryReservationsTable,
  mfgProductionOrdersTable,
  outboxEventsTable,
  wipIssueLinesTable,
  wipIssueNotesTable,
} from "@workspace/db";
import {
  allocateInTx,
  createReservationInTx,
  HOLDING_STATUSES,
  issueToWipInTx,
  nextReservationNumber,
  nextWipIssueNumber,
} from "./inventory-reservation-engine";
import { findActiveMinForSource, resolveApprovedBomRequirements } from "./material-issue";

export class BulkIssueError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly body: Record<string, unknown>,
  ) {
    super(String(body.error ?? "Bulk issue failed"));
  }
}

function numify(value: unknown): unknown {
  return typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value;
}

export async function bulkProjection(
  exec: Executor,
  batchId: string,
): Promise<Record<string, unknown> | null> {
  const [batch] = await exec
    .select()
    .from(bulkBatchesTable)
    .where(eq(bulkBatchesTable.id, batchId))
    .limit(1);
  if (!batch) return null;

  const rows = await exec
    .select({
      line: bulkBatchLinesTable,
      reservationNumber: inventoryReservationsTable.reservationNumber,
      issueNumber: wipIssueNotesTable.issueNumber,
    })
    .from(bulkBatchLinesTable)
    .innerJoin(
      inventoryReservationsTable,
      eq(inventoryReservationsTable.id, bulkBatchLinesTable.reservationId),
    )
    .innerJoin(wipIssueNotesTable, eq(wipIssueNotesTable.id, bulkBatchLinesTable.wipIssueNoteId))
    .where(eq(bulkBatchLinesTable.batchId, batch.id))
    .orderBy(asc(bulkBatchLinesTable.sequence));

  const lines = [];
  for (const row of rows) {
    const issueLines = await exec
      .select()
      .from(wipIssueLinesTable)
      .where(eq(wipIssueLinesTable.wipIssueNoteId, row.line.wipIssueNoteId));
    lines.push({
      sequence: row.line.sequence,
      material_id: row.line.materialId,
      requested_qty: numify(row.line.requestedQty),
      issued_qty: numify(row.line.issuedQty),
      source_bom_line_refs: row.line.sourceBomLineRefs,
      reservation_id: row.line.reservationId,
      reservation_number: row.reservationNumber,
      wip_issue_note_id: row.line.wipIssueNoteId,
      issue_number: row.issueNumber,
      lots: issueLines.map((issueLine) => ({
        id: issueLine.id,
        lot_id: issueLine.lotId,
        quantity: numify(issueLine.quantity),
        uom: issueLine.uom,
      })),
    });
  }

  return {
    id: batch.id,
    production_order_id: batch.productionOrderId,
    idempotency_key: batch.idempotencyKey,
    request_hash: batch.requestHash,
    status: batch.status,
    created_by: batch.createdBy,
    created_at: batch.createdAt,
    lines,
  };
}

function requestHash(
  orderId: string,
  lines: Array<{ materialId: string; requiredQty: number; sourceBomLineRefs: string[] }>,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        production_order_id: orderId,
        lines: lines.map((line) => ({
          material_id: line.materialId,
          requested_qty: line.requiredQty,
          source_bom_line_refs: line.sourceBomLineRefs,
        })),
      }),
    )
    .digest("hex");
}

export type BulkIssueInTxArgs = {
  productionOrderId: string;
  idempotencyKey: string;
  actorId: string;
  actorName: string | null;
  notes?: string | null;
};

export type BulkIssueInTxResult = {
  status: 200 | 201;
  projection: Record<string, unknown> | null;
};

export async function executeBulkIssueInTx(
  tx: Transaction,
  args: BulkIssueInTxArgs,
): Promise<BulkIssueInTxResult> {
  const orderId = args.productionOrderId;
  const [order] = await tx
    .select({
      id: mfgProductionOrdersTable.id,
      modelId: mfgProductionOrdersTable.productId,
    })
    .from(mfgProductionOrdersTable)
    .where(eq(mfgProductionOrdersTable.id, orderId))
    .for("update")
    .limit(1);
  if (!order) throw new BulkIssueError(404, { error: "Production order not found" });
  if (!order.modelId) {
    throw new BulkIssueError(404, { error: "No approved BOM for this order's model" });
  }

  const bom = await resolveApprovedBomRequirements(tx, order.modelId, {
    lockBomHeader: true,
  });
  if (!bom || bom.requirements.length === 0) {
    throw new BulkIssueError(404, {
      error: "Approved BOM has no non-cell material requirements to issue",
    });
  }

  const grouped = new Map<
    string,
    {
      materialId: string;
      materialCode: string | null;
      uom: string;
      requiredQty: number;
      sourceBomLineRefs: string[];
    }
  >();
  for (const requirement of bom.requirements) {
    const current = grouped.get(requirement.materialId);
    if (current) {
      current.requiredQty += requirement.requiredQty;
      current.sourceBomLineRefs.push(requirement.bomLineId);
    } else {
      grouped.set(requirement.materialId, {
        materialId: requirement.materialId,
        materialCode: requirement.materialCode,
        uom: requirement.uom,
        requiredQty: requirement.requiredQty,
        sourceBomLineRefs: [requirement.bomLineId],
      });
    }
  }
  const lines = [...grouped.values()].sort((a, b) =>
    `${a.materialCode ?? ""}:${a.materialId}`.localeCompare(`${b.materialCode ?? ""}:${b.materialId}`),
  );
  const hash = requestHash(orderId, lines);

  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`bulk-issue:${args.idempotencyKey}`}))`,
  );

  const [existing] = await tx
    .select()
    .from(bulkBatchesTable)
    .where(eq(bulkBatchesTable.idempotencyKey, args.idempotencyKey))
    .limit(1);
  if (existing) {
    if (existing.requestHash !== hash) {
      throw new BulkIssueError(409, {
        error: "IDEMPOTENCY_CONFLICT",
        message: "Idempotency-Key was already used for a different bulk issue request",
      });
    }
    return { status: 200, projection: await bulkProjection(tx, existing.id) };
  }

  const activeMin = await findActiveMinForSource(tx, "PRODUCTION_ORDER", orderId);
  if (activeMin) {
    throw new BulkIssueError(409, {
      error: "ACTIVE_MIN_EXISTS",
      min_number: activeMin.minNumber,
    });
  }

  const activeReservations = await tx
    .select({ materialId: inventoryReservationsTable.materialId })
    .from(inventoryReservationsTable)
    .where(
      and(
        eq(inventoryReservationsTable.productionOrderId, orderId),
        inArray(inventoryReservationsTable.materialId, lines.map((line) => line.materialId)),
        inArray(inventoryReservationsTable.status, [...HOLDING_STATUSES]),
      ),
    );
  if (activeReservations.length) {
    throw new BulkIssueError(409, {
      error: "ACTIVE_RESERVATION",
      material_ids: [...new Set(activeReservations.map((row) => row.materialId))],
    });
  }

  const [batch] = await tx
    .insert(bulkBatchesTable)
    .values({
      productionOrderId: orderId,
      idempotencyKey: args.idempotencyKey,
      requestHash: hash,
      status: "completed",
      createdBy: args.actorId,
    })
    .returning();

  for (const [index, line] of lines.entries()) {
    const reservationNumber = await nextReservationNumber(tx);
    const created = await createReservationInTx(tx, {
      productionOrderId: orderId,
      materialId: line.materialId,
      quantity: line.requiredQty,
      uom: line.uom,
      reservationNumber,
      actorId: args.actorId,
    });
    if (created.status !== "ok") {
      throw new BulkIssueError(409, {
        error: "INSUFFICIENT_STOCK",
        material_id: line.materialId,
        available: created.available,
        reserved: created.reserved,
        requested: line.requiredQty,
      });
    }

    const allocated = await allocateInTx(tx, {
      reservationId: created.reservation.id,
      actorId: args.actorId,
      strategy: "FIFO",
      allowPartial: false,
    });
    if (allocated.status !== "ok") {
      throw new BulkIssueError(409, {
        error: allocated.status === "insufficient" ? "INSUFFICIENT_STOCK" : "ALLOCATION_FAILED",
        material_id: line.materialId,
        details: allocated,
      });
    }

    const issued = await issueToWipInTx(tx, {
      reservationId: created.reservation.id,
      issueNumber: await nextWipIssueNumber(tx),
      actorId: args.actorId,
      actorName: args.actorName,
      allowPartial: false,
      notes: args.notes ?? null,
      idempotencyKey: null,
      outboxPayload: { bulk_batch_id: batch.id },
    });
    if (issued.status !== "ok") {
      throw new BulkIssueError(409, {
        error: issued.status === "insufficient" ? "INSUFFICIENT_ALLOCATED" : "ISSUE_FAILED",
        material_id: line.materialId,
        details: issued,
      });
    }

    await tx.insert(bulkBatchLinesTable).values({
      batchId: batch.id,
      sequence: index + 1,
      materialId: line.materialId,
      requestedQty: String(line.requiredQty),
      sourceBomLineRefs: line.sourceBomLineRefs,
      reservationId: created.reservation.id,
      wipIssueNoteId: issued.note.id,
      issuedQty: String(line.requiredQty),
    });
  }

  await tx.insert(outboxEventsTable).values({
    aggregateType: "bulk_batch",
    aggregateId: batch.id,
    eventType: "BULK_ISSUE_CREATED",
    payload: {
      production_order_id: orderId,
      idempotency_key: args.idempotencyKey,
      batch_id: batch.id,
      lines: lines.map((line) => ({
        material_id: line.materialId,
        quantity: line.requiredQty,
        source_bom_line_refs: line.sourceBomLineRefs,
      })),
      actor_id: args.actorId,
    },
  });

  return { status: 201, projection: await bulkProjection(tx, batch.id) };
}

export async function executeBulkIssue(
  args: BulkIssueInTxArgs,
): Promise<BulkIssueInTxResult> {
  return db.transaction((tx) => executeBulkIssueInTx(tx, args));
}