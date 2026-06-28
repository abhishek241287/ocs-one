import { ecfEntityTypeEnum, ecfCorrectionTypeEnum } from "@workspace/db/schema";

// The strongly-typed entity taxonomy, derived from the DB enum so the framework
// and the schema can never drift.
export type EcfEntityType = (typeof ecfEntityTypeEnum.enumValues)[number];
export type EcfCorrectionType = (typeof ecfCorrectionTypeEnum.enumValues)[number];

/** JSON-serialisable snapshot of the affected values (the "Previous"/"New" value). */
export type EcfValueSnapshot = Record<string, unknown>;

/** Optional engineering context (machine serial, firmware, shift, …). Never columns. */
export type EcfMetadata = Record<string, unknown>;

export interface RecordOriginalInput {
  entityType: EcfEntityType;
  entityId: string;
  /** Snapshot of the baseline values being recorded (engineering version 1). */
  newValue: EcfValueSnapshot;
  /** Actor who recorded the original. */
  performedBy: string;
  /** Domain audit event the operation emits on its own module timeline. */
  auditEventType: string;
  approvedBy?: string | null;
  approvedAt?: Date | null;
  metadata?: EcfMetadata | null;
}

export interface CorrectInput {
  entityType: EcfEntityType;
  entityId: string;
  /** Mandatory, non-blank reason for the correction (audit requirement). */
  correctionReason: string;
  /** Snapshot of the values before the correction. */
  previousValue: EcfValueSnapshot;
  /** Snapshot of the values after the correction (the new engineering version). */
  newValue: EcfValueSnapshot;
  /** Actor who performed the correction. */
  performedBy: string;
  /** Approver of record (defaults to performedBy if the module treats them as one). */
  approvedBy?: string | null;
  approvedAt?: Date | null;
  /** Domain audit event the operation emits on its own module timeline. */
  auditEventType: string;
  metadata?: EcfMetadata | null;
  // ── Authorization enforcement (framework-supplied; module supplies the values) ──
  /** The authenticated actor's role, if the module wants ECF to enforce it. */
  actorRole?: string;
  /** Roles permitted to correct; throws EcfAuthorizationError if violated. */
  allowedRoles?: readonly string[];
}

/** Invalid input (e.g. blank reason / missing actor) — map to HTTP 400. */
export class EcfValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EcfValidationError";
  }
}

/** Actor role not permitted to perform the correction — map to HTTP 403. */
export class EcfAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EcfAuthorizationError";
  }
}
