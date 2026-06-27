import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  mfgProductionOrdersTable,
  mfgOrderStagesTable,
} from "@workspace/db";
import { sql, and, gte, lte } from "drizzle-orm";

const router: IRouter = Router();

router.get("/", async (req, res) => {
  const { from, to, productId } = req.query as Record<string, string | undefined>;

  const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 86400000);
  const toDate = to ? new Date(to) : new Date();
  toDate.setHours(23, 59, 59, 999);

  const conditions = [
    gte(mfgProductionOrdersTable.createdAt, fromDate),
    lte(mfgProductionOrdersTable.createdAt, toDate),
    ...(productId ? [sql`${mfgProductionOrdersTable.productId} = ${productId}::uuid`] : []),
  ];

  const byDay = await db.select({
    date: sql<string>`date_trunc('day', ${mfgProductionOrdersTable.createdAt})::date`,
    created: sql<number>`count(*)`,
    completed: sql<number>`count(*) filter (where ${mfgProductionOrdersTable.status} = 'completed'::mfg_order_status)`,
  }).from(mfgProductionOrdersTable)
    .where(and(...conditions))
    .groupBy(sql`date_trunc('day', ${mfgProductionOrdersTable.createdAt})`)
    .orderBy(sql`date_trunc('day', ${mfgProductionOrdersTable.createdAt})`);

  const byWeek = await db.select({
    week: sql<string>`to_char(date_trunc('week', ${mfgProductionOrdersTable.createdAt}), 'YYYY-"W"IW')`,
    created: sql<number>`count(*)`,
    completed: sql<number>`count(*) filter (where ${mfgProductionOrdersTable.status} = 'completed'::mfg_order_status)`,
  }).from(mfgProductionOrdersTable)
    .where(and(...conditions))
    .groupBy(sql`date_trunc('week', ${mfgProductionOrdersTable.createdAt})`)
    .orderBy(sql`date_trunc('week', ${mfgProductionOrdersTable.createdAt})`);

  const byMonth = await db.select({
    month: sql<string>`to_char(date_trunc('month', ${mfgProductionOrdersTable.createdAt}), 'Mon YYYY')`,
    created: sql<number>`count(*)`,
    completed: sql<number>`count(*) filter (where ${mfgProductionOrdersTable.status} = 'completed'::mfg_order_status)`,
  }).from(mfgProductionOrdersTable)
    .where(and(...conditions))
    .groupBy(sql`date_trunc('month', ${mfgProductionOrdersTable.createdAt})`)
    .orderBy(sql`date_trunc('month', ${mfgProductionOrdersTable.createdAt})`);

  const byOperator = await db.select({
    operator: sql<string>`coalesce(${mfgOrderStagesTable.operatorName}, 'Unassigned')`,
    completed: sql<number>`count(*) filter (where ${mfgOrderStagesTable.status} in ('completed'::mfg_stage_status,'approved'::mfg_stage_status))`,
  }).from(mfgOrderStagesTable)
    .where(sql`${mfgOrderStagesTable.stageType} = 'assembly'::mfg_stage_type`)
    .groupBy(mfgOrderStagesTable.operatorName)
    .orderBy(sql`count(*) desc`)
    .limit(20);

  const stageTimings = await db.select({
    stage: mfgOrderStagesTable.stageType,
    avgHrs: sql<number>`avg(extract(epoch from (${mfgOrderStagesTable.completedAt} - ${mfgOrderStagesTable.startedAt})) / 3600) filter (where ${mfgOrderStagesTable.startedAt} is not null and ${mfgOrderStagesTable.completedAt} is not null)`,
    count: sql<number>`count(*) filter (where ${mfgOrderStagesTable.status} in ('completed'::mfg_stage_status,'approved'::mfg_stage_status))`,
  }).from(mfgOrderStagesTable)
    .groupBy(mfgOrderStagesTable.stageType)
    .orderBy(mfgOrderStagesTable.stageType);

  res.json({
    filters: { from: fromDate.toISOString(), to: toDate.toISOString(), productId: productId ?? null },
    byDay: byDay.map(r => ({ ...r, created: Number(r.created), completed: Number(r.completed) })),
    byWeek: byWeek.map(r => ({ ...r, created: Number(r.created), completed: Number(r.completed) })),
    byMonth: byMonth.map(r => ({ ...r, created: Number(r.created), completed: Number(r.completed) })),
    byOperator: byOperator.map(r => ({ ...r, completed: Number(r.completed) })),
    stageTimings: stageTimings.map(r => ({
      stage: r.stage,
      avgHrs: r.avgHrs != null ? Math.round(Number(r.avgHrs) * 10) / 10 : null,
      count: Number(r.count),
    })),
    refreshedAt: new Date().toISOString(),
  });
});

export default router;
