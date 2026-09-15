import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, or, ilike, count, desc, asc } from "drizzle-orm";
import {
  db,
  pool,
  grnHeadersTable,
  grnLineItemsTable,
  materialsTable,
  inventoryTransactionsTable,
  purchaseOrdersTable,
  purchaseOrderLinesTable,
  inventoryLotsTable,
  warehousesTable,
  locationsTable,
  binsTable,
} from "@workspace/db";
import { CreateGrnBody, GrnLineCaptureValues } from "@workspace/api-zod";
import { requireWriteRole } from "../../middleware/auth";
import { recordSecurityEvent, reqMeta } from "../../lib/security-events";
import { postGrn } from "../../lib/grn-posting";
import { recordInspection } from "../../lib/incoming-inspection";
import {
  GrnCaptureError,
  type GrnLineCaptureProjection,
  insertGrnDraft,
  nextGrnNumber,
  readGrnLineCaptures,
  validateAndPersistGrnCapture,
} from "../../lib/universal-capture/grn-adapter";
import {
  resolveLinkedMaster,
  type LinkedMasterType,
  type LinkedMasterSummary,
} from "../../lib/linked-master";

// Derived, read-only provenance for a GRN line: who the material is, how it is used,
// and which component master it resolves to. The Material Master remains the single
// source of truth — this is joined at read time, never stored on the line.
interface LineEnrichment {
  material_name: string;
  material_code: string;
  usage_type: string | null;
  linked_master: LinkedMasterSummary | null;
}

const router: IRouter = Router();

// GRN writes (create / post / delete) are supervisor+director; reads (list / detail /
// transactions) pass for any authed user — same policy as the masters factory.
router.use(requireWriteRole("supervisor", "director"));

// ─── serialization helpers ───────────────────────────────────────────────────
function numify(v: unknown): unknown {
  return typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
}

function serializeHeader(h: Record<string, any>) {
  return {
    id: h.id,
    grn_number: h.grnNumber,
    supplier_id: h.supplierId,
    purchase_order_id: h.purchaseOrderId ?? null,
    invoice_number: h.invoiceNumber ?? null,
    received_date: h.receivedDate,
    status: h.status,
    remarks: h.remarks,
    posted_at: h.postedAt,
    posted_by: h.postedBy,
    created_by: h.createdBy,
    created_at: h.createdAt,
    updated_by: h.updatedBy,
    updated_at: h.updatedAt,
  };
}

function serializeLine(
  l: Record<string, any>,
  e?: LineEnrichment,
  capture?: GrnLineCaptureProjection,
) {
  return {
    id: l.id,
    grn_id: l.grnId,
    line_number: l.lineNumber,
    material_id: l.materialId,
    purchase_order_line_id: l.purchaseOrderLineId ?? null,
    material_name: e?.material_name ?? null,
    material_code: e?.material_code ?? null,
    usage_type: e?.usage_type ?? null,
    linked_master: e?.linked_master ?? null,
    quantity_received: numify(l.quantityReceived),
    uom: l.uom,
    supplier_lot_number: l.supplierLotNumber ?? null,
    lot_id: l.lotId ?? null,
    accepted_qty: numify(l.acceptedQty),
    rejected_qty: numify(l.rejectedQty),
    put_away_qty: numify(l.putAwayQty),
    receipt_unit_cost: numify(l.receiptUnitCost),
    receipt_currency: l.receiptCurrency ?? null,
    receipt_cost_status: l.receiptCostStatus,
    receipt_cost_source: l.receiptCostSource,
    inspection_status: l.inspectionStatus ?? null,
    remarks: l.remarks,
    created_at: l.createdAt,
    capture: capture ?? null,
  };
}

function serializeTransaction(t: Record<string, any>) {
  return {
    id: t.id,
    transaction_type: t.transactionType,
    material_id: t.materialId,
    quantity: numify(t.quantity),
    uom: t.uom,
    stock_state: t.stockState,
    source_document_type: t.sourceDocumentType,
    source_document_id: t.sourceDocumentId,
    source_line_id: t.sourceLineId,
    created_by: t.createdBy,
    created_at: t.createdAt,
  };
}

