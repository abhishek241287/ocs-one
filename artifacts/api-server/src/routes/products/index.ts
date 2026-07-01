import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, or, ilike, count, desc, gte, lte, isNotNull } from "drizzle-orm";
import {
  db,
  productsTable,
  productGenealogyTable,
  productEventsTable,
  productCategoriesTable,
  masterProductsTable,
  logisticsDealersTable,
  mfgProductionOrdersTable,
} from "@workspace/db";
import { UpdateProductStatusBody, CreateImportedProductBody } from "@workspace/api-zod";
import { requireRole } from "../../middleware/auth";
import { createImportedProducts } from "./imported-product-creation";

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
  if (query.model_id) {
    conditions.push(eq(productsTable.modelId, query.model_id));
  }
  if (query.dealer_id) {
    conditions.push(eq(productsTable.dealerId, query.dealer_id));
  }
  if (query.current_location) {
    conditions.push(ilike(productsTable.currentLocation, `%${query.current_location}%`));
  }
  if (query.manufactured_from) {
    conditions.push(gte(productsTable.manufacturingCompletedAt, new Date(query.manufactured_from)));
  }
  if (query.manufactured_to) {
    const to = new Date(query.manufactured_to);
    to.setHours(23, 59, 59, 999);
    conditions.push(lte(productsTable.manufacturingCompletedAt, to));
  }
  if (query.search) {
    conditions.push(
      or(
        ilike(productsTable.officialProductSerial, `%${query.search}%`),
        ilike(masterProductsTable.code, `%${query.search}%`),
        ilike(masterProductsTable.name, `%${query.search}%`),
        ilike(logisticsDealersTable.dealerName, `%${query.search}%`),
        ilike(mfgProductionOrdersTable.orderNumber, `%${query.search}%`),
      ),
    );
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalRow] = await db
    .select({ count: count() })
    .from(productsTable)
    .leftJoin(masterProductsTable, eq(productsTable.modelId, masterProductsTable.id))
    .leftJoin(logisticsDealersTable, eq(productsTable.dealerId, logisticsDealersTable.id))
    .leftJoin(mfgProductionOrdersTable, eq(productsTable.sourceProductionOrderId, mfgProductionOrdersTable.id))
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
    .leftJoin(mfgProductionOrdersTable, eq(productsTable.sourceProductionOrderId, mfgProductionOrdersTable.id))
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

// GET /products/inventory-summary — read-only reporting projection over the frozen
// Product Platform. Pure aggregate counts (no new tables, no ledger, no mutation).
// Status→card mapping uses ONLY the existing product_status lifecycle:
//   available = qc_passed (units that have passed QC and are not yet packed)
//   dealer_stock = Dealer Inventory — products dispatched against a dealer
//                  (count where dealer_id IS NOT NULL). F3 (CTO, 2026-06-29):
//                  this is the SAME commercial definition the Dealer Portal uses
//                  (GET /dealers/{id}/inventory counts by dealer_id), so the two
//                  views can never disagree. No new lifecycle state is introduced;
//                  dealer-receipt confirmation is a future Logistics phase.
//   quarantined = 0 — no quarantine state exists in the lifecycle (Products are minted
//                 only at QC PASS), surfaced for completeness.
// Registered BEFORE "/:id" so the literal path wins over the id param.
router.get("/inventory-summary", async (_req: Request, res: Response): Promise<void> => {
  const statusRows = await db
    .select({ status: productsTable.productStatus, count: count() })
    .from(productsTable)
    .groupBy(productsTable.productStatus);

  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const r of statusRows) {
    const n = Number(r.count ?? 0);
    byStatus[r.status as string] = n;
    total += n;
  }

  const categoryRows = await db
    .select({
      category_id: productsTable.categoryId,
      category_name: productCategoriesTable.name,
      count: count(),
    })
    .from(productsTable)
    .leftJoin(productCategoriesTable, eq(productsTable.categoryId, productCategoriesTable.id))
    .groupBy(productsTable.categoryId, productCategoriesTable.name)
    .orderBy(desc(count()));

  // F3: Dealer Inventory = products dispatched against a dealer (dealer_id assigned).
  // Same definition the Dealer Portal uses, so the two views always agree.
  const [dealerAssigned] = await db
    .select({ c: count() })
    .from(productsTable)
    .where(isNotNull(productsTable.dealerId));

  res.json({
    total,
    available: byStatus["qc_passed"] ?? 0,
    ready_for_packing: byStatus["ready_for_packing"] ?? 0,
    packed: byStatus["packed"] ?? 0,
    dispatched: byStatus["dispatched"] ?? 0,
    dealer_stock: Number(dealerAssigned?.c ?? 0),
    quarantined: 0,
    by_status: {
      manufacturing: byStatus["manufacturing"] ?? 0,
      qc_passed: byStatus["qc_passed"] ?? 0,
      ready_for_packing: byStatus["ready_for_packing"] ?? 0,
      packed: byStatus["packed"] ?? 0,
      dispatched: byStatus["dispatched"] ?? 0,
      delivered_to_dealer: byStatus["delivered_to_dealer"] ?? 0,
    },
    by_category: categoryRows.map((c) => ({
      category_id: c.category_id,
      category_name: c.category_name ?? "Uncategorized",
      count: Number(c.count ?? 0),
    })),
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

// POST /products/imported — create finished Product(s) for imported goods (G1).
// Inverters that OCS imports (never manufactures): no production order, no BOM, no
// inventory consumption. Inbuilt Lithium → OCS mints the serial (needs `quantity`);
// Hybrid → capture the OEM serials (`oem_serials`). Both created ready_for_packing.
router.post(
  "/imported",
  requireRole("supervisor", "director"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = CreateImportedProductBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const actor = req.user?.email ?? "unknown";

    let result;
    try {
      result = await createImportedProducts(
        {
          modelId: parsed.data.model_id,
          sourceGrnId: parsed.data.source_grn_id ?? null,
          quantity: parsed.data.quantity ?? undefined,
          oemSerials: parsed.data.oem_serials ?? undefined,
          notes: parsed.data.notes ?? undefined,
        },
        actor,
      );
    } catch (err) {
      // A duplicate official/OEM serial hits the UNIQUE constraint on products.
      const e = err as { code?: string; cause?: { code?: string } } | null;
      if (e?.code === "23505" || e?.cause?.code === "23505") {
        res.status(409).json({ error: "One or more product serials already exist" });
        return;
      }
      throw err;
    }

    switch (result.kind) {
      case "model_not_found":
        res.status(404).json({ error: "Model not found" });
        return;
      case "grn_not_found":
        res.status(404).json({ error: "Source GRN not found" });
        return;
      case "model_no_category":
        res.status(422).json({ error: "Model has no product category assigned" });
        return;
      case "not_importable":
        res.status(422).json({
          error: `Category ${result.categoryCode} is not an importable product type (only Inbuilt Lithium / Hybrid inverters)`,
        });
        return;
      case "missing_quantity":
        res.status(422).json({ error: "quantity (≥1) is required for OCS-serialized imported products" });
        return;
      case "missing_oem_serials":
        res.status(422).json({ error: "oem_serials is required for manufacturer-serialized (Hybrid) products" });
        return;
      case "duplicate_oem_in_request":
        res.status(409).json({
          error: `Duplicate OEM serial(s) in request: ${result.serials.join(", ")}`,
        });
        return;
      case "ok": {
        const items = (await Promise.all(result.ids.map((id) => selectProductView(id)))).filter(
          (v): v is NonNullable<typeof v> => Boolean(v),
        );
        res.status(201).json({ created: items.length, items });
        return;
      }
    }
  },
);

export default router;
