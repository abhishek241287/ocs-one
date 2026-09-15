import { eq, and, asc, desc, sql, inArray } from "drizzle-orm";
import {
  db,
  type Executor,
  type Transaction,
  bomHeadersTable,
  bomLinesTable,
  materialsTable,
  inventoryTransactionsTable,
  grnHeadersTable,
  grnLineItemsTable,
  materialIssueNotesTable,
  materialIssueNoteLinesTable,
  materialIssueReversalsTable,
  bulkBatchesTable,
  mfgProductionOrdersTable,
  mfgBatteryTimelineTable,
  productWorkflowsTable,
} from "@workspace/db";
import { classifyOrderProduct } from "./product-creation";
import { depleteValuationForMovement } from "./valuation-engine";
import { restoreValuationForMovement } from "./valuation-engine";

// Cell allocation consumes CELL stock via the transfer path, not a MIN — it is the
// only stage excluded from being the material-issue gate. The gate stage is DERIVED
// from the workflow master's stage_sequence (config), never a hardcoded stage name.
const CELL_STAGE = "cell_allocation";

// ─── Material Issue Note (MIN) engine ─────────────────────────────────────────
// BOM-driven consumption of NON-CELL raw materials against a production order,
// built ON TOP of the existing production + inventory engines (CTO Option A):
//   • The BOM master supplies WHAT to consume (approved revision, snapshotted onto
//     the MIN — R1). Cell lines are excluded: cells are consumed via the existing
//     MATERIAL_TRANSFER_TO_CELL_PROCESSING path; issuing them here double-counts.
//   • The signed append-only inventory ledger is the ONLY stock store — a MIN posts
//     PRODUCTION_ISSUE rows (−qty @available); a reversal posts PRODUCTION_ISSUE_
//     REVERSAL (+qty @available). No finished-goods / second ledger is introduced.
//   • The MIN document itself is immutable (R4); corrections are a separate reversal.
// All mutating helpers take the caller's `tx` so the document, its lines, the ledger
// rows, and the timeline event commit atomically (all-or-nothing).

// Cells are consumed via the transfer→cell-processing path, never a MIN.
const CELL_MASTER_TYPE = "CELL";

function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

function round3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

// ─── computed requirement for one non-cell BOM line ───────────────────────────
export interface MaterialRequirement {
  bomLineId: string;
  materialId: string;
  materialCode: string | null;
  materialName: string | null;
  uom: string;
  quantityPer: number;
  scrapPercent: number;
  requiredQty: number;
  isCriticalComponent: boolean;
  traceabilityRequired: boolean;
}

export interface ResolvedBom {
  bomHeaderId: string;
  bomNumber: string;
  revision: number;
  yieldPercent: number;
  requirements: MaterialRequirement[];
}

/**
 * Resolve the latest APPROVED BOM for a model and compute its non-cell material
 * requirements. Requirement formula (order qty = 1 unit per production order):
 *   required = quantity_per × (1 + scrap%/100) × (100 / yield%)
 * v1 scope: required, non-optional, PRIMARY lines only (alternates excluded).
 * Returns null when the model has no approved BOM (orders proceed ungated — R3
 * backward-compat).
 */
