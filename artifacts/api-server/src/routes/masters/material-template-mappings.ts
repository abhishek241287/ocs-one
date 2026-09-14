import { Router, type Request, type Response } from "express";
import { and, desc, eq, gt, ilike, inArray, isNull, lte, or } from "drizzle-orm";
import {
  CreateMappingBody,
  UpdateMappingBody,
} from "@workspace/api-zod";
import {
  attributeTemplateVersionsTable,
  attributeTemplatesTable,
  db,
  materialCategoriesTable,
  materialTemplateMappingsTable,
  materialsTable,
  outboxEventsTable,
} from "@workspace/db";
import { resolveTemplate } from "../../lib/universal-capture/resolve";
import { requireWriteRole } from "../../middleware/auth";
import { recordSecurityEvent, reqMeta } from "../../lib/security-events";

const router = Router();
router.use(requireWriteRole("director"));

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] ?? "" : value;
}

function serialize(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/([A-Z])/g, "_$1").toLowerCase(),
      typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)
        ? Number(value)
        : value,
    ]),
  );
}

function pgCode(error: any): string | undefined {
  return error?.code ?? error?.cause?.code;
}

function handleWriteError(error: any, res: Response, scope?: string): boolean {
  const code = pgCode(error);
  if (code === "23505") {
    res.status(409).json({
      error: "AMBIGUOUS_CONFIGURATION",
      details: { winning_scope: scope ?? null },
    });
    return true;
  }
  if (code === "23503") {
    res.status(400).json({ error: "Invalid mapping reference" });
    return true;
  }
  return false;
}

async function emit(
  tx: any,
  aggregateId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await tx.insert(outboxEventsTable).values({
    aggregateType: "material_template_mapping",
    aggregateId,
    eventType,
    payload,
  });
}

function audit(req: Request, eventType: string, statusCode: number, detail: string): void {
  void recordSecurityEvent({
    eventType,
    actorId: req.user?.userId ?? null,
    actorEmail: req.user?.email ?? null,
    actorRole: req.user?.role ?? null,
    ...reqMeta(req),
    statusCode,
    detail,
  });
}

async function mappingRows(): Promise<any[]> {
  return db
    .select({
      id: materialTemplateMappingsTable.id,
      scope: materialTemplateMappingsTable.scope,
      materialId: materialTemplateMappingsTable.materialId,
      materialCode: materialsTable.code,
      categoryId: materialTemplateMappingsTable.categoryId,
      categoryCode: materialCategoriesTable.code,
      templateId: materialTemplateMappingsTable.templateId,
      templateCode: attributeTemplatesTable.code,
      status: materialTemplateMappingsTable.status,
      effectiveFrom: materialTemplateMappingsTable.effectiveFrom,
      effectiveTo: materialTemplateMappingsTable.effectiveTo,
      createdBy: materialTemplateMappingsTable.createdBy,
      createdAt: materialTemplateMappingsTable.createdAt,
    })
    .from(materialTemplateMappingsTable)
    .leftJoin(materialsTable, eq(materialsTable.id, materialTemplateMappingsTable.materialId))
    .leftJoin(
      materialCategoriesTable,
      eq(materialCategoriesTable.id, materialTemplateMappingsTable.categoryId),
    )
    .leftJoin(
      attributeTemplatesTable,
      eq(attributeTemplatesTable.id, materialTemplateMappingsTable.templateId),
    )
    .orderBy(desc(materialTemplateMappingsTable.createdAt));
}

