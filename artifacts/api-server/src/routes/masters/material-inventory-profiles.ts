import { Router, type Request, type Response } from "express";
import { count, desc, eq } from "drizzle-orm";
import { UpsertProfileBody } from "@workspace/api-zod";
import {
  db,
  inventoryLotsTable,
  inventoryTransactionsTable,
  materialInventoryProfilesTable,
  materialsTable,
  outboxEventsTable,
  wipInventoryTable,
} from "@workspace/db";
import { requireWriteRole } from "../../middleware/auth";
import { recordSecurityEvent, reqMeta } from "../../lib/security-events";

const router = Router();
router.use(requireWriteRole("director"));

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] ?? "" : value;
}

function serialize(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/([A-Z])/g, "_$1").toLowerCase(),
      value,
    ]),
  );
}

function pgCode(error: any): string | undefined {
  return error?.code ?? error?.cause?.code;
}

async function emit(
  tx: any,
  aggregateId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await tx.insert(outboxEventsTable).values({
    aggregateType: "material_inventory_profile",
    aggregateId,
    eventType: "PROFILE_UPSERTED",
    payload,
  });
}

function audit(req: Request, statusCode: number, detail: string): void {
  void recordSecurityEvent({
    eventType: "capture.profile.upserted",
    actorId: req.user?.userId ?? null,
    actorEmail: req.user?.email ?? null,
    actorRole: req.user?.role ?? null,
    ...reqMeta(req),
    statusCode,
    detail,
  });
}

async function hasMaterialActivity(tx: any, materialId: string): Promise<boolean> {
  const [transactionCount] = await tx
    .select({ count: count() })
    .from(inventoryTransactionsTable)
    .where(eq(inventoryTransactionsTable.materialId, materialId));
  const [lotCount] = await tx
    .select({ count: count() })
    .from(inventoryLotsTable)
    .where(eq(inventoryLotsTable.materialId, materialId));
  const [wipCount] = await tx
    .select({ count: count() })
    .from(wipInventoryTable)
    .where(eq(wipInventoryTable.materialId, materialId));
  return Number(transactionCount?.count ?? 0) > 0 ||
    Number(lotCount?.count ?? 0) > 0 ||
    Number(wipCount?.count ?? 0) > 0;
}

router.get("/", async (_req: Request, res: Response): Promise<void> => {
  const rows = await db
    .select()
    .from(materialInventoryProfilesTable)
    .orderBy(desc(materialInventoryProfilesTable.updatedAt));
  res.json({ items: rows.map((row) => serialize(row as Record<string, unknown>)) });
});

router.get("/:materialId", async (req: Request, res: Response): Promise<void> => {
  const [row] = await db
    .select()
    .from(materialInventoryProfilesTable)
    .where(eq(materialInventoryProfilesTable.materialId, param(req.params.materialId)));
  if (!row) {
    res.status(404).json({ error: "Material inventory profile not found" });
    return;
  }
  res.json(serialize(row as Record<string, unknown>));
});

router.put("/:materialId", async (req: Request, res: Response): Promise<void> => {
  const parsed = UpsertProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const outcome = await db.transaction(async (tx) => {
      const [material] = await tx
        .select({ id: materialsTable.id })
        .from(materialsTable)
        .where(eq(materialsTable.id, param(req.params.materialId)));
      if (!material) return { row: null, status: 400, error: "Material not found" };

      const [existing] = await tx
        .select()
        .from(materialInventoryProfilesTable)
        .where(eq(materialInventoryProfilesTable.materialId, param(req.params.materialId)))
        .for("update");
      if (existing && existing.trackingMode !== parsed.data.tracking_mode) {
        if (await hasMaterialActivity(tx, param(req.params.materialId))) {
          return {
            row: null,
            status: 409,
            error: "UNSAFE_TRANSITION",
          };
        }
      }

      let row;
      if (existing) {
        [row] = await tx
          .update(materialInventoryProfilesTable)
          .set({
            trackingMode: parsed.data.tracking_mode,
            updatedBy: req.user?.userId ?? null,
            updatedAt: new Date(),
          })
          .where(eq(materialInventoryProfilesTable.materialId, param(req.params.materialId)))
          .returning();
      } else {
        [row] = await tx
          .insert(materialInventoryProfilesTable)
          .values({
            materialId: param(req.params.materialId),
            trackingMode: parsed.data.tracking_mode,
            updatedBy: req.user?.userId ?? null,
          })
          .returning();
      }
      if (!row) throw new Error("Profile upsert returned no row");
      await emit(tx, param(req.params.materialId), {
        profile: serialize(row as Record<string, unknown>),
      });
      return { row, status: 200, error: null };
    });
    if (!outcome.row) {
      res.status(outcome.status).json({ error: outcome.error });
      return;
    }
    audit(req, 200, `Material inventory profile upserted: ${param(req.params.materialId)}`);
    res.json(serialize(outcome.row as Record<string, unknown>));
  } catch (error) {
    if (pgCode(error) === "23503" || pgCode(error) === "22P02") {
      res.status(400).json({ error: "Invalid material reference" });
      return;
    }
    throw error;
  }
});

export default router;