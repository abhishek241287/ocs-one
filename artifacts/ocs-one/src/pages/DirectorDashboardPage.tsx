import { useState } from "react";
import AppLayout from "@/layouts/AppLayout";
import {
  DashboardAlert,
  PipelineStage,
  useDirectorDashboard,
} from "@/features/dashboard/hooks/useDirectorDashboard";
import { Link } from "wouter";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Factory,
  FlaskConical,
  Package,
  RefreshCw,
  ShieldCheck,
  Truck,
  Wrench,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OdsMetricCard, OdsMetricGrid } from "@/components/ods";
import { useListProductionOrders } from "@workspace/api-client-react";
import {
  getStageProgress,
  MANUFACTURING_STAGE_SEQUENCE,
} from "@/features/manufacturing/stage-sequence";

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

const STAGE_LABEL: Record<string, string> = {
  cell_allocation: "Cell allocation",
  bms_allocation: "BMS install",
  bms_programming: "BMS programming",
  assembly: "Assembly",
  compression: "Compression",
  charging: "Charging",
  testing: "Testing",
  quality_control: "Quality control",
  packing: "Packing",
};

function getFrozenPipeline(stages: PipelineStage[] | undefined) {
  const byKey = new Map((stages ?? []).map((stage) => [stage.key, stage]));
  return MANUFACTURING_STAGE_SEQUENCE.flatMap((key) => {
    const stage = byKey.get(key);
    return stage ? [stage] : [];
  });
}

function OrderProgress({ stage }: { stage: string | null }) {
  const progress = getStageProgress(stage);
  if (!progress) return <span className="text-xs text-muted-foreground">—</span>;

  return (
    <div className="min-w-20" title={`Stage ${progress.step} of ${progress.total}`}>
      <div className="mb-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span>{progress.step}/{progress.total}</span>
        <span>{progress.percent}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-orange-500" style={{ width: `${progress.percent}%` }} />
      </div>
    </div>
  );
}

function formatAge(createdAt: string) {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return "—";

  const ageInMinutes = Math.max(0, Math.floor((Date.now() - created.getTime()) / 60_000));
  if (ageInMinutes < 60) return `${ageInMinutes}m`;
  const ageInHours = Math.floor(ageInMinutes / 60);
  if (ageInHours < 24) return `${ageInHours}h`;
  return `${Math.floor(ageInHours / 24)}d`;
}

function StageCard({ stage }: { stage: PipelineStage }) {
  return (
    <Link href={stage.href} className="block min-w-[150px] shrink-0">
      <div
        className={`h-full rounded-xl border-2 p-3 transition-shadow hover:shadow-md ${HEALTH_COLORS[stage.health]}`}
      >
        <div className="mb-2 flex items-center gap-1.5">
          <span className={`h-2 w-2 shrink-0 rounded-full ${HEALTH_DOT[stage.health]}`} />
          <span className="truncate text-[11px] font-bold uppercase tracking-wide">{stage.label}</span>
        </div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
          <span className="text-muted-foreground">Active</span>
          <span className="text-right font-bold text-blue-700 dark:text-blue-400">{stage.inProgress}</span>
          <span className="text-muted-foreground">Waiting</span>
          <span className="text-right font-bold">{stage.waiting}</span>
          {stage.blocked > 0 && (
            <>
              <span className="text-red-600">Blocked</span>
              <span className="text-right font-bold text-red-600">{stage.blocked}</span>
            </>
          )}
          <span className="text-muted-foreground">Done/day</span>
          <span className="text-right font-bold text-green-700 dark:text-green-400">{stage.completedToday}</span>
        </div>
      </div>
    </Link>
  );
}

const ALERT_STYLE: Record<
  string,
  { icon: typeof AlertCircle; color: string; bg: string }
> = {
  critical: {
    icon: AlertCircle,
    color: "text-red-600",
    bg: "bg-red-50 border-red-200 dark:bg-red-950/30",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-yellow-600",
    bg: "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30",
  },
  info: {
    icon: Activity,
    color: "text-blue-600",
    bg: "bg-blue-50 border-blue-200 dark:bg-blue-950/30",
  },
};