async function readDetail(grnId: string) {
  const [header] = await db
    .select()
    .from(grnHeadersTable)
    .where(eq(grnHeadersTable.id, grnId))
    .limit(1);
  if (!header) return null;
  const lines = await db
    .select()
    .from(grnLineItemsTable)
    .where(eq(grnLineItemsTable.grnId, grnId))
    .orderBy(asc(grnLineItemsTable.lineNumber));

  const enrichment = await buildLineEnrichment(lines.map((l) => l.materialId));
  const captures = await readGrnLineCaptures(lines.map((l) => l.id));
  return {
    ...serializeHeader(header),
    lines: lines.map((l) =>
      serializeLine(l, enrichment.get(l.materialId), captures.get(l.id)),
    ),
  };
}

// Resolve derived provenance for a set of material ids in one pass (one materials
// read + one component-master read per distinct linked type). Joined at read time so
// the Material Master stays the single source of truth — nothing is copied onto the line.
async function buildLineEnrichment(
  materialIds: string[],
): Promise<Map<string, LineEnrichment>> {
  const out = new Map<string, LineEnrichment>();
  const distinct = [...new Set(materialIds)];
  if (distinct.length === 0) return out;

  const materials = await db
    .select({
      id: materialsTable.id,
      code: materialsTable.code,
      name: materialsTable.name,
      usageType: materialsTable.usageType,
      linkedMasterType: materialsTable.linkedMasterType,
      linkedMasterId: materialsTable.linkedMasterId,
    })
    .from(materialsTable)
    .where(or(...distinct.map((id) => eq(materialsTable.id, id))));

  for (const m of materials) {
    let linked: LinkedMasterSummary | null = null;
    if (m.linkedMasterType && m.linkedMasterId) {
      linked = await resolveLinkedMaster(
        m.linkedMasterType as LinkedMasterType,
        m.linkedMasterId,
      );
    }
    out.set(m.id, {
      material_name: m.name,
      material_code: m.code,
      usage_type: m.usageType ?? null,
      linked_master: linked,
    });
  }
  return out;
}

// ─── List ────────────────────────────────────────────────────────────────────
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const query = req.query as any;
  const page = parseInt(query.page || "1", 10);
  const pageSize = parseInt(query.pageSize || "25", 10);
  const search = query.search as string | undefined;
  const status = query.status as "draft" | "posted" | undefined;
  const offset = (page - 1) * pageSize;

  const conditions = [];
  if (status) conditions.push(eq(grnHeadersTable.status, status));
  if (search) conditions.push(or(ilike(grnHeadersTable.grnNumber, `%${search}%`)));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalResult] = await db
    .select({ count: count() })
    .from(grnHeadersTable)
    .where(where);
  const items = await db
    .select()
    .from(grnHeadersTable)
    .where(where)
    .limit(pageSize)
    .offset(offset)
    .orderBy(desc(grnHeadersTable.createdAt));

  const total = Number(totalResult?.count ?? 0);
  res.json({
    items: items.map(serializeHeader),
    meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
  });
});

