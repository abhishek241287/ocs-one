import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, or, ilike, count, desc } from "drizzle-orm";
import {
  db,
  productsTable,
  productGenealogyTable,
  productEventsTable,
  productCategoriesTable,
  masterProductsTable,
  logisticsDealersTable,
} from "@workspace/db";
import { UpdateProductStatusBody } from "@workspace/api-zod";
import { requireRole } from "../../middleware/auth";

const router: IRouter = Router();

// Postgres numeric/decimal strings → JS numbers; keep everything else as-is.
function numify<T extends Record<string, unknown>>(row: T): T {
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [
      k,
      typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v,
    ]),
  ) as T;
}

// ─── Lifecycle state machine ──────────────────────────────────────────────────
// Forward-only transitions on the approved product_status lifecycle (no new
// states). Creation enters at qc_passed; this route advances downstream.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  manufacturing: ["qc_passed"],
  qc_passed: ["ready_for_packing"],
  ready_for_packing: ["packed"],
  packed: ["dispatched"],
  dispatched: ["delivered_to_dealer"],
  delivered_to_dealer: [],
};

// GET /products — list with enriched display fields.
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const query = req.query as Record<string, string | undefined>;
  const page = parseInt(query.page || "1", 10);
  const pageSize = parseInt(query.pageSize || "25", 10);
  const offset = (page - 1) * pageSize;

  const conditions = [];
  if (query.product_status) {
    conditions.push(eq(productsTable.productStatus, query.product_status as never));
  }
  if (query.category_id) {
    conditions.push(eq(productsTable.categoryId, query.category_id));
  }
  if (query.search) {
    conditions.push(
      or(
        ilike(productsTable.officialProductSerial, `%${query.search}%`),
        ilike(masterProductsTable.code, `%${query.search}%`),
        ilike(masterProductsTable.name, `%${query.search}%`),
      ),
    );
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalRow] = await db
    .select({ count: count() })
    .from(productsTable)
    .leftJoin(masterProductsTable, eq(productsTable.modelId, masterProductsTable.id))
    .where(where);

  const items = await db
    .select({
      id: productsTable.id,
      category_id: productsTable.categoryId,
      model_id: productsTable.modelId,
      workflow_code: productsTable.workflowCode,
      source_production_order_id: productsTable.sourceProductionOrderId,
      official_product_serial: productsTable.officialProductSerial,
      serial_source: productsTable.serialSource,
      qc_status: productsTable.qcStatus,
      product_status: productsTable.productStatus,
      current_location: productsTable.currentLocation,
      dealer_id: productsTable.dealerId,
      manufacturing_completed_at: productsTable.manufacturingCompletedAt,
      created_at: productsTable.createdAt,
      updated_at: productsTable.updatedAt,
      category_name: productCategoriesTable.name,
      model_code: masterProductsTable.code,
      model_name: masterProductsTable.name,
      dealer_name: logisticsDealersTable.dealerName,
    })
    .from(productsTable)
    .leftJoin(productCategoriesTable, eq(productsTable.categoryId, productCategoriesTable.id))
    .leftJoin(masterProductsTable, eq(productsTable.modelId, masterProductsTable.id))
    .leftJoin(logisticsDealersTable, eq(productsTable.dealerId, logisticsDealersTable.id))
    .where(where)
    .limit(pageSize)
    .offset(offset)
    .orderBy(desc(productsTable.createdAt));

  const total = Number(totalRow?.count ?? 0);
  res.json({
    items: items.map(numify),
    meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
  });
});

