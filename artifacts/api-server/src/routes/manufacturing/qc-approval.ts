import { Router, IRouter } from "express";
import {
  db,
  mfgQcApprovalsTable,
  mfgReworkTicketsTable,
  mfgProductionOrdersTable,
  mfgOrderStagesTable,
  mfgBatteryTimelineTable,
} from "@workspace/db";
import { eq, and, count, like } from "drizzle-orm";
import {
  CreateQcApprovalBody,
} from "@workspace/api-zod";

const router: IRouter = Router({ mergeParams: true });

async function generateTicketNumber(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0]
): Promise<string> {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const prefix = `RW-${y}${m}${d}-`;
  const [result] = await tx
    .select({ c: count() })
    .from(mfgReworkTicketsTable)
    .where(like(mfgReworkTicketsTable.ticketNumber, `${prefix}%`));
  const seq = ((result?.c as number) ?? 0) + 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

// GET /manufacturing/orders/:id/qc-approval
router.get("/", async (req, res) => {
  const id = (req.params as Record<string, string>).id;
  const [approval] = await db
    .select()
    .from(mfgQcApprovalsTable)
    .where(eq(mfgQcApprovalsTable.productionOrderId, id))
    .limit(1);
  if (!approval) { res.status(404).json({ error: "No QC approval found" }); return; }
  res.json(approval);
});

// POST /manufacturing/orders/:id/qc-approval
router.post("/", async (req, res) => {
  const id = (req.params as Record<string, string>).id;
  const body = CreateQcApprovalBody.parse(req.body);

  const [order] = await db
    .select({ id: mfgProductionOrdersTable.id, batteryNumber: mfgProductionOrdersTable.batteryNumber })
    .from(mfgProductionOrdersTable)
    .where(eq(mfgProductionOrdersTable.id, id))
    .limit(1);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }

  const result = await db.transaction(async (tx) => {
    const [approval] = await tx
      .insert(mfgQcApprovalsTable)
      .values({
        productionOrderId: id,
        decision: body.decision,
        inspectorName: body.inspectorName,
        inspectorRole: body.inspectorRole ?? "Plant Manager",
        digitalSignature: body.digitalSignature ?? null,
        remarks: body.remarks ?? null,
        approvedAt: new Date(),
      })
      .returning();

    let reworkTicketId: string | null = null;

    if (body.decision === "rejected") {
      const ticketNumber = await generateTicketNumber(tx);
      const [rework] = await tx
        .insert(mfgReworkTicketsTable)
        .values({
          ticketNumber,
          productionOrderId: id,
          batteryNumber: order.batteryNumber,
          failedTests: (body.failedTests as string[]) ?? [],
          failureReason: body.failureReason ?? "QC inspection failed",
          status: "open",
          retestRequired: true,
        })
        .returning();
      reworkTicketId = rework.id;

      await tx
        .update(mfgOrderStagesTable)
        .set({ status: "rejected", notes: body.remarks ?? "QC rejected" })
        .where(
          and(
            eq(mfgOrderStagesTable.productionOrderId, id),
            eq(mfgOrderStagesTable.stageType, "quality_control")
          )
        );
    } else {
      await tx
        .update(mfgOrderStagesTable)
        .set({
          status: "approved",
          approvedAt: new Date(),
          supervisorName: body.inspectorName,
        })
        .where(
          and(
            eq(mfgOrderStagesTable.productionOrderId, id),
            eq(mfgOrderStagesTable.stageType, "quality_control")
          )
        );
      await tx
        .update(mfgProductionOrdersTable)
        .set({ status: "completed", currentStage: null })
        .where(eq(mfgProductionOrdersTable.id, id));
    }

    await tx.insert(mfgBatteryTimelineTable).values({
      productionOrderId: id,
      eventType: `qc_${body.decision}`,
      stageType: "quality_control",
      actor: body.inspectorName,
      description:
        body.decision === "approved"
          ? `QC APPROVED by ${body.inspectorName} (${body.inspectorRole ?? "Plant Manager"})`
          : `QC REJECTED — rework ticket generated`,
      metadata: { decision: body.decision, reworkTicketId, remarks: body.remarks },
    });

    return { ...approval, reworkTicketId };
  });

  res.status(201).json(result);
});

export default router;
