import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, or, ilike, count, desc, asc } from "drizzle-orm";
import {
  db,
  pool,
  grnHeadersTable,
  grnLineItemsTable,
  materialsTable,
  inventoryTransactionsTable,
} from "@workspace/db";
import { CreateGrnBody } from "@workspace/api-zod";
import { requireWriteRole } from "../../middleware/auth";
import { recordSecurityEvent, reqMeta } from "../../lib/security-events";
import { postGrn } from "../../lib/grn-posting";

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

function serializeLine(l: Record<string, any>) {
  return {
    id: l.id,
    grn_id: l.grnId,
    line_number: l.lineNumber,
    material_id: l.materialId,
    quantity_received: numify(l.quantityReceived),
    uom: l.uom,
    inspection_status: l.inspectionStatus ?? null,
    remarks: l.remarks,
    created_at: l.createdAt,
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
  return { ...serializeHeader(header), lines: lines.map(serializeLine) };
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
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const { rows } = await pool.query("SELECT nextval('grn_seq') AS seq");
  const grnNumber = `GRN-${dateStr}-${String(rows[0].seq).padStart(4, "0")}`;
  const actorId = req.user?.userId ?? null;

  let createdId: string;
  try {
    createdId = await db.transaction(async (tx) => {
      const [header] = await tx
        .insert(grnHeadersTable)
        .values({
          grnNumber,
          supplierId: body.supplier_id,
          receivedDate: body.received_date,
          status: "draft",
          remarks: body.remarks ?? null,
          createdBy: actorId,
        })
        .returning({ id: grnHeadersTable.id });

      await tx.insert(grnLineItemsTable).values(
        body.lines.map((l, i) => ({
          grnId: header.id,
          lineNumber: i + 1,
          materialId: l.material_id,
          quantityReceived: String(l.quantity_received),
          uom: uomById.get(l.material_id)!,
          remarks: l.remarks ?? null,
        })),
      );
      return header.id;
    });
  } catch (err: any) {
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
    detail: `GRN ${grnNumber} created (draft, ${body.lines.length} line(s))`,
  });

  const detail = await readDetail(createdId);
  res.status(201).json(detail);
});

// ─── Detail ──────────────────────────────────────────────────────────────────
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
