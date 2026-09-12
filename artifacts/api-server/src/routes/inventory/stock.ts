import { Router, type IRouter, type Request, type Response } from "express";
import { eq, asc, desc, sql, and, or, ilike, count, inArray, type SQL } from "drizzle-orm";
import {
  db,
  materialsTable,
  inventoryTransactionsTable,
  grnHeadersTable,
  grnLineItemsTable,
  suppliersTable,
  incomingInspectionsTable,
  incomingInspectionLinesTable,
  usersTable,
} from "@workspace/db";
import { requireWriteRole } from "../../middleware/auth";
import {
  resolveLinkedMaster,
  type LinkedMasterType,
  type LinkedMasterSummary,
} from "../../lib/linked-master";

const router: IRouter = Router();

// Stock is a read-only projection of the immutable inventory ledger. Reads pass for any
// authed user; the guard exists only so any future write here is supervisor+director.
router.use(requireWriteRole("supervisor", "director"));

const STOCK_STATES = ["inspection_pending", "available", "rejected"] as const;
type StockState = (typeof STOCK_STATES)[number];

const LINKED_MASTER_TYPES = [
  "CELL",
  "BMS",
  "CABLE",
  "BUSBAR",
  "CONNECTOR",
  "CHARGER",
  "CABINET",
] as const;

const USAGE_TYPES = [
  "INVENTORY_COMPONENT",
  "CONSUMABLE",
  "PACKAGING",
  "SERVICE_ITEM",
] as const;

// ─── On-hand stock by material + stock_state ─────────────────────────────────
// The ledger is append-only with SIGNED quantities (a release is negative), so the
// current on-hand for each (material, state) is simply SUM(quantity). Zero-net buckets
// are dropped (HAVING) so a fully-released inspection_pending hold disappears.
// INV-003: search (material code/name) + stock_state filter + server pagination.
// M5: master_type + usage_type filters (the single unified inventory page — tabs are
// just filters over ONE projection) + per-row enrichment (usage_type + linked master
// summary) so every stock row self-describes against the FROZEN signed ledger. The
// linked master is DERIVED at read time (material → linked_master_type/id → master),
// never denormalized into the ledger.
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 25));
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const stateParam = req.query.stock_state;
  const stockState =
    typeof stateParam === "string" && (STOCK_STATES as readonly string[]).includes(stateParam)
      ? (stateParam as StockState)
      : undefined;
  const masterTypeParam = req.query.master_type;
  const masterType =
    typeof masterTypeParam === "string" &&
    (LINKED_MASTER_TYPES as readonly string[]).includes(masterTypeParam)
      ? (masterTypeParam as LinkedMasterType)
      : undefined;
  const usageTypeParam = req.query.usage_type;
  const usageType =
    typeof usageTypeParam === "string" && (USAGE_TYPES as readonly string[]).includes(usageTypeParam)
      ? usageTypeParam
      : undefined;

  const filters: SQL[] = [];
  if (search) {
    filters.push(
      or(ilike(materialsTable.code, `%${search}%`), ilike(materialsTable.name, `%${search}%`)) as SQL,
    );
  }
  if (stockState) {
    filters.push(eq(inventoryTransactionsTable.stockState, stockState));
  }
  if (masterType) {
    filters.push(eq(materialsTable.linkedMasterType, masterType));
  }
  if (usageType) {
    filters.push(eq(materialsTable.usageType, usageType as any));
  }
  const where = filters.length ? and(...filters) : undefined;

  // Aggregate per (material, state) on-hand as a subquery so we can both COUNT the
  // groups (for pagination meta) and slice a page off the same projection. The
  // material's usage_type + linked master pointer are IMMUTABLE once transacted
  // (Rules 4/5), so grouping by them is safe and never fragments a bucket.
  const grouped = db
    .select({
      material_id: inventoryTransactionsTable.materialId,
      material_code: materialsTable.code,
      material_name: materialsTable.name,
      usage_type: materialsTable.usageType,
      linked_master_type: materialsTable.linkedMasterType,
      linked_master_id: materialsTable.linkedMasterId,
      uom: inventoryTransactionsTable.uom,
      stock_state: inventoryTransactionsTable.stockState,
      quantity: sql<string>`sum(${inventoryTransactionsTable.quantity})`.as("quantity"),
    })
    .from(inventoryTransactionsTable)
    .innerJoin(materialsTable, eq(materialsTable.id, inventoryTransactionsTable.materialId))
    .where(where)
    .groupBy(
      inventoryTransactionsTable.materialId,
      materialsTable.code,
      materialsTable.name,
      materialsTable.usageType,
      materialsTable.linkedMasterType,
      materialsTable.linkedMasterId,
      inventoryTransactionsTable.uom,
      inventoryTransactionsTable.stockState,
    )
    .having(sql`sum(${inventoryTransactionsTable.quantity}) <> 0`)
    .as("grouped");

  const [{ total: totalRaw }] = await db.select({ total: count() }).from(grouped);
  const total = Number(totalRaw);

  const rows = await db
    .select()
    .from(grouped)
    .orderBy(asc(grouped.material_code), asc(grouped.stock_state))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  // Resolve the linked component master once per distinct (type,id) on this page,
  // reusing the SAME resolver the material-write + GRN paths use (single source of truth).
  const linkedCache = new Map<string, LinkedMasterSummary | null>();
  for (const r of rows) {
    if (!r.linked_master_type || !r.linked_master_id) continue;
    const key = `${r.linked_master_type}:${r.linked_master_id}`;
    if (!linkedCache.has(key)) {
      linkedCache.set(
        key,
        await resolveLinkedMaster(r.linked_master_type as LinkedMasterType, r.linked_master_id),
      );
    }
  }

  res.json({
    items: rows.map((r) => ({
      material_id: r.material_id,
      material_code: r.material_code,
      material_name: r.material_name,
      usage_type: r.usage_type ?? null,
      linked_master:
        r.linked_master_type && r.linked_master_id
          ? linkedCache.get(`${r.linked_master_type}:${r.linked_master_id}`) ?? null
          : null,
      uom: r.uom,
      stock_state: r.stock_state,
      quantity: Number(r.quantity),
    })),
    meta: {
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  });
});

