import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, or, ilike, isNotNull, count, desc, asc, like, sql } from "drizzle-orm";
import {
  db,
  pool,
  grnHeadersTable,
  grnLineItemsTable,
  materialsTable,
  suppliersTable,
  masterCellsTable,
  inventoryTransactionsTable,
  materialTransfersTable,
  cellLotsTable,
  cellsTable,
  cellLotEventsTable,
  usersTable,
  mfgProductionOrdersTable,
} from "@workspace/db";
import { CreateMaterialTransferBody } from "@workspace/api-zod";
import { requireWriteRole } from "../../middleware/auth";
import { recordSecurityEvent, reqMeta } from "../../lib/security-events";

// ─── Material Transfer (Store → Cell Processing) ──────────────────────────────
// The single PRODUCTION path that moves GRN-received, inspection-passed cell stock
// out of inventory and into manufacturing (Cell Processing). A transfer atomically:
//   1. decrements the GRN line's available balance via one signed ledger row
//      (MATERIAL_TRANSFER_TO_CELL_PROCESSING, −qty @available) — so stock is never
//      double-counted; the line's running balance is SUM(available txns by line);
//   2. issues an immutable Transfer Document (TRF-YYYYMMDD-NNNNNN);
//   3. creates the Cell Lot (lot_number = transfer_number, transfer_id = the doc) with
//      chemistry/capacity/voltage/model auto-derived from the material's cell-master
//      bridge — the operator never re-enters them;
//   4. generates the individual cell records + lot timeline events.
// Partial transfers from one GRN line are allowed until the line's available balance
// reaches zero; concurrent transfers on one line are serialized FOR UPDATE (TOCTOU).

const router: IRouter = Router();
const cellStockRouter: IRouter = Router();

// Reads (cell-stock picker, transfer list/detail) pass for any authed user; writes
// (create a transfer) are supervisor+director — same policy as GRN / Inspection.
router.use(requireWriteRole("supervisor", "director"));
cellStockRouter.use(requireWriteRole("supervisor", "director"));

// ─── serialization helpers ───────────────────────────────────────────────────
function numify(v: unknown): unknown {
  return typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
}

function todayDateStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

interface TransferJoinRow {
  id: string;
  transferNumber: string;
  fromLocation: string;
  toLocation: string;
  materialId: string;
  materialCode: string | null;
  materialName: string | null;
  grnId: string;
  grnNumber: string | null;
  grnLineId: string;
  supplierId: string;
  supplierName: string | null;
  invoiceNumber: string | null;
  supplierLotNumber: string | null;
  quantity: string;
  uom: string;
  transferredBy: string | null;
  operatorName: string | null;
  createdAt: Date;
  cellLotId: string | null;
  lotNumber: string | null;
}

type TransferDestinationAudit = {
  source_movement_qty: number;
  source_available_qty: number;
  destination_quantity: number | null;
  generated_cell_count: number;
  reconciliation_status: "reconciled" | "mismatch" | "missing_destination";
};

async function loadTransferDestinationAudit(
  transferId: string,
  grnLineId: string,
  transferQuantity: number,
): Promise<TransferDestinationAudit> {
  const [[sourceMovement], [sourceBalance], [cellLot]] = await Promise.all([
    db
      .select({
        quantity: sql<string>`coalesce(sum(${inventoryTransactionsTable.quantity}), 0)`,
      })
      .from(inventoryTransactionsTable)
      .where(
        and(
          eq(inventoryTransactionsTable.sourceDocumentType, "TRANSFER"),
          eq(inventoryTransactionsTable.sourceDocumentId, transferId),
          eq(inventoryTransactionsTable.sourceLineId, grnLineId),
          eq(inventoryTransactionsTable.stockState, "available"),
        ),
      ),
    db
      .select({
        quantity: sql<string>`coalesce(sum(${inventoryTransactionsTable.quantity}), 0)`,
      })
      .from(inventoryTransactionsTable)
      .where(
        and(
          eq(inventoryTransactionsTable.sourceLineId, grnLineId),
          eq(inventoryTransactionsTable.stockState, "available"),
        ),
      ),
    db
      .select({
        id: cellLotsTable.id,
        quantityReceived: cellLotsTable.quantityReceived,
      })
      .from(cellLotsTable)
      .where(eq(cellLotsTable.transferId, transferId))
      .limit(1),
  ]);

  let generatedCellCount = 0;
  if (cellLot) {
    const [cellCount] = await db
      .select({ count: count() })
      .from(cellsTable)
      .where(eq(cellsTable.lotId, cellLot.id));
    generatedCellCount = Number(cellCount?.count ?? 0);
  }

  const sourceMovementQty = Number(sourceMovement?.quantity ?? 0);
  const sourceAvailableQty = Number(sourceBalance?.quantity ?? 0);
  const destinationQuantity = cellLot ? Number(cellLot.quantityReceived) : null;
  const reconciled =
    sourceMovementQty === -transferQuantity &&
    destinationQuantity === transferQuantity &&
    generatedCellCount === transferQuantity;

  return {
    source_movement_qty: sourceMovementQty,
    source_available_qty: sourceAvailableQty,
    destination_quantity: destinationQuantity,
    generated_cell_count: generatedCellCount,
    reconciliation_status: cellLot
      ? reconciled
        ? "reconciled"
        : "mismatch"
      : "missing_destination",
  };
}

