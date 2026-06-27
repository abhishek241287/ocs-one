import { Router, IRouter } from "express";
import { db, cellsTable, cellMatchesTable, cellMatchItemsTable } from "@workspace/db";
import { eq, desc, count, inArray } from "drizzle-orm";
import { ListCellMatchesQueryParams, CreateCellMatchBody } from "@workspace/api-zod";

const router: IRouter = Router({ mergeParams: true });

type MatchStatus = typeof cellMatchesTable.status._.data;

type CellRow = typeof cellsTable.$inferSelect;

interface BatterySlot {
  slot: number;
  cells: CellRow[];
  avgCapacityAh: number;
  maxCapacityDiff: number;
  avgIrMohm: number;
  maxIrDiff: number;
  matchScore: number;
}

function runMatchingAlgorithm(
  availableCells: CellRow[],
  quantity: number,
  cellsPerBattery: number
): { batteries: BatterySlot[]; overallScore: number } | null {
  const total = quantity * cellsPerBattery;
  if (availableCells.length < total) return null;

  // Sort by capacity ascending, then by IR
  const sorted = [...availableCells].sort((a, b) => {
    const capDiff = (a.capacityAh ?? 0) - (b.capacityAh ?? 0);
    if (Math.abs(capDiff) > 0.001) return capDiff;
    return (a.internalResistanceMohm ?? 0) - (b.internalResistanceMohm ?? 0);
  });

  // Find best window of `total` consecutive cells (min capacity spread)
  let bestStart = 0;
  let bestSpread = Infinity;

  for (let i = 0; i <= sorted.length - total; i++) {
    const spread =
      (sorted[i + total - 1].capacityAh ?? 0) - (sorted[i].capacityAh ?? 0);
    if (spread < bestSpread) {
      bestSpread = spread;
      bestStart = i;
    }
  }

  const selected = sorted.slice(bestStart, bestStart + total);

  const batteries: BatterySlot[] = [];
  for (let slot = 0; slot < quantity; slot++) {
    const slotCells = selected.slice(slot * cellsPerBattery, (slot + 1) * cellsPerBattery);
    const caps = slotCells.map((c) => c.capacityAh ?? 0);
    const irs = slotCells.map((c) => c.internalResistanceMohm ?? 0);
    const avgCap = caps.reduce((a, b) => a + b, 0) / caps.length;
    const maxCapDiff = Math.max(...caps) - Math.min(...caps);
    const avgIr = irs.reduce((a, b) => a + b, 0) / irs.length;
    const maxIrDiff = Math.max(...irs) - Math.min(...irs);

    const capPenalty = avgCap > 0 ? (maxCapDiff / avgCap) * 50 : 0;
    const irPenalty = avgIr > 0 ? (maxIrDiff / avgIr) * 50 : 0;
    const score = Math.max(0, Math.round((100 - capPenalty - irPenalty) * 10) / 10);

    batteries.push({ slot: slot + 1, cells: slotCells, avgCapacityAh: avgCap, maxCapacityDiff: maxCapDiff, avgIrMohm: avgIr, maxIrDiff, matchScore: score });
  }

  const overallScore =
    Math.round(
      (batteries.reduce((a, b) => a + b.matchScore, 0) / batteries.length) * 10
    ) / 10;

  return { batteries, overallScore };
}

