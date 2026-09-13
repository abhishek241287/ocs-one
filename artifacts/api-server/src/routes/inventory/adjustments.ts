import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, count, eq, sql } from "drizzle-orm";
import {
  db,
  grnLineItemsTable,
  inventoryAdjustmentsTable,
  inventoryLotsTable,
  inventoryTransactionsTable,
  materialsTable,
  outboxEventsTable,
  pool,
  warehousesTable,
} from "@workspace/db";
import {
  ApproveAdjustmentBody,
  CreateAdjustmentBody,
  RejectAdjustmentBody,
  SubmitAdjustmentBody,
} from "@workspace/api-zod";
import { requireAuth, requireWriteRole } from "../../middleware/auth";
import { recordSecurityEvent, reqMeta } from "../../lib/security-events";

const router: IRouter = Router();
const ADJUSTMENT_SOURCE_DOCUMENT_TYPE = "inventory_adjustment";

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

function serializeAdjustment(document: Record<string, any>): Record<string, unknown> {
  return {
    id: document.id,
    adjustment_number: document.adjustmentNumber,
    material_id: document.materialId,
    lot_id: document.lotId ?? null,
    warehouse_id: document.warehouseId,
    location_id: document.locationId ?? null,
    bin_id: document.binId ?? null,
    type: document.type,
    quantity: numify(document.quantity),
    uom: document.uom,
    system_qty: numify(document.systemQty),
    physical_qty: numify(document.physicalQty),
    variance: numify(document.variance),
    reason: document.reason,
    count_reference: document.countReference ?? null,
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

async function availableAt(
  materialId: string,
  warehouseId: string,
  locationId?: string | null,
  binId?: string | null,
  lotId?: string | null,
): Promise<number> {
  const conditions = [
    eq(inventoryTransactionsTable.materialId, materialId),
    eq(inventoryTransactionsTable.stockState, "available"),
    eq(inventoryTransactionsTable.warehouseId, warehouseId),
  ];
  if (locationId) conditions.push(eq(inventoryTransactionsTable.locationId, locationId));
  if (binId) conditions.push(eq(inventoryTransactionsTable.binId, binId));
  if (lotId) conditions.push(eq(inventoryTransactionsTable.lotId, lotId));
  const [row] = await db
    .select({ sum: sql<string>`coalesce(sum(${inventoryTransactionsTable.quantity}), 0)` })
    .from(inventoryTransactionsTable)
    .where(and(...conditions));
  return roundQty(Number(row?.sum ?? 0));
}

router.post(
  "/",
  requireWriteRole("supervisor", "director"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = CreateAdjustmentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const body = parsed.data;
    const actorId = req.user!.userId;

    if (body.type === "negative" && !body.lot_id) {
      res.status(422).json({
        error: "NEGATIVE_ADJUSTMENT_REQUIRES_LOT",
        details: "Negative adjustments must be lot-scoped for concurrency-safe stock protection",
      });
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
    const [warehouse] = await db
      .select({ id: warehousesTable.id })
      .from(warehousesTable)
      .where(eq(warehousesTable.id, body.warehouse_id))
      .limit(1);
    if (!warehouse) {
      res.status(400).json({ error: "Unknown warehouse id" });
      return;
    }
    if (body.lot_id) {
      const [lot] = await db
        .select({
          materialId: inventoryLotsTable.materialId,
          warehouseId: inventoryLotsTable.warehouseId,
        })
        .from(inventoryLotsTable)
        .where(eq(inventoryLotsTable.id, body.lot_id))
        .limit(1);
      if (!lot || lot.materialId !== body.material_id) {
        res.status(422).json({ error: "Lot does not match material" });
        return;
      }
      // A lot's warehouse is receipt provenance, not its current location.
      // Transfers move the signed ledger balance without rewriting the lot
      // header, so location validation is performed against the ledger at
      // post time rather than this immutable receipt attribute.
    }

    const systemQty = await availableAt(
      body.material_id,
      body.warehouse_id,
      body.location_id ?? null,
      body.bin_id ?? null,
      body.lot_id ?? null,
    );
    const physicalQty = roundQty(
      body.type === "positive" ? systemQty + body.quantity : systemQty - body.quantity,
    );
    const variance = roundQty(physicalQty - systemQty);
    const sequenceRows = await pool.query<{ seq: string }>(
      "SELECT nextval('adjustment_seq') AS seq",
    );
    const adjustmentNumber = `ADJ-${todayDateStr()}-${String(sequenceRows.rows[0].seq).padStart(4, "0")}`;

    const [created] = await db
      .insert(inventoryAdjustmentsTable)
      .values({
        adjustmentNumber,
        type: body.type,
        status: "draft",
        materialId: body.material_id,
        lotId: body.lot_id ?? null,
        warehouseId: body.warehouse_id,
        locationId: body.location_id ?? null,
        binId: body.bin_id ?? null,
        quantity: String(body.quantity),
        uom: material.uom,
        systemQty: String(systemQty),
        physicalQty: String(physicalQty),
        variance: String(variance),
        reason: body.reason,
        notes: body.notes ?? null,
        countReference: body.count_reference ?? null,
        createdBy: actorId,
      })
      .returning();

    void recordSecurityEvent({
      eventType: "adjustment.draft_created",
      actorId,
      actorEmail: req.user?.email ?? null,
      actorRole: req.user?.role ?? null,
      ...reqMeta(req),
      statusCode: 201,
      detail: `Adjustment draft ${adjustmentNumber} ${body.type} ${body.quantity}`,
    });
    res.status(201).json(serializeAdjustment(created as Record<string, any>));
  },
);

router.post(
  "/:id/submit",
  requireWriteRole("supervisor", "director"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = SubmitAdjustmentBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const outcome = await db.transaction(async (tx) => {
      const [document] = await tx
        .select()
        .from(inventoryAdjustmentsTable)
        .where(eq(inventoryAdjustmentsTable.id, req.params.id as string))
        .for("update")
        .limit(1);
      if (!document) return { status: "not_found" as const };
      if (document.status !== "draft") {
        return { status: "invalid_state" as const, current: document.status };
      }
      const [updated] = await tx
        .update(inventoryAdjustmentsTable)
        .set({ status: "submitted" })
        .where(eq(inventoryAdjustmentsTable.id, document.id))
        .returning();
      return { status: "ok" as const, document: updated };
    });

    if (outcome.status === "not_found") {
      res.status(404).json({ error: "Adjustment not found" });
      return;
    }
    if (outcome.status === "invalid_state") {
      res.status(409).json({ error: `Adjustment cannot be submitted from status '${outcome.current}'` });
      return;
    }
    res.json(serializeAdjustment(outcome.document as Record<string, any>));
  },
);

router.post(
  "/:id/approve",
  requireWriteRole("director"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = ApproveAdjustmentBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const actorId = req.user!.userId;
    const outcome = await db.transaction(async (tx) => {
      const [document] = await tx
        .select()
        .from(inventoryAdjustmentsTable)
        .where(eq(inventoryAdjustmentsTable.id, req.params.id as string))
        .for("update")
        .limit(1);
      if (!document) return { status: "not_found" as const };
      if (document.status !== "submitted") {
        return { status: "invalid_state" as const, current: document.status };
      }
      const [updated] = await tx
        .update(inventoryAdjustmentsTable)
        .set({ status: "approved", approvedBy: actorId, approvedAt: new Date() })
        .where(eq(inventoryAdjustmentsTable.id, document.id))
        .returning();
      return { status: "ok" as const, document: updated };
    });

    if (outcome.status === "not_found") {
      res.status(404).json({ error: "Adjustment not found" });
      return;
    }
    if (outcome.status === "invalid_state") {
      res.status(409).json({ error: `Adjustment cannot be approved from status '${outcome.current}'` });
      return;
    }
    void recordSecurityEvent({
      eventType: "adjustment.approved",
      actorId,
      actorEmail: req.user?.email ?? null,
      actorRole: req.user?.role ?? null,
      ...reqMeta(req),
      statusCode: 200,
      detail: `Adjustment ${outcome.document.adjustmentNumber} approved`,
    });
    res.json(serializeAdjustment(outcome.document as Record<string, any>));
  },
);

router.post(
  "/:id/reject",
  requireWriteRole("supervisor", "director"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = RejectAdjustmentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const outcome = await db.transaction(async (tx) => {
      const [document] = await tx
        .select()
        .from(inventoryAdjustmentsTable)
        .where(eq(inventoryAdjustmentsTable.id, req.params.id as string))
        .for("update")
        .limit(1);
      if (!document) return { status: "not_found" as const };
      if (!["draft", "submitted", "approved"].includes(document.status)) {
        return { status: "invalid_state" as const, current: document.status };
      }
      const [updated] = await tx
        .update(inventoryAdjustmentsTable)
        .set({ status: "rejected" })
        .where(eq(inventoryAdjustmentsTable.id, document.id))
        .returning();
      return { status: "ok" as const, document: updated };
    });

    if (outcome.status === "not_found") {
      res.status(404).json({ error: "Adjustment not found" });
      return;
    }
    if (outcome.status === "invalid_state") {
      res.status(409).json({ error: `Adjustment cannot be rejected from status '${outcome.current}'` });
      return;
    }
    void recordSecurityEvent({
      eventType: "adjustment.rejected",
      actorId: req.user!.userId,
      actorEmail: req.user?.email ?? null,
      actorRole: req.user?.role ?? null,
      ...reqMeta(req),
      statusCode: 200,
      detail: `Adjustment ${outcome.document.adjustmentNumber} rejected: ${parsed.data.reason}`,
    });
    res.json(serializeAdjustment(outcome.document as Record<string, any>));
  },
);

type PostOutcome =
  | { status: "not_found" }
  | { status: "already" }
  | { status: "replay"; document: Record<string, any> }
  | { status: "invalid_state"; current: string }
  | { status: "no_lot" }
  | { status: "source_unavailable" }
  | { status: "negative_stock"; available: number; requested: number }
  | { status: "ok"; document: Record<string, any> };

router.post(
  "/:id/post",
  requireWriteRole("supervisor", "director"),
  async (req: Request, res: Response): Promise<void> => {
    const actorId = req.user!.userId;
    const idemKey = (req.header("idempotency-key") ?? "").slice(0, 100) || null;
    let outcome: PostOutcome;

    try {
      outcome = await db.transaction(async (tx) => {
        if (idemKey) {
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtext(${`adjust-idem:${idemKey}`}))`,
          );
          const [replay] = await tx
            .select()
            .from(inventoryAdjustmentsTable)
            .where(eq(inventoryAdjustmentsTable.idempotencyKey, idemKey))
            .limit(1);
          if (replay) {
            return { status: "replay" as const, document: replay as Record<string, any> };
          }
        }

        const [document] = await tx
          .select()
          .from(inventoryAdjustmentsTable)
          .where(eq(inventoryAdjustmentsTable.id, req.params.id as string))
          .for("update")
          .limit(1);
        if (!document) return { status: "not_found" as const };
        if (document.status === "posted") return { status: "already" as const };
        if (document.status !== "approved") {
          return { status: "invalid_state" as const, current: document.status };
        }

        const quantity = roundQty(Number(document.quantity));
        let sourceLineId: string | null = null;
        let available = 0;

        if (document.type === "negative" && !document.lotId) {
          return { status: "no_lot" as const };
        }

        if (document.lotId) {
          const [lot] = await tx
            .select()
            .from(inventoryLotsTable)
            .where(eq(inventoryLotsTable.id, document.lotId))
            .for("update")
            .limit(1);
          if (
            !lot ||
            lot.materialId !== document.materialId ||
            !lot.grnLineId
          ) {
            return { status: "source_unavailable" as const };
          }
          const [line] = await tx
            .select({ id: grnLineItemsTable.id })
            .from(grnLineItemsTable)
            .where(eq(grnLineItemsTable.id, lot.grnLineId))
            .for("update")
            .limit(1);
          if (!line) return { status: "source_unavailable" as const };
          sourceLineId = lot.grnLineId;

          if (document.type === "negative") {
            const balanceConditions = [
              eq(inventoryTransactionsTable.materialId, document.materialId),
              eq(inventoryTransactionsTable.stockState, "available"),
              eq(inventoryTransactionsTable.warehouseId, document.warehouseId),
              eq(inventoryTransactionsTable.lotId, document.lotId),
            ];
            if (document.locationId) {
              balanceConditions.push(eq(inventoryTransactionsTable.locationId, document.locationId));
            }
            if (document.binId) {
              balanceConditions.push(eq(inventoryTransactionsTable.binId, document.binId));
            }
            const [balance] = await tx
              .select({
                sum: sql<string>`coalesce(sum(${inventoryTransactionsTable.quantity}), 0)`,
              })
              .from(inventoryTransactionsTable)
              .where(and(...balanceConditions));
            available = roundQty(Number(balance?.sum ?? 0));
            if (quantity > available + 0.0005) {
              return { status: "negative_stock" as const, available, requested: quantity };
            }
          }
        } else {
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtext(${`reservation-material:${document.materialId}`}))`,
          );
        }

        const [updated] = await tx
          .update(inventoryAdjustmentsTable)
          .set({
            status: "posted",
            postedBy: actorId,
            postedAt: new Date(),
            idempotencyKey: idemKey,
          })
          .where(eq(inventoryAdjustmentsTable.id, document.id))
          .returning();

        await tx.insert(inventoryTransactionsTable).values({
          materialId: document.materialId,
          quantity: document.type === "positive" ? String(quantity) : String(-quantity),
          uom: document.uom,
          stockState: "available",
          transactionType: document.type === "positive" ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
          sourceDocumentType: ADJUSTMENT_SOURCE_DOCUMENT_TYPE,
          sourceDocumentId: document.id,
          sourceLineId,
          lotId: document.lotId,
          warehouseId: document.warehouseId,
          locationId: document.locationId,
          binId: document.binId,
          actorId,
          actorName: req.user?.email ?? null,
          createdBy: actorId,
        });

        await tx.insert(outboxEventsTable).values({
          aggregateType: "inventory_adjustment",
          aggregateId: document.id,
          eventType: "ADJUSTMENT_POSTED",
          payload: {
            adjustment_number: document.adjustmentNumber,
            type: document.type,
            quantity,
            material_id: document.materialId,
            lot_id: document.lotId,
            warehouse_id: document.warehouseId,
            system_qty: Number(document.systemQty),
            physical_qty: Number(document.physicalQty),
            actor_id: actorId,
          },
        });

        return { status: "ok" as const, document: updated as Record<string, any> };
      });
    } catch (error: any) {
      const pgCode = error?.code ?? error?.cause?.code;
      if (idemKey && pgCode === "23505") {
        const [replay] = await db
          .select()
          .from(inventoryAdjustmentsTable)
          .where(eq(inventoryAdjustmentsTable.idempotencyKey, idemKey))
          .limit(1);
        if (replay) {
          outcome = { status: "replay", document: replay as Record<string, any> };
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }

    if (outcome.status === "not_found") {
      res.status(404).json({ error: "Adjustment not found" });
      return;
    }
    if (outcome.status === "already") {
      res.status(409).json({ error: "Adjustment is already posted" });
      return;
    }
    if (outcome.status === "replay") {
      res.status(200).json(serializeAdjustment(outcome.document));
      return;
    }
    if (outcome.status === "invalid_state") {
      res.status(409).json({ error: `Adjustment cannot be posted from status '${outcome.current}'` });
      return;
    }
    if (outcome.status === "no_lot") {
      res.status(422).json({ error: "NEGATIVE_ADJUSTMENT_REQUIRES_LOT" });
      return;
    }
    if (outcome.status === "source_unavailable") {
      res.status(409).json({ error: "ADJUSTMENT_SOURCE_UNAVAILABLE" });
      return;
    }
    if (outcome.status === "negative_stock") {
      res.status(409).json({
        error: "NEGATIVE_STOCK_PREVENTED",
        details: { requested: outcome.requested, available: outcome.available },
      });
      return;
    }

    void recordSecurityEvent({
      eventType: "adjustment.posted",
      actorId,
      actorEmail: req.user?.email ?? null,
      actorRole: req.user?.role ?? null,
      ...reqMeta(req),
      statusCode: 200,
      detail: `Adjustment ${outcome.document.adjustmentNumber} posted (${outcome.document.type} ${outcome.document.quantity})`,
    });
    res.json(serializeAdjustment(outcome.document));
  },
);

router.get("/", async (req: Request, res: Response): Promise<void> => {
  const query = req.query as Record<string, string | undefined>;
  const conditions = [
    query.material_id ? eq(inventoryAdjustmentsTable.materialId, query.material_id) : undefined,
    query.warehouse_id ? eq(inventoryAdjustmentsTable.warehouseId, query.warehouse_id) : undefined,
    query.status ? eq(inventoryAdjustmentsTable.status, query.status as any) : undefined,
  ].filter(Boolean) as any[];
  const where = conditions.length ? and(...conditions) : undefined;
  const [total] = await db
    .select({ count: count() })
    .from(inventoryAdjustmentsTable)
    .where(where);
  const rows = await db
    .select()
    .from(inventoryAdjustmentsTable)
    .where(where)
    .orderBy(asc(inventoryAdjustmentsTable.createdAt))
    .limit(200);
  res.json({
    items: rows.map((row) => serializeAdjustment(row as Record<string, any>)),
    meta: { total: Number(total?.count ?? 0) },
  });
});

router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const [document] = await db
    .select()
    .from(inventoryAdjustmentsTable)
    .where(eq(inventoryAdjustmentsTable.id, req.params.id as string))
    .limit(1);
  if (!document) {
    res.status(404).json({ error: "Adjustment not found" });
    return;
  }
  res.json(serializeAdjustment(document as Record<string, any>));
});

export default router;