function serializeTransfer(
  t: TransferJoinRow,
  cellLot?: Record<string, unknown>,
  consumedBy?: unknown[],
  destinationAudit?: TransferDestinationAudit,
) {
  const base = {
    id: t.id,
    transfer_number: t.transferNumber,
    from_location: t.fromLocation,
    to_location: t.toLocation,
    material_id: t.materialId,
    material_code: t.materialCode ?? null,
    material_name: t.materialName ?? null,
    grn_id: t.grnId,
    grn_number: t.grnNumber ?? null,
    grn_line_id: t.grnLineId,
    supplier_id: t.supplierId,
    supplier_name: t.supplierName ?? null,
    invoice_number: t.invoiceNumber ?? null,
    supplier_lot_number: t.supplierLotNumber ?? null,
    quantity: numify(t.quantity),
    uom: t.uom,
    transferred_by: t.transferredBy,
    operator_name: t.operatorName ?? null,
    created_at: t.createdAt,
    cell_lot_id: t.cellLotId ?? null,
    lot_number: t.lotNumber ?? null,
  };
  // The Cell Lot row is already camelCase (matches the generated CellLot type) and its
  // numeric columns are JS numbers (doublePrecision / integer), so it serializes as-is.
  // The detail shape additionally carries the lot remarks (the document's remarks) and
  // the downstream consumers (production orders that later consumed these cells).
  if (!cellLot && !destinationAudit) return base;
  if (!cellLot) {
    return {
      ...base,
      destination_audit: destinationAudit,
    };
  }
  return {
    ...base,
    ...(destinationAudit ? { destination_audit: destinationAudit } : {}),
    remarks: (cellLot.remarks as string | null) ?? null,
    cell_lot: cellLot,
    consumed_by: consumedBy ?? [],
  };
}

// Shared SELECT projection for transfer list/detail (joined names + linked cell lot).
const transferSelect = {
  id: materialTransfersTable.id,
  transferNumber: materialTransfersTable.transferNumber,
  fromLocation: materialTransfersTable.fromLocation,
  toLocation: materialTransfersTable.toLocation,
  materialId: materialTransfersTable.materialId,
  materialCode: materialsTable.code,
  materialName: materialsTable.name,
  grnId: materialTransfersTable.grnId,
  grnNumber: grnHeadersTable.grnNumber,
  grnLineId: materialTransfersTable.grnLineId,
  supplierId: materialTransfersTable.supplierId,
  supplierName: suppliersTable.name,
  invoiceNumber: grnHeadersTable.invoiceNumber,
  supplierLotNumber: grnLineItemsTable.supplierLotNumber,
  quantity: materialTransfersTable.quantity,
  uom: materialTransfersTable.uom,
  transferredBy: materialTransfersTable.transferredBy,
  operatorName: usersTable.name,
  createdAt: materialTransfersTable.createdAt,
  cellLotId: cellLotsTable.id,
  lotNumber: cellLotsTable.lotNumber,
};

