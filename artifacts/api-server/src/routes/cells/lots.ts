import { Router, IRouter } from "express";
import { db, cellLotsTable, cellsTable, cellLotEventsTable } from "@workspace/db";
import { eq, ilike, desc, count, and, or, like } from "drizzle-orm";
import {
  ListCellLotsQueryParams,
  CreateCellLotBody,
  PatchCellLotBody,
} from "@workspace/api-zod";
import { requireRole } from "../../middleware/auth";

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
    conditions.push(eq(cellLotsTable.status, status as "received" | "grading" | "complete"));
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

// POST /cells/lots — requires operator or above
router.post(
  "/",
  requireRole("operator", "supervisor", "director"),
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

      const cellRecords = Array.from({ length: body.quantityReceived }, (_, i) => ({
        cellId: `${prefix}${String(startSeq + i).padStart(6, "0")}`,
        lotId: lot.id,
        status: "received" as const,
      }));

      await tx.insert(cellsTable).values(cellRecords);

      // Record creation event
      await tx.insert(cellLotEventsTable).values({
        lotId: lot.id,
        eventType: "received",
        performedBy: req.user!.email,
        reason: null,
        changes: {
          lotNumber: lot.lotNumber,
          quantityReceived: lot.quantityReceived,
        },
      });

      return lot;
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

      await tx.insert(cellLotEventsTable).values({
        lotId: existing.id,
        eventType: "corrected",
        performedBy: req.user!.email,
        reason,
        changes,
      });

      return [row];
    });

    res.json(updated);
  }
);

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

  res.json({ lotId: lot.id, events });
});

export default router;
