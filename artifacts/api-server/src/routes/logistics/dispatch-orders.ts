import { Router, IRouter } from "express";
import { requireWriteRole } from "../../middleware/auth";
import {
  db,
  logisticsDispatchOrdersTable,
  logisticsDispatchItemsTable,
  logisticsShipmentEventsTable,
  logisticsDealersTable,
  mfgProductionOrdersTable,
  mfgBatteryTimelineTable,
} from "@workspace/db";
import { eq, count, desc, sql, and } from "drizzle-orm";
import {
  ListDispatchOrdersQueryParams,
  GetDispatchOrderParams,
  UpdateDispatchOrderParams,
  CreateDispatchOrderBody,
  UpdateDispatchOrderBody,
  AddDispatchItemBody,
  AdvanceDispatchStatusBody,
  AdvanceDispatchStatusParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

// RBAC (DEF-M06-001): dispatch management — supervisor, director only.
router.use(requireWriteRole("supervisor", "director"));

async function generateDispatchNumber(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0]
): Promise<string> {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const prefix = `DIS-${y}${m}${d}-`;
  const [result] = await tx
    .select({ c: count() })
    .from(logisticsDispatchOrdersTable)
    .where(sql`${logisticsDispatchOrdersTable.dispatchNumber} like ${`${prefix}%`}`);
  const seq = ((result?.c as number) ?? 0) + 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

// GET /logistics/dispatch-orders
router.get("/", async (req, res) => {
  const { page = 1, pageSize = 20, status, dealerId } = ListDispatchOrdersQueryParams.parse(req.query);
  const offset = (page - 1) * pageSize;

  const conditions = [];
  if (status) conditions.push(sql`${logisticsDispatchOrdersTable.status} = ${status}`);
  if (dealerId) conditions.push(eq(logisticsDispatchOrdersTable.dealerId, dealerId));
  const where = conditions.length > 0 ? conditions.reduce((a, b) => sql`${a} AND ${b}`) : undefined;

  const [{ total }] = await db
    .select({ total: count() })
    .from(logisticsDispatchOrdersTable)
    .where(where);

  const items = await db
    .select()
    .from(logisticsDispatchOrdersTable)
    .where(where)
    .orderBy(desc(logisticsDispatchOrdersTable.createdAt))
    .limit(pageSize)
    .offset(offset);

  res.json({ items, total: Number(total) });
});

// POST /logistics/dispatch-orders
router.post("/", async (req, res) => {
  const body = CreateDispatchOrderBody.parse(req.body);
  const result = await db.transaction(async (tx) => {
    const dispatchNumber = await generateDispatchNumber(tx);
    const [order] = await tx
      .insert(logisticsDispatchOrdersTable)
      .values({
        dispatchNumber,
        dealerId: body.dealerId ?? null,
        customerName: body.customerName ?? null,
        transporter: body.transporter ?? null,
        vehicleNumber: body.vehicleNumber ?? null,
        driverName: body.driverName ?? null,
        driverMobile: body.driverMobile ?? null,
        dispatchDate: body.dispatchDate ? body.dispatchDate.toISOString().split("T")[0] : null,
        notes: body.notes ?? null,
        createdBy: body.createdBy ?? null,
        status: "draft",
      })
      .returning();
    return order;
  });
  res.status(201).json(result);
});

// GET /logistics/dispatch-orders/:id
router.get("/:id", async (req, res) => {
  const { id } = GetDispatchOrderParams.parse(req.params);

  const [order] = await db
    .select()
    .from(logisticsDispatchOrdersTable)
    .where(eq(logisticsDispatchOrdersTable.id, id))
    .limit(1);
  if (!order) { res.status(404).json({ error: "Dispatch order not found" }); return; }

  const [dealer] = order.dealerId
    ? await db.select().from(logisticsDealersTable).where(eq(logisticsDealersTable.id, order.dealerId)).limit(1)
    : [null];

  const rawItems = await db
    .select({
      id: logisticsDispatchItemsTable.id,
      dispatchOrderId: logisticsDispatchItemsTable.dispatchOrderId,
      productionOrderId: logisticsDispatchItemsTable.productionOrderId,
      batteryNumber: mfgProductionOrdersTable.batteryNumber,
      orderNumber: mfgProductionOrdersTable.orderNumber,
      addedAt: logisticsDispatchItemsTable.addedAt,
    })
    .from(logisticsDispatchItemsTable)
    .leftJoin(
      mfgProductionOrdersTable,
      eq(logisticsDispatchItemsTable.productionOrderId, mfgProductionOrdersTable.id)
    )
    .where(eq(logisticsDispatchItemsTable.dispatchOrderId, id))
    .orderBy(logisticsDispatchItemsTable.addedAt);

  const shipmentEvents = await db
    .select()
    .from(logisticsShipmentEventsTable)
    .where(eq(logisticsShipmentEventsTable.dispatchOrderId, id))
    .orderBy(logisticsShipmentEventsTable.occurredAt);

  res.json({ ...order, dealer: dealer ?? null, items: rawItems, shipmentEvents });
});

// PUT /logistics/dispatch-orders/:id
router.put("/:id", async (req, res) => {
  const { id } = UpdateDispatchOrderParams.parse(req.params);
  const body = UpdateDispatchOrderBody.parse(req.body);

  const [existing] = await db
    .select({ id: logisticsDispatchOrdersTable.id, status: logisticsDispatchOrdersTable.status })
    .from(logisticsDispatchOrdersTable)
    .where(eq(logisticsDispatchOrdersTable.id, id))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Dispatch order not found" }); return; }
  if (existing.status !== "draft") { res.status(400).json({ error: "Can only edit draft orders" }); return; }

  const [updated] = await db
    .update(logisticsDispatchOrdersTable)
    .set({
      dealerId: body.dealerId ?? null,
      customerName: body.customerName ?? null,
      transporter: body.transporter ?? null,
      vehicleNumber: body.vehicleNumber ?? null,
      driverName: body.driverName ?? null,
      driverMobile: body.driverMobile ?? null,
      dispatchDate: body.dispatchDate ? body.dispatchDate.toISOString().split("T")[0] : null,
      notes: body.notes ?? null,
      updatedAt: new Date(),
    })
    .where(eq(logisticsDispatchOrdersTable.id, id))
    .returning();
  res.json(updated);
});

// POST /logistics/dispatch-orders/:id/items — add a battery
router.post("/:id/items", async (req, res) => {
  const id = req.params.id;
  const body = AddDispatchItemBody.parse(req.body);

  const [order] = await db
    .select({ id: logisticsDispatchOrdersTable.id, status: logisticsDispatchOrdersTable.status })
    .from(logisticsDispatchOrdersTable)
    .where(eq(logisticsDispatchOrdersTable.id, id))
    .limit(1);
  if (!order) { res.status(404).json({ error: "Dispatch order not found" }); return; }
  if (order.status !== "draft") { res.status(400).json({ error: "Can only add batteries to draft orders" }); return; }

  // Check battery is QC approved (status = completed)
  const [battery] = await db
    .select({ id: mfgProductionOrdersTable.id, batteryNumber: mfgProductionOrdersTable.batteryNumber, orderNumber: mfgProductionOrdersTable.orderNumber, status: mfgProductionOrdersTable.status })
    .from(mfgProductionOrdersTable)
    .where(eq(mfgProductionOrdersTable.id, body.productionOrderId))
    .limit(1);
  if (!battery) { res.status(404).json({ error: "Production order not found" }); return; }
  if (battery.status !== "completed") {
    res.status(400).json({ error: "Only QC-approved (completed) batteries can be dispatched" }); return;
  }

  const [item] = await db
    .insert(logisticsDispatchItemsTable)
    .values({ dispatchOrderId: id, productionOrderId: body.productionOrderId })
    .returning();

  res.status(201).json({ ...item, batteryNumber: battery.batteryNumber, orderNumber: battery.orderNumber });
});

// DELETE /logistics/dispatch-orders/:id/items/:itemId
router.delete("/:id/items/:itemId", async (req, res) => {
  const id = req.params.id;
  const itemId = req.params.itemId;

  const [order] = await db
    .select({ status: logisticsDispatchOrdersTable.status })
    .from(logisticsDispatchOrdersTable)
    .where(eq(logisticsDispatchOrdersTable.id, id))
    .limit(1);
  if (!order) { res.status(404).json({ error: "Dispatch order not found" }); return; }
  if (order.status !== "draft") { res.status(400).json({ error: "Can only remove batteries from draft orders" }); return; }

  await db
    .delete(logisticsDispatchItemsTable)
    .where(
      and(
        eq(logisticsDispatchItemsTable.id, itemId),
        eq(logisticsDispatchItemsTable.dispatchOrderId, id)
      )
    );
  res.status(204).send();
});

// POST /logistics/dispatch-orders/:id/status — advance status
router.post("/:id/status", async (req, res) => {
  const { id } = AdvanceDispatchStatusParams.parse(req.params);
  const body = AdvanceDispatchStatusBody.parse(req.body);

  const [order] = await db
    .select()
    .from(logisticsDispatchOrdersTable)
    .where(eq(logisticsDispatchOrdersTable.id, id))
    .limit(1);
  if (!order) { res.status(404).json({ error: "Dispatch order not found" }); return; }

  const newStatus = body.status as "confirmed" | "loaded" | "in_transit" | "delivered" | "cancelled";

  const [updated] = await db
    .update(logisticsDispatchOrdersTable)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(logisticsDispatchOrdersTable.id, id))
    .returning();

  // Map dispatch status to shipment event type
  const eventMap: Record<string, string> = {
    confirmed: "ready_for_dispatch",
    loaded: "loaded",
    in_transit: "in_transit",
    delivered: "delivered",
  };
  const eventType = eventMap[newStatus];
  if (eventType) {
    await db.insert(logisticsShipmentEventsTable).values({
      dispatchOrderId: id,
      eventType: eventType as any,
      actor: body.actor,
      notes: body.notes ?? null,
    });
  }

  // Write battery timeline events for each battery in this dispatch
  if (newStatus === "in_transit" || newStatus === "delivered") {
    const items = await db
      .select({ productionOrderId: logisticsDispatchItemsTable.productionOrderId })
      .from(logisticsDispatchItemsTable)
      .where(eq(logisticsDispatchItemsTable.dispatchOrderId, id));

    for (const item of items) {
      await db.insert(mfgBatteryTimelineTable).values({
        productionOrderId: item.productionOrderId,
        eventType: `dispatch_${newStatus}`,
        stageType: "packing",
        actor: body.actor,
        description: `Dispatch ${order.dispatchNumber}: battery ${newStatus.replace("_", " ")}`,
        metadata: { dispatchOrderId: id, dispatchNumber: order.dispatchNumber },
      });
    }
  }

  res.json(updated);
});

export default router;