// ─── GET /inventory/cell-stock — the transfer picker ──────────────────────────
// One row per GRN line that still holds available cell stock (cell materials only =
// those with a cell-master bridge). available_qty nets receipts/inspection-accepts
// against prior transfers (SUM of available ledger rows by source line). Only lines
// with a positive balance are returned.
cellStockRouter.get("/", async (req: Request, res: Response): Promise<void> => {
  const search = (req.query.search as string | undefined)?.trim();

  const conditions = [isNotNull(materialsTable.cellMasterId)];
  if (search) {
    conditions.push(
      or(
        ilike(materialsTable.code, `%${search}%`),
        ilike(materialsTable.name, `%${search}%`),
        ilike(grnHeadersTable.grnNumber, `%${search}%`),
      )!,
    );
  }

  const rows = await db
    .select({
      grnLineId: grnLineItemsTable.id,
      grnId: grnLineItemsTable.grnId,
      grnNumber: grnHeadersTable.grnNumber,
      materialId: materialsTable.id,
      materialCode: materialsTable.code,
      materialName: materialsTable.name,
      manufacturer: materialsTable.manufacturer,
      supplierId: suppliersTable.id,
      supplierName: suppliersTable.name,
      invoiceNumber: grnHeadersTable.invoiceNumber,
      supplierLotNumber: grnLineItemsTable.supplierLotNumber,
      uom: grnLineItemsTable.uom,
      receivedDate: grnHeadersTable.receivedDate,
      cellMasterId: materialsTable.cellMasterId,
      cellModel: masterCellsTable.model,
      cellChemistry: masterCellsTable.chemistry,
      capacityMah: masterCellsTable.capacityMah,
      nominalVoltageV: masterCellsTable.nominalVoltageV,
      availableQty: sql<string>`sum(${inventoryTransactionsTable.quantity})`,
    })
    .from(grnLineItemsTable)
    .innerJoin(materialsTable, eq(materialsTable.id, grnLineItemsTable.materialId))
    .innerJoin(grnHeadersTable, eq(grnHeadersTable.id, grnLineItemsTable.grnId))
    .innerJoin(suppliersTable, eq(suppliersTable.id, grnHeadersTable.supplierId))
    .leftJoin(masterCellsTable, eq(masterCellsTable.id, materialsTable.cellMasterId))
    .innerJoin(
      inventoryTransactionsTable,
      and(
        eq(inventoryTransactionsTable.sourceLineId, grnLineItemsTable.id),
        eq(inventoryTransactionsTable.stockState, "available"),
      ),
    )
    .where(and(...conditions))
    .groupBy(
      grnLineItemsTable.id,
      grnLineItemsTable.grnId,
      grnHeadersTable.grnNumber,
      materialsTable.id,
      materialsTable.code,
      materialsTable.name,
      materialsTable.manufacturer,
      suppliersTable.id,
      suppliersTable.name,
      grnHeadersTable.invoiceNumber,
      grnLineItemsTable.supplierLotNumber,
      grnLineItemsTable.uom,
      grnHeadersTable.receivedDate,
      materialsTable.cellMasterId,
      masterCellsTable.model,
      masterCellsTable.chemistry,
      masterCellsTable.capacityMah,
      masterCellsTable.nominalVoltageV,
    )
    .having(sql`sum(${inventoryTransactionsTable.quantity}) > 0`)
    .orderBy(asc(grnHeadersTable.grnNumber));

  const items = rows.map((r) => ({
    grn_line_id: r.grnLineId,
    grn_id: r.grnId,
    grn_number: r.grnNumber,
    material_id: r.materialId,
    material_code: r.materialCode,
    material_name: r.materialName,
    supplier_id: r.supplierId,
    supplier_name: r.supplierName,
    manufacturer: r.manufacturer ?? null,
    invoice_number: r.invoiceNumber ?? null,
    supplier_lot_number: r.supplierLotNumber ?? null,
    uom: r.uom,
    received_date: r.receivedDate,
    available_qty: Number(r.availableQty),
    is_mapped: r.cellMasterId != null,
    cell_master_id: r.cellMasterId ?? null,
    cell_model: r.cellModel ?? null,
    cell_chemistry: r.cellChemistry ?? null,
    nominal_capacity_ah: r.capacityMah != null ? Number(r.capacityMah) / 1000 : null,
    nominal_voltage_v: r.nominalVoltageV != null ? Number(r.nominalVoltageV) : null,
  }));

  res.json({ items });
});

