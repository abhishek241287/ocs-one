import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, count, desc, asc, sql } from "drizzle-orm";
import {
  db,
  pool,
  grnHeadersTable,
  grnLineItemsTable,
  incomingInspectionsTable,
  incomingInspectionLinesTable,
} from "@workspace/db";
import { CreateInspectionBody } from "@workspace/api-zod";
import { requireWriteRole } from "../../middleware/auth";
import { recordSecurityEvent, reqMeta } from "../../lib/security-events";
import { recordInspection } from "../../lib/incoming-inspection";

const router: IRouter = Router();

// Inspection writes (create + finalise) are supervisor+director; reads (list / detail /
// eligible) pass for any authed user — same policy as the rest of the inventory factory.
router.use(requireWriteRole("supervisor", "director"));

// ─── serialization helpers ───────────────────────────────────────────────────
function numify(v: unknown): unknown {
  return typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
}

function serializeHeader(h: Record<string, any>) {
  return {
    id: h.id,
    inspection_number: h.inspectionNumber,
    grn_id: h.grnId,
    grn_number: h.grnNumber ?? null,
    remarks: h.remarks,
    inspected_by: h.inspectedBy,
    created_at: h.createdAt,
  };
}

function serializeLine(l: Record<string, any>) {
  return {
    id: l.id,
    inspection_id: l.inspectionId,
    grn_line_id: l.grnLineId,
    grn_id: l.grnId,
    material_id: l.materialId,
    quantity_received: numify(l.quantityReceived),
    accepted_qty: numify(l.acceptedQty),
    rejected_qty: numify(l.rejectedQty),
    result: l.result,
    rejection_reason: l.rejectionReason,
    inspection_event_number: l.inspectionEventNumber,
    created_at: l.createdAt,
  };
}

async function readDetail(inspectionId: string) {
  const [header] = await db
    .select({
      id: incomingInspectionsTable.id,
      inspectionNumber: incomingInspectionsTable.inspectionNumber,
      grnId: incomingInspectionsTable.grnId,
      grnNumber: grnHeadersTable.grnNumber,
      remarks: incomingInspectionsTable.remarks,
      inspectedBy: incomingInspectionsTable.inspectedBy,
      createdAt: incomingInspectionsTable.createdAt,
    })
    .from(incomingInspectionsTable)
    .innerJoin(grnHeadersTable, eq(grnHeadersTable.id, incomingInspectionsTable.grnId))
    .where(eq(incomingInspectionsTable.id, inspectionId))
    .limit(1);
  if (!header) return null;
  const lines = await db
    .select()
    .from(incomingInspectionLinesTable)
    .where(eq(incomingInspectionLinesTable.inspectionId, inspectionId))
    .orderBy(asc(incomingInspectionLinesTable.createdAt));
  return { ...serializeHeader(header), lines: lines.map(serializeLine) };
}

// ─── List ────────────────────────────────────────────────────────────────────
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const query = req.query as any;
  const page = parseInt(query.page || "1", 10);
  const pageSize = parseInt(query.pageSize || "25", 10);
  const offset = (page - 1) * pageSize;

  const [totalResult] = await db.select({ count: count() }).from(incomingInspectionsTable);
  const items = await db
    .select({
      id: incomingInspectionsTable.id,
      inspectionNumber: incomingInspectionsTable.inspectionNumber,
      grnId: incomingInspectionsTable.grnId,
      grnNumber: grnHeadersTable.grnNumber,
      remarks: incomingInspectionsTable.remarks,
      inspectedBy: incomingInspectionsTable.inspectedBy,
      createdAt: incomingInspectionsTable.createdAt,
    })
    .from(incomingInspectionsTable)
    .innerJoin(grnHeadersTable, eq(grnHeadersTable.id, incomingInspectionsTable.grnId))
    .limit(pageSize)
    .offset(offset)
    .orderBy(desc(incomingInspectionsTable.createdAt));

  const total = Number(totalResult?.count ?? 0);
  res.json({
    items: items.map(serializeHeader),
    meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
  });
});

