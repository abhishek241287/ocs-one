import { Router, IRouter } from "express";
import { db, cellsTable } from "@workspace/db";
import { count, eq, and, gte, sql } from "drizzle-orm";

const router: IRouter = Router({ mergeParams: true });

// GET /cells/inventory
router.get("/", async (_req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [statusCounts, gradedTodayRows, receivedTodayRows] = await Promise.all([
    db
      .select({ status: cellsTable.status, cnt: count() })
      .from(cellsTable)
      .groupBy(cellsTable.status),
    db
      .select({ cnt: count() })
      .from(cellsTable)
      .where(
        and(
          gte(cellsTable.gradedAt, today),
          sql`${cellsTable.gradedAt} IS NOT NULL`
        )
      ),
    db
      .select({ cnt: count() })
      .from(cellsTable)
      .where(gte(cellsTable.createdAt, today)),
  ]);

  const m = Object.fromEntries(statusCounts.map((r) => [r.status, Number(r.cnt)]));

  const approved = m.approved ?? 0;
  const rejected = m.rejected ?? 0;
  const quarantine = m.quarantine ?? 0;
  const reserved = m.reserved ?? 0;
  const allocated = m.allocated ?? 0;
  const received = m.received ?? 0;
  const grading = m.grading ?? 0;
  const total = approved + rejected + quarantine + reserved + allocated + received + grading;
  const available = approved; // approved and not reserved/allocated

  res.json({
    total,
    received,
    approved,
    rejected,
    quarantine,
    reserved,
    allocated,
    available,
    gradedToday: Number(gradedTodayRows[0]?.cnt ?? 0),
    receivedToday: Number(receivedTodayRows[0]?.cnt ?? 0),
    approvedPct: total > 0 ? Math.round((approved / total) * 100 * 10) / 10 : 0,
    rejectedPct: total > 0 ? Math.round((rejected / total) * 100 * 10) / 10 : 0,
  });
});

export default router;
