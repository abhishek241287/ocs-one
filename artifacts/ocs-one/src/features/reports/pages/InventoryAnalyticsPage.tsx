import AppLayout from "@/layouts/AppLayout";
import { ReportShell } from "../components/ReportShell";
import { StatCard } from "../components/StatCard";
import { useInventoryReport } from "../hooks/useReports";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { Battery, Package, Truck, Factory, Boxes, Warehouse } from "lucide-react";

const STATUS_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444"];
const GRADE_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444"];

const RAW_STATE_LABEL: Record<string, string> = {
  inspection_pending: "Awaiting Inspection",
  available: "Available",
  rejected: "Rejected",
};

export default function InventoryAnalyticsPage() {
  const { data, isLoading, refetch } = useInventoryReport();
  const qc = useQueryClient();

  return (
    <AppLayout>
      <ReportShell
        title="Inventory Analytics"
        subtitle="Raw materials, cell stock, battery WIP, finished goods, and lot utilization"
        refreshedAt={data?.refreshedAt}
        onRefresh={() => { void qc.invalidateQueries({ queryKey: ["reports", "inventory"] }); void refetch(); }}
        isLoading={isLoading}
      >
        {/* Raw Material Inventory KPIs */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Raw Material Stock</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Available" value={data?.rawMaterials.availableQty ?? null} icon={<Warehouse size={18} />} accent="bg-green-100 dark:bg-green-950 text-green-700" loading={isLoading} />
            {(["inspection_pending", "rejected"] as const).map((st) => {
              const row = data?.rawMaterials.byState.find((r) => r.stock_state === st);
              return (
                <StatCard
                  key={st}
                  label={RAW_STATE_LABEL[st]}
                  value={row ? row.total_qty : isLoading ? null : 0}
                  icon={<Boxes size={18} />}
                  accent={st === "rejected" ? "bg-red-100 dark:bg-red-950 text-red-600" : "bg-yellow-100 dark:bg-yellow-950 text-yellow-700"}
                  loading={isLoading}
                />
              );
            })}
            <StatCard label="Materials On Hand" value={data ? data.rawMaterials.byState.reduce((s, r) => s + r.material_count, 0) : null} loading={isLoading} />
          </div>
        </section>

        {/* Finished Goods Inventory KPIs */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Finished Goods (Products)</h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <StatCard label="Available" value={data?.finishedProducts.available ?? null} icon={<Package size={18} />} accent="bg-green-100 dark:bg-green-950 text-green-700" loading={isLoading} />
            <StatCard label="Ready to Pack" value={data?.finishedProducts.readyForPacking ?? null} accent="bg-blue-100 dark:bg-blue-950 text-blue-700" loading={isLoading} />
            <StatCard label="Packed" value={data?.finishedProducts.packed ?? null} accent="bg-indigo-100 dark:bg-indigo-950 text-indigo-700" loading={isLoading} />
            <StatCard label="Dispatched" value={data?.finishedProducts.dispatched ?? null} icon={<Truck size={18} />} accent="bg-orange-100 dark:bg-orange-950 text-orange-700" loading={isLoading} />
            <StatCard label="Dealer Stock" value={data?.finishedProducts.dealerStock ?? null} accent="bg-emerald-100 dark:bg-emerald-950 text-emerald-700" loading={isLoading} />
          </div>
        </section>

        {/* Cell Inventory KPIs */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Cell Stock</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Total Cells" value={data?.cells.total ?? null} icon={<Battery size={18} />} loading={isLoading} />
            <StatCard label="Available" value={data?.cells.available ?? null} accent="bg-green-100 dark:bg-green-950 text-green-700" loading={isLoading} />
            <StatCard label="Allocated" value={data?.cells.allocated ?? null} accent="bg-blue-100 dark:bg-blue-950 text-blue-700" loading={isLoading} />
            <StatCard label="Rejected" value={data?.cells.rejected ?? null} accent="bg-red-100 dark:bg-red-950 text-red-600" loading={isLoading} />
          </div>
        </section>

        {/* Battery Inventory KPIs */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Battery Inventory</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="In Production" value={data?.batteries.inProgress ?? null} icon={<Factory size={18} />} accent="bg-yellow-100 dark:bg-yellow-950 text-yellow-700" loading={isLoading} />
            <StatCard label="Completed" value={data?.batteries.completed ?? null} icon={<Package size={18} />} accent="bg-green-100 dark:bg-green-950 text-green-700" loading={isLoading} />
            <StatCard label="Ready to Dispatch" value={data?.batteries.readyForDispatch ?? null} icon={<Truck size={18} />} accent="bg-purple-100 dark:bg-purple-950 text-purple-700" loading={isLoading} />
            <StatCard label="Draft Orders" value={data?.batteries.draft ?? null} loading={isLoading} />
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Cell Status Donut */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Cell Status Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? <div className="h-52 bg-muted animate-pulse rounded" /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={data?.cells.statusBreakdown ?? []} cx="50%" cy="50%" outerRadius={80} innerRadius={48} dataKey="count" nameKey="status" label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`} labelLine={false}>
                      {(data?.cells.statusBreakdown ?? []).map((_, i) => <Cell key={i} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend iconSize={10} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Grade Breakdown Donut */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Cell Grade Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? <div className="h-52 bg-muted animate-pulse rounded" /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={data?.cells.gradeBreakdown ?? []} cx="50%" cy="50%" outerRadius={80} innerRadius={48} dataKey="count" nameKey="grade" label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`} labelLine={false}>
                      {(data?.cells.gradeBreakdown ?? []).map((_, i) => <Cell key={i} fill={GRADE_COLORS[i % GRADE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend iconSize={10} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Lot Utilization Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Lot Utilization</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <div className="h-48 bg-muted animate-pulse rounded" /> : (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={(data?.byLot ?? []).slice(0, 12).map(r => ({ name: r.lotNumber, Available: r.available, Allocated: r.allocated, Rejected: r.rejected }))} margin={{ left: 0, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Available" fill="#22c55e" stackId="a" />
                    <Bar dataKey="Allocated" fill="#3b82f6" stackId="a" />
                    <Bar dataKey="Rejected" fill="#ef4444" stackId="a" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="overflow-x-auto mt-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground uppercase tracking-wide">
                        <th className="pb-2 pr-4">Lot</th>
                        <th className="pb-2 pr-4">Supplier</th>
                        <th className="pb-2 pr-4 text-right">Total</th>
                        <th className="pb-2 pr-4 text-right">Available</th>
                        <th className="pb-2 pr-4 text-right">Allocated</th>
                        <th className="pb-2 text-right">Utilization</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.byLot ?? []).map(lot => (
                        <tr key={lot.lotNumber} className="border-b hover:bg-muted/30">
                          <td className="py-2 pr-4 font-mono text-xs">{lot.lotNumber}</td>
                          <td className="py-2 pr-4">{lot.supplier}</td>
                          <td className="py-2 pr-4 text-right">{lot.total}</td>
                          <td className="py-2 pr-4 text-right text-green-700 dark:text-green-400">{lot.available}</td>
                          <td className="py-2 pr-4 text-right text-blue-700 dark:text-blue-400">{lot.allocated}</td>
                          <td className="py-2 text-right font-bold">{lot.utilizationPct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </ReportShell>
    </AppLayout>
  );
}
