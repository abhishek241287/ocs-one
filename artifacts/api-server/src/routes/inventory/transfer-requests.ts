import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, count, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  db,
  grnLineItemsTable,
  inventoryLotsTable,
  inventoryTransactionsTable,
  materialsTable,
  outboxEventsTable,
  pool,
  transferLinesTable,
  transferRequestsTable,
  warehousesTable,
} from "@workspace/db";
import {
  CreateTransferRequestBody,
  EmptyTransferBody,
  ReceiveTransferBody,
  RejectTransferBody,
} from "@workspace/api-zod";
import { requireAuth, requireWriteRole } from "../../middleware/auth";
import { recordSecurityEvent, reqMeta } from "../../lib/security-events";
import {
  depleteValuationForMovement,
  restoreValuationForMovement,
} from "../../lib/valuation-engine";

const router: IRouter = Router();
router.use(requireAuth);

const TRANSFER_SOURCE_DOCUMENT_TYPE = "transfer_request";

function numify(value: unknown): unknown {
  return typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)
    ? Number(value)
    : value;
}

function todayDateStr(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
}

function scopedIdempotencyKey(prefix: "issue" | "receive", key: string): string {
  const label = `${prefix}:`;
  return `${label}${key.slice(0, 100 - label.length)}`;
}

function idempotencyAdvisoryKey(prefix: "transfer-idem" | "transfer-rcv-idem", key: string): string {
  return `${prefix}:${key}`;
}

type TransferRecord = Record<string, any>;

function serializeRequest(request: TransferRecord, lines: TransferRecord[]) {
  return {
    id: request.id,
    transfer_request_number: request.transferNumber,
    type: request.type,
    status: request.status,
    source_warehouse_id: request.sourceWarehouseId,
    source_location_id: request.sourceLocationId ?? null,
    source_bin_id: request.sourceBinId ?? null,
    destination_warehouse_id: request.destinationWarehouseId,
    destination_location_id: request.destinationLocationId ?? null,
    destination_bin_id: request.destinationBinId ?? null,
    notes: request.notes ?? null,
    requested_by: request.requestedBy,
    requested_at: request.requestedAt,
    approved_by: request.approvedBy ?? null,
    approved_at: request.approvedAt ?? null,
    issued_by: request.issuedBy ?? null,
    issued_at: request.issuedAt ?? null,
    received_by: request.receivedBy ?? null,
    received_at: request.receivedAt ?? null,
    reconciled_by: null,
    reconciled_at: null,
    cancelled_by: request.cancelledBy ?? null,
    cancelled_at: request.cancelledAt ?? null,
    cancellation_reason: request.cancellationReason ?? null,
    lines: lines.map((line) => ({
      id: line.id,
      line_number: line.lineNumber,
      material_id: line.materialId,
      lot_id: line.lotId ?? null,
      source_location_id: request.sourceLocationId ?? null,
      source_bin_id: request.sourceBinId ?? null,
      destination_location_id: request.destinationLocationId ?? null,
      destination_bin_id: request.destinationBinId ?? null,
      requested_qty: numify(line.requestedQty),
      issued_qty: numify(line.issuedQty ?? "0"),
      received_qty: numify(line.receivedQty ?? "0"),
      uom: line.uom,
      status: line.status,
      notes: line.notes ?? null,
    })),
  };
}

async function loadRequest(id: string) {
  const [request] = await db
    .select()
    .from(transferRequestsTable)
    .where(eq(transferRequestsTable.id, id))
    .limit(1);
  if (!request) return null;
  const lines = await db
    .select()
    .from(transferLinesTable)
    .where(eq(transferLinesTable.transferRequestId, id))
    .orderBy(asc(transferLinesTable.lineNumber));
  return { request, lines };
}

async function nextTransferNumber(): Promise<string> {
  const { rows } = await pool.query<{ seq: string }>(
    "SELECT nextval('transfer_request_seq') AS seq",
  );
  return `TRQ-${todayDateStr()}-${String(rows[0].seq).padStart(4, "0")}`;
}

