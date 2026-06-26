import { Router, IRouter } from "express";
import { db, mfgFormationReportsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { GetFormationReportParams } from "@workspace/api-zod";

const router: IRouter = Router({ mergeParams: true });

// GET /manufacturing/orders/:id/formation-report
router.get("/", async (req, res) => {
  const { id } = GetFormationReportParams.parse(req.params);

  const [report] = await db
    .select()
    .from(mfgFormationReportsTable)
    .where(eq(mfgFormationReportsTable.productionOrderId, id))
    .limit(1);

  if (!report) {
    res.status(404).json({ error: "Formation report not found" });
    return;
  }

  res.json(report);
});

export default router;
