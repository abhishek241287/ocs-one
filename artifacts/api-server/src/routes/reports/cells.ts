import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  cellsTable,
  cellLotsTable,
  cellMatchesTable,
} from "@workspace/db";
import { sql, count } from "drizzle-orm";

const router: IRouter = Router();

router.get("/", async (_req, res) => {
  const [gradeDistribution] = await db.select({
    gradeA: sql<number>`count(*) filter (where ${cellsTable.grade} = 'A'::cell_grade)`,
    gradeB: sql<number>`count(*) filter (where ${cellsTable.grade} = 'B'::cell_grade)`,
    gradeC: sql<number>`count(*) filter (where ${cellsTable.grade} = 'C'::cell_grade)`,
    rejected: sql<number>`count(*) filter (where ${cellsTable.grade} = 'reject'::cell_grade)`,
    total: count(),
    avgCapacity: sql<number>`avg(${cellsTable.capacityAh})`,
    avgIr: sql<number>`avg(${cellsTable.internalResistanceMohm})`,
  }).from(cellsTable);

  const capacityBuckets = await db.select({
    bucket: sql<string>`floor(${cellsTable.capacityAh} / 5) * 5`,
    count: sql<number>`count(*)`,
  }).from(cellsTable)
    .where(sql`${cellsTable.capacityAh} is not null`)
    .groupBy(sql`floor(${cellsTable.capacityAh} / 5)`)
    .orderBy(sql`floor(${cellsTable.capacityAh} / 5)`);

  const irBuckets = await db.select({
    bucket: sql<string>`floor(${cellsTable.internalResistanceMohm} / 0.5) * 0.5`,
    count: sql<number>`count(*)`,
  }).from(cellsTable)
    .where(sql`${cellsTable.internalResistanceMohm} is not null`)
    .groupBy(sql`floor(${cellsTable.internalResistanceMohm} / 0.5)`)
    .orderBy(sql`floor(${cellsTable.internalResistanceMohm} / 0.5)`)
    .limit(30);

  const bySupplier = await db.select({
    supplier: cellLotsTable.supplier,
    total: count(),
    gradeA: sql<number>`count(*) filter (where ${cellsTable.grade} = 'A'::cell_grade)`,
    gradeB: sql<number>`count(*) filter (where ${cellsTable.grade} = 'B'::cell_grade)`,
    gradeC: sql<number>`count(*) filter (where ${cellsTable.grade} = 'C'::cell_grade)`,
    rejected: sql<number>`count(*) filter (where ${cellsTable.grade} = 'reject'::cell_grade)`,
    avgCapacity: sql<number>`avg(${cellsTable.capacityAh})`,
  }).from(cellsTable)
    .innerJoin(cellLotsTable, sql`${cellsTable.lotId} = ${cellLotsTable.id}`)
    .groupBy(cellLotsTable.supplier)
    .orderBy(sql`count(*) desc`);

  const byLot = await db.select({
    lotNumber: cellLotsTable.lotNumber,
    supplier: cellLotsTable.supplier,
    total: count(),
    gradeA: sql<number>`count(*) filter (where ${cellsTable.grade} = 'A'::cell_grade)`,
    rejected: sql<number>`count(*) filter (where ${cellsTable.grade} = 'reject'::cell_grade)`,
  }).from(cellsTable)
    .innerJoin(cellLotsTable, sql`${cellsTable.lotId} = ${cellLotsTable.id}`)
    .groupBy(cellLotsTable.lotNumber, cellLotsTable.supplier)
    .orderBy(sql`count(*) desc`)
    .limit(20);

  const [matchStats] = await db.select({
    total: count(),
    allocated: sql<number>`count(*) filter (where ${cellMatchesTable.status} = 'allocated'::cell_match_status)`,
    reserved: sql<number>`count(*) filter (where ${cellMatchesTable.status} = 'reserved'::cell_match_status)`,
  }).from(cellMatchesTable);

  const total = Number(gradeDistribution?.total ?? 0);
  const gradeA = Number(gradeDistribution?.gradeA ?? 0);
  const gradeB = Number(gradeDistribution?.gradeB ?? 0);
  const gradeC = Number(gradeDistribution?.gradeC ?? 0);
  const rejected = Number(gradeDistribution?.rejected ?? 0);

  res.json({
    summary: {
      total,
      gradeA,
      gradeB,
      gradeC,
      rejected,
      gradeAPct: total > 0 ? Math.round((gradeA / total) * 100) : 0,
      gradeBPct: total > 0 ? Math.round((gradeB / total) * 100) : 0,
      gradeCPct: total > 0 ? Math.round((gradeC / total) * 100) : 0,
      rejectedPct: total > 0 ? Math.round((rejected / total) * 100) : 0,
      avgCapacity: gradeDistribution?.avgCapacity != null ? Math.round(Number(gradeDistribution.avgCapacity) * 100) / 100 : null,
      avgIr: gradeDistribution?.avgIr != null ? Math.round(Number(gradeDistribution.avgIr) * 100) / 100 : null,
    },
    capacityDistribution: capacityBuckets.map(r => ({
      bucket: `${r.bucket}–${Number(r.bucket) + 5} Ah`,
      count: Number(r.count),
    })),
    irDistribution: irBuckets.map(r => ({
      bucket: `${Number(r.bucket).toFixed(1)}–${(Number(r.bucket) + 0.5).toFixed(1)} mΩ`,
      count: Number(r.count),
    })),
    bySupplier: bySupplier.map(r => ({
      supplier: r.supplier,
      total: Number(r.total),
      gradeA: Number(r.gradeA),
      gradeB: Number(r.gradeB),
      gradeC: Number(r.gradeC),
      rejected: Number(r.rejected),
      yieldPct: Number(r.total) > 0 ? Math.round(((Number(r.gradeA) + Number(r.gradeB)) / Number(r.total)) * 100) : 0,
      avgCapacity: r.avgCapacity != null ? Math.round(Number(r.avgCapacity) * 100) / 100 : null,
    })),
    byLot: byLot.map(r => ({
      lotNumber: r.lotNumber,
      supplier: r.supplier,
      total: Number(r.total),
      gradeA: Number(r.gradeA),
      rejected: Number(r.rejected),
      yieldPct: Number(r.total) > 0 ? Math.round((Number(r.gradeA) / Number(r.total)) * 100) : 0,
    })),
    matchingStats: {
      total: Number(matchStats?.total ?? 0),
      allocated: Number(matchStats?.allocated ?? 0),
      reserved: Number(matchStats?.reserved ?? 0),
      successPct: Number(matchStats?.total ?? 0) > 0
        ? Math.round((Number(matchStats?.allocated ?? 0) / Number(matchStats?.total ?? 1)) * 100) : null,
    },
    refreshedAt: new Date().toISOString(),
  });
});

export default router;