function lineDimensions(body: CreateTransferRequestBody) {
  const first = body.lines[0];
  const keys = [
    "source_location_id",
    "source_bin_id",
    "destination_location_id",
    "destination_bin_id",
  ] as const;
  for (const key of keys) {
    const expected = first[key] ?? null;
    if (body.lines.some((line) => (line[key] ?? null) !== expected)) {
      return null;
    }
  }
  return {
    sourceLocationId: first.source_location_id ?? null,
    sourceBinId: first.source_bin_id ?? null,
    destinationLocationId: first.destination_location_id ?? null,
    destinationBinId: first.destination_bin_id ?? null,
  };
}

async function matchingAvailable(
  tx: any,
  materialId: string,
  warehouseId: string,
  locationId: string | null,
  binId: string | null,
  lotId: string | null,
  stockState: "available" | "in_transit",
): Promise<number> {
  const conditions = [
    eq(inventoryTransactionsTable.materialId, materialId),
    eq(inventoryTransactionsTable.stockState, stockState),
    eq(inventoryTransactionsTable.warehouseId, warehouseId),
  ];
  if (locationId) {
    conditions.push(
      or(
        eq(inventoryTransactionsTable.locationId, locationId),
        isNull(inventoryTransactionsTable.locationId),
      )!,
    );
  }
  if (binId) {
    conditions.push(
      or(
        eq(inventoryTransactionsTable.binId, binId),
        isNull(inventoryTransactionsTable.binId),
      )!,
    );
  }
  if (lotId) conditions.push(eq(inventoryTransactionsTable.lotId, lotId));
  const [balance] = await tx
    .select({
      sum: sql<string>`coalesce(sum(${inventoryTransactionsTable.quantity}), 0)`,
    })
    .from(inventoryTransactionsTable)
    .where(and(...conditions));
  return Number(balance?.sum ?? 0);
}

async function lockLotSource(tx: any, lotId: string | null) {
  if (!lotId) return null;
  const key = `inventory-lot:${lotId}`;
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`,
  );
  const [lot] = await tx
    .select()
    .from(inventoryLotsTable)
    .where(eq(inventoryLotsTable.id, lotId))
    .for("update")
    .limit(1);
  if (!lot?.grnLineId) return null;
  const [line] = await tx
    .select({ id: grnLineItemsTable.id })
    .from(grnLineItemsTable)
    .where(eq(grnLineItemsTable.id, lot.grnLineId))
    .for("update")
    .limit(1);
  if (!line) return null;
  return { lot, sourceLineId: lot.grnLineId as string };
}

async function lockMaterialScope(tx: any, materialId: string) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`transfer-material:${materialId}`}))`,
  );
}

function returnRequest(res: Response, outcome: any, successStatus = 200): boolean {
  if (outcome.status === "not_found") {
    res.status(404).json({ error: "Transfer request not found" });
    return true;
  }
  if (outcome.status === "invalid_state") {
    res.status(409).json({
      error: `Transfer request cannot transition from status '${outcome.current}'`,
    });
    return true;
  }
  if (outcome.status === "already") {
    res.status(409).json({ error: "Transfer request is already in transit" });
    return true;
  }
  if (outcome.status === "insufficient") {
    res.status(409).json({
      error: "INSUFFICIENT_STOCK_AT_SOURCE",
      details: { line: outcome.line, available: outcome.available },
    });
    return true;
  }
  if (outcome.status === "bad_line") {
    res.status(422).json({ error: "Line does not belong to this transfer" });
    return true;
  }
  if (outcome.status === "over_receive") {
    res.status(409).json({
      error: "OVER_RECEIVE",
      details: { line: outcome.line, outstanding: outcome.outstanding },
    });
    return true;
  }
  if (outcome.status === "received") {
    res.status(409).json({ error: "Cannot reject a transfer after receiving any quantity" });
    return true;
  }
  if (outcome.status === "source_unavailable") {
    res.status(409).json({ error: "TRANSFER_SOURCE_UNAVAILABLE" });
    return true;
  }
  const full = outcome.id ? undefined : outcome.request;
  if (full) {
    res.status(successStatus).json(full);
    return true;
  }
  return false;
}

