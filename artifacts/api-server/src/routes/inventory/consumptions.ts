import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import {
  bomSnapshotLinesTable,
  bomSnapshotsTable,
  consumptionConfirmationsTable,
  db,
  inventoryLotsTable,
  inventoryTransactionsTable,
  materialsTable,
  mfgProductionOrdersTable,
  outboxEventsTable,
  pool,
  wipInventoryTable,
} from "@workspace/db";
import {
  AdjustConsumptionBody,
  ConfirmConsumptionBody,
  CreateConsumptionBody,
} from "@workspace/api-zod";
import { requireWriteRole } from "../../middleware/auth";
import { recordSecurityEvent, reqMeta } from "../../lib/security-events";

const router: IRouter = Router();

// Writes are supervisor+director; reads pass for any authenticated user.
router.use(requireWriteRole("supervisor", "director"));

function numify(value: unknown): unknown {
  return typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)
    ? Number(value)
    : value;
}

function todayDateStr(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
}

function serializeConfirmation(
  confirmation: Record<string, any>,
): Record<string, unknown> {
  return {
    id: confirmation.id,
    confirmation_number: confirmation.confirmationNumber,
    production_order_id: confirmation.productionOrderId,
    stage_id: confirmation.stageId ?? null,
    material_id: confirmation.materialId,
    lot_id: confirmation.lotId ?? null,
    bom_snapshot_line_id: confirmation.bomSnapshotLineId ?? null,
    planned_qty: numify(confirmation.plannedQty),
    actual_qty: numify(confirmation.actualQty),
    variance_qty: numify(confirmation.varianceQty),
    uom: confirmation.uom,
    scrap_qty: numify(confirmation.scrapQty),
    return_qty: numify(confirmation.returnQty),
    reason: confirmation.reason ?? null,
    status: confirmation.status,
    confirmed_by: confirmation.confirmedBy ?? null,
    confirmed_at: confirmation.confirmedAt ?? null,
    adjusted_by: confirmation.adjustedBy ?? null,
    adjusted_at: confirmation.adjustedAt ?? null,
    created_at: confirmation.createdAt,
  };
}

// ─── POST /inventory/consumptions — create a draft ────────────────────────────
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateConsumptionBody.safeParse(req.body);
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

  let snapshotLine: {
    id: string;
    plannedQty: string;
  } | null = null;
  const [snapshot] = await db
    .select({ id: bomSnapshotsTable.id })
    .from(bomSnapshotsTable)
    .where(eq(bomSnapshotsTable.productionOrderId, body.production_order_id))
    .limit(1);

  if (snapshot) {
    const [line] = await db
      .select({
        id: bomSnapshotLinesTable.id,
        plannedQty: bomSnapshotLinesTable.plannedQty,
      })
      .from(bomSnapshotLinesTable)
      .where(
        and(
          eq(bomSnapshotLinesTable.bomSnapshotId, snapshot.id),
          eq(bomSnapshotLinesTable.materialId, body.material_id),
        ),
      )
      .orderBy(asc(bomSnapshotLinesTable.lineNumber))
      .limit(1);
    if (line) snapshotLine = line;
  }

  // Explicit input wins; otherwise use the BOM snapshot; otherwise a zero
  // variance default of actual quantity.
  const planned =
    body.planned_qty ??
    (snapshotLine ? Number(snapshotLine.plannedQty) : body.actual_qty);

  const sequenceRows = await pool.query<{ seq: string }>(
    "SELECT nextval('consumption_seq') AS seq",
  );
  const confirmationNumber = `CC-${todayDateStr()}-${String(sequenceRows.rows[0].seq).padStart(4, "0")}`;

  // The v1 schema has no created_by and requires confirmed_by even for drafts.
  // Store the creating actor there; confirmed_at remains NULL until confirmation.
  const [created] = await db
    .insert(consumptionConfirmationsTable)
    .values({
      confirmationNumber,
      productionOrderId: body.production_order_id,
      materialId: body.material_id,
      lotId: body.lot_id ?? null,
      bomSnapshotLineId: snapshotLine?.id ?? null,
      plannedQty: String(planned),
      actualQty: String(body.actual_qty),
      varianceQty: String(body.actual_qty - planned),
      uom: material.uom,
      reason: body.reason ?? null,
      status: "draft",
      confirmedBy: actorId,
    })
    .returning();

  void recordSecurityEvent({
    eventType: "consumption.draft_created",
    actorId,
    actorEmail: req.user?.email ?? null,
    actorRole: req.user?.role ?? null,
    ...reqMeta(req),
    statusCode: 201,
    detail: `Consumption draft ${confirmationNumber} (PO ${body.production_order_id}, actual ${body.actual_qty}, planned ${planned})`,
  });

  res.status(201).json(serializeConfirmation(created as Record<string, any>));
});

