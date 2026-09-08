import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  productsTable,
  productEventsTable,
  productCategoriesTable,
  masterProductsTable,
  logisticsDealersTable,
} from "@workspace/db";

const router: IRouter = Router();

// C1 — Dealer data isolation: restrict dealer-role users to their own dealership.
// requireAuth is applied globally in routes/index.ts (before this router is mounted),
// so req.user is always populated here. Factory roles (director, supervisor, operator,
// owner, viewer) pass through unrestricted. Dealer-role users may only access routes
// whose :id parameter matches the dealerId embedded in their JWT.
//
// router.param fires after Express matches a route containing `:id` and has
// resolved the parameter value — unlike router.use(), req.params.id is always
// populated here, making it the correct hook for parameter-level access control.
router.param("id", (req: Request, res: Response, next, id: string) => {
  if (req.user?.role === "dealer") {
    if (req.user.dealerId !== id) {
      res.status(403).json({ error: "Access denied: not your dealership" });
      return;
    }
  }
  next();
});

// Postgres numeric/decimal strings → JS numbers; keep everything else as-is.
function numify<T extends Record<string, unknown>>(row: T): T {
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [
      k,
      typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v,
    ]),
  ) as T;
}

async function findDealer(id: string) {
  const rows = await db
    .select({
      id: logisticsDealersTable.id,
      dealerCode: logisticsDealersTable.dealerCode,
      dealerName: logisticsDealersTable.dealerName,
      status: logisticsDealersTable.status,
    })
    .from(logisticsDealersTable)
    .where(eq(logisticsDealersTable.id, id))
    .limit(1);
  return rows[0] ?? null;
}

// GET /dealers/:id/inventory — products currently assigned to a dealer. Pure read-only
// projection over the Product Platform (no new table/ledger); products.dealer_id is the
// single source of truth for dealer assignment.
router.get("/:id/inventory", async (req: Request, res: Response): Promise<void> => {
  const dealer = await findDealer(req.params.id as string);
  if (!dealer) {
    res.status(404).json({ error: "Dealer not found" });
    return;
  }

  const rows = await db
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
    .where(eq(productsTable.dealerId, dealer.id))
    .orderBy(desc(productsTable.updatedAt));

  const items = rows.map(numify);
  res.json({ dealer, total: items.length, items });
});

// GET /dealers/:id/dispatch-history — the `product.dispatched` events for this dealer's
// products. Read-only projection over the append-only `product_events` timeline.
router.get("/:id/dispatch-history", async (req: Request, res: Response): Promise<void> => {
  const dealer = await findDealer(req.params.id as string);
  if (!dealer) {
    res.status(404).json({ error: "Dealer not found" });
    return;
  }

  const rows = await db
    .select({
      event_id: productEventsTable.id,
      product_id: productEventsTable.productId,
      official_product_serial: productsTable.officialProductSerial,
      category_name: productCategoriesTable.name,
      model_name: masterProductsTable.name,
      metadata: productEventsTable.metadata,
      dispatched_at: productEventsTable.createdAt,
      actor: productEventsTable.actor,
    })
    .from(productEventsTable)
    .innerJoin(productsTable, eq(productEventsTable.productId, productsTable.id))
    .leftJoin(productCategoriesTable, eq(productsTable.categoryId, productCategoriesTable.id))
    .leftJoin(masterProductsTable, eq(productsTable.modelId, masterProductsTable.id))
    .where(
      and(
        eq(productsTable.dealerId, dealer.id),
        eq(productEventsTable.eventType, "product.dispatched"),
      ),
    )
    .orderBy(desc(productEventsTable.createdAt));

  const items = rows.map((r) => {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    return {
      event_id: r.event_id,
      product_id: r.product_id,
      official_product_serial: r.official_product_serial,
      category_name: r.category_name,
      model_name: r.model_name,
      dispatch_number: (meta.dispatchNumber as string) ?? null,
      dispatch_date: (meta.dispatchDate as string) ?? null,
      invoice_number: (meta.invoiceNumber as string) ?? null,
      dispatched_at: r.dispatched_at,
      actor: r.actor,
    };
  });

  res.json({ dealer, total: items.length, items });
});

export default router;