async function buildMatchDetail(matchId: string) {
  const [match] = await db
    .select()
    .from(cellMatchesTable)
    .where(eq(cellMatchesTable.id, matchId));

  if (!match) return null;

  const items = await db
    .select({
      item: cellMatchItemsTable,
      cell: cellsTable,
    })
    .from(cellMatchItemsTable)
    .leftJoin(cellsTable, eq(cellMatchItemsTable.cellId, cellsTable.id))
    .where(eq(cellMatchItemsTable.matchId, matchId))
    .orderBy(cellMatchItemsTable.batterySlot, cellMatchItemsTable.position);

  // Group by battery slot
  const slotMap = new Map<number, { cells: CellRow[] }>();
  for (const { item, cell } of items) {
    if (!cell) continue;
    if (!slotMap.has(item.batterySlot)) {
      slotMap.set(item.batterySlot, { cells: [] });
    }
    slotMap.get(item.batterySlot)!.cells.push(cell);
  }

  const batteries: BatterySlot[] = Array.from(slotMap.entries()).map(([slot, { cells }]) => {
    const caps = cells.map((c) => c.capacityAh ?? 0);
    const irs = cells.map((c) => c.internalResistanceMohm ?? 0);
    const avgCap = caps.length > 0 ? caps.reduce((a, b) => a + b, 0) / caps.length : 0;
    const maxCapDiff = caps.length > 0 ? Math.max(...caps) - Math.min(...caps) : 0;
    const avgIr = irs.length > 0 ? irs.reduce((a, b) => a + b, 0) / irs.length : 0;
    const maxIrDiff = irs.length > 0 ? Math.max(...irs) - Math.min(...irs) : 0;
    const capPenalty = avgCap > 0 ? (maxCapDiff / avgCap) * 50 : 0;
    const irPenalty = avgIr > 0 ? (maxIrDiff / avgIr) * 50 : 0;
    const matchScore = Math.max(0, Math.round((100 - capPenalty - irPenalty) * 10) / 10);
    return { slot, cells, avgCapacityAh: avgCap, maxCapacityDiff: maxCapDiff, avgIrMohm: avgIr, maxIrDiff, matchScore };
  });

  return { ...match, batteries };
}

