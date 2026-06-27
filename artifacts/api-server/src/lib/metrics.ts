/**
 * In-memory API latency collector.
 *
 * A bounded ring buffer of request durations per normalized route. Powers the
 * /developer/performance engineering health dashboard. This is intentionally
 * dependency-free and in-process: it resets on restart and is not a substitute
 * for an external APM, but it gives live P50/P95/P99 for the running process.
 */

const MAX_SAMPLES = 1000;

interface RouteStat {
  method: string;
  route: string;
  durations: number[];
  total: number;
  errors: number;
}

const store = new Map<string, RouteStat>();
const startedAt = Date.now();

/** Collapse dynamic path segments (ids/uuids) so routes don't explode in cardinality. */
export function normalizeRoute(path: string): string {
  return (path.split("?")[0] || "/")
    .replace(/\/[0-9a-fA-F]{8}-[0-9a-fA-F-]{27,}/g, "/:id") // uuids
    .replace(/\/\d+/g, "/:id"); // numeric ids
}

export function recordRequest(
  method: string,
  path: string,
  durationMs: number,
  statusCode: number,
): void {
  const route = normalizeRoute(path);
  if (!route.startsWith("/api")) return;
  const key = `${method} ${route}`;
  let stat = store.get(key);
  if (!stat) {
    stat = { method, route, durations: [], total: 0, errors: 0 };
    store.set(key, stat);
  }
  stat.total += 1;
  if (statusCode >= 400) stat.errors += 1;
  stat.durations.push(durationMs);
  if (stat.durations.length > MAX_SAMPLES) stat.durations.shift();
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

export interface RouteLatency {
  method: string;
  route: string;
  count: number;
  errorRate: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  avg: number;
}

function toLatency(stat: RouteStat): RouteLatency {
  const sorted = [...stat.durations].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    method: stat.method,
    route: stat.route,
    count: stat.total,
    errorRate: stat.total > 0 ? round((stat.errors / stat.total) * 100) : 0,
    p50: round(percentile(sorted, 50)),
    p95: round(percentile(sorted, 95)),
    p99: round(percentile(sorted, 99)),
    max: round(sorted[sorted.length - 1] ?? 0),
    avg: round(sum / (sorted.length || 1)),
  };
}

export function getMetricsSnapshot(): RouteLatency[] {
  return [...store.values()].map(toLatency).sort((a, b) => b.count - a.count);
}

/** Lookup live latency for a specific route key, used for baseline comparison. */
export function getLatencyForRoute(method: string, route: string): RouteLatency | null {
  const stat = store.get(`${method} ${normalizeRoute(route)}`);
  return stat ? toLatency(stat) : null;
}

export function getCollectorMeta(): { startedAt: number; trackedRoutes: number; sampleCap: number } {
  return { startedAt, trackedRoutes: store.size, sampleCap: MAX_SAMPLES };
}
