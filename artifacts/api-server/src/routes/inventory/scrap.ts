import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, count, eq, sql } from "drizzle-orm";
import {
  db,
  inventoryLotsTable,
  inventoryTransactionsTable,
  materialsTable,
  mfgProductionOrdersTable,
  outboxEventsTable,
  pool,
  scrapDocumentsTable,
  wipInventoryTable,
} from "@workspace/db";
import {
  ApproveScrapBody,
  CreateScrapBody,
  RejectScrapBody,
} from "@workspace/api-zod";
import { requireAuth, requireWriteRole } from "../../middleware/auth";
import { recordSecurityEvent, reqMeta } from "../../lib/security-events";

const router: IRouter = Router();
const SCRAP_SOURCE_DOCUMENT_TYPE = "scrap_document";

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

function serializeScrap(document: Record<string, any>): Record<string, unknown> {
  return {
    id: document.id,
    scrap_number: document.scrapNumber,
    production_order_id: document.productionOrderId,
    material_id: document.materialId,
    lot_id: document.lotId ?? null,
    stage_id: document.stageId ?? null,
    serial_number: document.serialNumber ?? null,
    source_warehouse_id: document.sourceWarehouseId,
    source_location_id: document.sourceLocationId ?? null,
    quantity: numify(document.quantity),
    uom: document.uom,
    reason: document.reason,
    notes: document.notes ?? null,
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
    const parsed = CreateScrapBody.safeParse(req.body);
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

    const wipConditions = [
      eq(wipInventoryTable.productionOrderId, body.production_order_id),
      eq(wipInventoryTable.materialId, body.material_id),
    ];
    if (body.lot_id) {
      wipConditions.push(eq(wipInventoryTable.lotId, body.lot_id));
    }
    const wipRows = await db
      .select({
        warehouseId: wipInventoryTable.warehouseId,
        locationId: wipInventoryTable.locationId,
      })
      .from(wipInventoryTable)
      .where(and(...wipConditions));
    if (!wipRows.length) {
      res.status(422).json({ error: "No WIP found for this production order/material/lot" });
      return;
    }

    const sourceWarehouses = [...new Set(wipRows.map((row) => row.warehouseId))];
    if (sourceWarehouses.length !== 1) {
      res.status(422).json({ error: "WIP spans multiple source warehouses; narrow by lot" });
      return;
    }
    const sourceLocations = [...new Set(wipRows.map((row) => row.locationId))];
    const sourceLocationId =
      sourceLocations.length === 1 ? sourceLocations[0] : null;

    const sequenceRows = await pool.query<{ seq: string }>(
      "SELECT nextval('scrap_seq') AS seq",
    );
    const scrapNumber = `SCR-${todayDateStr()}-${String(sequenceRows.rows[0].seq).padStart(4, "0")}`;

    const [created] = await db
      .insert(scrapDocumentsTable)
      .values({
        scrapNumber,
        productionOrderId: body.production_order_id,
        materialId: body.material_id,
        lotId: body.lot_id ?? null,
        stageId: body.stage_id ?? null,
        serialNumber: body.serial_number ?? null,
        sourceWarehouseId: sourceWarehouses[0],
        sourceLocationId,
        quantity: String(body.quantity),
        uom: material.uom,
        reason: body.reason,
        notes: body.notes ?? null,
        status: "draft",
        createdBy: actorId,
      })
      .returning();

    void recordSecurityEvent({
      eventType: "scrap.draft_created",
      actorId,
      actorEmail: req.user?.email ?? null,
      actorRole: req.user?.role ?? null,
      ...reqMeta(req),
      statusCode: 201,
      detail: `Scrap draft ${scrapNumber} qty ${body.quantity}`,
    });
    res.status(201).json(serializeScrap(created as Record<string, any>));
  },
);

router.post(
  "/:id/approve",
  requireWriteRole("director"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = ApproveScrapBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const actorId = req.user!.userId;
    const outcome = await db.transaction(async (tx) => {
      const [document] = await tx
        .select()
        .from(scrapDocumentsTable)
        .where(eq(scrapDocumentsTable.id, req.params.id as string))
        .for("update")
        .limit(1);
      if (!document) return { status: "not_found" as const };
      if (document.status !== "draft") {
        return { status: "invalid_state" as const, current: document.status };
      }
      const [updated] = await tx
        .update(scrapDocumentsTable)
        .set({ status: "approved", approvedBy: actorId, approvedAt: new Date() })
        .where(eq(scrapDocumentsTable.id, document.id))
        .returning();
      return { status: "ok" as const, document: updated };
    });

    if (outcome.status === "not_found") {
      res.status(404).json({ error: "Scrap not found" });
      return;
    }
    if (outcome.status === "invalid_state") {
      res.status(409).json({ error: `Scrap cannot be approved from status '${outcome.current}'` });
      return;
    }
    void recordSecurityEvent({
      eventType: "scrap.approved",
      actorId,
      actorEmail: req.user?.email ?? null,
      actorRole: req.user?.role ?? null,
      ...reqMeta(req),
      statusCode: 200,
      detail: `Scrap ${outcome.document.scrapNumber} approved`,
    });
    res.json(serializeScrap(outcome.document as Record<string, any>));
  },
);

