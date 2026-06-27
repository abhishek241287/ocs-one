import { Router, IRouter } from "express";
import { db, logisticsDealersTable } from "@workspace/db";
import { eq, ilike, count, or, sql } from "drizzle-orm";
import {
  ListDealersQueryParams,
  GetDealerParams,
  UpdateDealerParams,
  DeleteDealerParams,
  CreateDealerBody,
  UpdateDealerBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

// GET /logistics/dealers
router.get("/", async (req, res) => {
  const { page = 1, pageSize = 20, search, status } = ListDealersQueryParams.parse(req.query);
  const offset = (page - 1) * pageSize;

  const conditions = [];
  if (search) {
    conditions.push(
      or(
        ilike(logisticsDealersTable.dealerName, `%${search}%`),
        ilike(logisticsDealersTable.dealerCode, `%${search}%`),
        ilike(logisticsDealersTable.territory, `%${search}%`)
      )
    );
  }
  if (status) {
    conditions.push(eq(logisticsDealersTable.status, status as "active" | "inactive"));
  }

  const where = conditions.length > 0 ? sql`${conditions.reduce((a, b) => sql`${a} AND ${b}`)}` : undefined;

  const [{ total }] = await db.select({ total: count() }).from(logisticsDealersTable).where(where);

  const items = await db
    .select()
    .from(logisticsDealersTable)
    .where(where)
    .orderBy(logisticsDealersTable.dealerName)
    .limit(pageSize)
    .offset(offset);

  res.json({ items, total: Number(total) });
});

// POST /logistics/dealers
router.post("/", async (req, res) => {
  const body = CreateDealerBody.parse(req.body);
  const [dealer] = await db
    .insert(logisticsDealersTable)
    .values({
      dealerCode: body.dealerCode,
      dealerName: body.dealerName,
      gstNumber: body.gstNumber ?? null,
      address: body.address ?? null,
      contactPerson: body.contactPerson ?? null,
      mobile: body.mobile ?? null,
      email: body.email ?? null,
      territory: body.territory ?? null,
      creditLimit: body.creditLimit != null ? String(body.creditLimit) : null,
      status: (body.status as "active" | "inactive") ?? "active",
    })
    .returning();
  res.status(201).json(dealer);
});

// GET /logistics/dealers/:id
router.get("/:id", async (req, res) => {
  const { id } = GetDealerParams.parse(req.params);
  const [dealer] = await db
    .select()
    .from(logisticsDealersTable)
    .where(eq(logisticsDealersTable.id, id))
    .limit(1);
  if (!dealer) { res.status(404).json({ error: "Dealer not found" }); return; }
  res.json(dealer);
});

// PUT /logistics/dealers/:id
router.put("/:id", async (req, res) => {
  const { id } = UpdateDealerParams.parse(req.params);
  const body = UpdateDealerBody.parse(req.body);

  const [existing] = await db
    .select({ id: logisticsDealersTable.id })
    .from(logisticsDealersTable)
    .where(eq(logisticsDealersTable.id, id))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Dealer not found" }); return; }

  const [updated] = await db
    .update(logisticsDealersTable)
    .set({
      dealerCode: body.dealerCode,
      dealerName: body.dealerName,
      gstNumber: body.gstNumber ?? null,
      address: body.address ?? null,
      contactPerson: body.contactPerson ?? null,
      mobile: body.mobile ?? null,
      email: body.email ?? null,
      territory: body.territory ?? null,
      creditLimit: body.creditLimit != null ? String(body.creditLimit) : null,
      status: (body.status as "active" | "inactive") ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(logisticsDealersTable.id, id))
    .returning();
  res.json(updated);
});

// DELETE /logistics/dealers/:id
router.delete("/:id", async (req, res) => {
  const { id } = DeleteDealerParams.parse(req.params);
  const [existing] = await db
    .select({ id: logisticsDealersTable.id })
    .from(logisticsDealersTable)
    .where(eq(logisticsDealersTable.id, id))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Dealer not found" }); return; }
  await db.delete(logisticsDealersTable).where(eq(logisticsDealersTable.id, id));
  res.status(204).send();
});

export default router;
