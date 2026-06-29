import { Router, IRouter } from "express";
import { db, cellLotsTable, cellsTable, cellLotEventsTable } from "@workspace/db";
import { eq, ilike, desc, count, and, or, like } from "drizzle-orm";
import {
  ListCellLotsQueryParams,
  CreateCellLotBody,
  PatchCellLotBody,
} from "@workspace/api-zod";
import { requireRole } from "../../middleware/auth";
import { recordSecurityEvent, reqMeta } from "../../lib/security-events";

const router: IRouter = Router({ mergeParams: true });

function todayDateStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

// GET /cells/lots
router.get("/", async (req, res) => {
  const query = ListCellLotsQueryParams.parse(req.query);
  const { page, pageSize, search, status, cellModel } = query;

  const conditions: ReturnType<typeof eq>[] = [];

  // OR across lotNumber, supplier, cellModel for full-text search
  if (search) {
    conditions.push(
      or(
        ilike(cellLotsTable.lotNumber, `%${search}%`),
        ilike(cellLotsTable.supplier, `%${search}%`),
        ilike(cellLotsTable.cellModel, `%${search}%`)
      ) as ReturnType<typeof eq>
    );
  }

  if (status) {
    conditions.push(eq(cellLotsTable.status, status as "received" | "grading" | "graded" | "complete"));
  }

  if (cellModel) {
    conditions.push(ilike(cellLotsTable.cellModel, `%${cellModel}%`));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const offset = (page - 1) * pageSize;

  const [items, [{ total }]] = await Promise.all([
    db
      .select()
      .from(cellLotsTable)
      .where(where)
      .orderBy(desc(cellLotsTable.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(cellLotsTable).where(where),
  ]);

  res.json({
    items,
    meta: {
      total: Number(total),
      page,
      pageSize,
      totalPages: Math.ceil(Number(total) / pageSize),
    },
  });
});

// POST /cells/lots — DIRECTOR-ONLY "Historical Import / Emergency Recovery".
// The production path for cell intake is now Inventory → Material Transfer
// (POST /inventory/transfers), which creates the lot + cells atomically and nets
// inventory stock. This manual create remains only for back-filling historical lots
// or emergency recovery, and is restricted to director (admin-equivalent) to prevent
// duplicate / un-netted cell entry bypassing inventory.
router.post(
  "/",
  requireRole("director"),
  async (req, res) => {
    const body = CreateCellLotBody.parse(req.body);

    const result = await db.transaction(async (tx) => {
      const dateStr = todayDateStr();
      const prefix = `CELL-${dateStr}-`;
      const [{ existingCount }] = await tx
        .select({ existingCount: count() })
        .from(cellsTable)
        .where(like(cellsTable.cellId, `${prefix}%`));

      const startSeq = (Number(existingCount) ?? 0) + 1;

      const [lot] = await tx
        .insert(cellLotsTable)
        .values({
          supplier: body.supplier,
          manufacturer: body.manufacturer,
          cellModel: body.cellModel,
          cellChemistry: body.cellChemistry ?? "LiFePO4",
          nominalCapacityAh: body.nominalCapacityAh,
          lotNumber: body.lotNumber,
          invoiceNumber: body.invoiceNumber ?? null,
          dateReceived: body.dateReceived,
          quantityReceived: body.quantityReceived,
          receivedBy: body.receivedBy,
          remarks: body.remarks ?? null,
          cellMasterId: body.cellMasterId ?? null,
        })
        .returning();

      const firstCellId = `${prefix}${String(startSeq).padStart(6, "0")}`;
      const lastCellId = `${prefix}${String(startSeq + body.quantityReceived - 1).padStart(6, "0")}`;

      const cellRecords = Array.from({ length: body.quantityReceived }, (_, i) => ({
        cellId: `${prefix}${String(startSeq + i).padStart(6, "0")}`,
        lotId: lot.id,
        status: "received" as const,
      }));

      await tx.insert(cellsTable).values(cellRecords);

      // Record lot received event — manual historical import carries the
      // director's mandatory justification on the lot timeline.
      await tx.insert(cellLotEventsTable).values({
        lotId: lot.id,
        eventType: "lot_received",
        performedBy: req.user!.email,
        reason: body.reason,
        changes: {
          lotNumber: lot.lotNumber,
          supplier: lot.supplier,
          quantityReceived: lot.quantityReceived,
          source: "manual_historical_import",
        },
      });

      // Record cell records generated event
      await tx.insert(cellLotEventsTable).values({
        lotId: lot.id,
        eventType: "cell_records_generated",
        performedBy: req.user!.email,
        reason: body.reason,
        changes: {
          quantity: body.quantityReceived,
          range: `${firstCellId} → ${lastCellId}`,
        },
      });

      return lot;
    });

    // Persist a security audit event — a manual cell intake bypasses the normal
    // Inventory → Material Transfer production path, so it is an authorization-
    // sensitive action worth recording in the security trail with the reason.
    void recordSecurityEvent({
      eventType: "cell_lot.manual_import",
      severity: "warning",
      actorId: req.user?.userId ?? null,
      actorEmail: req.user?.email ?? null,
      actorRole: req.user?.role ?? null,
      ...reqMeta(req),
      statusCode: 201,
      detail: `Historical import: lot ${result.lotNumber} (${body.quantityReceived} cells) — ${body.reason}`,
    });

    const stats = await db
      .select({ status: cellsTable.status, cnt: count() })
      .from(cellsTable)
      .where(eq(cellsTable.lotId, result.id))
      .groupBy(cellsTable.status);

    const statMap = Object.fromEntries(stats.map((s) => [s.status, Number(s.cnt)]));

    res.status(201).json({
      ...result,
      stats: {
        total: body.quantityReceived,
        received: statMap.received ?? 0,
        approved: statMap.approved ?? 0,
        rejected: statMap.rejected ?? 0,
        quarantine: statMap.quarantine ?? 0,
        reserved: statMap.reserved ?? 0,
        allocated: statMap.allocated ?? 0,
      },
    });
  }
);

// GET /cells/lots/:id
router.get("/:id", async (req, res) => {
  const [lot] = await db
    .select()
    .from(cellLotsTable)
    .where(eq(cellLotsTable.id, req.params.id));

  if (!lot) {
    res.status(404).json({ error: "Lot not found" });
    return;
  }

  const stats = await db
    .select({ status: cellsTable.status, cnt: count() })
    .from(cellsTable)
    .where(eq(cellsTable.lotId, lot.id))
    .groupBy(cellsTable.status);

  const statMap = Object.fromEntries(stats.map((s) => [s.status, Number(s.cnt)]));
  const total = Object.values(statMap).reduce((a, b) => a + b, 0);

  res.json({
    ...lot,
    stats: {
      total,
      received: statMap.received ?? 0,
      approved: statMap.approved ?? 0,
      rejected: statMap.rejected ?? 0,
      quarantine: statMap.quarantine ?? 0,
      reserved: statMap.reserved ?? 0,
      allocated: statMap.allocated ?? 0,
    },
  });
});

// PATCH /cells/lots/:id — requires operator or above
router.patch(
  "/:id",
  requireRole("operator", "supervisor", "director"),
  async (req, res) => {
    const body = PatchCellLotBody.parse(req.body);
    const { reason, ...fields } = body;

    const lotId = req.params["id"] as string;
    const [existing] = await db
      .select()
      .from(cellLotsTable)
      .where(eq(cellLotsTable.id, lotId));

    if (!existing) {
      res.status(404).json({ error: "Lot not found" });
      return;
    }

    // Immutability guard — once grading has started, core manufacturing fields are locked
    if (existing.status !== "received") {
      const lockedFields = ["supplier", "cellModel", "dateReceived"] as const;
      const lockedAttempted = lockedFields.filter((f) => {
        const incoming = (fields as Record<string, unknown>)[f];
        return incoming !== undefined && String(incoming) !== String(existing[f] ?? "");
      });
      if (lockedAttempted.length > 0) {
        res.status(422).json({
          error: `Cannot edit ${lockedAttempted.join(", ")} — lot is locked in '${existing.status}' status (grading has started)`,
        });
        return;
      }
    }

    // Build changeset — only include fields that differ
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const updateValues: Partial<typeof cellLotsTable.$inferInsert> = {};

    const editableFields = [
      "supplier",
      "manufacturer",
      "cellModel",
      "cellChemistry",
      "nominalCapacityAh",
      "invoiceNumber",
      "dateReceived",
      "receivedBy",
      "remarks",
      "cellMasterId",
    ] as const;

    for (const key of editableFields) {
      const incoming = fields[key];
      if (incoming === undefined) continue;
      const current = existing[key];
      const incomingNorm = incoming === null ? null : incoming;
      const currentNorm = current === null || current === undefined ? null : current;
      if (incomingNorm !== currentNorm) {
        changes[key] = { from: currentNorm, to: incomingNorm };
        (updateValues as Record<string, unknown>)[key] = incomingNorm;
      }
    }

    if (Object.keys(updateValues).length === 0) {
      res.json(existing);
      return;
    }

    const [updated] = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(cellLotsTable)
        .set(updateValues)
        .where(eq(cellLotsTable.id, lotId))
        .returning();

      // Use "remarks_updated" when only remarks changed; "lot_updated" otherwise
      const changedKeys = Object.keys(changes);
      const isRemarksOnly = changedKeys.length === 1 && changedKeys[0] === "remarks";

      await tx.insert(cellLotEventsTable).values({
        lotId: existing.id,
        eventType: isRemarksOnly ? "remarks_updated" : "lot_updated",
        performedBy: req.user!.email,
        reason,
        changes,
      });

      return [row];
    });

    res.json(updated);
  }
);

function computeEventSummary(
  eventType: string,
  changes: unknown,
  reason?: string | null
): string {
  const ch = changes as Record<string, any> | null;
  switch (eventType) {
    case "lot_received":
    case "received": {
      const lotNum = ch?.lotNumber ?? "—";
      const qty = ch?.quantityReceived ?? "?";
      const supplier = ch?.supplier ? ` from ${ch.supplier}` : "";
      return `Lot ${lotNum} received with ${qty} cells${supplier}`;
    }
    case "cell_records_generated": {
      const qty = ch?.quantity ?? "?";
      const range = ch?.range;
      return range
        ? `${qty} cell records generated (${range})`
        : `${qty} cell records generated`;
    }
    case "grading_started": {
      return "Grading started — first cell measured";
    }
    case "cell_graded": {
      const cid = ch?.cellId ?? "?";
      const grade = ch?.grade ?? "?";
      const cap = ch?.capacityAh != null ? ` · ${Number(ch.capacityAh).toFixed(2)} Ah` : "";
      const ir = ch?.internalResistanceMohm != null ? ` · ${Number(ch.internalResistanceMohm).toFixed(3)} mΩ` : "";
      return `Cell ${cid} graded — Grade ${grade}${cap}${ir}`;
    }
    case "lot_fully_graded": {
      return "All cells graded — lot is fully graded";
    }
    case "status_changed": {
      const from = ch?.status?.from ?? "?";
      const to = ch?.status?.to ?? "?";
      return `Status changed: ${from} → ${to}`;
    }
    case "lot_updated":
    case "corrected": {
      const fields = Object.keys(ch ?? {}).join(", ");
      return reason ? `Lot updated — ${reason}` : `Lot updated (${fields} modified)`;
    }
    case "remarks_updated": {
      return "Remarks updated";
    }
    default:
      return eventType.replace(/_/g, " ");
  }
}

// GET /cells/lots/:id/history
router.get("/:id/history", async (req, res) => {
  const [lot] = await db
    .select({ id: cellLotsTable.id })
    .from(cellLotsTable)
    .where(eq(cellLotsTable.id, req.params.id));

  if (!lot) {
    res.status(404).json({ error: "Lot not found" });
    return;
  }

  const events = await db
    .select()
    .from(cellLotEventsTable)
    .where(eq(cellLotEventsTable.lotId, lot.id))
    .orderBy(desc(cellLotEventsTable.performedAt));

  const enriched = events.map((ev) => ({
    ...ev,
    summary: computeEventSummary(ev.eventType, ev.changes, ev.reason),
  }));

  res.json({ lotId: lot.id, events: enriched });
});

export default router;
