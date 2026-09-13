/**
 * Task 70-C — Consumption request schemas.
 *
 * Returns and scrap are intentionally not accepted in this phase. Their
 * physical movements are not implemented yet, and accepting them without
 * matching ledger rows would violate the WIP remaining-quantity invariant.
 */
import * as zod from "zod";

export const CreateConsumptionBody = zod.object({
  production_order_id: zod.string().uuid(),
  material_id: zod.string().uuid(),
  actual_qty: zod.coerce.number().positive(),
  planned_qty: zod.coerce.number().positive().optional(),
  lot_id: zod.string().uuid().optional(),
  reason: zod.string().max(255).nullish(),
});
export type CreateConsumptionBody = zod.infer<typeof CreateConsumptionBody>;

export const ConfirmConsumptionBody = zod.object({});
export type ConfirmConsumptionBody = zod.infer<typeof ConfirmConsumptionBody>;