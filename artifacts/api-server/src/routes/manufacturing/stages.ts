import { Router, IRouter } from "express";
import {
  db,
  mfgOrderStagesTable,
  mfgProductionOrdersTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  ListOrderStagesParams,
  GetOrderStageParams,
  UpdateOrderStageParams,
  UpdateOrderStageBody,
  StartStageParams,
  StartStageBody,
  CompleteStageParams,
  CompleteStageBody,
  ApproveStageParams,
  ApproveStageBody,
  RejectStageParams,
  RejectStageBody,
} from "@workspace/api-zod";
import { logEvent, getNextStage, type StageTypeValue } from "./helpers";

const router: IRouter = Router({ mergeParams: true });

async function getStageOrFail(
  orderId: string,
  stageType: string,
  res: Parameters<Parameters<IRouter["get"]>[1]>[1]
) {
  const [stage] = await db
    .select()
    .from(mfgOrderStagesTable)
    .where(
      and(
        eq(mfgOrderStagesTable.productionOrderId, orderId),
        eq(mfgOrderStagesTable.stageType, stageType as StageTypeValue)
      )
    )
    .limit(1);
  return stage;
}

// GET /manufacturing/orders/:id/stages
router.get("/", async (req, res) => {
  const { id } = ListOrderStagesParams.parse(req.params);
  const stages = await db
    .select()
    .from(mfgOrderStagesTable)
    .where(eq(mfgOrderStagesTable.productionOrderId, id))
    .orderBy(mfgOrderStagesTable.stageOrder);
  res.json({ items: stages });
});

// GET /manufacturing/orders/:id/stages/:stage
router.get("/:stage", async (req, res) => {
  const { id, stage } = GetOrderStageParams.parse(req.params);
  const found = await getStageOrFail(id, stage, res);
  if (!found) {
    res.status(404).json({ error: "Stage not found" });
    return;
  }
  res.json(found);
});

// PATCH /manufacturing/orders/:id/stages/:stage — save notes/stageData without transition
router.patch("/:stage", async (req, res) => {
  const { id, stage } = UpdateOrderStageParams.parse(req.params);
  const body = UpdateOrderStageBody.parse(req.body);

  const found = await getStageOrFail(id, stage, res);
  if (!found) {
    res.status(404).json({ error: "Stage not found" });
    return;
  }

  const updates: Partial<typeof mfgOrderStagesTable.$inferInsert> = {};
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.stageData !== undefined) updates.stageData = body.stageData as Record<string, unknown>;

  const [updated] = await db
    .update(mfgOrderStagesTable)
    .set(updates)
    .where(eq(mfgOrderStagesTable.id, found.id))
    .returning();

  res.json(updated);
});

// POST /manufacturing/orders/:id/stages/:stage/start — pending → in_progress
router.post("/:stage/start", async (req, res) => {
  const { id, stage } = StartStageParams.parse(req.params);
  const body = StartStageBody.parse(req.body);

  const found = await getStageOrFail(id, stage, res);
  if (!found) {
    res.status(404).json({ error: "Stage not found" });
    return;
  }
  if (found.status !== "pending") {
    res.status(409).json({ error: `Stage is already ${found.status}` });
    return;
  }

  // Guard: previous stage must be approved (unless this is the first stage)
  if (found.stageOrder > 1) {
    const [prevStage] = await db
      .select()
      .from(mfgOrderStagesTable)
      .where(
        and(
          eq(mfgOrderStagesTable.productionOrderId, id),
          eq(mfgOrderStagesTable.stageOrder, found.stageOrder - 1)
        )
      )
      .limit(1);
    if (!prevStage || prevStage.status !== "approved") {
      res.status(409).json({ error: "Previous stage must be approved before starting this stage" });
      return;
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(mfgOrderStagesTable)
      .set({
        status: "in_progress",
        operatorName: body.operatorName,
        startedAt: new Date(),
        notes: body.notes ?? found.notes,
      })
      .where(eq(mfgOrderStagesTable.id, found.id));

    // Auto-advance order status if still draft
    await tx
      .update(mfgProductionOrdersTable)
      .set({ status: "in_progress", currentStage: stage as StageTypeValue })
      .where(
        and(
          eq(mfgProductionOrdersTable.id, id),
          eq(mfgProductionOrdersTable.status, "draft")
        )
      );

    await logEvent(tx, {
      productionOrderId: id,
      eventType: "stage_started",
      stageType: stage as StageTypeValue,
      actor: body.operatorName,
      description: `Stage ${stage.replace(/_/g, " ")} started`,
    });
  });

  const updated = await getStageOrFail(id, stage, res);
  res.json(updated);
});

