import { Router, IRouter } from "express";
import { requireWriteRole } from "../../middleware/auth";
import { db, mfgReworkTicketsTable } from "@workspace/db";
import { eq, desc, count, sql } from "drizzle-orm";
import {
  ListReworkTicketsQueryParams,
  GetReworkTicketParams,
  UpdateReworkTicketParams,
  UpdateReworkTicketBody,
} from "@workspace/api-zod";

const router: IRouter = Router({ mergeParams: true });

// RBAC (DEF-M06-001): rework execution — operator, supervisor, director.
router.use(requireWriteRole("operator", "supervisor", "director"));

// GET /manufacturing/rework
router.get("/", async (req, res) => {
  const { page = 1, pageSize = 20, status } = ListReworkTicketsQueryParams.parse(req.query);
  const offset = (page - 1) * pageSize;

  const whereClause = status
    ? sql`${mfgReworkTicketsTable.status} = ${status}`
    : undefined;

  const [{ total }] = await db
    .select({ total: count() })
    .from(mfgReworkTicketsTable)
    .where(whereClause);

  const items = await db
    .select()
    .from(mfgReworkTicketsTable)
    .where(whereClause)
    .orderBy(desc(mfgReworkTicketsTable.createdAt))
    .limit(pageSize)
    .offset(offset);

  res.json({ items, total: Number(total) });
});

// GET /manufacturing/rework/:id
router.get("/:id", async (req, res) => {
  const { id } = GetReworkTicketParams.parse({ id: req.params.id });
  const [ticket] = await db
    .select()
    .from(mfgReworkTicketsTable)
    .where(eq(mfgReworkTicketsTable.id, id))
    .limit(1);
  if (!ticket) { res.status(404).json({ error: "Rework ticket not found" }); return; }
  res.json(ticket);
});

// PATCH /manufacturing/rework/:id
router.patch("/:id", async (req, res) => {
  const { id } = UpdateReworkTicketParams.parse({ id: req.params.id });
  const body = UpdateReworkTicketBody.parse(req.body);

  const [ticket] = await db
    .select({ id: mfgReworkTicketsTable.id })
    .from(mfgReworkTicketsTable)
    .where(eq(mfgReworkTicketsTable.id, id))
    .limit(1);
  if (!ticket) { res.status(404).json({ error: "Rework ticket not found" }); return; }

  const updateData: Record<string, unknown> = {};
  if (body.status !== undefined) {
    updateData.status = body.status;
    if (body.status === "resolved") updateData.resolvedAt = new Date();
  }
  if (body.assignedTechnician !== undefined) updateData.assignedTechnician = body.assignedTechnician;
  if (body.correctiveAction !== undefined) updateData.correctiveAction = body.correctiveAction;
  if (body.retestRequired !== undefined) updateData.retestRequired = body.retestRequired;

  const [updated] = await db
    .update(mfgReworkTicketsTable)
    .set(updateData)
    .where(eq(mfgReworkTicketsTable.id, id))
    .returning();

  res.json(updated);
});

export default router;
