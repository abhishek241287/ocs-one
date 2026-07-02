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

// Optional write hook: runs after validation + snake→camel mapping, BEFORE the
// insert/update. Mutating `values` in place feeds the change into the write (e.g.
// Material Master syncs cell_master_id). Returning {status,error} aborts with that
// response. Generic so every master can opt into custom validation / derived fields.
export type MasterWriteHook = (
  ctx: {
    mode: "create" | "update";
    id?: string;
    existing?: Record<string, unknown>;
    req: Request;
    /**
     * On update, the transaction the row was locked in (SELECT … FOR UPDATE). Hooks
     * MUST run their integrity reads (link locks, duplicate checks) on this handle so
     * the check + write are atomic — closes the Rule 4/5 TOCTOU. Undefined on create.
     */
    tx?: any;
  },
  values: Record<string, unknown>,
) => Promise<{ status: number; error: string } | void>;

// Optional row enricher: adds DERIVED, read-only fields to every serialized row
// (list/get/create/update). Used by Material Master to attach the linked-master
// summary without denormalizing it into the table.
export type MasterRowEnricher = (
  row: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

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
   * authed user. Defaults to the master-governance policy (owner, director) — under
   * six-role RBAC all master writes are Owner/Director only; supervisors are
   * read-only on masters. Owner also passes unconditionally at the middleware.
   */
  writeRoles?: Parameters<typeof requireWriteRole>;
  /** Custom write validation / value derivation (see MasterWriteHook). */
  beforeWrite?: MasterWriteHook;
  /** Derived read-only fields for every serialized row (see MasterRowEnricher). */
  enrichRow?: MasterRowEnricher;
}) {
  const router: IRouter = Router();
  const { table, inputSchema, updateSchema, resourceName } = options;
  const writeRoles = options.writeRoles ?? ["owner", "director"];

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

    const serialized = (items as any[]).map(item => serializeRow(item as Record<string, unknown>));
    const out = options.enrichRow
      ? await Promise.all(serialized.map(async r => ({ ...r, ...(await options.enrichRow!(r)) })))
      : serialized;

    res.json({
      items: out,
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
      if (options.beforeWrite) {
        const hook = await options.beforeWrite({ mode: "create", req }, camelData);
        if (hook) {
          res.status(hook.status).json({ error: hook.error });
          return;
        }
      }
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
      const serialized = serializeRow(item as Record<string, unknown>);
      res
        .status(201)
        .json(options.enrichRow ? { ...serialized, ...(await options.enrichRow(serialized)) } : serialized);
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

    const serializedGet = serializeRow(item as Record<string, unknown>);
    res.json(options.enrichRow ? { ...serializedGet, ...(await options.enrichRow(serializedGet)) } : serializedGet);
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

    type Outcome =
      | { kind: "ok"; item: any }
      | { kind: "notfound" }
      | { kind: "hook"; status: number; error: string };

    // When a hook enforces immutability / identity rules (Rule 4/5), the lock-check
    // and the write MUST be atomic: lock the target row FOR UPDATE, run the hook's
    // integrity reads on the SAME tx, then write — so no concurrent edit can slip
    // between the check and the update (closes the TOCTOU). Plain masters (no hook)
    // skip the transaction.
    const runWrite = async (dbx: any): Promise<Outcome> => {
      if (options.beforeWrite) {
        const [cur] = (await dbx
          .select()
          .from(table as any)
          .where(eq((table as any).id, id))
          .for("update")) as any[];
        if (!cur) return { kind: "notfound" };
        const hook = await options.beforeWrite(
          { mode: "update", id, existing: cur as Record<string, unknown>, req, tx: dbx },
          camelData,
        );
        if (hook) return { kind: "hook", status: hook.status, error: hook.error };
      }
      const [item] = (await dbx
        .update(table as any)
        .set({
          ...camelData,
          revisionNumber: sql`${(table as any).revisionNumber} + 1`,
          updatedAt: new Date(),
        })
        .where(eq((table as any).id, id))
        .returning()) as any[];
      if (!item) return { kind: "notfound" };
      return { kind: "ok", item };
    };

    try {
      const outcome = options.beforeWrite ? await db.transaction(runWrite) : await runWrite(db);

      if (outcome.kind === "notfound") {
        res.status(404).json({ error: `${resourceName} not found` });
        return;
      }
      if (outcome.kind === "hook") {
        res.status(outcome.status).json({ error: outcome.error });
        return;
      }

      const item = outcome.item;
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
      const serializedUpd = serializeRow(item as Record<string, unknown>);
      res.json(options.enrichRow ? { ...serializedUpd, ...(await options.enrichRow(serializedUpd)) } : serializedUpd);
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

    try {
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
    } catch (err: any) {
      // Re-activating a master can collide with a partial UNIQUE index (e.g. the
      // "one ACTIVE material per linked master" rule) → 23505 → controlled 409.
      if (handlePgWriteError(err, res, resourceName)) return;
      throw err;
    }
  });

  return router;
}
