import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  mfgProductionOrdersTable,
  mfgOrderStagesTable,
  mfgTestResultsTable,
  mfgReworkTicketsTable,
  cellsTable,
  logisticsDispatchOrdersTable,
  logisticsDispatchItemsTable,
} from "@workspace/db";
import { sql, count } from "drizzle-orm";

const router: IRouter = Router();

router.get("/", async (_req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString();

  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

  const [orderStats] = await db.select({
    total: count(),
    inProgress: sql<number>`count(*) filter (where ${mfgProductionOrdersTable.status} = 'in_progress'::mfg_order_status)`,
    completed: sql<number>`count(*) filter (where ${mfgProductionOrdersTable.status} = 'completed'::mfg_order_status)`,
    completedToday: sql<number>`count(*) filter (where ${mfgProductionOrdersTable.status} = 'completed'::mfg_order_status and ${mfgProductionOrdersTable.updatedAt} >= ${todayIso}::timestamptz)`,
    completedThisMonth: sql<number>`count(*) filter (where ${mfgProductionOrdersTable.status} = 'completed'::mfg_order_status and ${mfgProductionOrdersTable.updatedAt} >= ${thisMonthStart}::timestamptz)`,
    draft: sql<number>`count(*) filter (where ${mfgProductionOrdersTable.status} = 'draft'::mfg_order_status)`,
  }).from(mfgProductionOrdersTable);

  const [stageTimings] = await db.select({
    avgMfgMs: sql<number>`avg(extract(epoch from (${mfgOrderStagesTable.completedAt} - ${mfgOrderStagesTable.startedAt})) * 1000) filter (where ${mfgOrderStagesTable.stageType} = 'assembly'::mfg_stage_type and ${mfgOrderStagesTable.status} in ('completed'::mfg_stage_status,'approved'::mfg_stage_status) and ${mfgOrderStagesTable.startedAt} is not null and ${mfgOrderStagesTable.completedAt} is not null)`,
    avgChargingMs: sql<number>`avg(extract(epoch from (${mfgOrderStagesTable.completedAt} - ${mfgOrderStagesTable.startedAt})) * 1000) filter (where ${mfgOrderStagesTable.stageType} = 'charging'::mfg_stage_type and ${mfgOrderStagesTable.status} in ('completed'::mfg_stage_status,'approved'::mfg_stage_status) and ${mfgOrderStagesTable.startedAt} is not null and ${mfgOrderStagesTable.completedAt} is not null)`,
    avgTestingMs: sql<number>`avg(extract(epoch from (${mfgOrderStagesTable.completedAt} - ${mfgOrderStagesTable.startedAt})) * 1000) filter (where ${mfgOrderStagesTable.stageType} = 'testing'::mfg_stage_type and ${mfgOrderStagesTable.status} in ('completed'::mfg_stage_status,'approved'::mfg_stage_status) and ${mfgOrderStagesTable.startedAt} is not null and ${mfgOrderStagesTable.completedAt} is not null)`,
  }).from(mfgOrderStagesTable);

  const [testStats] = await db.select({
    totalTests: count(),
    passed: sql<number>`count(*) filter (where ${mfgTestResultsTable.result} = 'pass'::mfg_test_result)`,
    failed: sql<number>`count(*) filter (where ${mfgTestResultsTable.result} = 'fail'::mfg_test_result)`,
  }).from(mfgTestResultsTable);

  const [reworkStats] = await db.select({
    openReworks: sql<number>`count(*) filter (where ${mfgReworkTicketsTable.status} = 'open'::mfg_rework_status)`,
    totalReworks: count(),
  }).from(mfgReworkTicketsTable);

  const [cellStats] = await db.select({
    total: count(),
    approved: sql<number>`count(*) filter (where ${cellsTable.status} = 'approved'::cell_status)`,
    allocated: sql<number>`count(*) filter (where ${cellsTable.status} = 'allocated'::cell_status)`,
    gradeA: sql<number>`count(*) filter (where ${cellsTable.grade} = 'A'::cell_grade)`,
    gradeB: sql<number>`count(*) filter (where ${cellsTable.grade} = 'B'::cell_grade)`,
    gradeC: sql<number>`count(*) filter (where ${cellsTable.grade} = 'C'::cell_grade)`,
    rejected: sql<number>`count(*) filter (where ${cellsTable.grade} = 'reject'::cell_grade)`,
  }).from(cellsTable);

  const [dispatchStats] = await db.select({
    inTransit: sql<number>`count(*) filter (where ${logisticsDispatchOrdersTable.status} = 'in_transit'::logistics_dispatch_status)`,
    delivered: sql<number>`count(*) filter (where ${logisticsDispatchOrdersTable.status} = 'delivered'::logistics_dispatch_status)`,
    dispatchedToday: sql<number>`count(*) filter (where ${logisticsDispatchOrdersTable.status} in ('in_transit'::logistics_dispatch_status,'delivered'::logistics_dispatch_status) and ${logisticsDispatchOrdersTable.updatedAt} >= ${todayIso}::timestamptz)`,
    totalShipments: count(),
  }).from(logisticsDispatchOrdersTable);

  const [readyForDispatch] = await db.select({
    count: sql<number>`count(distinct ${mfgProductionOrdersTable.id})`,
  }).from(mfgProductionOrdersTable)
    .leftJoin(logisticsDispatchItemsTable, sql`${logisticsDispatchItemsTable.productionOrderId} = ${mfgProductionOrdersTable.id}`)
    .where(sql`${mfgProductionOrdersTable.status} = 'completed'::mfg_order_status and ${logisticsDispatchItemsTable.id} is null`);

  const totalTests = Number(testStats?.totalTests ?? 0);
  const passed = Number(testStats?.passed ?? 0);
  const failed = Number(testStats?.failed ?? 0);
  const totalReworks = Number(reworkStats?.totalReworks ?? 0);
  const totalCompleted = Number(orderStats?.completed ?? 0);

  const qcPassPct = totalTests > 0 ? Math.round((passed / totalTests) * 100) : null;
  const qcRejectPct = totalTests > 0 ? Math.round((failed / totalTests) * 100) : null;
  const reworkPct = totalCompleted > 0 ? Math.round((totalReworks / totalCompleted) * 100) : null;
  const firstPassYield = totalTests > 0 ? Math.round((passed / totalTests) * 100) : null;
  const yieldPct = totalCompleted > 0 && Number(orderStats?.total ?? 0) > 0
    ? Math.round((totalCompleted / Number(orderStats?.total ?? 1)) * 100) : null;

  const toHours = (ms: number | null) => ms != null ? Math.round((Number(ms) / 3600000) * 10) / 10 : null;

  res.json({
    production: {
      today: Number(orderStats?.completedToday ?? 0),
      thisMonth: Number(orderStats?.completedThisMonth ?? 0),
      total: totalCompleted,
      inProgress: Number(orderStats?.inProgress ?? 0),
      draft: Number(orderStats?.draft ?? 0),
    },
    quality: {
      qcPassPct,
      qcRejectPct,
      firstPassYield,
      reworkPct,
      openReworks: Number(reworkStats?.openReworks ?? 0),
      totalReworks,
    },
    timings: {
      avgMfgHrs: toHours(stageTimings?.avgMfgMs ?? null),
      avgChargingHrs: toHours(stageTimings?.avgChargingMs ?? null),
      avgTestingHrs: toHours(stageTimings?.avgTestingMs ?? null),
    },
    inventory: {
      totalCells: Number(cellStats?.total ?? 0),
      availableCells: Number(cellStats?.approved ?? 0),
      allocatedCells: Number(cellStats?.allocated ?? 0),
      gradeA: Number(cellStats?.gradeA ?? 0),
      gradeB: Number(cellStats?.gradeB ?? 0),
      gradeC: Number(cellStats?.gradeC ?? 0),
      rejected: Number(cellStats?.rejected ?? 0),
      batteriesInProduction: Number(orderStats?.inProgress ?? 0),
      readyForDispatch: Number(readyForDispatch?.count ?? 0),
    },
    logistics: {
      dispatchedToday: Number(dispatchStats?.dispatchedToday ?? 0),
      inTransit: Number(dispatchStats?.inTransit ?? 0),
      totalShipments: Number(dispatchStats?.totalShipments ?? 0),
    },
    yieldPct,
    refreshedAt: new Date().toISOString(),
  });
});

export default router;
