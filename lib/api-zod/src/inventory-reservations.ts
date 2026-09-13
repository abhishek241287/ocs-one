// Task #69 — Reservation & Allocation request schemas (hand-written).
// Field names match the API snake_case JSON contract; kept in a separate module
// because src/generated/api.ts is orval-generated and must not be edited.
// When the canonical OpenAPI spec gains the reservation endpoints, these schemas
// should be replaced by the orval-generated equivalents (same names/shape).
import * as zod from "zod";

export const CreateReservationBody = zod.object({
  production_order_id: zod.string().uuid(),
  material_id: zod.string().uuid(),
  quantity: zod.coerce.number().positive(),
  notes: zod.string().max(500).nullish(),
  allow_partial: zod.boolean().default(false),
  expiry_date: zod.string().datetime().nullish(),
});
export type CreateReservationBody = zod.infer<typeof CreateReservationBody>;

export const AllocateReservationBody = zod.object({
  quantity: zod.coerce.number().positive().optional(),
  lot_id: zod.string().uuid().optional(),
  allow_partial: zod.boolean().default(false),
  strategy: zod.enum(["FIFO", "FEFO"]).default("FIFO"),
});
export type AllocateReservationBody = zod.infer<typeof AllocateReservationBody>;

export const CancelReservationBody = zod.object({
  reason: zod.string().min(1).max(255),
});
export type CancelReservationBody = zod.infer<typeof CancelReservationBody>;

export const ReservationIdParams = zod.object({
  id: zod.coerce.string().uuid(),
});
export type ReservationIdParams = zod.infer<typeof ReservationIdParams>;

export const IssueReservationBody = zod.object({
  quantity: zod.coerce.number().positive().optional(),
  lot_id: zod.string().uuid().optional(),
  allow_partial: zod.boolean().default(false),
  notes: zod.string().max(500).nullish(),
});
export type IssueReservationBody = zod.infer<typeof IssueReservationBody>;