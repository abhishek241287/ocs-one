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

export const GrnLineCaptureValues = zod.object({
  line_number: zod.number().int().min(1),
  attributes: zod.array(CanonicalAttributeValue).default([]),
});
export type GrnLineCaptureValues = zod.infer<typeof GrnLineCaptureValues>;

export const ImportCsvBody = zod.object({
  csv: zod.string().min(1).max(10_000_000),
  filename: zod.string().trim().max(255).optional(),
});
export type ImportCsvBody = zod.infer<typeof ImportCsvBody>;

export const ImportConfirmBody = zod.object({}).strict();
export type ImportConfirmBody = zod.infer<typeof ImportConfirmBody>;