router.post(
  "/:id/reject",
  requireWriteRole("supervisor", "director"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = RejectScrapBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const actorId = req.user!.userId;
    const outcome = await db.transaction(async (tx) => {
      const [document] = await tx
        .select()
        .from(scrapDocumentsTable)
        .where(eq(scrapDocumentsTable.id, req.params.id as string))
        .for("update")
        .limit(1);
      if (!document) return { status: "not_found" as const };
      if (!["draft", "approved"].includes(document.status)) {
        return { status: "invalid_state" as const, current: document.status };
      }
      const [updated] = await tx
        .update(scrapDocumentsTable)
        .set({ status: "rejected" })
        .where(eq(scrapDocumentsTable.id, document.id))
        .returning();
      return { status: "ok" as const, document: updated };
    });

    if (outcome.status === "not_found") {
      res.status(404).json({ error: "Scrap not found" });
      return;
    }
    if (outcome.status === "invalid_state") {
      res.status(409).json({ error: `Scrap cannot be rejected from status '${outcome.current}'` });
      return;
    }
    void recordSecurityEvent({
      eventType: "scrap.rejected",
      actorId,
      actorEmail: req.user?.email ?? null,
      actorRole: req.user?.role ?? null,
      ...reqMeta(req),
      statusCode: 200,
      detail: `Scrap ${outcome.document.scrapNumber} rejected: ${parsed.data.reason}`,
    });
    res.json(serializeScrap(outcome.document as Record<string, any>));
  },
);

