import { useState, useEffect } from "react";
import AppLayout from "@/layouts/AppLayout";
import { useDirectorDashboard, PipelineStage, DashboardAlert } from "@/features/dashboard/hooks/useDirectorDashboard";
import { Link } from "wouter";
import {
  Factory, Package, ShieldCheck, Truck, Wrench,
  Zap, FlaskConical, RefreshCw, AlertCircle, AlertTriangle,
  Info, CheckCircle2, Plus, ArrowRight, Activity,
  Building2, TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, accent, loading,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.FC<{ className?: string }>; accent: string; loading?: boolean;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
            {loading ? (
              <div className="h-8 w-16 bg-muted animate-pulse rounded mt-1" />
            ) : (
              <p className="text-3xl font-black tracking-tight">{value}</p>
            )}
            {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`p-2.5 rounded-xl ${accent} shrink-0`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Pipeline Stage Card ──────────────────────────────────────────────────────

const HEALTH_COLORS = {
  green: "border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800",
  yellow: "border-yellow-200 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-800",
  red: "border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800",
};
const HEALTH_DOT = {
  green: "bg-green-500",
  yellow: "bg-yellow-500 animate-pulse",
  red: "bg-red-500 animate-pulse",
};

function StageCard({ stage }: { stage: PipelineStage }) {
  return (
    <Link href={stage.href}>
      <div className={`rounded-xl border-2 p-3 cursor-pointer hover:shadow-md transition-all min-w-[120px] ${HEALTH_COLORS[stage.health]}`}>
        <div className="flex items-center gap-1.5 mb-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${HEALTH_DOT[stage.health]}`} />
          <span className="text-[11px] font-bold uppercase tracking-wide truncate">{stage.label}</span>
        </div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
          <span className="text-muted-foreground">Active</span>
          <span className="font-bold text-right text-blue-700 dark:text-blue-400">{stage.inProgress}</span>
          <span className="text-muted-foreground">Waiting</span>
          <span className="font-bold text-right">{stage.waiting}</span>
          {stage.blocked > 0 && (
            <>
              <span className="text-red-600">Blocked</span>
              <span className="font-bold text-right text-red-600">{stage.blocked}</span>
            </>
          )}
          <span className="text-muted-foreground">Done/Day</span>
          <span className="font-bold text-right text-green-700 dark:text-green-400">{stage.completedToday}</span>
        </div>
      </div>
    </Link>
  );
}

// ─── Alert Row ────────────────────────────────────────────────────────────────

const ALERT_STYLE: Record<string, { icon: React.FC<{ className?: string }>; color: string; bg: string }> = {
  critical: { icon: AlertCircle, color: "text-red-600", bg: "bg-red-50 border-red-200 dark:bg-red-950/30" },
  warning: { icon: AlertTriangle, color: "text-yellow-600", bg: "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30" },
  info: { icon: Info, color: "text-blue-600", bg: "bg-blue-50 border-blue-200 dark:bg-blue-950/30" },
};

function AlertRow({ alert }: { alert: DashboardAlert }) {
  const s = ALERT_STYLE[alert.severity] ?? ALERT_STYLE.info;
  const Icon = s.icon;
  return (
    <div className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border ${s.bg}`}>
      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${s.color}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{alert.message}</p>
        <p className="text-[11px] text-muted-foreground">{new Date(alert.timestamp).toLocaleTimeString()}</p>
      </div>
    </div>
  );
}

// ─── Equipment Bar ────────────────────────────────────────────────────────────

function EquipBar({ label, total, available, busy, maintenance }: {
  label: string; total: number; available: number; busy: number; maintenance: number;
}) {
  if (total === 0) return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-xs text-muted-foreground">None configured</span>
    </div>
  );
  return (
    <div className="space-y-1.5 py-2 border-b last:border-0">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{total} total</span>
      </div>
      <div className="flex gap-1 h-2 rounded-full overflow-hidden bg-muted">
        {available > 0 && <div className="bg-green-500" style={{ width: `${(available / total) * 100}%` }} />}
        {busy > 0 && <div className="bg-blue-500" style={{ width: `${(busy / total) * 100}%` }} />}
        {maintenance > 0 && <div className="bg-yellow-500" style={{ width: `${(maintenance / total) * 100}%` }} />}
      </div>
      <div className="flex gap-3 text-[11px]">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" />{available} available</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" />{busy} busy</span>
        {maintenance > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500" />{maintenance} maint.</span>}
      </div>
    </div>
  );
}

// ─── Refresh countdown ────────────────────────────────────────────────────────

function RefreshCountdown({ onRefresh }: { onRefresh: () => void }) {
  const [secs, setSecs] = useState(30);
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => { if (s <= 1) { onRefresh(); return 30; } return s - 1; }), 1000);
    return () => clearInterval(t);
  }, [onRefresh]);
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <RefreshCw className="h-3 w-3" />
      <span>Auto-refresh in {secs}s</span>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  draft: "bg-gray-100 text-gray-600",
  on_hold: "bg-yellow-100 text-yellow-700",
};

const STAGE_LABEL: Record<string, string> = {
  cell_allocation: "Cell Alloc.", bms_allocation: "BMS Install", assembly: "Assembly",
  compression: "Compression", charging: "Charging", testing: "Testing",
  quality_control: "QC", packing: "Packing",
};

const QUICK_ACTIONS = [
  { label: "New Production Order", icon: Plus, href: "/manufacturing/orders", accent: "bg-blue-600 hover:bg-blue-700" },
  { label: "Receive Cells", icon: Package, href: "/cells/receiving", accent: "bg-teal-600 hover:bg-teal-700" },
  { label: "Start Grading", icon: FlaskConical, href: "/cells/grading", accent: "bg-purple-600 hover:bg-purple-700" },
  { label: "Rework Queue", icon: Wrench, href: "/manufacturing/rework", accent: "bg-orange-600 hover:bg-orange-700" },
  { label: "Dispatch Orders", icon: Truck, href: "/logistics/dispatch-orders", accent: "bg-indigo-600 hover:bg-indigo-700" },
  { label: "Dealer Master", icon: Building2, href: "/logistics/dealers", accent: "bg-emerald-600 hover:bg-emerald-700" },
];

export default function DirectorDashboardPage() {
  const { data, isLoading, isError, refetch } = useDirectorDashboard();

  const criticalAlerts = data?.alerts.filter((a) => a.severity === "critical").length ?? 0;

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Live</span>
              {criticalAlerts > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
                  <AlertCircle className="h-3 w-3" />{criticalAlerts} Critical
                </span>
              )}
            </div>
            <h1 className="text-3xl font-black tracking-tight">Director Command Center</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              OCS Oorja Green Pvt. Ltd. — Factory Floor Overview
              {data?.refreshedAt && (
                <span className="ml-2 text-xs">· Last updated {new Date(data.refreshedAt).toLocaleTimeString()}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <RefreshCountdown onRefresh={refetch} />
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {isError && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-4 flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Could not load dashboard data. Check API connectivity.
            </CardContent>
          </Card>
        )}

        {/* ── Section 1: KPI Cards ────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
          <KpiCard label="Today's Target" value={data?.kpis.todayTarget ?? 0} sub="orders created today" icon={Factory} accent="bg-gray-100 text-gray-700" loading={isLoading} />
          <KpiCard label="Completed Today" value={data?.kpis.todayCompleted ?? 0} sub="batteries done" icon={CheckCircle2} accent="bg-green-100 text-green-700" loading={isLoading} />
          <KpiCard label="Efficiency" value={`${data?.kpis.productionEfficiency ?? 0}%`} sub="vs today's target" icon={TrendingUp} accent="bg-blue-100 text-blue-700" loading={isLoading} />
          <KpiCard label="In Progress" value={data?.kpis.inProgress ?? 0} sub="on factory floor" icon={Activity} accent="bg-indigo-100 text-indigo-700" loading={isLoading} />
          <KpiCard label="QC Pending" value={data?.kpis.qcPending ?? 0} sub="awaiting approval" icon={ShieldCheck} accent={`${(data?.kpis.qcPending ?? 0) > 5 ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`} loading={isLoading} />
          <KpiCard label="Dispatch Ready" value={data?.kpis.dispatchReady ?? 0} sub="packing approved" icon={Truck} accent="bg-teal-100 text-teal-700" loading={isLoading} />
          <KpiCard label="Rework Queue" value={data?.kpis.reworkQueue ?? 0} sub="open tickets" icon={Wrench} accent={`${(data?.kpis.reworkQueue ?? 0) > 3 ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"}`} loading={isLoading} />
          <KpiCard label="Charger Util." value={`${data?.kpis.chargerUtilization ?? 0}%`} sub="chargers in use" icon={Zap} accent="bg-purple-100 text-purple-700" loading={isLoading} />
        </div>

        {/* ── Section 2: Manufacturing Pipeline ──────────────────────────── */}
        <Card>
          <CardHeader className="pb-3 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Factory className="h-4 w-4 text-orange-600" />
                Live Manufacturing Pipeline
              </CardTitle>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" />Healthy</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500" />Warning</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />Bottleneck</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pb-4">
            {isLoading ? (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="min-w-[120px] h-[100px] rounded-xl bg-muted animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="flex items-stretch gap-2 overflow-x-auto pb-2">
                {data?.pipeline.map((stage, idx) => (
                  <div key={stage.key} className="flex items-center gap-1.5 shrink-0">
                    <StageCard stage={stage} />
                    {idx < (data.pipeline.length - 1) && (
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Row: Alerts + Recent Orders ─────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* Section 3: Alerts */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                Factory Alerts
                {criticalAlerts > 0 && (
                  <span className="ml-auto inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
                    {criticalAlerts} Critical
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pb-4">
              {isLoading
                ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />)
                : data?.alerts.map((a) => <AlertRow key={a.id} alert={a} />)
              }
            </CardContent>
          </Card>

          {/* Section 4: Recent Production Orders */}
          <Card className="lg:col-span-3">
            <CardHeader className="pb-2 pt-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Factory className="h-4 w-4 text-blue-600" />
                  Production Orders
                </CardTitle>
                <Link href="/manufacturing/orders">
                  <Button variant="ghost" size="sm" className="text-xs gap-1 h-7">
                    View All <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="pb-2">
              <div className="space-y-1.5">
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-8 rounded bg-muted animate-pulse" />)
                  : data?.recentOrders.length === 0
                    ? <p className="text-sm text-muted-foreground py-4 text-center">No production orders yet.</p>
                    : data?.recentOrders.map((o) => (
                        <Link key={o.id} href={`/manufacturing/orders/${o.id}`}>
                          <div className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
                            <span className="font-mono text-xs font-bold text-blue-700 w-28 shrink-0 truncate">{o.batteryNumber ?? o.orderNumber}</span>
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATUS_BADGE[o.status] ?? "bg-gray-100 text-gray-600"}`}>
                              {o.status.replace("_", " ")}
                            </span>
                            {o.currentStage && (
                              <span className="text-[11px] text-muted-foreground">{STAGE_LABEL[o.currentStage] ?? o.currentStage}</span>
                            )}
                            <span className={`ml-auto text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${o.priority === "urgent" ? "bg-red-100 text-red-700" : o.priority === "high" ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-500"}`}>
                              {o.priority}
                            </span>
                          </div>
                        </Link>
                      ))
                }
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Row: Operator Activity + Equipment + Quality ─────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Section 5: Operator Activity */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-600" />
                Operator Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              {isLoading ? (
                <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-8 rounded bg-muted animate-pulse" />)}</div>
              ) : !data?.operatorActivity.length ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No operators currently active.</p>
              ) : (
                <div className="space-y-2">
                  {data.operatorActivity.map((op, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 py-1.5 border-b last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{op.operatorName ?? "—"}</p>
                        <p className="text-[11px] text-muted-foreground">{STAGE_LABEL[op.stage ?? ""] ?? op.stage}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-green-700">{op.batteriesCompletedToday}</p>
                        <p className="text-[10px] text-muted-foreground">today</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 6: Equipment Status */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="h-4 w-4 text-purple-600" />
                Equipment Status
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              {isLoading ? (
                <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-16 rounded bg-muted animate-pulse" />)}</div>
              ) : (
                <div>
                  <EquipBar
                    label="Charger Units"
                    total={data?.equipmentStatus.chargers.total ?? 0}
                    available={data?.equipmentStatus.chargers.available ?? 0}
                    busy={data?.equipmentStatus.chargers.busy ?? 0}
                    maintenance={data?.equipmentStatus.chargers.maintenance ?? 0}
                  />
                  <EquipBar
                    label="Test Equipment"
                    total={data?.equipmentStatus.testEquipment.total ?? 0}
                    available={data?.equipmentStatus.testEquipment.available ?? 0}
                    busy={data?.equipmentStatus.testEquipment.busy ?? 0}
                    maintenance={data?.equipmentStatus.testEquipment.maintenance ?? 0}
                  />
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Cell Inventory</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { label: "Received", value: data?.cellInventory.received ?? 0, color: "text-blue-700" },
                        { label: "Grading", value: data?.cellInventory.grading ?? 0, color: "text-purple-700" },
                        { label: "Approved", value: data?.cellInventory.approved ?? 0, color: "text-green-700" },
                        { label: "Allocated", value: data?.cellInventory.allocated ?? 0, color: "text-teal-700" },
                        { label: "Rejected", value: data?.cellInventory.rejected ?? 0, color: "text-red-700" },
                        { label: "Quarantine", value: data?.cellInventory.quarantine ?? 0, color: "text-yellow-700" },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="text-center">
                          <p className={`text-base font-bold ${color}`}>{value}</p>
                          <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 7: Quality Summary */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-green-600" />
                Quality Summary
                <span className="ml-auto text-[10px] text-muted-foreground font-normal">Last 30 days</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              {isLoading ? (
                <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-6 rounded bg-muted animate-pulse" />)}</div>
              ) : (
                <div className="space-y-3">
                  {/* Pass rate ring */}
                  <div className="flex items-center gap-4 p-3 rounded-xl bg-muted/30">
                    <div className="flex flex-col items-center">
                      <span className="text-3xl font-black text-green-600">{data?.qualitySummary.passRate ?? 0}%</span>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Pass Rate</span>
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-red-600">Reject</span>
                        <span className="font-bold">{data?.qualitySummary.rejectRate ?? 0}%</span>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Samples</span>
                        <span>{data?.qualitySummary.sampleCount ?? 0}</span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tests Passed</span>
                      <span className="font-semibold text-green-700">{data?.qualitySummary.testPassCount ?? 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tests Failed</span>
                      <span className="font-semibold text-red-700">{data?.qualitySummary.testFailCount ?? 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">QC Samples (30d)</span>
                      <span className="font-semibold">{data?.qualitySummary.sampleCount ?? 0}</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Row: Logistics Summary + Quick Actions ──────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Section 8: Logistics Summary */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Truck className="h-4 w-4 text-blue-600" />
                  Logistics Summary
                </CardTitle>
                <Link href="/logistics/packing-dashboard">
                  <Button variant="ghost" size="sm" className="text-xs h-7 gap-1">
                    Dashboard <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="pb-4">
              {isLoading ? (
                <div className="grid grid-cols-2 gap-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}</div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Ready for Dispatch", value: data?.logistics.readyForDispatch ?? 0, color: "bg-green-50 border-green-200 text-green-800", icon: CheckCircle2 },
                    { label: "In Transit", value: data?.logistics.inTransit ?? 0, color: "bg-blue-50 border-blue-200 text-blue-800", icon: Truck },
                    { label: "Delivered Today", value: data?.logistics.deliveredToday ?? 0, color: "bg-purple-50 border-purple-200 text-purple-800", icon: Package },
                    { label: "Total Dealers", value: data?.logistics.totalDealers ?? 0, color: "bg-gray-50 border-gray-200 text-gray-800", icon: Building2 },
                  ].map(({ label, value, color, icon: Icon }) => (
                    <div key={label} className={`flex items-center gap-3 p-3 rounded-xl border ${color}`}>
                      <Icon className="h-5 w-5 opacity-60 shrink-0" />
                      <div>
                        <p className="text-xl font-black">{value}</p>
                        <p className="text-[11px] font-medium opacity-70 leading-tight">{label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 9: Quick Actions */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="h-4 w-4 text-yellow-600" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="grid grid-cols-2 gap-2">
                {QUICK_ACTIONS.map(({ label, icon: Icon, href, accent }) => (
                  <Link key={label} href={href}>
                    <button className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-white text-sm font-semibold text-left transition-all active:scale-[0.98] ${accent}`}>
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{label}</span>
                    </button>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
