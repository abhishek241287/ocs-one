import { Router, type IRouter, type Request, type Response } from "express";
import { eq, asc, sql, and, or, ilike, count, type SQL } from "drizzle-orm";
import { db, materialsTable, inventoryTransactionsTable } from "@workspace/db";
import { requireWriteRole } from "../../middleware/auth";

const router: IRouter = Router();

// Stock is a read-only projection of the immutable inventory ledger. Reads pass for any
// authed user; the guard exists only so any future write here is supervisor+director.
router.use(requireWriteRole("supervisor", "director"));

const STOCK_STATES = ["inspection_pending", "available", "rejected"] as const;
type StockState = (typeof STOCK_STATES)[number];

// ─── On-hand stock by material + stock_state ─────────────────────────────────
// The ledger is append-only with SIGNED quantities (a release is negative), so the
// current on-hand for each (material, state) is simply SUM(quantity). Zero-net buckets
// are dropped (HAVING) so a fully-released inspection_pending hold disappears.
// INV-003: search (material code/name) + stock_state filter + server pagination.
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 25));
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const stateParam = req.query.stock_state;
  const stockState =
    typeof stateParam === "string" && (STOCK_STATES as readonly string[]).includes(stateParam)
      ? (stateParam as StockState)
      : undefined;

  const filters: SQL[] = [];
  if (search) {
    filters.push(
      or(ilike(materialsTable.code, `%${search}%`), ilike(materialsTable.name, `%${search}%`)) as SQL,
    );
  }
  if (stockState) {
    filters.push(eq(inventoryTransactionsTable.stockState, stockState));
  }
  const where = filters.length ? and(...filters) : undefined;

  // Aggregate per (material, state) on-hand as a subquery so we can both COUNT the
  // groups (for pagination meta) and slice a page off the same projection.
  const grouped = db
    .select({
      material_id: inventoryTransactionsTable.materialId,
      material_code: materialsTable.code,
      material_name: materialsTable.name,
      uom: inventoryTransactionsTable.uom,
      stock_state: inventoryTransactionsTable.stockState,
      quantity: sql<string>`sum(${inventoryTransactionsTable.quantity})`.as("quantity"),
    })
    .from(inventoryTransactionsTable)
    .innerJoin(materialsTable, eq(materialsTable.id, inventoryTransactionsTable.materialId))
    .where(where)
    .groupBy(
      inventoryTransactionsTable.materialId,
      materialsTable.code,
      materialsTable.name,
      inventoryTransactionsTable.uom,
      inventoryTransactionsTable.stockState,
    )
    .having(sql`sum(${inventoryTransactionsTable.quantity}) <> 0`)
    .as("grouped");

  const [{ total: totalRaw }] = await db.select({ total: count() }).from(grouped);
  const total = Number(totalRaw);

  const rows = await db
    .select()
    .from(grouped)
    .orderBy(asc(grouped.material_code), asc(grouped.stock_state))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  res.json({
    items: rows.map((r) => ({
      material_id: r.material_id,
      material_code: r.material_code,
      material_name: r.material_name,
      uom: r.uom,
      stock_state: r.stock_state,
      quantity: Number(r.quantity),
    })),
    meta: {
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  });
});

export default router;
