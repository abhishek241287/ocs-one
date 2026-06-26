import { Router, IRouter } from "express";
import { db, mfgProductionOrdersTable, mfgOrderStagesTable } from "@workspace/db";
import { eq, ilike, and, desc, count, or } from "drizzle-orm";
import {
  ListProductionOrdersQueryParams,
  CreateProductionOrderBody,
  GetProductionOrderParams,
  UpdateProductionOrderParams,
  UpdateProductionOrderBody,
} from "@workspace/api-zod";
import {
  generateOrderNumber,
  generateBatteryNumber,
  STAGE_SEQUENCE,
  logEvent,
} from "./helpers";

const router: IRouter = Router({ mergeParams: true });

// GET /manufacturing/orders
router.get("/", async (req, res) => {
  const query = ListProductionOrdersQueryParams.parse(req.query);
  const { page, pageSize, search, status, priority } = query as {
    page: number;
    pageSize: number;
    search?: string;
    status?: string;
    priority?: string;
  };

  const conditions = [];
  if (search) {
    conditions.push(
      or(
        ilike(mfgProductionOrdersTable.orderNumber, `%${search}%`),
        ilike(mfgProductionOrdersTable.batteryNumber, `%${search}%`),
        ilike(mfgProductionOrdersTable.factoryManager, `%${search}%`)
      )
    );
  }
  if (status) {
    conditions.push(
      eq(mfgProductionOrdersTable.status, status as typeof mfgProductionOrdersTable.status._.data)
    );
  }
  if (priority) {
    conditions.push(
      eq(mfgProductionOrdersTable.priority, priority as typeof mfgProductionOrdersTable.priority._.data)
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const offset = (page - 1) * pageSize;

  const [items, [{ total }]] = await Promise.all([
    db
      .select()
      .from(mfgProductionOrdersTable)
      .where(where)
      .orderBy(desc(mfgProductionOrdersTable.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(mfgProductionOrdersTable).where(where),
  ]);

  res.json({
    items,
    meta: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  });
});

// POST /manufacturing/orders
router.post("/", async (req, res) => {
  const body = CreateProductionOrderBody.parse(req.body);

  const result = await db.transaction(async (tx) => {
    const orderNumber = await generateOrderNumber(tx);
    const batteryNumber = await generateBatteryNumber(tx);

    const [order] = await tx
      .insert(mfgProductionOrdersTable)
      .values({
        orderNumber,
        batteryNumber,
        productId: body.productId ?? null,
        factoryManager: body.factoryManager,
        priority: body.priority,
        currentStage: "cell_allocation",
        status: "draft",
        plannedStartDate: body.plannedStartDate ?? null,
        plannedEndDate: body.plannedEndDate ?? null,
        notes: body.notes ?? null,
      })
      .returning();

    const stages = await tx
      .insert(mfgOrderStagesTable)
      .values(
        STAGE_SEQUENCE.map((stageType, i) => ({
          productionOrderId: order.id,
          stageType,
          stageOrder: i + 1,
          status: "pending" as const,
        }))
      )
      .returning();

    await logEvent(tx, {
      productionOrderId: order.id,
      eventType: "order_created",
      actor: body.factoryManager,
      description: `Production order ${orderNumber} created for battery ${batteryNumber}`,
      metadata: { orderNumber, batteryNumber, priority: body.priority },
    });

    return { ...order, stages };
  });

  res.status(201).json(result);
});

// GET /manufacturing/orders/:id
router.get("/:id", async (req, res) => {
  const { id } = GetProductionOrderParams.parse(req.params);

  const order = await db
    .select()
    .from(mfgProductionOrdersTable)
    .where(eq(mfgProductionOrdersTable.id, id))
    .limit(1);

  if (!order[0]) {
    res.status(404).json({ error: "Production order not found" });
    return;
  }

  const stages = await db
    .select()
    .from(mfgOrderStagesTable)
    .where(eq(mfgOrderStagesTable.productionOrderId, id))
    .orderBy(mfgOrderStagesTable.stageOrder);

  res.json({ ...order[0], stages });
});

// PATCH /manufacturing/orders/:id
router.patch("/:id", async (req, res) => {
  const { id } = UpdateProductionOrderParams.parse(req.params);
  const body = UpdateProductionOrderBody.parse(req.body);

  const [order] = await db
    .select()
    .from(mfgProductionOrdersTable)
    .where(eq(mfgProductionOrdersTable.id, id))
    .limit(1);

  if (!order) {
    res.status(404).json({ error: "Production order not found" });
    return;
  }

  const updates: Partial<typeof mfgProductionOrdersTable.$inferInsert> = {};
  if (body.factoryManager !== undefined) updates.factoryManager = body.factoryManager;
  if (body.priority !== undefined) updates.priority = body.priority;
  if (body.status !== undefined) updates.status = body.status;
  if (body.plannedStartDate !== undefined) updates.plannedStartDate = body.plannedStartDate;
  if (body.plannedEndDate !== undefined) updates.plannedEndDate = body.plannedEndDate;
  if (body.notes !== undefined) updates.notes = body.notes;

  const [updated] = await db
    .update(mfgProductionOrdersTable)
    .set(updates)
    .where(eq(mfgProductionOrdersTable.id, id))
    .returning();

  const stages = await db
    .select()
    .from(mfgOrderStagesTable)
    .where(eq(mfgOrderStagesTable.productionOrderId, id))
    .orderBy(mfgOrderStagesTable.stageOrder);

  res.json({ ...updated, stages });
});

export default router;
