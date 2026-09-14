/**
 * Phase 6 — Universal Capture configuration request schemas.
 */
import * as zod from "zod";

export const CreateUnitBody = zod.object({
  unit_code: zod.string().min(1).max(20),
  dimension: zod.string().min(1).max(50),
  canonical_unit: zod.string().min(1).max(20),
  conversion_factor: zod.coerce.number().positive().default(1),
});
export const UpdateUnitBody = zod.object({
  active: zod.boolean(),
});
export const UpsertUnitBody = CreateUnitBody.partial().extend({
  dimension: zod.string().min(1).max(50),
  canonical_unit: zod.string().min(1).max(20),
  conversion_factor: zod.coerce.number().positive().default(1),
});

export const CreateAttributeBody = zod.object({
  code: zod.string().min(1).max(60),
  name: zod.string().min(1).max(120),
  data_type: zod.enum([
    "TEXT",
    "DECIMAL",
    "INTEGER",
    "BOOLEAN",
    "DATE",
    "DATETIME",
    "DROPDOWN",
  ]),
  scope: zod
    .enum(["MATERIAL", "LOT", "SERIAL", "RECEIPT_LINE", "OPERATION"])
    .default("RECEIPT_LINE"),
  unit_code: zod.string().max(20).nullish(),
  allowed_units: zod.array(zod.string().max(20)).nullish(),
  precision: zod.number().int().positive().nullish(),
  scale: zod.number().int().min(0).nullish(),
  min_value: zod.coerce.number().nullish(),
  max_value: zod.coerce.number().nullish(),
  allowed_values: zod.array(zod.string().max(200)).nullish(),
  regex: zod.string().max(255).nullish(),
  max_length: zod.number().int().positive().nullish(),
  required_default: zod.boolean().default(false),
  description: zod.string().max(500).nullish(),
});
export const UpdateAttributeBody = zod.object({
  name: zod.string().min(1).max(120).optional(),
  description: zod.string().max(500).nullish(),
  allowed_values: zod.array(zod.string().max(200)).nullish(),
  required_default: zod.boolean().optional(),
});

export const CreateTemplateBody = zod.object({
  code: zod.string().min(1).max(60),
  name: zod.string().min(1).max(120),
  description: zod.string().max(500).nullish(),
});
export const UpdateTemplateBody = zod.object({
  name: zod.string().min(1).max(120).optional(),
  description: zod.string().max(500).nullish(),
});

export const CreateTemplateVersionBody = zod.object({
  version_no: zod.number().int().positive(),
  effective_from: zod.string().datetime(),
  effective_to: zod.string().datetime().nullish(),
});
export const UpdateTemplateVersionBody = zod.object({
  effective_from: zod.string().datetime().optional(),
  effective_to: zod.string().datetime().nullish(),
});
export const AddTemplateAttributeBody = zod.object({
  attribute_id: zod.string().uuid(),
  required: zod.boolean().default(false),
  sequence: zod.number().int().min(0).default(0),
  default_value: zod.string().nullish(),
  allowed_values_override: zod.array(zod.string().max(200)).nullish(),
  unit_override: zod.string().max(20).nullish(),
});

export const CreateMappingBody = zod.object({
  scope: zod.enum(["MATERIAL", "CATEGORY"]),
  material_id: zod.string().uuid().nullish(),
  category_id: zod.string().uuid().nullish(),
  template_id: zod.string().uuid(),
  effective_from: zod.string().datetime().optional(),
  effective_to: zod.string().datetime().nullish(),
});
export const UpdateMappingBody = zod.object({
  status: zod.enum(["ACTIVE", "RETIRED"]).optional(),
  effective_to: zod.string().datetime().nullish(),
});

export const UpsertProfileBody = zod.object({
  tracking_mode: zod.enum(["NONE", "LOT", "SERIAL", "LOT_AND_SERIAL"]),
});