import { Router, type IRouter, type Request, type Response } from "express";
import {
  AddPurchaseOrderLineBody,
  AddPurchaseOrderLineParams,
  CancelPurchaseOrderBody,
  CancelPurchaseOrderParams,
  CreatePurchaseOrderBody,
  DeletePurchaseOrderLineParams,
  GetPurchaseOrderParams,
  ListPurchaseOrdersQueryParams,
  SubmitPurchaseOrderParams,
  UpdatePurchaseOrderBody,
  UpdatePurchaseOrderLineBody,
  UpdatePurchaseOrderLineParams,
  UpdatePurchaseOrderParams,
} from "@workspace/api-zod";
import {
  db,
  materialsTable,
  outboxEventsTable,
  purchaseOrderLinesTable,
  purchaseOrdersTable,
  suppliersTable,
} from "@workspace/db";
import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { requireRole, requireWriteRole } from "../../middleware/auth";

const router: IRouter = Router();

// All procurement writes are supervisor/director operations. GET requests are
// deliberately left open to every authenticated factory role by this middleware.
router.use(requireWriteRole("supervisor", "director"));

function numberValue(value: unknown): unknown {
  return typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value;
}

function serializeHeader(header: Record<string, any>): Record<string, unknown> {
  return {
    id: header.id,
    po_number: header.poNumber,
    supplier_id: header.supplierId,
    supplier_code: header.supplierCode ?? null,
    supplier_name: header.supplierName ?? null,
    status: header.status,
    ordered_date: header.orderedDate ?? null,
    required_date: header.requiredDate ?? null,
    approved_by: header.approvedBy ?? null,
    approved_at: header.approvedAt ?? null,
    currency: header.currency,
    total_amount: numberValue(header.totalAmount) ?? null,
    terms: header.terms ?? null,
    notes: header.notes ?? null,
    over_receipt_tolerance_percent: numberValue(header.overReceiptTolerancePercent),
    created_by: header.createdBy,
    created_at: header.createdAt,
    updated_at: header.updatedAt,
  };
}

function serializeLine(line: Record<string, any>): Record<string, unknown> {
  return {
    id: line.id,
    purchase_order_id: line.purchaseOrderId,
    line_number: line.lineNumber,
    material_id: line.materialId,
    material_code: line.materialCode ?? null,
    material_name: line.materialName ?? null,
    ordered_qty: numberValue(line.orderedQty),
    received_qty: numberValue(line.receivedQty),
    rejected_qty: numberValue(line.rejectedQty),
    cancelled_qty: numberValue(line.cancelledQty),
    open_qty: numberValue(line.openQty),
    unit_price: numberValue(line.unitPrice) ?? null,
    uom: line.uom,
    required_date: line.requiredDate ?? null,
    notes: line.notes ?? null,
    created_at: line.createdAt,
  };
}

async function readDetail(id: string): Promise<Record<string, unknown> | null> {
  const [header] = await db
    .select({
      id: purchaseOrdersTable.id,
      poNumber: purchaseOrdersTable.poNumber,
      supplierId: purchaseOrdersTable.supplierId,
      supplierCode: suppliersTable.code,
      supplierName: suppliersTable.name,
      status: purchaseOrdersTable.status,
      orderedDate: purchaseOrdersTable.orderedDate,
      requiredDate: purchaseOrdersTable.requiredDate,
      approvedBy: purchaseOrdersTable.approvedBy,
      approvedAt: purchaseOrdersTable.approvedAt,
      currency: purchaseOrdersTable.currency,
      totalAmount: purchaseOrdersTable.totalAmount,
      terms: purchaseOrdersTable.terms,
      notes: purchaseOrdersTable.notes,
      overReceiptTolerancePercent: purchaseOrdersTable.overReceiptTolerancePercent,
      createdBy: purchaseOrdersTable.createdBy,
      createdAt: purchaseOrdersTable.createdAt,
      updatedAt: purchaseOrdersTable.updatedAt,
    })
    .from(purchaseOrdersTable)
    .leftJoin(suppliersTable, eq(suppliersTable.id, purchaseOrdersTable.supplierId))
    .where(eq(purchaseOrdersTable.id, id))
    .limit(1);
  if (!header) return null;

  const lines = await db
    .select({
      id: purchaseOrderLinesTable.id,
      purchaseOrderId: purchaseOrderLinesTable.purchaseOrderId,
      lineNumber: purchaseOrderLinesTable.lineNumber,
      materialId: purchaseOrderLinesTable.materialId,
      materialCode: materialsTable.code,
      materialName: materialsTable.name,
      orderedQty: purchaseOrderLinesTable.orderedQty,
      receivedQty: purchaseOrderLinesTable.receivedQty,
      rejectedQty: purchaseOrderLinesTable.rejectedQty,
      cancelledQty: purchaseOrderLinesTable.cancelledQty,
      openQty: purchaseOrderLinesTable.openQty,
      unitPrice: purchaseOrderLinesTable.unitPrice,
      uom: purchaseOrderLinesTable.uom,
      requiredDate: purchaseOrderLinesTable.requiredDate,
      notes: purchaseOrderLinesTable.notes,
      createdAt: purchaseOrderLinesTable.createdAt,
    })
    .from(purchaseOrderLinesTable)
    .leftJoin(materialsTable, eq(materialsTable.id, purchaseOrderLinesTable.materialId))
    .where(eq(purchaseOrderLinesTable.purchaseOrderId, id))
    .orderBy(asc(purchaseOrderLinesTable.lineNumber));

  return { ...serializeHeader(header), lines: lines.map(serializeLine) };
}

