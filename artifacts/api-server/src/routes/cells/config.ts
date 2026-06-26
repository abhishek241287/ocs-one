import { Router, IRouter } from "express";
import { db, cellGradeConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpdateCellGradeConfigBody } from "@workspace/api-zod";

const router: IRouter = Router({ mergeParams: true });

async function getOrCreateConfig() {
  const [existing] = await db
    .select()
    .from(cellGradeConfigTable)
    .where(eq(cellGradeConfigTable.id, 1));

  if (existing) return existing;

  // Insert default config on first access
  const [created] = await db
    .insert(cellGradeConfigTable)
    .values({ id: 1 })
    .returning();

  return created;
}

// GET /cells/config
router.get("/", async (_req, res) => {
  const config = await getOrCreateConfig();
  res.json(config);
});

// PUT /cells/config
router.put("/", async (req, res) => {
  const body = UpdateCellGradeConfigBody.parse(req.body);

  await getOrCreateConfig(); // ensure row exists

  const [updated] = await db
    .update(cellGradeConfigTable)
    .set({ ...body })
    .where(eq(cellGradeConfigTable.id, 1))
    .returning();

  res.json(updated);
});

export default router;
