import { Router, IRouter } from "express";
import { requireWriteRole } from "../../middleware/auth";
import { db, cellGradeConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpdateCellGradeConfigBody } from "@workspace/api-zod";

const router: IRouter = Router({ mergeParams: true });

// RBAC (DEF-M06-001): grade configuration — supervisor, director only.
router.use(requireWriteRole("supervisor", "director"));

// The singleton config row (id=1) is seeded at startup (lib/seed.ts), so reads
// never perform a write — keeping GET strictly read-only for method-based RBAC.
async function ensureConfig() {
  const [existing] = await db
    .select()
    .from(cellGradeConfigTable)
    .where(eq(cellGradeConfigTable.id, 1));

  if (existing) return existing;

  // Defensive: only reached if startup seed did not run. Writers (PUT) reach
  // this path under supervisor+ guard, so the insert is authorized here.
  const [created] = await db
    .insert(cellGradeConfigTable)
    .values({ id: 1 })
    .returning();

  return created;
}

// GET /cells/config — read-only (no write side effects)
router.get("/", async (_req, res) => {
  const [config] = await db
    .select()
    .from(cellGradeConfigTable)
    .where(eq(cellGradeConfigTable.id, 1));
  res.json(config ?? null);
});

// PUT /cells/config
router.put("/", async (req, res) => {
  const body = UpdateCellGradeConfigBody.parse(req.body);

  await ensureConfig(); // ensure row exists (supervisor+ guarded)

  const [updated] = await db
    .update(cellGradeConfigTable)
    .set({ ...body })
    .where(eq(cellGradeConfigTable.id, 1))
    .returning();

  res.json(updated);
});

export default router;
