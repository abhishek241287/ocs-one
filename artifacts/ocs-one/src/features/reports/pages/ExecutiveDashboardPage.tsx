import AppLayout from "@/layouts/AppLayout";
import { ReportShell } from "../components/ReportShell";
import { StatCard } from "../components/StatCard";
import { useExecutiveReport } from "../hooks/useReports";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Factory, Battery, ShieldCheck, Truck, Zap, FlaskConical,
  Package, TrendingUp, Clock, AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  RadialBarChart, RadialBar, ResponsiveContainer, Tooltip,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const GRADE_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444"];

function GaugePct({ value, label, color }: { value: number | null; label: string; color: string }) {
  const pct = value ?? 0;
  const data = [{ name: label, value: pct, fill: color }, { name: "rest", value: 100 - pct, fill: "transparent" }];
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="h-28 w-28 relative">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart cx="50%" cy="50%" innerRadius="65%" outerRadius="100%" startAngle={90} endAngle={-270} data={data} barSize={10}>
            <RadialBar dataKey="value" cornerRadius={5} background={{ fill: "hsl(var(--muted))" }} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-black">{value != null ? `${value}%` : "—"}</span>
        </div>
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-center">{label}</p>
    </div>
  );
}

export default function ExecutiveDashboardPage() {
  const { data, isLoading, refetch } = useExecutiveReport();
  const qc = useQueryClient();

  return (
    <AppLayout>
      <ReportShell
        title="Executive Dashboard"
        subtitle="Live manufacturing KPIs — all plants"
        refreshedAt={data?.refreshedAt}
        onRefresh={() => { void qc.invalidateQueries({ queryKey: ["reports", "executive"] }); void refetch(); }}
        isLoading={isLoading}
      >
        {/* Production KPIs */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Production</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard label="Today" value={data?.production.today ?? null} icon={<Factory size={18} />} accent="bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300" loading={isLoading} />
            <StatCard label="This Month" value={data?.production.thisMonth ?? null} icon={<TrendingUp size={18} />} accent="bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300" loading={isLoading} />
            <StatCard label="Total Completed" value={data?.production.total ?? null} icon={<ShieldCheck size={18} />} accent="bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300" loading={isLoading} />
            <StatCard label="In Production" value={data?.production.inProgress ?? null} icon={<Zap size={18} />} accent="bg-yellow-100 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300" loading={isLoading} />
            <StatCard label="Ready to Dispatch" value={data?.inventory.readyForDispatch ?? null} icon={<Package size={18} />} accent="bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300" loading={isLoading} />
            <StatCard label="Dispatched Today" value={data?.logistics.dispatchedToday ?? null} icon={<Truck size={18} />} accent="bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300" loading={isLoading} />
          </div>
        </section>

        {/* Quality Gauges */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Quality</h2>
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 justify-items-center">
                <GaugePct value={data?.quality.qcPassPct ?? null} label="QC Pass" color="#22c55e" />
                <GaugePct value={data?.quality.firstPassYield ?? null} label="First Pass Yield" color="#3b82f6" />
                <GaugePct value={data?.yieldPct ?? null} label="Battery Yield" color="#8b5cf6" />
                <GaugePct value={data?.quality.qcRejectPct ?? null} label="QC Reject" color="#ef4444" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t">
                <StatCard label="Open Reworks" value={data?.quality.openReworks ?? null} icon={<AlertTriangle size={16} />} accent="bg-red-100 dark:bg-red-950 text-red-600" loading={isLoading} />
                <StatCard label="Rework %" value={data?.quality.reworkPct ?? null} suffix="%" loading={isLoading} />
                <Link href="/reports/production" className="contents">
                  <StatCard label="Avg Mfg Time" value={data?.timings.avgMfgHrs ?? null} suffix="h" icon={<Clock size={16} />} loading={isLoading} onClick={() => {}} />
                </Link>
                <StatCard label="Avg Charging" value={data?.timings.avgChargingHrs ?? null} suffix="h" icon={<Zap size={16} />} loading={isLoading} />
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Inventory + Logistics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2"><Battery size={16} /> Cell Inventory</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-32 bg-muted animate-pulse rounded" />
              ) : data ? (
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: "Grade A", value: data.inventory.gradeA },
                        { name: "Grade B", value: data.inventory.gradeB },
                        { name: "Grade C", value: data.inventory.gradeC },
                        { name: "Rejected", value: data.inventory.rejected },
                      ].filter(d => d.value > 0)}
                      cx="50%" cy="50%" outerRadius={70} innerRadius={40} dataKey="value"
                    >
                      {GRADE_COLORS.map((c, i) => <Cell key={i} fill={c} />)}
                    </Pie>
                    <Tooltip />
                    <Legend iconSize={10} />
                  </PieChart>
                </ResponsiveContainer>
              ) : null}
              <div className="grid grid-cols-3 gap-2 mt-2 text-center text-xs">
                <div className="rounded bg-muted/50 p-2">
                  <div className="font-bold text-base">{data?.inventory.totalCells ?? "—"}</div>
                  <div className="text-muted-foreground">Total Cells</div>
                </div>
                <div className="rounded bg-muted/50 p-2">
                  <div className="font-bold text-base">{data?.inventory.availableCells ?? "—"}</div>
                  <div className="text-muted-foreground">Available</div>
                </div>
                <div className="rounded bg-muted/50 p-2">
                  <div className="font-bold text-base">{data?.inventory.batteriesInProduction ?? "—"}</div>
                  <div className="text-muted-foreground">In Production</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2"><Truck size={16} /> Logistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <StatCard label="In Transit" value={data?.logistics.inTransit ?? null} loading={isLoading} accent="bg-blue-100 dark:bg-blue-950" />
                <StatCard label="Total Shipments" value={data?.logistics.totalShipments ?? null} loading={isLoading} />
                <StatCard label="Avg Testing" value={data?.timings.avgTestingHrs ?? null} suffix="h" icon={<FlaskConical size={16} />} loading={isLoading} />
                <StatCard label="Ready to Dispatch" value={data?.inventory.readyForDispatch ?? null} loading={isLoading} accent="bg-green-100 dark:bg-green-950" />
              </div>
            </CardContent>
          </Card>
        </div>
      </ReportShell>
    </AppLayout>
  );
}
