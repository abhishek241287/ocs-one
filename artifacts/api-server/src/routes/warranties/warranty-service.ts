import { eq } from "drizzle-orm";
import {
  db,
  warrantiesTable,
  customerRegistrationsTable,
  productsTable,
  productCategoriesTable,
  masterProductsTable,
} from "@workspace/db";

// ─── G4 — Warranty common engine ──────────────────────────────────────────────
// Warranty effective status is COMPUTED, never a drifting stored column. This is
// the single source both the warranties API and the customers detail view use, so
// the two can never disagree. One engine serves ALL three product types (Battery,
// Lithium Inverter, Hybrid Inverter) — it keys only off dates + the void flag.
export type WarrantyStatus = "active" | "expired" | "void";

export function computeWarrantyStatus(w: {
  voidedAt: Date | null;
  endDate: string;
}): WarrantyStatus {
  if (w.voidedAt) return "void";
  // date columns are 'YYYY-MM-DD' strings; a lexical compare is a correct date
  // compare for that fixed format. today > end_date ⇒ expired.
  const todayStr = new Date().toISOString().split("T")[0];
  return todayStr > w.endDate ? "expired" : "active";
}

// Add whole months to a 'YYYY-MM-DD' date, returning the same string format.
// Month overflow (e.g. Jan 31 + 1) normalizes forward, which is acceptable for a
// warranty term expressed in whole months.
export function addMonths(dateStr: string, months: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().split("T")[0];
}

// Enriched, contract-shaped (snake_case) Warranty view with the COMPUTED status.
// Fetched by product_id (one warranty per product) for the customer detail view,
// or by warranty id for the warranties API.
async function selectWarranty(where: ReturnType<typeof eq>) {
  const [row] = await db
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
    .where(where)
    .limit(1);
  if (!row) return undefined;
  return { ...row, status: computeWarrantyStatus({ voidedAt: row.voided_at, endDate: row.end_date }) };
}

export async function warrantyDetailView(productId: string) {
  return selectWarranty(eq(warrantiesTable.productId, productId));
}

export async function warrantyByIdView(id: string) {
  return selectWarranty(eq(warrantiesTable.id, id));
}