// ─── Create draft ──────────────────────────────────────────────────────────────
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateGrnBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.issues }, "Invalid GRN input");
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const body = parsed.data;
  const inputLines = body.lines as Array<{
    material_id: string;
    purchase_order_line_id?: string | null;
    quantity_received: number;
    supplier_lot_number?: string | null;
    remarks?: string | null;
    receipt_unit_cost?: number | null;
    receipt_currency?: string | null;
  }>;
  const rawAttributeValues = (req.body as Record<string, unknown> | null)?.attribute_values;
  const captureValuesParsed =
    rawAttributeValues === undefined
      ? { success: true as const, data: [] as Array<GrnLineCaptureValues> }
      : GrnLineCaptureValues.array().safeParse(rawAttributeValues);
  if (!captureValuesParsed.success) {
    res.status(400).json({ error: captureValuesParsed.error.message });
    return;
  }
  const attributeValues = captureValuesParsed.data;
  const captureLineNumbers = new Set<number>();
  for (const capture of attributeValues) {
    if (capture.line_number > body.lines.length) {
      res.status(400).json({
        error: `attribute_values line_number ${capture.line_number} does not reference a GRN line`,
      });
      return;
    }
    if (captureLineNumbers.has(capture.line_number)) {
      res.status(400).json({
        error: `attribute_values may contain only one entry for line ${capture.line_number}`,
      });
      return;
    }
    captureLineNumbers.add(capture.line_number);
  }

  if (body.purchase_order_id) {
    const duplicateLineIds = body.lines
      .map((line) => line.purchase_order_line_id)
      .filter((id): id is string => Boolean(id))
      .filter((id, index, all) => all.indexOf(id) !== index);
    if (duplicateLineIds.length > 0) {
      res.status(400).json({ error: "Each purchase-order line may appear only once on a GRN" });
      return;
    }

    const [po] = await db
      .select({
        id: purchaseOrdersTable.id,
        supplierId: purchaseOrdersTable.supplierId,
        status: purchaseOrdersTable.status,
      })
      .from(purchaseOrdersTable)
      .where(eq(purchaseOrdersTable.id, body.purchase_order_id))
      .limit(1);
    if (!po) {
      res.status(400).json({ error: "Purchase order not found" });
      return;
    }
    if (!["approved", "partially_received"].includes(po.status)) {
      res.status(409).json({ error: `Purchase order cannot receive from status '${po.status}'` });
      return;
    }
    if (po.supplierId !== body.supplier_id) {
      res.status(400).json({ error: "GRN supplier must match the purchase-order supplier" });
      return;
    }
    if (inputLines.some((line) => !line.purchase_order_line_id)) {
      res.status(400).json({ error: "Every line on a PO-linked GRN requires purchase_order_line_id" });
      return;
    }

    const linkedLines = await db
      .select({
        id: purchaseOrderLinesTable.id,
        materialId: purchaseOrderLinesTable.materialId,
      })
      .from(purchaseOrderLinesTable)
      .where(eq(purchaseOrderLinesTable.purchaseOrderId, po.id));
    const linkedById = new Map(linkedLines.map((line) => [line.id, line]));
    const mismatch = inputLines.find((line) => {
      const linked = linkedById.get(line.purchase_order_line_id!);
      return !linked || linked.materialId !== line.material_id;
    });
    if (mismatch) {
      res.status(400).json({
        error: "Each GRN material must match its referenced purchase-order line",
      });
      return;
    }
  } else if (inputLines.some((line) => line.purchase_order_line_id)) {
    res.status(400).json({
      error: "purchase_order_line_id requires a purchase_order_id on the GRN",
    });
    return;
  }

  const poPricing = new Map<
    string,
    { unitPrice: string | null; currency: string }
  >();
  if (body.purchase_order_id) {
    const poLines = await db
      .select({
        id: purchaseOrderLinesTable.id,
        unitPrice: purchaseOrderLinesTable.unitPrice,
      })
      .from(purchaseOrderLinesTable)
      .where(eq(purchaseOrderLinesTable.purchaseOrderId, body.purchase_order_id));
    const [po] = await db
      .select({ currency: purchaseOrdersTable.currency })
      .from(purchaseOrdersTable)
      .where(eq(purchaseOrdersTable.id, body.purchase_order_id))
      .limit(1);
    for (const line of poLines) {
      poPricing.set(line.id, {
        unitPrice: line.unitPrice == null ? null : String(line.unitPrice),
        currency: po?.currency ?? "INR",
      });
    }
  }

  const receiptCostByIndex = inputLines.map((line, index) => {
    const suppliedCost = line.receipt_unit_cost;
    const suppliedCurrency = line.receipt_currency;
    if (suppliedCost != null && (!Number.isFinite(suppliedCost) || suppliedCost <= 0)) {
      return { error: `lines[${index}].receipt_unit_cost must be greater than zero` } as const;
    }
    if (suppliedCost != null && suppliedCurrency == null) {
      return { error: `lines[${index}].receipt_currency is required with receipt_unit_cost` } as const;
    }
    if (suppliedCost == null && suppliedCurrency != null) {
      return { error: `lines[${index}].receipt_currency requires receipt_unit_cost` } as const;
    }
    if (suppliedCurrency != null && !/^[A-Z]{3}$/.test(suppliedCurrency)) {
      return { error: `lines[${index}].receipt_currency must be a three-letter uppercase currency code` } as const;
    }
    if (suppliedCost != null) {
      if (Math.round(suppliedCost * 10000) !== suppliedCost * 10000) {
        return { error: `lines[${index}].receipt_unit_cost supports at most four decimal places` } as const;
      }
      return {
        unitCost: suppliedCost,
        currency: suppliedCurrency!,
        status: "CAPTURED" as const,
        source: "MANUAL" as const,
      };
    }
    const poPrice = line.purchase_order_line_id
      ? poPricing.get(line.purchase_order_line_id)
      : undefined;
    if (poPrice?.unitPrice != null && Number(poPrice.unitPrice) > 0) {
      return {
        unitCost: Number(poPrice.unitPrice),
        currency: poPrice.currency,
        status: "CAPTURED" as const,
        source: "PO_DEFAULT" as const,
      };
    }
    return {
      unitCost: null,
      currency: null,
      status: "MISSING" as const,
      source: "NONE" as const,
    };
  });
  const invalidReceiptCost = receiptCostByIndex.find(
    (cost): cost is { error: string } => "error" in cost,
  );
  if (invalidReceiptCost) {
    res.status(400).json({ error: invalidReceiptCost.error });
    return;
  }

  // Snapshot each line's UOM from its Material at receipt time (a later Material UOM
  // change must not rewrite GRN history). A material id that does not resolve → 400.
  const materialIds = [...new Set(body.lines.map((l) => l.material_id))];
  const materials = await db
    .select({ id: materialsTable.id, uom: materialsTable.uom })
    .from(materialsTable)
    .where(or(...materialIds.map((id) => eq(materialsTable.id, id))));
  const uomById = new Map(materials.map((m) => [m.id, m.uom]));
  const missing = materialIds.filter((id) => !uomById.has(id));
  if (missing.length > 0) {
    res.status(400).json({ error: `Unknown material id(s): ${missing.join(", ")}` });
    return;
  }

  // Race-safe GRN number (GRN-YYYYMMDD-NNNN) from a dedicated Postgres sequence.
  const now = new Date();
  const grnNumber = await nextGrnNumber(now);
  const actorId = req.user?.userId ?? null;

  let createdId: string;
  try {
    createdId = await db.transaction(async (tx) => {
      const headerId = await insertGrnDraft(tx, {
        grnNumber,
        supplierId: body.supplier_id,
        purchaseOrderId: body.purchase_order_id ?? null,
        invoiceNumber: body.invoice_number ?? null,
        receivedDate: body.received_date,
        remarks: body.remarks ?? null,
        actorId,
        lines: inputLines.map((line, index) => ({
          materialId: line.material_id,
          quantityReceived: line.quantity_received,
          uom: uomById.get(line.material_id)!,
          purchaseOrderLineId: line.purchase_order_line_id ?? null,
          supplierLotNumber: line.supplier_lot_number ?? null,
          remarks: line.remarks ?? null,
          receiptUnitCost: receiptCostByIndex[index].unitCost,
          receiptCurrency: receiptCostByIndex[index].currency,
          receiptCostStatus: receiptCostByIndex[index].status,
          receiptCostSource: receiptCostByIndex[index].source,
        })),
      });

      if (attributeValues.length > 0) {
        const insertedLines = await tx
          .select({
            id: grnLineItemsTable.id,
            lineNumber: grnLineItemsTable.lineNumber,
            materialId: grnLineItemsTable.materialId,
          })
          .from(grnLineItemsTable)
          .where(eq(grnLineItemsTable.grnId, headerId));
        for (const capture of attributeValues) {
          const line = insertedLines.find((candidate) => candidate.lineNumber === capture.line_number);
          if (!line) throw new Error(`GRN line ${capture.line_number} was not inserted`);
          await validateAndPersistGrnCapture(tx, {
            lineId: line.id,
            materialId: line.materialId,
            attributes: capture.attributes,
            sourceType: "MANUAL",
            sourceRowRef: String(capture.line_number),
            createdBy: actorId,
            resolutionDate: now,
          });
        }
      }
      return headerId;
    });
  } catch (err: any) {
    if (err instanceof GrnCaptureError) {
      res.status(err.statusCode).json(err.payload);
      return;
    }
    const pgCode = err?.code ?? err?.cause?.code;
    if (pgCode === "23503") {
      res.status(400).json({ error: "Invalid GRN: a referenced record does not exist" });
      return;
    }
    if (pgCode === "23505") {
      res.status(409).json({ error: "GRN with these values already exists" });
      return;
    }
    throw err;
  }

  void recordSecurityEvent({
    eventType: "grn.created",
    actorId,
    actorEmail: req.user?.email ?? null,
    actorRole: req.user?.role ?? null,
    ...reqMeta(req),
    statusCode: 201,
     detail: `GRN ${grnNumber} created (draft, ${inputLines.length} line(s))`,
  });
  if (attributeValues.length > 0) {
    void recordSecurityEvent({
      eventType: "capture.grn_line.recorded",
      actorId,
      actorEmail: req.user?.email ?? null,
      actorRole: req.user?.role ?? null,
      ...reqMeta(req),
      statusCode: 201,
      detail: `Capture recorded for GRN ${createdId} (${attributeValues.length} line(s))`,
    });
  }

  const detail = await readDetail(createdId);
  res.status(201).json(detail);
});

