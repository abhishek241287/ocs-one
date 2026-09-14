import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  BulkIssueError,
  executeBulkIssueInTx,
} from "../../lib/bulk-issue-engine";
import { recordSecurityEvent, reqMeta } from "../../lib/security-events";
import { requireWriteRole } from "../../middleware/auth";

const router: IRouter = Router({ mergeParams: true });
router.use(requireWriteRole("supervisor", "director"));

router.post("/bulk", async (req: Request, res: Response): Promise<void> => {
  const orderId = req.params.id as string;
  const idempotencyKey = (req.header("idempotency-key") ?? "").trim().slice(0, 100);
  if (!idempotencyKey) {
    res.status(400).json({ error: "Idempotency-Key header is required" });
    return;
  }
  if (req.body?.notes !== undefined && typeof req.body.notes !== "string") {
    res.status(400).json({ error: "notes must be a string" });
    return;
  }

  const actorId = req.user!.userId;
  const actorName = req.user?.email ?? req.user?.name ?? null;
  const notes = req.body?.notes ?? null;

  try {
    const outcome = await db.transaction((tx) =>
      executeBulkIssueInTx(tx, {
        productionOrderId: orderId,
        idempotencyKey,
        actorId,
        actorName,
        notes,
      }),
    );

    if (!outcome.projection) {
      res.status(500).json({ error: "Bulk issue projection unavailable" });
      return;
    }

    void recordSecurityEvent({
      eventType: outcome.status === 201 ? "bulk_issue.created" : "bulk_issue.replayed",
      actorId,
      actorEmail: req.user?.email ?? null,
      actorRole: req.user?.role ?? null,
      ...reqMeta(req),
      statusCode: outcome.status,
      detail: `Bulk issue ${outcome.status === 201 ? "created" : "replayed"} for production order ${orderId}`,
    });
    res.status(outcome.status).json(outcome.projection);
  } catch (error) {
    if (error instanceof BulkIssueError) {
      res.status(error.statusCode).json(error.body);
      return;
    }
    throw error;
  }
});

export default router;