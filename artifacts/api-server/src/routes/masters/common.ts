import { Router, type IRouter, type Request, type Response } from "express";
import { requireWriteRole } from "../../middleware/auth";
import { recordSecurityEvent, reqMeta } from "../../lib/security-events";
import { eq, sql, and, or, ilike, count, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { 
  ToggleProductMasterStatusBody,
} from "@workspace/api-zod";
import type { PgTableWithColumns } from "drizzle-orm/pg-core";

// Convert snake_case keys from Zod-parsed body → camelCase for Drizzle insert/update
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function bodyToCamel(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [snakeToCamel(k), v])
  );
}

// INV-005: trim leading/trailing whitespace on top-level string fields BEFORE
// validation, so whitespace-only values collapse to "" and fail the schema's
// minLength(1) — prevents blank / whitespace-only master data. Platform fix: every
// master created via this router benefits, alongside the OpenAPI minLength/maxLength.
function trimStrings(body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  return Object.fromEntries(
    Object.entries(body as Record<string, unknown>).map(([k, v]) => [
      k,
      typeof v === "string" ? v.trim() : v,
    ])
  );
}

// Serialize Drizzle row → API response:
//   • camelCase keys → snake_case
//   • Postgres numeric/decimal strings → JS numbers
function serializeRow(item: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(item).map(([k, v]) => {
      const snakeKey = k.replace(/([A-Z])/g, "_$1").toLowerCase();
      const value =
        typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
      return [snakeKey, value];
    })
  );
}

// Map Postgres constraint violations on master writes to client errors. Drizzle
// wraps pg errors as `new Error(..., { cause: pgErr })`, so the code can live on
// `err.cause.code`. Returns true if it responded. Generic so EVERY master benefits
// (Material Master is the first with an FK; 23503 → 400 covers a bad category_id,
// 23505 → 409 covers a duplicate code on both create and update).
function handlePgWriteError(err: any, res: Response, resourceName: string): boolean {
  const pgCode = err?.code ?? (err?.cause as any)?.code;
  if (pgCode === "23505") {
    // Name the violated field when Postgres reports it (detail: "Key (col)=(val) already
    // exists."), so masters with non-`code` unique columns (e.g. serial_number) get an
    // accurate message; fall back to a constraint-agnostic message otherwise.
    const detail: string = err?.detail ?? (err?.cause as any)?.detail ?? "";
    const field = /Key \(([^)]+)\)/.exec(detail)?.[1];
    res.status(409).json({
      error: field
        ? `${resourceName} with this ${field} already exists`
        : `${resourceName} with these values already exists`,
    });
    return true;
  }
  if (pgCode === "23503") {
    res.status(400).json({ error: `Invalid ${resourceName}: a referenced record does not exist` });
    return true;
  }
  return false;
}

export function createMasterRouter<
  TTable extends PgTableWithColumns<any>,
  _TEntity,
  _TInput,
  _TUpdate
