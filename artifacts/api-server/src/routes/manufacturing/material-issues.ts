import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc, count, sql } from "drizzle-orm";
import {
  db,
  pool,
  materialIssueNotesTable,
  materialIssueNoteLinesTable,
  materialIssueReversalsTable,
  materialsTable,
  bomHeadersTable,
  mfgProductionOrdersTable,
} from "@workspace/db";
import { IssueMaterialsBody, ReverseMaterialIssueBody } from "@workspace/api-zod";
import { requireWriteRole } from "../../middleware/auth";
import {
  resolveApprovedBomRequirements,
  getAvailableByMaterial,
  suggestFifoLots,
  findActiveMinForSource,
  issueMaterials,
  reverseMaterialIssue,
} from "../../lib/material-issue";

// Sub-router mounted at /manufacturing/orders/:id/material-issues (mergeParams).
// Reads pass for any authed user; writes (issue/reverse) are gated to supervisor/
// director via requireWriteRole mounted at the router level.
const router: IRouter = Router({ mergeParams: true });

router.use(requireWriteRole("supervisor", "director"));

function num(v: unknown): number {
  return Number(v ?? 0);
}

// Snake_case MIN detail projection (header + lines + derived reversal state).
async function minDetailView(minId: string) {
  const [h] = await db
    .select({
      id: materialIssueNotesTable.id,
      min_number: materialIssueNotesTable.minNumber,
      source_type: materialIssueNotesTable.sourceType,
      source_ref_id: materialIssueNotesTable.sourceRefId,
      bom_header_id: materialIssueNotesTable.bomHeaderId,
      bom_number: bomHeadersTable.bomNumber,
      bom_revision: materialIssueNotesTable.bomRevision,
      status: materialIssueNotesTable.status,
      issued_by: materialIssueNotesTable.issuedBy,
      notes: materialIssueNotesTable.notes,
      created_at: materialIssueNotesTable.createdAt,
    })
    .from(materialIssueNotesTable)
    .leftJoin(bomHeadersTable, eq(bomHeadersTable.id, materialIssueNotesTable.bomHeaderId))
    .where(eq(materialIssueNotesTable.id, minId))
    .limit(1);
  if (!h) return null;

  const lineRows = await db
    .select({
      id: materialIssueNoteLinesTable.id,
      line_number: materialIssueNoteLinesTable.lineNumber,
      material_id: materialIssueNoteLinesTable.materialId,
      material_code: materialsTable.code,
      material_name: materialsTable.name,
      source_bom_line_id: materialIssueNoteLinesTable.sourceBomLineId,
      required_qty: materialIssueNoteLinesTable.requiredQty,
      issued_qty: materialIssueNoteLinesTable.issuedQty,
      uom: materialIssueNoteLinesTable.uom,
      grn_id: materialIssueNoteLinesTable.grnId,
      grn_line_id: materialIssueNoteLinesTable.grnLineId,
      supplier_lot_number: materialIssueNoteLinesTable.supplierLotNumber,
      is_critical_component: materialIssueNoteLinesTable.isCriticalComponent,
      traceability_required: materialIssueNoteLinesTable.traceabilityRequired,
    })
    .from(materialIssueNoteLinesTable)
    .leftJoin(materialsTable, eq(materialsTable.id, materialIssueNoteLinesTable.materialId))
    .where(eq(materialIssueNoteLinesTable.minId, minId))
    .orderBy(materialIssueNoteLinesTable.lineNumber);

  const [rev] = await db
    .select({
      reason: materialIssueReversalsTable.reason,
      reversed_by: materialIssueReversalsTable.reversedBy,
      reversed_at: materialIssueReversalsTable.createdAt,
    })
    .from(materialIssueReversalsTable)
    .where(eq(materialIssueReversalsTable.minId, minId))
    .limit(1);

  const lines = lineRows.map((l) => ({
    ...l,
    required_qty: num(l.required_qty),
    issued_qty: num(l.issued_qty),
  }));

  return {
    ...h,
    line_count: lines.length,
    is_reversed: !!rev,
    reversed_at: rev?.reversed_at ?? null,
    reversal: rev
      ? { reason: rev.reason, reversed_by: rev.reversed_by, reversed_at: rev.reversed_at }
      : null,
    lines,
  };
}

