import { Router, type IRouter, type Request, type Response } from "express";
import { eq, asc, sql } from "drizzle-orm";
import { db, materialsTable, inventoryTransactionsTable } from "@workspace/db";
import { requireWriteRole } from "../../middleware/auth";

const router: IRouter = Router();

// Stock is a read-only projection of the immutable inventory ledger. Reads pass for any
// authed user; the guard exists only so any future write here is supervisor+director.
router.use(requireWriteRole("supervisor", "director"));

// ─── On-hand stock by material + stock_state ─────────────────────────────────
// The ledger is append-only with SIGNED quantities (a release is negative), so the
// current on-hand for each (material, state) is simply SUM(quantity). Zero-net buckets
// are dropped (HAVING) so a fully-released inspection_pending hold disappears.
router.get("/", async (_req: Request, res: Response): Promise<void> => {
  const rows = await db
    .select({
      material_id: inventoryTransactionsTable.materialId,
      material_code: materialsTable.code,
      material_name: materialsTable.name,
      uom: inventoryTransactionsTable.uom,
      stock_state: inventoryTransactionsTable.stockState,
      quantity: sql<string>`sum(${inventoryTransactionsTable.quantity})`,
    })
    .from(inventoryTransactionsTable)
    .innerJoin(materialsTable, eq(materialsTable.id, inventoryTransactionsTable.materialId))
    .groupBy(
      inventoryTransactionsTable.materialId,
      materialsTable.code,
      materialsTable.name,
      inventoryTransactionsTable.uom,
      inventoryTransactionsTable.stockState,
    )
    .having(sql`sum(${inventoryTransactionsTable.quantity}) <> 0`)
    .orderBy(asc(materialsTable.code), asc(inventoryTransactionsTable.stockState));

  res.json({
    items: rows.map((r) => ({
      material_id: r.material_id,
      material_code: r.material_code,
      material_name: r.material_name,
      uom: r.uom,
      stock_state: r.stock_state,
      quantity: Number(r.quantity),
    })),
  });
});

export default router;
