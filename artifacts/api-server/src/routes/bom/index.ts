import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, or, ilike, count, desc, inArray, sql } from "drizzle-orm";
import {
  db,
  pool,
  bomHeadersTable,
  bomLinesTable,
  masterProductsTable,
  materialsTable,
} from "@workspace/db";
import { CreateBomBody, UpdateBomBody } from "@workspace/api-zod";
import { requireRole } from "../../middleware/auth";

const router: IRouter = Router();

// Postgres 23505 (unique_violation) can be wrapped by Drizzle on `err.cause`.
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}

// Drizzle `date()` columns accept 'YYYY-MM-DD' strings only; zod coerces the
// request field to a Date object, so normalise back to a date string (or null).
function toDateStr(d: Date | null | undefined): string | null {
  return d ? new Date(d).toISOString().split("T")[0] : null;
}

type BodyLine = {
  material_id: string;
  quantity_per: number;
  scrap_percent: number;
  is_critical_component: boolean;
  traceability_required: boolean;
  is_optional: boolean;
  position: number;
  notes?: string | null;
};

// Validate that every referenced material exists; return a code/name/uom map so
// the caller can snapshot the material UoM onto each line. Fail-fast: a missing
// material aborts the whole write (no silent-skip).
async function loadMaterials(
  materialIds: string[],
): Promise<
  | { ok: true; map: Map<string, { code: string | null; name: string | null; uom: string }> }
  | { ok: false; missing: string[] }
> {
  const unique = Array.from(new Set(materialIds));
  if (unique.length === 0) return { ok: false, missing: [] };
  const rows = await db
    .select({
      id: materialsTable.id,
      code: materialsTable.code,
      name: materialsTable.name,
      uom: materialsTable.uom,
    })
    .from(materialsTable)
    .where(inArray(materialsTable.id, unique));
  const map = new Map(rows.map((r) => [r.id, { code: r.code, name: r.name, uom: r.uom }]));
  const missing = unique.filter((id) => !map.has(id));
  if (missing.length > 0) return { ok: false, missing };
  return { ok: true, map };
}

// Enriched, contract-shaped (snake_case) BOM detail — header + ordered lines.
// Numeric columns (yield_percent, quantity_per, scrap_percent) are Postgres
// decimals returned as strings, converted to JS numbers explicitly (never a
// blanket numify — model_code / material_code may be all-digits and must stay
// strings).
async function bomDetailView(id: string) {
  const headerRows = await db
    .select({
      id: bomHeadersTable.id,
      bom_number: bomHeadersTable.bomNumber,
      model_id: bomHeadersTable.modelId,
      model_code: masterProductsTable.code,
      model_name: masterProductsTable.name,
      revision: bomHeadersTable.revision,
      status: bomHeadersTable.status,
      name: bomHeadersTable.name,
      yield_percent: bomHeadersTable.yieldPercent,
      effective_from: bomHeadersTable.effectiveFrom,
      effective_to: bomHeadersTable.effectiveTo,
      notes: bomHeadersTable.notes,
      created_by: bomHeadersTable.createdBy,
      approved_by: bomHeadersTable.approvedBy,
      approved_at: bomHeadersTable.approvedAt,
      created_at: bomHeadersTable.createdAt,
      updated_at: bomHeadersTable.updatedAt,
    })
    .from(bomHeadersTable)
    .leftJoin(masterProductsTable, eq(bomHeadersTable.modelId, masterProductsTable.id))
    .where(eq(bomHeadersTable.id, id))
    .limit(1);
  if (headerRows.length === 0) return null;
  const h = headerRows[0];

  const lineRows = await db
    .select({
      id: bomLinesTable.id,
      bom_id: bomLinesTable.bomId,
      material_id: bomLinesTable.materialId,
      material_code: materialsTable.code,
      material_name: materialsTable.name,
      position: bomLinesTable.position,
      quantity_per: bomLinesTable.quantityPer,
      uom: bomLinesTable.uom,
      scrap_percent: bomLinesTable.scrapPercent,
      is_critical_component: bomLinesTable.isCriticalComponent,
      traceability_required: bomLinesTable.traceabilityRequired,
      is_optional: bomLinesTable.isOptional,
      alternate_of_line_id: bomLinesTable.alternateOfLineId,
      notes: bomLinesTable.notes,
    })
    .from(bomLinesTable)
    .leftJoin(materialsTable, eq(bomLinesTable.materialId, materialsTable.id))
    .where(eq(bomLinesTable.bomId, id))
    .orderBy(bomLinesTable.position, bomLinesTable.id);

  const lines = lineRows.map((l) => ({
    ...l,
    quantity_per: Number(l.quantity_per),
    scrap_percent: Number(l.scrap_percent),
  }));

  return {
    ...h,
    yield_percent: Number(h.yield_percent),
    line_count: lines.length,
    lines,
  };
}