// ─── GET /inventory/transfers — list transfer documents ───────────────────────
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const query = req.query as Record<string, string | undefined>;
  const page = parseInt(query.page || "1", 10);
  const pageSize = parseInt(query.pageSize || "25", 10);
  const search = query.search?.trim();
  const offset = (page - 1) * pageSize;

  const where = search
    ? or(
        ilike(materialTransfersTable.transferNumber, `%${search}%`),
        ilike(materialsTable.code, `%${search}%`),
        ilike(materialsTable.name, `%${search}%`),
        ilike(grnHeadersTable.grnNumber, `%${search}%`),
      )
    : undefined;

  const [totalResult] = await db
    .select({ count: count() })
    .from(materialTransfersTable)
    .innerJoin(materialsTable, eq(materialsTable.id, materialTransfersTable.materialId))
    .innerJoin(grnHeadersTable, eq(grnHeadersTable.id, materialTransfersTable.grnId))
    .where(where);

  const rows = await db
    .select(transferSelect)
    .from(materialTransfersTable)
    .innerJoin(materialsTable, eq(materialsTable.id, materialTransfersTable.materialId))
    .innerJoin(grnHeadersTable, eq(grnHeadersTable.id, materialTransfersTable.grnId))
    .innerJoin(suppliersTable, eq(suppliersTable.id, materialTransfersTable.supplierId))
    .innerJoin(grnLineItemsTable, eq(grnLineItemsTable.id, materialTransfersTable.grnLineId))
    .leftJoin(usersTable, eq(usersTable.id, materialTransfersTable.transferredBy))
    .leftJoin(cellLotsTable, eq(cellLotsTable.transferId, materialTransfersTable.id))
    .where(where)
    .limit(pageSize)
    .offset(offset)
    .orderBy(desc(materialTransfersTable.createdAt));

  const total = Number(totalResult?.count ?? 0);
  res.json({
    items: rows.map((r) => serializeTransfer(r as TransferJoinRow)),
    meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
  });
});