export async function resolveApprovedBomRequirements(
  exec: Executor,
  modelId: string,
  options: { lockBomHeader?: boolean } = {},
): Promise<ResolvedBom | null> {
  const bomQuery = exec
    .select({
      id: bomHeadersTable.id,
      bomNumber: bomHeadersTable.bomNumber,
      revision: bomHeadersTable.revision,
      yieldPercent: bomHeadersTable.yieldPercent,
    })
    .from(bomHeadersTable)
    .where(and(eq(bomHeadersTable.modelId, modelId), eq(bomHeadersTable.status, "approved")))
    .orderBy(desc(bomHeadersTable.revision))
      .limit(1);
  const [bom] = options.lockBomHeader
    ? await bomQuery.for("update")
    : await bomQuery;
  if (!bom) return null;

  const lines = await exec
    .select({
      id: bomLinesTable.id,
      materialId: bomLinesTable.materialId,
      materialCode: materialsTable.code,
      materialName: materialsTable.name,
      linkedMasterType: materialsTable.linkedMasterType,
      uom: bomLinesTable.uom,
      quantityPer: bomLinesTable.quantityPer,
      scrapPercent: bomLinesTable.scrapPercent,
      isCriticalComponent: bomLinesTable.isCriticalComponent,
      traceabilityRequired: bomLinesTable.traceabilityRequired,
      isOptional: bomLinesTable.isOptional,
      alternateOfLineId: bomLinesTable.alternateOfLineId,
    })
    .from(bomLinesTable)
    .innerJoin(materialsTable, eq(materialsTable.id, bomLinesTable.materialId))
    .where(eq(bomLinesTable.bomId, bom.id))
    .orderBy(asc(bomLinesTable.position), asc(bomLinesTable.id));

  const yieldPercent = Number(bom.yieldPercent);
  const yieldFactor = yieldPercent > 0 ? 100 / yieldPercent : 1;

  const requirements: MaterialRequirement[] = lines
    .filter(
      (l) =>
        l.linkedMasterType !== CELL_MASTER_TYPE && // cells: transfer path, not MIN
        !l.isOptional &&
        l.alternateOfLineId == null, // primary lines only in v1
    )
    .map((l) => {
      const qtyPer = Number(l.quantityPer);
      const scrap = Number(l.scrapPercent);
      return {
        bomLineId: l.id,
        materialId: l.materialId,
        materialCode: l.materialCode,
        materialName: l.materialName,
        uom: l.uom,
        quantityPer: qtyPer,
        scrapPercent: scrap,
        requiredQty: round4(qtyPer * (1 + scrap / 100) * yieldFactor),
        isCriticalComponent: l.isCriticalComponent,
        traceabilityRequired: l.traceabilityRequired,
      };
    });

  return {
    bomHeaderId: bom.id,
    bomNumber: bom.bomNumber,
    revision: bom.revision,
    yieldPercent,
    requirements,
  };
}

/**
 * Material-level available balance = SUM(signed quantity) of `available` ledger rows
 * per material. The ledger nets stock by material (fungible), not by lot-dimensioned
 * balances — lot dimensioning is out of scope for v1.
 */
export async function getAvailableByMaterial(
  exec: Executor,
  materialIds: string[],
): Promise<Map<string, number>> {
  const unique = Array.from(new Set(materialIds));
  if (unique.length === 0) return new Map();
  const rows = await exec
    .select({
      materialId: inventoryTransactionsTable.materialId,
      available: sql<string>`coalesce(sum(${inventoryTransactionsTable.quantity}), 0)`,
    })
    .from(inventoryTransactionsTable)
    .where(
      and(
        inArray(inventoryTransactionsTable.materialId, unique),
        eq(inventoryTransactionsTable.stockState, "available"),
      ),
    )
    .groupBy(inventoryTransactionsTable.materialId);
  return new Map(rows.map((r) => [r.materialId, Number(r.available)]));
}

export interface FifoLotSuggestion {
  grnId: string;
  grnNumber: string | null;
  grnLineId: string;
  supplierLotNumber: string | null;
  availableQty: number;
}

/**
 * For each material, suggest the oldest posted-GRN receipt line that still holds
 * available balance (FIFO) — the batch/lot/GRN traceability reference captured on the
 * MIN line (R2). Because stock nets by material, this is a traceability suggestion the
 * issuer confirms, NOT a per-lot balance decrement.
 */