// Build the insert rows for a BOM's lines. `position` respects an explicit
// positive value, else falls back to array index so insertion order is stable.
function buildLineValues(
  bomId: string,
  lines: BodyLine[],
  materialMap: Map<string, { uom: string }>,
) {
  return lines.map((l, idx) => ({
    bomId,
    materialId: l.material_id,
    position: l.position && l.position > 0 ? l.position : idx,
    quantityPer: String(l.quantity_per),
    uom: materialMap.get(l.material_id)!.uom,
    scrapPercent: String(l.scrap_percent),
    isCriticalComponent: l.is_critical_component,
    traceabilityRequired: l.traceability_required,
    isOptional: l.is_optional,
    notes: l.notes ?? null,
  }));
}

// ─── GET /boms — list BOMs (search + filters + pagination) ────────────────────
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const modelId = typeof req.query.model_id === "string" ? req.query.model_id : "";
  const status = typeof req.query.status === "string" ? req.query.status : "";

  const conds = [];
  if (search) {
    conds.push(
      or(
        ilike(bomHeadersTable.bomNumber, `%${search}%`),
        ilike(bomHeadersTable.name, `%${search}%`),
        ilike(masterProductsTable.code, `%${search}%`),
        ilike(masterProductsTable.name, `%${search}%`),
      ),
    );
  }
  if (modelId) conds.push(eq(bomHeadersTable.modelId, modelId));
  if (status === "draft" || status === "approved" || status === "obsolete") {
    conds.push(eq(bomHeadersTable.status, status));
  }
  const filters = conds.length > 0 ? and(...conds) : undefined;

  const totalRows = await db
    .select({ n: count() })
    .from(bomHeadersTable)
    .leftJoin(masterProductsTable, eq(bomHeadersTable.modelId, masterProductsTable.id))
    .where(filters);
  const total = Number(totalRows[0]?.n ?? 0);

  const rows = await db
    .select({
      id: bomHeadersTable.id,
      bom_number: bomHeadersTable.bomNumber,
      model_id: bomHeadersTable.modelId,
      model_code: masterProductsTable.code,
      model_name: masterProductsTable.name,
      revision: bomHeadersTable.revision,
      status: bomHeadersTable.status,
      name: bomHeadersTable.name,
      yield_percent: bomHeadersTable.yieldPercent,
      effective_from: bomHeadersTable.effectiveFrom,
      effective_to: bomHeadersTable.effectiveTo,
      notes: bomHeadersTable.notes,
      created_by: bomHeadersTable.createdBy,
      approved_by: bomHeadersTable.approvedBy,
      approved_at: bomHeadersTable.approvedAt,
      created_at: bomHeadersTable.createdAt,
      updated_at: bomHeadersTable.updatedAt,
    })
    .from(bomHeadersTable)
    .leftJoin(masterProductsTable, eq(bomHeadersTable.modelId, masterProductsTable.id))
    .where(filters)
    .orderBy(desc(bomHeadersTable.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const ids = rows.map((r) => r.id);
  const countRows =
    ids.length > 0
      ? await db
          .select({ bomId: bomLinesTable.bomId, n: count() })
          .from(bomLinesTable)
          .where(inArray(bomLinesTable.bomId, ids))
          .groupBy(bomLinesTable.bomId)
      : [];
  const countMap = new Map(countRows.map((c) => [c.bomId, Number(c.n)]));

  const items = rows.map((r) => ({
    ...r,
    yield_percent: Number(r.yield_percent),
    line_count: countMap.get(r.id) ?? 0,
  }));

  res.json({ items, meta: { total, page, pageSize } });
});

