import { Router, IRouter } from "express";
import { requireWriteRole } from "../../middleware/auth";
import { db, mfgChargerUnitsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  ListChargerUnitsQueryParams,
  CreateChargerUnitBody,
  GetChargerUnitParams,
  UpdateChargerUnitParams,
  UpdateChargerUnitBody,
  UpdateChargerUnitStatusParams,
  UpdateChargerUnitStatusBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

// RBAC (DEF-M06-001): charger equipment management — supervisor, director only.
router.use(requireWriteRole("supervisor", "director"));

// GET /manufacturing/charger-units
router.get("/", async (req, res) => {
  const query = ListChargerUnitsQueryParams.parse(req.query);
  const pageSize = query.pageSize ?? 50;
  const page = query.page ?? 1;
  const offset = (page - 1) * pageSize;

  let baseQuery = db.select().from(mfgChargerUnitsTable);
  if (query.status) {
    baseQuery = baseQuery.where(
      eq(mfgChargerUnitsTable.status, query.status as "available" | "busy" | "maintenance")
    ) as typeof baseQuery;
  }

  const items = await baseQuery.limit(pageSize).offset(offset);

  const countQuery = db.select().from(mfgChargerUnitsTable);
  const all = query.status
    ? await countQuery.where(
        eq(mfgChargerUnitsTable.status, query.status as "available" | "busy" | "maintenance")
      )
    : await countQuery;

  res.json({ items, total: all.length });
});

// POST /manufacturing/charger-units
router.post("/", async (req, res) => {
  const body = CreateChargerUnitBody.parse(req.body);

  const [created] = await db
    .insert(mfgChargerUnitsTable)
    .values({
      chargerCode: body.chargerCode,
      model: body.model,
      manufacturer: body.manufacturer,
      serialNumber: body.serialNumber,
      outputVoltageV: body.outputVoltageV != null ? String(body.outputVoltageV) : null,
      maxCurrentA: body.maxCurrentA != null ? String(body.maxCurrentA) : null,
      status: (body.status as "available" | "busy" | "maintenance") ?? "available",
      notes: body.notes ?? null,
    })
    .returning();

  res.status(201).json(created);
});

// GET /manufacturing/charger-units/dashboard — must be before /:id
router.get("/dashboard", async (_req, res) => {
  const all = await db.select().from(mfgChargerUnitsTable);

  const available = all.filter((c) => c.status === "available").length;
  const busy = all.filter((c) => c.status === "busy").length;
  const maintenance = all.filter((c) => c.status === "maintenance").length;

  // Count batteries currently in charging stage (in_progress or paused)
  const { mfgOrderStagesTable, mfgProductionOrdersTable: _mfgProductionOrdersTable } = await import("@workspace/db");
  const { and, inArray } = await import("drizzle-orm");

  const chargingStages = await db
    .select()
    .from(mfgOrderStagesTable)
    .where(
      and(
        eq(mfgOrderStagesTable.stageType, "charging"),
        inArray(mfgOrderStagesTable.status, ["in_progress", "paused"])
      )
    );

  const pendingCharging = await db
    .select()
    .from(mfgOrderStagesTable)
    .where(
      and(
        eq(mfgOrderStagesTable.stageType, "charging"),
        eq(mfgOrderStagesTable.status, "pending")
      )
    );

  // Only orders whose previous stage (bms_programming) is approved
  const waitingOrders = pendingCharging.filter((_s) => true);

  // Today's completed charges
  const { mfgFormationReportsTable } = await import("@workspace/db");
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { gte } = await import("drizzle-orm");

  const todayCompleted = await db
    .select()
    .from(mfgFormationReportsTable)
    .where(gte(mfgFormationReportsTable.createdAt, todayStart));

  // Avg charge time from formation reports
  const allReports = await db.select().from(mfgFormationReportsTable);
  const timings = allReports
    .map((r) => parseFloat(r.chargeTimeMin ?? "0"))
    .filter((v) => v > 0);
  const avgChargeTimeMin =
    timings.length > 0 ? timings.reduce((a, b) => a + b, 0) / timings.length : null;

  res.json({
    chargersAvailable: available,
    chargersBusy: busy,
    chargersMaintenance: maintenance,
    totalChargers: all.length,
    batteriesCharging: chargingStages.length,
    batteriesWaiting: waitingOrders.length,
    todayCompletedCharges: todayCompleted.length,
    avgChargeTimeMin: avgChargeTimeMin != null ? Math.round(avgChargeTimeMin) : null,
  });
});

// GET /manufacturing/charger-units/:id
router.get("/:id", async (req, res) => {
  const { id } = GetChargerUnitParams.parse(req.params);
  const [unit] = await db
    .select()
    .from(mfgChargerUnitsTable)
    .where(eq(mfgChargerUnitsTable.id, id))
    .limit(1);
  if (!unit) {
    res.status(404).json({ error: "Charger unit not found" });
    return;
  }
  res.json(unit);
});

// PATCH /manufacturing/charger-units/:id
router.patch("/:id", async (req, res) => {
  const { id } = UpdateChargerUnitParams.parse(req.params);
  const body = UpdateChargerUnitBody.parse(req.body);

  const [existing] = await db
    .select()
    .from(mfgChargerUnitsTable)
    .where(eq(mfgChargerUnitsTable.id, id))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Charger unit not found" });
    return;
  }

  const updates: Partial<typeof mfgChargerUnitsTable.$inferInsert> = {};
  if (body.model !== undefined) updates.model = body.model;
  if (body.manufacturer !== undefined) updates.manufacturer = body.manufacturer;
  if (body.serialNumber !== undefined) updates.serialNumber = body.serialNumber;
  if (body.outputVoltageV !== undefined)
    updates.outputVoltageV = body.outputVoltageV != null ? String(body.outputVoltageV) : null;
  if (body.maxCurrentA !== undefined)
    updates.maxCurrentA = body.maxCurrentA != null ? String(body.maxCurrentA) : null;
  if (body.notes !== undefined) updates.notes = body.notes ?? null;

  // All-optional body: an empty SET clause throws in Drizzle (→ 500). Reject
  // an empty update with 400 per SS-01 input validation.
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [updated] = await db
    .update(mfgChargerUnitsTable)
    .set(updates)
    .where(eq(mfgChargerUnitsTable.id, id))
    .returning();

  res.json(updated);
});

// PATCH /manufacturing/charger-units/:id/status
router.patch("/:id/status", async (req, res) => {
  const { id } = UpdateChargerUnitStatusParams.parse(req.params);
  const body = UpdateChargerUnitStatusBody.parse(req.body);

  const [existing] = await db
    .select()
    .from(mfgChargerUnitsTable)
    .where(eq(mfgChargerUnitsTable.id, id))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Charger unit not found" });
    return;
  }
  if (existing.status === "busy") {
    res.status(409).json({ error: "Cannot change status of a charger currently in use" });
    return;
  }

  const [updated] = await db
    .update(mfgChargerUnitsTable)
    .set({ status: body.status as "available" | "busy" | "maintenance" })
    .where(eq(mfgChargerUnitsTable.id, id))
    .returning();

  res.json(updated);
});

export default router;
