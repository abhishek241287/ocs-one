/**
 * Task 70-G — WIP return request schemas.
 *
 * Returns bridge a Phase 4 WIP issue back to available stock. They do not
 * restore reservation allocations or alter issued/allocated arithmetic.
 */
import * as zod from "zod";

export const CreateReturnBody = zod.object({
  production_order_id: zod.string().uuid(),
  material_id: zod.string().uuid(),
  wip_issue_note_id: zod.string().uuid(),
  quantity: zod.coerce.number().positive(),
  destination_warehouse_id: zod.string().uuid(),
  destination_location_id: zod.string().uuid().optional(),
  destination_bin_id: zod.string().uuid().optional(),
  reason: zod.string().min(1).max(255),
  lot_id: zod.string().uuid().optional(),
});
export type CreateReturnBody = zod.infer<typeof CreateReturnBody>;

export const ApproveReturnBody = zod.object({});
export type ApproveReturnBody = zod.infer<typeof ApproveReturnBody>;

export const RejectReturnBody = zod.object({
  reason: zod.string().min(1).max(255),
});
export type RejectReturnBody = zod.infer<typeof RejectReturnBody>;