import { Router, type IRouter, type Request, type Response } from "express";
import { eq, inArray, and, or, ilike, count, desc } from "drizzle-orm";
import {
  db,
  pool,
  productsTable,
  productEventsTable,
  productCategoriesTable,
  masterProductsTable,
  logisticsDealersTable,
  dispatchesTable,
  dispatchItemsTable,
  dispatchReversalsTable,
} from "@workspace/db";
import { DispatchProductsBody, ReverseDispatchBody } from "@workspace/api-zod";
import { requireRole } from "../../middleware/auth";

const router: IRouter = Router();

// Postgres numeric/decimal strings → JS numbers; keep everything else as-is.
function numify<T extends Record<string, unknown>>(row: T): T {
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [
      k,
      typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v,
    ]),
  ) as T;
}

// Postgres 23505 (unique_violation) can be wrapped by Drizzle on `err.cause`.
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}

// Enriched, contract-shaped (snake_case) Product views — identical `Product` shape
// returned everywhere else (never raw camelCase rows).
async function selectProductViews(ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      id: productsTable.id,
      category_id: productsTable.categoryId,
      model_id: productsTable.modelId,
      workflow_code: productsTable.workflowCode,
      source_production_order_id: productsTable.sourceProductionOrderId,
      official_product_serial: productsTable.officialProductSerial,
      serial_source: productsTable.serialSource,
      qc_status: productsTable.qcStatus,
      product_status: productsTable.productStatus,
      current_location: productsTable.currentLocation,
      dealer_id: productsTable.dealerId,
      manufacturing_completed_at: productsTable.manufacturingCompletedAt,
      created_at: productsTable.createdAt,
      updated_at: productsTable.updatedAt,
      category_name: productCategoriesTable.name,
      model_code: masterProductsTable.code,
      model_name: masterProductsTable.name,
      dealer_name: logisticsDealersTable.dealerName,
    })
    .from(productsTable)
    .leftJoin(productCategoriesTable, eq(productsTable.categoryId, productCategoriesTable.id))
    .leftJoin(masterProductsTable, eq(productsTable.modelId, masterProductsTable.id))
    .leftJoin(logisticsDealersTable, eq(productsTable.dealerId, logisticsDealersTable.id))
    .where(inArray(productsTable.id, ids));
  return rows.map(numify);
}

// A dispatch's reversal status is derived from the presence of a reversal document
// (the header is immutable — never edited to mark "reversed").
async function dispatchDetailView(id: string) {
  const headerRows = await db
    .select({
      id: dispatchesTable.id,
      dispatch_number: dispatchesTable.dispatchNumber,
      invoice_number: dispatchesTable.invoiceNumber,
      dispatch_date: dispatchesTable.dispatchDate,
      dealer_id: dispatchesTable.dealerId,
      dispatched_by: dispatchesTable.dispatchedBy,
      item_count: dispatchesTable.itemCount,
      created_at: dispatchesTable.createdAt,
      // Dealer fields come from the immutable header SNAPSHOT (frozen at creation),
      // never the live dealer master — the issued Dispatch Note must not change.
      dealer_code: dispatchesTable.dealerCode,
      dealer_name: dispatchesTable.dealerName,
      dealer_address: dispatchesTable.dealerAddress,
      dealer_gst: dispatchesTable.dealerGst,
      dealer_contact: dispatchesTable.dealerContact,
      dealer_mobile: dispatchesTable.dealerMobile,
      reversal_reason: dispatchReversalsTable.reason,
      reversed_by: dispatchReversalsTable.reversedBy,
      reversed_at: dispatchReversalsTable.createdAt,
    })
    .from(dispatchesTable)
    .leftJoin(dispatchReversalsTable, eq(dispatchReversalsTable.dispatchId, dispatchesTable.id))
    .where(eq(dispatchesTable.id, id))
    .limit(1);
  if (headerRows.length === 0) return null;
  const h = headerRows[0];

  const itemRows = await db
    .select({
      id: dispatchItemsTable.id,
      product_id: dispatchItemsTable.productId,
      product_serial: dispatchItemsTable.productSerial,
      product_status: productsTable.productStatus,
      category_name: productCategoriesTable.name,
      model_code: masterProductsTable.code,
      model_name: masterProductsTable.name,
    })
    .from(dispatchItemsTable)
    .leftJoin(productsTable, eq(dispatchItemsTable.productId, productsTable.id))
    .leftJoin(productCategoriesTable, eq(productsTable.categoryId, productCategoriesTable.id))
    .leftJoin(masterProductsTable, eq(productsTable.modelId, masterProductsTable.id))
    .where(eq(dispatchItemsTable.dispatchId, id));

  return {
    id: h.id,
    dispatch_number: h.dispatch_number,
    invoice_number: h.invoice_number,
    dispatch_date: h.dispatch_date,
    dealer_id: h.dealer_id,
    dispatched_by: h.dispatched_by,
    item_count: h.item_count,
    status: h.reversed_at ? "reversed" : "dispatched",
    created_at: h.created_at,
    dealer: {
      code: h.dealer_code,
      name: h.dealer_name,
      address: h.dealer_address,
      gst_number: h.dealer_gst,
      contact_person: h.dealer_contact,
      mobile: h.dealer_mobile,
    },
    reversal: h.reversed_at
      ? { reason: h.reversal_reason, reversed_by: h.reversed_by, reversed_at: h.reversed_at }
      : null,
    items: itemRows,
  };
}

