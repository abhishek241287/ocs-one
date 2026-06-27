import { useState } from "react";
import AppLayout from "@/layouts/AppLayout";
import { ReportShell } from "../components/ReportShell";
import { useProductionReport } from "../hooks/useReports";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line, ResponsiveContainer, AreaChart, Area,
} from "recharts";

type Granularity = "day" | "week" | "month";

export default function ProductionReportPage() {
  const [from, setFrom] = useState(() => {
    const d = new Date(Date.now() - 30 * 86400000);
    return d.toISOString().split("T")[0];
  });
  const [to, setTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [applied, setApplied] = useState<{ from: string; to: string }>({ from, to });

  const qc = useQueryClient();
  const params = { from: applied.from, to: applied.to };
  const { data, isLoading, refetch } = useProductionReport(params);

  const chartData =
    granularity === "day" ? (data?.byDay ?? []).map(r => ({ name: r.date, Created: r.created, Completed: r.completed }))
    : granularity === "week" ? (data?.byWeek ?? []).map(r => ({ name: r.week, Created: r.created, Completed: r.completed }))
    : (data?.byMonth ?? []).map(r => ({ name: r.month, Created: r.created, Completed: r.completed }));

  return (
    <AppLayout>
      <ReportShell
        title="Production Reports"
        subtitle="Order throughput by time period, operator, and stage"
        refreshedAt={data?.refreshedAt}
        onRefresh={() => { void qc.invalidateQueries({ queryKey: ["reports", "production"] }); void refetch(); }}
        isLoading={isLoading}
      >
        {/* Filters */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground font-medium">From</label>
                <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-9 w-36" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground font-medium">To</label>
                <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-9 w-36" />
              </div>
              <Button size="sm" onClick={() => setApplied({ from, to })}>Apply</Button>
              <div className="flex gap-1 ml-auto">
                {(["day", "week", "month"] as Granularity[]).map(g => (
                  <Button key={g} size="sm" variant={granularity === g ? "default" : "outline"}
                    onClick={() => setGranularity(g)} className="capitalize">{g}</Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Production over time */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Production Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <div className="h-64 bg-muted animate-pulse rounded" /> : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="Created" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} strokeWidth={2} />
                  <Area type="monotone" dataKey="Completed" stroke="#22c55e" fill="#22c55e" fillOpacity={0.15} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* By Operator */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Production by Operator</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? <div className="h-48 bg-muted animate-pulse rounded" /> : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={(data?.byOperator ?? []).slice(0, 10)} layout="vertical" margin={{ left: 40, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="operator" tick={{ fontSize: 11 }} width={90} />
                    <Tooltip />
                    <Bar dataKey="completed" fill="#3b82f6" name="Completed" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Avg Cycle Time by Stage */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Average Cycle Time by Stage (hrs)</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? <div className="h-48 bg-muted animate-pulse rounded" /> : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={(data?.stageTimings ?? []).filter(r => r.avgHrs != null)} layout="vertical" margin={{ left: 60, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="stage" tick={{ fontSize: 10 }} width={110} />
                    <Tooltip formatter={(v: number) => [`${v} hrs`]} />
                    <Bar dataKey="avgHrs" fill="#8b5cf6" name="Avg Hours" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Monthly trend line */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Monthly Production</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <div className="h-48 bg-muted animate-pulse rounded" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={(data?.byMonth ?? []).map(r => ({ name: r.month, Created: r.created, Completed: r.completed }))} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="Created" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Completed" stroke="#22c55e" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </ReportShell>
    </AppLayout>
  );
}
