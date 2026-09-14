import { Router, type Request, type Response } from "express";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import {
  CreateAttributeBody,
  UpdateAttributeBody,
} from "@workspace/api-zod";
import {
  attributeDefinitionsTable,
  db,
  outboxEventsTable,
  unitDefinitionsTable,
} from "@workspace/db";
import { requireWriteRole } from "../../middleware/auth";
import { recordSecurityEvent, reqMeta } from "../../lib/security-events";

const router = Router();
router.use(requireWriteRole("director"));

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] ?? "" : value;
}

const DATA_TYPES = new Set([
  "TEXT",
  "DECIMAL",
  "INTEGER",
  "BOOLEAN",
  "DATE",
  "DATETIME",
  "DROPDOWN",
]);

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
    res.status(409).json({ error: "Attribute with this code already exists" });
    return true;
  }
  if (code === "23503") {
    res.status(400).json({ error: "Invalid unit reference" });
    return true;
  }
  if (code === "23514") {
    res.status(422).json({ error: "TEMPLATE_INTEGRITY", checks: ["reserved code"] });
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
    aggregateType: "capture_attribute",
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

async function integrityChecks(tx: any, row: Record<string, any>): Promise<string[]> {
  const checks: string[] = [];
  if (!DATA_TYPES.has(String(row.dataType))) checks.push("data_type is invalid");
  if (row.dataType === "DROPDOWN" && (!Array.isArray(row.allowedValues) || row.allowedValues.length === 0)) {
    checks.push("DROPDOWN requires non-empty allowed_values");
  }
  if (!row.unitCode && Array.isArray(row.allowedUnits) && row.allowedUnits.length > 0) {
    checks.push("allowed_units requires unit_code");
  }
  if (row.unitCode) {
    const [unit] = await tx
      .select({ unitCode: unitDefinitionsTable.unitCode })
      .from(unitDefinitionsTable)
      .where(eq(unitDefinitionsTable.unitCode, row.unitCode));
    if (!unit) checks.push(`unit_code '${row.unitCode}' is not in unit_definitions`);
  }
  if (Array.isArray(row.allowedUnits) && row.allowedUnits.length > 0) {
    const units = await tx
      .select({ unitCode: unitDefinitionsTable.unitCode })
      .from(unitDefinitionsTable)
      .where(eq(unitDefinitionsTable.active, true));
    const available = new Set(units.map((unit: { unitCode: string }) => unit.unitCode.toUpperCase()));
    for (const allowed of row.allowedUnits) {
      if (!available.has(String(allowed).toUpperCase())) {
        checks.push(`allowed_units '${allowed}' is not in unit_definitions`);
      }
    }
  }
  if (row.precision !== null && row.precision !== undefined && row.precision <= 0) {
    checks.push("precision must be positive");
  }
  if (row.scale !== null && row.scale !== undefined && row.scale < 0) {
    checks.push("scale must be non-negative");
  }
  if (
    row.precision !== null &&
    row.precision !== undefined &&
    row.scale !== null &&
    row.scale !== undefined &&
    row.scale > row.precision
  ) {
    checks.push("scale must be less than or equal to precision");
  }
  if (row.minValue !== null && row.minValue !== undefined && row.maxValue !== null && row.maxValue !== undefined) {
    if (Number(row.minValue) > Number(row.maxValue)) checks.push("min_value must be less than or equal to max_value");
  }
  return checks;
}

router.get("/", async (req: Request, res: Response): Promise<void> => {
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const where = and(
    status ? eq(attributeDefinitionsTable.status, status as any) : undefined,
    search
      ? or(
          ilike(attributeDefinitionsTable.code, `%${search}%`),
          ilike(attributeDefinitionsTable.name, `%${search}%`),
        )
      : undefined,
  );
  const rows = await db
    .select()
    .from(attributeDefinitionsTable)
    .where(where)
    .orderBy(desc(attributeDefinitionsTable.createdAt));
  res.json({ items: rows.map((row) => serialize(row as Record<string, unknown>)) });
});

router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const [row] = await db
    .select()
    .from(attributeDefinitionsTable)
    .where(eq(attributeDefinitionsTable.id, param(req.params.id)));
  if (!row) {
    res.status(404).json({ error: "Attribute not found" });
    return;
  }
  res.json(serialize(row as Record<string, unknown>));
});

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateAttributeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const row = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(attributeDefinitionsTable)
        .values({
          code: parsed.data.code,
          name: parsed.data.name,
          dataType: parsed.data.data_type,
          scope: parsed.data.scope,
          unitCode: parsed.data.unit_code ?? null,
          allowedUnits: parsed.data.allowed_units ?? null,
          precision: parsed.data.precision ?? null,
          scale: parsed.data.scale ?? null,
          minValue: parsed.data.min_value == null ? null : String(parsed.data.min_value),
          maxValue: parsed.data.max_value == null ? null : String(parsed.data.max_value),
          allowedValues: parsed.data.allowed_values ?? null,
          regex: parsed.data.regex ?? null,
          maxLength: parsed.data.max_length ?? null,
          requiredDefault: parsed.data.required_default,
          description: parsed.data.description ?? null,
          createdBy: req.user?.userId ?? null,
          updatedBy: req.user?.userId ?? null,
        })
        .returning();
      if (!created) throw new Error("Attribute insert returned no row");
      await emit(tx, created.id, "ATTRIBUTE_CREATED", {
        attribute: serialize(created as Record<string, unknown>),
      });
      return created;
    });
    audit(req, "capture.attribute.created", 201, `Capture attribute created: ${row.code}`);
    res.status(201).json(serialize(row as Record<string, unknown>));
  } catch (error) {
    if (handleWriteError(error, res)) return;
    throw error;
  }
});