router.get("/", async (req: Request, res: Response): Promise<void> => {
  const scope = typeof req.query.scope === "string" ? req.query.scope : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const conditions = [
    scope ? eq(materialTemplateMappingsTable.scope, scope as any) : undefined,
    status ? eq(materialTemplateMappingsTable.status, status as any) : undefined,
    search
      ? or(
          ilike(materialsTable.code, `%${search}%`),
          ilike(materialCategoriesTable.code, `%${search}%`),
          ilike(attributeTemplatesTable.code, `%${search}%`),
        )
      : undefined,
  ].filter(Boolean) as any[];
  const rows = await db
    .select({
      id: materialTemplateMappingsTable.id,
      scope: materialTemplateMappingsTable.scope,
      materialId: materialTemplateMappingsTable.materialId,
      materialCode: materialsTable.code,
      categoryId: materialTemplateMappingsTable.categoryId,
      categoryCode: materialCategoriesTable.code,
      templateId: materialTemplateMappingsTable.templateId,
      templateCode: attributeTemplatesTable.code,
      status: materialTemplateMappingsTable.status,
      effectiveFrom: materialTemplateMappingsTable.effectiveFrom,
      effectiveTo: materialTemplateMappingsTable.effectiveTo,
      createdBy: materialTemplateMappingsTable.createdBy,
      createdAt: materialTemplateMappingsTable.createdAt,
    })
    .from(materialTemplateMappingsTable)
    .leftJoin(materialsTable, eq(materialsTable.id, materialTemplateMappingsTable.materialId))
    .leftJoin(
      materialCategoriesTable,
      eq(materialCategoriesTable.id, materialTemplateMappingsTable.categoryId),
    )
    .leftJoin(
      attributeTemplatesTable,
      eq(attributeTemplatesTable.id, materialTemplateMappingsTable.templateId),
    )
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(materialTemplateMappingsTable.createdAt));
  res.json({ items: rows.map((row) => serialize(row as Record<string, unknown>)) });
});

router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const rows = await mappingRows();
  const row = rows.find((candidate) => candidate.id === param(req.params.id));
  if (!row) {
    res.status(404).json({ error: "Material template mapping not found" });
    return;
  }
  res.json(serialize(row as Record<string, unknown>));
});

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateMappingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { scope, material_id: materialId, category_id: categoryId } = parsed.data;
  if (
    (scope === "MATERIAL" && (!materialId || categoryId)) ||
    (scope === "CATEGORY" && (!categoryId || materialId))
  ) {
    res.status(400).json({ error: "Mapping scope requires exactly one matching reference" });
    return;
  }
  const effectiveFrom = parsed.data.effective_from
    ? new Date(parsed.data.effective_from)
    : new Date();
  const effectiveTo = parsed.data.effective_to
    ? new Date(parsed.data.effective_to)
    : null;
  if (Number.isNaN(effectiveFrom.getTime()) || (effectiveTo && Number.isNaN(effectiveTo.getTime())) ||
      (effectiveTo && effectiveFrom >= effectiveTo)) {
    res.status(422).json({ error: "Invalid effective date range" });
    return;
  }
  try {
    const row = await db.transaction(async (tx) => {
      const [template] = await tx
        .select({ id: attributeTemplatesTable.id })
        .from(attributeTemplatesTable)
        .where(eq(attributeTemplatesTable.id, parsed.data.template_id));
      if (!template) return { row: null, error: "Template not found", status: 400 };
      if (materialId) {
        const [material] = await tx
          .select({ id: materialsTable.id })
          .from(materialsTable)
          .where(eq(materialsTable.id, materialId));
        if (!material) return { row: null, error: "Material not found", status: 400 };
      }
      if (categoryId) {
        const [category] = await tx
          .select({ id: materialCategoriesTable.id })
          .from(materialCategoriesTable)
          .where(eq(materialCategoriesTable.id, categoryId));
        if (!category) return { row: null, error: "Material category not found", status: 400 };
      }
      const [created] = await tx
        .insert(materialTemplateMappingsTable)
        .values({
          scope,
          materialId: materialId ?? null,
          categoryId: categoryId ?? null,
          templateId: parsed.data.template_id,
          effectiveFrom,
          effectiveTo,
          createdBy: req.user?.userId ?? null,
        })
        .returning();
      if (!created) throw new Error("Mapping insert returned no row");
      await emit(tx, created.id, "MAPPING_CREATED", {
        mapping: serialize(created as Record<string, unknown>),
      });
      return { row: created, error: null, status: 201 };
    });
    if (!row.row) {
      res.status(row.status).json({ error: row.error });
      return;
    }
    audit(req, "capture.mapping.created", 201, `Template mapping created: ${row.row.id}`);
    res.status(201).json(serialize(row.row as Record<string, unknown>));
  } catch (error) {
    if (handleWriteError(error, res, scope)) return;
    throw error;
  }
});