// ─── GET /dispatch — list dispatch documents (search + pagination) ────────────
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

  const filters = search
    ? or(
        ilike(dispatchesTable.dispatchNumber, `%${search}%`),
        ilike(dispatchesTable.invoiceNumber, `%${search}%`),
        ilike(dispatchesTable.dealerName, `%${search}%`),
      )
    : undefined;

  const totalRows = await db.select({ n: count() }).from(dispatchesTable).where(filters);
  const total = Number(totalRows[0]?.n ?? 0);

  const rows = await db
    .select({
      id: dispatchesTable.id,
      dispatch_number: dispatchesTable.dispatchNumber,
      invoice_number: dispatchesTable.invoiceNumber,
      dispatch_date: dispatchesTable.dispatchDate,
      dealer_id: dispatchesTable.dealerId,
      dealer_name: dispatchesTable.dealerName,
      dispatched_by: dispatchesTable.dispatchedBy,
      item_count: dispatchesTable.itemCount,
      created_at: dispatchesTable.createdAt,
      reversed_at: dispatchReversalsTable.createdAt,
    })
    .from(dispatchesTable)
    .leftJoin(dispatchReversalsTable, eq(dispatchReversalsTable.dispatchId, dispatchesTable.id))
    .where(filters)
    .orderBy(desc(dispatchesTable.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const items = rows.map((r) => ({
    id: r.id,
    dispatch_number: r.dispatch_number,
    invoice_number: r.invoice_number,
    dispatch_date: r.dispatch_date,
    dealer_id: r.dealer_id,
    dealer_name: r.dealer_name,
    dispatched_by: r.dispatched_by,
    item_count: r.item_count,
    status: r.reversed_at ? "reversed" : "dispatched",
    reversed_at: r.reversed_at,
    created_at: r.created_at,
  }));

  res.json({ items, meta: { total, page, pageSize } });
});

// ─── GET /dispatch/:id — dispatch document detail (powers the printable note) ──
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const view = await dispatchDetailView(req.params.id as string);
  if (!view) {
    res.status(404).json({ error: "Dispatch not found" });
    return;
  }
  res.json(view);
});