function AlertRow({ alert }: { alert: DashboardAlert }) {
  const style = ALERT_STYLE[alert.severity] ?? ALERT_STYLE.info;
  const Icon = style.icon;

  return (
    <div className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${style.bg}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.color}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{alert.message}</p>
        <p className="text-[11px] text-muted-foreground">
          {new Date(alert.timestamp).toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}

function EquipBar({
  label,
  total,
  available,
  busy,
  maintenance,
}: {
  label: string;
  total: number;
  available: number;
  busy: number;
  maintenance: number;
}) {
  if (total === 0) {
    return (
      <div className="flex items-center justify-between border-b py-2 last:border-0">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">None configured</span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 border-b py-2 last:border-0">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{total} total</span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
        {available > 0 && <div className="bg-green-500" style={{ width: `${(available / total) * 100}%` }} />}
        {busy > 0 && <div className="bg-blue-500" style={{ width: `${(busy / total) * 100}%` }} />}
        {maintenance > 0 && (
          <div className="bg-yellow-500" style={{ width: `${(maintenance / total) * 100}%` }} />
        )}
      </div>
      <div className="flex gap-3 text-[11px]">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          {available} available
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-blue-500" />
          {busy} busy
        </span>
        {maintenance > 0 && (
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-yellow-500" />
            {maintenance} maint.
          </span>
        )}
      </div>
    </div>
  );
}

function MetricSkeleton({ className = "" }: { className?: string }) {
  return <div className={`h-24 animate-pulse rounded-xl bg-muted ${className}`} />;
}

function QueueLink({
  href,
  label,
  value,
  detail,
  icon: Icon,
  tone = "blue",
}: {
  href: string;
  label: string;
  value: number;
  detail: string;
  icon: typeof ShieldCheck;
  tone?: "blue" | "orange" | "yellow" | "teal";
}) {
  const tones = {
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    orange: "border-orange-200 bg-orange-50 text-orange-800",
    yellow: "border-yellow-200 bg-yellow-50 text-yellow-800",
    teal: "border-teal-200 bg-teal-50 text-teal-800",
  };

  return (
    <Link href={href} className={`flex items-center gap-3 rounded-xl border p-3 transition-colors hover:brightness-95 ${tones[tone]}`}>
      <Icon className="h-5 w-5 shrink-0 opacity-70" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-[11px] opacity-75">{detail}</span>
      </span>
      <span className="text-xl font-black">{value}</span>
    </Link>
  );
}

function LoadingRows({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="h-10 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  );
}

export default function DirectorDashboardPage() {
  const { data, isLoading, isError, refetch } = useDirectorDashboard();
  const { data: qcOrders } = useListProductionOrders({
    page: 1,
    pageSize: 1,
    stage: "quality_control",
    status: "in_progress",
  });
  const { data: inProgressOrders } = useListProductionOrders({
    page: 1,
    pageSize: 1,
    status: "in_progress",
  });
  const pipeline = getFrozenPipeline(data?.pipeline);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const qcWorkCount = qcOrders?.meta.total ?? 0;
  const inProgressWorkCount = inProgressOrders?.meta.total ?? 0;

  const criticalAlerts = data?.alerts.filter((alert) => alert.severity === "critical").length ?? 0;
  const maintenanceTotal =
    (data?.equipmentStatus.chargers.maintenance ?? 0) +
    (data?.equipmentStatus.testEquipment.maintenance ?? 0);

  const attentionStages =
    pipeline.filter((stage) => stage.blocked > 0).map((stage) => ({
      stage,
      value: stage.blocked,
    })) ?? [];

  return (
    <AppLayout>
      <div className="mx-auto max-w-[1600px] space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-green-500" />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Live</span>
              {criticalAlerts > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
                  <AlertCircle className="h-3 w-3" />
                  {criticalAlerts} critical
                </span>
              )}
            </div>
            <h1 className="text-3xl font-black tracking-tight">Director Command Center</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              OCS Oorja Green Pvt. Ltd. — Factory floor overview
              {data?.refreshedAt && (
                <span className="ml-2 text-xs">· Updated {new Date(data.refreshedAt).toLocaleTimeString()}</span>
              )}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </header>

        {isError && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="flex items-center gap-2 pt-4 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Could not load dashboard data. Check API connectivity.
            </CardContent>
          </Card>
        )}

        <section aria-labelledby="factory-status-heading" className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">Level 1</p>
              <h2 id="factory-status-heading" className="text-xl font-bold">Factory status</h2>
            </div>
            <span className="text-xs text-muted-foreground">Current dashboard response</span>
          </div>
          <OdsMetricGrid columns={4}>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, index) => <MetricSkeleton key={index} />)
            ) : (
              <>
                <OdsMetricCard
                  title="Today's target"
                  value={data?.kpis.todayTarget ?? 0}
                  icon={<Factory className="h-4 w-4 text-slate-600" />}
                  footer="orders created today"
                />
                <OdsMetricCard
                  title="Completed today"
                  value={data?.kpis.todayCompleted ?? 0}
                  icon={<CheckCircle2 className="h-4 w-4 text-green-600" />}
                  status="positive"
                  footer="batteries done"
                />
                <OdsMetricCard
                  title="In progress"
                  value={data?.kpis.inProgress ?? 0}
                  icon={<Activity className="h-4 w-4 text-indigo-600" />}
                  footer="on factory floor"
                />
                <OdsMetricCard
                  title="Charger utilization"
                  value={`${data?.kpis.chargerUtilization ?? 0}%`}
                  icon={<Zap className="h-4 w-4 text-purple-600" />}
                  footer="chargers in use"
                />
              </>
            )}
          </OdsMetricGrid>
        </section>

        <section aria-labelledby="pipeline-heading" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">Level 2</p>
              <h2 id="pipeline-heading" className="text-xl font-bold">Manufacturing pipeline</h2>
              <p className="text-sm text-muted-foreground">Select a stage to open its existing workspace.</p>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" />Healthy</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-yellow-500" />Warning</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" />Bottleneck</span>
            </div>
          </div>
          <Card>
            <CardContent className="p-4">
              {isLoading ? (
                <div className="flex gap-3 overflow-x-auto">
                  {Array.from({ length: 6 }).map((_, index) => <MetricSkeleton key={index} className="min-w-[150px]" />)}
                </div>
              ) : pipeline.length ? (
                <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
                  {pipeline.map((stage, index) => (
                    <div key={stage.key} className="flex shrink-0 items-center gap-2">
                      <StageCard stage={stage} />
                      {index < pipeline.length - 1 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">No pipeline stages returned.</p>
              )}
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="attention-heading" className="space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">Level 3</p>
            <h2 id="attention-heading" className="text-xl font-bold">Attention and alerts</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Wrench className="h-4 w-4 text-orange-600" />
                  Attention required
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pb-4">
                {isLoading ? (
                  <LoadingRows count={3} />
                ) : (
                  <>
                    {(data?.kpis.qcPending ?? 0) > 0 && (
                      <QueueLink
                        href="/manufacturing/orders?stage=quality_control"
                        label="QC approvals"
                      value={qcWorkCount}
                        detail="orders awaiting approval"
                        icon={ShieldCheck}
                        tone="yellow"
                      />
                    )}
                    {(data?.kpis.reworkQueue ?? 0) > 0 && (
                      <QueueLink
                        href="/manufacturing/rework"
                        label="Rework queue"
                        value={data?.kpis.reworkQueue ?? 0}
                        detail="open tickets"
                        icon={Wrench}
                        tone="orange"
                      />
                    )}
                    {maintenanceTotal > 0 && (
                      <QueueLink
                        href="/manufacturing/chargers"
                        label="Equipment maintenance"
                        value={maintenanceTotal}
                        detail="configured units in maintenance"
                        icon={Zap}
                        tone="yellow"
                      />
                    )}
                    {attentionStages.map(({ stage, value }) => (
                      <QueueLink
                        key={stage.key}
                        href={stage.href}
                        label={`${stage.label} blocked`}
                        value={value}
                        detail="stage response reports blocked work"
                        icon={Factory}
                        tone="orange"
                      />
                    ))}
                    {(data?.kpis.qcPending ?? 0) === 0 &&
                      (data?.kpis.reworkQueue ?? 0) === 0 &&
                      maintenanceTotal === 0 &&
                      attentionStages.length === 0 && (
                        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                          No attention items in the current response.
                        </div>
                      )}
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  Factory alerts
                  {criticalAlerts > 0 && (
                    <span className="ml-auto rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                      {criticalAlerts} critical
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pb-4">
                {isLoading ? (
                  <LoadingRows count={3} />
                ) : data?.alerts.length ? (
                  data.alerts.map((alert) => <AlertRow key={alert.id} alert={alert} />)
                ) : (
                  <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                    No factory alerts in the current response.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </section>

        <section aria-labelledby="orders-heading" className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">Level 4</p>
              <h2 id="orders-heading" className="text-xl font-bold">Production orders</h2>
            </div>
            <Link href="/manufacturing/orders">
              <Button variant="ghost" size="sm" className="gap-1 text-xs">
                View all <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="grid grid-cols-[minmax(9rem,1.2fr)_minmax(8rem,1fr)_minmax(6rem,.8fr)_minmax(5rem,.7fr)_4rem] gap-3 border-b px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span>Order / Product</span>
                <span>Stage</span>
                <span>Progress</span>
                <span>Priority</span>
                <span className="text-right">Age</span>
              </div>
              {isLoading ? (
                <div className="space-y-2 p-4"><LoadingRows count={5} /></div>
              ) : data?.recentOrders.length ? (
                <div className="divide-y">
                  {data.recentOrders.map((order) => (
                    <Link
                      key={order.id}
                      href={`/manufacturing/orders/${order.id}`}
                      className="grid grid-cols-[minmax(9rem,1.2fr)_minmax(8rem,1fr)_minmax(6rem,.8fr)_minmax(5rem,.7fr)_4rem] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-mono text-xs font-bold text-blue-700">{order.orderNumber}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {order.productName ?? order.productSku ?? "—"}
                          {order.productName && order.productSku ? ` · ${order.productSku}` : ""}
                        </span>
                      </span>
                      <span className="truncate text-sm">{order.currentStage ? STAGE_LABEL[order.currentStage] ?? order.currentStage : "—"}</span>
                      <OrderProgress stage={order.currentStage} />
                      <span className="text-xs font-semibold capitalize">{order.priority}</span>
                      <span className="text-right text-xs text-muted-foreground">{formatAge(order.createdAt)}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">No production orders yet.</p>
              )}
            </CardContent>
          </Card>
          <p className="text-[11px] text-muted-foreground">
            Product identity is read-only Model/SKU data; progress is the current stage ordinal against the frozen nine-stage runtime sequence.
          </p>
        </section>

        <section aria-labelledby="my-work-heading" className="space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">Level 5</p>
            <h2 id="my-work-heading" className="text-xl font-bold">My work</h2>
            <p className="text-sm text-muted-foreground">Shortcuts to verified queues and current factory work.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <QueueLink
              href="/manufacturing/orders?stage=quality_control&status=in_progress"
              label="QC approvals"
              value={qcWorkCount}
              detail="awaiting approval"
              icon={ShieldCheck}
              tone="yellow"
            />
            <QueueLink
              href="/manufacturing/rework"
              label="Rework queue"
              value={data?.kpis.reworkQueue ?? 0}
              detail="open tickets"
              icon={Wrench}
              tone="orange"
            />
            <QueueLink
              href="/manufacturing/orders?status=in_progress"
              label="Production in progress"
              value={inProgressWorkCount}
              detail="on the factory floor"
              icon={Factory}
              tone="blue"
            />
            <QueueLink
              href="/fulfillment/dispatch"
              label="Dispatch ready"
              value={data?.kpis.dispatchReady ?? 0}
                detail="packed products ready for dispatch"
              icon={Truck}
              tone="teal"
            />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/30">
          <button
            type="button"
            onClick={() => setDetailsOpen((open) => !open)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            aria-expanded={detailsOpen}
          >
            <span>
              <span className="block text-sm font-semibold">Details</span>
              <span className="block text-xs text-muted-foreground">Additional live dashboard feeds</span>
            </span>
            {detailsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {detailsOpen && (
            <div className="space-y-6 border-t border-slate-200 px-4 py-5 dark:border-slate-800">
              <OdsMetricGrid columns={4}>
                <OdsMetricCard
                  title="Efficiency"
                  value={`${data?.kpis.productionEfficiency ?? 0}%`}
                  icon={<Activity className="h-4 w-4 text-blue-600" />}
                  footer="vs today's target"
                  isLoading={isLoading}
                />
                <OdsMetricCard
                  title="QC pending"
                  value={data?.kpis.qcPending ?? 0}
                  icon={<ShieldCheck className="h-4 w-4 text-yellow-600" />}
                  status={(data?.kpis.qcPending ?? 0) > 5 ? "negative" : "warning"}
                  footer="awaiting approval"
                  isLoading={isLoading}
                />
                <OdsMetricCard
                  title="Dispatch ready"
                  value={data?.kpis.dispatchReady ?? 0}
                  icon={<Truck className="h-4 w-4 text-teal-600" />}
                  status="positive"
                  footer="packed products ready for dispatch"
                  isLoading={isLoading}
                />
                <OdsMetricCard
                  title="Rework queue"
                  value={data?.kpis.reworkQueue ?? 0}
                  icon={<Wrench className="h-4 w-4 text-orange-600" />}
                  status={(data?.kpis.reworkQueue ?? 0) > 3 ? "negative" : "warning"}
                  footer="open tickets"
                  isLoading={isLoading}
                />
              </OdsMetricGrid>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2 pt-4">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Activity className="h-4 w-4 text-blue-600" />
                      Operator activity
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pb-4">
                    {isLoading ? (
                      <LoadingRows count={4} />
                    ) : !data?.operatorActivity.length ? (
                      <p className="py-4 text-center text-sm text-muted-foreground">No operators currently active.</p>
                    ) : (
                      <div className="space-y-2">
                        {data.operatorActivity.map((operator, index) => (
                          <div key={`${operator.operatorName ?? "operator"}-${operator.stage ?? "stage"}-${index}`} className="flex items-center justify-between gap-2 border-b py-1.5 last:border-0">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold">{operator.operatorName ?? "—"}</p>
                              <p className="text-[11px] text-muted-foreground">{STAGE_LABEL[operator.stage ?? ""] ?? operator.stage ?? "—"}</p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-sm font-bold text-green-700">{operator.batteriesCompletedToday}</p>
                              <p className="text-[10px] text-muted-foreground">today</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2 pt-4">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Zap className="h-4 w-4 text-purple-600" />
                      Equipment and cells
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pb-4">
                    {isLoading ? (
                      <LoadingRows count={3} />
                    ) : (
                      <>
                        <EquipBar
                          label="Charger units"
                          total={data?.equipmentStatus.chargers.total ?? 0}
                          available={data?.equipmentStatus.chargers.available ?? 0}
                          busy={data?.equipmentStatus.chargers.busy ?? 0}
                          maintenance={data?.equipmentStatus.chargers.maintenance ?? 0}
                        />
                        <EquipBar
                          label="Test equipment"
                          total={data?.equipmentStatus.testEquipment.total ?? 0}
                          available={data?.equipmentStatus.testEquipment.available ?? 0}
                          busy={data?.equipmentStatus.testEquipment.busy ?? 0}
                          maintenance={data?.equipmentStatus.testEquipment.maintenance ?? 0}
                        />
                        <div className="mt-3 border-t pt-3">
                          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Cell inventory</p>
                          <div className="grid grid-cols-3 gap-1.5">
                            {[
                              ["Received", data?.cellInventory.received ?? 0, "text-blue-700"],
                              ["Grading", data?.cellInventory.grading ?? 0, "text-purple-700"],
                              ["Approved", data?.cellInventory.approved ?? 0, "text-green-700"],
                              ["Allocated", data?.cellInventory.allocated ?? 0, "text-teal-700"],
                              ["Rejected", data?.cellInventory.rejected ?? 0, "text-red-700"],
                              ["Quarantine", data?.cellInventory.quarantine ?? 0, "text-yellow-700"],
                            ].map(([label, value, color]) => (
                              <div key={label} className="text-center">
                                <p className={`text-base font-bold ${color}`}>{value}</p>
                                <p className="text-[10px] leading-tight text-muted-foreground">{label}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2 pt-4">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <ShieldCheck className="h-4 w-4 text-green-600" />
                      Quality and logistics
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 pb-4">
                    {isLoading ? (
                      <LoadingRows count={4} />
                    ) : (
                      <>
                        <div className="flex items-center gap-4 rounded-xl bg-muted/30 p-3">
                          <div className="flex flex-col items-center">
                            <span className="text-3xl font-black text-green-600">{data?.qualitySummary.passRate ?? 0}%</span>
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Pass rate</span>
                          </div>
                          <div className="flex-1 space-y-1 text-xs">
                            <div className="flex justify-between"><span className="text-red-600">Reject</span><span className="font-bold">{data?.qualitySummary.rejectRate ?? 0}%</span></div>
                            <div className="flex justify-between text-muted-foreground"><span>Samples</span><span>{data?.qualitySummary.sampleCount ?? 0}</span></div>
                          </div>
                        </div>
                        <div className="space-y-1.5 text-sm">
                          <div className="flex justify-between"><span className="text-muted-foreground">Tests passed</span><span className="font-semibold text-green-700">{data?.qualitySummary.testPassCount ?? 0}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Tests failed</span><span className="font-semibold text-red-700">{data?.qualitySummary.testFailCount ?? 0}</span></div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 border-t pt-3 text-center">
                          <div><p className="text-xl font-black text-blue-700">{data?.logistics.readyForDispatch ?? 0}</p><p className="text-[10px] text-muted-foreground">Ready for dispatch</p></div>
                          <div><p className="text-xl font-black text-purple-700">{data?.logistics.deliveredToday ?? 0}</p><p className="text-[10px] text-muted-foreground">Delivered today</p></div>
                          <div><p className="text-xl font-black text-blue-700">{data?.logistics.inTransit ?? 0}</p><p className="text-[10px] text-muted-foreground">In transit</p></div>
                          <div><p className="text-xl font-black">{data?.logistics.totalDealers ?? 0}</p><p className="text-[10px] text-muted-foreground">Total dealers</p></div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}