async function orderExists(id: string): Promise<{ modelId: string | null } | null> {
  const [row] = await db
    .select({ modelId: mfgProductionOrdersTable.productId })
    .from(mfgProductionOrdersTable)
    .where(eq(mfgProductionOrdersTable.id, id))
    .limit(1);
  return row ?? null;
}

// ─── GET .../preview — computed BOM requirements + availability + FIFO lots ────
router.get("/preview", async (req: Request, res: Response): Promise<void> => {
  const orderId = req.params.id as string;
  const order = await orderExists(orderId);
  if (!order) {
    res.status(404).json({ error: "Production order not found" });
    return;
  }

  const active = await findActiveMinForSource(db, "PRODUCTION_ORDER", orderId);
  const bom = order.modelId ? await resolveApprovedBomRequirements(db, order.modelId) : null;

  if (!bom) {
    res.json({
      production_order_id: orderId,
      bom_header_id: null,
      bom_number: null,
      bom_revision: null,
      has_approved_bom: false,
      has_active_min: !!active,
      active_min_id: active?.id ?? null,
      active_min_number: active?.minNumber ?? null,
      requirements: [],
    });
    return;
  }

  const materialIds = bom.requirements.map((r) => r.materialId);
  const avail = await getAvailableByMaterial(db, materialIds);
  const fifo = await suggestFifoLots(db, materialIds);

  res.json({
    production_order_id: orderId,
    bom_header_id: bom.bomHeaderId,
    bom_number: bom.bomNumber,
    bom_revision: bom.revision,
    has_approved_bom: true,
    has_active_min: !!active,
    active_min_id: active?.id ?? null,
    active_min_number: active?.minNumber ?? null,
    requirements: bom.requirements.map((r) => {
      const s = fifo.get(r.materialId);
      return {
        bom_line_id: r.bomLineId,
        material_id: r.materialId,
        material_code: r.materialCode,
        material_name: r.materialName,
        uom: r.uom,
        quantity_per: r.quantityPer,
        scrap_percent: r.scrapPercent,
        required_qty: r.requiredQty,
        is_critical_component: r.isCriticalComponent,
        traceability_required: r.traceabilityRequired,
        available_qty: avail.get(r.materialId) ?? 0,
        suggested_grn_id: s?.grnId ?? null,
        suggested_grn_line_id: s?.grnLineId ?? null,
        suggested_grn_number: s?.grnNumber ?? null,
        suggested_supplier_lot_number: s?.supplierLotNumber ?? null,
      };
    }),
  });
});

// ─── GET / — list MINs for the order ──────────────────────────────────────────
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const orderId = req.params.id as string;
  const order = await orderExists(orderId);
  if (!order) {
    res.status(404).json({ error: "Production order not found" });
    return;
  }
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));

  const totalRows = await db
    .select({ n: count() })
    .from(materialIssueNotesTable)
    .where(
      and(
        eq(materialIssueNotesTable.sourceType, "PRODUCTION_ORDER"),
        eq(materialIssueNotesTable.sourceRefId, orderId),
      ),
    );
  const total = Number(totalRows[0]?.n ?? 0);

  const rows = await db
    .select({
      id: materialIssueNotesTable.id,
      min_number: materialIssueNotesTable.minNumber,
      source_type: materialIssueNotesTable.sourceType,
      source_ref_id: materialIssueNotesTable.sourceRefId,
      bom_header_id: materialIssueNotesTable.bomHeaderId,
      bom_number: bomHeadersTable.bomNumber,
      bom_revision: materialIssueNotesTable.bomRevision,
      status: materialIssueNotesTable.status,
      issued_by: materialIssueNotesTable.issuedBy,
      created_at: materialIssueNotesTable.createdAt,
      line_count: sql<number>`(select count(*) from ${materialIssueNoteLinesTable} l where l.min_id = ${materialIssueNotesTable.id})`,
      reversed_at: sql<
        string | null
      >`(select r.created_at from ${materialIssueReversalsTable} r where r.min_id = ${materialIssueNotesTable.id} limit 1)`,
    })
    .from(materialIssueNotesTable)
    .leftJoin(bomHeadersTable, eq(bomHeadersTable.id, materialIssueNotesTable.bomHeaderId))
    .where(
      and(
        eq(materialIssueNotesTable.sourceType, "PRODUCTION_ORDER"),
        eq(materialIssueNotesTable.sourceRefId, orderId),
      ),
    )
    .orderBy(desc(materialIssueNotesTable.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const items = rows.map((r) => ({
    ...r,
    line_count: Number(r.line_count),
    is_reversed: r.reversed_at != null,
  }));

  res.json({ items, meta: { total, page, pageSize } });
});

