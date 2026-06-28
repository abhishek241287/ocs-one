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
import { PackProductsBody } from "@workspace/api-zod";
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

// Enriched, contract-shaped (snake_case) Product views for a set of ids — the
// identical `Product` shape returned everywhere else (never raw camelCase rows).
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

// POST /packing — pack a batch of ready-for-packing products (Product-Platform
// driven; no new tables, no ledger). Atomic & fail-fast: every product must be in
// `ready_for_packing` or the whole request is rejected (422) and nothing is written.
// Each packed product transitions ready_for_packing → packed and gets an immutable
// `product.packed` event capturing the packing date + packed-by operator.
router.post(
  "/",
  requireRole("supervisor", "director"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = PackProductsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { packing_date, packed_by } = parsed.data;
    // De-duplicate ids so a repeated id never double-counts or self-conflicts.
    const ids: string[] = Array.from(new Set<string>(parsed.data.product_ids));
    const actor = req.user?.email ?? "unknown";

    const result = await db.transaction(async (tx) => {
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
        if (row.status !== "ready_for_packing") {
          invalid.push({
            product_id: id,
            serial: row.serial,
            reason: `not_ready_for_packing:${row.status}`,
          });
        }
      }
      if (invalid.length > 0) {
        return { kind: "invalid" as const, invalid };
      }

      await tx
        .update(productsTable)
        .set({ productStatus: "packed", updatedAt: new Date() })
        .where(inArray(productsTable.id, ids));

      await tx.insert(productEventsTable).values(
        ids.map((id) => ({
          productId: id,
          eventType: "product.packed",
          actor,
          description: `Packed by ${packed_by} on ${packing_date}`,
          metadata: { packingDate: packing_date, packedBy: packed_by },
        })),
      );

      return { kind: "ok" as const };
    });

    if (result.kind === "invalid") {
      res.status(422).json({
        error: "One or more products are not in ready_for_packing",
        invalid: result.invalid,
      });
      return;
    }

    const items = await selectProductViews(ids);
    res.json({ packed: items.length, items });
  },
);

export default router;
