import { Router, IRouter } from "express";
import {
  db,
  mfgOrderStagesTable,
  mfgProductionOrdersTable,
  mfgBatteryGenealogyTable,
  mfgChargerUnitsTable,
  mfgFormationReportsTable,
  cellMatchesTable,
  cellMatchItemsTable,
  cellsTable,
  cellLotsTable,
  masterBmsTable,
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
  PauseStageParams,
  PauseStageBody,
  ResumeStageParams,
  ResumeStageBody,
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

// ─── Stage-specific side effects on start ────────────────────────────────────

async function onChargingStart(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  orderId: string,
  stageData: Record<string, unknown>
): Promise<void> {
  const chargerUnitId = stageData?.chargerUnitId as string | undefined;
  if (!chargerUnitId) return;
  await tx
    .update(mfgChargerUnitsTable)
    .set({ status: "busy", currentOrderId: orderId })
    .where(eq(mfgChargerUnitsTable.id, chargerUnitId));
  await tx
    .update(mfgProductionOrdersTable)
    .set({ chargerUnitId })
    .where(eq(mfgProductionOrdersTable.id, orderId));
}

// ─── Stage-specific side effects on complete ────────────────────────────────

async function onCellAllocationComplete(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  orderId: string,
  stageData: Record<string, unknown>
): Promise<void> {
  const matchId = stageData?.matchId as string | undefined;
  if (!matchId) return;

  // Link match to production order
  await tx
    .update(mfgProductionOrdersTable)
    .set({ cellMatchId: matchId })
    .where(eq(mfgProductionOrdersTable.id, orderId));

  // Mark match as allocated
  await tx
    .update(cellMatchesTable)
    .set({ status: "allocated" })
    .where(eq(cellMatchesTable.id, matchId));

  // Get all cells in this match and set them to allocated
  const matchItems = await tx
    .select({
      cellDbId: cellMatchItemsTable.cellId,
      position: cellMatchItemsTable.position,
      cellCode: cellsTable.cellId,
      capacityAh: cellsTable.capacityAh,
      internalResistanceMohm: cellsTable.internalResistanceMohm,
      voltageV: cellsTable.voltageV,
      grade: cellsTable.grade,
      lotNumber: cellLotsTable.lotNumber,
    })
    .from(cellMatchItemsTable)
    .innerJoin(cellsTable, eq(cellMatchItemsTable.cellId, cellsTable.id))
    .leftJoin(cellLotsTable, eq(cellsTable.lotId, cellLotsTable.id))
    .where(eq(cellMatchItemsTable.matchId, matchId));

  for (const item of matchItems) {
    await tx
      .update(cellsTable)
      .set({ status: "allocated", allocationOrderId: orderId })
      .where(eq(cellsTable.id, item.cellDbId));

    // Auto-write genealogy for each cell
    await tx.insert(mfgBatteryGenealogyTable).values({
      productionOrderId: orderId,
      componentType: "cell",
      componentId: item.cellDbId,
      componentName: `Cell ${item.cellCode} (Grade ${item.grade ?? "?"}, ${item.capacityAh?.toFixed(2) ?? "—"} Ah)`,
      quantity: 1,
      serialNumber: item.cellCode,
      notes: `Position ${item.position} — ${item.lotNumber ?? "unknown lot"}`,
    });
  }
}

async function onAssemblyComplete(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  orderId: string,
  stageData: Record<string, unknown>
): Promise<void> {
  const components = [
    { type: "cabinet", name: stageData.cabinetSerialNumber as string | undefined, label: "Cabinet" },
    { type: "busbar", name: stageData.busbarBatch as string | undefined, label: "Busbar Batch" },
    { type: "connector", name: stageData.connectorBatch as string | undefined, label: "Connector Batch" },
  ];
  for (const c of components) {
    if (!c.name) continue;
    await tx.insert(mfgBatteryGenealogyTable).values({
      productionOrderId: orderId,
      componentType: c.type,
      componentName: c.label + ": " + c.name,
      quantity: 1,
      serialNumber: c.name,
    });
  }
}

async function onChargingComplete(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  orderId: string,
  stageData: Record<string, unknown>
): Promise<void> {
  const chargerUnitId = stageData?.chargerUnitId as string | undefined;

  // Release charger
  if (chargerUnitId) {
    await tx
      .update(mfgChargerUnitsTable)
      .set({ status: "available", currentOrderId: null })
      .where(eq(mfgChargerUnitsTable.id, chargerUnitId));
  }

  // Calculate charge time if we have start/end
  let chargeTimeMin: string | null = null;
  const chargeStart = stageData?.chargeStartTime as string | undefined;
  const chargeEnd = stageData?.chargeEndTime as string | undefined;
  if (chargeStart && chargeEnd) {
    const diffMs = new Date(chargeEnd).getTime() - new Date(chargeStart).getTime();
    chargeTimeMin = String(Math.round(diffMs / 60000));
  }

  // Auto-calculate voltage diff for top balancing
  const maxCell = parseFloat((stageData?.maxCellVoltageV as string | undefined) ?? "0");
  const minCell = parseFloat((stageData?.minCellVoltageV as string | undefined) ?? "0");
  const voltageDiffMv = maxCell > 0 && minCell > 0 ? String(Math.round((maxCell - minCell) * 1000)) : null;

  // Determine balancing status
  const diffMv = parseFloat(voltageDiffMv ?? "0");
  let balancingStatus: string | null = null;
  if (stageData?.topBalancingRequired) {
    if (diffMv <= 20) balancingStatus = "pass";
    else if (diffMv <= 50) balancingStatus = "warning";
    else balancingStatus = "fail";
  }

  // Calculate energy supplied (kWh): I * V * t / 3600 (rough estimate)
  const chargingCurrentA = parseFloat((stageData?.chargingCurrentA as string | undefined) ?? "0");
  const finalVoltageV = parseFloat((stageData?.finalVoltageV as string | undefined) ?? "0");
  const timeMin = parseFloat(chargeTimeMin ?? "0");
  let energyKwh: string | null = null;
  if (chargingCurrentA > 0 && finalVoltageV > 0 && timeMin > 0) {
    energyKwh = String(Math.round(((chargingCurrentA * finalVoltageV * timeMin) / 60000) * 100) / 100);
  }

  // Write formation report
  await tx.insert(mfgFormationReportsTable).values({
    productionOrderId: orderId,
    chargerUnitId: chargerUnitId ?? null,
    chargerCode: (stageData?.chargerCode as string | undefined) ?? null,
    operator: (stageData?.operatorName as string | undefined) ?? "unknown",
    chargeStartAt: chargeStart ? new Date(chargeStart) : null,
    chargeEndAt: chargeEnd ? new Date(chargeEnd) : null,
    chargeTimeMin,
    energyKwh,
    chargingCurrentA: chargingCurrentA > 0 ? String(chargingCurrentA) : null,
    startVoltageV: (stageData?.startVoltageV as string | undefined) ?? null,
    finalVoltageV: finalVoltageV > 0 ? String(finalVoltageV) : null,
    finalCurrentA: (stageData?.finalCurrentA as string | undefined) ?? null,
    ambientTempC: (stageData?.ambientTempC as string | undefined) ?? null,
    batteryTempC: (stageData?.batteryTempC as string | undefined) ?? null,
    topBalancingRequired: !!(stageData?.topBalancingRequired),
    topBalancingStartAt: stageData?.topBalancingStartAt ? new Date(stageData.topBalancingStartAt as string) : null,
    topBalancingEndAt: stageData?.topBalancingEndAt ? new Date(stageData.topBalancingEndAt as string) : null,
    finalCellVoltageSpreadMv: (stageData?.finalCellVoltageSpreadMv as string | undefined) ?? null,
    maxCellVoltageV: maxCell > 0 ? String(maxCell) : null,
    minCellVoltageV: minCell > 0 ? String(minCell) : null,
    voltageDiffMv,
    balancingStatus,
    remarks: (stageData?.remarks as string | undefined) ?? null,
  });

  // Genealogy entry for charger
  if (chargerUnitId) {
    const [charger] = await tx
      .select()
      .from(mfgChargerUnitsTable)
      .where(eq(mfgChargerUnitsTable.id, chargerUnitId))
      .limit(1);
    if (charger) {
      await tx.insert(mfgBatteryGenealogyTable).values({
        productionOrderId: orderId,
        componentType: "charger",
        componentId: chargerUnitId,
        componentName: `${charger.manufacturer} ${charger.model} (${charger.chargerCode})`,
        quantity: 1,
        serialNumber: charger.serialNumber,
        notes: `Charging completed — formation report generated`,
      });
    }
  }
}

async function onBmsAllocationComplete(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  orderId: string,
  stageData: Record<string, unknown>
): Promise<void> {
  const bmsId = stageData?.bmsId as string | undefined;
  const bmsSerial = stageData?.bmsSerialNumber as string | undefined;
  const bmsModel = stageData?.bmsModel as string | undefined;

  if (!bmsModel && !bmsId) return;

  let name = bmsModel ?? "BMS";
  if (bmsId) {
    const [bms] = await tx
      .select()
      .from(masterBmsTable)
      .where(eq(masterBmsTable.id, bmsId))
      .limit(1);
    if (bms) name = `${bms.manufacturer} ${bms.model}`;
  }

  await tx.insert(mfgBatteryGenealogyTable).values({
    productionOrderId: orderId,
    componentType: "bms",
    componentId: bmsId ?? null,
    componentName: name,
    quantity: 1,
    serialNumber: bmsSerial ?? null,
    notes: stageData?.firmwareVersion ? `FW: ${stageData.firmwareVersion}` : null,
  });
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

  const startData = (body.stageData as Record<string, unknown>) ?? {};

  await db.transaction(async (tx) => {
    await tx
      .update(mfgOrderStagesTable)
      .set({
        status: "in_progress",
        operatorName: body.operatorName,
        startedAt: new Date(),
        notes: body.notes ?? found.notes,
        stageData: { ...(found.stageData ?? {}), ...startData },
      })
      .where(eq(mfgOrderStagesTable.id, found.id));

    // Auto-advance order status if still draft/released
    await tx
      .update(mfgProductionOrdersTable)
      .set({ status: "in_progress", currentStage: stage as StageTypeValue })
      .where(
        and(
          eq(mfgProductionOrdersTable.id, id),
          eq(mfgProductionOrdersTable.status, "draft")
        )
      );

    // Charging-specific: reserve charger
    if (stage === "charging") {
      await onChargingStart(tx, id, { ...startData, operatorName: body.operatorName });
    }

    await logEvent(tx, {
      productionOrderId: id,
      eventType: "stage_started",
      stageType: stage as StageTypeValue,
      actor: body.operatorName,
      description: stage === "charging"
        ? `Charging started${startData.chargerCode ? ` — Charger ${startData.chargerCode}` : ""}`
        : `Stage ${stage.replace(/_/g, " ")} started`,
      metadata: startData,
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
  if (found.status !== "in_progress" && found.status !== "paused") {
    res.status(409).json({ error: `Stage must be in_progress or paused to complete (currently ${found.status})` });
    return;
  }

  const mergedStageData = {
    ...(found.stageData ?? {}),
    ...((body.stageData as Record<string, unknown>) ?? {}),
  };

  await db.transaction(async (tx) => {
    await tx
      .update(mfgOrderStagesTable)
      .set({
        status: "completed",
        completedAt: new Date(),
        notes: body.notes ?? found.notes,
        stageData: mergedStageData,
      })
      .where(eq(mfgOrderStagesTable.id, found.id));

    // Stage-specific side effects
    if (stage === "cell_allocation") {
      await onCellAllocationComplete(tx, id, mergedStageData);
    } else if (stage === "assembly") {
      await onAssemblyComplete(tx, id, mergedStageData);
    } else if (stage === "bms_allocation") {
      await onBmsAllocationComplete(tx, id, mergedStageData);
    } else if (stage === "charging") {
      await onChargingComplete(tx, id, { ...mergedStageData, operatorName: body.operatorName });
    }

    await logEvent(tx, {
      productionOrderId: id,
      eventType: "stage_completed",
      stageType: stage as StageTypeValue,
      actor: body.operatorName,
      description: `Stage ${stage.replace(/_/g, " ")} completed — awaiting supervisor approval`,
      metadata: mergedStageData,
    });
  });

  const updated = await getStageOrFail(id, stage, res);
  res.json(updated);
});

// POST /manufacturing/orders/:id/stages/:stage/pause — in_progress → paused
router.post("/:stage/pause", async (req, res) => {
  const { id, stage } = PauseStageParams.parse(req.params);
  const body = PauseStageBody.parse(req.body);

  const found = await getStageOrFail(id, stage, res);
  if (!found) { res.status(404).json({ error: "Stage not found" }); return; }
  if (found.status !== "in_progress") {
    res.status(409).json({ error: `Stage must be in_progress to pause (currently ${found.status})` });
    return;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(mfgOrderStagesTable)
      .set({ status: "paused", pausedAt: new Date(), notes: body.notes ?? found.notes })
      .where(eq(mfgOrderStagesTable.id, found.id));

    await logEvent(tx, {
      productionOrderId: id,
      eventType: "charging_paused",
      stageType: stage as StageTypeValue,
      actor: body.operatorName,
      description: `Charging paused${body.notes ? ` — ${body.notes}` : ""}`,
    });
  });

  const updated = await getStageOrFail(id, stage, res);
  res.json(updated);
});

// POST /manufacturing/orders/:id/stages/:stage/resume — paused → in_progress
router.post("/:stage/resume", async (req, res) => {
  const { id, stage } = ResumeStageParams.parse(req.params);
  const body = ResumeStageBody.parse(req.body);

  const found = await getStageOrFail(id, stage, res);
  if (!found) { res.status(404).json({ error: "Stage not found" }); return; }
  if (found.status !== "paused") {
    res.status(409).json({ error: `Stage must be paused to resume (currently ${found.status})` });
    return;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(mfgOrderStagesTable)
      .set({ status: "in_progress", resumedAt: new Date(), notes: body.notes ?? found.notes })
      .where(eq(mfgOrderStagesTable.id, found.id));

    await logEvent(tx, {
      productionOrderId: id,
      eventType: "charging_resumed",
      stageType: stage as StageTypeValue,
      actor: body.operatorName,
      description: `Charging resumed`,
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
