import AppLayout from "@/layouts/AppLayout";
import { ReportShell } from "../components/ReportShell";
import { StatCard } from "../components/StatCard";
import { useQualityReport } from "../hooks/useReports";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { ShieldCheck, AlertTriangle, Wrench, CheckCircle2 } from "lucide-react";

const PASS_COLOR = "#22c55e";
const FAIL_COLOR = "#ef4444";
const COLORS = ["#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e", "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899"];

export default function QualityAnalyticsPage() {
  const { data, isLoading, refetch } = useQualityReport();
  const qc = useQueryClient();

  const testTypeData = (data?.byTestType ?? []).map(r => ({
    name: r.testType.replace(/_/g, " "),
    Pass: r.passed,
    Fail: r.failed,
    passRate: r.passRate,
  }));

  return (
    <AppLayout>
      <ReportShell
        title="Quality Analytics"
        subtitle="Test pass rates, QC approvals, rework tracking, and defect Pareto"
        refreshedAt={data?.refreshedAt}
        onRefresh={() => { void qc.invalidateQueries({ queryKey: ["reports", "quality"] }); void refetch(); }}
        isLoading={isLoading}
      >
        {/* Summary KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="QC Pass %" value={data?.summary.qcPassPct ?? null} suffix="%" icon={<ShieldCheck size={18} />} accent="bg-green-100 dark:bg-green-950 text-green-700" loading={isLoading} />
          <StatCard label="First Pass Yield" value={data?.summary.firstPassYield ?? null} suffix="%" icon={<CheckCircle2 size={18} />} accent="bg-blue-100 dark:bg-blue-950 text-blue-700" loading={isLoading} />
          <StatCard label="QC Reject %" value={data?.summary.qcRejectPct ?? null} suffix="%" icon={<AlertTriangle size={18} />} accent="bg-red-100 dark:bg-red-950 text-red-600" loading={isLoading} />
          <StatCard label="Open Reworks" value={data?.rework.open ?? null} icon={<Wrench size={18} />} accent="bg-orange-100 dark:bg-orange-950 text-orange-700" loading={isLoading} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Total Tests" value={data?.summary.totalTests ?? null} loading={isLoading} />
          <StatCard label="Tests Passed" value={data?.summary.passed ?? null} accent="bg-green-50 dark:bg-green-950" loading={isLoading} />
          <StatCard label="Tests Failed" value={data?.summary.failed ?? null} accent="bg-red-50 dark:bg-red-950" loading={isLoading} />
          <StatCard label="Total Reworks" value={data?.rework.total ?? null} loading={isLoading} />
        </div>

        {/* Pass/Fail by Test Type */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Pass / Fail by Test Type</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <div className="h-56 bg-muted animate-pulse rounded" /> : testTypeData.length === 0 ? (
              <p className="text-center text-muted-foreground py-12 text-sm">No test data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={testTypeData} margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Pass" fill={PASS_COLOR} stackId="a" />
                  <Bar dataKey="Fail" fill={FAIL_COLOR} stackId="a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Stage Rejections */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Stage-wise Rejections</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? <div className="h-48 bg-muted animate-pulse rounded" /> : (data?.stageRejections ?? []).length === 0 ? (
                <p className="text-center text-muted-foreground py-8 text-sm">No rejections</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={(data?.stageRejections ?? []).map(r => ({ name: r.stage.replace(/_/g, " "), Rejected: r.rejected }))} layout="vertical" margin={{ left: 60, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                    <Tooltip />
                    <Bar dataKey="Rejected" fill={FAIL_COLOR} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Top Defects Pareto */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Top Defects (Pareto)</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? <div className="h-48 bg-muted animate-pulse rounded" /> : (data?.topDefects ?? []).length === 0 ? (
                <p className="text-center text-muted-foreground py-8 text-sm">No defect data yet</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={(data?.topDefects ?? []).map(r => ({ name: r.reason, value: r.count }))} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ percent }) => `${Math.round(percent * 100)}%`}>
                      {(data?.topDefects ?? []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend iconSize={10} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* QC Stage Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="QC Stages Total" value={data?.summary.qcApprovals ?? null} loading={isLoading} />
          <StatCard label="Approved" value={data?.summary.qcApproved ?? null} accent="bg-green-100 dark:bg-green-950" loading={isLoading} />
          <StatCard label="Rejected" value={data?.summary.qcRejected ?? null} accent="bg-red-100 dark:bg-red-950" loading={isLoading} />
          <StatCard label="Approval Rate" value={data?.summary.qcApprovalPct ?? null} suffix="%" loading={isLoading} />
        </div>
      </ReportShell>
    </AppLayout>
  );
}