// ─── Detail ──────────────────────────────────────────────────────────────────
// Convenience action endpoint for receiving screens. The canonical inspection
// document remains available at /inventory/inspections; this route accepts the same
// line payload while deriving grn_id from the URL.
router.post("/:id/inspect", async (req: Request, res: Response): Promise<void> => {
  const grnId = req.params.id as string;
  const body = req.body as {
    lines?: Array<{
      grn_line_id: string;
      accepted_qty: number;
      rejected_qty: number;
      rejection_reason?: string | null;
    }>;
  };
  if (!Array.isArray(body?.lines) || body.lines.length === 0) {
    res.status(400).json({ error: "lines must contain at least one inspection line" });
    return;
  }

  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const { rows } = await pool.query("SELECT nextval('incoming_inspection_seq') AS seq");
  const inspectionNumber = `INSP-${dateStr}-${String(rows[0].seq).padStart(4, "0")}`;

  const result = await db.transaction((tx) =>
    recordInspection(
      tx,
      grnId,
      inspectionNumber,
      req.user?.userId ?? null,
      body.lines!.map((line) => ({
        grnLineId: line.grn_line_id,
        acceptedQty: Number(line.accepted_qty),
        rejectedQty: Number(line.rejected_qty),
        rejectionReason: line.rejection_reason ?? null,
      })),
    ),
  );

  if (result.status === "grn_not_found") {
    res.status(404).json({ error: "GRN not found" });
    return;
  }
  if (result.status === "invalid_state") {
    res.status(409).json({ error: `GRN cannot be inspected from status '${result.current}'` });
    return;
  }
  if (result.status === "no_pending_lines") {
    res.status(409).json({ error: "GRN has no inspection-pending lines" });
    return;
  }
  if (result.status === "line_mismatch") {
    res.status(400).json({ error: "One or more inspection lines are not pending on this GRN" });
    return;
  }
  if (result.status === "invalid_line") {
    res.status(422).json({ error: `Line ${result.grnLineId}: ${result.reason}` });
    return;
  }

  void recordSecurityEvent({
    eventType: "inspection.completed",
    actorId: req.user?.userId ?? null,
    actorEmail: req.user?.email ?? null,
    actorRole: req.user?.role ?? null,
    ...reqMeta(req),
    statusCode: 201,
    detail: `Inspection ${result.inspectionNumber} completed for GRN ${grnId} (${result.lineCount} line(s))`,
  });
  const detail = await readDetail(grnId);
  res.status(201).json({ inspection_id: result.inspectionId, data: detail });
});