export async function suggestFifoLots(
  exec: Executor,
  materialIds: string[],
): Promise<Map<string, FifoLotSuggestion>> {
  const unique = Array.from(new Set(materialIds));
  if (unique.length === 0) return new Map();

  // Every posted-GRN receipt line for these materials, oldest first.
  const lines = await exec
    .select({
      materialId: grnLineItemsTable.materialId,
      grnId: grnHeadersTable.id,
      grnNumber: grnHeadersTable.grnNumber,
      grnLineId: grnLineItemsTable.id,
      supplierLotNumber: grnLineItemsTable.supplierLotNumber,
      receivedDate: grnHeadersTable.receivedDate,
    })
    .from(grnLineItemsTable)
    .innerJoin(
      grnHeadersTable,
      and(eq(grnHeadersTable.id, grnLineItemsTable.grnId), eq(grnHeadersTable.status, "posted")),
    )
    .where(inArray(grnLineItemsTable.materialId, unique))
    .orderBy(asc(grnHeadersTable.receivedDate), asc(grnHeadersTable.grnNumber));

  const lineIds = lines.map((l) => l.grnLineId);
  const balByLine = new Map<string, number>();
  if (lineIds.length) {
    const balances = await exec
      .select({
        sourceLineId: inventoryTransactionsTable.sourceLineId,
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
      if (b.sourceLineId) balByLine.set(b.sourceLineId, Number(b.available));
    }
  }

  // First (oldest) line per material with a positive available balance.
  const out = new Map<string, FifoLotSuggestion>();
  for (const l of lines) {
    if (out.has(l.materialId)) continue;
    const bal = balByLine.get(l.grnLineId) ?? 0;
    if (bal <= 0) continue;
    out.set(l.materialId, {
      grnId: l.grnId,
      grnNumber: l.grnNumber,
      grnLineId: l.grnLineId,
      supplierLotNumber: l.supplierLotNumber,
      availableQty: bal,
    });
  }
  return out;
}

/**
 * The active MIN for a source (a posted MIN with no reversal row), if any. "Active"
 * is DERIVED — the header is never mutated (R4). Used both by the double-issue guard
 * and the stage-start gate. Pass a FOR-UPDATE-locked context for race-safety.
 */
export async function findActiveMinForSource(
  exec: Executor,
  sourceType: "PRODUCTION_ORDER",
  sourceRefId: string,
): Promise<{ id: string; minNumber: string } | null> {
  const [row] = await exec
    .select({ id: materialIssueNotesTable.id, minNumber: materialIssueNotesTable.minNumber })
    .from(materialIssueNotesTable)
    .where(
      and(
        eq(materialIssueNotesTable.sourceType, sourceType),
        eq(materialIssueNotesTable.sourceRefId, sourceRefId),
        sql`not exists (select 1 from ${materialIssueReversalsTable} r where r.min_id = ${materialIssueNotesTable.id})`,
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function findCompletedBulkBatchForOrder(
  exec: Executor,
  productionOrderId: string,
): Promise<{ id: string } | null> {
  const [row] = await exec
    .select({ id: bulkBatchesTable.id })
    .from(bulkBatchesTable)
    .where(
      and(
        eq(bulkBatchesTable.productionOrderId, productionOrderId),
        eq(bulkBatchesTable.status, "completed"),
      ),
    )
    .limit(1);
  return row ?? null;
}

// ─── issue confirmation input (per BOM line, issuer-adjustable) ────────────────
export interface IssueLineConfirmation {
  sourceBomLineId: string;
  issuedQty?: number;
  grnId?: string | null;
  grnLineId?: string | null;
  supplierLotNumber?: string | null;
}

export type IssueOutcome =
  | { status: "ok"; minId: string; minNumber: string }
  | { status: "no_bom" }
  | { status: "no_requirements" }
  | { status: "already_issued"; minNumber: string }
  | { status: "insufficient"; shortfalls: { materialName: string | null; required: number; available: number }[] }
  | { status: "quantity_mismatch"; mismatches: { materialName: string | null; required: number; issued: number }[] }
  | { status: "missing_traceability"; materials: (string | null)[] }
  // H11: returned when a traceability-required line fails the per-lot ledger validation
  // (wrong lot number, GRN line not found, or insufficient lot-level balance).
  | { status: "lot_validation_failed"; materialName: string | null; error: string };

/**
 * H11 — Per-lot balance validation with pg advisory lock.
 * Acquires pg_advisory_xact_lock(hashtext(grnLineId)) to serialize concurrent MINs
 * competing for the same lot. Verifies presence, GRN line ownership, lot number
 * match, and ledger balance. Called for every traceability-required BOM line before
 * any MIN rows are written so failures are clean (no partial write to reverse).
 */
async function validateLotAllocation(
  materialId: string,
  grnLineId: string | null | undefined,
  supplierLotNumber: string | null | undefined,
  issuedQty: number,
  tx: Transaction,
): Promise<{ valid: true } | { valid: false; error: string }> {
  if (!grnLineId || !supplierLotNumber) {
    return {
      valid: false,
      error:
        "Traceability-required material is missing GRN line and/or supplier lot reference",
    };
  }

  // Acquire transaction-scoped advisory lock on this GRN line — auto-released on
  // commit/rollback; serializes any two concurrent MIN posts for the same lot.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${grnLineId}))`);

  const [grnLine] = await tx
    .select({
      id: grnLineItemsTable.id,
      materialId: grnLineItemsTable.materialId,
      supplierLotNumber: grnLineItemsTable.supplierLotNumber,
    })
    .from(grnLineItemsTable)
    .where(eq(grnLineItemsTable.id, grnLineId))
    .limit(1);

  if (!grnLine) {
    return { valid: false, error: `GRN line not found: ${grnLineId}` };
  }
  if (grnLine.materialId !== materialId) {
    return {
      valid: false,
      error: `GRN line ${grnLineId} does not belong to the expected material`,
    };
  }
  if (grnLine.supplierLotNumber !== supplierLotNumber) {
    return {
      valid: false,
      error: `Supplier lot number mismatch: GRN line records "${grnLine.supplierLotNumber}", received "${supplierLotNumber}"`,
    };
  }

  const [balRow] = await tx
    .select({
      available: sql<string>`COALESCE(SUM(${inventoryTransactionsTable.quantity}), '0')`,
    })
    .from(inventoryTransactionsTable)
    .where(
      and(
        eq(inventoryTransactionsTable.sourceLineId, grnLineId),
        eq(inventoryTransactionsTable.stockState, "available"),
      ),
    );

  const availQty = Number(balRow?.available ?? 0);
  if (availQty < issuedQty) {
    return {
      valid: false,
      error: `Insufficient lot balance on GRN line ${grnLineId}: need ${issuedQty}, have ${availQty}`,
    };
  }

  return { valid: true };
}

export interface IssueMaterialsArgs {
  tx: Transaction;
  productionOrderId: string;
  modelId: string;
  minNumber: string;
  actorId: string | null;
  /** Human label (email/name) for the append-only manufacturing timeline event. */
  actorLabel: string;
  notes?: string | null;
  confirmations?: IssueLineConfirmation[];
}

/**
 * Post a MIN for a production order inside the caller's transaction. Assumes the
 * production order row is already locked FOR UPDATE by the caller (TOCTOU-safe
 * double-issue guard). Computes requirements from the approved BOM, applies issuer
 * confirmations, validates material-level availability + traceability, then writes:
 * the immutable MIN header + lines, one signed PRODUCTION_ISSUE ledger row per line.
 */
export async function issueMaterials(args: IssueMaterialsArgs): Promise<IssueOutcome> {
  const { tx, productionOrderId, modelId, minNumber, actorId, notes } = args;
  const confirmations = new Map(
    (args.confirmations ?? []).map((c) => [c.sourceBomLineId, c]),
  );

  // Obsoletion locks the same BOM header row before checking material_issue_notes.
  // Lock the selected approved BOM before resolving requirements so the full
  // material-use transaction serializes with that lifecycle transition.
  const bom = await resolveApprovedBomRequirements(tx, modelId, { lockBomHeader: true });
  if (!bom) return { status: "no_bom" };
  if (bom.requirements.length === 0) return { status: "no_requirements" };

  // Double-issue guard (order row already locked by caller).
  const active = await findActiveMinForSource(tx, "PRODUCTION_ORDER", productionOrderId);
  if (active) return { status: "already_issued", minNumber: active.minNumber };

  const materialIds = bom.requirements.map((r) => r.materialId);
  // Lock every referenced material row FOR UPDATE before reading availability. The
  // signed ledger has no single balance row to lock, so two concurrent issues for
  // DIFFERENT orders sharing a material could both pass the shortfall check and
  // oversubscribe stock (TOCTOU). Taking the same material-row lock the GRN posting
  // path takes serializes any two inventory writers touching the same material.
  await tx
    .select({ id: materialsTable.id })
    .from(materialsTable)
    .where(inArray(materialsTable.id, [...new Set(materialIds)]))
    .for("update");
  const availByMaterial = await getAvailableByMaterial(tx, materialIds);
  const fifo = await suggestFifoLots(tx, materialIds);

  // Resolve each line's issued qty + lot reference (issuer confirmation overrides FIFO).
  const resolved = bom.requirements.map((r) => {
    const c = confirmations.get(r.bomLineId);
    const issuedQty = round3(c?.issuedQty != null ? c.issuedQty : r.requiredQty);
    const suggestion = fifo.get(r.materialId);
    const grnId = c?.grnId !== undefined ? c.grnId : suggestion?.grnId ?? null;
    const grnLineId = c?.grnLineId !== undefined ? c.grnLineId : suggestion?.grnLineId ?? null;
    const supplierLotNumber =
      c?.supplierLotNumber !== undefined
        ? c.supplierLotNumber
        : suggestion?.supplierLotNumber ?? null;
    return { req: r, issuedQty, grnId, grnLineId, supplierLotNumber };
  });

  // Exact-match invariant (Factory Ready v1): issued quantity MUST equal the
  // approved BOM requirement for every line — no partial/short/over issue.
  // Partial issue (true WIP) is intentionally unsupported; a Work Order cannot
  // proceed unless the full BOM is consumed.
  const mismatches = resolved
    .filter((l) => round3(l.issuedQty) !== round3(l.req.requiredQty))
    .map((l) => ({
      materialName: l.req.materialName,
      required: round3(l.req.requiredQty),
      issued: round3(l.issuedQty),
    }));
  if (mismatches.length) return { status: "quantity_mismatch", mismatches };

  // Availability (material-level) — aggregate across duplicate material lines.
  const demand = new Map<string, number>();
  for (const l of resolved) demand.set(l.req.materialId, (demand.get(l.req.materialId) ?? 0) + l.issuedQty);
  const shortfalls: { materialName: string | null; required: number; available: number }[] = [];
  for (const l of resolved) {
    const need = demand.get(l.req.materialId) ?? 0;
    const have = availByMaterial.get(l.req.materialId) ?? 0;
    if (need > have && !shortfalls.some((s) => s.materialName === l.req.materialName)) {
      shortfalls.push({ materialName: l.req.materialName, required: round3(need), available: have });
    }
  }
  if (shortfalls.length) return { status: "insufficient", shortfalls };

  // Traceability — traceability_required lines MUST carry a batch/lot + GRN reference.
  // Phase 1: fast presence check (no DB call) so we fail early with a clear list.
  const missingTrace = resolved
    .filter((l) => l.req.traceabilityRequired && (!l.grnLineId || !l.supplierLotNumber))
    .map((l) => l.req.materialName);
  if (missingTrace.length) return { status: "missing_traceability", materials: missingTrace };

  // H11 — Phase 2: per-lot ledger validation with advisory lock. Done BEFORE writing
  // any MIN rows so a failure leaves no partial data to reverse.
  for (const l of resolved) {
    if (l.req.traceabilityRequired) {
      const lotResult = await validateLotAllocation(
        l.req.materialId,
        l.grnLineId,
        l.supplierLotNumber,
        l.issuedQty,
        tx,
      );
      if (!lotResult.valid) {
        return {
          status: "lot_validation_failed",
          materialName: l.req.materialName,
          error: lotResult.error,
        };
      }
    }
  }

  // Header (R1: snapshot BOM header id + revision).
  const [min] = await tx
    .insert(materialIssueNotesTable)
    .values({
      minNumber,
      sourceType: "PRODUCTION_ORDER",
      sourceRefId: productionOrderId,
      bomHeaderId: bom.bomHeaderId,
      bomRevision: bom.revision,
      status: "posted",
      issuedBy: actorId,
      notes: notes ?? null,
    })
    .returning({ id: materialIssueNotesTable.id });

  // Lines + one signed PRODUCTION_ISSUE ledger row each (sourceLineId = MIN line id).
  let lineNumber = 1;
  for (const l of resolved) {
    const [line] = await tx
      .insert(materialIssueNoteLinesTable)
      .values({
        minId: min.id,
        lineNumber: lineNumber++,
        materialId: l.req.materialId,
        sourceBomLineId: l.req.bomLineId,
        requiredQty: String(l.req.requiredQty),
        issuedQty: String(l.issuedQty),
        uom: l.req.uom as never,
        grnId: l.grnId,
        grnLineId: l.grnLineId,
        supplierLotNumber: l.supplierLotNumber,
        isCriticalComponent: l.req.isCriticalComponent,
        traceabilityRequired: l.req.traceabilityRequired,
      })
      .returning({ id: materialIssueNoteLinesTable.id });

    const [movement] = await tx
      .insert(inventoryTransactionsTable)
      .values({
      transactionType: "PRODUCTION_ISSUE",
      materialId: l.req.materialId,
      quantity: String(-l.issuedQty),
      uom: l.req.uom as never,
      stockState: "available",
      sourceDocumentType: "MIN",
      sourceDocumentId: min.id,
      sourceLineId: line.id,
      createdBy: actorId,
      })
      .returning({ id: inventoryTransactionsTable.id });

    await depleteValuationForMovement(tx, {
      movementId: movement.id,
      materialId: l.req.materialId,
      quantity: String(l.issuedQty),
      sourceDocumentType: "MIN",
      sourceDocumentId: min.id,
      sourceLineId: line.id,
      preferredGrnLineId: l.grnLineId,
    });
  }

  // Append-only manufacturing-timeline event (same tx — all-or-nothing).
  await tx.insert(mfgBatteryTimelineTable).values({
    productionOrderId,
    eventType: "materials_issued",
    actor: args.actorLabel,
    description: `Materials issued — ${minNumber} (${resolved.length} line(s), BOM ${bom.bomNumber ?? bom.bomHeaderId} rev ${bom.revision})`,
    metadata: {
      minId: min.id,
      minNumber,
      bomHeaderId: bom.bomHeaderId,
      bomRevision: bom.revision,
      lineCount: resolved.length,
    },
  });

  return { status: "ok", minId: min.id, minNumber };
}

export type ReverseOutcome =
  | { status: "ok" }
  | { status: "not_found" }
  | { status: "already_reversed" };

/**
 * Reverse a posted MIN inside the caller's transaction (mandatory reason). Appends a
 * reversal document (one per MIN) + one signed PRODUCTION_ISSUE_REVERSAL ledger row
 * per original line (+qty @available), restoring stock. The MIN header is never
 * mutated (R4) — reversal state is derived from the reversal row.
 */
export async function reverseMaterialIssue(
  tx: Transaction,
  minId: string,
  reason: string,
  actorId: string | null,
  actorLabel: string,
  expectedSourceRefId: string,
): Promise<ReverseOutcome> {
  // Lock the MIN header — serializes concurrent reversals of the same MIN.
  const [min] = await tx
    .select({
      id: materialIssueNotesTable.id,
      minNumber: materialIssueNotesTable.minNumber,
      sourceType: materialIssueNotesTable.sourceType,
      sourceRefId: materialIssueNotesTable.sourceRefId,
    })
    .from(materialIssueNotesTable)
    .where(eq(materialIssueNotesTable.id, minId))
    .for("update")
    .limit(1);
  if (!min) return { status: "not_found" };
  // Order-scoping: the MIN must belong to the order named in the route path;
  // otherwise a mismatched :id/:minId pair could reverse an unrelated document.
  if (min.sourceType !== "PRODUCTION_ORDER" || min.sourceRefId !== expectedSourceRefId) {
    return { status: "not_found" };
  }

  const [existing] = await tx
    .select({ id: materialIssueReversalsTable.id })
    .from(materialIssueReversalsTable)
    .where(eq(materialIssueReversalsTable.minId, minId))
    .limit(1);
  if (existing) return { status: "already_reversed" };

  const lines = await tx
    .select({
      id: materialIssueNoteLinesTable.id,
      materialId: materialIssueNoteLinesTable.materialId,
      issuedQty: materialIssueNoteLinesTable.issuedQty,
      uom: materialIssueNoteLinesTable.uom,
    })
    .from(materialIssueNoteLinesTable)
    .where(eq(materialIssueNoteLinesTable.minId, minId));

  await tx.insert(materialIssueReversalsTable).values({ minId, reason, reversedBy: actorId });

  for (const l of lines) {
    const [originalMovement] = await tx
      .select({ id: inventoryTransactionsTable.id })
      .from(inventoryTransactionsTable)
      .where(
        and(
          eq(inventoryTransactionsTable.transactionType, "PRODUCTION_ISSUE"),
          eq(inventoryTransactionsTable.sourceDocumentType, "MIN"),
          eq(inventoryTransactionsTable.sourceDocumentId, minId),
          eq(inventoryTransactionsTable.sourceLineId, l.id),
        ),
      )
      .limit(1);
    const [movement] = await tx
      .insert(inventoryTransactionsTable)
      .values({
        transactionType: "PRODUCTION_ISSUE_REVERSAL",
        materialId: l.materialId,
        quantity: String(Math.abs(Number(l.issuedQty))),
        uom: l.uom,
        stockState: "available",
        sourceDocumentType: "MIN",
        sourceDocumentId: minId,
        sourceLineId: l.id,
        createdBy: actorId,
      })
      .returning({ id: inventoryTransactionsTable.id });
    if (originalMovement) {
      await restoreValuationForMovement(tx, {
        movementId: movement.id,
        materialId: l.materialId,
        sourceDocumentType: "MIN",
        sourceDocumentId: minId,
        sourceLineId: l.id,
        originalMovementId: originalMovement.id,
        reversedMovementId: movement.id,
      });
    }
  }

  // Append-only manufacturing-timeline event (same tx — all-or-nothing).
  if (min.sourceType === "PRODUCTION_ORDER") {
    await tx.insert(mfgBatteryTimelineTable).values({
      productionOrderId: min.sourceRefId,
      eventType: "materials_issue_reversed",
      actor: actorLabel,
      description: `Material issue reversed — ${min.minNumber} (stock restored)`,
      metadata: { minId, minNumber: min.minNumber, reason },
    });
  }

  return { status: "ok" };
}

// ─── R3 stage-start gate ──────────────────────────────────────────────────────
// The first material-consuming stage of a workflow cannot start until the order's
// non-cell BOM materials are issued (an active MIN exists). The gate stage is
// resolved from the workflow master's stage_sequence (first non-cell stage), never
// a hardcoded name — so a re-sequenced or new workflow gates at its own first
// material stage automatically. Orders whose model has NO approved BOM (or whose BOM
// has no non-cell requirements) proceed ungated (backward compatibility).

/** First non-cell stage in a workflow's stage_sequence, or null if none. */
export async function resolveMaterialGateStage(
  exec: Executor,
  workflowCode: string,
): Promise<string | null> {
  const [wf] = await exec
    .select({ stageSequence: productWorkflowsTable.stageSequence })
    .from(productWorkflowsTable)
    .where(eq(productWorkflowsTable.code, workflowCode))
    .limit(1);
  if (!wf) return null;
  const seq = wf.stageSequence ?? [];
  return seq.find((s) => s !== CELL_STAGE) ?? null;
}

export type MaterialIssueGate =
  | { blocked: false }
  | { blocked: true; message: string };

/**
 * Evaluate the material-issue gate for a stage about to start. Read-only pre-check;
 * the authoritative double-issue guard lives in `issueMaterials` under the order's
 * FOR UPDATE lock.
 */
export async function evaluateStageMaterialGate(
  orderId: string,
  stage: string,
): Promise<MaterialIssueGate> {
  const [order] = await db
    .select({
      id: mfgProductionOrdersTable.id,
      batteryNumber: mfgProductionOrdersTable.batteryNumber,
      modelId: mfgProductionOrdersTable.productId,
    })
    .from(mfgProductionOrdersTable)
    .where(eq(mfgProductionOrdersTable.id, orderId))
    .limit(1);
  if (!order || !order.modelId) return { blocked: false };

  const { workflowCode } = classifyOrderProduct(order);
  const gateStage = await resolveMaterialGateStage(db, workflowCode);
  if (!gateStage || stage !== gateStage) return { blocked: false };

  const bom = await resolveApprovedBomRequirements(db, order.modelId);
  if (!bom || bom.requirements.length === 0) return { blocked: false }; // ungated

  const active = await findActiveMinForSource(db, "PRODUCTION_ORDER", orderId);
  if (active) return { blocked: false };
  const bulk = await findCompletedBulkBatchForOrder(db, orderId);
  if (bulk) return { blocked: false };

  return {
    blocked: true,
    message: `Materials must be issued (Material Issue Note) before starting ${stage.replace(
      /_/g,
      " ",
    )} — the approved BOM lists ${bom.requirements.length} material(s) to consume.`,
  };
}
