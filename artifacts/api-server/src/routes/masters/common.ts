import { Router, type IRouter, type Request, type Response } from "express";
import { requireWriteRole } from "../../middleware/auth";
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
}) {
  const router: IRouter = Router();
  const { table, inputSchema, updateSchema, resourceName } = options;

  // RBAC (DEF-M06-001): all masters CRUD — supervisor, director only.
  router.use(requireWriteRole("supervisor", "director"));

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
    const parsed = inputSchema.safeParse(req.body);
    if (!parsed.success) {
      req.log.warn({ errors: parsed.error.issues }, `Invalid ${resourceName} input`);
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    try {
      const camelData = bodyToCamel(parsed.data as Record<string, unknown>);
      const [item] = await db.insert(table).values(camelData as any).returning();
      res.status(201).json(serializeRow(item as Record<string, unknown>));
    } catch (err: any) {
      // Drizzle wraps pg errors: throw new Error("Failed query...", { cause: pgErr })
      const pgCode = err.code ?? (err.cause as any)?.code;
      if (pgCode === "23505") {
        res.status(409).json({ error: `${resourceName} with this code already exists` });
        return;
      }
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
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      req.log.warn({ errors: parsed.error.issues }, `Invalid ${resourceName} update`);
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const camelData = bodyToCamel(parsed.data as Record<string, unknown>);

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

    res.json(serializeRow(item as Record<string, unknown>));
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

    res.json(serializeRow(item as Record<string, unknown>));
  });

  return router;
}
