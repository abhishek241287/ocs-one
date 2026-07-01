import { Router, type IRouter, type Request, type Response } from "express";
import { eq, or, ilike, count, desc } from "drizzle-orm";
import {
  db,
  pool,
  customerRegistrationsTable,
  warrantiesTable,
  productsTable,
  productEventsTable,
  productCategoriesTable,
  masterProductsTable,
  logisticsDealersTable,
} from "@workspace/db";
import { CreateCustomerRegistrationBody } from "@workspace/api-zod";
import { requireRole } from "../../middleware/auth";
import { computeWarrantyStatus, addMonths, warrantyDetailView } from "../warranties/warranty-service";

const router: IRouter = Router();

// Postgres 23505 (unique_violation) can be wrapped by Drizzle on `err.cause`.
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}

// A customer registration is valid only once a Product has left the factory to a
// dealer (dispatched or delivered). Registration BEFORE dispatch would let a unit
// still on the floor be "owned" by a customer.
const REGISTERABLE_STATUSES = new Set(["dispatched", "delivered_to_dealer"]);

// Enriched, contract-shaped (snake_case) registration view — single source used by
// list + detail so every response has the identical `CustomerRegistration` shape.
async function selectRegistrationView(id: string) {
  const [row] = await db
    .select({
      id: customerRegistrationsTable.id,
      registration_number: customerRegistrationsTable.registrationNumber,
      product_id: customerRegistrationsTable.productId,
      dealer_id: customerRegistrationsTable.dealerId,
      customer_name: customerRegistrationsTable.customerName,
      mobile: customerRegistrationsTable.mobile,
      address: customerRegistrationsTable.address,
      installation_date: customerRegistrationsTable.installationDate,
      registered_by: customerRegistrationsTable.registeredBy,
      created_at: customerRegistrationsTable.createdAt,
      updated_at: customerRegistrationsTable.updatedAt,
      product_serial: productsTable.officialProductSerial,
      product_status: productsTable.productStatus,
      category_name: productCategoriesTable.name,
      model_name: masterProductsTable.name,
      dealer_name: logisticsDealersTable.dealerName,
    })
    .from(customerRegistrationsTable)
    .leftJoin(productsTable, eq(customerRegistrationsTable.productId, productsTable.id))
    .leftJoin(productCategoriesTable, eq(productsTable.categoryId, productCategoriesTable.id))
    .leftJoin(masterProductsTable, eq(productsTable.modelId, masterProductsTable.id))
    .leftJoin(logisticsDealersTable, eq(customerRegistrationsTable.dealerId, logisticsDealersTable.id))
    .where(eq(customerRegistrationsTable.id, id))
    .limit(1);
  return row;
}

