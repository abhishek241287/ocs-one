import { Router, IRouter } from "express";
import { db, mfgBatteryTimelineTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { GetOrderTimelineParams } from "@workspace/api-zod";

const router: IRouter = Router({ mergeParams: true });

// GET /manufacturing/orders/:id/timeline
router.get("/", async (req, res) => {
  const { id } = GetOrderTimelineParams.parse(req.params);
  const events = await db
    .select()
    .from(mfgBatteryTimelineTable)
    .where(eq(mfgBatteryTimelineTable.productionOrderId, id))
    .orderBy(desc(mfgBatteryTimelineTable.createdAt));
  res.json({ items: events });
});

export default router;