// ─── POST / — issue BOM-driven materials (supervisor/director; atomic) ─────────
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const orderId = req.params.id as string;
  const parsed = IssueMaterialsBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const actorId = req.user?.userId ?? null;

  let minId: string;
  try {
    const result = await db.transaction(async (tx) => {
      // Lock the order row FOR UPDATE — TOCTOU-safe double-issue guard.
      const [order] = await tx
        .select({ id: mfgProductionOrdersTable.id, modelId: mfgProductionOrdersTable.productId })
        .from(mfgProductionOrdersTable)
        .where(eq(mfgProductionOrdersTable.id, orderId))
        .for("update")
        .limit(1);
      if (!order) return { kind: "order_not_found" as const };
      if (!order.modelId) return { kind: "no_bom" as const };

      // System-generated MIN number (never client-supplied).
      const now = new Date();
      const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
      const seqRes = await pool.query("SELECT nextval('material_issue_seq') AS seq");
      const minNumber = `MIN-${dateStr}-${String(seqRes.rows[0].seq).padStart(6, "0")}`;

      const outcome = await issueMaterials({
        tx,
        productionOrderId: orderId,
        modelId: order.modelId,
        minNumber,
        actorId,
        actorLabel: req.user?.email ?? req.user?.name ?? "system",
        notes: parsed.data.notes ?? null,
        confirmations: (parsed.data.lines ?? []).map((l) => ({
          sourceBomLineId: l.source_bom_line_id,
          issuedQty: l.issued_qty,
          grnId: l.grn_id,
          grnLineId: l.grn_line_id,
          supplierLotNumber: l.supplier_lot_number,
        })),
      });
      return { kind: "issue" as const, outcome };
    });

    if (result.kind === "order_not_found") {
      res.status(404).json({ error: "Production order not found" });
      return;
    }
    if (result.kind === "no_bom") {
      res.status(404).json({ error: "No approved BOM for this order's model" });
      return;
    }
    const o = result.outcome;
    switch (o.status) {
      case "no_bom":
        res.status(404).json({ error: "No approved BOM for this order's model" });
        return;
      case "no_requirements":
        res
          .status(404)
          .json({ error: "Approved BOM has no non-cell material requirements to issue" });
        return;
      case "already_issued":
        res
          .status(409)
          .json({ error: `Materials already issued for this order (${o.minNumber})` });
        return;
      case "insufficient":
        res.status(422).json({ error: "Insufficient stock", shortfalls: o.shortfalls });
        return;
      case "missing_traceability":
        res
          .status(422)
          .json({ error: "Missing mandatory traceability reference", materials: o.materials });
        return;
      case "ok":
        minId = o.minId;
        break;
    }
  } catch (err) {
    throw err;
  }

  const view = await minDetailView(minId!);
  res.status(201).json(view);
});

// ─── GET /:minId — MIN detail ─────────────────────────────────────────────────
router.get("/:minId", async (req: Request, res: Response): Promise<void> => {
  const orderId = req.params.id as string;
  const view = await minDetailView(req.params.minId as string);
  // Order-scoping: the MIN must belong to the order named in the route path.
  if (!view || view.source_type !== "PRODUCTION_ORDER" || view.source_ref_id !== orderId) {
    res.status(404).json({ error: "Material Issue Note not found" });
    return;
  }
  res.json(view);
});

// ─── POST /:minId/reverse — reverse a MIN (supervisor/director; mandatory reason)
router.post("/:minId/reverse", async (req: Request, res: Response): Promise<void> => {
  const minId = req.params.minId as string;
  const orderId = req.params.id as string;
  const parsed = ReverseMaterialIssueBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const actorId = req.user?.userId ?? null;
  const actorLabel = req.user?.email ?? req.user?.name ?? "system";

  const result = await db.transaction((tx) =>
    reverseMaterialIssue(tx, minId, parsed.data.reason, actorId, actorLabel, orderId),
  );

  if (result.status === "not_found") {
    res.status(404).json({ error: "Material Issue Note not found" });
    return;
  }
  if (result.status === "already_reversed") {
    res.status(409).json({ error: "Material Issue Note already reversed" });
    return;
  }

  const view = await minDetailView(minId);
  res.json(view);
});

export default router;
