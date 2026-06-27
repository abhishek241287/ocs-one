import { Router, IRouter } from "express";
import {
  db,
  mfgTestResultsTable,
  mfgProductionOrdersTable,
  mfgBatteryTimelineTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  UpsertTestResultBody,
} from "@workspace/api-zod";

const router: IRouter = Router({ mergeParams: true });

type TestTypeValue = "capacity" | "charge_discharge" | "protection" | "internal_resistance";

// GET /manufacturing/orders/:id/test-results
router.get("/", async (req, res) => {
  const id = (req.params as Record<string, string>).id;

  const results = await db
    .select()
    .from(mfgTestResultsTable)
    .where(eq(mfgTestResultsTable.productionOrderId, id))
    .orderBy(mfgTestResultsTable.createdAt);

  res.json(results);
});

// PUT /manufacturing/orders/:id/test-results/:testType
router.put("/:testType", async (req, res) => {
  const id = (req.params as Record<string, string>).id;
  const testType = req.params.testType as TestTypeValue;
  const body = UpsertTestResultBody.parse(req.body);

  const [order] = await db
    .select({ id: mfgProductionOrdersTable.id })
    .from(mfgProductionOrdersTable)
    .where(eq(mfgProductionOrdersTable.id, id))
    .limit(1);

  if (!order) { res.status(404).json({ error: "Order not found" }); return; }

  const [existing] = await db
    .select({ id: mfgTestResultsTable.id })
    .from(mfgTestResultsTable)
    .where(
      and(
        eq(mfgTestResultsTable.productionOrderId, id),
        eq(mfgTestResultsTable.testType, testType)
      )
    )
    .limit(1);

  let result;
  if (existing) {
    [result] = await db
      .update(mfgTestResultsTable)
      .set({
        testEquipmentId: body.testEquipmentId ?? null,
        testEquipmentName: body.testEquipmentName ?? null,
        operatorName: body.operatorName,
        startedAt: body.startedAt ? new Date(body.startedAt) : null,
        completedAt: body.completedAt ? new Date(body.completedAt) : null,
        result: body.result,
        testData: body.testData as Record<string, unknown>,
        notes: body.notes ?? null,
      })
      .where(eq(mfgTestResultsTable.id, existing.id))
      .returning();
  } else {
    [result] = await db
      .insert(mfgTestResultsTable)
      .values({
        productionOrderId: id,
        testType,
        testEquipmentId: body.testEquipmentId ?? null,
        testEquipmentName: body.testEquipmentName ?? null,
        operatorName: body.operatorName,
        startedAt: body.startedAt ? new Date(body.startedAt) : null,
        completedAt: body.completedAt ? new Date(body.completedAt) : null,
        result: body.result,
        testData: body.testData as Record<string, unknown>,
        notes: body.notes ?? null,
      })
      .returning();
  }

  await db.insert(mfgBatteryTimelineTable).values({
    productionOrderId: id,
    eventType: "test_result_recorded",
    stageType: "testing",
    actor: body.operatorName,
    description: `${testType.replace(/_/g, " ")} test recorded: ${body.result.toUpperCase()}`,
    metadata: { testType, result: body.result },
  });

  res.json(result);
});

export default router;
