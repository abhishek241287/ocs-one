import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Cpu,
  Database,
  Gauge,
  HardDrive,
  Package,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  MinusCircle,
  Clock,
} from "lucide-react";
import { OdsPageLayout, ModuleHeader, OdsMetricCard, OdsMetricGrid } from "@/components/ods";
import { Button } from "@/components/ui/button";
import {
  usePerformanceMetrics,
  type BaselineComparisonRow,
  type RouteLatency,
} from "@/features/developer/hooks/usePerformanceMetrics";

// ─── Helpers ───────────────────────────────────────────────────────────────

function fmtMs(n: number | null): string {
  if (n == null) return "—";
  return `${n.toFixed(n < 10 ? 1 : 0)} ms`;
}

function fmtUptime(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

function methodColor(method: string): string {
  switch (method) {
    case "GET": return "bg-sky-50 text-sky-700";
    case "POST": return "bg-emerald-50 text-emerald-700";
    case "PATCH": return "bg-amber-50 text-amber-700";
    case "PUT": return "bg-amber-50 text-amber-700";
    case "DELETE": return "bg-red-50 text-red-700";
    default: return "bg-slate-100 text-slate-600";
  }
}

function SectionCard({
  icon,
  title,
  subtitle,
  children,
  right,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-5 py-3.5 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <span className="text-slate-400">{icon}</span>
          <div>
            <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {right}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function FuturePanel({ title, reason }: { title: string; reason: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-5">
      <div className="flex items-center gap-2 text-slate-500">
        <MinusCircle className="h-4 w-4" />
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-white border border-slate-200 rounded px-1.5 py-0.5">
          Not instrumented
        </span>
      </div>
      <p className="text-xs text-slate-500 mt-2 leading-relaxed">{reason}</p>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function PerformancePage() {
  const { data, isLoading, isError, error, refetch, isFetching } = usePerformanceMetrics();
  const queryClient = useQueryClient();

  // Client-side React Query cache stats (live, browser-side).
  const cacheStats = useMemo(() => {
    const queries = queryClient.getQueryCache().getAll();
    const byStatus = { fresh: 0, stale: 0, fetching: 0, error: 0 };
    for (const q of queries) {
      if (q.state.fetchStatus === "fetching") byStatus.fetching += 1;
      if (q.state.status === "error") byStatus.error += 1;
      else if (q.isStale()) byStatus.stale += 1;
      else byStatus.fresh += 1;
    }
    return { total: queries.length, ...byStatus };
  }, [queryClient, data]);

  // Client memory — only available in Chromium via the non-standard performance.memory.
  const clientMemoryMb = useMemo(() => {
    const perf = performance as Performance & { memory?: { usedJSHeapSize: number } };
    return perf.memory ? Math.round((perf.memory.usedJSHeapSize / 1024 / 1024) * 10) / 10 : null;
  }, []);

  const header = (
    <ModuleHeader
      icon="📊"
      title="Engineering Health"
      description="Live performance telemetry · API latency, DB timings, memory, and Baseline v1.0 regression watch"
      certification="under-validation"
    />
  );

  if (isError) {
    return (
      <OdsPageLayout header={header}>
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertTriangle className="h-6 w-6 text-red-500 mx-auto mb-2" />
          <p className="text-sm font-medium text-red-700">
            {error instanceof Error ? error.message : "Failed to load metrics"}
          </p>
        </div>
      </OdsPageLayout>
    );
  }

  return (
    <OdsPageLayout
      header={header}
      toolbar={
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {data ? (
              <>
                Updated {new Date(data.generatedAt).toLocaleTimeString()} · auto-refresh 15s ·{" "}
                {data.regressionCount === 0 ? (
                  <span className="text-emerald-600 font-medium">no regressions</span>
                ) : (
                  <span className="text-red-600 font-medium">{data.regressionCount} regression(s)</span>
                )}
              </>
            ) : (
              "Loading…"
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* ─── Top metric cards ─────────────────────────────────────────── */}
        <OdsMetricGrid>
          <OdsMetricCard
            icon={<HardDrive className="h-5 w-5 text-slate-400" />}
            title="Server Heap Used"
            value={data ? data.server.memory.heapUsedMb : "—"}
            unit="MB"
            status="neutral"
            isLoading={isLoading}
            footer={data ? `RSS ${data.server.memory.rssMb} MB · heap total ${data.server.memory.heapTotalMb} MB` : undefined}
          />
          <OdsMetricCard
            icon={<Clock className="h-5 w-5 text-slate-400" />}
            title="Server Uptime"
            value={data ? fmtUptime(data.server.uptimeSec) : "—"}
            status="neutral"
            isLoading={isLoading}
            footer={data ? `Node ${data.server.nodeVersion} · pid ${data.server.pid}` : undefined}
          />
          <OdsMetricCard
            icon={<Gauge className="h-5 w-5 text-slate-400" />}
            title="Regression Watch"
            value={data ? data.regressionCount : "—"}
            unit={data && data.regressionCount === 1 ? "alert" : "alerts"}
            status={data && data.regressionCount > 0 ? "negative" : "positive"}
            isLoading={isLoading}
            footer={data ? `Baseline v${data.baselineVersion} · >${data.regressionThresholdPct}% threshold` : undefined}
          />
          <OdsMetricCard
            icon={<Package className="h-5 w-5 text-slate-400" />}
            title="Bundle (gzip)"
            value={data ? data.bundle.totalGzipKb : "—"}
            unit="KB"
            status={data && data.bundle.totalGzipKb > data.bundle.budgetGzipKb ? "warning" : "positive"}
            isLoading={isLoading}
            footer={data ? `Budget ${data.bundle.budgetGzipKb} KB · recorded ${data.bundle.recordedAt}` : undefined}
          />
        </OdsMetricGrid>

        {/* ─── Baseline v1.0 comparison ──────────────────────────────────── */}
        <SectionCard
          icon={<Activity className="h-4 w-4" />}
          title="Baseline v1.0 — Regression Watch"
          subtitle="Live P95 vs recorded baseline. Regression flagged when drift exceeds threshold AND sample count is sufficient."
        >
          <BaselineTable rows={data?.baselineComparison ?? []} isLoading={isLoading} threshold={data?.regressionThresholdPct ?? 10} />
        </SectionCard>

        {/* ─── Live API latency ──────────────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <SectionCard
            icon={<Activity className="h-4 w-4" />}
            title="Live API Latency"
            subtitle={data ? `${data.collector.trackedRoutes} routes tracked since boot · ${data.collector.sampleCap}-sample ring buffer` : "Per-route P50 / P95 / P99 since process boot"}
          >
            <LatencyTable rows={data?.apiLatency ?? []} isLoading={isLoading} />
          </SectionCard>

          <SectionCard
            icon={<Gauge className="h-4 w-4" />}
            title="Slowest Endpoints"
            subtitle="Top 5 by P95 latency"
          >
            <LatencyTable rows={data?.slowestEndpoints ?? []} isLoading={isLoading} compact />
          </SectionCard>
        </div>

        {/* ─── DB timings + bundle chunks ────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <SectionCard
            icon={<Database className="h-4 w-4" />}
            title="Live DB Query Timings"
            subtitle="Measured fresh on each request"
          >
            {isLoading ? (
              <div className="h-24 animate-pulse bg-slate-100 rounded-lg" />
            ) : (
              <div className="divide-y divide-slate-100">
                {(data?.dbTimings ?? []).map((t) => (
                  <div key={t.label} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="font-mono text-xs text-slate-700">{t.label}</span>
                    <span className="font-semibold text-slate-800 tabular-nums">{fmtMs(t.ms)}</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            icon={<Package className="h-4 w-4" />}
            title="Build Size — Largest Chunks"
            subtitle={data ? `Recorded ${data.bundle.recordedAt} (build-time metric)` : "Production build output"}
          >
            {isLoading ? (
              <div className="h-24 animate-pulse bg-slate-100 rounded-lg" />
            ) : (
              <div className="divide-y divide-slate-100">
                {(data?.bundle.chunks ?? []).map((c) => (
                  <div key={c.name} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="font-mono text-xs text-slate-700 truncate">{c.name}</span>
                    <span className="shrink-0 text-slate-800 tabular-nums">
                      <span className="font-semibold">{c.gzipKb} KB</span>
                      <span className="text-slate-400"> / {c.rawKb} raw</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        {/* ─── Client-side metrics ───────────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <SectionCard
            icon={<Cpu className="h-4 w-4" />}
            title="React Query Cache (client)"
            subtitle="Live, measured in your browser"
          >
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: "Total", value: cacheStats.total, color: "text-slate-800" },
                { label: "Fresh", value: cacheStats.fresh, color: "text-emerald-600" },
                { label: "Stale", value: cacheStats.stale, color: "text-amber-600" },
                { label: "Fetching", value: cacheStats.fetching, color: "text-sky-600" },
                { label: "Error", value: cacheStats.error, color: "text-red-600" },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-center">
                  <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between text-sm border-t border-slate-100 pt-3">
              <span className="text-slate-600">Client JS heap used</span>
              <span className="font-semibold text-slate-800">
                {clientMemoryMb != null ? `${clientMemoryMb} MB` : "Unavailable (Chromium-only API)"}
              </span>
            </div>
          </SectionCard>

          <div className="space-y-5">
            <FuturePanel
              title="React Render Counts"
              reason="Per-component render profiling is not yet instrumented. Adding it requires a React Profiler harness or why-did-you-render integration — planned, but not wired up. Shown here honestly rather than faked."
            />
            <FuturePanel
              title="Active WebSocket Connections"
              reason="The platform does not yet use WebSockets — all data flows over HTTP polling (React Query). This panel will light up when realtime channels are introduced."
            />
          </div>
        </div>

        {/* ─── Regression rules reference ────────────────────────────────── */}
        <SectionCard
          icon={<AlertTriangle className="h-4 w-4" />}
          title="Regression Framework Rules"
          subtitle="Permanent policy — any breach files a defect automatically"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100">
                  <th className="py-2 pr-4 font-semibold">Metric</th>
                  <th className="py-2 pr-4 font-semibold">Threshold</th>
                  <th className="py-2 font-semibold">Action on breach</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {(data?.regressionRules ?? []).map((r) => (
                  <tr key={r.metric}>
                    <td className="py-2.5 pr-4 font-medium text-slate-800">{r.metric}</td>
                    <td className="py-2.5 pr-4 text-slate-600 tabular-nums">&gt; {r.thresholdPct}%</td>
                    <td className="py-2.5 text-slate-600">{r.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
    </OdsPageLayout>
  );
}

// ─── Sub-tables ──────────────────────────────────────────────────────────

function LatencyTable({ rows, isLoading, compact }: { rows: RouteLatency[]; isLoading: boolean; compact?: boolean }) {
  if (isLoading) return <div className="h-32 animate-pulse bg-slate-100 rounded-lg" />;
  if (rows.length === 0) return <p className="text-sm text-slate-400 italic py-4 text-center">No traffic recorded yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100">
            <th className="py-2 pr-3 font-semibold">Route</th>
            <th className="py-2 px-2 font-semibold text-right">P50</th>
            <th className="py-2 px-2 font-semibold text-right">P95</th>
            <th className="py-2 px-2 font-semibold text-right">P99</th>
            {!compact && <th className="py-2 px-2 font-semibold text-right">Reqs</th>}
            {!compact && <th className="py-2 pl-2 font-semibold text-right">Err%</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map((r) => (
            <tr key={`${r.method} ${r.route}`}>
              <td className="py-2.5 pr-3">
                <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold font-mono mr-2 ${methodColor(r.method)}`}>
                  {r.method}
                </span>
                <code className="text-xs text-slate-700">{r.route}</code>
              </td>
              <td className="py-2.5 px-2 text-right tabular-nums text-slate-600">{r.p50.toFixed(1)}</td>
              <td className="py-2.5 px-2 text-right tabular-nums font-semibold text-slate-800">{r.p95.toFixed(1)}</td>
              <td className="py-2.5 px-2 text-right tabular-nums text-slate-600">{r.p99.toFixed(1)}</td>
              {!compact && <td className="py-2.5 px-2 text-right tabular-nums text-slate-600">{r.count}</td>}
              {!compact && (
                <td className={`py-2.5 pl-2 text-right tabular-nums ${r.errorRate > 0 ? "text-red-600 font-medium" : "text-slate-400"}`}>
                  {r.errorRate}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BaselineTable({ rows, isLoading, threshold }: { rows: BaselineComparisonRow[]; isLoading: boolean; threshold: number }) {
  if (isLoading) return <div className="h-64 animate-pulse bg-slate-100 rounded-lg" />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100">
            <th className="py-2 pr-3 font-semibold">Operation</th>
            <th className="py-2 px-2 font-semibold text-right">Target</th>
            <th className="py-2 px-2 font-semibold text-right">Baseline</th>
            <th className="py-2 px-2 font-semibold text-right">Live P95</th>
            <th className="py-2 px-2 font-semibold text-right">Δ vs base</th>
            <th className="py-2 pl-2 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map((r) => {
            let status: React.ReactNode;
            if (!r.measured) {
              status = <Badge tone="slate" icon={<MinusCircle className="h-3 w-3" />}>Not instrumented</Badge>;
            } else if (r.currentP95 == null) {
              status = <Badge tone="slate">No traffic yet</Badge>;
            } else if (r.regression) {
              status = <Badge tone="red" icon={<AlertTriangle className="h-3 w-3" />}>Regression &gt;{threshold}%</Badge>;
            } else if (!r.sufficientData) {
              status = <Badge tone="amber">Warming up ({r.sampleCount})</Badge>;
            } else {
              status = <Badge tone="green" icon={<CheckCircle2 className="h-3 w-3" />}>Within baseline</Badge>;
            }
            return (
              <tr key={r.operation}>
                <td className="py-2.5 pr-3">
                  <div className="font-medium text-slate-800">{r.operation}</div>
                  <code className="text-[11px] text-slate-400">{r.endpoint}</code>
                </td>
                <td className="py-2.5 px-2 text-right tabular-nums text-slate-600">{r.measured ? fmtMs(r.targetMs) : "N/A"}</td>
                <td className="py-2.5 px-2 text-right tabular-nums text-slate-600">{r.measured ? fmtMs(r.baselineMs) : "N/A"}</td>
                <td className="py-2.5 px-2 text-right tabular-nums font-semibold text-slate-800">{fmtMs(r.currentP95)}</td>
                <td className={`py-2.5 px-2 text-right tabular-nums ${
                  r.deltaPct == null ? "text-slate-400" : r.deltaPct > threshold ? "text-red-600 font-medium" : r.deltaPct < 0 ? "text-emerald-600" : "text-slate-600"
                }`}>
                  {r.deltaPct == null ? "—" : `${r.deltaPct > 0 ? "+" : ""}${r.deltaPct}%`}
                </td>
                <td className="py-2.5 pl-2">{status}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Badge({ tone, icon, children }: { tone: "green" | "red" | "amber" | "slate"; icon?: React.ReactNode; children: React.ReactNode }) {
  const tones: Record<string, string> = {
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    red: "bg-red-50 text-red-700 border-red-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    slate: "bg-slate-50 text-slate-600 border-slate-200",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${tones[tone]}`}>
      {icon}
      {children}
    </span>
  );
}
