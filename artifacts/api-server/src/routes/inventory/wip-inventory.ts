import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, count, eq, type SQL } from "drizzle-orm";
import {
  db,
  inventoryLotsTable,
  materialsTable,
  wipInventoryTable,
} from "@workspace/db";
import { requireAuth } from "../../middleware/auth";

const router: IRouter = Router();

// WIP is a read-only projection for every authenticated factory role.
router.use(requireAuth);

const WIP_STATUSES = [
  "active",
  "partially_consumed",
  "fully_consumed",
  "reversed",
] as const;

function numify(value: unknown): unknown {
  return typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)
    ? Number(value)
    : value;
}

router.get("/", async (req: Request, res: Response): Promise<void> => {
  const query = req.query as Record<string, string | undefined>;
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 25));
  const offset = (page - 1) * pageSize;

  const conditions: SQL[] = [];
  if (query.production_order_id) {
    conditions.push(eq(wipInventoryTable.productionOrderId, query.production_order_id));
  }
  if (query.material_id) {
    conditions.push(eq(wipInventoryTable.materialId, query.material_id));
  }
  if (query.status) {
    if (!(WIP_STATUSES as readonly string[]).includes(query.status)) {
      res.status(400).json({ error: `Invalid WIP status: ${query.status}` });
      return;
    }
    conditions.push(eq(wipInventoryTable.status, query.status as (typeof WIP_STATUSES)[number]));
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const [totalRow] = await db
    .select({ count: count() })
    .from(wipInventoryTable)
    .where(where);

  const rows = await db
    .select({
      wip: wipInventoryTable,
      materialCode: materialsTable.code,
      materialName: materialsTable.name,
      lotNumber: inventoryLotsTable.lotNumber,
    })
    .from(wipInventoryTable)
    .innerJoin(materialsTable, eq(materialsTable.id, wipInventoryTable.materialId))
    .leftJoin(inventoryLotsTable, eq(inventoryLotsTable.id, wipInventoryTable.lotId))
    .where(where)
    .orderBy(asc(wipInventoryTable.createdAt), asc(wipInventoryTable.id))
    .limit(pageSize)
    .offset(offset);

  const total = Number(totalRow?.count ?? 0);
  res.json({
    items: rows.map(({ wip, materialCode, materialName, lotNumber }) => ({
      id: wip.id,
      production_order_id: wip.productionOrderId,
      material_id: wip.materialId,
      material_code: materialCode,
      material_name: materialName,
      lot_id: wip.lotId,
      lot_number: lotNumber ?? null,
      warehouse_id: wip.warehouseId,
      location_id: wip.locationId,
      issued_qty: numify(wip.issuedQty),
      consumed_qty: numify(wip.consumedQty),
      returned_qty: numify(wip.returnedQty),
      scrapped_qty: numify(wip.scrappedQty),
      remaining_qty: numify(wip.remainingQty),
      uom: wip.uom,
      status: wip.status,
      wip_issue_note_id: wip.wipIssueNoteId ?? null,
      issue_id: wip.issueId ?? null,
      created_at: wip.createdAt,
    })),
    meta: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  });
});

export default router;