// ─── POST /inventory/consumptions/:id/confirm — the physical mutation ────────
router.post("/:id/confirm", async (req: Request, res: Response): Promise<void> => {
  const parsed = ConfirmConsumptionBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const actorId = req.user!.userId;
  const actorName = req.user?.email ?? null;

  const outcome = await db.transaction(async (tx) => {
    const [confirmation] = await tx
      .select()
      .from(consumptionConfirmationsTable)
      .where(eq(consumptionConfirmationsTable.id, req.params.id as string))
      .for("update")
      .limit(1);

    if (!confirmation) return { status: "not_found" as const };
    if (confirmation.status !== "draft") {
      return {
        status: "invalid_state" as const,
        current: confirmation.status,
      };
    }

    const actual = Number(confirmation.actualQty);
    const wipConditions = [
      eq(wipInventoryTable.productionOrderId, confirmation.productionOrderId),
      eq(wipInventoryTable.materialId, confirmation.materialId),
      sql`${wipInventoryTable.status} IN ('active', 'partially_consumed')`,
      sql`${wipInventoryTable.remainingQty} > 0`,
    ];
    if (confirmation.lotId) {
      wipConditions.push(eq(wipInventoryTable.lotId, confirmation.lotId));
    }

    // Consumption serializes against other confirmations via the confirmation
    // row lock and against consumption of the same WIP rows via these locks in
    // deterministic createdAt/id order. Issue creates new WIP rows; overlap is
    // reconciled by the invariant and the 70-F race test, not shared locking.
    const wipRows = await tx
      .select()
      .from(wipInventoryTable)
      .where(and(...wipConditions))
      .orderBy(asc(wipInventoryTable.createdAt), asc(wipInventoryTable.id))
      .for("update");

    const lotIds = wipRows
      .map((row) => row.lotId)
      .filter((lotId): lotId is string => Boolean(lotId));
    const lots = lotIds.length
      ? await tx
          .select()
          .from(inventoryLotsTable)
          .where(inArray(inventoryLotsTable.id, lotIds))
      : [];
    const lotsById = new Map(lots.map((lot) => [lot.id, lot]));

    if (
      wipRows.some(
        (row) => !row.lotId || !lotsById.get(row.lotId)?.grnLineId,
      )
    ) {
      return { status: "invalid_wip_source" as const };
    }

    const totalRemaining = wipRows.reduce(
      (sum, row) => sum + Number(row.remainingQty),
      0,
    );
    if (actual > totalRemaining) {
      return {
        status: "insufficient_wip" as const,
        actual,
        totalRemaining,
      };
    }

    let remaining = actual;
    for (const wip of wipRows) {
      if (remaining <= 0) break;

      const lot = lotsById.get(wip.lotId!)!;
      const take = Math.min(remaining, Number(wip.remainingQty));
      const sourceLineId = lot.grnLineId!;
      const consumed = Number(wip.consumedQty) + take;
      const left =
        Number(wip.issuedQty) -
        consumed -
        Number(wip.returnedQty) -
        Number(wip.scrappedQty);

      await tx
        .update(wipInventoryTable)
        .set({
          consumedQty: String(consumed),
          remainingQty: String(left),
          status: left <= 0 ? "fully_consumed" : "partially_consumed",
          updatedAt: new Date(),
        })
        .where(eq(wipInventoryTable.id, wip.id));

      await tx.insert(inventoryTransactionsTable).values({
        materialId: confirmation.materialId,
        quantity: String(-take),
        uom: wip.uom,
        stockState: "wip",
        transactionType: "CONSUMPTION",
        sourceDocumentType: "CONSUMPTION",
        sourceDocumentId: confirmation.id,
        sourceLineId,
        lotId: wip.lotId,
        warehouseId: wip.warehouseId,
        locationId: wip.locationId,
        productionOrderId: confirmation.productionOrderId,
        actorId,
        actorName,
      });

      remaining -= take;
    }

    const [updated] = await tx
      .update(consumptionConfirmationsTable)
      .set({
        status: "confirmed",
        confirmedBy: actorId,
        confirmedAt: new Date(),
      })
      .where(eq(consumptionConfirmationsTable.id, confirmation.id))
      .returning();

    await tx.insert(outboxEventsTable).values({
      aggregateType: "consumption_confirmation",
      aggregateId: confirmation.id,
      eventType: "CONSUMPTION_CONFIRMED",
      payload: {
        confirmation_number: confirmation.confirmationNumber,
        production_order_id: confirmation.productionOrderId,
        material_id: confirmation.materialId,
        lot_id: confirmation.lotId,
        actual_qty: actual,
        planned_qty: Number(confirmation.plannedQty),
        variance_qty: Number(confirmation.varianceQty),
        actor_id: actorId,
      },
    });

    return { status: "ok" as const, updated };
  });

  if (outcome.status === "not_found") {
    res.status(404).json({ error: "Consumption confirmation not found" });
    return;
  }
  if (outcome.status === "invalid_state") {
    res.status(409).json({
      error: `Confirmation cannot be confirmed from status '${outcome.current}'`,
    });
    return;
  }
  if (outcome.status === "insufficient_wip") {
    res.status(409).json({
      error: "INSUFFICIENT_WIP",
      details: {
        actual: outcome.actual,
        total_remaining: outcome.totalRemaining,
      },
    });
    return;
  }
  if (outcome.status === "invalid_wip_source") {
    res.status(409).json({
      error: "WIP_SOURCE_LINE_UNAVAILABLE",
      details: { message: "WIP rows must retain their source GRN line" },
    });
    return;
  }

  void recordSecurityEvent({
    eventType: "consumption.confirmed",
    actorId,
    actorEmail: req.user?.email ?? null,
    actorRole: req.user?.role ?? null,
    ...reqMeta(req),
    statusCode: 200,
    detail: `Consumption ${outcome.updated.confirmationNumber} confirmed`,
  });

  res.json(serializeConfirmation(outcome.updated as Record<string, any>));
});

