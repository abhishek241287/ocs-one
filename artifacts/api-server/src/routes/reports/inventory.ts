import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  cellsTable,
  cellLotsTable,
  mfgProductionOrdersTable,
  logisticsDispatchItemsTable,
} from "@workspace/db";
import { sql, count } from "drizzle-orm";

const router: IRouter = Router();

router.get("/", async (_req, res) => {
  const [cellInv] = await db.select({
    total: count(),
    approved: sql<number>`count(*) filter (where ${cellsTable.status} = 'approved'::cell_status)`,
    allocated: sql<number>`count(*) filter (where ${cellsTable.status} = 'allocated'::cell_status)`,
    reserved: sql<number>`count(*) filter (where ${cellsTable.status} = 'reserved'::cell_status)`,
    gradeA: sql<number>`count(*) filter (where ${cellsTable.grade} = 'A'::cell_grade)`,
    gradeB: sql<number>`count(*) filter (where ${cellsTable.grade} = 'B'::cell_grade)`,
    gradeC: sql<number>`count(*) filter (where ${cellsTable.grade} = 'C'::cell_grade)`,
    rejected: sql<number>`count(*) filter (where ${cellsTable.grade} = 'reject'::cell_grade)`,
  }).from(cellsTable);

  const byLot = await db.select({
    lotNumber: cellLotsTable.lotNumber,
    supplier: cellLotsTable.supplier,
    receivedAt: cellLotsTable.createdAt,
    total: count(),
    approved: sql<number>`count(*) filter (where ${cellsTable.status} = 'approved'::cell_status)`,
    allocated: sql<number>`count(*) filter (where ${cellsTable.status} = 'allocated'::cell_status)`,
    rejected: sql<number>`count(*) filter (where ${cellsTable.grade} = 'reject'::cell_grade)`,
  }).from(cellsTable)
    .innerJoin(cellLotsTable, sql`${cellsTable.lotId} = ${cellLotsTable.id}`)
    .groupBy(cellLotsTable.lotNumber, cellLotsTable.supplier, cellLotsTable.createdAt)
    .orderBy(sql`${cellLotsTable.createdAt} desc`)
    .limit(20);

  const [batteryInv] = await db.select({
    total: count(),
    inProgress: sql<number>`count(*) filter (where ${mfgProductionOrdersTable.status} = 'in_progress'::mfg_order_status)`,
    completed: sql<number>`count(*) filter (where ${mfgProductionOrdersTable.status} = 'completed'::mfg_order_status)`,
    draft: sql<number>`count(*) filter (where ${mfgProductionOrdersTable.status} = 'draft'::mfg_order_status)`,
  }).from(mfgProductionOrdersTable);

  const [readyForDispatch] = await db.select({
    count: sql<number>`count(distinct ${mfgProductionOrdersTable.id})`,
  }).from(mfgProductionOrdersTable)
    .leftJoin(logisticsDispatchItemsTable, sql`${logisticsDispatchItemsTable.productionOrderId} = ${mfgProductionOrdersTable.id}`)
    .where(sql`${mfgProductionOrdersTable.status} = 'completed'::mfg_order_status and ${logisticsDispatchItemsTable.id} is null`);

  const inProduction = Number(cellInv?.reserved ?? 0) + Number(cellInv?.allocated ?? 0);

  const cellStatusBreakdown = [
    { status: "Available", count: Number(cellInv?.approved ?? 0) },
    { status: "In Production", count: inProduction },
    { status: "Rejected", count: Number(cellInv?.rejected ?? 0) },
  ].filter(r => r.count > 0);

  const gradeBreakdown = [
    { grade: "Grade A", count: Number(cellInv?.gradeA ?? 0) },
    { grade: "Grade B", count: Number(cellInv?.gradeB ?? 0) },
    { grade: "Grade C", count: Number(cellInv?.gradeC ?? 0) },
    { grade: "Rejected", count: Number(cellInv?.rejected ?? 0) },
  ].filter(r => r.count > 0);

  res.json({
    cells: {
      total: Number(cellInv?.total ?? 0),
      available: Number(cellInv?.approved ?? 0),
      allocated: Number(cellInv?.allocated ?? 0),
      inProduction,
      rejected: Number(cellInv?.rejected ?? 0),
      statusBreakdown: cellStatusBreakdown,
      gradeBreakdown,
    },
    batteries: {
      total: Number(batteryInv?.total ?? 0),
      inProgress: Number(batteryInv?.inProgress ?? 0),
      completed: Number(batteryInv?.completed ?? 0),
      readyForDispatch: Number(readyForDispatch?.count ?? 0),
      draft: Number(batteryInv?.draft ?? 0),
    },
    byLot: byLot.map(r => ({
      lotNumber: r.lotNumber,
      supplier: r.supplier,
      receivedAt: r.receivedAt,
      total: Number(r.total),
      available: Number(r.approved),
      allocated: Number(r.allocated),
      rejected: Number(r.rejected),
      utilizationPct: Number(r.total) > 0
        ? Math.round(((Number(r.total) - Number(r.approved)) / Number(r.total)) * 100)
        : 0,
    })),
    refreshedAt: new Date().toISOString(),
  });
});

export default router;