// ─── Create draft ─────────────────────────────────────────────────────────────
router.post(
  "/",
  requireWriteRole("supervisor", "director"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = CreateTransferRequestBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const body = parsed.data;
    const dimensions = lineDimensions(body);
    if (!dimensions) {
      res.status(422).json({
        error: "All transfer lines must use the same source and destination dimensions",
      });
      return;
    }
    if (body.source_warehouse_id === body.destination_warehouse_id) {
      res.status(422).json({ error: "Source and destination warehouses must differ" });
      return;
    }

    const [sourceWarehouse] = await db
      .select({ id: warehousesTable.id })
      .from(warehousesTable)
      .where(eq(warehousesTable.id, body.source_warehouse_id))
      .limit(1);
    const [destinationWarehouse] = await db
      .select({ id: warehousesTable.id })
      .from(warehousesTable)
      .where(eq(warehousesTable.id, body.destination_warehouse_id))
      .limit(1);
    if (!sourceWarehouse || !destinationWarehouse) {
      res.status(400).json({ error: "Unknown warehouse id" });
      return;
    }

    const transferNumber = await nextTransferNumber();
    const actorId = req.user!.userId;
    const outcome = await db.transaction(async (tx) => {
      const preparedLines: Array<{ materialId: string; quantity: string; uom: any; lotId: string | null }> = [];
      for (const [index, line] of body.lines.entries()) {
        const [material] = await tx
          .select({ id: materialsTable.id, uom: materialsTable.uom })
          .from(materialsTable)
          .where(eq(materialsTable.id, line.material_id))
          .limit(1);
        if (!material) return { status: "bad_material" as const, index };
        if (line.lot_id) {
          const [lot] = await tx
            .select({ materialId: inventoryLotsTable.materialId, warehouseId: inventoryLotsTable.warehouseId })
            .from(inventoryLotsTable)
            .where(eq(inventoryLotsTable.id, line.lot_id))
            .limit(1);
          if (!lot || lot.materialId !== line.material_id) {
            return { status: "bad_lot" as const, index };
          }
          if (lot.warehouseId && lot.warehouseId !== body.source_warehouse_id) {
            return { status: "bad_lot_warehouse" as const, index };
          }
        }
        preparedLines.push({
          materialId: material.id,
          quantity: String(line.quantity),
          uom: material.uom,
          lotId: line.lot_id ?? null,
        });
      }

      const [created] = await tx
        .insert(transferRequestsTable)
        .values({
          transferNumber,
          type: "warehouse_to_warehouse",
          status: "draft",
          sourceWarehouseId: body.source_warehouse_id,
          sourceLocationId: dimensions.sourceLocationId,
          sourceBinId: dimensions.sourceBinId,
          destinationWarehouseId: body.destination_warehouse_id,
          destinationLocationId: dimensions.destinationLocationId,
          destinationBinId: dimensions.destinationBinId,
          requestedBy: actorId,
          notes: body.notes ?? null,
        })
        .returning();

      await tx.insert(transferLinesTable).values(
        preparedLines.map((line, index) => ({
          transferRequestId: created.id,
          lineNumber: index + 1,
          materialId: line.materialId,
          lotId: line.lotId,
          requestedQty: line.quantity,
          issuedQty: "0",
          receivedQty: "0",
          uom: line.uom,
          status: "pending" as const,
        })),
      );
      await tx.insert(outboxEventsTable).values({
        aggregateType: "transfer_request",
        aggregateId: created.id,
        eventType: "TRANSFER_REQUEST_CREATED",
        payload: { transfer_request_number: transferNumber, lines: preparedLines.length, actor_id: actorId },
      });
      return { status: "ok" as const, id: created.id };
    });

    if (outcome.status === "bad_material") {
      res.status(400).json({ error: `Unknown material at line ${outcome.index + 1}` });
      return;
    }
    if (outcome.status === "bad_lot") {
      res.status(422).json({ error: `Lot/material mismatch at line ${outcome.index + 1}` });
      return;
    }
    if (outcome.status === "bad_lot_warehouse") {
      res.status(422).json({ error: `Lot is not held at the source warehouse at line ${outcome.index + 1}` });
      return;
    }
    const full = await loadRequest(outcome.id as string);
    void recordSecurityEvent({
      eventType: "transfer.request_created",
      actorId,
      actorEmail: req.user?.email ?? null,
      actorRole: req.user?.role ?? null,
      ...reqMeta(req),
      statusCode: 201,
      detail: `Transfer request ${full?.request.transferNumber} created`,
    });
    res.status(201).json(serializeRequest(full!.request as TransferRecord, full!.lines as TransferRecord[]));
  },
);

