import { Router, IRouter } from "express";
import {
  db,
  mfgProductionOrdersTable,
  cellMatchesTable,
  cellMatchItemsTable,
  cellsTable,
  cellLotsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { GetProductionOrderParams } from "@workspace/api-zod";

const router: IRouter = Router({ mergeParams: true });

// GET /manufacturing/orders/:id/allocated-cells
router.get("/", async (req, res) => {
  const { id } = GetProductionOrderParams.parse(req.params);

  const [order] = await db
    .select()
    .from(mfgProductionOrdersTable)
    .where(eq(mfgProductionOrdersTable.id, id))
    .limit(1);

  if (!order) {
    res.status(404).json({ error: "Production order not found" });
    return;
  }

  if (!order.cellMatchId) {
    res.json({ matchId: null, matchScore: null, items: [] });
    return;
  }

  const [match] = await db
    .select()
    .from(cellMatchesTable)
    .where(eq(cellMatchesTable.id, order.cellMatchId))
    .limit(1);

  const matchItems = await db
    .select({
      position: cellMatchItemsTable.position,
      cellId: cellsTable.id,
      cellCode: cellsTable.cellId,
      status: cellsTable.status,
      grade: cellsTable.grade,
      capacityAh: cellsTable.capacityAh,
      internalResistanceMohm: cellsTable.internalResistanceMohm,
      voltageV: cellsTable.voltageV,
      gradedBy: cellsTable.gradedBy,
      lotNumber: cellLotsTable.lotNumber,
    })
    .from(cellMatchItemsTable)
    .innerJoin(cellsTable, eq(cellMatchItemsTable.cellId, cellsTable.id))
    .leftJoin(cellLotsTable, eq(cellsTable.lotId, cellLotsTable.id))
    .where(eq(cellMatchItemsTable.matchId, order.cellMatchId))
    .orderBy(cellMatchItemsTable.position);

  res.json({
    matchId: order.cellMatchId,
    matchScore: match?.matchScore ?? null,
    items: matchItems.map((item) => ({
      position: item.position,
      id: item.cellId,
      cellId: item.cellCode,
      status: item.status,
      grade: item.grade,
      capacityAh: item.capacityAh,
      internalResistanceMohm: item.internalResistanceMohm,
      voltageV: item.voltageV,
      gradedBy: item.gradedBy,
      lotNumber: item.lotNumber,
    })),
  });
});

export default router;