// ─── GET /boms/:id — BOM detail (header + lines) ──────────────────────────────
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const view = await bomDetailView(req.params.id as string);
  if (!view) {
    res.status(404).json({ error: "BOM not found" });
    return;
  }
  res.json(view);
});

// ─── POST /boms — create a draft BOM (auto-assigns the next revision) ──────────
// The model + every referenced material must exist (fail-fast, no silent skip).
// The revision is server-assigned (max+1 for the model); a concurrent create for
// the same model that collides on UNIQUE(model_id, revision) surfaces as 409.
router.post(
  "/",
  requireRole("supervisor", "director"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = CreateBomBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const data = parsed.data;
    const lines = data.lines as BodyLine[];
    const actor = req.user?.email ?? "unknown";

    const model = await db
      .select({ id: masterProductsTable.id })
      .from(masterProductsTable)
      .where(eq(masterProductsTable.id, data.model_id))
      .limit(1);
    if (model.length === 0) {
      res.status(404).json({ error: "Model not found" });
      return;
    }

    const materials = await loadMaterials(lines.map((l) => l.material_id));
    if (!materials.ok) {
      res.status(404).json({ error: "One or more materials not found", missing: materials.missing });
      return;
    }

    let newId: string;
    try {
      newId = await db.transaction(async (tx) => {
        const maxRows = await tx
          .select({ m: sql<number>`coalesce(max(${bomHeadersTable.revision}), 0)` })
          .from(bomHeadersTable)
          .where(eq(bomHeadersTable.modelId, data.model_id));
        const revision = Number(maxRows[0]?.m ?? 0) + 1;

        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
        const seqRes = await pool.query("SELECT nextval('bom_seq') AS seq");
        const bomNumber = `BOM-${dateStr}-${String(seqRes.rows[0].seq).padStart(6, "0")}`;

        const inserted = await tx
          .insert(bomHeadersTable)
          .values({
            bomNumber,
            modelId: data.model_id,
            revision,
            status: "draft",
            name: data.name ?? null,
            yieldPercent: String(data.yield_percent),
            effectiveFrom: toDateStr(data.effective_from),
            effectiveTo: toDateStr(data.effective_to),
            notes: data.notes ?? null,
            createdBy: actor,
          })
          .returning({ id: bomHeadersTable.id });
        const bomId = inserted[0].id;

        await tx.insert(bomLinesTable).values(buildLineValues(bomId, lines, materials.map));
        return bomId;
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ error: "A BOM for this model at the next revision already exists — retry" });
        return;
      }
      throw err;
    }

    const view = await bomDetailView(newId);
    res.status(201).json(view);
  },
);