// ─── Approval, cancellation, reconciliation ──────────────────────────────────
router.post(
  "/:id/approve",
  requireWriteRole("director"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = EmptyTransferBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const actorId = req.user!.userId;
    const outcome = await db.transaction(async (tx) => {
      const [request] = await tx
        .select()
        .from(transferRequestsTable)
        .where(eq(transferRequestsTable.id, req.params.id as string))
        .for("update")
        .limit(1);
      if (!request) return { status: "not_found" as const };
      if (request.status !== "draft") return { status: "invalid_state" as const, current: request.status };
      const [updated] = await tx
        .update(transferRequestsTable)
        .set({ status: "approved", approvedBy: actorId, approvedAt: new Date() })
        .where(eq(transferRequestsTable.id, request.id))
        .returning();
      await tx.insert(outboxEventsTable).values({
        aggregateType: "transfer_request",
        aggregateId: request.id,
        eventType: "TRANSFER_REQUEST_APPROVED",
        payload: { transfer_request_number: request.transferNumber, actor_id: actorId },
      });
      return { status: "ok" as const, id: updated.id };
    });
    if (returnRequest(res, outcome)) return;
    const full = await loadRequest(outcome.id as string);
    void recordSecurityEvent({
      eventType: "transfer.request_approved",
      actorId,
      actorEmail: req.user?.email ?? null,
      actorRole: req.user?.role ?? null,
      ...reqMeta(req),
      statusCode: 200,
      detail: `Transfer request ${full?.request.transferNumber} approved`,
    });
    res.json(serializeRequest(full!.request as TransferRecord, full!.lines as TransferRecord[]));
  },
);

router.post(
  "/:id/cancel",
  requireWriteRole("supervisor", "director"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = EmptyTransferBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const actorId = req.user!.userId;
    const outcome = await db.transaction(async (tx) => {
      const [request] = await tx
        .select()
        .from(transferRequestsTable)
        .where(eq(transferRequestsTable.id, req.params.id as string))
        .for("update")
        .limit(1);
      if (!request) return { status: "not_found" as const };
      if (!["draft", "approved"].includes(request.status)) {
        return { status: "invalid_state" as const, current: request.status };
      }
      const [updated] = await tx
        .update(transferRequestsTable)
        .set({ status: "cancelled", cancelledBy: actorId, cancelledAt: new Date() })
        .where(eq(transferRequestsTable.id, request.id))
        .returning();
      await tx.insert(outboxEventsTable).values({
        aggregateType: "transfer_request",
        aggregateId: request.id,
        eventType: "TRANSFER_REQUEST_CANCELLED",
        payload: { transfer_request_number: request.transferNumber, actor_id: actorId },
      });
      return { status: "ok" as const, id: updated.id };
    });
    if (returnRequest(res, outcome)) return;
    const full = await loadRequest(outcome.id as string);
    res.json(serializeRequest(full!.request as TransferRecord, full!.lines as TransferRecord[]));
  },
);

router.post(
  "/:id/reconcile",
  requireWriteRole("supervisor", "director"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = EmptyTransferBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const actorId = req.user!.userId;
    const outcome = await db.transaction(async (tx) => {
      const [request] = await tx
        .select()
        .from(transferRequestsTable)
        .where(eq(transferRequestsTable.id, req.params.id as string))
        .for("update")
        .limit(1);
      if (!request) return { status: "not_found" as const };
      if (request.status !== "received") return { status: "invalid_state" as const, current: request.status };
      const [updated] = await tx
        .update(transferRequestsTable)
        .set({ status: "reconciled" })
        .where(eq(transferRequestsTable.id, request.id))
        .returning();
      await tx.insert(outboxEventsTable).values({
        aggregateType: "transfer_request",
        aggregateId: request.id,
        eventType: "TRANSFER_REQUEST_RECONCILED",
        payload: { transfer_request_number: request.transferNumber, actor_id: actorId },
      });
      return { status: "ok" as const, id: updated.id };
    });
    if (returnRequest(res, outcome)) return;
    const full = await loadRequest(outcome.id as string);
    res.json(serializeRequest(full!.request as TransferRecord, full!.lines as TransferRecord[]));
  },
);

