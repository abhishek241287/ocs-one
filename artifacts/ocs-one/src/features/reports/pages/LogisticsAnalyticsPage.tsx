import AppLayout from "@/layouts/AppLayout";
import { ReportShell } from "../components/ReportShell";
import { StatCard } from "../components/StatCard";
import { useLogisticsReport } from "../hooks/useReports";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line,
} from "recharts";
import { Truck, Package, CheckCircle2, Navigation } from "lucide-react";

const STATUS_COLORS = ["#94a3b8", "#3b82f6", "#8b5cf6", "#f59e0b", "#22c55e"];

export default function LogisticsAnalyticsPage() {
  const { data, isLoading, refetch } = useLogisticsReport();
  const qc = useQueryClient();

  return (
    <AppLayout>
      <ReportShell
        title="Logistics Analytics"
        subtitle="Dispatch status, dealer performance, territory breakdown, and monthly trends"
        refreshedAt={data?.refreshedAt}
        onRefresh={() => { void qc.invalidateQueries({ queryKey: ["reports", "logistics"] }); void refetch(); }}
        isLoading={isLoading}
      >
        {/* Summary KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard label="Packed Today" value={data?.summary.packedToday ?? null} icon={<Package size={18} />} accent="bg-blue-100 dark:bg-blue-950 text-blue-700" loading={isLoading} />
          <StatCard label="Dispatched Today" value={data?.summary.dispatchedToday ?? null} icon={<Truck size={18} />} accent="bg-purple-100 dark:bg-purple-950 text-purple-700" loading={isLoading} />
          <StatCard label="In Transit" value={data?.summary.inTransit ?? null} icon={<Navigation size={18} />} accent="bg-yellow-100 dark:bg-yellow-950 text-yellow-700" loading={isLoading} />
          <StatCard label="Delivered" value={data?.summary.delivered ?? null} icon={<CheckCircle2 size={18} />} accent="bg-green-100 dark:bg-green-950 text-green-700" loading={isLoading} />
          <StatCard label="Total Shipments" value={data?.summary.total ?? null} loading={isLoading} />
          <StatCard label="Batteries Shipped" value={data?.summary.totalBatteriesShipped ?? null} loading={isLoading} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Status Flow Donut */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Shipment Status</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? <div className="h-52 bg-muted animate-pulse rounded" /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={(data?.statusFlow ?? []).filter(d => d.count > 0)} cx="50%" cy="50%" outerRadius={80} innerRadius={48} dataKey="count" nameKey="status">
                      {(data?.statusFlow ?? []).map((_, i) => <Cell key={i} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend iconSize={10} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Territory Breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Territory-wise Dispatch</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? <div className="h-52 bg-muted animate-pulse rounded" /> : (data?.byTerritory ?? []).length === 0 ? (
                <p className="text-center text-muted-foreground py-8 text-sm">No data yet</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={(data?.byTerritory ?? []).map(r => ({ name: r.territory, Total: r.total, Delivered: r.delivered }))} margin={{ left: 0, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Total" fill="#3b82f6" />
                    <Bar dataKey="Delivered" fill="#22c55e" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Monthly Trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Monthly Dispatch Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <div className="h-48 bg-muted animate-pulse rounded" /> : (data?.byMonth ?? []).length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={(data?.byMonth ?? []).map(r => ({ name: r.month, Orders: r.total, Dispatched: r.dispatched }))} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="Orders" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Dispatched" stroke="#22c55e" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Dealer Performance Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Dealer Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground uppercase tracking-wide">
                    <th className="pb-2 pr-4">Dealer</th>
                    <th className="pb-2 pr-4">Territory</th>
                    <th className="pb-2 pr-4 text-right">Total Orders</th>
                    <th className="pb-2 pr-4 text-right">Delivered</th>
                    <th className="pb-2 text-right">In Transit</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Loading…</td></tr>
                  ) : (data?.byDealer ?? []).length === 0 ? (
                    <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">No dealers yet</td></tr>
                  ) : (data?.byDealer ?? []).map(d => (
                    <tr key={d.dealerName} className="border-b hover:bg-muted/30">
                      <td className="py-2 pr-4 font-medium">{d.dealerName}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{d.territory}</td>
                      <td className="py-2 pr-4 text-right">{d.total}</td>
                      <td className="py-2 pr-4 text-right text-green-700 dark:text-green-400 font-semibold">{d.delivered}</td>
                      <td className="py-2 text-right text-yellow-700 dark:text-yellow-400">{d.inTransit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </ReportShell>
    </AppLayout>
  );
}
