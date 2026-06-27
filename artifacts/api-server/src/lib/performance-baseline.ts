/**
 * Performance Baseline v1.0 — single source of truth.
 *
 * This is the permanent reference for the OCS One performance regression
 * framework (CW-01 / MAT-05). Both the /developer/performance dashboard and the
 * certification docs read from this file. Whenever a measured actual drifts more
 * than REGRESSION_THRESHOLD_PCT from its recorded baseline, a regression must be
 * flagged and a defect filed.
 *
 * `targetMs` is the P95 budget. `baselineMs` is the recorded P95 actual at the
 * stated dataset/environment when the baseline was captured (2026-06-27).
 */

export const BASELINE_VERSION = "1.0";
export const BASELINE_CAPTURED_AT = "2026-06-27";
export const REGRESSION_THRESHOLD_PCT = 10;

export interface BaselineEntry {
  /** Human operation name as listed by the CTO. */
  operation: string;
  /** The API leg measured, or a note for client-only operations. */
  endpoint: string;
  /** Method + normalized route used to match live metrics; null when not server-measured. */
  routeKey: { method: string; route: string } | null;
  /** P95 budget (ms); null when the operation has no server-measurable target. */
  targetMs: number | null;
  /** Recorded P95 actual at capture time (ms); null when not instrumented. */
  baselineMs: number | null;
  dataset: string;
  environment: string;
  /** true = instrumented measurement; false = client-only / not instrumented. */
  measured: boolean;
  note?: string;
}

const ENV = "Replit dev container · NixOS · Node 24 · single Express process · via localhost:80 proxy";
const DATASET = "14 lots / 58 cells (current dev dataset)";

export const PERFORMANCE_BASELINE_V1: BaselineEntry[] = [
  {
    operation: "Login",
    endpoint: "POST /api/auth/login",
    routeKey: { method: "POST", route: "/api/auth/login" },
    targetMs: 500,
    baselineMs: 278,
    dataset: "n/a (auth)",
    environment: ENV,
    measured: true,
    note: "Includes bcrypt verify + JWT sign.",
  },
  {
    operation: "Dashboard load",
    endpoint: "GET /api/dashboard/director",
    routeKey: { method: "GET", route: "/api/dashboard/director" },
    targetMs: 500,
    baselineMs: 4,
    dataset: DATASET,
    environment: ENV,
    measured: true,
    note: "18-query KPI aggregation (Promise.all).",
  },
  {
    operation: "Cell Receiving page",
    endpoint: "GET /api/cells/lots",
    routeKey: { method: "GET", route: "/api/cells/lots" },
    targetMs: 300,
    baselineMs: 3.6,
    dataset: DATASET,
    environment: ENV,
    measured: true,
    note: "List page 1 (20/pg), index-backed after DEF-CW01-M05-001.",
  },
  {
    operation: "Create Lot",
    endpoint: "POST /api/cells/lots",
    routeKey: { method: "POST", route: "/api/cells/lots" },
    targetMs: 600,
    baselineMs: 6,
    dataset: DATASET,
    environment: ENV,
    measured: true,
    note: "Lot insert + bulk cell insert + 2 events in one txn (5-cell lot). Warm P95 ~6ms; first cold request observed ~66ms.",
  },
  {
    operation: "Edit Lot",
    endpoint: "PATCH /api/cells/lots/:id",
    routeKey: { method: "PATCH", route: "/api/cells/lots/:id" },
    targetMs: 500,
    baselineMs: 3.7,
    dataset: DATASET,
    environment: ENV,
    measured: true,
  },
  {
    operation: "Search",
    endpoint: "GET /api/cells/lots?search=",
    routeKey: { method: "GET", route: "/api/cells/lots" },
    targetMs: 500,
    baselineMs: 5.1,
    dataset: DATASET,
    environment: ENV,
    measured: true,
    note: "Shares the list route; debounced client-side.",
  },
  {
    operation: "Filters",
    endpoint: "GET /api/cells/lots?status=",
    routeKey: { method: "GET", route: "/api/cells/lots" },
    targetMs: 300,
    baselineMs: 3.4,
    dataset: DATASET,
    environment: ENV,
    measured: true,
    note: "Status filter, index-backed.",
  },
  {
    operation: "Timeline load",
    endpoint: "GET /api/cells/lots/:id/history",
    routeKey: { method: "GET", route: "/api/cells/lots/:id/history" },
    targetMs: 500,
    baselineMs: 3.4,
    dataset: DATASET,
    environment: ENV,
    measured: true,
  },
  {
    operation: "Director Dashboard",
    endpoint: "GET /api/dashboard/director",
    routeKey: { method: "GET", route: "/api/dashboard/director" },
    targetMs: 500,
    baselineMs: 4,
    dataset: DATASET,
    environment: ENV,
    measured: true,
    note: "Heaviest read — multi-table aggregation.",
  },
  {
    operation: "Reports",
    endpoint: "GET /api/reports/production",
    routeKey: { method: "GET", route: "/api/reports/production" },
    targetMs: 800,
    baselineMs: 3.3,
    dataset: DATASET,
    environment: ENV,
    measured: true,
    note: "Representative analytics endpoint.",
  },
  {
    operation: "Export",
    endpoint: "Client-side CSV (Export Center)",
    routeKey: null,
    targetMs: null,
    baselineMs: null,
    dataset: DATASET,
    environment: ENV,
    measured: false,
    note: "Export Center builds CSV in the browser from already-fetched data — no dedicated server export endpoint. Not server-instrumented.",
  },
  {
    operation: "History",
    endpoint: "GET /api/cells/lots/:id/history",
    routeKey: { method: "GET", route: "/api/cells/lots/:id/history" },
    targetMs: 500,
    baselineMs: 3.4,
    dataset: DATASET,
    environment: ENV,
    measured: true,
    note: "Lot event audit trail (same route as Timeline).",
  },
];

export interface BundleChunk {
  name: string;
  rawKb: number;
  gzipKb: number;
}

/** Recorded from `vite build` (MAT-05). Build-time metric — refreshed each certification wave. */
export const BUNDLE_BASELINE: {
  recordedAt: string;
  budgetGzipKb: number;
  totalGzipKb: number;
  chunks: BundleChunk[];
} = {
  recordedAt: "2026-06-27",
  budgetGzipKb: 400,
  totalGzipKb: 385.35,
  chunks: [
    { name: "index.js (single chunk — no route split, DEF-CW01-M05-002)", rawKb: 1389.86, gzipKb: 364.68 },
    { name: "index.css", rawKb: 124.97, gzipKb: 20.67 },
    { name: "index.html", rawKb: 1.49, gzipKb: 0.56 },
  ],
};

export interface RegressionRule {
  metric: string;
  thresholdPct: number;
  action: string;
}

export const REGRESSION_RULES: RegressionRule[] = [
  { metric: "API latency (P95)", thresholdPct: 10, action: "File defect — investigate query/route regression" },
  { metric: "Bundle size (gzip)", thresholdPct: 10, action: "File defect — investigate dependency/code growth" },
  { metric: "Query execution time", thresholdPct: 10, action: "File defect — re-run EXPLAIN ANALYZE, check indexes" },
  { metric: "Page load time", thresholdPct: 10, action: "File defect — profile render path" },
  { metric: "Memory growth", thresholdPct: 10, action: "File defect — heap snapshot, check for leaks" },
];
