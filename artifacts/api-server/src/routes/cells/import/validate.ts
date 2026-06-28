import {
  GRADING_OVERRIDE_STATUSES,
  type GradingImportContext,
  type GradingImportPreview,
  type GradingImportPreviewRow,
  type GradingImportSourceType,
  type GradingImportValidationIssue,
  type GradingMeasurementRecord,
} from "./types";

/**
 * The "Validation" stage of the import pipeline. These are INPUT-sanity checks only —
 * they mirror the certified `GradeCellBody` Zod contract (voltageV > 0, capacityAh > 0,
 * internalResistanceMohm >= 0, overrideStatus ∈ {approved,rejected,quarantine,"null"}).
 * They do NOT grade: the grade/status is always derived later by the single existing
 * engine. Keeping validation identical to the manual contract guarantees manual and
 * imported rows are accepted/rejected alike.
 */
export function validateRecord(
  rec: GradingMeasurementRecord,
  rowIndex: number
): GradingImportValidationIssue[] {
  const issues: GradingImportValidationIssue[] = [];

  if (!rec.cellId || rec.cellId.trim().length === 0) {
    issues.push({ rowIndex, field: "cellId", message: "cellId is required" });
  }
  if (!(rec.voltageV > 0)) {
    issues.push({ rowIndex, field: "voltageV", message: "voltageV must be greater than 0" });
  }
  if (!(rec.capacityAh > 0)) {
    issues.push({ rowIndex, field: "capacityAh", message: "capacityAh must be greater than 0" });
  }
  if (!(rec.internalResistanceMohm >= 0)) {
    issues.push({
      rowIndex,
      field: "internalResistanceMohm",
      message: "internalResistanceMohm must be greater than or equal to 0",
    });
  }

  // overrideStatus is optional, but when present must be in the certified enum domain.
  // External adapters (Excel/CSV) will hand us raw strings, so check at runtime against
  // the contract's allowed set rather than relying on the compile-time union alone.
  const override = rec.overrideStatus as string | null | undefined;
  if (
    override != null &&
    !(GRADING_OVERRIDE_STATUSES as readonly string[]).includes(override)
  ) {
    issues.push({
      rowIndex,
      field: "overrideStatus",
      message: `overrideStatus must be one of: ${GRADING_OVERRIDE_STATUSES.join(", ")}`,
    });
  }

  return issues;
}

/**
 * Batch-level validation. Mirrors the certified route's attribution rule: `gradedBy`
 * must be present and not blank/whitespace-only (DEF-CW02-005) so no audit/ECF record
 * can ever carry an anonymous operator. Reported with rowIndex = -1.
 */
export function validateContext(
  context: GradingImportContext
): GradingImportValidationIssue[] {
  const issues: GradingImportValidationIssue[] = [];
  if (!context.performedBy || context.performedBy.trim().length === 0) {
    issues.push({
      rowIndex: -1,
      field: "performedBy",
      message: "performedBy (operator attribution) is required and cannot be blank",
    });
  }
  return issues;
}

/**
 * Build the operator-facing preview for a batch of normalized records. The operator
 * approves this BEFORE any record reaches the grading engine. `ok` is true only when
 * attribution is present AND every row is valid.
 */
export function buildPreview(
  sourceType: GradingImportSourceType,
  records: GradingMeasurementRecord[],
  context: GradingImportContext
): GradingImportPreview {
  const contextIssues = validateContext(context);

  const rows: GradingImportPreviewRow[] = records.map((record, rowIndex) => {
    const issues = validateRecord(record, rowIndex);
    return { record, valid: issues.length === 0, issues };
  });

  const invalidCount = rows.filter((r) => !r.valid).length;

  return {
    sourceType,
    rows,
    contextIssues,
    validCount: rows.filter((r) => r.valid).length,
    invalidCount,
    ok: contextIssues.length === 0 && invalidCount === 0,
  };
}