router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  const parsed = UpdateAttributeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const outcome = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(attributeDefinitionsTable)
        .where(eq(attributeDefinitionsTable.id, param(req.params.id)))
        .for("update");
      if (!existing) return { row: null, error: null };
      if (
        existing.status === "ACTIVE" &&
        Object.keys(parsed.data).some((key) => key !== "name" && key !== "description")
      ) {
        return { row: null, error: "ACTIVE attributes may only change name or description" };
      }
      const [updated] = await tx
        .update(attributeDefinitionsTable)
        .set({
          ...(parsed.data.name === undefined ? {} : { name: parsed.data.name }),
          ...(parsed.data.description === undefined ? {} : { description: parsed.data.description }),
          ...(parsed.data.allowed_values === undefined ? {} : { allowedValues: parsed.data.allowed_values }),
          ...(parsed.data.required_default === undefined ? {} : { requiredDefault: parsed.data.required_default }),
          updatedBy: req.user?.userId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(attributeDefinitionsTable.id, param(req.params.id)))
        .returning();
      if (!updated) return { row: null, error: null };
      await emit(tx, updated.id, "ATTRIBUTE_UPDATED", {
        attribute: serialize(updated as Record<string, unknown>),
      });
      return { row: updated, error: null };
    });
    if (outcome.error) {
      res.status(409).json({ error: outcome.error });
      return;
    }
    if (!outcome.row) {
      res.status(404).json({ error: "Attribute not found" });
      return;
    }
    audit(req, "capture.attribute.updated", 200, `Capture attribute updated: ${outcome.row.code}`);
    res.json(serialize(outcome.row as Record<string, unknown>));
  } catch (error) {
    if (handleWriteError(error, res)) return;
    throw error;
  }
});

router.post("/:id/activate", async (req: Request, res: Response): Promise<void> => {
  try {
    const outcome = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(attributeDefinitionsTable)
        .where(eq(attributeDefinitionsTable.id, param(req.params.id)))
        .for("update");
      if (!existing) return { row: null, checks: [] as string[] };
      const checks = await integrityChecks(tx, existing as Record<string, any>);
      if (checks.length > 0) return { row: existing, checks };
      const [updated] = await tx
        .update(attributeDefinitionsTable)
        .set({
          status: "ACTIVE",
          updatedBy: req.user?.userId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(attributeDefinitionsTable.id, param(req.params.id)))
        .returning();
      if (!updated) return { row: null, checks: [] as string[] };
      await emit(tx, updated.id, "ATTRIBUTE_ACTIVATED", {
        attribute: serialize(updated as Record<string, unknown>),
      });
      return { row: updated, checks: [] as string[] };
    });
    if (!outcome.row) {
      res.status(404).json({ error: "Attribute not found" });
      return;
    }
    if (outcome.checks.length > 0) {
      res.status(422).json({ error: "TEMPLATE_INTEGRITY", checks: outcome.checks });
      return;
    }
    audit(req, "capture.attribute.activated", 200, `Capture attribute activated: ${outcome.row.code}`);
    res.json(serialize(outcome.row as Record<string, unknown>));
  } catch (error) {
    if (handleWriteError(error, res)) return;
    throw error;
  }
});

router.post("/:id/retire", async (req: Request, res: Response): Promise<void> => {
  try {
    const row = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(attributeDefinitionsTable)
        .set({
          status: "RETIRED",
          updatedBy: req.user?.userId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(attributeDefinitionsTable.id, param(req.params.id)))
        .returning();
      if (!updated) return null;
      await emit(tx, updated.id, "ATTRIBUTE_RETIRED", {
        attribute: serialize(updated as Record<string, unknown>),
      });
      return updated;
    });
    if (!row) {
      res.status(404).json({ error: "Attribute not found" });
      return;
    }
    audit(req, "capture.attribute.retired", 200, `Capture attribute retired: ${row.code}`);
    res.json(serialize(row as Record<string, unknown>));
  } catch (error) {
    if (handleWriteError(error, res)) return;
    throw error;
  }
});

export default router;