router.post(
  "/:id/post",
  requireWriteRole("supervisor", "director"),
  async (req: Request, res: Response): Promise<void> => {
    const actorId = req.user!.userId;
    const actorName = req.user?.email ?? null;
    const idemKey = (req.header("idempotency-key") ?? "").slice(0, 100) || null;

    let outcome:
      | { status: "not_found" }
      | { status: "already" }
      | { status: "replay"; document: Record<string, any> }
      | { status: "invalid_state"; current: string }
      | { status: "over_scrap"; totalRemaining: number }
      | { status: "source_unavailable" }
      | { status: "ok"; document: Record<string, any> };

    try {
      outcome = await db.transaction(async (tx) => {
        if (idemKey) {
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtext(${`scrap-idem:${idemKey}`}))`,
          );
          const [replay] = await tx
            .select()
            .from(scrapDocumentsTable)
            .where(eq(scrapDocumentsTable.idempotencyKey, idemKey))
            .limit(1);
          if (replay) return { status: "replay" as const, document: replay };
        }

        const [document] = await tx
          .select()
          .from(scrapDocumentsTable)
          .where(eq(scrapDocumentsTable.id, req.params.id as string))
          .for("update")
          .limit(1);
        if (!document) return { status: "not_found" as const };
        if (document.status === "posted") return { status: "already" as const };
        if (document.status !== "approved") {
          return { status: "invalid_state" as const, current: document.status };
        }

        const wipConditions = [
          eq(wipInventoryTable.productionOrderId, document.productionOrderId),
          eq(wipInventoryTable.materialId, document.materialId),
          sql`${wipInventoryTable.status} IN ('active', 'partially_consumed')`,
          sql`${wipInventoryTable.remainingQty} > 0`,
        ];
        if (document.lotId) {
          wipConditions.push(eq(wipInventoryTable.lotId, document.lotId));
        }
        const wipRows = await tx
          .select()
          .from(wipInventoryTable)
          .where(and(...wipConditions))
          .orderBy(asc(wipInventoryTable.createdAt), asc(wipInventoryTable.id))
          .for("update");

        const quantity = Number(document.quantity);
        const totalRemaining = wipRows.reduce(
          (sum, row) => sum + Number(row.remainingQty),
          0,
        );
        if (quantity > totalRemaining + 0.0005) {
          return { status: "over_scrap" as const, totalRemaining };
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
          const scrappedQty = roundQty(Number(row.scrappedQty) + take);
          const left = roundQty(
            Number(row.issuedQty) -
              Number(row.consumedQty) -
              Number(row.returnedQty) -
              scrappedQty,
          );
          const lot = lotsById.get(row.lotId!);
          if (!lot?.grnLineId) return { status: "source_unavailable" as const };

          const ledgerBase = {
            materialId: document.materialId,
            uom: document.uom,
            transactionType: "SCRAP" as const,
            sourceDocumentType: SCRAP_SOURCE_DOCUMENT_TYPE,
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
            { ...ledgerBase, quantity: String(-take), stockState: "wip" },
            { ...ledgerBase, quantity: String(take), stockState: "scrapped" },
          ]);
          await tx
            .update(wipInventoryTable)
            .set({
              scrappedQty: String(scrappedQty),
              remainingQty: String(left),
              status: left <= 0.0005 ? "fully_consumed" : "partially_consumed",
              updatedAt: new Date(),
            })
            .where(eq(wipInventoryTable.id, row.id));
          remaining = roundQty(remaining - take);
        }

        const [updated] = await tx
          .update(scrapDocumentsTable)
          .set({
            status: "posted",
            postedBy: actorId,
            postedAt: new Date(),
            idempotencyKey: idemKey,
          })
          .where(eq(scrapDocumentsTable.id, document.id))
          .returning();
        await tx.insert(outboxEventsTable).values({
          aggregateType: "scrap_document",
          aggregateId: document.id,
          eventType: "SCRAP_POSTED",
          payload: {
            scrap_number: document.scrapNumber,
            production_order_id: document.productionOrderId,
            material_id: document.materialId,
            lot_id: document.lotId,
            quantity,
            actor_id: actorId,
          },
        });
        return { status: "ok" as const, document: updated };
      });
    } catch (error: any) {
      const pgCode = error?.code ?? error?.cause?.code;
      if (idemKey && pgCode === "23505") {
        const [replay] = await db
          .select()
          .from(scrapDocumentsTable)
          .where(eq(scrapDocumentsTable.idempotencyKey, idemKey))
          .limit(1);
        if (replay) {
          outcome = { status: "replay", document: replay };
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }

    if (outcome.status === "not_found") {
      res.status(404).json({ error: "Scrap not found" });
      return;
    }
    if (outcome.status === "already") {
      res.status(409).json({ error: "Scrap is already posted" });
      return;
    }
    if (outcome.status === "replay") {
      res.status(200).json(serializeScrap(outcome.document));
      return;
    }
    if (outcome.status === "invalid_state") {
      res.status(409).json({ error: `Scrap cannot be posted from status '${outcome.current}'` });
      return;
    }
    if (outcome.status === "over_scrap") {
      res.status(409).json({
        error: "OVER_SCRAP",
        details: { total_remaining: roundQty(outcome.totalRemaining) },
      });
      return;
    }
    if (outcome.status === "source_unavailable") {
      res.status(409).json({ error: "WIP_SOURCE_LINE_UNAVAILABLE" });
      return;
    }

    void recordSecurityEvent({
      eventType: "scrap.posted",
      actorId,
      actorEmail: req.user?.email ?? null,
      actorRole: req.user?.role ?? null,
      ...reqMeta(req),
      statusCode: 200,
      detail: `Scrap ${outcome.document.scrapNumber} posted (−wip/+scrapped)`,
    });
    res.json(serializeScrap(outcome.document));
  },
);

router.get("/", async (req: Request, res: Response): Promise<void> => {
  const query = req.query as Record<string, string | undefined>;
  const conditions = [
    query.production_order_id
      ? eq(scrapDocumentsTable.productionOrderId, query.production_order_id)
      : undefined,
    query.material_id ? eq(scrapDocumentsTable.materialId, query.material_id) : undefined,
    query.status ? eq(scrapDocumentsTable.status, query.status as any) : undefined,
  ].filter(Boolean) as any[];
  const where = conditions.length ? and(...conditions) : undefined;
  const [total] = await db
    .select({ count: count() })
    .from(scrapDocumentsTable)
    .where(where);
  const rows = await db
    .select()
    .from(scrapDocumentsTable)
    .where(where)
    .orderBy(asc(scrapDocumentsTable.createdAt))
    .limit(200);
  res.json({
    items: rows.map((row) => serializeScrap(row as Record<string, any>)),
    meta: { total: Number(total?.count ?? 0) },
  });
});

router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const [document] = await db
    .select()
    .from(scrapDocumentsTable)
    .where(eq(scrapDocumentsTable.id, req.params.id as string))
    .limit(1);
  if (!document) {
    res.status(404).json({ error: "Scrap not found" });
    return;
  }
  res.json(serializeScrap(document as Record<string, any>));
});

export default router;