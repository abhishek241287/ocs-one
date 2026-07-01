import { Router, type IRouter, type Request, type Response } from "express";
import { eq, or, ilike, count, desc, and, type SQL } from "drizzle-orm";
import {
  db,
  warrantiesTable,
  customerRegistrationsTable,
  productsTable,
  productCategoriesTable,
  masterProductsTable,
  productEventsTable,
} from "@workspace/db";
import { VoidWarrantyBody } from "@workspace/api-zod";
import { requireRole } from "../../middleware/auth";
import { computeWarrantyStatus, warrantyByIdView } from "./warranty-service";

const router: IRouter = Router();

// GET /warranties — list with COMPUTED status (search + optional status filter).
// Status is computed per row, so the `status` query filter is applied in-memory
// after the page is materialized (the effective status is never a stored column).
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const statusFilter = typeof req.query.status === "string" ? req.query.status : "";

  const conditions: SQL[] = [];
  if (search) {
    const s = or(
      ilike(warrantiesTable.warrantyNumber, `%${search}%`),
      ilike(productsTable.officialProductSerial, `%${search}%`),
      ilike(customerRegistrationsTable.customerName, `%${search}%`),
    );
    if (s) conditions.push(s);
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const baseQuery = db
    .select({
      id: warrantiesTable.id,
      warranty_number: warrantiesTable.warrantyNumber,
      product_id: warrantiesTable.productId,
      registration_id: warrantiesTable.registrationId,
      start_date: warrantiesTable.startDate,
      period_months: warrantiesTable.periodMonths,
      end_date: warrantiesTable.endDate,
      voided_at: warrantiesTable.voidedAt,
      void_reason: warrantiesTable.voidReason,
      voided_by: warrantiesTable.voidedBy,
      created_at: warrantiesTable.createdAt,
      updated_at: warrantiesTable.updatedAt,
      product_serial: productsTable.officialProductSerial,
      customer_name: customerRegistrationsTable.customerName,
      category_name: productCategoriesTable.name,
      model_name: masterProductsTable.name,
    })
    .from(warrantiesTable)
    .leftJoin(productsTable, eq(warrantiesTable.productId, productsTable.id))
    .leftJoin(customerRegistrationsTable, eq(warrantiesTable.registrationId, customerRegistrationsTable.id))
    .leftJoin(productCategoriesTable, eq(productsTable.categoryId, productCategoriesTable.id))
    .leftJoin(masterProductsTable, eq(productsTable.modelId, masterProductsTable.id))
    .where(where);

  // When a computed-status filter is present we must compute over the full filtered
  // set, then paginate the filtered result; otherwise paginate at the DB.
  if (statusFilter) {
    const allRows = await baseQuery.orderBy(desc(warrantiesTable.createdAt));
    const withStatus = allRows.map((r) => ({
      ...r,
      status: computeWarrantyStatus({ voidedAt: r.voided_at, endDate: r.end_date }),
    }));
    const filtered = withStatus.filter((r) => r.status === statusFilter);
    const total = filtered.length;
    const start = (page - 1) * pageSize;
    res.json({ items: filtered.slice(start, start + pageSize), meta: { total, page, pageSize } });
    return;
  }

  const totalRows = await db
    .select({ n: count() })
    .from(warrantiesTable)
    .leftJoin(productsTable, eq(warrantiesTable.productId, productsTable.id))
    .leftJoin(customerRegistrationsTable, eq(warrantiesTable.registrationId, customerRegistrationsTable.id))
    .where(where);
  const total = Number(totalRows[0]?.n ?? 0);

  const rows = await baseQuery
    .orderBy(desc(warrantiesTable.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const items = rows.map((r) => ({
    ...r,
    status: computeWarrantyStatus({ voidedAt: r.voided_at, endDate: r.end_date }),
  }));
  res.json({ items, meta: { total, page, pageSize } });
});

// GET /warranties/:id — single warranty with COMPUTED status.
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const view = await warrantyByIdView(req.params.id as string);
  if (!view) {
    res.status(404).json({ error: "Warranty not found" });
    return;
  }
  res.json(view);
});

// POST /warranties/:id/void — void a warranty (mandatory reason). Persists the void
// (voided_at / reason / actor); the computed status then resolves to "void". One
// void per warranty (409 if already void). Re-check under a row lock (TOCTOU).
router.post(
  "/:id/void",
  requireRole("supervisor", "director"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = VoidWarrantyBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const reason = parsed.data.reason.trim();
    if (!reason) {
      res.status(400).json({ error: "A void reason is required" });
      return;
    }
    const id = req.params.id as string;
    const actor = req.user?.email ?? "unknown";

    const result = await db.transaction(async (tx) => {
      const [w] = await tx
        .select({
          id: warrantiesTable.id,
          productId: warrantiesTable.productId,
          warrantyNumber: warrantiesTable.warrantyNumber,
          voidedAt: warrantiesTable.voidedAt,
        })
        .from(warrantiesTable)
        .where(eq(warrantiesTable.id, id))
        .for("update")
        .limit(1);
      if (!w) return { kind: "not_found" as const };
      if (w.voidedAt) return { kind: "already_void" as const };

      await tx
        .update(warrantiesTable)
        .set({ voidedAt: new Date(), voidReason: reason, voidedBy: actor, updatedAt: new Date() })
        .where(eq(warrantiesTable.id, id));

      await tx.insert(productEventsTable).values({
        productId: w.productId,
        eventType: "warranty.voided",
        actor,
        description: `Warranty ${w.warrantyNumber} voided — ${reason}`,
        metadata: { warrantyId: id, warrantyNumber: w.warrantyNumber, reason },
      });

      return { kind: "ok" as const };
    });

    if (result.kind === "not_found") {
      res.status(404).json({ error: "Warranty not found" });
      return;
    }
    if (result.kind === "already_void") {
      res.status(409).json({ error: "Warranty is already void" });
      return;
    }

    const view = await warrantyByIdView(id);
    res.json(view);
  },
);

export default router;