// ─── Issue: available → in_transit ───────────────────────────────────────────
router.post(
  "/:id/issue",
  requireWriteRole("supervisor", "director"),
  async (req: Request, res: Response): Promise<void> => {
    const actorId = req.user!.userId;
    const rawIdempotencyKey = (req.header("idempotency-key") ?? "").trim().slice(0, 100);
    const storedIdempotencyKey = rawIdempotencyKey
      ? scopedIdempotencyKey("issue", rawIdempotencyKey)
      : null;
    let outcome: any;

    try {
      outcome = await db.transaction(async (tx) => {
        if (rawIdempotencyKey) {
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtext(${idempotencyAdvisoryKey("transfer-idem", rawIdempotencyKey)}))`,
          );
          const [replay] = await tx
            .select()
            .from(transferRequestsTable)
            .where(eq(transferRequestsTable.idempotencyKey, storedIdempotencyKey!))
            .limit(1);
          if (replay) return { status: "replay" as const, id: replay.id };
        }

        const [request] = await tx
          .select()
          .from(transferRequestsTable)
          .where(eq(transferRequestsTable.id, req.params.id as string))
          .for("update")
          .limit(1);
        if (!request) return { status: "not_found" as const };
        if (request.status === "in_transit") return { status: "already" as const };
        if (request.status !== "approved") {
          return { status: "invalid_state" as const, current: request.status };
        }

        const lines = await tx
          .select()
          .from(transferLinesTable)
          .where(eq(transferLinesTable.transferRequestId, request.id))
          .orderBy(asc(transferLinesTable.lineNumber))
          .for("update");

        for (const line of lines) {
          const source = await lockLotSource(tx, line.lotId);
          if (line.lotId && !source) {
            return { status: "source_unavailable" as const, line: line.lineNumber };
          }
          if (!line.lotId) await lockMaterialScope(tx, line.materialId);
          const available = await matchingAvailable(
            tx,
            line.materialId,
            request.sourceWarehouseId,
            request.sourceLocationId,
            request.sourceBinId,
            line.lotId,
            "available",
          );
          const requested = Number(line.requestedQty);
          if (requested > available + 0.0005) {
            return { status: "insufficient" as const, line: line.lineNumber, available };
          }

          const movement = {
            materialId: line.materialId,
            uom: line.uom,
            sourceDocumentType: TRANSFER_SOURCE_DOCUMENT_TYPE,
            sourceDocumentId: request.id,
            sourceLineId: source?.sourceLineId ?? null,
            lotId: line.lotId,
            warehouseId: request.sourceWarehouseId,
            locationId: request.sourceLocationId,
            binId: request.sourceBinId,
            actorId,
            actorName: req.user?.email ?? null,
            createdBy: actorId,
          };
          const [transferOut] = await tx.insert(inventoryTransactionsTable).values([
            { ...movement, quantity: String(-requested), stockState: "available", transactionType: "TRANSFER_OUT" },
            { ...movement, quantity: String(requested), stockState: "in_transit", transactionType: "TRANSFER_OUT" },
          ]).returning({ id: inventoryTransactionsTable.id });
          await depleteValuationForMovement(tx, {
            movementId: transferOut.id,
            materialId: line.materialId,
            quantity: String(requested),
            sourceDocumentType: TRANSFER_SOURCE_DOCUMENT_TYPE,
            sourceDocumentId: request.id,
            sourceLineId: source?.sourceLineId ?? null,
            preferredGrnLineId: source?.sourceLineId,
          });
          await tx
            .update(transferLinesTable)
            .set({ issuedQty: String(requested), status: "issued" })
            .where(eq(transferLinesTable.id, line.id));
        }

        const [updated] = await tx
          .update(transferRequestsTable)
          .set({
            status: "in_transit",
            issuedBy: actorId,
            issuedAt: new Date(),
            idempotencyKey: storedIdempotencyKey,
          })
          .where(eq(transferRequestsTable.id, request.id))
          .returning();
        await tx.insert(outboxEventsTable).values({
          aggregateType: "transfer_request",
          aggregateId: request.id,
          eventType: "TRANSFER_ISSUED",
          payload: { transfer_request_number: request.transferNumber, lines: lines.length, actor_id: actorId },
        });
        return { status: "ok" as const, id: updated.id };
      });
    } catch (error: any) {
      const pgCode = error?.code ?? error?.cause?.code;
      if (rawIdempotencyKey && pgCode === "23505") {
        const [replay] = await db
          .select()
          .from(transferRequestsTable)
          .where(eq(transferRequestsTable.idempotencyKey, storedIdempotencyKey!))
          .limit(1);
        if (replay) outcome = { status: "replay" as const, id: replay.id };
        else throw error;
      } else {
        throw error;
      }
    }

    if (outcome.status === "replay") {
      const full = await loadRequest(outcome.id);
      res.json(serializeRequest(full!.request as TransferRecord, full!.lines as TransferRecord[]));
      return;
    }
    if (outcome.status === "source_unavailable") {
      res.status(409).json({ error: "TRANSFER_SOURCE_UNAVAILABLE", details: { line: outcome.line } });
      return;
    }
    if (returnRequest(res, outcome)) return;
    const full = await loadRequest(outcome.id as string);
    void recordSecurityEvent({
      eventType: "transfer.issued",
      actorId,
      actorEmail: req.user?.email ?? null,
      actorRole: req.user?.role ?? null,
      ...reqMeta(req),
      statusCode: 200,
      detail: `Transfer request ${full?.request.transferNumber} issued`,
    });
    res.json(serializeRequest(full!.request as TransferRecord, full!.lines as TransferRecord[]));
  },
);

// ─── Receive: in_transit → destination available ─────────────────────────────
router.post(
  "/:id/receive",
  requireWriteRole("supervisor", "director"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = ReceiveTransferBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const actorId = req.user!.userId;
    const rawIdempotencyKey = (req.header("idempotency-key") ?? "").trim().slice(0, 100);
    const storedIdempotencyKey = rawIdempotencyKey
      ? scopedIdempotencyKey("receive", rawIdempotencyKey)
      : null;
    let outcome: any;

    try {
      outcome = await db.transaction(async (tx) => {
        if (rawIdempotencyKey) {
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtext(${idempotencyAdvisoryKey("transfer-rcv-idem", rawIdempotencyKey)}))`,
          );
          const [replay] = await tx
            .select()
            .from(transferRequestsTable)
            .where(eq(transferRequestsTable.idempotencyKey, storedIdempotencyKey!))
            .limit(1);
          if (replay) return { status: "replay" as const, id: replay.id };
        }

        const [request] = await tx
          .select()
          .from(transferRequestsTable)
          .where(eq(transferRequestsTable.id, req.params.id as string))
          .for("update")
          .limit(1);
        if (!request) return { status: "not_found" as const };
        if (request.status !== "in_transit") {
          return { status: "invalid_state" as const, current: request.status };
        }
        const lineIds = parsed.data.lines.map((line) => line.line_id);
        const lines = await tx
          .select()
          .from(transferLinesTable)
          .where(
            and(
              eq(transferLinesTable.transferRequestId, request.id),
              inArray(transferLinesTable.id, lineIds),
            ),
          )
          .orderBy(asc(transferLinesTable.lineNumber))
          .for("update");
        if (lines.length !== lineIds.length) {
          const found = new Set(lines.map((line) => line.id));
          return { status: "bad_line" as const, line_id: lineIds.find((id) => !found.has(id)) };
        }

        for (const received of parsed.data.lines) {
          const line = lines.find((candidate) => candidate.id === received.line_id)!;
          const outstanding = Number(line.issuedQty ?? 0) - Number(line.receivedQty ?? 0);
          if (received.quantity > outstanding + 0.0005) {
            return { status: "over_receive" as const, line: line.lineNumber, outstanding };
          }
          const source = line.lotId ? await lockLotSource(tx, line.lotId) : null;
          if (line.lotId && !source) {
            return { status: "source_unavailable" as const };
          }
          const sourceLineId = source?.sourceLineId ?? null;
          const movement = {
            materialId: line.materialId,
            uom: line.uom,
            sourceDocumentType: TRANSFER_SOURCE_DOCUMENT_TYPE,
            sourceDocumentId: request.id,
            sourceLineId,
            lotId: line.lotId,
            actorId,
            actorName: req.user?.email ?? null,
            createdBy: actorId,
          };
          await tx.insert(inventoryTransactionsTable).values([
            {
              ...movement,
              quantity: String(-received.quantity),
              stockState: "in_transit",
              transactionType: "TRANSFER_IN",
              warehouseId: request.sourceWarehouseId,
              locationId: request.sourceLocationId,
              binId: request.sourceBinId,
            },
            {
              ...movement,
              quantity: String(received.quantity),
              stockState: "available",
              transactionType: "TRANSFER_IN",
              warehouseId: request.destinationWarehouseId,
              locationId: request.destinationLocationId,
              binId: request.destinationBinId,
            },
          ]);
          const newReceived = Number(line.receivedQty ?? 0) + received.quantity;
          await tx
            .update(transferLinesTable)
            .set({
              receivedQty: String(newReceived),
              status: newReceived >= Number(line.issuedQty ?? 0) ? "fully_received" : "partially_received",
            })
            .where(eq(transferLinesTable.id, line.id));
        }

        const allLines = await tx
          .select()
          .from(transferLinesTable)
          .where(eq(transferLinesTable.transferRequestId, request.id));
        const allReceived = allLines.every(
          (line) => Number(line.receivedQty ?? 0) >= Number(line.issuedQty ?? 0),
        );
        const [updated] = await tx
          .update(transferRequestsTable)
          .set({
            status: allReceived ? "received" : "in_transit",
            receivedBy: actorId,
            receivedAt: new Date(),
            idempotencyKey: storedIdempotencyKey,
          })
          .where(eq(transferRequestsTable.id, request.id))
          .returning();
        await tx.insert(outboxEventsTable).values({
          aggregateType: "transfer_request",
          aggregateId: request.id,
          eventType: "TRANSFER_RECEIVED",
          payload: {
            transfer_request_number: request.transferNumber,
            partial: !allReceived,
            lines: parsed.data.lines.length,
            actor_id: actorId,
          },
        });
        return { status: "ok" as const, id: updated.id };
      });
    } catch (error: any) {
      const pgCode = error?.code ?? error?.cause?.code;
      if (rawIdempotencyKey && pgCode === "23505") {
        const [replay] = await db
          .select()
          .from(transferRequestsTable)
          .where(eq(transferRequestsTable.idempotencyKey, storedIdempotencyKey!))
          .limit(1);
        if (replay) outcome = { status: "replay" as const, id: replay.id };
        else throw error;
      } else {
        throw error;
      }
    }

    if (outcome.status === "replay") {
      const full = await loadRequest(outcome.id);
      res.json(serializeRequest(full!.request as TransferRecord, full!.lines as TransferRecord[]));
      return;
    }
    if (returnRequest(res, outcome)) return;
    const full = await loadRequest(outcome.id as string);
    void recordSecurityEvent({
      eventType: "transfer.received",
      actorId,
      actorEmail: req.user?.email ?? null,
      actorRole: req.user?.role ?? null,
      ...reqMeta(req),
      statusCode: 200,
      detail: `Transfer request ${full?.request.transferNumber} received`,
    });
    res.json(serializeRequest(full!.request as TransferRecord, full!.lines as TransferRecord[]));
  },
);

