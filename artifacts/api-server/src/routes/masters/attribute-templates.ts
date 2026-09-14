import { Router, type Request, type Response } from "express";
import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import {
  AddTemplateAttributeBody,
  CreateTemplateBody,
  CreateTemplateVersionBody,
  UpdateTemplateVersionBody,
  UpdateTemplateBody,
} from "@workspace/api-zod";
import {
  attributeDefinitionsTable,
  attributeTemplateAttributesTable,
  attributeTemplateVersionsTable,
  attributeTemplatesTable,
  db,
  outboxEventsTable,
} from "@workspace/db";
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

function handleWriteError(error: any, res: Response): boolean {
  const code = pgCode(error);
  if (code === "23505") {
    res.status(409).json({ error: "Template values conflict with an existing record" });
    return true;
  }
  if (code === "23503") {
    res.status(400).json({ error: "Invalid template or attribute reference" });
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
    aggregateType: "attribute_template",
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

function parseDate(value: string): Date {
  return new Date(value);
}

function validDateRange(from: Date, to: Date | null): boolean {
  return !Number.isNaN(from.getTime()) && (to === null || !Number.isNaN(to.getTime())) &&
    (to === null || from < to);
}

function overlaps(
  leftFrom: Date,
  leftTo: Date | null,
  rightFrom: Date,
  rightTo: Date | null,
): boolean {
  return (
    leftFrom < (rightTo ?? new Date(8640000000000000)) &&
    rightFrom < (leftTo ?? new Date(8640000000000000))
  );
}

router.get("/", async (req: Request, res: Response): Promise<void> => {
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const where = and(
    status ? eq(attributeTemplatesTable.status, status as any) : undefined,
    search
      ? or(
          ilike(attributeTemplatesTable.code, `%${search}%`),
          ilike(attributeTemplatesTable.name, `%${search}%`),
        )
      : undefined,
  );
  const rows = await db
    .select()
    .from(attributeTemplatesTable)
    .where(where)
    .orderBy(desc(attributeTemplatesTable.createdAt));
  res.json({ items: rows.map((row) => serialize(row as Record<string, unknown>)) });
});

router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const [template] = await db
    .select()
    .from(attributeTemplatesTable)
    .where(eq(attributeTemplatesTable.id, param(req.params.id)));
  if (!template) {
    res.status(404).json({ error: "Attribute template not found" });
    return;
  }
  const versions = await db
    .select()
    .from(attributeTemplateVersionsTable)
    .where(eq(attributeTemplateVersionsTable.templateId, template.id))
    .orderBy(desc(attributeTemplateVersionsTable.versionNo));
  res.json({
    ...serialize(template as Record<string, unknown>),
    versions: versions.map((version) => serialize(version as Record<string, unknown>)),
  });
});

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const row = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(attributeTemplatesTable)
        .values({
          code: parsed.data.code,
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          createdBy: req.user?.userId ?? null,
          updatedBy: req.user?.userId ?? null,
        })
        .returning();
      if (!created) throw new Error("Template insert returned no row");
      await emit(tx, created.id, "TEMPLATE_CREATED", {
        template: serialize(created as Record<string, unknown>),
      });
      return created;
    });
    audit(req, "capture.template.created", 201, `Capture template created: ${row.code}`);
    res.status(201).json(serialize(row as Record<string, unknown>));
  } catch (error) {
    if (handleWriteError(error, res)) return;
    throw error;
  }
});

router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  const parsed = UpdateTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const row = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(attributeTemplatesTable)
        .set({
          ...(parsed.data.name === undefined ? {} : { name: parsed.data.name }),
          ...(parsed.data.description === undefined ? {} : { description: parsed.data.description }),
          updatedBy: req.user?.userId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(attributeTemplatesTable.id, param(req.params.id)))
        .returning();
      if (!updated) return null;
      await emit(tx, updated.id, "TEMPLATE_UPDATED", {
        template: serialize(updated as Record<string, unknown>),
      });
      return updated;
    });
    if (!row) {
      res.status(404).json({ error: "Attribute template not found" });
      return;
    }
    audit(req, "capture.template.updated", 200, `Capture template updated: ${row.code}`);
    res.json(serialize(row as Record<string, unknown>));
  } catch (error) {
    if (handleWriteError(error, res)) return;
    throw error;
  }
});

router.get("/:templateId/versions", async (req: Request, res: Response): Promise<void> => {
  const rows = await db
    .select()
    .from(attributeTemplateVersionsTable)
    .where(eq(attributeTemplateVersionsTable.templateId, param(req.params.templateId)))
    .orderBy(desc(attributeTemplateVersionsTable.versionNo));
  res.json({ items: rows.map((row) => serialize(row as Record<string, unknown>)) });
});