// ─── Eligible GRNs (registered BEFORE /:id so the literal path wins) ──────────
// A GRN is eligible when it is posted and has at least one line still pending.
router.get("/eligible", async (_req: Request, res: Response): Promise<void> => {
  const rows = await db
    .select({
      grn_id: grnHeadersTable.id,
      grn_number: grnHeadersTable.grnNumber,
      supplier_id: grnHeadersTable.supplierId,
      received_date: grnHeadersTable.receivedDate,
      pending_line_count: count(grnLineItemsTable.id),
    })
    .from(grnHeadersTable)
    .innerJoin(
      grnLineItemsTable,
      and(
        eq(grnLineItemsTable.grnId, grnHeadersTable.id),
        eq(grnLineItemsTable.inspectionStatus, "pending"),
      ),
    )
    .where(
      and(
        eq(grnHeadersTable.status, "posted"),
      ),
    )
    .groupBy(
      grnHeadersTable.id,
      grnHeadersTable.grnNumber,
      grnHeadersTable.supplierId,
      grnHeadersTable.receivedDate,
    )
    .orderBy(desc(grnHeadersTable.receivedDate));

  res.json({
    items: rows.map((r) => ({
      grn_id: r.grn_id,
      grn_number: r.grn_number,
      supplier_id: r.supplier_id,
      received_date: r.received_date,
      pending_line_count: Number(r.pending_line_count),
    })),
  });
});

// ─── Create + finalise ───────────────────────────────────────────────────────
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateInspectionBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.issues }, "Invalid inspection input");
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const body = parsed.data;

  // Race-safe inspection number (INSP-YYYYMMDD-NNNN) from a dedicated Postgres sequence.
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const { rows } = await pool.query("SELECT nextval('incoming_inspection_seq') AS seq");
  const inspectionNumber = `INSP-${dateStr}-${String(rows[0].seq).padStart(4, "0")}`;
  const actorId = req.user?.userId ?? null;

  let result;
  try {
    result = await db.transaction((tx) =>
      recordInspection(
        tx,
        body.grn_id,
        inspectionNumber,
        actorId,
        body.lines.map((l) => ({
          grnLineId: l.grn_line_id,
          acceptedQty: l.accepted_qty,
          rejectedQty: l.rejected_qty,
          rejectionReason: l.rejection_reason ?? null,
        })),
      ),
    );
  } catch (err: any) {
    const pgCode = err?.code ?? err?.cause?.code;
    if (pgCode === "23505") {
      res.status(409).json({ error: "Inspection event already exists for this GRN line" });
      return;
    }
    if (pgCode === "23503") {
      res.status(400).json({ error: "Invalid inspection: a referenced record does not exist" });
      return;
    }
    throw err;
  }

  switch (result.status) {
    case "grn_not_found":
      res.status(404).json({ error: "GRN not found" });
      return;
    case "invalid_state":
      res.status(409).json({ error: `GRN cannot be inspected from status '${result.current}' (must be posted)` });
      return;
    case "no_pending_lines":
      res.status(409).json({ error: "GRN has no inspection-pending lines" });
      return;
    case "line_mismatch": {
      const parts: string[] = [];
      if (result.missing.length > 0) parts.push(`missing line(s): ${result.missing.join(", ")}`);
      if (result.unexpected.length > 0) parts.push(`unexpected line(s): ${result.unexpected.join(", ")}`);
      res.status(400).json({ error: `Invalid inspection lines — ${parts.join("; ")}` });
      return;
    }
    case "invalid_line":
      res.status(422).json({ error: `Line ${result.grnLineId}: ${result.reason}` });
      return;
    case "created":
      break;
  }

  void recordSecurityEvent({
    eventType: "inspection.completed",
    actorId,
    actorEmail: req.user?.email ?? null,
    actorRole: req.user?.role ?? null,
    ...reqMeta(req),
    statusCode: 201,
    detail: `Inspection ${result.inspectionNumber} completed for GRN ${body.grn_id} (${result.lineCount} line(s))`,
  });

  const detail = await readDetail(result.inspectionId);
  res.status(201).json(detail);
});

// ─── Detail ──────────────────────────────────────────────────────────────────
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const detail = await readDetail(req.params.id as string);
  if (!detail) {
    res.status(404).json({ error: "Inspection not found" });
    return;
  }
  res.json(detail);
});

export default router;