// ─── Per-material provenance drill-down (read-only) ──────────────────────────
// Answers "where did this material's stock come from?" WITHOUT denormalizing
// Supplier/GRN/Inspection onto stock rows (the main page stays a pure ledger
// projection). One row per contributing posted-GRN receipt line, joined to its
// supplier + (if any) incoming inspection. `remaining_available_qty` is DERIVED
// from the signed ledger by source_line_id — the exact pattern the cell-stock
// transfer picker already proves — so it nets receipts + inspection accepts −
// transfers with NO new tables and NO change to inventory calculations.
router.get("/:materialId/provenance", async (req: Request, res: Response): Promise<void> => {
  const materialId = String(req.params.materialId);

  const [material] = await db
    .select({
      id: materialsTable.id,
      code: materialsTable.code,
      name: materialsTable.name,
      usage_type: materialsTable.usageType,
      linked_master_type: materialsTable.linkedMasterType,
      linked_master_id: materialsTable.linkedMasterId,
    })
    .from(materialsTable)
    .where(eq(materialsTable.id, materialId))
    .limit(1);

  if (!material) {
    res.status(404).json({ error: "Material not found" });
    return;
  }

  // Every posted-GRN receipt line for this material, with supplier + an aggregated
  // latest inspection context. Reinspection creates multiple event rows per line,
  // so the summary must be grouped before it is joined to the receipt projection.
  const inspectionSummary = db
    .select({
      grnLineId: incomingInspectionLinesTable.grnLineId,
      inspectionId: sql<string | null>`(array_agg(${incomingInspectionsTable.id} ORDER BY ${incomingInspectionLinesTable.createdAt} DESC))[1]`.as("inspection_id"),
      inspectionNumber: sql<string | null>`(array_agg(${incomingInspectionsTable.inspectionNumber} ORDER BY ${incomingInspectionLinesTable.createdAt} DESC))[1]`.as("inspection_number"),
      inspectorId: sql<string | null>`(array_agg(${usersTable.id} ORDER BY ${incomingInspectionLinesTable.createdAt} DESC))[1]`.as("inspector_id"),
      inspectorName: sql<string | null>`(array_agg(${usersTable.name} ORDER BY ${incomingInspectionLinesTable.createdAt} DESC))[1]`.as("inspector_name"),
      acceptedQty: sql<string>`sum(${incomingInspectionLinesTable.acceptedQty})`.as("accepted_qty"),
      rejectedQty: sql<string>`sum(${incomingInspectionLinesTable.rejectedQty})`.as("rejected_qty"),
    })
    .from(incomingInspectionLinesTable)
    .innerJoin(
      incomingInspectionsTable,
      eq(incomingInspectionsTable.id, incomingInspectionLinesTable.inspectionId),
    )
    .leftJoin(usersTable, eq(usersTable.id, incomingInspectionsTable.inspectedBy))
    .groupBy(incomingInspectionLinesTable.grnLineId)
    .as("inspection_summary");

  const receipts = await db
    .select({
      grn_id: grnHeadersTable.id,
      grn_number: grnHeadersTable.grnNumber,
      received_date: grnHeadersTable.receivedDate,
      supplier_id: suppliersTable.id,
      supplier_name: suppliersTable.name,
      grn_line_id: grnLineItemsTable.id,
      received_qty: grnLineItemsTable.quantityReceived,
      uom: grnLineItemsTable.uom,
      inspection_status: grnLineItemsTable.inspectionStatus,
       inspection_id: sql<string | null>`"inspection_summary"."inspection_id"`.as("inspection_id"),
       inspection_number: sql<string | null>`"inspection_summary"."inspection_number"`.as("inspection_number"),
       inspector_id: sql<string | null>`"inspection_summary"."inspector_id"`.as("inspector_id"),
       inspector_name: sql<string | null>`"inspection_summary"."inspector_name"`.as("inspector_name"),
       accepted_qty: sql<string | null>`"inspection_summary"."accepted_qty"`.as("accepted_qty"),
       rejected_qty: sql<string | null>`"inspection_summary"."rejected_qty"`.as("rejected_qty"),
    })
    .from(grnLineItemsTable)
    .innerJoin(
      grnHeadersTable,
      and(eq(grnHeadersTable.id, grnLineItemsTable.grnId), eq(grnHeadersTable.status, "posted")),
    )
    .innerJoin(suppliersTable, eq(suppliersTable.id, grnHeadersTable.supplierId))
    .leftJoin(
      inspectionSummary,
      eq(inspectionSummary.grnLineId, grnLineItemsTable.id),
    )
    .where(eq(grnLineItemsTable.materialId, materialId))
    .orderBy(desc(grnHeadersTable.receivedDate), desc(grnHeadersTable.grnNumber));

  // Ledger-derived remaining AVAILABLE per contributing GRN line: SUM of signed
  // 'available' txns keyed on source_line_id (receipts + inspection accepts are
  // positive, transfers out are negative). Never overwritten — always projected.
  const lineIds = receipts.map((r) => r.grn_line_id);
  const availableByLine = new Map<string, number>();
  if (lineIds.length) {
    const balances = await db
      .select({
        source_line_id: inventoryTransactionsTable.sourceLineId,
        available: sql<string>`sum(${inventoryTransactionsTable.quantity})`,
      })
      .from(inventoryTransactionsTable)
      .where(
        and(
          inArray(inventoryTransactionsTable.sourceLineId, lineIds),
          eq(inventoryTransactionsTable.stockState, "available"),
        ),
      )
      .groupBy(inventoryTransactionsTable.sourceLineId);
    for (const b of balances) {
      availableByLine.set(b.source_line_id, Number(b.available));
    }
  }

  const linkedMaster: LinkedMasterSummary | null =
    material.linked_master_type && material.linked_master_id
      ? await resolveLinkedMaster(
          material.linked_master_type as LinkedMasterType,
          material.linked_master_id,
        )
      : null;

  res.json({
    material_id: material.id,
    material_code: material.code,
    material_name: material.name,
    usage_type: material.usage_type ?? null,
    linked_master: linkedMaster,
    receipts: receipts.map((r) => ({
      grn_id: r.grn_id,
      grn_number: r.grn_number,
      supplier_id: r.supplier_id,
      supplier_name: r.supplier_name,
      received_date: r.received_date,
      grn_line_id: r.grn_line_id,
      received_qty: Number(r.received_qty),
      uom: r.uom,
      inspection_id: r.inspection_id ?? null,
      inspection_number: r.inspection_number ?? null,
      inspection_status: r.inspection_status ?? null,
      accepted_qty: r.accepted_qty != null ? Number(r.accepted_qty) : null,
      rejected_qty: r.rejected_qty != null ? Number(r.rejected_qty) : null,
      remaining_available_qty: availableByLine.get(r.grn_line_id) ?? 0,
      inspector_id: r.inspector_id ?? null,
      inspector_name: r.inspector_name ?? null,
      // Future-ready: no warehouse-location model exists yet (always null in v1.0).
      warehouse_location: null,
    })),
  });
});

export default router;