// ─── Reject in transit: reverse unreceived quantity to source ─────────────────
router.post(
  "/:id/reject",
  requireWriteRole("supervisor", "director"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = RejectTransferBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const actorId = req.user!.userId;
    const outcome = await db.transaction(async (tx) => {
      const [request] = await tx
        .select()
        .from(transferRequestsTable)
        .where(eq(transferRequestsTable.id, req.params.id as string))
        .for("update")
        .limit(1);
      if (!request) return { status: "not_found" as const };
      if (request.status !== "in_transit") {
        return { status: "invalid_state" as const, current: request.status };
      }
      const lines = await tx
        .select()
        .from(transferLinesTable)
        .where(eq(transferLinesTable.transferRequestId, request.id))
        .orderBy(asc(transferLinesTable.lineNumber))
        .for("update");
      if (lines.some((line) => Number(line.receivedQty ?? 0) > 0)) {
        return { status: "received" as const };
      }

      for (const line of lines) {
        const outstanding = Number(line.issuedQty ?? 0) - Number(line.receivedQty ?? 0);
        if (outstanding <= 0) continue;
        const source = line.lotId ? await lockLotSource(tx, line.lotId) : null;
        if (line.lotId && !source) return { status: "source_unavailable" as const };
        if (!line.lotId) await lockMaterialScope(tx, line.materialId);
        const movement = {
          materialId: line.materialId,
          uom: line.uom,
          sourceDocumentType: TRANSFER_SOURCE_DOCUMENT_TYPE,
          sourceDocumentId: request.id,
          sourceLineId: source?.sourceLineId ?? null,
          lotId: line.lotId,
          warehouseId: request.sourceWarehouseId,
          locationId: request.sourceLocationId,
          binId: request.sourceBinId,
          actorId,
          actorName: req.user?.email ?? null,
          createdBy: actorId,
        };
        const [reversalOut] = await tx.insert(inventoryTransactionsTable).values([
          { ...movement, quantity: String(-outstanding), stockState: "in_transit", transactionType: "TRANSFER_REVERSAL" },
          { ...movement, quantity: String(outstanding), stockState: "available", transactionType: "TRANSFER_REVERSAL" },
        ]).returning({ id: inventoryTransactionsTable.id });
        const [originalMovement] = await tx
          .select({ id: inventoryTransactionsTable.id })
          .from(inventoryTransactionsTable)
          .where(
            and(
              eq(inventoryTransactionsTable.transactionType, "TRANSFER_OUT"),
              eq(inventoryTransactionsTable.sourceDocumentType, TRANSFER_SOURCE_DOCUMENT_TYPE),
              eq(inventoryTransactionsTable.sourceDocumentId, request.id),
              source?.sourceLineId
                ? eq(inventoryTransactionsTable.sourceLineId, source.sourceLineId)
                : isNull(inventoryTransactionsTable.sourceLineId),
              eq(inventoryTransactionsTable.stockState, "available"),
              sql`${inventoryTransactionsTable.quantity} < 0`,
            ),
          )
          .limit(1);
        if (originalMovement) {
          await restoreValuationForMovement(tx, {
            movementId: reversalOut.id,
            materialId: line.materialId,
            quantity: String(outstanding),
            sourceDocumentType: TRANSFER_SOURCE_DOCUMENT_TYPE,
            sourceDocumentId: request.id,
            sourceLineId: source?.sourceLineId ?? null,
            originalMovementId: originalMovement.id,
            reversedMovementId: reversalOut.id,
          });
        }
        await tx
          .update(transferLinesTable)
          .set({ status: "rejected" })
          .where(eq(transferLinesTable.id, line.id));
      }

      const [updated] = await tx
        .update(transferRequestsTable)
        .set({ status: "rejected" })
        .where(eq(transferRequestsTable.id, request.id))
        .returning();
      await tx.insert(outboxEventsTable).values({
        aggregateType: "transfer_request",
        aggregateId: request.id,
        eventType: "TRANSFER_REJECTED",
        payload: {
          transfer_request_number: request.transferNumber,
          reason: parsed.data.reason,
          actor_id: actorId,
        },
      });
      return { status: "ok" as const, id: updated.id };
    });

    if (outcome.status === "source_unavailable") {
      res.status(409).json({ error: "TRANSFER_SOURCE_UNAVAILABLE" });
      return;
    }
    if (returnRequest(res, outcome)) return;
    const full = await loadRequest(outcome.id as string);
    res.json(serializeRequest(full!.request as TransferRecord, full!.lines as TransferRecord[]));
  },
);

