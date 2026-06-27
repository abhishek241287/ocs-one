import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  logisticsDispatchOrdersTable,
  logisticsDispatchItemsTable,
  logisticsDealersTable,
} from "@workspace/db";
import { sql, count } from "drizzle-orm";

const router: IRouter = Router();

router.get("/", async (_req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString();

  const [dispatchSummary] = await db.select({
    total: count(),
    draft: sql<number>`count(*) filter (where ${logisticsDispatchOrdersTable.status} = 'draft'::logistics_dispatch_status)`,
    confirmed: sql<number>`count(*) filter (where ${logisticsDispatchOrdersTable.status} = 'confirmed'::logistics_dispatch_status)`,
    loaded: sql<number>`count(*) filter (where ${logisticsDispatchOrdersTable.status} = 'loaded'::logistics_dispatch_status)`,
    inTransit: sql<number>`count(*) filter (where ${logisticsDispatchOrdersTable.status} = 'in_transit'::logistics_dispatch_status)`,
    delivered: sql<number>`count(*) filter (where ${logisticsDispatchOrdersTable.status} = 'delivered'::logistics_dispatch_status)`,
    loadedToday: sql<number>`count(*) filter (where ${logisticsDispatchOrdersTable.status} = 'loaded'::logistics_dispatch_status and ${logisticsDispatchOrdersTable.updatedAt} >= ${todayIso}::timestamptz)`,
    dispatchedToday: sql<number>`count(*) filter (where ${logisticsDispatchOrdersTable.status} in ('in_transit'::logistics_dispatch_status,'delivered'::logistics_dispatch_status) and ${logisticsDispatchOrdersTable.updatedAt} >= ${todayIso}::timestamptz)`,
  }).from(logisticsDispatchOrdersTable);

  const byDealer = await db.select({
    dealerName: logisticsDealersTable.dealerName,
    territory: logisticsDealersTable.territory,
    total: count(),
    delivered: sql<number>`count(*) filter (where ${logisticsDispatchOrdersTable.status} = 'delivered'::logistics_dispatch_status)`,
    inTransit: sql<number>`count(*) filter (where ${logisticsDispatchOrdersTable.status} = 'in_transit'::logistics_dispatch_status)`,
  }).from(logisticsDispatchOrdersTable)
    .innerJoin(logisticsDealersTable, sql`${logisticsDispatchOrdersTable.dealerId} = ${logisticsDealersTable.id}`)
    .groupBy(logisticsDealersTable.dealerName, logisticsDealersTable.territory)
    .orderBy(sql`count(*) desc`)
    .limit(20);

  const byTerritory = await db.select({
    territory: logisticsDealersTable.territory,
    total: count(),
    delivered: sql<number>`count(*) filter (where ${logisticsDispatchOrdersTable.status} = 'delivered'::logistics_dispatch_status)`,
  }).from(logisticsDispatchOrdersTable)
    .innerJoin(logisticsDealersTable, sql`${logisticsDispatchOrdersTable.dealerId} = ${logisticsDealersTable.id}`)
    .groupBy(logisticsDealersTable.territory)
    .orderBy(sql`count(*) desc`);

  const byMonth = await db.select({
    month: sql<string>`to_char(date_trunc('month', ${logisticsDispatchOrdersTable.createdAt}), 'Mon YYYY')`,
    total: count(),
    dispatched: sql<number>`count(*) filter (where ${logisticsDispatchOrdersTable.status} in ('in_transit'::logistics_dispatch_status,'delivered'::logistics_dispatch_status))`,
  }).from(logisticsDispatchOrdersTable)
    .groupBy(sql`date_trunc('month', ${logisticsDispatchOrdersTable.createdAt})`)
    .orderBy(sql`date_trunc('month', ${logisticsDispatchOrdersTable.createdAt})`)
    .limit(12);

  const [itemCount] = await db.select({
    totalBatteriesShipped: count(),
  }).from(logisticsDispatchItemsTable)
    .innerJoin(logisticsDispatchOrdersTable, sql`${logisticsDispatchItemsTable.dispatchOrderId} = ${logisticsDispatchOrdersTable.id}`)
    .where(sql`${logisticsDispatchOrdersTable.status} in ('in_transit'::logistics_dispatch_status,'delivered'::logistics_dispatch_status)`);

  const statusFlow = [
    { status: "Draft", count: Number(dispatchSummary?.draft ?? 0) },
    { status: "Confirmed", count: Number(dispatchSummary?.confirmed ?? 0) },
    { status: "Loaded", count: Number(dispatchSummary?.loaded ?? 0) },
    { status: "In Transit", count: Number(dispatchSummary?.inTransit ?? 0) },
    { status: "Delivered", count: Number(dispatchSummary?.delivered ?? 0) },
  ];

  res.json({
    summary: {
      total: Number(dispatchSummary?.total ?? 0),
      loadedToday: Number(dispatchSummary?.loadedToday ?? 0),
      dispatchedToday: Number(dispatchSummary?.dispatchedToday ?? 0),
      inTransit: Number(dispatchSummary?.inTransit ?? 0),
      delivered: Number(dispatchSummary?.delivered ?? 0),
      totalBatteriesShipped: Number(itemCount?.totalBatteriesShipped ?? 0),
    },
    statusFlow,
    byDealer: byDealer.map(r => ({
      dealerName: r.dealerName,
      territory: r.territory,
      total: Number(r.total),
      delivered: Number(r.delivered),
      inTransit: Number(r.inTransit),
    })),
    byTerritory: byTerritory.map(r => ({
      territory: r.territory ?? "Unknown",
      total: Number(r.total),
      delivered: Number(r.delivered),
    })),
    byMonth: byMonth.map(r => ({
      month: r.month,
      total: Number(r.total),
      dispatched: Number(r.dispatched),
    })),
    refreshedAt: new Date().toISOString(),
  });
});

export default router;