// ─── POST /dispatch — dispatch a batch of packed products to a dealer ──────────
// Atomic & fail-fast. D1: the dealer must exist AND be active. D2: the dispatch
// number is system-generated (unique by construction) and the invoice number is
// DB-unique (duplicate → 409). Every product must be `packed`, else nothing is
// written. On success each product transitions packed → dispatched, the dealer is
// assigned, a Dispatch document (header + items) is created, and an immutable
// `product.dispatched` event is appended to the unified Product timeline.
router.post(
  "/",
  requireRole("supervisor", "director"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = DispatchProductsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { dealer_id, dispatch_date, invoice_number } = parsed.data;
    // Drizzle `date()` columns accept strings only; zod coerces to a Date object.
    const dispatchDateStr = new Date(dispatch_date).toISOString().split("T")[0];
    const invoice = invoice_number.trim();
    if (!invoice) {
      res.status(400).json({ error: "Invoice number is required" });
      return;
    }
    // De-duplicate ids so a repeated id never double-counts or self-conflicts.
    const ids: string[] = Array.from(new Set<string>(parsed.data.product_ids));
    const actor = req.user?.email ?? "unknown";

    let result:
      | { kind: "no_dealer" }
      | { kind: "inactive_dealer" }
      | { kind: "invalid"; invalid: { product_id: string; serial?: string; reason: string }[] }
      | { kind: "ok"; dispatchId: string; dispatchNumber: string };

    try {
      result = await db.transaction(async (tx) => {
        const dealer = await tx
          .select({
            id: logisticsDealersTable.id,
            name: logisticsDealersTable.dealerName,
            code: logisticsDealersTable.dealerCode,
            address: logisticsDealersTable.address,
            gst: logisticsDealersTable.gstNumber,
            contact: logisticsDealersTable.contactPerson,
            mobile: logisticsDealersTable.mobile,
            status: logisticsDealersTable.status,
          })
          .from(logisticsDealersTable)
          .where(eq(logisticsDealersTable.id, dealer_id))
          .limit(1);
        if (dealer.length === 0) {
          return { kind: "no_dealer" as const };
        }
        if (dealer[0].status !== "active") {
          return { kind: "inactive_dealer" as const };
        }

        // Lock every targeted product row up-front to close the TOCTOU window
        // between the eligibility check and the write.
        const rows = await tx
          .select({
            id: productsTable.id,
            serial: productsTable.officialProductSerial,
            status: productsTable.productStatus,
          })
          .from(productsTable)
          .where(inArray(productsTable.id, ids))
          .for("update");

        const found = new Map(rows.map((r) => [r.id, r]));
        const invalid: { product_id: string; serial?: string; reason: string }[] = [];
        for (const id of ids) {
          const row = found.get(id);
          if (!row) {
            invalid.push({ product_id: id, reason: "not_found" });
            continue;
          }
          if (row.status !== "packed") {
            invalid.push({
              product_id: id,
              serial: row.serial,
              reason: `not_packed:${row.status}`,
            });
          }
        }
        if (invalid.length > 0) {
          return { kind: "invalid" as const, invalid };
        }

        // Race-safe Dispatch number (DIS-YYYYMMDD-NNNNNN) from a dedicated sequence.
        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
        const seqRes = await pool.query("SELECT nextval('dispatch_seq') AS seq");
        const dispatchNumber = `DIS-${dateStr}-${String(seqRes.rows[0].seq).padStart(6, "0")}`;

        // Header insert — UNIQUE(invoice_number) enforces D2 (duplicate → 23505 → 409).
        const inserted = await tx
          .insert(dispatchesTable)
          .values({
            dispatchNumber,
            invoiceNumber: invoice,
            dispatchDate: dispatchDateStr,
            dealerId: dealer_id,
            dealerCode: dealer[0].code,
            dealerName: dealer[0].name,
            dealerAddress: dealer[0].address,
            dealerGst: dealer[0].gst,
            dealerContact: dealer[0].contact,
            dealerMobile: dealer[0].mobile,
            dispatchedBy: actor,
            itemCount: ids.length,
          })
          .returning({ id: dispatchesTable.id });
        const dispatchId = inserted[0].id;

        await tx.insert(dispatchItemsTable).values(
          rows.map((r) => ({
            dispatchId,
            productId: r.id,
            productSerial: r.serial,
          })),
        );

        await tx
          .update(productsTable)
          .set({ productStatus: "dispatched", dealerId: dealer_id, updatedAt: new Date() })
          .where(inArray(productsTable.id, ids));

        await tx.insert(productEventsTable).values(
          ids.map((id) => ({
            productId: id,
            eventType: "product.dispatched",
            actor,
            description: `Dispatched to ${dealer[0].name} — ${dispatchNumber} (invoice ${invoice}) on ${dispatchDateStr}`,
            metadata: {
              dispatchId,
              dispatchNumber,
              dispatchDate: dispatchDateStr,
              invoiceNumber: invoice,
              dealerId: dealer_id,
              dealerName: dealer[0].name,
            },
          })),
        );

        return { kind: "ok" as const, dispatchId, dispatchNumber };
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ error: `Invoice number "${invoice}" has already been used` });
        return;
      }
      throw err;
    }

    if (result.kind === "no_dealer") {
      res.status(404).json({ error: "Dealer not found" });
      return;
    }
    if (result.kind === "inactive_dealer") {
      res.status(422).json({ error: "Dealer is inactive — cannot dispatch to an inactive dealer" });
      return;
    }
    if (result.kind === "invalid") {
      res.status(422).json({
        error: "One or more products are not in packed",
        invalid: result.invalid,
      });
      return;
    }

    const items = await selectProductViews(ids);
    res.json({
      dispatched: items.length,
      dispatch_id: result.dispatchId,
      dispatch_number: result.dispatchNumber,
      items,
    });
  },
);