// ─── Authenticated reads ──────────────────────────────────────────────────────
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const query = req.query as Record<string, string | undefined>;
  const conditions = [
    query.status ? eq(transferRequestsTable.status, query.status as any) : undefined,
    query.source_warehouse_id
      ? eq(transferRequestsTable.sourceWarehouseId, query.source_warehouse_id)
      : undefined,
    query.destination_warehouse_id
      ? eq(transferRequestsTable.destinationWarehouseId, query.destination_warehouse_id)
      : undefined,
  ].filter(Boolean) as any[];
  const where = conditions.length ? and(...conditions) : undefined;
  const [total] = await db
    .select({ count: count() })
    .from(transferRequestsTable)
    .where(where);
  const requests = await db
    .select()
    .from(transferRequestsTable)
    .where(where)
    .orderBy(asc(transferRequestsTable.createdAt))
    .limit(200);
  const items = [];
  for (const request of requests) {
    const full = await loadRequest(request.id);
    if (full) items.push(serializeRequest(full.request as TransferRecord, full.lines as TransferRecord[]));
  }
  res.json({ items, meta: { total: Number(total?.count ?? 0) } });
});

router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const full = await loadRequest(req.params.id as string);
  if (!full) {
    res.status(404).json({ error: "Transfer request not found" });
    return;
  }
  res.json(serializeRequest(full.request as TransferRecord, full.lines as TransferRecord[]));
});

export default router;