router.post("/:templateId/versions", async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateTemplateVersionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const effectiveFrom = parseDate(parsed.data.effective_from);
  const effectiveTo = parsed.data.effective_to ? parseDate(parsed.data.effective_to) : null;
  if (!validDateRange(effectiveFrom, effectiveTo)) {
    res.status(422).json({ error: "Invalid effective date range" });
    return;
  }
  try {
    const row = await db.transaction(async (tx) => {
      const [template] = await tx
        .select({ id: attributeTemplatesTable.id })
        .from(attributeTemplatesTable)
        .where(eq(attributeTemplatesTable.id, param(req.params.templateId)));
      if (!template) return { row: null, missing: true };
      const [created] = await tx
        .insert(attributeTemplateVersionsTable)
        .values({
          templateId: param(req.params.templateId),
          versionNo: parsed.data.version_no,
          effectiveFrom,
          effectiveTo,
          createdBy: req.user?.userId ?? null,
        })
        .returning();
      if (!created) throw new Error("Template version insert returned no row");
      await emit(tx, created.id, "TEMPLATE_VERSION_CREATED", {
        version: serialize(created as Record<string, unknown>),
      });
      return { row: created, missing: false };
    });
    if (row.missing || !row.row) {
      res.status(400).json({ error: "Attribute template not found" });
      return;
    }
    audit(req, "capture.template_version.created", 201, `Template version created: ${row.row.id}`);
    res.status(201).json(serialize(row.row as Record<string, unknown>));
  } catch (error) {
    if (handleWriteError(error, res)) return;
    throw error;
  }
});

router.get("/versions/:versionId", async (req: Request, res: Response): Promise<void> => {
  const [version] = await db
    .select()
    .from(attributeTemplateVersionsTable)
    .where(eq(attributeTemplateVersionsTable.id, param(req.params.versionId)));
  if (!version) {
    res.status(404).json({ error: "Template version not found" });
    return;
  }
  const fields = await db
    .select({
      id: attributeTemplateAttributesTable.id,
      attributeId: attributeTemplateAttributesTable.attributeId,
      required: attributeTemplateAttributesTable.required,
      sequence: attributeTemplateAttributesTable.sequence,
      defaultValue: attributeTemplateAttributesTable.defaultValue,
      allowedValuesOverride: attributeTemplateAttributesTable.allowedValuesOverride,
      unitOverride: attributeTemplateAttributesTable.unitOverride,
    })
    .from(attributeTemplateAttributesTable)
    .where(eq(attributeTemplateAttributesTable.templateVersionId, version.id))
    .orderBy(asc(attributeTemplateAttributesTable.sequence));
  res.json({
    ...serialize(version as Record<string, unknown>),
    attributes: fields.map((field) => serialize(field as Record<string, unknown>)),
  });
});

router.patch("/versions/:versionId", async (req: Request, res: Response): Promise<void> => {
  const parsed = UpdateTemplateVersionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const row = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(attributeTemplateVersionsTable)
        .where(eq(attributeTemplateVersionsTable.id, param(req.params.versionId)))
        .for("update");
      if (!existing) return { row: null, error: "Template version not found", status: 404 };
      if (existing.status !== "DRAFT") {
        return { row: null, error: "Only DRAFT template versions can be edited", status: 422 };
      }
      const effectiveFrom = parsed.data.effective_from
        ? parseDate(parsed.data.effective_from)
        : existing.effectiveFrom;
      const effectiveTo =
        parsed.data.effective_to === undefined
          ? existing.effectiveTo
          : parsed.data.effective_to
            ? parseDate(parsed.data.effective_to)
            : null;
      if (!validDateRange(effectiveFrom, effectiveTo)) {
        return { row: null, error: "Invalid effective date range", status: 422 };
      }
      const [updated] = await tx
        .update(attributeTemplateVersionsTable)
        .set({ effectiveFrom, effectiveTo })
        .where(eq(attributeTemplateVersionsTable.id, existing.id))
        .returning();
      if (!updated) throw new Error("Template version update returned no row");
      await emit(tx, updated.id, "TEMPLATE_VERSION_UPDATED", {
        version: serialize(updated as Record<string, unknown>),
      });
      return { row: updated, error: null, status: 200 };
    });
    if (!row.row) {
      res.status(row.status).json({ error: row.error });
      return;
    }
    audit(req, "capture.template_version.updated", 200, `Template version updated: ${row.row.id}`);
    res.json(serialize(row.row as Record<string, unknown>));
  } catch (error) {
    if (handleWriteError(error, res)) return;
    throw error;
  }
});

