import { Router, type IRouter } from "express";
import { db, cellLotsTable, cellsTable } from "@workspace/db";
import { count, sql } from "drizzle-orm";
import { requireRole } from "../../middleware/auth";
import {
  getMetricsSnapshot,
  getLatencyForRoute,
  getCollectorMeta,
} from "../../lib/metrics";
import {
  PERFORMANCE_BASELINE_V1,
  BUNDLE_BASELINE,
  REGRESSION_RULES,
  REGRESSION_THRESHOLD_PCT,
  BASELINE_VERSION,
  BASELINE_CAPTURED_AT,
} from "../../lib/performance-baseline";

const router: IRouter = Router();

/** Time a single DB query, returning elapsed ms and row count. */
async function timed<T>(fn: () => Promise<T[]>): Promise<{ ms: number; rows: number }> {
  const start = process.hrtime.bigint();
  const result = await fn();
  const ms = Math.round((Number(process.hrtime.bigint() - start) / 1e6) * 100) / 100;
  return { ms, rows: Array.isArray(result) ? result.length : 0 };
}

// Director-only — this is internal engineering telemetry.
router.get("/", requireRole("director"), async (_req, res) => {
  const apiLatency = getMetricsSnapshot();
  const slowestEndpoints = [...apiLatency]
    .filter((r) => r.count > 0)
    .sort((a, b) => b.p95 - a.p95)
    .slice(0, 5);

  // ─── Live DB query timings ──────────────────────────────────────────────────
  const [lotCount, lotList, cellCount] = await Promise.all([
    timed(() => db.select({ c: count() }).from(cellLotsTable)),
    timed(() =>
      db
        .select({ id: cellLotsTable.id })
        .from(cellLotsTable)
        .orderBy(sql`${cellLotsTable.createdAt} desc`)
        .limit(20),
    ),
    timed(() => db.select({ c: count() }).from(cellsTable)),
  ]);

  const dbTimings = [
    { label: "COUNT cell_lots", ms: lotCount.ms },
    { label: "List cell_lots (ORDER BY created_at DESC LIMIT 20)", ms: lotList.ms },
    { label: "COUNT cells", ms: cellCount.ms },
  ];

  // ─── Baseline comparison + regression detection ──────────────────────────────
  // A regression is only asserted once we have a statistically meaningful number
  // of live samples since boot. Below this, cold-start/JIT warm-up noise would
  // produce false positives — we report "insufficient data" instead of crying wolf.
  const MIN_SAMPLES_FOR_REGRESSION = 30;

  const baselineComparison = PERFORMANCE_BASELINE_V1.map((entry) => {
    const live = entry.routeKey
      ? getLatencyForRoute(entry.routeKey.method, entry.routeKey.route)
      : null;
    const sampleCount = live?.count ?? 0;
    const currentP95 = live && sampleCount > 0 ? live.p95 : null;
    const sufficientData = sampleCount >= MIN_SAMPLES_FOR_REGRESSION;

    let deltaPct: number | null = null;
    let regression = false;
    if (currentP95 != null && entry.baselineMs != null && entry.baselineMs > 0) {
      deltaPct = Math.round(((currentP95 - entry.baselineMs) / entry.baselineMs) * 1000) / 10;
      regression = sufficientData && deltaPct > REGRESSION_THRESHOLD_PCT;
    }

    const withinTarget =
      currentP95 != null && entry.targetMs != null ? currentP95 <= entry.targetMs : null;

    return {
      operation: entry.operation,
      endpoint: entry.endpoint,
      targetMs: entry.targetMs,
      baselineMs: entry.baselineMs,
      currentP95,
      sampleCount,
      sufficientData,
      deltaPct,
      regression,
      withinTarget,
      measured: entry.measured,
      dataset: entry.dataset,
      environment: entry.environment,
      note: entry.note ?? null,
    };
  });

  const regressionCount = baselineComparison.filter((c) => c.regression).length;

  // ─── Server runtime ──────────────────────────────────────────────────────────
  const mem = process.memoryUsage();
  const toMb = (n: number) => Math.round((n / 1024 / 1024) * 100) / 100;
  const collector = getCollectorMeta();

  res.json({
    generatedAt: new Date().toISOString(),
    baselineVersion: BASELINE_VERSION,
    baselineCapturedAt: BASELINE_CAPTURED_AT,
    regressionThresholdPct: REGRESSION_THRESHOLD_PCT,
    regressionCount,
    server: {
      uptimeSec: Math.round(process.uptime()),
      nodeVersion: process.version,
      pid: process.pid,
      memory: {
        rssMb: toMb(mem.rss),
        heapUsedMb: toMb(mem.heapUsed),
        heapTotalMb: toMb(mem.heapTotal),
        externalMb: toMb(mem.external),
      },
    },
    collector: {
      trackedRoutes: collector.trackedRoutes,
      sampleCap: collector.sampleCap,
      sinceMs: Date.now() - collector.startedAt,
    },
    apiLatency,
    slowestEndpoints,
    dbTimings,
    bundle: BUNDLE_BASELINE,
    baselineComparison,
    regressionRules: REGRESSION_RULES,
  });
});

export default router;