// POST /manufacturing/orders/:id/stages/:stage/complete — in_progress → completed
router.post("/:stage/complete", async (req, res) => {
  const { id, stage } = CompleteStageParams.parse(req.params);
  const body = CompleteStageBody.parse(req.body);

  const found = await getStageOrFail(id, stage, res);
  if (!found) {
    res.status(404).json({ error: "Stage not found" });
    return;
  }
  if (found.status !== "in_progress") {
    res.status(409).json({ error: `Stage must be in_progress to complete (currently ${found.status})` });
    return;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(mfgOrderStagesTable)
      .set({
        status: "completed",
        completedAt: new Date(),
        notes: body.notes ?? found.notes,
        stageData: (body.stageData as Record<string, unknown>) ?? found.stageData,
      })
      .where(eq(mfgOrderStagesTable.id, found.id));

    await logEvent(tx, {
      productionOrderId: id,
      eventType: "stage_completed",
      stageType: stage as StageTypeValue,
      actor: body.operatorName,
      description: `Stage ${stage.replace(/_/g, " ")} completed — awaiting supervisor approval`,
    });
  });

  const updated = await getStageOrFail(id, stage, res);
  res.json(updated);
});

// POST /manufacturing/orders/:id/stages/:stage/approve — completed → approved
router.post("/:stage/approve", async (req, res) => {
  const { id, stage } = ApproveStageParams.parse(req.params);
  const body = ApproveStageBody.parse(req.body);

  const found = await getStageOrFail(id, stage, res);
  if (!found) {
    res.status(404).json({ error: "Stage not found" });
    return;
  }
  if (found.status !== "completed") {
    res.status(409).json({ error: `Stage must be completed to approve (currently ${found.status})` });
    return;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(mfgOrderStagesTable)
      .set({
        status: "approved",
        supervisorName: body.supervisorName,
        approvedAt: new Date(),
        notes: body.notes ?? found.notes,
      })
      .where(eq(mfgOrderStagesTable.id, found.id));

    const nextStage = getNextStage(stage as StageTypeValue);
    if (nextStage) {
      await tx
        .update(mfgProductionOrdersTable)
        .set({ currentStage: nextStage })
        .where(eq(mfgProductionOrdersTable.id, id));
    } else {
      // Last stage approved — order complete
      await tx
        .update(mfgProductionOrdersTable)
        .set({ status: "completed", currentStage: stage as StageTypeValue })
        .where(eq(mfgProductionOrdersTable.id, id));
    }

    await logEvent(tx, {
      productionOrderId: id,
      eventType: "stage_approved",
      stageType: stage as StageTypeValue,
      actor: body.supervisorName,
      description: `Stage ${stage.replace(/_/g, " ")} approved by ${body.supervisorName}${nextStage ? ` — ${nextStage.replace(/_/g, " ")} unlocked` : " — battery production complete"}`,
    });
  });

  const updated = await getStageOrFail(id, stage, res);
  res.json(updated);
});

// POST /manufacturing/orders/:id/stages/:stage/reject — completed → rejected → pending (redo)
router.post("/:stage/reject", async (req, res) => {
  const { id, stage } = RejectStageParams.parse(req.params);
  const body = RejectStageBody.parse(req.body);

  const found = await getStageOrFail(id, stage, res);
  if (!found) {
    res.status(404).json({ error: "Stage not found" });
    return;
  }
  if (found.status !== "completed") {
    res.status(409).json({ error: `Stage must be completed to reject (currently ${found.status})` });
    return;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(mfgOrderStagesTable)
      .set({
        status: "pending",
        supervisorName: body.supervisorName,
        completedAt: null,
        notes: body.notes,
      })
      .where(eq(mfgOrderStagesTable.id, found.id));

    await tx
      .update(mfgProductionOrdersTable)
      .set({ currentStage: stage as StageTypeValue })
      .where(eq(mfgProductionOrdersTable.id, id));

    await logEvent(tx, {
      productionOrderId: id,
      eventType: "stage_rejected",
      stageType: stage as StageTypeValue,
      actor: body.supervisorName,
      description: `Stage ${stage.replace(/_/g, " ")} rejected by ${body.supervisorName}: ${body.notes}`,
    });
  });

  const updated = await getStageOrFail(id, stage, res);
  res.json(updated);
});

export default router;
