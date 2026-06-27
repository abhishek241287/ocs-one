import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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

export interface BaselineComparisonRow {
  operation: string;
  endpoint: string;
  targetMs: number | null;
  baselineMs: number | null;
  currentP95: number | null;
  sampleCount: number;
  sufficientData: boolean;
  deltaPct: number | null;
  regression: boolean;
  withinTarget: boolean | null;
  measured: boolean;
  dataset: string;
  environment: string;
  note: string | null;
}

export interface BundleChunk {
  name: string;
  rawKb: number;
  gzipKb: number;
}

export interface RegressionRule {
  metric: string;
  thresholdPct: number;
  action: string;
}

export interface PerformanceMetrics {
  generatedAt: string;
  baselineVersion: string;
  baselineCapturedAt: string;
  regressionThresholdPct: number;
  regressionCount: number;
  server: {
    uptimeSec: number;
    nodeVersion: string;
    pid: number;
    memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number; externalMb: number };
  };
  collector: { trackedRoutes: number; sampleCap: number; sinceMs: number };
  apiLatency: RouteLatency[];
  slowestEndpoints: RouteLatency[];
  dbTimings: Array<{ label: string; ms: number }>;
  bundle: { recordedAt: string; budgetGzipKb: number; totalGzipKb: number; chunks: BundleChunk[] };
  baselineComparison: BaselineComparisonRow[];
  regressionRules: RegressionRule[];
}

async function fetchPerformanceMetrics(): Promise<PerformanceMetrics> {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const res = await fetch(`${base}/api/developer/performance`);
  if (!res.ok) {
    if (res.status === 403) throw new Error("Access denied — engineering health metrics are director-only.");
    throw new Error("Failed to load performance metrics");
  }
  return res.json();
}

export function usePerformanceMetrics() {
  return useQuery({
    queryKey: ["developer-performance"],
    queryFn: fetchPerformanceMetrics,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}

// ─── Historical snapshots ──────────────────────────────────────────────────────

export interface PerformanceSnapshot {
  id: string;
  version: string;
  label: string;
  regressionCount: number;
  metrics: PerformanceMetrics;
  note: string | null;
  capturedBy: string | null;
  capturedAt: string;
}

function apiBase() {
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}

async function fetchSnapshots(limit = 10): Promise<PerformanceSnapshot[]> {
  const res = await fetch(`${apiBase()}/api/developer/performance/snapshots?limit=${limit}`);
  if (!res.ok) {
    if (res.status === 403) throw new Error("Access denied — engineering health metrics are director-only.");
    throw new Error("Failed to load performance history");
  }
  return res.json();
}

export function usePerformanceSnapshots(limit = 10) {
  return useQuery({
    queryKey: ["developer-performance-snapshots", limit],
    queryFn: () => fetchSnapshots(limit),
    staleTime: 10_000,
  });
}

export function useCaptureSnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input?: { label?: string; note?: string }): Promise<PerformanceSnapshot> => {
      const res = await fetch(`${apiBase()}/api/developer/performance/snapshots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input ?? {}),
      });
      if (!res.ok) {
        if (res.status === 403) throw new Error("Access denied — capturing snapshots is director-only.");
        throw new Error("Failed to capture snapshot");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["developer-performance-snapshots"] });
    },
  });
}