// GET /customers/registrations — list (search + pagination).
router.get("/registrations", async (req: Request, res: Response): Promise<void> => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

  const filters = search
    ? or(
        ilike(customerRegistrationsTable.registrationNumber, `%${search}%`),
        ilike(customerRegistrationsTable.customerName, `%${search}%`),
        ilike(customerRegistrationsTable.mobile, `%${search}%`),
        ilike(productsTable.officialProductSerial, `%${search}%`),
      )
    : undefined;

  const totalRows = await db
    .select({ n: count() })
    .from(customerRegistrationsTable)
    .leftJoin(productsTable, eq(customerRegistrationsTable.productId, productsTable.id))
    .where(filters);
  const total = Number(totalRows[0]?.n ?? 0);

  const rows = await db
    .select({
      id: customerRegistrationsTable.id,
      registration_number: customerRegistrationsTable.registrationNumber,
      product_id: customerRegistrationsTable.productId,
      dealer_id: customerRegistrationsTable.dealerId,
      customer_name: customerRegistrationsTable.customerName,
      mobile: customerRegistrationsTable.mobile,
      address: customerRegistrationsTable.address,
      installation_date: customerRegistrationsTable.installationDate,
      registered_by: customerRegistrationsTable.registeredBy,
      created_at: customerRegistrationsTable.createdAt,
      updated_at: customerRegistrationsTable.updatedAt,
      product_serial: productsTable.officialProductSerial,
      product_status: productsTable.productStatus,
      category_name: productCategoriesTable.name,
      model_name: masterProductsTable.name,
      dealer_name: logisticsDealersTable.dealerName,
    })
    .from(customerRegistrationsTable)
    .leftJoin(productsTable, eq(customerRegistrationsTable.productId, productsTable.id))
    .leftJoin(productCategoriesTable, eq(productsTable.categoryId, productCategoriesTable.id))
    .leftJoin(masterProductsTable, eq(productsTable.modelId, masterProductsTable.id))
    .leftJoin(logisticsDealersTable, eq(customerRegistrationsTable.dealerId, logisticsDealersTable.id))
    .where(filters)
    .orderBy(desc(customerRegistrationsTable.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  res.json({ items: rows, meta: { total, page, pageSize } });
});

// GET /customers/registrations/:id — detail (registration + warranty).
router.get("/registrations/:id", async (req: Request, res: Response): Promise<void> => {
  const view = await selectRegistrationView(req.params.id as string);
  if (!view) {
    res.status(404).json({ error: "Registration not found" });
    return;
  }
  const warranty = await warrantyDetailView(view.product_id as string);
  res.json({ ...view, warranty });
});

// POST /customers/registrations — register an end customer for a dispatched product.
// Atomic: resolves the product by its official serial, verifies it has been
// dispatched to a dealer, records the registration, AND auto-creates the warranty
// (start = installation_date; period snapshotted from the model) in the same tx.
router.post(
  "/registrations",
  requireRole("supervisor", "director"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = CreateCustomerRegistrationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { product_serial, customer_name, mobile, address } = parsed.data;
    // Drizzle `date()` columns accept strings only; zod coerces to a Date object.
    const installationDate = new Date(parsed.data.installation_date).toISOString().split("T")[0];
    const actor = req.user?.email ?? "unknown";

    type Result =
      | { kind: "product_not_found" }
      | { kind: "not_dispatched"; status: string }
      | { kind: "no_dealer" }
      | { kind: "dealer_not_found" }
      | { kind: "dealer_inactive" }
      | { kind: "ok"; id: string; productId: string };

    let result: Result;
    try {
      result = await db.transaction(async (tx): Promise<Result> => {
        const [product] = await tx
          .select({
            id: productsTable.id,
            status: productsTable.productStatus,
            dealerId: productsTable.dealerId,
            modelId: productsTable.modelId,
          })
          .from(productsTable)
          .where(eq(productsTable.officialProductSerial, product_serial.trim()))
          .for("update")
          .limit(1);
        if (!product) return { kind: "product_not_found" };
        if (!REGISTERABLE_STATUSES.has(product.status)) {
          return { kind: "not_dispatched", status: product.status };
        }

        // Dealer resolution: explicit dealer_id wins, else the product's assigned dealer.
        const dealerId = parsed.data.dealer_id ?? product.dealerId;
        if (!dealerId) return { kind: "no_dealer" };
        const [dealer] = await tx
          .select({ id: logisticsDealersTable.id, status: logisticsDealersTable.status })
          .from(logisticsDealersTable)
          .where(eq(logisticsDealersTable.id, dealerId))
          .limit(1);
        if (!dealer) return { kind: "dealer_not_found" };
        if (dealer.status !== "active") return { kind: "dealer_inactive" };

        // Warranty period snapshotted from the model (a later model edit never
        // retroactively changes an issued warranty).
        const [model] = await tx
          .select({ warrantyPeriodMonths: masterProductsTable.warrantyPeriodMonths })
          .from(masterProductsTable)
          .where(eq(masterProductsTable.id, product.modelId))
          .limit(1);
        const periodMonths = model?.warrantyPeriodMonths ?? 0;

        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
        const regSeq = await pool.query("SELECT nextval('customer_registration_seq') AS seq");
        const registrationNumber = `CUST-${dateStr}-${String(regSeq.rows[0].seq).padStart(6, "0")}`;

        const [reg] = await tx
          .insert(customerRegistrationsTable)
          .values({
            registrationNumber,
            productId: product.id,
            dealerId,
            customerName: customer_name.trim(),
            mobile: mobile.trim(),
            address: address.trim(),
            installationDate,
            registeredBy: actor,
          })
          .returning({ id: customerRegistrationsTable.id });

        const wSeq = await pool.query("SELECT nextval('warranty_seq') AS seq");
        const warrantyNumber = `WRN-${dateStr}-${String(wSeq.rows[0].seq).padStart(6, "0")}`;
        const endDate = addMonths(installationDate, periodMonths);
        await tx.insert(warrantiesTable).values({
          warrantyNumber,
          productId: product.id,
          registrationId: reg.id,
          startDate: installationDate,
          periodMonths,
          endDate,
        });

        await tx.insert(productEventsTable).values({
          productId: product.id,
          eventType: "product.registered",
          actor,
          description: `Registered to ${customer_name.trim()} (${mobile.trim()}); warranty ${warrantyNumber} → ${endDate}`,
          metadata: {
            registrationNumber,
            warrantyNumber,
            installationDate,
            endDate,
            dealerId,
          },
        });

        return { kind: "ok", id: reg.id, productId: product.id };
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ error: "This product has already been registered" });
        return;
      }
      throw err;
    }

    switch (result.kind) {
      case "product_not_found":
        res.status(404).json({ error: "No product found with that serial" });
        return;
      case "not_dispatched":
        res.status(422).json({
          error: `Product is not dispatched yet (status: ${result.status}) — register only after dispatch`,
        });
        return;
      case "no_dealer":
        res.status(422).json({ error: "No dealer for this product — provide dealer_id" });
        return;
      case "dealer_not_found":
        res.status(404).json({ error: "Dealer not found" });
        return;
      case "dealer_inactive":
        res.status(422).json({ error: "Dealer is inactive" });
        return;
      case "ok": {
        const view = await selectRegistrationView(result.id);
        const warranty = await warrantyDetailView(result.productId);
        res.status(201).json({ ...view, warranty });
        return;
      }
    }
  },
);

export default router;
export { computeWarrantyStatus };
