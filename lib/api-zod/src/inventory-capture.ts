/**
 * Phase 6 — Canonical Capture Contract (Constitution A1).
 *
 * Every input channel produces this shape before validation. Identity and
 * quantity remain in the operation envelope; attribute values are keyed by
 * immutable attribute_code.
 */
import * as zod from "zod";

export const CanonicalAttributeValue = zod.object({
  attribute_code: zod.string().min(1).max(60),
  raw: zod.unknown().optional(),
  value: zod.unknown().optional(),
  supplied_unit: zod.string().trim().max(20).nullish(),
});
export type CanonicalAttributeValue = zod.infer<typeof CanonicalAttributeValue>;

export const CanonicalCaptureInput = zod.object({
  material_id: zod.string().uuid(),
  lot_number: zod.string().max(60).nullish(),
  serial_number: zod.string().max(100).nullish(),
  quantity: zod.number().positive(),
  attributes: zod.array(CanonicalAttributeValue).default([]),
  source: zod.object({
    type: zod.enum(["MANUAL", "CSV", "SCAN", "API", "SYSTEM"]),
    session_id: zod.string().uuid().nullish(),
    row_ref: zod.string().max(60).nullish(),
  }),
});
export type CanonicalCaptureInput = zod.infer<typeof CanonicalCaptureInput>;