router.get("/versions/:versionId/preview", async (req: Request, res: Response): Promise<void> => {
  const [version] = await db
    .select()
    .from(attributeTemplateVersionsTable)
    .where(eq(attributeTemplateVersionsTable.id, param(req.params.versionId)));
  if (!version) {
    res.status(404).json({ error: "Template version not found" });
    return;
  }
  const [template] = await db
    .select()
    .from(attributeTemplatesTable)
    .where(eq(attributeTemplatesTable.id, version.templateId));
  if (!template) {
    res.status(404).json({ error: "Attribute template not found" });
    return;
  }
  const fields = await db
    .select({
      attributeCode: attributeDefinitionsTable.code,
      name: attributeDefinitionsTable.name,
      dataType: attributeDefinitionsTable.dataType,
      required: attributeTemplateAttributesTable.required,
      sequence: attributeTemplateAttributesTable.sequence,
      defaultValue: attributeTemplateAttributesTable.defaultValue,
      unit: attributeTemplateAttributesTable.unitOverride,
      attributeUnit: attributeDefinitionsTable.unitCode,
      allowedValuesOverride: attributeTemplateAttributesTable.allowedValuesOverride,
      allowedValues: attributeDefinitionsTable.allowedValues,
      min: attributeDefinitionsTable.minValue,
      max: attributeDefinitionsTable.maxValue,
      precision: attributeDefinitionsTable.precision,
      scale: attributeDefinitionsTable.scale,
    })
    .from(attributeTemplateAttributesTable)
    .innerJoin(
      attributeDefinitionsTable,
      eq(attributeDefinitionsTable.id, attributeTemplateAttributesTable.attributeId),
    )
    .where(eq(attributeTemplateAttributesTable.templateVersionId, version.id))
    .orderBy(asc(attributeTemplateAttributesTable.sequence));
  const previewFields = fields.map((field) => ({
    attribute_code: field.attributeCode,
    name: field.name,
    data_type: field.dataType,
    required: field.required,
    sequence: field.sequence,
    default_value: field.defaultValue,
    unit: field.unit ?? field.attributeUnit,
    allowed_values: field.allowedValuesOverride ?? field.allowedValues,
    min: field.min,
    max: field.max,
    precision: field.precision,
    scale: field.scale,
  }));
  const generatedCsvColumns = [
    "material_code",
    "lot_number",
    "quantity",
    ...previewFields.map((field) => field.attribute_code),
  ];
  res.json({
    template_code: template.code,
    version_no: version.versionNo,
    status: version.status,
    effective_from: version.effectiveFrom,
    effective_to: version.effectiveTo,
    fields: previewFields,
    generated_csv: { columns: generatedCsvColumns },
    generated_csv_columns: generatedCsvColumns,
  });
});

router.post("/versions/:versionId/attributes", async (req: Request, res: Response): Promise<void> => {
  const parsed = AddTemplateAttributeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const row = await db.transaction(async (tx) => {
      const [version] = await tx
        .select({ id: attributeTemplateVersionsTable.id, status: attributeTemplateVersionsTable.status })
        .from(attributeTemplateVersionsTable)
        .where(eq(attributeTemplateVersionsTable.id, param(req.params.versionId)))
        .for("update");
      if (!version) return { row: null, error: "Template version not found", status: 404 };
      if (version.status !== "DRAFT") {
        return { row: null, error: "Only DRAFT template versions can be edited", status: 422 };
      }
      const [attribute] = await tx
        .select({ id: attributeDefinitionsTable.id })
        .from(attributeDefinitionsTable)
        .where(eq(attributeDefinitionsTable.id, parsed.data.attribute_id));
      if (!attribute) return { row: null, error: "Attribute not found", status: 400 };
      const [created] = await tx
        .insert(attributeTemplateAttributesTable)
        .values({
          templateVersionId: param(req.params.versionId),
          attributeId: parsed.data.attribute_id,
          required: parsed.data.required,
          sequence: parsed.data.sequence,
          defaultValue: parsed.data.default_value ?? null,
          allowedValuesOverride: parsed.data.allowed_values_override ?? null,
          unitOverride: parsed.data.unit_override ?? null,
        })
        .returning();
      if (!created) throw new Error("Template attribute insert returned no row");
      await emit(tx, param(req.params.versionId), "TEMPLATE_VERSION_ATTRIBUTE_ADDED", {
        template_attribute: serialize(created as Record<string, unknown>),
      });
      return { row: created, error: null, status: 201 };
    });
    if (!row.row) {
      res.status(row.status).json({ error: row.error });
      return;
    }
    audit(req, "capture.template_version.attribute_added", 201, `Attribute added to template version: ${row.row.id}`);
    res.status(201).json(serialize(row.row as Record<string, unknown>));
  } catch (error) {
    if (handleWriteError(error, res)) return;
    throw error;
  }
});

