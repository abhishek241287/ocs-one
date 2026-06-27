import { Router, IRouter } from "express";
import {
  db,
  mfgTestResultsTable,
  mfgOrderStagesTable,
  mfgReworkTicketsTable,
} from "@workspace/db";
import { sql, count } from "drizzle-orm";

const router: IRouter = Router({ mergeParams: true });

router.get("/", async (req, res) => {
  const [stageStats] = await db
    .select({
      underTest: sql<number>`count(*) filter (where ${mfgOrderStagesTable.stageType} = 'testing' and ${mfgOrderStagesTable.status} in ('in_progress', 'completed'))`,
      qcPending: sql<number>`count(*) filter (where ${mfgOrderStagesTable.stageType} = 'quality_control' and ${mfgOrderStagesTable.status} in ('pending', 'in_progress'))`,
    })
    .from(mfgOrderStagesTable);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [resultStats] = await db
    .select({
      passedToday: sql<number>`count(*) filter (where ${mfgTestResultsTable.result} = 'pass' and ${mfgTestResultsTable.completedAt} >= ${today.toISOString()}::timestamptz)`,
      failedToday: sql<number>`count(*) filter (where ${mfgTestResultsTable.result} = 'fail' and ${mfgTestResultsTable.completedAt} >= ${today.toISOString()}::timestamptz)`,
    })
    .from(mfgTestResultsTable);

  const [reworkStats] = await db
    .select({ open: count() })
    .from(mfgReworkTicketsTable)
    .where(sql`${mfgReworkTicketsTable.status} in ('open', 'in_progress')`);

  const [avgTimeResult] = await db
    .select({
      avgMs: sql<number>`avg(extract(epoch from (${mfgOrderStagesTable.completedAt} - ${mfgOrderStagesTable.startedAt})) * 1000)`,
    })
    .from(mfgOrderStagesTable)
    .where(
      sql`${mfgOrderStagesTable.stageType} = 'testing' and ${mfgOrderStagesTable.status} in ('completed', 'approved') and ${mfgOrderStagesTable.startedAt} is not null and ${mfgOrderStagesTable.completedAt} is not null`
    );

  const avgMs = avgTimeResult?.avgMs;
  const avgTestTimeHrs = avgMs != null ? Math.round((Number(avgMs) / 3600000) * 10) / 10 : null;

  res.json({
    batteriesUnderTest: Number(stageStats?.underTest ?? 0),
    passedToday: Number(resultStats?.passedToday ?? 0),
    failedToday: Number(resultStats?.failedToday ?? 0),
    reworkQueueCount: Number(reworkStats?.open ?? 0),
    qcPendingCount: Number(stageStats?.qcPending ?? 0),
    avgTestTimeHrs,
  });
});

export default router;
