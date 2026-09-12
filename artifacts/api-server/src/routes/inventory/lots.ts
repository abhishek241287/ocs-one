import { Router, type IRouter, type Request, type Response } from "express";
import { asc, eq } from "drizzle-orm";
import { db, inventoryLotsTable, materialsTable } from "@workspace/db";
import { requireWriteRole } from "../../middleware/auth";

const router: IRouter = Router();
router.use(requireWriteRole("supervisor", "director"));

function serialize(lot: Record<string, any>) {
  return {
    id: lot.id,
    lot_number: lot.lotNumber,
    material_id: lot.materialId,
    material_code: lot.materialCode ?? null,
    material_name: lot.materialName ?? null,
    supplier_lot_number: lot.supplierLotNumber ?? null,
    supplier_id: lot.supplierId ?? null,
    grn_line_id: lot.grnLineId ?? null,
    received_date: lot.receivedDate,
    expiry_date: lot.expiryDate,
    manufacture_date: lot.manufactureDate,
    status: lot.status,
    total_received_qty: lot.totalReceivedQty,
    remaining_qty: lot.remainingQty,
    uom: lot.uom,
    warehouse_id: lot.warehouseId,
    location_id: lot.locationId,
    bin_id: lot.binId,
    created_at: lot.createdAt,
  };
}

router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const [lot] = await db
    .select({
      id: inventoryLotsTable.id,
      lotNumber: inventoryLotsTable.lotNumber,
      materialId: inventoryLotsTable.materialId,
      materialCode: materialsTable.code,
      materialName: materialsTable.name,
      supplierLotNumber: inventoryLotsTable.supplierLotNumber,
      supplierId: inventoryLotsTable.supplierId,
      grnLineId: inventoryLotsTable.grnLineId,
      receivedDate: inventoryLotsTable.receivedDate,
      expiryDate: inventoryLotsTable.expiryDate,
      manufactureDate: inventoryLotsTable.manufactureDate,
      status: inventoryLotsTable.status,
      totalReceivedQty: inventoryLotsTable.totalReceivedQty,
      remainingQty: inventoryLotsTable.remainingQty,
      uom: inventoryLotsTable.uom,
      warehouseId: inventoryLotsTable.warehouseId,
      locationId: inventoryLotsTable.locationId,
      binId: inventoryLotsTable.binId,
      createdAt: inventoryLotsTable.createdAt,
    })
    .from(inventoryLotsTable)
    .innerJoin(materialsTable, eq(materialsTable.id, inventoryLotsTable.materialId))
    .where(eq(inventoryLotsTable.id, req.params.id as string))
    .limit(1);
  if (!lot) {
    res.status(404).json({ error: "Inventory lot not found" });
    return;
  }
  res.json({ data: serialize(lot) });
});

router.get("/", async (_req: Request, res: Response): Promise<void> => {
  const lots = await db
    .select({
      id: inventoryLotsTable.id,
      lotNumber: inventoryLotsTable.lotNumber,
      materialId: inventoryLotsTable.materialId,
      materialCode: materialsTable.code,
      materialName: materialsTable.name,
      supplierLotNumber: inventoryLotsTable.supplierLotNumber,
      supplierId: inventoryLotsTable.supplierId,
      grnLineId: inventoryLotsTable.grnLineId,
      receivedDate: inventoryLotsTable.receivedDate,
      expiryDate: inventoryLotsTable.expiryDate,
      manufactureDate: inventoryLotsTable.manufactureDate,
      status: inventoryLotsTable.status,
      totalReceivedQty: inventoryLotsTable.totalReceivedQty,
      remainingQty: inventoryLotsTable.remainingQty,
      uom: inventoryLotsTable.uom,
      warehouseId: inventoryLotsTable.warehouseId,
      locationId: inventoryLotsTable.locationId,
      binId: inventoryLotsTable.binId,
      createdAt: inventoryLotsTable.createdAt,
    })
    .from(inventoryLotsTable)
    .innerJoin(materialsTable, eq(materialsTable.id, inventoryLotsTable.materialId))
    .orderBy(asc(inventoryLotsTable.createdAt));
  res.json({ items: lots.map(serialize) });
});

export default router;