import { eq, and, desc } from "drizzle-orm";
import {
  db,
  productsTable,
  productEventsTable,
  productGenealogyTable,
  mfgProductionOrdersTable,
  mfgQcApprovalsTable,
  mfgTestResultsTable,
  mfgBatteryTimelineTable,
  materialIssueNotesTable,
  materialIssueNoteLinesTable,
  materialIssueReversalsTable,
  bomHeadersTable,
  materialsTable,
  grnHeadersTable,
  dispatchesTable,
  dispatchItemsTable,
  dispatchReversalsTable,
  customerRegistrationsTable,
  warrantiesTable,
  logisticsDealersTable,
} from "@workspace/db";
import { selectProductView, numify } from "./index";

// ─── Product 360° Traceability (read-only aggregation) ────────────────────────
// Assembles the complete cradle-to-grave lineage of ONE serialized Product from
// the existing frozen platforms — it writes nothing and owns no state. Every
// section is projected read-time from the module that owns it (Product Platform,
// Manufacturing, MIN/BOM, Inventory GRN, QC/Test, Dispatch, Customer, Warranty);
// this endpoint only JOINS them for a single unified view keyed off the Product.
//
// Branch: manufactured Products (source_production_order_id set) carry the full
// production lineage (order → MINs → BOM → materials → GRNs → QC/tests); imported
// Products (no order) instead carry their registration provenance (source GRN,
// OEM serial). Both share the downstream fulfillment/customer/warranty chain.

interface TimelineEntry {
  source: "product" | "manufacturing";
  event_type: string;
  actor: string;
  description: string;
  timestamp: string | null;
  metadata: Record<string, unknown> | null;
}

// Computed warranty status (never a stored/drifting column — mirrors the
// warranty-service rule): void → expired → active.
function computeWarrantyStatus(w: {
  voided_at: Date | null;
  end_date: string;
}): "void" | "expired" | "active" {
  if (w.voided_at) return "void";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(w.end_date);
  return today > end ? "expired" : "active";
}