function parseParam(schema: any, params: unknown): string | null {
  const parsed = schema.safeParse(params);
  return parsed.success ? parsed.data.id : null;
}

function pgCode(error: any): string | undefined {
  return error?.code ?? error?.cause?.code;
}

function handleWriteError(error: any, res: Response): boolean {
  const code = pgCode(error);
  if (code === "23503") {
    res.status(400).json({ error: "Invalid purchase order: a referenced record does not exist" });
    return true;
  }
  if (code === "23505") {
    res.status(409).json({ error: "Purchase order values conflict with an existing record" });
    return true;
  }
  return false;
}

async function writeEvent(tx: any, aggregateId: string, eventType: string, payload: Record<string, unknown>) {
  await tx.insert(outboxEventsTable).values({
    aggregateType: "purchase_order",
    aggregateId,
    eventType,
    payload,
  });
}

async function updateTotal(tx: any, purchaseOrderId: string): Promise<void> {
  const [total] = await tx
    .select({
      value: sql<string>`COALESCE(SUM(${purchaseOrderLinesTable.orderedQty} * COALESCE(${purchaseOrderLinesTable.unitPrice}, 0)), 0)`,
    })
    .from(purchaseOrderLinesTable)
    .where(eq(purchaseOrderLinesTable.purchaseOrderId, purchaseOrderId));
  await tx
    .update(purchaseOrdersTable)
    .set({ totalAmount: total?.value ?? "0", updatedAt: new Date() })
    .where(eq(purchaseOrdersTable.id, purchaseOrderId));
}

async function materialMap(tx: any, ids: string[]): Promise<Map<string, { uom: any }>> {
  const rows = await tx
    .select({ id: materialsTable.id, uom: materialsTable.uom })
    .from(materialsTable)
    .where(inArray(materialsTable.id, ids));
  return new Map(rows.map((row: { id: string; uom: any }) => [row.id, row]));
}