// GET /cells/matches
router.get("/", async (req, res) => {
  const query = ListCellMatchesQueryParams.parse(req.query);
  const { page, pageSize, status } = query as { page: number; pageSize: number; status?: string };

  const where = status ? eq(cellMatchesTable.status, status as MatchStatus) : undefined;
  const offset = (page - 1) * pageSize;

  const [items, [{ total }]] = await Promise.all([
    db
      .select()
      .from(cellMatchesTable)
      .where(where)
      .orderBy(desc(cellMatchesTable.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(cellMatchesTable).where(where),
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

// POST /cells/matches
router.post("/", async (req, res) => {
  const body = CreateCellMatchBody.parse(req.body);
  const cellsPerBattery = body.cellsPerBattery ?? 16;
  const total = body.quantity * cellsPerBattery;

  // Get available approved cells
  const available = await db
    .select()
    .from(cellsTable)
    .where(eq(cellsTable.status, "approved"))
    .orderBy(cellsTable.capacityAh);

  const result = runMatchingAlgorithm(available, body.quantity, cellsPerBattery);
  if (!result) {
    res.status(422).json({
      error: `Not enough approved cells. Need ${total}, have ${available.length}`,
    });
    return;
  }

  const matchDetail = await db.transaction(async (tx) => {
    const [match] = await tx
      .insert(cellMatchesTable)
      .values({
        productId: body.productId ?? null,
        batteryModel: body.batteryModel,
        cellsPerBattery,
        quantity: body.quantity,
        status: "draft",
        matchScore: result.overallScore,
        createdBy: body.createdBy,
        notes: body.notes ?? null,
      })
      .returning();

    // Insert match items
    const items = result.batteries.flatMap((b) =>
      b.cells.map((cell, pos) => ({
        matchId: match.id,
        cellId: cell.id,
        batterySlot: b.slot,
        position: pos + 1,
      }))
    );

    await tx.insert(cellMatchItemsTable).values(items);

    return match;
  });

  const detail = await buildMatchDetail(matchDetail.id);
  res.status(201).json(detail);
});

// GET /cells/matches/:id
router.get("/:id", async (req, res) => {
  const detail = await buildMatchDetail(req.params.id);
  if (!detail) {
    res.status(404).json({ error: "Match not found" });
    return;
  }
  res.json(detail);
});

// POST /cells/matches/:id/accept
router.post("/:id/accept", async (req, res) => {
  const [match] = await db
    .select()
    .from(cellMatchesTable)
    .where(eq(cellMatchesTable.id, req.params.id));

  if (!match) {
    res.status(404).json({ error: "Match not found" });
    return;
  }

  if (match.status !== "draft") {
    res.status(409).json({ error: `Match is already ${match.status}` });
    return;
  }

  // Get all cell IDs in this match
  const items = await db
    .select()
    .from(cellMatchItemsTable)
    .where(eq(cellMatchItemsTable.matchId, match.id));

  const cellIds = items.map((i) => i.cellId);

  // Check all are still approved (not already reserved)
  const cells = await db
    .select()
    .from(cellsTable)
    .where(inArray(cellsTable.id, cellIds));

  const nonApproved = cells.filter((c) => c.status !== "approved");
  if (nonApproved.length > 0) {
    res.status(409).json({
      error: `${nonApproved.length} cell(s) are no longer available`,
      cellIds: nonApproved.map((c) => c.cellId),
    });
    return;
  }

  await db.transaction(async (tx) => {
    // Reserve all cells
    await tx
      .update(cellsTable)
      .set({ status: "reserved", matchId: match.id })
      .where(inArray(cellsTable.id, cellIds));

    // Update match status
    await tx
      .update(cellMatchesTable)
      .set({ status: "reserved" })
      .where(eq(cellMatchesTable.id, match.id));
  });

  const detail = await buildMatchDetail(match.id);
  res.json(detail);
});

// POST /cells/matches/:id/regenerate
router.post("/:id/regenerate", async (req, res) => {
  const [match] = await db
    .select()
    .from(cellMatchesTable)
    .where(eq(cellMatchesTable.id, req.params.id));

  if (!match) {
    res.status(404).json({ error: "Match not found" });
    return;
  }

  if (match.status !== "draft") {
    res.status(409).json({ error: `Cannot regenerate a ${match.status} match` });
    return;
  }

  const cellsPerBattery = match.cellsPerBattery;
  const total = match.quantity * cellsPerBattery;

  // Get current match cell IDs to exclude from "taken" pool
  const existingItems = await db
    .select()
    .from(cellMatchItemsTable)
    .where(eq(cellMatchItemsTable.matchId, match.id));

  const _existingCellIds = new Set(existingItems.map((i) => i.cellId));

  // Delete existing items
  await db
    .delete(cellMatchItemsTable)
    .where(eq(cellMatchItemsTable.matchId, match.id));

  // Get available approved cells (exclude none — they were not reserved)
  const available = await db
    .select()
    .from(cellsTable)
    .where(eq(cellsTable.status, "approved"));

  // Try to get a different selection by skipping some cells at the start
  const shuffled = [...available].sort((a, b) => {
    // Sort differently — add small random perturbation, seeded by current time
    const seed = Date.now() % 1000;
    return ((a.capacityAh ?? 0) - (b.capacityAh ?? 0)) + (seed * 0.00001);
  });

  const result = runMatchingAlgorithm(shuffled, match.quantity, cellsPerBattery);
  if (!result) {
    res.status(422).json({
      error: `Not enough approved cells. Need ${total}, have ${available.length}`,
    });
    return;
  }

  await db.transaction(async (tx) => {
    const items = result.batteries.flatMap((b) =>
      b.cells.map((cell, pos) => ({
        matchId: match.id,
        cellId: cell.id,
        batterySlot: b.slot,
        position: pos + 1,
      }))
    );
    await tx.insert(cellMatchItemsTable).values(items);
    await tx
      .update(cellMatchesTable)
      .set({ matchScore: result.overallScore })
      .where(eq(cellMatchesTable.id, match.id));
  });

  const detail = await buildMatchDetail(match.id);
  res.json(detail);
});

export default router;
