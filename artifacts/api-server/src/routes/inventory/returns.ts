import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, count, eq, sql } from "drizzle-orm";
import {
  db,
  grnLineItemsTable,
  inventoryLotsTable,
  inventoryTransactionsTable,
  locationsTable,
  materialsTable,
  mfgProductionOrdersTable,
  outboxEventsTable,
  pool,
  returnDocumentsTable,
  warehousesTable,
  wipInventoryTable,
  wipIssueNotesTable,
  inventoryReservationsTable,
} from "@workspace/db";
import {
  ApproveReturnBody,
  CreateReturnBody,
  RejectReturnBody,
} from "@workspace/api-zod";
import { requireAuth, requireWriteRole } from "../../middleware/auth";
import { recordSecurityEvent, reqMeta } from "../../lib/security-events";

const router: IRouter = Router();
const RETURN_SOURCE_DOCUMENT_TYPE = "return_document";

router.use(requireAuth);

function numify(value: unknown): unknown {
  return typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)
    ? Number(value)
    : value;
}

function roundQty(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function todayDateStr(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
}

function serializeReturn(document: Record<string, any>): Record<string, unknown> {
  return {
    id: document.id,
    return_number: document.returnNumber,
    production_order_id: document.productionOrderId,
    material_id: document.materialId,
    wip_issue_note_id: document.wipIssueNoteId ?? null,
    original_issue_id: document.originalIssueId ?? null,
    lot_id: document.lotId ?? null,
    source_warehouse_id: document.sourceWarehouseId,
    source_location_id: document.sourceLocationId ?? null,
    destination_warehouse_id: document.destinationWarehouseId,
    destination_location_id: document.destinationLocationId ?? null,
    destination_bin_id: document.destinationBinId ?? null,
    quantity: numify(document.quantity),
    uom: document.uom,
    reason: document.reason,
    status: document.status,
    approved_by: document.approvedBy ?? null,
    approved_at: document.approvedAt ?? null,
    posted_by: document.postedBy ?? null,
    posted_at: document.postedAt ?? null,
    created_by: document.createdBy,
    created_at: document.createdAt,
  };
}

router.post(
  "/",
  requireWriteRole("supervisor", "director"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = CreateReturnBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const body = parsed.data;
    const actorId = req.user!.userId;
    const [productionOrder] = await db
      .select({ id: mfgProductionOrdersTable.id })
      .from(mfgProductionOrdersTable)
      .where(eq(mfgProductionOrdersTable.id, body.production_order_id))
      .limit(1);
    if (!productionOrder) {
      res.status(400).json({ error: "Unknown production order id" });
      return;
    }

    const [material] = await db
      .select({ id: materialsTable.id, uom: materialsTable.uom })
      .from(materialsTable)
      .where(eq(materialsTable.id, body.material_id))
      .limit(1);
    if (!material) {
      res.status(400).json({ error: "Unknown material id" });
      return;
    }

    const [destinationWarehouse] = await db
      .select({ id: warehousesTable.id, isActive: warehousesTable.isActive })
      .from(warehousesTable)
      .where(eq(warehousesTable.id, body.destination_warehouse_id))
      .limit(1);
    if (!destinationWarehouse || !destinationWarehouse.isActive) {
      res.status(400).json({ error: "Unknown or inactive destination warehouse id" });
      return;
    }

    if (body.destination_location_id) {
      const [destinationLocation] = await db
        .select({
          id: locationsTable.id,
          warehouseId: locationsTable.warehouseId,
          isActive: locationsTable.isActive,
        })
        .from(locationsTable)
        .where(eq(locationsTable.id, body.destination_location_id))
        .limit(1);
      if (
        !destinationLocation ||
        !destinationLocation.isActive ||
        destinationLocation.warehouseId !== body.destination_warehouse_id
      ) {
        res.status(400).json({ error: "Destination location does not belong to the destination warehouse" });
        return;
      }
    }

    const [note] = await db
      .select()
      .from(wipIssueNotesTable)
      .where(eq(wipIssueNotesTable.id, body.wip_issue_note_id))
      .limit(1);
    if (!note) {
      res.status(422).json({ error: "WIP issue note not found" });
      return;
    }
    if (note.productionOrderId !== body.production_order_id) {
      res.status(422).json({ error: "WIP issue note does not belong to this production order" });
      return;
    }
    if (!["active", "fully_issued"].includes(note.status)) {
      res.status(422).json({ error: `WIP issue note cannot be returned from status '${note.status}'` });
      return;
    }

    const [reservation] = await db
      .select({ materialId: inventoryReservationsTable.materialId })
      .from(inventoryReservationsTable)
      .where(eq(inventoryReservationsTable.id, note.reservationId))
      .limit(1);
    if (!reservation || reservation.materialId !== body.material_id) {
      res.status(422).json({ error: "WIP issue note does not belong to this material" });
      return;
    }

    const wipRows = await db
      .select({
        warehouseId: wipInventoryTable.warehouseId,
        locationId: wipInventoryTable.locationId,
        lotId: wipInventoryTable.lotId,
        remainingQty: wipInventoryTable.remainingQty,
      })
      .from(wipInventoryTable)
      .where(eq(wipInventoryTable.wipIssueNoteId, note.id));
    if (!wipRows.length) {
      res.status(422).json({ error: "WIP issue note has no WIP rows" });
      return;
    }
    if (body.lot_id && !wipRows.some((row) => row.lotId === body.lot_id)) {
      res.status(422).json({ error: "Lot is not part of this WIP issue note" });
      return;
    }

    const sourceWarehouses = [...new Set(wipRows.map((row) => row.warehouseId))];
    if (sourceWarehouses.length !== 1) {
      res.status(422).json({ error: "Issue note has mixed or missing source warehouses" });
      return;
    }
    const sourceLocations = [...new Set(wipRows.map((row) => row.locationId).filter(Boolean))];
    const sequenceRows = await pool.query<{ seq: string }>(
      "SELECT nextval('return_seq') AS seq",
    );
    const returnNumber = `RET-${todayDateStr()}-${String(sequenceRows.rows[0].seq).padStart(4, "0")}`;

    const [created] = await db
      .insert(returnDocumentsTable)
      .values({
        returnNumber,
        productionOrderId: body.production_order_id,
        materialId: body.material_id,
        lotId: body.lot_id ?? null,
        wipIssueNoteId: body.wip_issue_note_id,
        sourceWarehouseId: sourceWarehouses[0],
        sourceLocationId: sourceLocations.length === 1 ? sourceLocations[0] : null,
        destinationWarehouseId: body.destination_warehouse_id,
        destinationLocationId: body.destination_location_id ?? null,
        destinationBinId: body.destination_bin_id ?? null,
        quantity: String(body.quantity),
        uom: material.uom,
        reason: body.reason,
        status: "draft",
        createdBy: actorId,
      })
      .returning();

    void recordSecurityEvent({
      eventType: "return.draft_created",
      actorId,
      actorEmail: req.user?.email ?? null,
      actorRole: req.user?.role ?? null,
      ...reqMeta(req),
      statusCode: 201,
      detail: `Return draft ${returnNumber} qty ${body.quantity}`,
    });
    res.status(201).json(serializeReturn(created as Record<string, any>));
  },
);

router.post(
  "/:id/approve",
  requireWriteRole("director"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = ApproveReturnBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const actorId = req.user!.userId;
    const outcome = await db.transaction(async (tx) => {
      const [document] = await tx
        .select()
        .from(returnDocumentsTable)
        .where(eq(returnDocumentsTable.id, req.params.id as string))
        .for("update")
        .limit(1);
      if (!document) return { status: "not_found" as const };
      if (document.status !== "draft") {
        return { status: "invalid_state" as const, current: document.status };
      }
      const [updated] = await tx
        .update(returnDocumentsTable)
        .set({ status: "approved", approvedBy: actorId, approvedAt: new Date() })
        .where(eq(returnDocumentsTable.id, document.id))
        .returning();
      return { status: "ok" as const, document: updated };
    });

    if (outcome.status === "not_found") {
      res.status(404).json({ error: "Return not found" });
      return;
    }
    if (outcome.status === "invalid_state") {
      res.status(409).json({ error: `Return cannot be approved from status '${outcome.current}'` });
      return;
    }
    void recordSecurityEvent({
      eventType: "return.approved",
      actorId,
      actorEmail: req.user?.email ?? null,
      actorRole: req.user?.role ?? null,
      ...reqMeta(req),
      statusCode: 200,
      detail: `Return ${outcome.document.returnNumber} approved`,
    });
    res.json(serializeReturn(outcome.document as Record<string, any>));
  },
);

router.post(
  "/:id/reject",
  requireWriteRole("supervisor", "director"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = RejectReturnBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const actorId = req.user!.userId;
    const outcome = await db.transaction(async (tx) => {
      const [document] = await tx
        .select()
        .from(returnDocumentsTable)
        .where(eq(returnDocumentsTable.id, req.params.id as string))
        .for("update")
        .limit(1);
      if (!document) return { status: "not_found" as const };
      if (!["draft", "approved"].includes(document.status)) {
        return { status: "invalid_state" as const, current: document.status };
      }
      const [updated] = await tx
        .update(returnDocumentsTable)
        .set({ status: "rejected" })
        .where(eq(returnDocumentsTable.id, document.id))
        .returning();
      return { status: "ok" as const, document: updated };
    });

    if (outcome.status === "not_found") {
      res.status(404).json({ error: "Return not found" });
      return;
    }
    if (outcome.status === "invalid_state") {
      res.status(409).json({ error: `Return cannot be rejected from status '${outcome.current}'` });
      return;
    }
    void recordSecurityEvent({
      eventType: "return.rejected",
      actorId,
      actorEmail: req.user?.email ?? null,
      actorRole: req.user?.role ?? null,
      ...reqMeta(req),
      statusCode: 200,
      detail: `Return ${outcome.document.returnNumber} rejected: ${parsed.data.reason}`,
    });
    res.json(serializeReturn(outcome.document as Record<string, any>));
  },
);

router.post(
  "/:id/post",
  requireWriteRole("supervisor", "director"),
  async (req: Request, res: Response): Promise<void> => {
    const actorId = req.user!.userId;
    const actorName = req.user?.email ?? null;
    const idemKey = (req.header("idempotency-key") ?? "").slice(0, 100) || null;

    const outcome = await db.transaction(async (tx) => {
      if (idemKey) {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext(${`return-idem:${idemKey}`}))`,
        );
        const [replay] = await tx
          .select()
          .from(returnDocumentsTable)
          .where(eq(returnDocumentsTable.idempotencyKey, idemKey))
          .limit(1);
        if (replay) return { status: "replay" as const, document: replay };
      }

      const [document] = await tx
        .select()
        .from(returnDocumentsTable)
        .where(eq(returnDocumentsTable.id, req.params.id as string))
        .for("update")
        .limit(1);
      if (!document) return { status: "not_found" as const };
      if (document.status === "posted") return { status: "already" as const };
      if (document.status !== "approved") {
        return { status: "invalid_state" as const, current: document.status };
      }
      if (!document.wipIssueNoteId || document.originalIssueId) {
        return { status: "invalid_bridge" as const };
      }

      const conditions = [
        eq(wipInventoryTable.wipIssueNoteId, document.wipIssueNoteId),
        sql`${wipInventoryTable.status} IN ('active', 'partially_consumed')`,
        sql`${wipInventoryTable.remainingQty} > 0`,
      ];
      if (document.lotId) conditions.push(eq(wipInventoryTable.lotId, document.lotId));
      const wipRows = await tx
        .select()
        .from(wipInventoryTable)
        .where(and(...conditions))
        .orderBy(asc(wipInventoryTable.createdAt), asc(wipInventoryTable.id))
        .for("update");

      const quantity = Number(document.quantity);
      const totalRemaining = wipRows.reduce(
        (sum, row) => sum + Number(row.remainingQty),
        0,
      );
      if (quantity > totalRemaining + 0.0005) {
        return { status: "over_return" as const, totalRemaining };
      }

      const lotsById = new Map<string, typeof inventoryLotsTable.$inferSelect>();
      for (const row of wipRows) {
        if (!row.lotId) return { status: "source_unavailable" as const };
        const [lot] = await tx
          .select()
          .from(inventoryLotsTable)
          .where(eq(inventoryLotsTable.id, row.lotId))
          .limit(1);
        if (!lot?.grnLineId || lot.materialId !== document.materialId) {
          return { status: "source_unavailable" as const };
        }
        lotsById.set(lot.id, lot);
      }

      let remaining = quantity;
      for (const row of wipRows) {
        if (remaining <= 0.0005) break;
        const take = roundQty(Math.min(remaining, Number(row.remainingQty)));
        const returnedQty = roundQty(Number(row.returnedQty) + take);
        const left = roundQty(
          Number(row.issuedQty) -
            Number(row.consumedQty) -
            returnedQty -
            Number(row.scrappedQty),
        );
        const lot = lotsById.get(row.lotId!);
        if (!lot?.grnLineId) return { status: "source_unavailable" as const };

        const ledgerBase = {
          materialId: document.materialId,
          uom: document.uom,
          sourceDocumentType: RETURN_SOURCE_DOCUMENT_TYPE,
          sourceDocumentId: document.id,
          sourceLineId: lot.grnLineId,
          lotId: row.lotId,
          warehouseId: row.warehouseId,
          locationId: row.locationId,
          binId: lot.binId,
          productionOrderId: document.productionOrderId,
          actorId,
          actorName,
          createdBy: actorId,
        } as const;
        await tx.insert(inventoryTransactionsTable).values([
          {
            ...ledgerBase,
            quantity: String(-take),
            stockState: "wip",
            transactionType: "RETURN",
          },
          {
            ...ledgerBase,
            quantity: String(take),
            stockState: "available",
            warehouseId: document.destinationWarehouseId,
            locationId: document.destinationLocationId,
            binId: document.destinationBinId,
            transactionType: "RETURN",
          },
        ]);
        await tx
          .update(wipInventoryTable)
          .set({
            returnedQty: String(returnedQty),
            remainingQty: String(left),
            status: left <= 0.0005 ? "fully_consumed" : "partially_consumed",
            updatedAt: new Date(),
          })
          .where(eq(wipInventoryTable.id, row.id));
        remaining = roundQty(remaining - take);
      }

      const [updated] = await tx
        .update(returnDocumentsTable)
        .set({
          status: "posted",
          postedBy: actorId,
          postedAt: new Date(),
          idempotencyKey: idemKey,
        })
        .where(eq(returnDocumentsTable.id, document.id))
        .returning();
      await tx.insert(outboxEventsTable).values({
        aggregateType: "return_document",
        aggregateId: document.id,
        eventType: "RETURN_POSTED",
        payload: {
          return_number: document.returnNumber,
          production_order_id: document.productionOrderId,
          material_id: document.materialId,
          wip_issue_note_id: document.wipIssueNoteId,
          quantity,
          actor_id: actorId,
        },
      });
      return { status: "ok" as const, document: updated };
    });

    if (outcome.status === "not_found") {
      res.status(404).json({ error: "Return not found" });
      return;
    }
    if (outcome.status === "already") {
      res.status(409).json({ error: "Return is already posted" });
      return;
    }
    if (outcome.status === "replay") {
      res.status(200).json(serializeReturn(outcome.document as Record<string, any>));
      return;
    }
    if (outcome.status === "invalid_state") {
      res.status(409).json({ error: `Return cannot be posted from status '${outcome.current}'` });
      return;
    }
    if (outcome.status === "invalid_bridge") {
      res.status(409).json({ error: "RETURN_WIP_BRIDGE_INVALID" });
      return;
    }
    if (outcome.status === "over_return") {
      res.status(409).json({
        error: "OVER_RETURN",
        details: { total_remaining: roundQty(outcome.totalRemaining) },
      });
      return;
    }
    if (outcome.status === "source_unavailable") {
      res.status(409).json({ error: "WIP_SOURCE_LINE_UNAVAILABLE" });
      return;
    }

    void recordSecurityEvent({
      eventType: "return.posted",
      actorId,
      actorEmail: req.user?.email ?? null,
      actorRole: req.user?.role ?? null,
      ...reqMeta(req),
      statusCode: 200,
      detail: `Return ${outcome.document.returnNumber} posted (−wip/+available)`,
    });
    res.json(serializeReturn(outcome.document as Record<string, any>));
  },
);

router.get("/", async (req: Request, res: Response): Promise<void> => {
  const query = req.query as Record<string, string | undefined>;
  const conditions = [
    query.production_order_id
      ? eq(returnDocumentsTable.productionOrderId, query.production_order_id)
      : undefined,
    query.material_id ? eq(returnDocumentsTable.materialId, query.material_id) : undefined,
    query.status ? eq(returnDocumentsTable.status, query.status as any) : undefined,
  ].filter(Boolean) as any[];
  const where = conditions.length ? and(...conditions) : undefined;
  const [total] = await db
    .select({ count: count() })
    .from(returnDocumentsTable)
    .where(where);
  const rows = await db
    .select()
    .from(returnDocumentsTable)
    .where(where)
    .orderBy(asc(returnDocumentsTable.createdAt))
    .limit(200);
  res.json({
    items: rows.map((row) => serializeReturn(row as Record<string, any>)),
    meta: { total: Number(total?.count ?? 0) },
  });
});

router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const [document] = await db
    .select()
    .from(returnDocumentsTable)
    .where(eq(returnDocumentsTable.id, req.params.id as string))
    .limit(1);
  if (!document) {
    res.status(404).json({ error: "Return not found" });
    return;
  }
  res.json(serializeReturn(document as Record<string, any>));
});

export default router;