// Put-away changes the physical location projection only. It deliberately writes no
// inventory ledger rows: the accepted quantity is already available stock.
router.post("/:id/put-away", async (req: Request, res: Response): Promise<void> => {
  const grnId = req.params.id as string;
  const { grn_line_id: grnLineId, warehouse_id: warehouseId, location_id: locationId, bin_id: binId } =
    (req.body ?? {}) as Record<string, string | undefined>;
  const quantity = Number((req.body ?? {}).quantity);
  if (!grnLineId || !warehouseId || !Number.isFinite(quantity) || quantity <= 0) {
    res.status(400).json({ error: "grn_line_id, warehouse_id, and positive quantity are required" });
    return;
  }
  if (binId && !locationId) {
    res.status(422).json({ error: "bin_id requires location_id" });
    return;
  }

  const outcome = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        grnId: grnHeadersTable.id,
        grnStatus: grnHeadersTable.status,
        lineId: grnLineItemsTable.id,
        lotId: grnLineItemsTable.lotId,
        acceptedQty: grnLineItemsTable.acceptedQty,
        putAwayQty: grnLineItemsTable.putAwayQty,
      })
      .from(grnLineItemsTable)
      .innerJoin(grnHeadersTable, eq(grnHeadersTable.id, grnLineItemsTable.grnId))
      .where(and(eq(grnHeadersTable.id, grnId), eq(grnLineItemsTable.id, grnLineId)))
      .for("update")
      .limit(1);
    if (!row) return { status: "not_found" as const };
    if (row.grnStatus !== "posted") return { status: "not_posted" as const };
    if (!row.lotId) return { status: "no_lot" as const };

    const [warehouse] = await tx
      .select({ id: warehousesTable.id })
      .from(warehousesTable)
      .where(and(eq(warehousesTable.id, warehouseId), eq(warehousesTable.isActive, true)))
      .limit(1);
    if (!warehouse) return { status: "invalid_warehouse" as const };

    if (locationId) {
      const [location] = await tx
        .select({ id: locationsTable.id })
        .from(locationsTable)
        .where(
          and(
            eq(locationsTable.id, locationId),
            eq(locationsTable.warehouseId, warehouseId),
            eq(locationsTable.isActive, true),
          ),
        )
        .limit(1);
      if (!location) return { status: "invalid_location" as const };
    }
    if (binId) {
      const [bin] = await tx
        .select({ id: binsTable.id })
        .from(binsTable)
        .where(and(eq(binsTable.id, binId), eq(binsTable.locationId, locationId!)))
        .limit(1);
      if (!bin) return { status: "invalid_bin" as const };
    }

    const available = Number(row.acceptedQty) - Number(row.putAwayQty);
    if (quantity > available + 1e-9) {
      return { status: "exceeds_available" as const, available };
    }

    await tx
      .update(inventoryLotsTable)
      .set({ warehouseId, locationId: locationId ?? null, binId: binId ?? null })
      .where(eq(inventoryLotsTable.id, row.lotId));
    await tx
      .update(grnLineItemsTable)
      .set({ putAwayQty: String(Number(row.putAwayQty) + quantity) })
      .where(eq(grnLineItemsTable.id, grnLineId));
    return {
      status: "ok" as const,
      lotId: row.lotId,
      quantity,
      warehouseId,
      locationId: locationId ?? null,
      binId: binId ?? null,
    };
  });

  if (outcome.status === "not_found") {
    res.status(404).json({ error: "GRN line not found" });
    return;
  }
  if (outcome.status === "not_posted") {
    res.status(409).json({ error: "GRN must be posted before put-away" });
    return;
  }
  if (outcome.status === "no_lot") {
    res.status(409).json({ error: "GRN line has no internal lot" });
    return;
  }
  if (outcome.status === "invalid_warehouse") {
    res.status(422).json({ error: "Invalid or inactive warehouse" });
    return;
  }
  if (outcome.status === "invalid_location") {
    res.status(422).json({ error: "Invalid or inactive location for warehouse" });
    return;
  }
  if (outcome.status === "invalid_bin") {
    res.status(422).json({ error: "Invalid bin for location" });
    return;
  }
  if (outcome.status === "exceeds_available") {
    res.status(422).json({ error: `Put-away quantity exceeds available accepted quantity (${outcome.available})` });
    return;
  }

  res.json({
    data: {
      grn_id: grnId,
      grn_line_id: grnLineId,
      lot_id: outcome.lotId,
      quantity: outcome.quantity,
      warehouse_id: outcome.warehouseId,
      location_id: outcome.locationId,
      bin_id: outcome.binId,
    },
  });
});

