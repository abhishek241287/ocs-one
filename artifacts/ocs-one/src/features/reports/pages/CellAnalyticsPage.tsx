import AppLayout from "@/layouts/AppLayout";
import { ReportShell } from "../components/ReportShell";
import { StatCard } from "../components/StatCard";
import { useCellReport } from "../hooks/useReports";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";

const GRADE_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444"];

export default function CellAnalyticsPage() {
  const { data, isLoading, refetch } = useCellReport();
  const qc = useQueryClient();

  const gradeData = data ? [
    { name: "Grade A", value: data.summary.gradeA },
    { name: "Grade B", value: data.summary.gradeB },
    { name: "Grade C", value: data.summary.gradeC },
    { name: "Rejected", value: data.summary.rejected },
  ].filter(d => d.value > 0) : [];

  return (
    <AppLayout>
      <ReportShell
        title="Cell Analytics"
        subtitle="Grade distribution, capacity, IR, supplier and lot performance"
        refreshedAt={data?.refreshedAt}
        onRefresh={() => { void qc.invalidateQueries({ queryKey: ["reports", "cells"] }); void refetch(); }}
        isLoading={isLoading}
      >
        {/* Summary KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard label="Total Cells" value={data?.summary.total ?? null} loading={isLoading} />
          <StatCard label="Grade A" value={data?.summary.gradeA ?? null} suffix={data ? `(${data.summary.gradeAPct}%)` : ""} accent="bg-green-100 dark:bg-green-950 text-green-700" loading={isLoading} />
          <StatCard label="Grade B" value={data?.summary.gradeB ?? null} suffix={data ? `(${data.summary.gradeBPct}%)` : ""} accent="bg-blue-100 dark:bg-blue-950 text-blue-700" loading={isLoading} />
          <StatCard label="Grade C" value={data?.summary.gradeC ?? null} suffix={data ? `(${data.summary.gradeCPct}%)` : ""} accent="bg-yellow-100 dark:bg-yellow-950 text-yellow-700" loading={isLoading} />
          <StatCard label="Rejected" value={data?.summary.rejected ?? null} accent="bg-red-100 dark:bg-red-950 text-red-600" loading={isLoading} />
          <StatCard label="Avg Capacity" value={data?.summary.avgCapacity ?? null} suffix="Ah" loading={isLoading} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Grade Donut */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Grade Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? <div className="h-52 bg-muted animate-pulse rounded" /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={gradeData} cx="50%" cy="50%" outerRadius={80} innerRadius={48} dataKey="value" label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`} labelLine={false}>
                      {gradeData.map((_, i) => <Cell key={i} fill={GRADE_COLORS[i % GRADE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend iconSize={10} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Capacity Distribution */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Capacity Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? <div className="h-52 bg-muted animate-pulse rounded" /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data?.capacityDistribution ?? []} margin={{ left: 0, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#3b82f6" name="Cells" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Supplier Performance */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Supplier Performance</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <div className="h-48 bg-muted animate-pulse rounded" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data?.bySupplier ?? []} margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="supplier" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="gradeA" fill="#22c55e" name="Grade A" stackId="a" />
                  <Bar dataKey="gradeB" fill="#3b82f6" name="Grade B" stackId="a" />
                  <Bar dataKey="gradeC" fill="#f59e0b" name="Grade C" stackId="a" />
                  <Bar dataKey="rejected" fill="#ef4444" name="Rejected" stackId="a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Lot Performance Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Lot Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground uppercase tracking-wide">
                    <th className="pb-2 pr-4">Lot</th>
                    <th className="pb-2 pr-4">Supplier</th>
                    <th className="pb-2 pr-4 text-right">Total</th>
                    <th className="pb-2 pr-4 text-right">Grade A</th>
                    <th className="pb-2 pr-4 text-right">Rejected</th>
                    <th className="pb-2 text-right">Yield %</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Loading…</td></tr>
                  ) : (data?.byLot ?? []).length === 0 ? (
                    <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No data</td></tr>
                  ) : (data?.byLot ?? []).map(lot => (
                    <tr key={lot.lotNumber} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="py-2 pr-4 font-mono text-xs">{lot.lotNumber}</td>
                      <td className="py-2 pr-4">{lot.supplier}</td>
                      <td className="py-2 pr-4 text-right">{lot.total}</td>
                      <td className="py-2 pr-4 text-right text-green-700 dark:text-green-400 font-semibold">{lot.gradeA}</td>
                      <td className="py-2 pr-4 text-right text-red-600">{lot.rejected}</td>
                      <td className="py-2 text-right font-bold">{lot.yieldPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Matching Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Total Matches" value={data?.matchingStats.total ?? null} loading={isLoading} />
          <StatCard label="Allocated" value={data?.matchingStats.allocated ?? null} accent="bg-green-100 dark:bg-green-950" loading={isLoading} />
          <StatCard label="Pending" value={data?.matchingStats.pending ?? null} accent="bg-yellow-100 dark:bg-yellow-950" loading={isLoading} />
          <StatCard label="Match Success" value={data?.matchingStats.successPct ?? null} suffix="%" loading={isLoading} />
        </div>
      </ReportShell>
    </AppLayout>
  );
}
