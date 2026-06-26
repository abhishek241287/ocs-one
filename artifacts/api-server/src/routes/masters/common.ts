import { Router, type IRouter, type Request, type Response } from "express";
import { eq, sql, and, or, ilike, count, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { 
  ToggleProductMasterStatusBody,
} from "@workspace/api-zod";
import type { PgTableWithColumns } from "drizzle-orm/pg-core";

export function createMasterRouter<
  TTable extends PgTableWithColumns<any>,
  TEntity,
  TInput,
  TUpdate
>(options: {
  table: TTable;
  schema: any; // The entity Zod schema
  inputSchema: any; // The input Zod schema
  updateSchema: any; // The update Zod schema
  resourceName: string;
}) {
  const router: IRouter = Router();
  const { table, schema, inputSchema, updateSchema, resourceName } = options;

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
      // Common masters have 'code' and 'name'
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

    const total = (totalResult as any)?.count || 0;
    const totalPages = Math.ceil(total / pageSize);

    res.json({
      items: (items as any[]).map(item => schema.parse(item)),
      meta: {
        total,
        page,
        pageSize,
        totalPages,
      },
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
      const [item] = await db.insert(table).values(parsed.data).returning();
      res.status(201).json(schema.parse(item));
    } catch (err: any) {
      if (err.code === "23505") { // Unique violation
        res.status(409).json({ error: `${resourceName} with this code already exists` });
        return;
      }
      throw err;
    }
  });

  // Get
  router.get("/:id", async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const [item] = (await db.select().from(table as any).where(eq((table as any).id, id))) as any[];

    if (!item) {
      res.status(404).json({ error: `${resourceName} not found` });
      return;
    }

    res.json(schema.parse(item));
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

    const [item] = (await db
      .update(table as any)
      .set({
        ...parsed.data,
        revisionNumber: sql`${(table as any).revisionNumber} + 1`,
        updatedAt: new Date(),
      })
      .where(eq((table as any).id, id))
      .returning()) as any[];

    if (!item) {
      res.status(404).json({ error: `${resourceName} not found` });
      return;
    }

    res.json(schema.parse(item));
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

    res.json(schema.parse(item));
  });

  return router;
}
