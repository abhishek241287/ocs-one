import { Router, IRouter } from "express";
import {
  db,
  mfgProductionOrdersTable,
  mfgOrderStagesTable,
  mfgChargerUnitsTable,
  mfgTestResultsTable,
  mfgQcApprovalsTable,
  mfgReworkTicketsTable,
  cellLotsTable,
  cellsTable,
  cellMatchesTable,
  masterTestEquipmentTable,
  logisticsDispatchOrdersTable,
  logisticsShipmentEventsTable,
  logisticsDealersTable,
} from "@workspace/db";
import { count, sql, eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/", async (req, res) => {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysIso = thirtyDaysAgo.toISOString();

  const [
    orderStats,
    _stageStats,
    qcPipeline,
    reworkStats,
    packingReady,
    chargerStats,
    testEquipStats,
    testResultStats,
    qcDecisionStats,
    cellStats,
    cellLotStats,
    cellMatchStats,
    logisticsStats,
    dealerCount,
    deliveredToday,
    recentOrders,
    pipelineStages,
    operatorActivity,
  ] = await Promise.all([
    // 1. Production order KPIs
    db
      .select({
        total: count(),
        todayTarget: sql<number>`count(*) filter (where ${mfgProductionOrdersTable.createdAt} >= ${todayIso}::timestamptz)`,
        todayCompleted: sql<number>`count(*) filter (where ${mfgProductionOrdersTable.status} = 'completed' and ${mfgProductionOrdersTable.updatedAt} >= ${todayIso}::timestamptz)`,
        inProgress: sql<number>`count(*) filter (where ${mfgProductionOrdersTable.status} = 'in_progress')`,
        totalCompleted: sql<number>`count(*) filter (where ${mfgProductionOrdersTable.status} = 'completed')`,
        draft: sql<number>`count(*) filter (where ${mfgProductionOrdersTable.status} = 'draft')`,
      })
      .from(mfgProductionOrdersTable),

    // 2. Charger utilization from order stages
    db
      .select({
        chargingInProgress: sql<number>`count(*) filter (where ${mfgOrderStagesTable.stageType} = 'charging' and ${mfgOrderStagesTable.status} = 'in_progress')`,
        totalCharging: sql<number>`count(*) filter (where ${mfgOrderStagesTable.stageType} = 'charging')`,
      })
      .from(mfgOrderStagesTable),

    // 3. QC pipeline count
    db
      .select({
        qcPending: sql<number>`count(*) filter (where ${mfgOrderStagesTable.stageType} = 'quality_control' and ${mfgOrderStagesTable.status} = 'completed')`,
        qcInProgress: sql<number>`count(*) filter (where ${mfgOrderStagesTable.stageType} = 'quality_control' and ${mfgOrderStagesTable.status} = 'in_progress')`,
      })
      .from(mfgOrderStagesTable),

    // 4. Rework queue
    db
      .select({ open: count() })
      .from(mfgReworkTicketsTable)
      .where(sql`${mfgReworkTicketsTable.status} = 'open'`),

    // 5. Packing approved (dispatch ready)
    db
      .select({ ready: count() })
      .from(mfgOrderStagesTable)
      .where(
        sql`${mfgOrderStagesTable.stageType} = 'packing' and ${mfgOrderStagesTable.status} = 'approved'`
      ),

    // 6. Charger unit status breakdown
    db
      .select({
        total: count(),
        available: sql<number>`count(*) filter (where ${mfgChargerUnitsTable.status} = 'available')`,
        busy: sql<number>`count(*) filter (where ${mfgChargerUnitsTable.status} = 'busy')`,
        maintenance: sql<number>`count(*) filter (where ${mfgChargerUnitsTable.status} = 'maintenance')`,
      })
      .from(mfgChargerUnitsTable),

    // 7. Test equipment status
    db
      .select({
        total: count(),
        available: sql<number>`count(*) filter (where ${masterTestEquipmentTable.floorStatus} = 'available')`,
        busy: sql<number>`count(*) filter (where ${masterTestEquipmentTable.floorStatus} = 'busy')`,
        maintenance: sql<number>`count(*) filter (where ${masterTestEquipmentTable.floorStatus} = 'maintenance')`,
      })
      .from(masterTestEquipmentTable),

    // 8. Test result quality stats (last 30 days)
    db
      .select({
        passCount: sql<number>`count(*) filter (where ${mfgTestResultsTable.result} = 'pass')`,
        failCount: sql<number>`count(*) filter (where ${mfgTestResultsTable.result} = 'fail')`,
      })
      .from(mfgTestResultsTable)
      .where(sql`${mfgTestResultsTable.createdAt} >= ${thirtyDaysIso}::timestamptz`),

    // 9. QC decision breakdown — enum: approved|rejected
    db
      .select({
        approved: sql<number>`count(*) filter (where ${mfgQcApprovalsTable.decision} = 'approved')`,
        rejected: sql<number>`count(*) filter (where ${mfgQcApprovalsTable.decision} = 'rejected')`,
      })
      .from(mfgQcApprovalsTable)
      .where(sql`${mfgQcApprovalsTable.createdAt} >= ${thirtyDaysIso}::timestamptz`),

    // 10. Cell inventory by status (enum: received|grading|approved|rejected|quarantine|reserved|allocated)
    db
      .select({
        total: count(),
        received: sql<number>`count(*) filter (where ${cellsTable.status} = 'received')`,
        grading: sql<number>`count(*) filter (where ${cellsTable.status} = 'grading')`,
        approved: sql<number>`count(*) filter (where ${cellsTable.status} = 'approved')`,
        reserved: sql<number>`count(*) filter (where ${cellsTable.status} = 'reserved')`,
        allocated: sql<number>`count(*) filter (where ${cellsTable.status} = 'allocated')`,
        rejected: sql<number>`count(*) filter (where ${cellsTable.status} = 'rejected')`,
        quarantine: sql<number>`count(*) filter (where ${cellsTable.status} = 'quarantine')`,
      })
      .from(cellsTable),

    // 11. Cell lots (receiving) — no status column on cell_lots
    db
      .select({ total: count() })
      .from(cellLotsTable),

    // 12. Cell matching (status: draft | reserved | allocated | cancelled)
    db
      .select({
        draft: sql<number>`count(*) filter (where ${cellMatchesTable.status} = 'draft')`,
        reserved: sql<number>`count(*) filter (where ${cellMatchesTable.status} = 'reserved')`,
        allocated: sql<number>`count(*) filter (where ${cellMatchesTable.status} = 'allocated')`,
      })
      .from(cellMatchesTable),

    // 13. Dispatch order status breakdown
    db
      .select({
        draft: sql<number>`count(*) filter (where ${logisticsDispatchOrdersTable.status} = 'draft')`,
        confirmed: sql<number>`count(*) filter (where ${logisticsDispatchOrdersTable.status} = 'confirmed')`,
        loaded: sql<number>`count(*) filter (where ${logisticsDispatchOrdersTable.status} = 'loaded')`,
        inTransit: sql<number>`count(*) filter (where ${logisticsDispatchOrdersTable.status} = 'in_transit')`,
        delivered: sql<number>`count(*) filter (where ${logisticsDispatchOrdersTable.status} = 'delivered')`,
      })
      .from(logisticsDispatchOrdersTable),

    // 14. Dealer count
    db.select({ total: count() }).from(logisticsDealersTable),

    // 15. Delivered today (from shipment events)
    db
      .select({ count: count() })
      .from(logisticsShipmentEventsTable)
      .where(
        sql`${logisticsShipmentEventsTable.eventType} = 'delivered' and ${logisticsShipmentEventsTable.occurredAt} >= ${todayIso}::timestamptz`
      ),

    // 16. Recent production orders (last 10)
    db
      .select({
        id: mfgProductionOrdersTable.id,
        orderNumber: mfgProductionOrdersTable.orderNumber,
        batteryNumber: mfgProductionOrdersTable.batteryNumber,
        status: mfgProductionOrdersTable.status,
        currentStage: mfgProductionOrdersTable.currentStage,
        priority: mfgProductionOrdersTable.priority,
        createdAt: mfgProductionOrdersTable.createdAt,
        updatedAt: mfgProductionOrdersTable.updatedAt,
      })
      .from(mfgProductionOrdersTable)
      .orderBy(sql`${mfgProductionOrdersTable.createdAt} desc`)
      .limit(10),

    // 17. Pipeline stage counts (all stages, all batteries currently on floor)
    db
      .select({
        stageType: mfgOrderStagesTable.stageType,
        inProgress: sql<number>`count(*) filter (where ${mfgOrderStagesTable.status} = 'in_progress')`,
        waiting: sql<number>`count(*) filter (where ${mfgOrderStagesTable.status} = 'pending')`,
        blocked: sql<number>`count(*) filter (where ${mfgOrderStagesTable.status} = 'rejected')`,
        completed: sql<number>`count(*) filter (where ${mfgOrderStagesTable.status} in ('completed', 'approved'))`,
        completedToday: sql<number>`count(*) filter (where ${mfgOrderStagesTable.status} in ('completed', 'approved') and ${mfgOrderStagesTable.completedAt} >= ${todayIso}::timestamptz)`,
      })
      .from(mfgOrderStagesTable)
      .innerJoin(
        mfgProductionOrdersTable,
        eq(mfgOrderStagesTable.productionOrderId, mfgProductionOrdersTable.id)
      )
      .where(sql`${mfgProductionOrdersTable.status} = 'in_progress'`)
      .groupBy(mfgOrderStagesTable.stageType),

    // 18. Operator activity (operators with stages in_progress today)
    db
      .select({
        operatorName: mfgOrderStagesTable.operatorName,
        stageType: mfgOrderStagesTable.stageType,
        lastActivity: sql<string>`max(${mfgOrderStagesTable.startedAt})`,
        batteriesCompletedToday: sql<number>`count(*) filter (where ${mfgOrderStagesTable.completedAt} >= ${todayIso}::timestamptz)`,
      })
      .from(mfgOrderStagesTable)
      .where(
        sql`${mfgOrderStagesTable.operatorName} is not null and ${mfgOrderStagesTable.status} = 'in_progress'`
      )
      .groupBy(mfgOrderStagesTable.operatorName, mfgOrderStagesTable.stageType)
      .limit(20),
  ]);

  // ─── Build KPIs ─────────────────────────────────────────────────────────────
  const todayTarget = Number(orderStats[0]?.todayTarget ?? 0);
  const todayCompleted = Number(orderStats[0]?.todayCompleted ?? 0);
  const inProgress = Number(orderStats[0]?.inProgress ?? 0);
  const qcPending = Number(qcPipeline[0]?.qcPending ?? 0);
  const dispatchReady = Number(packingReady[0]?.ready ?? 0);
  const reworkQueue = Number(reworkStats[0]?.open ?? 0);

  const chargerTotal = Number(chargerStats[0]?.total ?? 0);
  const chargerBusy = Number(chargerStats[0]?.busy ?? 0);
  const chargerUtilization = chargerTotal > 0 ? Math.round((chargerBusy / chargerTotal) * 100) : 0;

  const productionEfficiency =
    todayTarget > 0 ? Math.min(100, Math.round((todayCompleted / todayTarget) * 100)) : 0;

  // ─── Build pipeline ──────────────────────────────────────────────────────────
  const STAGE_META = [
    { key: "cell_allocation", label: "Cell Allocation", href: "/cells/inventory" },
    { key: "bms_allocation", label: "BMS Installation", href: "/masters/bms" },
    { key: "assembly", label: "Assembly", href: "/manufacturing/orders" },
    { key: "compression", label: "Compression", href: "/manufacturing/orders" },
    { key: "charging", label: "Charging", href: "/manufacturing/charging-dashboard" },
    { key: "testing", label: "Testing", href: "/manufacturing/testing-dashboard" },
    { key: "quality_control", label: "Quality Control", href: "/manufacturing/orders" },
    { key: "packing", label: "Packing", href: "/logistics/packing-dashboard" },
  ];

  type StageKey = typeof pipelineStages[number]["stageType"];
  const pipelineMap = new Map(pipelineStages.map((s) => [s.stageType, s]));
  const pipeline = STAGE_META.map((meta) => {
    const s = pipelineMap.get(meta.key as StageKey);
    const ip = Number(s?.inProgress ?? 0);
    const waiting = Number(s?.waiting ?? 0);
    const blocked = Number(s?.blocked ?? 0);
    const completedToday = Number(s?.completedToday ?? 0);
    const health = blocked > 0 ? "red" : ip + waiting > 5 ? "yellow" : "green";
    return { ...meta, inProgress: ip, waiting, blocked, completedToday, health };
  });

  // Add cell stages at the beginning
  const cellPipeline = [
    {
      key: "cell_receiving",
      label: "Cell Receiving",
      href: "/cells/receiving",
      inProgress: Number(cellLotStats[0]?.total ?? 0),
      waiting: 0,
      blocked: 0,
      completedToday: 0,
      health: "green" as const,
    },
    {
      key: "cell_grading",
      label: "Cell Grading",
      href: "/cells/grading",
      inProgress: Number(cellStats[0]?.grading ?? 0),
      waiting: Number(cellStats[0]?.received ?? 0),
      blocked: Number(cellStats[0]?.rejected ?? 0) + Number(cellStats[0]?.quarantine ?? 0),
      completedToday: 0,
      health:
        (Number(cellStats[0]?.rejected ?? 0) + Number(cellStats[0]?.quarantine ?? 0)) > 0
          ? ("yellow" as const)
          : ("green" as const),
    },
    {
      key: "cell_matching",
      label: "Cell Matching",
      href: "/cells/matching",
      inProgress: Number(cellMatchStats[0]?.draft ?? 0),
      waiting: Number(cellStats[0]?.approved ?? 0),
      blocked: 0,
      completedToday: 0,
      health: "green" as const,
    },
  ];

  const fullPipeline = [
    ...cellPipeline,
    ...pipeline,
    {
      key: "dispatch",
      label: "Dispatch",
      href: "/logistics/dispatch-orders",
      inProgress: Number(logisticsStats[0]?.inTransit ?? 0),
      waiting:
        Number(logisticsStats[0]?.draft ?? 0) +
        Number(logisticsStats[0]?.confirmed ?? 0) +
        Number(logisticsStats[0]?.loaded ?? 0),
      blocked: 0,
      completedToday: Number(deliveredToday[0]?.count ?? 0),
      health: "green" as const,
    },
  ];

  // ─── Build alerts ────────────────────────────────────────────────────────────
  const alerts: Array<{ id: string; severity: string; message: string; timestamp: string }> = [];
  if (reworkQueue > 3)
    alerts.push({ id: "rw", severity: "critical", message: `${reworkQueue} batteries in Rework Queue`, timestamp: now.toISOString() });
  if (qcPending > 5)
    alerts.push({ id: "qc", severity: "warning", message: `${qcPending} batteries awaiting QC approval`, timestamp: now.toISOString() });
  if (Number(cellStats[0]?.received ?? 0) < 50)
    alerts.push({ id: "cells", severity: "warning", message: `Low cell inventory: only ${cellStats[0]?.received ?? 0} cells received/available`, timestamp: now.toISOString() });
  if (Number(chargerStats[0]?.maintenance ?? 0) > 0)
    alerts.push({ id: "chg", severity: "warning", message: `${chargerStats[0]?.maintenance ?? 0} charger(s) under maintenance`, timestamp: now.toISOString() });
  if (Number(testEquipStats[0]?.maintenance ?? 0) > 0)
    alerts.push({ id: "te", severity: "info", message: `${testEquipStats[0]?.maintenance ?? 0} test equipment under maintenance`, timestamp: now.toISOString() });
  if (Number(logisticsStats[0]?.inTransit ?? 0) > 0)
    alerts.push({ id: "transit", severity: "info", message: `${logisticsStats[0]?.inTransit ?? 0} shipment(s) currently in transit`, timestamp: now.toISOString() });
  if (alerts.length === 0)
    alerts.push({ id: "ok", severity: "info", message: "All systems operating normally", timestamp: now.toISOString() });

  // ─── Quality summary ─────────────────────────────────────────────────────────
  const qcTotal =
    Number(qcDecisionStats[0]?.approved ?? 0) +
    Number(qcDecisionStats[0]?.rejected ?? 0);
  const qualitySummary = {
    passRate: qcTotal > 0 ? Math.round((Number(qcDecisionStats[0]?.approved ?? 0) / qcTotal) * 1000) / 10 : 0,
    rejectRate: qcTotal > 0 ? Math.round((Number(qcDecisionStats[0]?.rejected ?? 0) / qcTotal) * 1000) / 10 : 0,
    testPassCount: Number(testResultStats[0]?.passCount ?? 0),
    testFailCount: Number(testResultStats[0]?.failCount ?? 0),
    sampleCount: qcTotal,
  };

  res.json({
    refreshedAt: now.toISOString(),
    kpis: {
      todayTarget,
      todayCompleted,
      productionEfficiency,
      inProgress,
      qcPending,
      dispatchReady,
      reworkQueue,
      chargerUtilization,
    },
    pipeline: fullPipeline,
    alerts,
    recentOrders,
    operatorActivity: operatorActivity.map((o) => ({
      operatorName: o.operatorName,
      stage: o.stageType,
      lastActivity: o.lastActivity,
      batteriesCompletedToday: Number(o.batteriesCompletedToday ?? 0),
    })),
    equipmentStatus: {
      chargers: {
        total: chargerTotal,
        available: Number(chargerStats[0]?.available ?? 0),
        busy: chargerBusy,
        maintenance: Number(chargerStats[0]?.maintenance ?? 0),
      },
      testEquipment: {
        total: Number(testEquipStats[0]?.total ?? 0),
        available: Number(testEquipStats[0]?.available ?? 0),
        busy: Number(testEquipStats[0]?.busy ?? 0),
        maintenance: Number(testEquipStats[0]?.maintenance ?? 0),
      },
    },
    qualitySummary,
    logistics: {
      readyForDispatch: dispatchReady,
      inTransit: Number(logisticsStats[0]?.inTransit ?? 0),
      deliveredToday: Number(deliveredToday[0]?.count ?? 0),
      totalDealers: Number(dealerCount[0]?.total ?? 0),
      ordersByStatus: logisticsStats[0],
    },
    cellInventory: {
      total: Number(cellStats[0]?.total ?? 0),
      received: Number(cellStats[0]?.received ?? 0),
      grading: Number(cellStats[0]?.grading ?? 0),
      approved: Number(cellStats[0]?.approved ?? 0),
      reserved: Number(cellStats[0]?.reserved ?? 0),
      allocated: Number(cellStats[0]?.allocated ?? 0),
      rejected: Number(cellStats[0]?.rejected ?? 0),
      quarantine: Number(cellStats[0]?.quarantine ?? 0),
    },
    orderStats: {
      total: Number(orderStats[0]?.total ?? 0),
      inProgress,
      completed: Number(orderStats[0]?.totalCompleted ?? 0),
      draft: Number(orderStats[0]?.draft ?? 0),
    },
  });
});

export default router;
