import * as zod from "zod";

export const ReverseWipIssueBody = zod.object({
  reason: zod.string().min(1).max(255),
});

export type ReverseWipIssueBody = zod.infer<typeof ReverseWipIssueBody>;