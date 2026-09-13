/**
 * Task 70-I — Physical inventory adjustment schemas.
 *
 * This is a separate ledger-writing domain from consumption /adjust, which
 * remains annotation-only.
 */
import * as zod from "zod";

export const CreateAdjustmentBody = zod.object({
  material_id: zod.string().uuid(),
  warehouse_id: zod.string().uuid(),
  location_id: zod.string().uuid().optional(),
  bin_id: zod.string().uuid().optional(),
  lot_id: zod.string().uuid().optional(),
  type: zod.enum(["positive", "negative"]),
  quantity: zod.coerce.number().positive(),
  reason: zod.string().min(1).max(255),
  count_reference: zod.string().max(50).nullish(),
  notes: zod.string().max(500).nullish(),
});
export type CreateAdjustmentBody = zod.infer<typeof CreateAdjustmentBody>;

export const SubmitAdjustmentBody = zod.object({});
export type SubmitAdjustmentBody = zod.infer<typeof SubmitAdjustmentBody>;

export const ApproveAdjustmentBody = zod.object({});
export type ApproveAdjustmentBody = zod.infer<typeof ApproveAdjustmentBody>;

export const RejectAdjustmentBody = zod.object({
  reason: zod.string().min(1).max(255),
});
export type RejectAdjustmentBody = zod.infer<typeof RejectAdjustmentBody>;