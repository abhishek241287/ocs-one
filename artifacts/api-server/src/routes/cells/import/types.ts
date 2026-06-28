/**
 * Grading Import Framework — Phase 1 extension points (CW-02, architecture-approved).
 *
 * PURPOSE
 * Prepare Cell Grading for future bulk / machine imports WITHOUT introducing a second
 * grading engine and WITHOUT changing the certified manual-entry behaviour.
 *
 * THE ONE-ENGINE RULE
 * Every source — Manual Entry today, Excel/CSV later — normalizes its input into
 * `GradingMeasurementRecord` and flows through the SAME pipeline:
 *
 *   Source -> Import Adapter -> Validation -> Preview -> Operator Approval
 *          -> Existing Grading Engine (calcGrade in cells.ts) -> ECF -> Audit
 *
 * There is never a second grading engine: adapters only produce normalized records;
 * the grade/status is always computed by the existing engine.
 *
 * SCOPE (v1.0)
 *   - "manual"  ACTIVE   — the certified reference implementation.
 *   - "excel"   RESERVED — extension point only; parser NOT implemented.
 *   - "csv"     RESERVED — extension point only; parser NOT implemented.
 * Explicitly OUT OF SCOPE (no code, no enum value): PDF, Word, Machine API, OPC-UA, Modbus.
 */

/** Sources the framework is designed to accept. Only "manual" is wired in v1.0. */
export type GradingImportSourceType = "manual" | "excel" | "csv";

/**
 * Allowed manual override values — kept in lockstep with the certified `GradeCellBody`
 * Zod enum (`approved | rejected | quarantine | "null"`). Single source for the
 * Validation stage so import parity with manual entry cannot drift.
 */
export const GRADING_OVERRIDE_STATUSES = [
  "approved",
  "rejected",
  "quarantine",
  "null",
] as const;
export type GradingOverrideStatus = (typeof GRADING_OVERRIDE_STATUSES)[number];

/**
 * Normalized measurement row — the canonical, source-agnostic input the grading
 * engine consumes. One record == one cell's measurement event. The field set mirrors
 * the certified `GradeCellBody` contract so manual and imported rows are interchangeable.
 */
export interface GradingMeasurementRecord {
  /** Target cell (DB id). The adapter is responsible for resolving identity. */
  cellId: string;
  voltageV: number;
  capacityAh: number;
  internalResistanceMohm: number;
  temperatureC?: number | null;
  gradingMachineId?: string | null;
  gradingNotes?: string | null;
  /** Optional manual override of the derived status (mirrors GradeCellBody.overrideStatus). */
  overrideStatus?: GradingOverrideStatus | null;
}

/** Cross-cutting context applied to a whole import batch. */
export interface GradingImportContext {
  /** Operator attribution recorded as gradedBy (and into the audit/ECF trail). */
  performedBy: string;
}

export interface GradingImportValidationIssue {
  rowIndex: number;
  field?: string;
  message: string;
}

export interface GradingImportPreviewRow {
  record: GradingMeasurementRecord;
  valid: boolean;
  issues: GradingImportValidationIssue[];
}

/**
 * The "Preview" stage payload. Surfaced to the operator for approval BEFORE any
 * record reaches the grading engine — manual and bulk imports share this gate.
 */
export interface GradingImportPreview {
  sourceType: GradingImportSourceType;
  rows: GradingImportPreviewRow[];
  /** Batch-level issues (e.g. missing operator attribution); rowIndex = -1. */
  contextIssues: GradingImportValidationIssue[];
  validCount: number;
  invalidCount: number;
  /** True only when attribution is present AND every row is valid. */
  ok: boolean;
}

/**
 * Adapter contract. Future Excel/CSV adapters implement this interface ONLY — they
 * never touch the grading engine, the ECF, or the audit layer. Implementations parse
 * their own payload format and return normalized records.
 */
export interface GradingImportSource {
  readonly sourceType: GradingImportSourceType;
  /** Produce normalized records from the underlying source payload. */
  read(): Promise<GradingMeasurementRecord[]> | GradingMeasurementRecord[];
}
