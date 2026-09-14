import { Router, type Request, type Response } from "express";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import {
  CreateUnitBody,
  UpsertUnitBody,
  UpdateUnitBody,
} from "@workspace/api-zod";
import {
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
    res.status(409).json({ error: "Unit with this unit_code already exists" });
    return true;
  }
  if (code === "23503") {
    res.status(400).json({ error: "Invalid unit reference" });
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
    aggregateType: "capture_unit",
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

router.get("/", async (req: Request, res: Response): Promise<void> => {
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const active =
    req.query.active === undefined
      ? undefined
      : String(req.query.active) === "true";
  const where = and(
    active === undefined ? undefined : eq(unitDefinitionsTable.active, active),
    search
      ? or(
          ilike(unitDefinitionsTable.unitCode, `%${search}%`),
          ilike(unitDefinitionsTable.dimension, `%${search}%`),
        )
      : undefined,
  );
  const rows = await db
    .select()
    .from(unitDefinitionsTable)
    .where(where)
    .orderBy(desc(unitDefinitionsTable.createdAt));
  res.json({ items: rows.map((row) => serialize(row as Record<string, unknown>)) });
});

router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const [row] = await db
    .select()
    .from(unitDefinitionsTable)
    .where(eq(unitDefinitionsTable.id, param(req.params.id)));
  if (!row) {
    res.status(404).json({ error: "Unit not found" });
    return;
  }
  res.json(serialize(row as Record<string, unknown>));
});

router.put("/:unitCode", async (req: Request, res: Response): Promise<void> => {
  const parsed = UpsertUnitBody.safeParse({
    ...req.body,
    unit_code: req.body?.unit_code ?? param(req.params.unitCode),
  });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const unitCode = parsed.data.unit_code ?? param(req.params.unitCode);
  if (!unitCode) {
    res.status(400).json({ error: "unit_code is required" });
    return;
  }
  try {
    const outcome = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(unitDefinitionsTable)
        .where(eq(unitDefinitionsTable.unitCode, unitCode))
        .for("update");
      const [row] = existing
        ? await tx
            .update(unitDefinitionsTable)
            .set({
              dimension: parsed.data.dimension,
              canonicalUnit: parsed.data.canonical_unit,
              conversionFactor: String(parsed.data.conversion_factor),
            })
            .where(eq(unitDefinitionsTable.id, existing.id))
            .returning()
        : await tx
            .insert(unitDefinitionsTable)
            .values({
              unitCode,
              dimension: parsed.data.dimension,
              canonicalUnit: parsed.data.canonical_unit,
              conversionFactor: String(parsed.data.conversion_factor),
            })
            .returning();
      if (!row) throw new Error("Unit upsert returned no row");
      await emit(tx, row.id, "UNIT_UPSERTED", {
        operation: existing ? "update" : "create",
        unit: serialize(row as Record<string, unknown>),
      });
      return { row, created: !existing };
    });
    audit(req, "capture.unit.upserted", outcome.created ? 201 : 200, `Capture unit upserted: ${outcome.row.unitCode}`);
    res.status(outcome.created ? 201 : 200).json(serialize(outcome.row as Record<string, unknown>));
  } catch (error) {
    if (handleWriteError(error, res)) return;
    throw error;
  }
});

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateUnitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const row = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(unitDefinitionsTable)
        .values({
          unitCode: parsed.data.unit_code,
          dimension: parsed.data.dimension,
          canonicalUnit: parsed.data.canonical_unit,
          conversionFactor: String(parsed.data.conversion_factor),
        })
        .returning();
      if (!created) throw new Error("Unit insert returned no row");
      await emit(tx, created.id, "UNIT_UPSERTED", {
        operation: "create",
        unit: serialize(created as Record<string, unknown>),
      });
      return created;
    });
    audit(req, "capture.unit.created", 201, `Capture unit created: ${row.unitCode}`);
    res.status(201).json(serialize(row as Record<string, unknown>));
  } catch (error) {
    if (handleWriteError(error, res)) return;
    throw error;
  }
});

router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  const parsed = UpdateUnitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const row = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(unitDefinitionsTable)
        .set({ active: parsed.data.active })
        .where(eq(unitDefinitionsTable.id, param(req.params.id)))
        .returning();
      if (!updated) return null;
      await emit(tx, updated.id, "UNIT_UPSERTED", {
        operation: "update",
        unit: serialize(updated as Record<string, unknown>),
      });
      return updated;
    });
    if (!row) {
      res.status(404).json({ error: "Unit not found" });
      return;
    }
    audit(req, "capture.unit.updated", 200, `Capture unit updated: ${row.unitCode}`);
    res.json(serialize(row as Record<string, unknown>));
  } catch (error) {
    if (handleWriteError(error, res)) return;
    throw error;
  }
});

export default router;