// ─── POST /inventory/consumptions/:id/adjust — annotation only ───────────────
router.post("/:id/adjust", async (req: Request, res: Response): Promise<void> => {
  const parsed = AdjustConsumptionBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const actorId = req.user!.userId;
  const outcome = await db.transaction(async (tx) => {
    const [confirmation] = await tx
      .select()
      .from(consumptionConfirmationsTable)
      .where(eq(consumptionConfirmationsTable.id, req.params.id as string))
      .for("update")
      .limit(1);

    if (!confirmation) return { status: "not_found" as const };
    if (confirmation.status !== "confirmed") {
      return {
        status: "invalid_state" as const,
        current: confirmation.status,
      };
    }

    const combinedReason = `${confirmation.reason ? `${confirmation.reason} | ` : ""}adjustment: ${parsed.data.reason}`;
    const [updated] = await tx
      .update(consumptionConfirmationsTable)
      .set({
        status: "adjusted",
        adjustedBy: actorId,
        adjustedAt: new Date(),
        reason: combinedReason.slice(0, 255),
      })
      .where(eq(consumptionConfirmationsTable.id, confirmation.id))
      .returning();

    await tx.insert(outboxEventsTable).values({
      aggregateType: "consumption_confirmation",
      aggregateId: confirmation.id,
      eventType: "CONSUMPTION_ADJUSTED",
      payload: {
        confirmation_number: confirmation.confirmationNumber,
        reason: parsed.data.reason,
        actor_id: actorId,
      },
    });

    return { status: "ok" as const, updated };
  });

  if (outcome.status === "not_found") {
    res.status(404).json({ error: "Consumption confirmation not found" });
    return;
  }
  if (outcome.status === "invalid_state") {
    res.status(409).json({
      error: `Confirmation cannot be adjusted from status '${outcome.current}'`,
    });
    return;
  }

  void recordSecurityEvent({
    eventType: "consumption.adjusted",
    actorId,
    actorEmail: req.user?.email ?? null,
    actorRole: req.user?.role ?? null,
    ...reqMeta(req),
    statusCode: 200,
    detail: `Consumption ${outcome.updated.confirmationNumber} adjusted (annotation)`,
  });

  res.json(serializeConfirmation(outcome.updated as Record<string, any>));
});

// ─── Reads ────────────────────────────────────────────────────────────────────
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const query = req.query as Record<string, string | undefined>;
  const conditions = [
    query.production_order_id
      ? eq(consumptionConfirmationsTable.productionOrderId, query.production_order_id)
      : undefined,
    query.material_id
      ? eq(consumptionConfirmationsTable.materialId, query.material_id)
      : undefined,
    query.status
      ? eq(consumptionConfirmationsTable.status, query.status as "draft")
      : undefined,
  ].filter(Boolean) as any[];
  const where = conditions.length ? and(...conditions) : undefined;

  const [total] = await db
    .select({ count: count() })
    .from(consumptionConfirmationsTable)
    .where(where);
  const rows = await db
    .select()
    .from(consumptionConfirmationsTable)
    .where(where)
    .orderBy(asc(consumptionConfirmationsTable.createdAt))
    .limit(200);

  res.json({
    items: rows.map((row) => serializeConfirmation(row as Record<string, any>)),
    meta: { total: Number(total?.count ?? 0) },
  });
});

router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const [confirmation] = await db
    .select()
    .from(consumptionConfirmationsTable)
    .where(eq(consumptionConfirmationsTable.id, req.params.id as string))
    .limit(1);
  if (!confirmation) {
    res.status(404).json({ error: "Consumption confirmation not found" });
    return;
  }

  res.json(serializeConfirmation(confirmation as Record<string, any>));
});

export default router;