router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  const parsed = UpdateMappingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const row = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(materialTemplateMappingsTable)
        .where(eq(materialTemplateMappingsTable.id, param(req.params.id)))
        .for("update");
      if (!existing) return null;
      const [updated] = await tx
        .update(materialTemplateMappingsTable)
        .set({
          ...(parsed.data.status === undefined ? {} : { status: parsed.data.status }),
          ...(parsed.data.effective_to === undefined
            ? {}
            : { effectiveTo: parsed.data.effective_to ? new Date(parsed.data.effective_to) : null }),
        })
        .where(eq(materialTemplateMappingsTable.id, param(req.params.id)))
        .returning();
      if (!updated) return null;
      await emit(tx, updated.id, "MAPPING_UPDATED", {
        mapping: serialize(updated as Record<string, unknown>),
      });
      return updated;
    });
    if (!row) {
      res.status(404).json({ error: "Material template mapping not found" });
      return;
    }
    audit(req, "capture.mapping.updated", 200, `Template mapping updated: ${row.id}`);
    res.json(serialize(row as Record<string, unknown>));
  } catch (error) {
    if (handleWriteError(error, res)) return;
    throw error;
  }
});

export async function resolveTemplateHandler(req: Request, res: Response): Promise<void> {
  const materialId = typeof req.query.material_id === "string" ? req.query.material_id : "";
  const rawDate = typeof req.query.date === "string" ? req.query.date : undefined;
  const resolutionDate = rawDate ? new Date(rawDate) : new Date();
  if (rawDate && Number.isNaN(resolutionDate.getTime())) {
    res.status(400).json({ error: "Invalid resolution date" });
    return;
  }
  if (!materialId) {
    res.json({ kind: "NO_TEMPLATE" });
    return;
  }
  const [material] = await db
    .select({ id: materialsTable.id, categoryId: materialsTable.categoryId })
    .from(materialsTable)
    .where(eq(materialsTable.id, materialId));
  if (!material) {
    res.json({ kind: "NO_TEMPLATE" });
    return;
  }
  const effectivePredicate = (scope: "MATERIAL" | "CATEGORY", id: string) =>
    and(
      eq(materialTemplateMappingsTable.scope, scope),
      eq(materialTemplateMappingsTable.status, "ACTIVE"),
      eq(scope === "MATERIAL" ? materialTemplateMappingsTable.materialId : materialTemplateMappingsTable.categoryId, id),
      lte(materialTemplateMappingsTable.effectiveFrom, resolutionDate),
      or(
        isNull(materialTemplateMappingsTable.effectiveTo),
        gt(materialTemplateMappingsTable.effectiveTo, resolutionDate),
      ),
    );
  const materialMappings = await db
    .select({ templateId: materialTemplateMappingsTable.templateId })
    .from(materialTemplateMappingsTable)
    .where(effectivePredicate("MATERIAL", material.id));
  const categoryMappings = await db
    .select({ templateId: materialTemplateMappingsTable.templateId })
    .from(materialTemplateMappingsTable)
    .where(effectivePredicate("CATEGORY", material.categoryId));
  const templateIds = [...new Set([
    ...materialMappings.map((mapping) => mapping.templateId),
    ...categoryMappings.map((mapping) => mapping.templateId),
  ])];
  const versionRows = templateIds.length
    ? await db
        .select({
          templateVersionId: attributeTemplateVersionsTable.id,
          templateId: attributeTemplateVersionsTable.templateId,
          status: attributeTemplateVersionsTable.status,
          effectiveFrom: attributeTemplateVersionsTable.effectiveFrom,
          effectiveTo: attributeTemplateVersionsTable.effectiveTo,
        })
        .from(attributeTemplateVersionsTable)
        .where(inArray(attributeTemplateVersionsTable.templateId, templateIds))
    : [];
  const result = resolveTemplate({
    materialMappings,
    categoryMappings,
    resolutionDate,
    versions: (mapping) =>
      versionRows.filter((version) => version.templateId === mapping.templateId),
  });
  if (result.kind === "OK") {
    res.json({
      kind: result.kind,
      template_id: result.templateId,
      template_version_id: result.templateVersionId,
    });
    return;
  }
  res.json(result);
}

export default router;