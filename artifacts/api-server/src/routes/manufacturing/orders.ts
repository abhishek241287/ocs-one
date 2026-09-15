import { Router, IRouter } from "express";
import { requireWriteRole } from "../../middleware/auth";
import {
  db,
  masterProductsTable,
  mfgProductionOrdersTable,
  mfgOrderStagesTable,
} from "@workspace/db";
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

async function getOrderWithProduct(id: string) {
  const [row] = await db
    .select({
      order: mfgProductionOrdersTable,
      productName: masterProductsTable.name,
      productSku: masterProductsTable.code,
    })
    .from(mfgProductionOrdersTable)
    .leftJoin(masterProductsTable, eq(mfgProductionOrdersTable.productId, masterProductsTable.id))
    .where(eq(mfgProductionOrdersTable.id, id))
    .limit(1);

  return row
    ? {
        ...row.order,
        productName: row.productName,
        productSku: row.productSku,
      }
    : undefined;
}

// RBAC (DEF-M06-001): production planning (orders) — supervisor, director only.
// NOTE: guard is applied PER ROUTE, not via router.use(). The sibling routers
// (`/orders/:id/stages`, genealogy, test-results — operator+) share the `/orders`
// URL prefix, so a router-level guard here would shadow them and wrongly block
// operators from legitimate stage execution.

// GET /manufacturing/orders
router.get("/", async (req, res) => {
  const query = ListProductionOrdersQueryParams.parse(req.query);
  const { page, pageSize, search, status, priority, stage } = query as {
    page: number;
    pageSize: number;
    search?: string;
    status?: string;
    priority?: string;
    stage?: string;
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
  if (stage) {
    conditions.push(
      eq(
        mfgProductionOrdersTable.currentStage,
        stage as typeof mfgProductionOrdersTable.currentStage._.data
      )
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const offset = (page - 1) * pageSize;

  const [items, [{ total }]] = await Promise.all([
    db
      .select({
        order: mfgProductionOrdersTable,
        productName: masterProductsTable.name,
        productSku: masterProductsTable.code,
      })
      .from(mfgProductionOrdersTable)
      .leftJoin(masterProductsTable, eq(mfgProductionOrdersTable.productId, masterProductsTable.id))
      .where(where)
      .orderBy(desc(mfgProductionOrdersTable.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(mfgProductionOrdersTable).where(where),
  ]);

  res.json({
    items: items.map(({ order, productName, productSku }) => ({
      ...order,
      productName,
      productSku,
    })),
    meta: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  });
});

// POST /manufacturing/orders
router.post("/", requireWriteRole("supervisor", "director"), async (req, res) => {
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

  const enriched = await getOrderWithProduct(result.id);
  if (!enriched) throw new Error("Created production order could not be reloaded");
  res.status(201).json({ ...enriched, stages: result.stages });
});

// GET /manufacturing/orders/:id
router.get("/:id", async (req, res) => {
  const { id } = GetProductionOrderParams.parse(req.params);

  const order = await getOrderWithProduct(id);
  if (!order) {
    res.status(404).json({ error: "Production order not found" });
    return;
  }

  const stages = await db
    .select()
    .from(mfgOrderStagesTable)
    .where(eq(mfgOrderStagesTable.productionOrderId, id))
    .orderBy(mfgOrderStagesTable.stageOrder);

  res.json({ ...order, stages });
});

// PATCH /manufacturing/orders/:id
router.patch("/:id", requireWriteRole("supervisor", "director"), async (req, res) => {
  const { id } = UpdateProductionOrderParams.parse(req.params);
  const body = UpdateProductionOrderBody.parse(req.body);

  const updates: Partial<typeof mfgProductionOrdersTable.$inferInsert> = {};
  if (body.factoryManager !== undefined) updates.factoryManager = body.factoryManager;
  if (body.priority !== undefined) updates.priority = body.priority;
  if (body.status !== undefined) updates.status = body.status;
  if (body.plannedStartDate !== undefined) updates.plannedStartDate = body.plannedStartDate;
  if (body.plannedEndDate !== undefined) updates.plannedEndDate = body.plannedEndDate;
  if (body.notes !== undefined) updates.notes = body.notes;

  // All-optional body: an empty SET clause throws in Drizzle (→ 500). Reject
  // an empty update with 400 per SS-01 input validation.
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  // A completed or cancelled order is a finalized, read-only record — like a
  // posted GRN, issued MIN, approved BOM, or dispatch note — and must not be
  // edited (draft / released / in_progress, which covers QC inspection, stay
  // editable). Lock the row and re-check status INSIDE the tx (TOCTOU-safe): a
  // pre-tx read alone races a concurrent completion/cancellation.
  type PatchResult =
    | { ok: false; statusCode: 404 | 422; error: string }
    | { ok: true; updated: typeof mfgProductionOrdersTable.$inferSelect };

  const result: PatchResult = await db.transaction(async (tx): Promise<PatchResult> => {
    const [order] = await tx
      .select()
      .from(mfgProductionOrdersTable)
      .where(eq(mfgProductionOrdersTable.id, id))
      .limit(1)
      .for("update");

    if (!order) {
      return { ok: false, statusCode: 404, error: "Production order not found" };
    }

    if (order.status === "completed" || order.status === "cancelled") {
      return {
        ok: false,
        statusCode: 422,
        error: `This production order is ${order.status} and is read-only — finalized orders cannot be edited. Create a new order if a correction is required.`,
      };
    }

    const [updated] = await tx
      .update(mfgProductionOrdersTable)
      .set(updates)
      .where(eq(mfgProductionOrdersTable.id, id))
      .returning();

    return { ok: true, updated };
  });

  if (!result.ok) {
    res.status(result.statusCode).json({ error: result.error });
    return;
  }

  const stages = await db
    .select()
    .from(mfgOrderStagesTable)
    .where(eq(mfgOrderStagesTable.productionOrderId, id))
    .orderBy(mfgOrderStagesTable.stageOrder);

  const enriched = await getOrderWithProduct(id);
  if (!enriched) {
    res.status(404).json({ error: "Production order not found" });
    return;
  }
  res.json({ ...enriched, stages });
});

export default router;
