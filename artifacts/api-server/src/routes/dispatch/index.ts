import { Router, type IRouter, type Request, type Response } from "express";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  productsTable,
  productEventsTable,
  productCategoriesTable,
  masterProductsTable,
  logisticsDealersTable,
} from "@workspace/db";
import { DispatchProductsBody } from "@workspace/api-zod";
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

// Enriched, contract-shaped (snake_case) Product views — identical `Product` shape
// returned everywhere else (never raw camelCase rows).
async function selectProductViews(ids: string[]) {
  if (ids.length === 0) return [];
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
    .where(inArray(productsTable.id, ids));
  return rows.map(numify);
}

// POST /dispatch — dispatch a batch of packed products to a dealer (Product-Platform
// driven; no new tables, no ledger, no LR/vehicle/driver/transporter). Atomic & fail-fast:
// the dealer must exist and every product must be in `packed`, else nothing is written.
// Each dispatched product transitions packed → dispatched, gets its dealer assigned on the
// existing `products.dealer_id`, and an immutable `product.dispatched` event capturing the
// dispatch number, date, invoice number, and dealer.
router.post(
  "/",
  requireRole("supervisor", "director"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = DispatchProductsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { dealer_id, dispatch_number, dispatch_date, invoice_number } = parsed.data;
    // De-duplicate ids so a repeated id never double-counts or self-conflicts.
    const ids: string[] = Array.from(new Set<string>(parsed.data.product_ids));
    const actor = req.user?.email ?? "unknown";

    const result = await db.transaction(async (tx) => {
      const dealer = await tx
        .select({ id: logisticsDealersTable.id, name: logisticsDealersTable.dealerName })
        .from(logisticsDealersTable)
        .where(eq(logisticsDealersTable.id, dealer_id))
        .limit(1);
      if (dealer.length === 0) {
        return { kind: "no_dealer" as const };
      }

      // Lock every targeted product row up-front to close the TOCTOU window
      // between the eligibility check and the write.
      const rows = await tx
        .select({
          id: productsTable.id,
          serial: productsTable.officialProductSerial,
          status: productsTable.productStatus,
        })
        .from(productsTable)
        .where(inArray(productsTable.id, ids))
        .for("update");

      const found = new Map(rows.map((r) => [r.id, r]));
      const invalid: { product_id: string; serial?: string; reason: string }[] = [];
      for (const id of ids) {
        const row = found.get(id);
        if (!row) {
          invalid.push({ product_id: id, reason: "not_found" });
          continue;
        }
        if (row.status !== "packed") {
          invalid.push({
            product_id: id,
            serial: row.serial,
            reason: `not_packed:${row.status}`,
          });
        }
      }
      if (invalid.length > 0) {
        return { kind: "invalid" as const, invalid };
      }

      await tx
        .update(productsTable)
        .set({ productStatus: "dispatched", dealerId: dealer_id, updatedAt: new Date() })
        .where(inArray(productsTable.id, ids));

      await tx.insert(productEventsTable).values(
        ids.map((id) => ({
          productId: id,
          eventType: "product.dispatched",
          actor,
          description: `Dispatched to ${dealer[0].name} — ${dispatch_number} (invoice ${invoice_number}) on ${dispatch_date}`,
          metadata: {
            dispatchNumber: dispatch_number,
            dispatchDate: dispatch_date,
            invoiceNumber: invoice_number,
            dealerId: dealer_id,
            dealerName: dealer[0].name,
          },
        })),
      );

      return { kind: "ok" as const };
    });

    if (result.kind === "no_dealer") {
      res.status(404).json({ error: "Dealer not found" });
      return;
    }
    if (result.kind === "invalid") {
      res.status(422).json({
        error: "One or more products are not in packed",
        invalid: result.invalid,
      });
      return;
    }

    const items = await selectProductViews(ids);
    res.json({ dispatched: items.length, items });
  },
);

export default router;
