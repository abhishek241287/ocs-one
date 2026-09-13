// Task 70-J — Transfer lifecycle schemas.
// Hand-written because the transfer request contract is intentionally tracked
// separately from generated OpenAPI output.
import * as zod from "zod";

const uuid = zod.string().uuid();

const transferLine = zod.object({
  material_id: uuid,
  quantity: zod.coerce.number().positive(),
  lot_id: uuid.optional(),
  source_location_id: uuid.optional(),
  source_bin_id: uuid.optional(),
  destination_location_id: uuid.optional(),
  destination_bin_id: uuid.optional(),
});

export const CreateTransferRequestBody = zod.object({
  source_warehouse_id: uuid,
  destination_warehouse_id: uuid,
  notes: zod.string().max(500).nullish(),
  lines: zod.array(transferLine).min(1),
});
export type CreateTransferRequestBody = zod.infer<typeof CreateTransferRequestBody>;

export const ReceiveTransferBody = zod.object({
  lines: zod
    .array(
      zod.object({
        line_id: uuid,
        quantity: zod.coerce.number().positive(),
      }),
    )
    .min(1)
    .superRefine((lines, ctx) => {
      const ids = new Set<string>();
      lines.forEach((line, index) => {
        if (ids.has(line.line_id)) {
          ctx.addIssue({
            code: zod.ZodIssueCode.custom,
            path: [index, "line_id"],
            message: "Each line_id may appear only once per receive request",
          });
        }
        ids.add(line.line_id);
      });
    }),
});
export type ReceiveTransferBody = zod.infer<typeof ReceiveTransferBody>;

export const RejectTransferBody = zod.object({
  reason: zod.string().min(1).max(255),
});
export type RejectTransferBody = zod.infer<typeof RejectTransferBody>;

export const EmptyTransferBody = zod.object({});