router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const detail = await readDetail(req.params.id as string);
  if (!detail) {
    res.status(404).json({ error: "GRN not found" });
    return;
  }
  res.json(detail);
});

// ─── Transactions generated by this GRN ──────────────────────────────────────
router.get("/:id/transactions", async (req: Request, res: Response): Promise<void> => {
  const grnId = req.params.id as string;
  const [header] = await db
    .select({ id: grnHeadersTable.id })
    .from(grnHeadersTable)
    .where(eq(grnHeadersTable.id, grnId))
    .limit(1);
  if (!header) {
    res.status(404).json({ error: "GRN not found" });
    return;
  }
  const items = await db
    .select()
    .from(inventoryTransactionsTable)
    .where(eq(inventoryTransactionsTable.sourceDocumentId, grnId))
    .orderBy(asc(inventoryTransactionsTable.createdAt));
  res.json({ items: items.map(serializeTransaction) });
});

// ─── Post ────────────────────────────────────────────────────────────────────
router.post("/:id/post", async (req: Request, res: Response): Promise<void> => {
  const grnId = req.params.id as string;
  const actorId = req.user?.userId ?? null;

  const result = await db.transaction((tx) => postGrn(tx, grnId, actorId));

  if (result.status === "not_found") {
    res.status(404).json({ error: "GRN not found" });
    return;
  }
  if (result.status === "invalid_state") {
    res.status(409).json({ error: `GRN cannot be posted from status '${result.current}'` });
    return;
  }
  if (result.status === "no_lines") {
    res.status(409).json({ error: "GRN has no line items to post" });
    return;
  }
  if (result.status === "unassigned_category") {
    const list = result.materials.map((m) => `${m.name} (${m.code})`).join(", ");
    res.status(422).json({
      error:
        `Cannot post GRN: the following material(s) belong to a category with no assigned ` +
        `receiving workflow — assign a Material Workflow to each category first: ${list}`,
    });
    return;
  }
  if (result.status === "po_not_receivable") {
    res.status(409).json({
      error: `Purchase order cannot receive from status '${result.current}'`,
    });
    return;
  }
  if (result.status === "po_supplier_mismatch") {
    res.status(409).json({ error: "GRN supplier does not match the purchase order" });
    return;
  }
  if (result.status === "po_line_mismatch") {
    res.status(409).json({
      error: "GRN lines do not match their referenced purchase-order lines",
    });
    return;
  }
  if (result.status === "over_receipt") {
    res.status(422).json({
      error: "Over-receipt exceeds the purchase-order over-receipt tolerance",
      purchase_order_line_id: result.poLineId,
      ordered_qty: result.orderedQty,
      already_received_qty: result.receivedQty,
      attempted_qty: result.attemptedQty,
      tolerance_percent: result.tolerancePercent,
    });
    return;
  }

  void recordSecurityEvent({
    eventType: "grn.posted",
    actorId,
    actorEmail: req.user?.email ?? null,
    actorRole: req.user?.role ?? null,
    ...reqMeta(req),
    statusCode: 200,
    detail: `GRN ${grnId} posted (${result.lineCount} line(s), inventory transactions generated)`,
  });

  const detail = await readDetail(grnId);
  res.json(detail);
});

// ─── Delete draft ──────────────────────────────────────────────────────────────
router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  const grnId = req.params.id as string;
  // Guard inside a tx under FOR UPDATE: only a draft may be deleted; a posted GRN is
  // immutable (it owns committed inventory transactions). Lines cascade on delete.
  const outcome = await db.transaction(async (tx) => {
    const [grn] = await tx
      .select({ id: grnHeadersTable.id, status: grnHeadersTable.status })
      .from(grnHeadersTable)
      .where(eq(grnHeadersTable.id, grnId))
      .for("update")
      .limit(1);
    if (!grn) return "not_found" as const;
    if (grn.status !== "draft") return "not_draft" as const;
    await tx.delete(grnHeadersTable).where(eq(grnHeadersTable.id, grnId));
    return "deleted" as const;
  });

  if (outcome === "not_found") {
    res.status(404).json({ error: "GRN not found" });
    return;
  }
  if (outcome === "not_draft") {
    res.status(409).json({ error: "Only draft GRNs can be deleted" });
    return;
  }
  res.status(204).send();
});

export default router;
