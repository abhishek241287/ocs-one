import { eq } from "drizzle-orm";
import {
  db,
  pool,
  productsTable,
  productGenealogyTable,
  productEventsTable,
  productCategoriesTable,
  masterProductsTable,
  grnHeadersTable,
} from "@workspace/db";

// ─── G1 — Imported Product creation (inverters) ───────────────────────────────
// Imported finished goods (Inbuilt Lithium / Hybrid inverters) are NOT manufactured
// on OCS — there is no production order, no BOM, no inventory consumption. They
// still become first-class serialized Products on the FROZEN Product Platform so
// every downstream module (Packing, Dispatch, Dealer, Warranty) treats them
// identically to manufactured units. This is a SEPARATE creation path from the
// order-based `createProductFromOrder` (which enforces the QC-PASS gate); it must
// never touch that engine.
//
// The Product's serial provenance is CATEGORY-driven:
//   • Inbuilt Lithium Inverter → OCS mints the official serial (LIV-YYYYMMDD-NNNNNN)
//   • Hybrid Inverter          → the OEM serial supplied by the manufacturer is the
//                                official serial (serial_source = MANUFACTURER)
// Both are created directly at `ready_for_packing` (they are finished goods accepted
// at incoming inspection — packable immediately).

const IMPORT_CATEGORY_CONFIG: Record<
  string,
  { serialSource: "OCS" | "MANUFACTURER"; workflowCode: string; serialPrefix?: string }
> = {
  INBUILT_LITHIUM_INVERTER: {
    serialSource: "OCS",
    workflowCode: "INBUILT_LITHIUM",
    serialPrefix: "LIV",
  },
  HYBRID_INVERTER: {
    serialSource: "MANUFACTURER",
    workflowCode: "HYBRID",
  },
};

export interface CreateImportedProductsInput {
  modelId: string;
  sourceGrnId?: string | null;
  quantity?: number;
  oemSerials?: string[];
  notes?: string;
}

export type CreateImportedProductsResult =
  | { kind: "model_not_found" }
  | { kind: "model_no_category" }
  | { kind: "not_importable"; categoryCode: string }
  | { kind: "missing_quantity" }
  | { kind: "missing_oem_serials" }
  | { kind: "duplicate_oem_in_request"; serials: string[] }
  | { kind: "grn_not_found" }
  | { kind: "ok"; ids: string[] };

// Race-safe OCS import serial (LIV-YYYYMMDD-NNNNNN) from a dedicated sequence.
async function nextImportSerial(prefix: string): Promise<string> {
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate(),
  ).padStart(2, "0")}`;
  const seqRes = await pool.query("SELECT nextval('product_import_seq') AS seq");
  return `${prefix}-${dateStr}-${String(seqRes.rows[0].seq).padStart(6, "0")}`;
}

export async function createImportedProducts(
  input: CreateImportedProductsInput,
  actor: string,
): Promise<CreateImportedProductsResult> {
  // Resolve the model → its category code (Product derives everything from the model).
  const [model] = await db
    .select({
      id: masterProductsTable.id,
      name: masterProductsTable.name,
      categoryId: masterProductsTable.categoryId,
      categoryCode: productCategoriesTable.code,
    })
    .from(masterProductsTable)
    .leftJoin(productCategoriesTable, eq(masterProductsTable.categoryId, productCategoriesTable.id))
    .where(eq(masterProductsTable.id, input.modelId))
    .limit(1);

  if (!model) return { kind: "model_not_found" };
  if (!model.categoryId || !model.categoryCode) return { kind: "model_no_category" };

  const config = IMPORT_CATEGORY_CONFIG[model.categoryCode];
  if (!config) return { kind: "not_importable", categoryCode: model.categoryCode };

  // Validate the optional GRN traceability link if provided.
  if (input.sourceGrnId) {
    const [grn] = await db
      .select({ id: grnHeadersTable.id })
      .from(grnHeadersTable)
      .where(eq(grnHeadersTable.id, input.sourceGrnId))
      .limit(1);
    if (!grn) return { kind: "grn_not_found" };
  }

  // Build the per-unit serial plan per the category's provenance rule.
  let units: { serial: string | null; oemSerial: string | null }[];
  if (config.serialSource === "OCS") {
    const qty = input.quantity ?? 0;
    if (!Number.isInteger(qty) || qty < 1) return { kind: "missing_quantity" };
    units = Array.from({ length: qty }, () => ({ serial: null, oemSerial: null }));
  } else {
    const serials = (input.oemSerials ?? []).map((s) => s.trim()).filter((s) => s.length > 0);
    if (serials.length === 0) return { kind: "missing_oem_serials" };
    // Reject in-request duplicates up-front (the DB unique constraint would catch
    // them too, but this gives a precise, actionable error).
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const s of serials) {
      if (seen.has(s)) dupes.add(s);
      seen.add(s);
    }
    if (dupes.size > 0) return { kind: "duplicate_oem_in_request", serials: [...dupes] };
    units = serials.map((s) => ({ serial: s, oemSerial: s }));
  }

  const now = new Date();
  const ids = await db.transaction(async (tx) => {
    const created: string[] = [];
    for (const unit of units) {
      // OCS-sourced units mint their serial inside the tx; MANUFACTURER units carry
      // the OEM serial as the official serial.
      const officialSerial =
        config.serialSource === "OCS" ? await nextImportSerial(config.serialPrefix!) : unit.serial!;

      const [row] = await tx
        .insert(productsTable)
        .values({
          categoryId: model.categoryId!,
          modelId: model.id,
          workflowCode: config.workflowCode,
          // Imported goods have no OCS production order.
          sourceProductionOrderId: null,
          officialProductSerial: officialSerial,
          serialSource: config.serialSource,
          qcStatus: "passed",
          productStatus: "ready_for_packing",
          manufacturingCompletedAt: now,
        })
        .returning({ id: productsTable.id });

      const productId = row.id;
      created.push(productId);

      // Minimal genealogy: the imported unit itself (captures the OEM serial when present).
      await tx.insert(productGenealogyTable).values({
        productId,
        componentType: "IMPORTED_UNIT",
        componentId: model.id,
        componentName: model.name,
        quantity: 1,
        serialNumber: unit.oemSerial,
        notes: input.notes ?? null,
      });

      await tx.insert(productEventsTable).values({
        productId,
        eventType: "product.created",
        actor,
        description: `Imported ${model.categoryCode} product created (${config.serialSource} serial ${officialSerial})`,
        metadata: {
          source: "imported",
          categoryCode: model.categoryCode,
          serialSource: config.serialSource,
          officialProductSerial: officialSerial,
          sourceGrnId: input.sourceGrnId ?? null,
        },
      });
    }
    return created;
  });

  return { kind: "ok", ids };
}
