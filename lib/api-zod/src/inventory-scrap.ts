/**
 * Task 70-H — WIP scrap request schemas.
 *
 * Scrap moves WIP to the visible scrapped stock state. It never restores
 * available stock or changes reservation arithmetic.
 */
import * as zod from "zod";

export const CreateScrapBody = zod.object({
  production_order_id: zod.string().uuid(),
  material_id: zod.string().uuid(),
  quantity: zod.coerce.number().positive(),
  reason: zod.string().min(1).max(255),
  lot_id: zod.string().uuid().optional(),
  stage_id: zod.string().uuid().optional(),
  serial_number: zod.string().max(100).nullish(),
  notes: zod.string().max(500).nullish(),
});
export type CreateScrapBody = zod.infer<typeof CreateScrapBody>;

export const ApproveScrapBody = zod.object({});
export type ApproveScrapBody = zod.infer<typeof ApproveScrapBody>;

export const RejectScrapBody = zod.object({
  reason: zod.string().min(1).max(255),
});
export type RejectScrapBody = zod.infer<typeof RejectScrapBody>;