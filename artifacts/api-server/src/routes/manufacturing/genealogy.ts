import { Router, IRouter } from "express";
import { requireWriteRole } from "../../middleware/auth";
import { db, mfgBatteryGenealogyTable, mfgProductionOrdersTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import {
  GetOrderGenealogyParams,
  AddGenealogyRecordParams,
  AddGenealogyRecordBody,
} from "@workspace/api-zod";

const router: IRouter = Router({ mergeParams: true });

// RBAC (DEF-M06-001): genealogy records (production execution) — operator, supervisor, director.
router.use(requireWriteRole("operator", "supervisor", "director"));

// GET /manufacturing/orders/:id/genealogy
router.get("/", async (req, res) => {
  const { id } = GetOrderGenealogyParams.parse(req.params);
  const records = await db
    .select()
    .from(mfgBatteryGenealogyTable)
    .where(eq(mfgBatteryGenealogyTable.productionOrderId, id))
    .orderBy(asc(mfgBatteryGenealogyTable.createdAt));
  res.json({ items: records });
});

// POST /manufacturing/orders/:id/genealogy
router.post("/", async (req, res) => {
  const { id } = AddGenealogyRecordParams.parse(req.params);
  const body = AddGenealogyRecordBody.parse(req.body);

  // Ensure order exists
  const [order] = await db
    .select({ id: mfgProductionOrdersTable.id })
    .from(mfgProductionOrdersTable)
    .where(eq(mfgProductionOrdersTable.id, id))
    .limit(1);
  if (!order) {
    res.status(404).json({ error: "Production order not found" });
    return;
  }

  const [record] = await db
    .insert(mfgBatteryGenealogyTable)
    .values({
      productionOrderId: id,
      componentType: body.componentType,
      componentId: body.componentId ?? null,
      componentName: body.componentName,
      quantity: body.quantity,
      serialNumber: body.serialNumber ?? null,
      notes: body.notes ?? null,
    })
    .returning();

  res.status(201).json(record);
});

export default router;