// Single source for the enriched, contract-shaped (snake_case) Product view.
// Used by GET /:id AND the status transition so every Product response — read
// or write — returns the identical declared `Product` shape (never raw camelCase
// DB rows from `.returning()`).
async function selectProductView(id: string) {
  const [item] = await db
    .select({
      id: productsTable.id,
      category_id: productsTable.categoryId,
      model_id: productsTable.modelId,
      workflow_code: productsTable.workflowCode,
      source_production_order_id: productsTable.sourceProductionOrderId,
      official_product_serial: productsTable.officialProductSerial,
      serial_source: productsTable.serialSource,
      qc_status: productsTable.qcStatus,
      product_status: productsTable.productStatus,
      current_location: productsTable.currentLocation,
      dealer_id: productsTable.dealerId,
      manufacturing_completed_at: productsTable.manufacturingCompletedAt,
      created_at: productsTable.createdAt,
      updated_at: productsTable.updatedAt,
      category_name: productCategoriesTable.name,
      model_code: masterProductsTable.code,
      model_name: masterProductsTable.name,
      dealer_name: logisticsDealersTable.dealerName,
    })
    .from(productsTable)
    .leftJoin(productCategoriesTable, eq(productsTable.categoryId, productCategoriesTable.id))
    .leftJoin(masterProductsTable, eq(productsTable.modelId, masterProductsTable.id))
    .leftJoin(logisticsDealersTable, eq(productsTable.dealerId, logisticsDealersTable.id))
    .where(eq(productsTable.id, id))
    .limit(1);
  return item ? numify(item) : undefined;
}

// GET /products/:id — single product with enriched display fields.
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const item = await selectProductView(req.params.id as string);
  if (!item) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  res.json(item);
});

// GET /products/:id/genealogy — the Product's owned component lineage.
router.get("/:id/genealogy", async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const [product] = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(eq(productsTable.id, id))
    .limit(1);
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const items = await db
    .select({
      id: productGenealogyTable.id,
      product_id: productGenealogyTable.productId,
      component_type: productGenealogyTable.componentType,
      component_id: productGenealogyTable.componentId,
      component_name: productGenealogyTable.componentName,
      quantity: productGenealogyTable.quantity,
      serial_number: productGenealogyTable.serialNumber,
      notes: productGenealogyTable.notes,
      created_at: productGenealogyTable.createdAt,
    })
    .from(productGenealogyTable)
    .where(eq(productGenealogyTable.productId, id))
    .orderBy(productGenealogyTable.createdAt);

  res.json({ items: items.map((g) => numify(g as Record<string, unknown>)) });
});

// GET /products/:id/events — the Product's append-only lifecycle timeline (newest first).
router.get("/:id/events", async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const [product] = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(eq(productsTable.id, id))
    .limit(1);
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const items = await db
    .select({
      id: productEventsTable.id,
      product_id: productEventsTable.productId,
      event_type: productEventsTable.eventType,
      actor: productEventsTable.actor,
      description: productEventsTable.description,
      metadata: productEventsTable.metadata,
      created_at: productEventsTable.createdAt,
    })
    .from(productEventsTable)
    .where(eq(productEventsTable.productId, id))
    .orderBy(desc(productEventsTable.createdAt));

  res.json({ items: items.map((e) => numify(e as Record<string, unknown>)) });
});

// POST /products/:id/status — guarded forward-only lifecycle transition.
router.post(
  "/:id/status",
  requireRole("supervisor", "director"),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const parsed = UpdateProductStatusBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const target = parsed.data.status;
    const actor = req.user?.email ?? "unknown";

    const updated = await db.transaction(async (tx) => {
      // Re-read under a row lock to close the TOCTOU window between the guard
      // check and the write.
      const [current] = await tx
        .select({ status: productsTable.productStatus })
        .from(productsTable)
        .where(eq(productsTable.id, id))
        .for("update")
        .limit(1);
      if (!current) return { kind: "not_found" as const };

      if (current.status === target) {
        return { kind: "noop" as const };
      }
      const allowed = ALLOWED_TRANSITIONS[current.status] ?? [];
      if (!allowed.includes(target)) {
        return { kind: "invalid" as const, from: current.status };
      }

      await tx
        .update(productsTable)
        .set({ productStatus: target, updatedAt: new Date() })
        .where(eq(productsTable.id, id));

      await tx.insert(productEventsTable).values({
        productId: id,
        eventType: "product.status_changed",
        actor,
        description: `Status ${current.status} → ${target}`,
        metadata: { from: current.status, to: target, reason: parsed.data.reason },
      });

      return { kind: "ok" as const };
    });

    if (updated.kind === "not_found") {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    if (updated.kind === "invalid") {
      res.status(400).json({
        error: `Invalid transition: ${updated.from} → ${target}`,
      });
      return;
    }
    // Both ok and noop return the enriched, contract-shaped Product (snake_case),
    // identical to GET /:id — never a raw camelCase DB row.
    const view = await selectProductView(id);
    if (!view) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    res.json(view);
  },
);

export default router;