>(options: {
  table: TTable;
  schema: any;
  inputSchema: any;
  updateSchema: any;
  resourceName: string;
  /**
   * Roles allowed to WRITE (POST/PUT/PATCH/DELETE). Reads (GET/HEAD) pass for any
   * authed user. Defaults to the standard masters policy (supervisor, director).
   * Product Category / Workflow masters narrow this to director-only.
   */
  writeRoles?: Parameters<typeof requireWriteRole>;
}) {
  const router: IRouter = Router();
  const { table, inputSchema, updateSchema, resourceName } = options;
  const writeRoles = options.writeRoles ?? ["supervisor", "director"];

  // RBAC (DEF-M06-001): masters CRUD writes gated; reads open to any authed user.
  router.use(requireWriteRole(...writeRoles));

  // List
  router.get("/", async (req: Request, res: Response): Promise<void> => {
    const query = req.query as any;
    const page = parseInt(query.page || "1", 10);
    const pageSize = parseInt(query.pageSize || "25", 10);
    const search = query.search as string | undefined;
    const status = query.status as "active" | "inactive" | undefined;

    const offset = (page - 1) * pageSize;

    const conditions = [];
    if (status) {
      conditions.push(eq((table as any).status, status));
    }
    if (search) {
      conditions.push(
        or(
          ilike((table as any).code, `%${search}%`),
          ilike((table as any).name, `%${search}%`)
        )
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = (await db
      .select({ count: count() })
      .from(table as any)
      .where(where)) as any[];

    const items = await db
      .select()
      .from(table as any)
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc((table as any).createdAt));

    const total = Number((totalResult as any)?.count ?? 0);
    const totalPages = Math.ceil(total / pageSize);

    res.json({
      items: (items as any[]).map(item => serializeRow(item as Record<string, unknown>)),
      meta: { total, page, pageSize, totalPages },
    });
  });

  // Create
  router.post("/", async (req: Request, res: Response): Promise<void> => {
    const parsed = inputSchema.safeParse(trimStrings(req.body));
    if (!parsed.success) {
      req.log.warn({ errors: parsed.error.issues }, `Invalid ${resourceName} input`);
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    try {
      const camelData = bodyToCamel(parsed.data as Record<string, unknown>);
      const [item] = await db.insert(table).values(camelData as any).returning();
      const row = item as Record<string, any>;
      // INV-001: master-data audit trail (platform fix — every master benefits).
      void recordSecurityEvent({
        eventType: "master.created",
        actorId: req.user?.userId ?? null,
        actorEmail: req.user?.email ?? null,
        actorRole: req.user?.role ?? null,
        ...reqMeta(req),
        statusCode: 201,
        detail: `${resourceName} created: ${row.code ?? row.id} (id=${row.id})`,
      });
      res.status(201).json(serializeRow(item as Record<string, unknown>));
    } catch (err: any) {
      if (handlePgWriteError(err, res, resourceName)) return;
      throw err;
    }
  });

  // Get by ID
  router.get("/:id", async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const [item] = (await db
      .select()
      .from(table as any)
      .where(eq((table as any).id, id))) as any[];

    if (!item) {
      res.status(404).json({ error: `${resourceName} not found` });
      return;
    }

    res.json(serializeRow(item as Record<string, unknown>));
  });

  // Update
  router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const parsed = updateSchema.safeParse(trimStrings(req.body));
    if (!parsed.success) {
      req.log.warn({ errors: parsed.error.issues }, `Invalid ${resourceName} update`);
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const camelData = bodyToCamel(parsed.data as Record<string, unknown>);

    try {
      const [item] = (await db
        .update(table as any)
        .set({
          ...camelData,
          revisionNumber: sql`${(table as any).revisionNumber} + 1`,
          updatedAt: new Date(),
        })
        .where(eq((table as any).id, id))
        .returning()) as any[];

      if (!item) {
        res.status(404).json({ error: `${resourceName} not found` });
        return;
      }

      const row = item as Record<string, any>;
      // INV-001: master-data audit trail — record which fields changed.
      void recordSecurityEvent({
        eventType: "master.updated",
        actorId: req.user?.userId ?? null,
        actorEmail: req.user?.email ?? null,
        actorRole: req.user?.role ?? null,
        ...reqMeta(req),
        statusCode: 200,
        detail: `${resourceName} updated: ${row.code ?? row.id} (id=${row.id}); fields: ${Object.keys(parsed.data as Record<string, unknown>).join(", ") || "—"}`,
      });
      res.json(serializeRow(item as Record<string, unknown>));
    } catch (err: any) {
      if (handlePgWriteError(err, res, resourceName)) return;
      throw err;
    }
  });

  // Toggle Status
  router.patch("/:id/status", async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const parsed = ToggleProductMasterStatusBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [item] = (await db
      .update(table as any)
      .set({
        status: (parsed.data as any).status,
        updatedAt: new Date(),
      })
      .where(eq((table as any).id, id))
      .returning()) as any[];

    if (!item) {
      res.status(404).json({ error: `${resourceName} not found` });
      return;
    }

    const row = item as Record<string, any>;
    // INV-001: master-data audit trail — activation / deactivation.
    void recordSecurityEvent({
      eventType: "master.status_changed",
      severity: "warning",
      actorId: req.user?.userId ?? null,
      actorEmail: req.user?.email ?? null,
      actorRole: req.user?.role ?? null,
      ...reqMeta(req),
      statusCode: 200,
      detail: `${resourceName} status → ${(parsed.data as any).status}: ${row.code ?? row.id} (id=${row.id})`,
    });
    res.json(serializeRow(item as Record<string, unknown>));
  });

  return router;
}
