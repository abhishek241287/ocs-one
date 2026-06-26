import { Router, IRouter } from "express";
import { db, mfgProductionOrdersTable, mfgOrderStagesTable, cellsTable } from "@workspace/db";
import { eq, count, sql } from "drizzle-orm";

const router: IRouter = Router({ mergeParams: true });

// GET /manufacturing/dashboard
router.get("/", async (req, res) => {
  const [orderStats] = await db
    .select({
      total: count(),
      inProgress: sql<number>`count(*) filter (where ${mfgProductionOrdersTable.status} = 'in_progress')`,
      completed: sql<number>`count(*) filter (where ${mfgProductionOrdersTable.status} = 'completed')`,
      draft: sql<number>`count(*) filter (where ${mfgProductionOrdersTable.status} = 'draft')`,
    })
    .from(mfgProductionOrdersTable);

  // Batteries currently in each stage
  const [assemblyStats] = await db
    .select({
      underAssembly: sql<number>`count(*) filter (where ${mfgOrderStagesTable.stageType} = 'assembly' and ${mfgOrderStagesTable.status} in ('pending', 'in_progress', 'completed'))`,
      compressionPending: sql<number>`count(*) filter (where ${mfgOrderStagesTable.stageType} = 'compression' and ${mfgOrderStagesTable.status} in ('pending', 'in_progress', 'completed'))`,
      bmsPending: sql<number>`count(*) filter (where ${mfgOrderStagesTable.stageType} = 'bms_allocation' and ${mfgOrderStagesTable.status} in ('pending', 'in_progress', 'completed'))`,
      programmingPending: sql<number>`count(*) filter (where ${mfgOrderStagesTable.stageType} = 'bms_programming' and ${mfgOrderStagesTable.status} in ('pending', 'in_progress', 'completed'))`,
    })
    .from(mfgOrderStagesTable)
    .innerJoin(
      mfgProductionOrdersTable,
      eq(mfgOrderStagesTable.productionOrderId, mfgProductionOrdersTable.id)
    )
    .where(eq(mfgProductionOrdersTable.status, "in_progress"));

  // Average assembly time in hours (for completed assembly stages)
  const [assemblyTimeResult] = await db
    .select({
      avgMs: sql<number>`avg(extract(epoch from (${mfgOrderStagesTable.completedAt} - ${mfgOrderStagesTable.startedAt})) * 1000)`,
    })
    .from(mfgOrderStagesTable)
    .where(
      sql`${mfgOrderStagesTable.stageType} = 'assembly' and ${mfgOrderStagesTable.status} in ('completed', 'approved') and ${mfgOrderStagesTable.startedAt} is not null and ${mfgOrderStagesTable.completedAt} is not null`
    );

  const [cellStats] = await db
    .select({
      allocated: sql<number>`count(*) filter (where ${cellsTable.status} = 'allocated')`,
    })
    .from(cellsTable);

  const avgMs = assemblyTimeResult?.avgMs;
  const avgAssemblyTimeHrs = avgMs != null ? Math.round((Number(avgMs) / 3600000) * 10) / 10 : null;

  res.json({
    totalOrders: Number(orderStats?.total ?? 0),
    ordersInProgress: Number(orderStats?.inProgress ?? 0),
    ordersCompleted: Number(orderStats?.completed ?? 0),
    ordersDraft: Number(orderStats?.draft ?? 0),
    batteriesUnderAssembly: Number(assemblyStats?.underAssembly ?? 0),
    compressionPending: Number(assemblyStats?.compressionPending ?? 0),
    bmsPending: Number(assemblyStats?.bmsPending ?? 0),
    programmingPending: Number(assemblyStats?.programmingPending ?? 0),
    cellsAllocatedTotal: Number(cellStats?.allocated ?? 0),
    avgAssemblyTimeHrs,
  });
});

export default router;