// ─── PUT /boms/:id — update a draft BOM (draft only; replaces header + lines) ──
router.put(
  "/:id",
  requireRole("supervisor", "director"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = UpdateBomBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const data = parsed.data;
    const lines = data.lines as BodyLine[];
    const id = req.params.id as string;

    const materials = await loadMaterials(lines.map((l) => l.material_id));
    if (!materials.ok) {
      res.status(404).json({ error: "One or more materials not found", missing: materials.missing });
      return;
    }

    const result = await db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: bomHeadersTable.id, status: bomHeadersTable.status })
        .from(bomHeadersTable)
        .where(eq(bomHeadersTable.id, id))
        .for("update")
        .limit(1);
      if (rows.length === 0) return { kind: "not_found" as const };
      if (rows[0].status !== "draft") return { kind: "not_draft" as const };

      await tx
        .update(bomHeadersTable)
        .set({
          name: data.name ?? null,
          yieldPercent: String(data.yield_percent),
          effectiveFrom: toDateStr(data.effective_from),
          effectiveTo: toDateStr(data.effective_to),
          notes: data.notes ?? null,
          updatedAt: new Date(),
        })
        .where(eq(bomHeadersTable.id, id));

      await tx.delete(bomLinesTable).where(eq(bomLinesTable.bomId, id));
      await tx.insert(bomLinesTable).values(buildLineValues(id, lines, materials.map));
      return { kind: "ok" as const };
    });

    if (result.kind === "not_found") {
      res.status(404).json({ error: "BOM not found" });
      return;
    }
    if (result.kind === "not_draft") {
      res.status(422).json({ error: "Only draft BOMs can be edited" });
      return;
    }

    const view = await bomDetailView(id);
    res.json(view);
  },
);

// ─── DELETE /boms/:id — delete a draft BOM (draft only; lines cascade) ─────────
router.delete(
  "/:id",
  requireRole("supervisor", "director"),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const result = await db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: bomHeadersTable.id, status: bomHeadersTable.status })
        .from(bomHeadersTable)
        .where(eq(bomHeadersTable.id, id))
        .for("update")
        .limit(1);
      if (rows.length === 0) return { kind: "not_found" as const };
      if (rows[0].status !== "draft") return { kind: "not_draft" as const };
      await tx.delete(bomHeadersTable).where(eq(bomHeadersTable.id, id));
      return { kind: "ok" as const };
    });

    if (result.kind === "not_found") {
      res.status(404).json({ error: "BOM not found" });
      return;
    }
    if (result.kind === "not_draft") {
      res.status(422).json({ error: "Only draft BOMs can be deleted" });
      return;
    }
    res.status(204).send();
  },
);

// ─── POST /boms/:id/approve — draft → approved (records approver + timestamp) ──
router.post(
  "/:id/approve",
  requireRole("supervisor", "director"),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const actor = req.user?.email ?? "unknown";

    const result = await db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: bomHeadersTable.id, status: bomHeadersTable.status })
        .from(bomHeadersTable)
        .where(eq(bomHeadersTable.id, id))
        .for("update")
        .limit(1);
      if (rows.length === 0) return { kind: "not_found" as const };
      if (rows[0].status !== "draft") return { kind: "not_draft" as const };
      await tx
        .update(bomHeadersTable)
        .set({ status: "approved", approvedBy: actor, approvedAt: new Date(), updatedAt: new Date() })
        .where(eq(bomHeadersTable.id, id));
      return { kind: "ok" as const };
    });

    if (result.kind === "not_found") {
      res.status(404).json({ error: "BOM not found" });
      return;
    }
    if (result.kind === "not_draft") {
      res.status(422).json({ error: "Only draft BOMs can be approved" });
      return;
    }

    const view = await bomDetailView(id);
    res.json(view);
  },
);

// ─── POST /boms/:id/obsolete — approved → obsolete ────────────────────────────
router.post(
  "/:id/obsolete",
  requireRole("supervisor", "director"),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;

    const result = await db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: bomHeadersTable.id, status: bomHeadersTable.status })
        .from(bomHeadersTable)
        .where(eq(bomHeadersTable.id, id))
        .for("update")
        .limit(1);
      if (rows.length === 0) return { kind: "not_found" as const };
      if (rows[0].status !== "approved") return { kind: "not_approved" as const };
      await tx
        .update(bomHeadersTable)
        .set({ status: "obsolete", updatedAt: new Date() })
        .where(eq(bomHeadersTable.id, id));
      return { kind: "ok" as const };
    });

    if (result.kind === "not_found") {
      res.status(404).json({ error: "BOM not found" });
      return;
    }
    if (result.kind === "not_approved") {
      res.status(422).json({ error: "Only approved BOMs can be made obsolete" });
      return;
    }

    const view = await bomDetailView(id);
    res.json(view);
  },
);

export default router;
