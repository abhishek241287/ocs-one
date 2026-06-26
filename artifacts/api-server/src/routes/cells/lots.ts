import { Router, IRouter } from "express";
import { db, cellLotsTable, cellsTable } from "@workspace/db";
import { eq, ilike, desc, count, and } from "drizzle-orm";
import { ListCellLotsQueryParams, CreateCellLotBody } from "@workspace/api-zod";
import { like } from "drizzle-orm";

const router: IRouter = Router({ mergeParams: true });

function todayDateStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

async function generateCellId(tx: typeof db, seq: number): Promise<string> {
  const dateStr = todayDateStr();
  return `CELL-${dateStr}-${String(seq).padStart(6, "0")}`;
}

// GET /cells/lots
router.get("/", async (req, res) => {
  const query = ListCellLotsQueryParams.parse(req.query);
  const { page, pageSize, search } = query as {
    page: number;
    pageSize: number;
    search?: string;
  };

  const conditions = [];
  if (search) {
    conditions.push(
      ilike(cellLotsTable.lotNumber, `%${search}%`)
    );
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

// POST /cells/lots
router.post("/", async (req, res) => {
  const body = CreateCellLotBody.parse(req.body);

  const result = await db.transaction(async (tx) => {
    // Get today's cell count for sequential IDs
    const dateStr = todayDateStr();
    const prefix = `CELL-${dateStr}-`;
    const [{ existingCount }] = await tx
      .select({ existingCount: count() })
      .from(cellsTable)
      .where(like(cellsTable.cellId, `${prefix}%`));

    const startSeq = (Number(existingCount) ?? 0) + 1;

    // Create the lot
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
      })
      .returning();

    // Auto-generate individual cell records
    const cellRecords = Array.from({ length: body.quantityReceived }, (_, i) => ({
      cellId: `${prefix}${String(startSeq + i).padStart(6, "0")}`,
      lotId: lot.id,
      status: "received" as const,
    }));

    await tx.insert(cellsTable).values(cellRecords);

    return lot;
  });

  // Return lot with stats
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
});

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

export default router;
