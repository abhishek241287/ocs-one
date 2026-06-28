import { Router, type IRouter, type Request, type Response } from "express";
import { asc } from "drizzle-orm";
import { db, materialWorkflowAssignmentsTable } from "@workspace/db";
import { UpsertMaterialWorkflowAssignmentBody } from "@workspace/api-zod";
import { requireWriteRole } from "../../middleware/auth";

const router: IRouter = Router();

// Category → Workflow assignment is platform routing config: reads pass for any authed
// user; writes (the PUT upsert) are director-only (mirrors Material Workflow / Category
// governance).
router.use(requireWriteRole("director"));

function serialize(a: Record<string, any>) {
  return {
    id: a.id,
    category_id: a.categoryId,
    workflow_id: a.workflowId,
    created_at: a.createdAt,
    updated_at: a.updatedAt,
  };
}

// List all assignments.
router.get("/", async (_req: Request, res: Response): Promise<void> => {
  const items = await db
    .select()
    .from(materialWorkflowAssignmentsTable)
    .orderBy(asc(materialWorkflowAssignmentsTable.createdAt));
  res.json({ items: items.map(serialize) });
});

// Upsert the workflow for a category (category_id is UNIQUE → one workflow per
// category). A bad category_id or workflow_id surfaces as 400 (FK violation 23503).
router.put("/", async (req: Request, res: Response): Promise<void> => {
  const parsed = UpsertMaterialWorkflowAssignmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const actorId = req.user?.userId ?? null;
  try {
    const [item] = await db
      .insert(materialWorkflowAssignmentsTable)
      .values({
        categoryId: parsed.data.category_id,
        workflowId: parsed.data.workflow_id,
        createdBy: actorId,
        updatedBy: actorId,
      })
      .onConflictDoUpdate({
        target: materialWorkflowAssignmentsTable.categoryId,
        set: { workflowId: parsed.data.workflow_id, updatedBy: actorId, updatedAt: new Date() },
      })
      .returning();
    res.json(serialize(item as Record<string, any>));
  } catch (err: any) {
    const pgCode = err?.code ?? err?.cause?.code;
    if (pgCode === "23503") {
      res.status(400).json({ error: "Invalid assignment: category or workflow does not exist" });
      return;
    }
    throw err;
  }
});

export default router;
