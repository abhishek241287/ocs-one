import { Router, IRouter } from "express";
import {
  db,
  mfgOrderStagesTable,
  logisticsDispatchOrdersTable,
  logisticsDispatchItemsTable,
  logisticsShipmentEventsTable,
} from "@workspace/db";
import { sql, count, eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/", async (req, res) => {
  // Batteries with packing stage approved (ready for dispatch) but not yet dispatched
  const [readyResult] = await db
    .select({
      readyForDispatch: sql<number>`count(*) filter (where ${mfgOrderStagesTable.stageType} = 'packing' and ${mfgOrderStagesTable.status} = 'approved')`,
    })
    .from(mfgOrderStagesTable);

  // Batteries whose packing stage was completed today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [packedResult] = await db
    .select({
      packedToday: sql<number>`count(*) filter (where ${mfgOrderStagesTable.stageType} = 'packing' and ${mfgOrderStagesTable.completedAt} >= ${today.toISOString()}::timestamptz)`,
    })
    .from(mfgOrderStagesTable);

  // Batteries in dispatch items (dispatched but not delivered)
  const [waitingResult] = await db
    .select({ waitingDispatch: count() })
    .from(logisticsDispatchOrdersTable)
    .where(sql`${logisticsDispatchOrdersTable.status} in ('draft', 'confirmed', 'loaded')`);

  // In transit count
  const [transitResult] = await db
    .select({ inTransit: count() })
    .from(logisticsDispatchOrdersTable)
    .where(sql`${logisticsDispatchOrdersTable.status} = 'in_transit'`);

  // Delivered today
  const [deliveredResult] = await db
    .select({
      deliveredToday: sql<number>`count(*) filter (where ${logisticsShipmentEventsTable.eventType} = 'delivered' and ${logisticsShipmentEventsTable.occurredAt} >= ${today.toISOString()}::timestamptz)`,
    })
    .from(logisticsShipmentEventsTable);

  res.json({
    readyForDispatch: Number(readyResult?.readyForDispatch ?? 0),
    packedToday: Number(packedResult?.packedToday ?? 0),
    waitingDispatch: Number(waitingResult?.waitingDispatch ?? 0),
    inTransit: Number(transitResult?.inTransit ?? 0),
    deliveredToday: Number(deliveredResult?.deliveredToday ?? 0),
  });
});

export default router;