router.post("/versions/:versionId/activate", async (req: Request, res: Response): Promise<void> => {
  try {
    const outcome = await db.transaction(async (tx) => {
      const [version] = await tx
        .select()
        .from(attributeTemplateVersionsTable)
        .where(eq(attributeTemplateVersionsTable.id, param(req.params.versionId)))
        .for("update");
      if (!version) return { version: null, checks: [] as string[], overlap: false };
      const attributes = await tx
        .select({
          sequence: attributeTemplateAttributesTable.sequence,
          status: attributeDefinitionsTable.status,
        })
        .from(attributeTemplateAttributesTable)
        .innerJoin(
          attributeDefinitionsTable,
          eq(attributeDefinitionsTable.id, attributeTemplateAttributesTable.attributeId),
        )
        .where(eq(attributeTemplateAttributesTable.templateVersionId, version.id));
      const checks: string[] = [];
      if (attributes.length === 0) checks.push("template version requires at least one attribute");
      if (attributes.some((attribute) => attribute.status !== "ACTIVE")) {
        checks.push("every template attribute must be ACTIVE");
      }
      const sequences = new Set<number>();
      for (const attribute of attributes) {
        if (sequences.has(attribute.sequence)) checks.push("template attribute sequences must be unique");
        sequences.add(attribute.sequence);
      }
      const otherVersions = await tx
        .select()
        .from(attributeTemplateVersionsTable)
        .where(
          and(
            eq(attributeTemplateVersionsTable.templateId, version.templateId),
            eq(attributeTemplateVersionsTable.status, "ACTIVE"),
          ),
        );
      const overlap = otherVersions.some(
        (other) =>
          other.id !== version.id &&
          overlaps(version.effectiveFrom, version.effectiveTo, other.effectiveFrom, other.effectiveTo),
      );
      if (overlap) return { version, checks, overlap: true };
      if (checks.length > 0) return { version, checks, overlap: false };
      const [updated] = await tx
        .update(attributeTemplateVersionsTable)
        .set({ status: "ACTIVE" })
        .where(eq(attributeTemplateVersionsTable.id, version.id))
        .returning();
      await tx
        .update(attributeTemplatesTable)
        .set({ status: "ACTIVE", updatedAt: new Date(), updatedBy: req.user?.userId ?? null })
        .where(eq(attributeTemplatesTable.id, version.templateId));
      if (!updated) return { version: null, checks: [] as string[], overlap: false };
      await emit(tx, updated.id, "TEMPLATE_VERSION_ACTIVATED", {
        version: serialize(updated as Record<string, unknown>),
      });
      return { version: updated, checks: [] as string[], overlap: false };
    });
    if (!outcome.version) {
      res.status(404).json({ error: "Template version not found" });
      return;
    }
    if (outcome.overlap) {
      res.status(409).json({ error: "EFFECTIVE_RANGE_OVERLAP" });
      return;
    }
    if (outcome.checks.length > 0) {
      res.status(422).json({ error: "TEMPLATE_INTEGRITY", checks: outcome.checks });
      return;
    }
    audit(req, "capture.template_version.activated", 200, `Template version activated: ${outcome.version.id}`);
    res.json(serialize(outcome.version as Record<string, unknown>));
  } catch (error) {
    if (handleWriteError(error, res)) return;
    throw error;
  }
});

router.post("/versions/:versionId/retire", async (req: Request, res: Response): Promise<void> => {
  try {
    const row = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(attributeTemplateVersionsTable)
        .set({ status: "RETIRED" })
        .where(eq(attributeTemplateVersionsTable.id, param(req.params.versionId)))
        .returning();
      if (!updated) return null;
      await emit(tx, updated.id, "TEMPLATE_VERSION_RETIRED", {
        version: serialize(updated as Record<string, unknown>),
      });
      return updated;
    });
    if (!row) {
      res.status(404).json({ error: "Template version not found" });
      return;
    }
    audit(req, "capture.template_version.retired", 200, `Template version retired: ${row.id}`);
    res.json(serialize(row as Record<string, unknown>));
  } catch (error) {
    if (handleWriteError(error, res)) return;
    throw error;
  }
});

export default router;