export async function getProductTraceability(id: string) {
  const product = await selectProductView(id);
  if (!product) return undefined;

  const isImported = product.source_production_order_id == null;
  const timeline: TimelineEntry[] = [];

  // ── Product event timeline (append-only, always present) ──────────────────
  const productEvents = await db
    .select({
      event_type: productEventsTable.eventType,
      actor: productEventsTable.actor,
      description: productEventsTable.description,
      metadata: productEventsTable.metadata,
      created_at: productEventsTable.createdAt,
    })
    .from(productEventsTable)
    .where(eq(productEventsTable.productId, id))
    .orderBy(productEventsTable.createdAt);

  for (const e of productEvents) {
    timeline.push({
      source: "product",
      event_type: e.event_type,
      actor: e.actor,
      description: e.description,
      timestamp: e.created_at ? e.created_at.toISOString() : null,
      metadata: (e.metadata as Record<string, unknown> | null) ?? null,
    });
  }

  let manufacturing:
    | {
        production_order: Record<string, unknown> | null;
        material_issues: Record<string, unknown>[];
        boms: Record<string, unknown>[];
        qc: { approval: Record<string, unknown> | null; test_results: Record<string, unknown>[] };
      }
    | null = null;

  let imported:
    | {
        source_grn_id: string | null;
        grn_number: string | null;
        category_code: string | null;
        serial_source: string | null;
        oem_serial: string | null;
        notes: string | null;
      }
    | null = null;

  if (!isImported && product.source_production_order_id) {
    const orderId = product.source_production_order_id as string;

    // ── Production order ────────────────────────────────────────────────────
    const [order] = await db
      .select({
        id: mfgProductionOrdersTable.id,
        order_number: mfgProductionOrdersTable.orderNumber,
        battery_number: mfgProductionOrdersTable.batteryNumber,
        status: mfgProductionOrdersTable.status,
        current_stage: mfgProductionOrdersTable.currentStage,
        factory_manager: mfgProductionOrdersTable.factoryManager,
        planned_start_date: mfgProductionOrdersTable.plannedStartDate,
        planned_end_date: mfgProductionOrdersTable.plannedEndDate,
        created_at: mfgProductionOrdersTable.createdAt,
      })
      .from(mfgProductionOrdersTable)
      .where(eq(mfgProductionOrdersTable.id, orderId))
      .limit(1);

    // ── Material Issue Notes (consumption) for this order ────────────────────
    const minRows = await db
      .select({
        id: materialIssueNotesTable.id,
        min_number: materialIssueNotesTable.minNumber,
        status: materialIssueNotesTable.status,
        bom_header_id: materialIssueNotesTable.bomHeaderId,
        bom_number: bomHeadersTable.bomNumber,
        bom_revision: materialIssueNotesTable.bomRevision,
        created_at: materialIssueNotesTable.createdAt,
        reversal_id: materialIssueReversalsTable.id,
      })
      .from(materialIssueNotesTable)
      .leftJoin(bomHeadersTable, eq(materialIssueNotesTable.bomHeaderId, bomHeadersTable.id))
      .leftJoin(
        materialIssueReversalsTable,
        eq(materialIssueReversalsTable.minId, materialIssueNotesTable.id),
      )
      .where(
        and(
          eq(materialIssueNotesTable.sourceType, "PRODUCTION_ORDER"),
          eq(materialIssueNotesTable.sourceRefId, orderId),
        ),
      )
      .orderBy(materialIssueNotesTable.createdAt);

    const materialIssues: Record<string, unknown>[] = [];
    const bomSeen = new Map<string, Record<string, unknown>>();
    for (const m of minRows) {
      const lines = await db
        .select({
          id: materialIssueNoteLinesTable.id,
          line_number: materialIssueNoteLinesTable.lineNumber,
          material_id: materialIssueNoteLinesTable.materialId,
          material_code: materialsTable.code,
          material_name: materialsTable.name,
          required_qty: materialIssueNoteLinesTable.requiredQty,
          issued_qty: materialIssueNoteLinesTable.issuedQty,
          uom: materialIssueNoteLinesTable.uom,
          grn_id: materialIssueNoteLinesTable.grnId,
          grn_number: grnHeadersTable.grnNumber,
          supplier_lot_number: materialIssueNoteLinesTable.supplierLotNumber,
          is_critical_component: materialIssueNoteLinesTable.isCriticalComponent,
          traceability_required: materialIssueNoteLinesTable.traceabilityRequired,
        })
        .from(materialIssueNoteLinesTable)
        .leftJoin(materialsTable, eq(materialIssueNoteLinesTable.materialId, materialsTable.id))
        .leftJoin(grnHeadersTable, eq(materialIssueNoteLinesTable.grnId, grnHeadersTable.id))
        .where(eq(materialIssueNoteLinesTable.minId, m.id))
        .orderBy(materialIssueNoteLinesTable.lineNumber);

      materialIssues.push({
        id: m.id,
        min_number: m.min_number,
        status: m.status,
        bom_header_id: m.bom_header_id,
        bom_number: m.bom_number,
        bom_revision: m.bom_revision,
        is_reversed: m.reversal_id != null,
        created_at: m.created_at ? m.created_at.toISOString() : null,
        lines: lines.map((l) => numify(l as Record<string, unknown>)),
      });

      if (m.bom_header_id && !bomSeen.has(m.bom_header_id)) {
        bomSeen.set(m.bom_header_id, {
          bom_header_id: m.bom_header_id,
          bom_number: m.bom_number,
          bom_revision: m.bom_revision,
        });
      }
    }

    // ── QC approval + test results ───────────────────────────────────────────
    const [approval] = await db
      .select({
        decision: mfgQcApprovalsTable.decision,
        inspector_name: mfgQcApprovalsTable.inspectorName,
        inspector_role: mfgQcApprovalsTable.inspectorRole,
        remarks: mfgQcApprovalsTable.remarks,
        approved_at: mfgQcApprovalsTable.approvedAt,
      })
      .from(mfgQcApprovalsTable)
      .where(eq(mfgQcApprovalsTable.productionOrderId, orderId))
      .orderBy(desc(mfgQcApprovalsTable.approvedAt))
      .limit(1);

    const testRows = await db
      .select({
        test_type: mfgTestResultsTable.testType,
        result: mfgTestResultsTable.result,
        operator_name: mfgTestResultsTable.operatorName,
        test_equipment_name: mfgTestResultsTable.testEquipmentName,
        started_at: mfgTestResultsTable.startedAt,
        completed_at: mfgTestResultsTable.completedAt,
      })
      .from(mfgTestResultsTable)
      .where(eq(mfgTestResultsTable.productionOrderId, orderId))
      .orderBy(mfgTestResultsTable.createdAt);

    // ── Manufacturing timeline events (order-keyed) merged into the lineage ──
    const mfgEvents = await db
      .select({
        event_type: mfgBatteryTimelineTable.eventType,
        actor: mfgBatteryTimelineTable.actor,
        description: mfgBatteryTimelineTable.description,
        metadata: mfgBatteryTimelineTable.metadata,
        created_at: mfgBatteryTimelineTable.createdAt,
      })
      .from(mfgBatteryTimelineTable)
      .where(eq(mfgBatteryTimelineTable.productionOrderId, orderId))
      .orderBy(mfgBatteryTimelineTable.createdAt);

    for (const e of mfgEvents) {
      timeline.push({
        source: "manufacturing",
        event_type: e.event_type,
        actor: e.actor,
        description: e.description,
        timestamp: e.created_at ? e.created_at.toISOString() : null,
        metadata: (e.metadata as Record<string, unknown> | null) ?? null,
      });
    }

    manufacturing = {
      production_order: order
        ? {
            ...order,
            created_at: order.created_at ? order.created_at.toISOString() : null,
          }
        : null,
      material_issues: materialIssues,
      boms: [...bomSeen.values()],
      qc: {
        approval: approval
          ? {
              ...approval,
              approved_at: approval.approved_at ? approval.approved_at.toISOString() : null,
            }
          : null,
        test_results: testRows.map((t) => ({
          test_type: t.test_type,
          result: t.result,
          operator_name: t.operator_name,
          test_equipment_name: t.test_equipment_name,
          started_at: t.started_at ? t.started_at.toISOString() : null,
          completed_at: t.completed_at ? t.completed_at.toISOString() : null,
        })),
      },
    };
  } else {
    // ── Imported registration provenance (no production order) ───────────────
    const createdEvt = productEvents.find(
      (e) => e.event_type === "product.created" && (e.metadata as Record<string, unknown> | null)?.source === "imported",
    );
    const meta = (createdEvt?.metadata as Record<string, unknown> | null) ?? {};
    const sourceGrnId = (meta.sourceGrnId as string | null) ?? null;

    let grnNumber: string | null = null;
    if (sourceGrnId) {
      const [grn] = await db
        .select({ grn_number: grnHeadersTable.grnNumber })
        .from(grnHeadersTable)
        .where(eq(grnHeadersTable.id, sourceGrnId))
        .limit(1);
      grnNumber = grn?.grn_number ?? null;
    }

    const [gen] = await db
      .select({
        serial_number: productGenealogyTable.serialNumber,
        notes: productGenealogyTable.notes,
      })
      .from(productGenealogyTable)
      .where(
        and(
          eq(productGenealogyTable.productId, id),
          eq(productGenealogyTable.componentType, "IMPORTED_UNIT"),
        ),
      )
      .limit(1);

    imported = {
      source_grn_id: sourceGrnId,
      grn_number: grnNumber,
      category_code: (meta.categoryCode as string | null) ?? null,
      serial_source: (meta.serialSource as string | null) ?? product.serial_source ?? null,
      oem_serial: gen?.serial_number ?? null,
      notes: gen?.notes ?? null,
    };
  }

  // ── Fulfillment — Packing (from the product.packed event) ──────────────────
  const packedEvt = productEvents.find((e) => e.event_type === "product.packed");
  const packedMeta = (packedEvt?.metadata as Record<string, unknown> | null) ?? {};
  const packing = packedEvt
    ? {
        packed_by: (packedMeta.packedBy as string | null) ?? packedEvt.actor,
        packing_date: (packedMeta.packingDate as string | null) ?? null,
        created_at: packedEvt.created_at ? packedEvt.created_at.toISOString() : null,
      }
    : null;

  // ── Fulfillment — Dispatch document(s) for this product ────────────────────
  const dispatchRows = await db
    .select({
      id: dispatchesTable.id,
      dispatch_number: dispatchesTable.dispatchNumber,
      invoice_number: dispatchesTable.invoiceNumber,
      dispatch_date: dispatchesTable.dispatchDate,
      dealer_name: dispatchesTable.dealerName,
      dispatched_by: dispatchesTable.dispatchedBy,
      created_at: dispatchesTable.createdAt,
      reversal_id: dispatchReversalsTable.id,
      reversal_reason: dispatchReversalsTable.reason,
    })
    .from(dispatchItemsTable)
    .innerJoin(dispatchesTable, eq(dispatchItemsTable.dispatchId, dispatchesTable.id))
    .leftJoin(dispatchReversalsTable, eq(dispatchReversalsTable.dispatchId, dispatchesTable.id))
    .where(eq(dispatchItemsTable.productId, id))
    .orderBy(desc(dispatchesTable.createdAt));

  const dispatches = dispatchRows.map((d) => ({
    id: d.id,
    dispatch_number: d.dispatch_number,
    invoice_number: d.invoice_number,
    dispatch_date: d.dispatch_date,
    dealer_name: d.dealer_name,
    dispatched_by: d.dispatched_by,
    is_reversed: d.reversal_id != null,
    reversal_reason: d.reversal_reason ?? null,
    created_at: d.created_at ? d.created_at.toISOString() : null,
  }));

  // ── Customer registration (product ownership) ──────────────────────────────
  const [customerRow] = await db
    .select({
      id: customerRegistrationsTable.id,
      registration_number: customerRegistrationsTable.registrationNumber,
      customer_name: customerRegistrationsTable.customerName,
      mobile: customerRegistrationsTable.mobile,
      address: customerRegistrationsTable.address,
      installation_date: customerRegistrationsTable.installationDate,
      registered_by: customerRegistrationsTable.registeredBy,
      dealer_name: logisticsDealersTable.dealerName,
      created_at: customerRegistrationsTable.createdAt,
    })
    .from(customerRegistrationsTable)
    .leftJoin(
      logisticsDealersTable,
      eq(customerRegistrationsTable.dealerId, logisticsDealersTable.id),
    )
    .where(eq(customerRegistrationsTable.productId, id))
    .limit(1);

  const customer = customerRow
    ? {
        ...customerRow,
        created_at: customerRow.created_at ? customerRow.created_at.toISOString() : null,
      }
    : null;

  // ── Warranty (computed status) ─────────────────────────────────────────────
  const [warrantyRow] = await db
    .select({
      id: warrantiesTable.id,
      warranty_number: warrantiesTable.warrantyNumber,
      start_date: warrantiesTable.startDate,
      end_date: warrantiesTable.endDate,
      period_months: warrantiesTable.periodMonths,
      voided_at: warrantiesTable.voidedAt,
      void_reason: warrantiesTable.voidReason,
    })
    .from(warrantiesTable)
    .where(eq(warrantiesTable.productId, id))
    .limit(1);

  const warranty = warrantyRow
    ? {
        id: warrantyRow.id,
        warranty_number: warrantyRow.warranty_number,
        start_date: warrantyRow.start_date,
        end_date: warrantyRow.end_date,
        period_months: warrantyRow.period_months,
        status: computeWarrantyStatus({
          voided_at: warrantyRow.voided_at,
          end_date: warrantyRow.end_date,
        }),
        voided_at: warrantyRow.voided_at ? warrantyRow.voided_at.toISOString() : null,
        void_reason: warrantyRow.void_reason ?? null,
      }
    : null;

  // Merge chronologically (oldest → newest) so the lifecycle reads top-to-bottom.
  timeline.sort((a, b) => {
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return ta - tb;
  });

  return {
    product,
    is_imported: isImported,
    manufacturing,
    imported,
    fulfillment: { packing, dispatches },
    customer,
    warranty,
    timeline,
  };
}