// ─── POST /inventory/transfers — create a transfer (atomic) ───────────────────
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateMaterialTransferBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.issues }, "Invalid material transfer input");
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const body = parsed.data;
  const qty = body.quantity;
  // Cells are counted units — a transfer mints exactly `qty` cell records, so the
  // quantity must be a positive whole number.
  if (!Number.isInteger(qty) || qty <= 0) {
    res.status(400).json({ error: "quantity must be a positive whole number of cells" });
    return;
  }

  const actorId = req.user?.userId ?? null;
  const dateStr = todayDateStr();
  const { rows: seqRows } = await pool.query("SELECT nextval('material_transfer_seq') AS seq");
  const transferNumber = `TRF-${dateStr}-${String(seqRows[0].seq).padStart(6, "0")}`;

  const outcome = await db.transaction(async (tx) => {
    // Lock the GRN line FOR UPDATE so concurrent transfers on the same line serialize
    // (the available balance check below is then race-free / TOCTOU-safe).
    const [lineLock] = await tx
      .select({ id: grnLineItemsTable.id })
      .from(grnLineItemsTable)
      .where(eq(grnLineItemsTable.id, body.grn_line_id))
      .for("update")
      .limit(1);
    if (!lineLock) return { status: "not_found" as const };

    // Resolve the line's context (immutable masters / posted GRN — no lock needed).
    const [ctx] = await tx
      .select({
        materialId: materialsTable.id,
        materialCode: materialsTable.code,
        materialName: materialsTable.name,
        cellMasterId: materialsTable.cellMasterId,
        grnId: grnHeadersTable.id,
        grnNumber: grnHeadersTable.grnNumber,
        invoiceNumber: grnHeadersTable.invoiceNumber,
        receivedDate: grnHeadersTable.receivedDate,
        supplierId: suppliersTable.id,
        supplierName: suppliersTable.name,
        supplierLotNumber: grnLineItemsTable.supplierLotNumber,
        uom: grnLineItemsTable.uom,
        cellManufacturer: masterCellsTable.manufacturer,
        cellModel: masterCellsTable.model,
        cellChemistry: masterCellsTable.chemistry,
        capacityMah: masterCellsTable.capacityMah,
      })
      .from(grnLineItemsTable)
      .innerJoin(materialsTable, eq(materialsTable.id, grnLineItemsTable.materialId))
      .innerJoin(grnHeadersTable, eq(grnHeadersTable.id, grnLineItemsTable.grnId))
      .innerJoin(suppliersTable, eq(suppliersTable.id, grnHeadersTable.supplierId))
      .leftJoin(masterCellsTable, eq(masterCellsTable.id, materialsTable.cellMasterId))
      .where(eq(grnLineItemsTable.id, body.grn_line_id))
      .limit(1);
    if (!ctx) return { status: "not_found" as const };

    // The material MUST carry a cell-master bridge — that is what makes it transferable
    // into Cell Processing and supplies the chemistry/capacity/model spec (D3).
    if (ctx.cellMasterId == null || ctx.cellModel == null) {
      return { status: "not_cell" as const };
    }

    // Available balance = SUM of available ledger rows for this line (receipts +
    // inspection accepts − prior transfers). Re-read inside the lock.
    const [bal] = await tx
      .select({
        sum: sql<string>`coalesce(sum(${inventoryTransactionsTable.quantity}), 0)`,
      })
      .from(inventoryTransactionsTable)
      .where(
        and(
          eq(inventoryTransactionsTable.sourceLineId, body.grn_line_id),
          eq(inventoryTransactionsTable.stockState, "available"),
        ),
      );
    const available = Number(bal?.sum ?? 0);
    if (qty > available) {
      return { status: "insufficient" as const, available };
    }

    // 1. Transfer document header.
    const [transfer] = await tx
      .insert(materialTransfersTable)
      .values({
        transferNumber,
        materialId: ctx.materialId,
        grnId: ctx.grnId,
        grnLineId: body.grn_line_id,
        supplierId: ctx.supplierId,
        quantity: String(qty),
        uom: ctx.uom,
        transferredBy: actorId,
      })
      .returning();

    // 2. Signed ledger row — decrements the line's available balance.
    await tx.insert(inventoryTransactionsTable).values({
      transactionType: "MATERIAL_TRANSFER_TO_CELL_PROCESSING",
      materialId: ctx.materialId,
      quantity: String(-qty),
      uom: ctx.uom,
      stockState: "available",
      sourceDocumentType: "TRANSFER",
      sourceDocumentId: transfer.id,
      sourceLineId: body.grn_line_id,
      createdBy: actorId,
    });

    // 3. Cell Lot — spec auto-derived from the cell-master bridge; lot_number = TRF; the
    //    lot references the transfer (not the GRN directly).
    const receivedBy =
      body.received_by?.trim() || req.user?.name || req.user?.email || "system";
    const [lot] = await tx
      .insert(cellLotsTable)
      .values({
        supplier: ctx.supplierName,
        manufacturer: ctx.cellManufacturer!,
        cellModel: ctx.cellModel,
        cellChemistry: ctx.cellChemistry!,
        nominalCapacityAh: ctx.capacityMah != null ? Number(ctx.capacityMah) / 1000 : 0,
        lotNumber: transferNumber,
        invoiceNumber: ctx.invoiceNumber ?? null,
        supplierLotNumber: ctx.supplierLotNumber ?? null,
        dateReceived: ctx.receivedDate,
        quantityReceived: qty,
        receivedBy,
        remarks: body.remarks ?? null,
        status: "received",
        cellMasterId: ctx.cellMasterId,
        transferId: transfer.id,
      })
      .returning();

    // 4. Individual cell records (CELL-YYYYMMDD-NNNNNN) + lot timeline events.
    const prefix = `CELL-${dateStr}-`;
    const [{ existingCount }] = await tx
      .select({ existingCount: count() })
      .from(cellsTable)
      .where(like(cellsTable.cellId, `${prefix}%`));
    const startSeq = Number(existingCount) + 1;
    const firstCellId = `${prefix}${String(startSeq).padStart(6, "0")}`;
    const lastCellId = `${prefix}${String(startSeq + qty - 1).padStart(6, "0")}`;
    const cellRecords = Array.from({ length: qty }, (_, i) => ({
      cellId: `${prefix}${String(startSeq + i).padStart(6, "0")}`,
      lotId: lot.id,
      status: "received" as const,
    }));
    await tx.insert(cellsTable).values(cellRecords);

    await tx.insert(cellLotEventsTable).values({
      lotId: lot.id,
      eventType: "lot_received",
      performedBy: req.user!.email,
      reason: null,
      changes: {
        lotNumber: lot.lotNumber,
        supplier: lot.supplier,
        quantityReceived: lot.quantityReceived,
        transferNumber,
        grnNumber: ctx.grnNumber,
      },
    });
    await tx.insert(cellLotEventsTable).values({
      lotId: lot.id,
      eventType: "cell_records_generated",
      performedBy: req.user!.email,
      reason: null,
      changes: { quantity: qty, range: `${firstCellId} → ${lastCellId}` },
    });

    return {
      status: "ok" as const,
      transfer,
      lot,
      ctx,
    };
  });

  if (outcome.status === "not_found") {
    res.status(404).json({ error: "GRN line not found" });
    return;
  }
  if (outcome.status === "not_cell") {
    res.status(422).json({
      error:
        "This material is not mapped to a cell master — map the material to a cell " +
        "master before transferring it into Cell Processing.",
    });
    return;
  }
  if (outcome.status === "insufficient") {
    res.status(422).json({
      error: `Insufficient available stock: requested ${qty}, available ${outcome.available}.`,
    });
    return;
  }

  void recordSecurityEvent({
    eventType: "inventory.transfer.created",
    actorId,
    actorEmail: req.user?.email ?? null,
    actorRole: req.user?.role ?? null,
    ...reqMeta(req),
    statusCode: 201,
    detail: `Transfer ${transferNumber} created (${qty} cell(s) → Cell Processing, lot ${outcome.lot.lotNumber})`,
  });

  const row: TransferJoinRow = {
    ...(outcome.transfer as Record<string, any>),
    materialCode: outcome.ctx.materialCode,
    materialName: outcome.ctx.materialName,
    grnNumber: outcome.ctx.grnNumber,
    supplierName: outcome.ctx.supplierName,
    invoiceNumber: outcome.ctx.invoiceNumber ?? null,
    supplierLotNumber: outcome.ctx.supplierLotNumber ?? null,
    operatorName: req.user?.name ?? null,
    cellLotId: outcome.lot.id,
    lotNumber: outcome.lot.lotNumber,
  } as TransferJoinRow;
  const destinationAudit = await loadTransferDestinationAudit(
    outcome.transfer.id,
    body.grn_line_id,
    qty,
  );
  res
    .status(201)
    .json(serializeTransfer(row, outcome.lot as Record<string, unknown>, [], destinationAudit));
});

