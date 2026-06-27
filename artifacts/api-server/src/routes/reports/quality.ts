import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  mfgTestResultsTable,
  mfgReworkTicketsTable,
  mfgOrderStagesTable,
} from "@workspace/db";
import { sql, count } from "drizzle-orm";

const router: IRouter = Router();

router.get("/", async (_req, res) => {
  const [testSummary] = await db.select({
    total: count(),
    passed: sql<number>`count(*) filter (where ${mfgTestResultsTable.result} = 'pass'::mfg_test_result)`,
    failed: sql<number>`count(*) filter (where ${mfgTestResultsTable.result} = 'fail'::mfg_test_result)`,
  }).from(mfgTestResultsTable);

  const byTestType = await db.select({
    testType: mfgTestResultsTable.testType,
    total: count(),
    passed: sql<number>`count(*) filter (where ${mfgTestResultsTable.result} = 'pass'::mfg_test_result)`,
    failed: sql<number>`count(*) filter (where ${mfgTestResultsTable.result} = 'fail'::mfg_test_result)`,
  }).from(mfgTestResultsTable)
    .groupBy(mfgTestResultsTable.testType)
    .orderBy(mfgTestResultsTable.testType);

  const [qcStageStats] = await db.select({
    total: count(),
    approved: sql<number>`count(*) filter (where ${mfgOrderStagesTable.status} = 'approved'::mfg_stage_status)`,
    rejected: sql<number>`count(*) filter (where ${mfgOrderStagesTable.status} = 'rejected'::mfg_stage_status)`,
  }).from(mfgOrderStagesTable)
    .where(sql`${mfgOrderStagesTable.stageType} = 'quality_control'::mfg_stage_type`);

  const stageRejections = await db.select({
    stage: mfgOrderStagesTable.stageType,
    rejected: sql<number>`count(*) filter (where ${mfgOrderStagesTable.status} = 'rejected'::mfg_stage_status)`,
  }).from(mfgOrderStagesTable)
    .groupBy(mfgOrderStagesTable.stageType)
    .orderBy(sql`count(*) filter (where ${mfgOrderStagesTable.status} = 'rejected'::mfg_stage_status) desc`);

  const [reworkSummary] = await db.select({
    total: count(),
    open: sql<number>`count(*) filter (where ${mfgReworkTicketsTable.status} = 'open'::mfg_rework_status)`,
    resolved: sql<number>`count(*) filter (where ${mfgReworkTicketsTable.status} = 'resolved'::mfg_rework_status)`,
  }).from(mfgReworkTicketsTable);

  const topDefects = await db.select({
    reason: mfgReworkTicketsTable.failureReason,
    count: count(),
  }).from(mfgReworkTicketsTable)
    .groupBy(mfgReworkTicketsTable.failureReason)
    .orderBy(sql`count(*) desc`)
    .limit(10);

  const total = Number(testSummary?.total ?? 0);
  const passed = Number(testSummary?.passed ?? 0);
  const failed = Number(testSummary?.failed ?? 0);
  const qcTotal = Number(qcStageStats?.total ?? 0);
  const qcApproved = Number(qcStageStats?.approved ?? 0);
  const qcRejected = Number(qcStageStats?.rejected ?? 0);

  res.json({
    summary: {
      totalTests: total,
      passed,
      failed,
      qcPassPct: total > 0 ? Math.round((passed / total) * 100) : null,
      qcRejectPct: total > 0 ? Math.round((failed / total) * 100) : null,
      firstPassYield: total > 0 ? Math.round((passed / total) * 100) : null,
      qcApprovals: qcTotal,
      qcApproved,
      qcRejected,
      qcApprovalPct: qcTotal > 0 ? Math.round((qcApproved / qcTotal) * 100) : null,
    },
    rework: {
      total: Number(reworkSummary?.total ?? 0),
      open: Number(reworkSummary?.open ?? 0),
      resolved: Number(reworkSummary?.resolved ?? 0),
    },
    byTestType: byTestType.map(r => ({
      testType: r.testType,
      total: Number(r.total),
      passed: Number(r.passed),
      failed: Number(r.failed),
      passRate: Number(r.total) > 0 ? Math.round((Number(r.passed) / Number(r.total)) * 100) : null,
    })),
    stageRejections: stageRejections
      .filter(r => Number(r.rejected) > 0)
      .map(r => ({ stage: r.stage, rejected: Number(r.rejected) })),
    topDefects: topDefects.map(r => ({ reason: r.reason ?? "Unknown", count: Number(r.count) })),
    refreshedAt: new Date().toISOString(),
  });
});

export default router;
