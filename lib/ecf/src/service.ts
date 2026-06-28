import { engineeringCorrectionsTable } from "@workspace/db/schema";
import type { EngineeringCorrection } from "@workspace/db/schema";
import type { Executor } from "@workspace/db";
import { and, asc, eq, max, sql } from "drizzle-orm";
import {
  EcfAuthorizationError,
  EcfValidationError,
  type CorrectInput,
  type EcfEntityType,
  type RecordOriginalInput,
} from "./types";

// ─── Engineering Correction Framework — platform service ──────────────────────
// The single audited correction process for OCS One. Every module calls these
// platform operations instead of re-implementing correction logic. The library
// is deliberately GENERIC — it knows nothing about cells, batteries, or any
// module: only entityType / entityId / previousValue / newValue / reason /
// performedBy / approvedBy / auditEventType / metadata.
//
// Framework owns: append-only storage, engineering-version (sequence) generation,
//   unique Correction ID generation, immutability, authorization enforcement,
//   reason validation, history retrieval.
// Module owns: the entity + its row lock, business rules, state transitions,
//   value recalculation, and its own audit destination (module timeline).
//
// All write operations run inside a CALLER-PROVIDED transaction so the ledger
// write commits atomically with the module's own state change and audit event.

/**
 * Generate the next globally-unique human Correction ID: CORR-YYYYMMDD-NNNNNN.
 * The numeric part comes from a global Postgres sequence (`ecf_correction_seq`,
 * created at startup) so it is collision-free under concurrency and append-only.
 */
async function nextCorrectionId(exec: Executor): Promise<string> {
  const res = await exec.execute(
    sql`SELECT nextval('ecf_correction_seq')::bigint AS n`
  );
  const rows = (res as unknown as { rows: Array<{ n: string | number }> }).rows;
  const n = Number(rows[0].n);
  const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `CORR-${yyyymmdd}-${String(n).padStart(6, "0")}`;
}

/**
 * Validate a correction before it is persisted. Enforces a non-blank reason and
 * actor (audit integrity) and, when the module supplies role context, that the
 * actor's role is permitted. Throws EcfValidationError / EcfAuthorizationError.
 */
export function validateCorrection(input: CorrectInput): void {
  if (!input.correctionReason || input.correctionReason.trim().length === 0) {
    throw new EcfValidationError("correction reason is required and cannot be blank");
  }
  if (!input.performedBy || input.performedBy.trim().length === 0) {
    throw new EcfValidationError("performedBy is required and cannot be blank");
  }
  if (!input.auditEventType || input.auditEventType.trim().length === 0) {
    throw new EcfValidationError("auditEventType is required and cannot be blank");
  }
  // Authorization: when a module opts into role enforcement by supplying
  // `allowedRoles`, an actor role MUST be present — otherwise the check would
  // silently no-op and leak a correction past authorization. Fail closed.
  if (input.allowedRoles) {
    if (input.actorRole === undefined || input.actorRole.trim().length === 0) {
      throw new EcfAuthorizationError(
        `actorRole is required when allowedRoles is enforced for ${input.entityType}`
      );
    }
    if (!input.allowedRoles.includes(input.actorRole)) {
      throw new EcfAuthorizationError(
        `role '${input.actorRole}' is not permitted to correct ${input.entityType}`
      );
    }
  }
}

/** Validate an original baseline before it is persisted (framework integrity). */
function validateOriginal(input: RecordOriginalInput): void {
  if (!input.performedBy || input.performedBy.trim().length === 0) {
    throw new EcfValidationError("performedBy is required and cannot be blank");
  }
  if (!input.auditEventType || input.auditEventType.trim().length === 0) {
    throw new EcfValidationError("auditEventType is required and cannot be blank");
  }
}

/** Record the immutable engineering-version-1 baseline ("original") for an entity. */
async function recordOriginal(
  tx: Executor,
  input: RecordOriginalInput
): Promise<EngineeringCorrection> {
  validateOriginal(input);
  const correctionId = await nextCorrectionId(tx);
  const [row] = await tx
    .insert(engineeringCorrectionsTable)
    .values({
      correctionId,
      entityType: input.entityType,
      entityId: input.entityId,
      sequence: 1,
      correctionType: "original",
      reason: null,
      previousValue: null,
      newValue: input.newValue,
      performedBy: input.performedBy.trim(),
      approvedBy: input.approvedBy ?? null,
      approvedAt: input.approvedAt ?? null,
      auditEventType: input.auditEventType,
      metadata: input.metadata ?? null,
    })
    .returning();
  return row;
}

/**
 * Append a correction (the next engineering version). Validates the input,
 * assigns the next version for the entity (the caller must hold a row lock on the
 * entity so this is collision-free), generates a unique Correction ID, and writes
 * an immutable correction row. Returns the persisted ledger record.
 */
async function correct(tx: Executor, input: CorrectInput): Promise<EngineeringCorrection> {
  validateCorrection(input);

  const [{ maxSeq }] = await tx
    .select({ maxSeq: max(engineeringCorrectionsTable.sequence) })
    .from(engineeringCorrectionsTable)
    .where(
      and(
        eq(engineeringCorrectionsTable.entityType, input.entityType),
        eq(engineeringCorrectionsTable.entityId, input.entityId)
      )
    );
  const nextSequence = (maxSeq ?? 0) + 1;
  const correctionId = await nextCorrectionId(tx);

  const [row] = await tx
    .insert(engineeringCorrectionsTable)
    .values({
      correctionId,
      entityType: input.entityType,
      entityId: input.entityId,
      sequence: nextSequence,
      correctionType: "correction",
      reason: input.correctionReason.trim(),
      previousValue: input.previousValue,
      newValue: input.newValue,
      performedBy: input.performedBy.trim(),
      approvedBy: input.approvedBy ?? input.performedBy.trim(),
      approvedAt: input.approvedAt ?? new Date(),
      auditEventType: input.auditEventType,
      metadata: input.metadata ?? null,
    })
    .returning();
  return row;
}

/** Full append-only history for an entity, oldest version first (genealogy). */
async function getHistory(
  exec: Executor,
  entityType: EcfEntityType,
  entityId: string
): Promise<EngineeringCorrection[]> {
  return exec
    .select()
    .from(engineeringCorrectionsTable)
    .where(
      and(
        eq(engineeringCorrectionsTable.entityType, entityType),
        eq(engineeringCorrectionsTable.entityId, entityId)
      )
    )
    .orderBy(asc(engineeringCorrectionsTable.sequence));
}

export const EngineeringCorrectionService = {
  recordOriginal,
  correct,
  getHistory,
  validateCorrection,
};