// ─── POST /dispatch/:id/reverse — append-only dispatch reversal (D4) ───────────
// Never deletes or edits the original dispatch. Restores each product to `packed`
// and clears its dealer assignment, records an immutable reversal document, and
// appends a `product.dispatch_reversed` event per product. One reversal per
// dispatch (UNIQUE dispatch_id). The original dispatch document is preserved.
router.post(
  "/:id/reverse",
  requireRole("supervisor", "director"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = ReverseDispatchBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const reason = parsed.data.reason.trim();
    if (!reason) {
      res.status(400).json({ error: "A reversal reason is required" });
      return;
    }
    const dispatchId = req.params.id as string;
    const actor = req.user?.email ?? "unknown";

    let result:
      | { kind: "not_found" }
      | { kind: "already_reversed" }
      | { kind: "invalid"; invalid: { product_id: string; serial?: string; reason: string }[] }
      | { kind: "ok" };

    try {
      result = await db.transaction(async (tx) => {
        const headers = await tx
          .select({
            id: dispatchesTable.id,
            dispatchNumber: dispatchesTable.dispatchNumber,
            dealerId: dispatchesTable.dealerId,
          })
          .from(dispatchesTable)
          .where(eq(dispatchesTable.id, dispatchId))
          .for("update")
          .limit(1);
        if (headers.length === 0) {
          return { kind: "not_found" as const };
        }
        const header = headers[0];

        const existing = await tx
          .select({ id: dispatchReversalsTable.id })
          .from(dispatchReversalsTable)
          .where(eq(dispatchReversalsTable.dispatchId, dispatchId))
          .limit(1);
        if (existing.length > 0) {
          return { kind: "already_reversed" as const };
        }

        const itemRows = await tx
          .select({ productId: dispatchItemsTable.productId, serial: dispatchItemsTable.productSerial })
          .from(dispatchItemsTable)
          .where(eq(dispatchItemsTable.dispatchId, dispatchId));
        const productIds = itemRows.map((r) => r.productId);

        // Lock the products and verify each is still dispatched to THIS dealer; a
        // product moved on (re-dispatched elsewhere / different state) must not be
        // silently clobbered.
        const products = await tx
          .select({
            id: productsTable.id,
            serial: productsTable.officialProductSerial,
            status: productsTable.productStatus,
            dealerId: productsTable.dealerId,
          })
          .from(productsTable)
          .where(inArray(productsTable.id, productIds))
          .for("update");
        const pmap = new Map(products.map((p) => [p.id, p]));
        const invalid: { product_id: string; serial?: string; reason: string }[] = [];
        for (const it of itemRows) {
          const p = pmap.get(it.productId);
          if (!p) {
            invalid.push({ product_id: it.productId, serial: it.serial, reason: "not_found" });
            continue;
          }
          if (p.status !== "dispatched" || p.dealerId !== header.dealerId) {
            invalid.push({
              product_id: it.productId,
              serial: p.serial,
              reason: `not_reversible:${p.status}`,
            });
          }
        }
        if (invalid.length > 0) {
          return { kind: "invalid" as const, invalid };
        }

        await tx
          .update(productsTable)
          .set({ productStatus: "packed", dealerId: null, updatedAt: new Date() })
          .where(inArray(productsTable.id, productIds));

        await tx.insert(dispatchReversalsTable).values({
          dispatchId,
          reason,
          reversedBy: actor,
        });

        await tx.insert(productEventsTable).values(
          productIds.map((id) => ({
            productId: id,
            eventType: "product.dispatch_reversed",
            actor,
            description: `Dispatch ${header.dispatchNumber} reversed — ${reason}`,
            metadata: {
              dispatchId,
              dispatchNumber: header.dispatchNumber,
              reason,
            },
          })),
        );

        return { kind: "ok" as const };
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ error: "Dispatch has already been reversed" });
        return;
      }
      throw err;
    }

    if (result.kind === "not_found") {
      res.status(404).json({ error: "Dispatch not found" });
      return;
    }
    if (result.kind === "already_reversed") {
      res.status(409).json({ error: "Dispatch has already been reversed" });
      return;
    }
    if (result.kind === "invalid") {
      res.status(422).json({
        error: "One or more products can no longer be reversed",
        invalid: result.invalid,
      });
      return;
    }

    const view = await dispatchDetailView(dispatchId);
    res.json(view);
  },
);

export default router;