// ─── GET /inventory/transfers/:id — transfer document detail ──────────────────
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const [row] = await db
    .select(transferSelect)
    .from(materialTransfersTable)
    .innerJoin(materialsTable, eq(materialsTable.id, materialTransfersTable.materialId))
    .innerJoin(grnHeadersTable, eq(grnHeadersTable.id, materialTransfersTable.grnId))
    .innerJoin(suppliersTable, eq(suppliersTable.id, materialTransfersTable.supplierId))
    .innerJoin(grnLineItemsTable, eq(grnLineItemsTable.id, materialTransfersTable.grnLineId))
    .leftJoin(usersTable, eq(usersTable.id, materialTransfersTable.transferredBy))
    .leftJoin(cellLotsTable, eq(cellLotsTable.transferId, materialTransfersTable.id))
    .where(eq(materialTransfersTable.id, req.params.id as string))
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "Transfer not found" });
    return;
  }

  let cellLot: Record<string, unknown> | undefined;
  let consumedBy: unknown[] = [];
  if (row.cellLotId) {
    const [lot] = await db
      .select()
      .from(cellLotsTable)
      .where(eq(cellLotsTable.id, row.cellLotId))
      .limit(1);
    cellLot = lot as Record<string, unknown> | undefined;

    // Downstream traceability — which production orders later consumed cells from
    // this transfer's lot (a cell carries allocation_order_id once matched/allocated).
    const consumers = await db
      .select({
        productionOrderId: cellsTable.allocationOrderId,
        orderNumber: mfgProductionOrdersTable.orderNumber,
        batteryNumber: mfgProductionOrdersTable.batteryNumber,
        status: mfgProductionOrdersTable.status,
        cellsConsumed: count(),
      })
      .from(cellsTable)
      .leftJoin(
        mfgProductionOrdersTable,
        eq(mfgProductionOrdersTable.id, cellsTable.allocationOrderId),
      )
      .where(
        and(
          eq(cellsTable.lotId, row.cellLotId),
          isNotNull(cellsTable.allocationOrderId),
        ),
      )
      .groupBy(
        cellsTable.allocationOrderId,
        mfgProductionOrdersTable.orderNumber,
        mfgProductionOrdersTable.batteryNumber,
        mfgProductionOrdersTable.status,
      );
    consumedBy = consumers.map((c) => ({
      production_order_id: c.productionOrderId,
      order_number: c.orderNumber ?? null,
      battery_number: c.batteryNumber ?? null,
      status: c.status ?? null,
      cells_consumed: Number(c.cellsConsumed),
    }));
  }

  const destinationAudit = await loadTransferDestinationAudit(
    row.id,
    row.grnLineId,
    Number(row.quantity),
  );
  res.json(serializeTransfer(row as TransferJoinRow, cellLot, consumedBy, destinationAudit));
});

export { cellStockRouter };
export default router;