// List purchase orders (read access is supplied by the router-level policy).
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const parsed = ListPurchaseOrdersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.issues }, "Invalid purchase order list query");
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const query = parsed.data;
  const page = Math.max(1, query.page);
  const pageSize = Math.max(1, Math.min(100, query.pageSize));
  const conditions = [];
  if (query.status) conditions.push(eq(purchaseOrdersTable.status, query.status));
  if (query.supplier_id) conditions.push(eq(purchaseOrdersTable.supplierId, query.supplier_id));
  if (query.search) {
    conditions.push(
      or(
        ilike(purchaseOrdersTable.poNumber, `%${query.search}%`),
        ilike(suppliersTable.code, `%${query.search}%`),
        ilike(suppliersTable.name, `%${query.search}%`),
      ),
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const [totalResult] = await db
    .select({ count: count() })
    .from(purchaseOrdersTable)
    .leftJoin(suppliersTable, eq(suppliersTable.id, purchaseOrdersTable.supplierId))
    .where(where);
  const rows = await db
    .select({
      id: purchaseOrdersTable.id,
      poNumber: purchaseOrdersTable.poNumber,
      supplierId: purchaseOrdersTable.supplierId,
      supplierCode: suppliersTable.code,
      supplierName: suppliersTable.name,
      status: purchaseOrdersTable.status,
      orderedDate: purchaseOrdersTable.orderedDate,
      requiredDate: purchaseOrdersTable.requiredDate,
      approvedBy: purchaseOrdersTable.approvedBy,
      approvedAt: purchaseOrdersTable.approvedAt,
      currency: purchaseOrdersTable.currency,
      totalAmount: purchaseOrdersTable.totalAmount,
      terms: purchaseOrdersTable.terms,
      notes: purchaseOrdersTable.notes,
      overReceiptTolerancePercent: purchaseOrdersTable.overReceiptTolerancePercent,
      createdBy: purchaseOrdersTable.createdBy,
      createdAt: purchaseOrdersTable.createdAt,
      updatedAt: purchaseOrdersTable.updatedAt,
    })
    .from(purchaseOrdersTable)
    .leftJoin(suppliersTable, eq(suppliersTable.id, purchaseOrdersTable.supplierId))
    .where(where)
    .orderBy(desc(purchaseOrdersTable.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const total = Number(totalResult?.count ?? 0);
  res.json({
    items: rows.map(serializeHeader),
    meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
  });
});

// Create a draft and its initial lines as one atomic mutation.
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const parsed = CreatePurchaseOrderBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.issues }, "Invalid purchase order input");
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const body = parsed.data;
  const actorId = req.user!.userId;
  try {
    const id = await db.transaction(async (tx) => {
      const [supplier] = await tx
        .select({ id: suppliersTable.id })
        .from(suppliersTable)
        .where(eq(suppliersTable.id, body.supplier_id))
        .limit(1);
      if (!supplier) throw Object.assign(new Error("Supplier not found"), { procurementStatus: 400 });
      const materials = await materialMap(tx, body.lines.map((line) => line.material_id));
      const missing = body.lines.filter((line) => !materials.has(line.material_id));
      if (missing.length) throw Object.assign(new Error("One or more materials were not found"), { procurementStatus: 400 });

      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('purchase_order_number'))`);
      const sequenceRows = await tx.execute<{ seq: string }>(sql`SELECT nextval('po_seq') AS seq`);
      const sequence = Number(sequenceRows.rows[0]?.seq);
      if (!Number.isFinite(sequence)) throw new Error("Unable to allocate purchase order number");
      const now = new Date();
      const date = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
      const poNumber = `PO-${date}-${String(sequence).padStart(4, "0")}`;
      const [header] = await tx
        .insert(purchaseOrdersTable)
        .values({
          poNumber,
          supplierId: body.supplier_id,
          orderedDate: body.ordered_date ?? null,
          requiredDate: body.required_date ?? null,
          currency: body.currency,
          terms: body.terms ?? null,
          notes: body.notes ?? null,
          overReceiptTolerancePercent: String(body.over_receipt_tolerance_percent),
          totalAmount: "0",
          createdBy: actorId,
        })
        .returning({ id: purchaseOrdersTable.id });
      await tx.insert(purchaseOrderLinesTable).values(
        body.lines.map((line, index) => ({
          purchaseOrderId: header.id,
          lineNumber: index + 1,
          materialId: line.material_id,
          orderedQty: String(line.ordered_qty),
          openQty: String(line.ordered_qty),
          unitPrice: line.unit_price == null ? null : String(line.unit_price),
          uom: materials.get(line.material_id)!.uom,
          requiredDate: line.required_date ?? null,
          notes: line.notes ?? null,
        })),
      );
      await updateTotal(tx, header.id);
      await writeEvent(tx, header.id, "purchase_order.created", {
        actor_id: actorId,
        po_number: poNumber,
        line_count: body.lines.length,
      });
      return header.id;
    });
    req.log.info({ purchaseOrderId: id, actorId }, "Purchase order created");
    const detail = await readDetail(id);
    res.status(201).json(detail);
  } catch (error: any) {
    if (error?.procurementStatus) {
      res.status(error.procurementStatus).json({ error: error.message });
      return;
    }
    if (handleWriteError(error, res)) return;
    throw error;
  }
});

router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const id = parseParam(GetPurchaseOrderParams, req.params);
  if (!id) {
    res.status(400).json({ error: "Invalid purchase order id" });
    return;
  }
  const detail = await readDetail(id);
  if (!detail) {
    res.status(404).json({ error: "Purchase order not found" });
    return;
  }
  res.json(detail);
});

router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  const id = parseParam(UpdatePurchaseOrderParams, req.params);
  const parsed = UpdatePurchaseOrderBody.safeParse(req.body);
  if (!id || !parsed.success) {
    res.status(400).json({ error: !id ? "Invalid purchase order id" : "Invalid purchase order input" });
    return;
  }
  const body = parsed.data;
  try {
    await db.transaction(async (tx) => {
      const [order] = await tx.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id)).for("update").limit(1);
      if (!order) throw Object.assign(new Error("Purchase order not found"), { procurementStatus: 404 });
      if (order.status !== "draft") throw Object.assign(new Error("Only draft purchase orders can be edited"), { procurementStatus: 409 });
      if (body.supplier_id) {
        const [supplier] = await tx.select({ id: suppliersTable.id }).from(suppliersTable).where(eq(suppliersTable.id, body.supplier_id)).limit(1);
        if (!supplier) throw Object.assign(new Error("Supplier not found"), { procurementStatus: 400 });
      }
      await tx.update(purchaseOrdersTable).set({
        ...(body.supplier_id === undefined ? {} : { supplierId: body.supplier_id }),
        ...(body.ordered_date === undefined ? {} : { orderedDate: body.ordered_date }),
        ...(body.required_date === undefined ? {} : { requiredDate: body.required_date }),
        ...(body.currency === undefined ? {} : { currency: body.currency }),
        ...(body.terms === undefined ? {} : { terms: body.terms }),
        ...(body.notes === undefined ? {} : { notes: body.notes }),
        ...(body.over_receipt_tolerance_percent === undefined ? {} : { overReceiptTolerancePercent: String(body.over_receipt_tolerance_percent) }),
        updatedAt: new Date(),
      }).where(eq(purchaseOrdersTable.id, id));
      await writeEvent(tx, id, "purchase_order.updated", { actor_id: req.user!.userId });
    });
    req.log.info({ purchaseOrderId: id, actorId: req.user!.userId }, "Purchase order updated");
    res.json(await readDetail(id));
  } catch (error: any) {
    if (error?.procurementStatus) {
      res.status(error.procurementStatus).json({ error: error.message });
      return;
    }
    if (handleWriteError(error, res)) return;
    throw error;
  }
});

router.post("/:id/lines", async (req: Request, res: Response): Promise<void> => {
  const id = parseParam(AddPurchaseOrderLineParams, req.params);
  const parsed = AddPurchaseOrderLineBody.safeParse(req.body);
  if (!id || !parsed.success) {
    res.status(400).json({ error: !id ? "Invalid purchase order id" : "Invalid purchase order line input" });
    return;
  }
  try {
    await db.transaction(async (tx) => {
      const [order] = await tx.select({ id: purchaseOrdersTable.id, status: purchaseOrdersTable.status }).from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id)).for("update").limit(1);
      if (!order) throw Object.assign(new Error("Purchase order not found"), { procurementStatus: 404 });
      if (order.status !== "draft") throw Object.assign(new Error("Only draft purchase orders can be edited"), { procurementStatus: 409 });
      const materials = await materialMap(tx, [parsed.data.material_id]);
      const material = materials.get(parsed.data.material_id);
      if (!material) throw Object.assign(new Error("Material not found"), { procurementStatus: 400 });
      const [lineNumber] = await tx.select({ value: sql<number>`COALESCE(MAX(${purchaseOrderLinesTable.lineNumber}), 0) + 1` }).from(purchaseOrderLinesTable).where(eq(purchaseOrderLinesTable.purchaseOrderId, id));
      const [line] = await tx.insert(purchaseOrderLinesTable).values({
        purchaseOrderId: id,
        lineNumber: Number(lineNumber?.value ?? 1),
        materialId: parsed.data.material_id,
        orderedQty: String(parsed.data.ordered_qty),
        openQty: String(parsed.data.ordered_qty),
        unitPrice: parsed.data.unit_price == null ? null : String(parsed.data.unit_price),
        uom: material.uom,
        requiredDate: parsed.data.required_date ?? null,
        notes: parsed.data.notes ?? null,
      }).returning({ id: purchaseOrderLinesTable.id });
      await updateTotal(tx, id);
      await writeEvent(tx, id, "purchase_order.line_added", { actor_id: req.user!.userId, line_id: line.id });
    });
    req.log.info({ purchaseOrderId: id, actorId: req.user!.userId }, "Purchase order line added");
    res.json(await readDetail(id));
  } catch (error: any) {
    if (error?.procurementStatus) {
      res.status(error.procurementStatus).json({ error: error.message });
      return;
    }
    if (handleWriteError(error, res)) return;
    throw error;
  }
});

router.patch("/:id/lines/:lineId", async (req: Request, res: Response): Promise<void> => {
  const params = UpdatePurchaseOrderLineParams.safeParse(req.params);
  const parsed = UpdatePurchaseOrderLineBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: !params.success ? params.error.message : "Invalid purchase order line input" });
    return;
  }
  const { id, lineId } = params.data;
  try {
    await db.transaction(async (tx) => {
      const [order] = await tx.select({ id: purchaseOrdersTable.id, status: purchaseOrdersTable.status }).from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id)).for("update").limit(1);
      if (!order) throw Object.assign(new Error("Purchase order not found"), { procurementStatus: 404 });
      if (order.status !== "draft") throw Object.assign(new Error("Only draft purchase orders can be edited"), { procurementStatus: 409 });
      const [line] = await tx.select().from(purchaseOrderLinesTable).where(and(eq(purchaseOrderLinesTable.id, lineId), eq(purchaseOrderLinesTable.purchaseOrderId, id))).for("update").limit(1);
      if (!line) throw Object.assign(new Error("Purchase order line not found"), { procurementStatus: 404 });
      const materialId = parsed.data.material_id ?? line.materialId;
      const material = (await materialMap(tx, [materialId])).get(materialId);
      if (!material) throw Object.assign(new Error("Material not found"), { procurementStatus: 400 });
      await tx.update(purchaseOrderLinesTable).set({
        ...(parsed.data.material_id === undefined ? {} : { materialId: parsed.data.material_id }),
        ...(parsed.data.ordered_qty === undefined ? {} : { orderedQty: String(parsed.data.ordered_qty), openQty: String(parsed.data.ordered_qty) }),
        ...(parsed.data.unit_price === undefined ? {} : { unitPrice: parsed.data.unit_price == null ? null : String(parsed.data.unit_price) }),
        ...(parsed.data.required_date === undefined ? {} : { requiredDate: parsed.data.required_date }),
        ...(parsed.data.notes === undefined ? {} : { notes: parsed.data.notes }),
        uom: material.uom,
      }).where(eq(purchaseOrderLinesTable.id, lineId));
      await updateTotal(tx, id);
      await writeEvent(tx, id, "purchase_order.line_updated", { actor_id: req.user!.userId, line_id: lineId });
    });
    req.log.info({ purchaseOrderId: id, lineId, actorId: req.user!.userId }, "Purchase order line updated");
    res.json(await readDetail(id));
  } catch (error: any) {
    if (error?.procurementStatus) {
      res.status(error.procurementStatus).json({ error: error.message });
      return;
    }
    if (handleWriteError(error, res)) return;
    throw error;
  }
});

router.delete("/:id/lines/:lineId", async (req: Request, res: Response): Promise<void> => {
  const params = DeletePurchaseOrderLineParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { id, lineId } = params.data;
  try {
    await db.transaction(async (tx) => {
      const [order] = await tx.select({ id: purchaseOrdersTable.id, status: purchaseOrdersTable.status }).from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id)).for("update").limit(1);
      if (!order) throw Object.assign(new Error("Purchase order not found"), { procurementStatus: 404 });
      if (order.status !== "draft") throw Object.assign(new Error("Only draft purchase orders can be edited"), { procurementStatus: 409 });
      const deleted = await tx.delete(purchaseOrderLinesTable).where(and(eq(purchaseOrderLinesTable.id, lineId), eq(purchaseOrderLinesTable.purchaseOrderId, id))).returning({ id: purchaseOrderLinesTable.id });
      if (!deleted.length) throw Object.assign(new Error("Purchase order line not found"), { procurementStatus: 404 });
      await updateTotal(tx, id);
      await writeEvent(tx, id, "purchase_order.line_deleted", { actor_id: req.user!.userId, line_id: lineId });
    });
    req.log.info({ purchaseOrderId: id, lineId, actorId: req.user!.userId }, "Purchase order line deleted");
    res.json(await readDetail(id));
  } catch (error: any) {
    if (error?.procurementStatus) {
      res.status(error.procurementStatus).json({ error: error.message });
      return;
    }
    if (handleWriteError(error, res)) return;
    throw error;
  }
});

async function transition(
  req: Request,
  res: Response,
  id: string,
  action: "submit" | "approve" | "cancel",
  reason?: string,
): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      const [order] = await tx.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id)).for("update").limit(1);
      if (!order) throw Object.assign(new Error("Purchase order not found"), { procurementStatus: 404 });
      if (action === "submit") {
        if (order.status !== "draft") throw Object.assign(new Error(`Purchase order cannot be submitted from status '${order.status}'`), { procurementStatus: 409 });
        const [lineCount] = await tx.select({ value: count() }).from(purchaseOrderLinesTable).where(and(eq(purchaseOrderLinesTable.purchaseOrderId, id), sql`${purchaseOrderLinesTable.orderedQty} > 0`));
        if (Number(lineCount?.value ?? 0) < 1) throw Object.assign(new Error("Purchase order must contain at least one positive-quantity line"), { procurementStatus: 409 });
        await tx.update(purchaseOrdersTable).set({ status: "submitted", updatedAt: new Date() }).where(eq(purchaseOrdersTable.id, id));
      } else if (action === "approve") {
        if (order.status !== "submitted") throw Object.assign(new Error(`Purchase order cannot be approved from status '${order.status}'`), { procurementStatus: 409 });
        await tx.update(purchaseOrdersTable).set({ status: "approved", approvedBy: req.user!.userId, approvedAt: new Date(), updatedAt: new Date() }).where(eq(purchaseOrdersTable.id, id));
      } else {
        if (order.status === "cancelled" || order.status === "fully_received") {
          throw Object.assign(new Error(`Purchase order cannot be cancelled from status '${order.status}'`), { procurementStatus: 409 });
        }
        await tx.update(purchaseOrdersTable).set({ status: "cancelled", updatedAt: new Date() }).where(eq(purchaseOrdersTable.id, id));
      }
      const eventType =
        action === "submit"
          ? "purchase_order.submitted"
          : action === "approve"
            ? "purchase_order.approved"
            : "purchase_order.cancelled";
      await writeEvent(tx, id, eventType, {
        actor_id: req.user!.userId,
        ...(reason ? { reason } : {}),
        from_status: order.status,
        to_status: action === "submit" ? "submitted" : action === "approve" ? "approved" : "cancelled",
      });
    });
    req.log.info({ purchaseOrderId: id, actorId: req.user!.userId, action }, "Purchase order lifecycle transition");
    res.json(await readDetail(id));
  } catch (error: any) {
    if (error?.procurementStatus) {
      res.status(error.procurementStatus).json({ error: error.message });
      return;
    }
    if (handleWriteError(error, res)) return;
    throw error;
  }
}

router.post("/:id/submit", async (req: Request, res: Response): Promise<void> => {
  const id = parseParam(SubmitPurchaseOrderParams, req.params);
  if (!id) {
    res.status(400).json({ error: "Invalid purchase order id" });
    return;
  }
  await transition(req, res, id, "submit");
});

router.post("/:id/approve", requireRole("director"), async (req: Request, res: Response): Promise<void> => {
  const id = parseParam(SubmitPurchaseOrderParams, req.params);
  if (!id) {
    res.status(400).json({ error: "Invalid purchase order id" });
    return;
  }
  await transition(req, res, id, "approve");
});

router.post("/:id/cancel", requireRole("director"), async (req: Request, res: Response): Promise<void> => {
  const id = parseParam(CancelPurchaseOrderParams, req.params);
  const parsed = CancelPurchaseOrderBody.safeParse(req.body);
  if (!id || !parsed.success) {
    res.status(400).json({ error: !id ? "Invalid purchase order id" : "Invalid cancellation input" });
    return;
  }
  await transition(req, res, id, "cancel", parsed.data.reason);
});

export default router;