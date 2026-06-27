import AppLayout from "@/layouts/AppLayout";
import { useGetTestingDashboard } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FlaskConical, CheckCircle2, XCircle, Wrench, Clock, ShieldCheck, Loader2, AlertCircle, ArrowRight,
} from "lucide-react";
import { Link } from "wouter";

function KpiCard({
  title,
  value,
  sub,
  icon: Icon,
  color,
}: {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.FC<{ className?: string }>;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">{title}</p>
            <p className="text-3xl font-bold">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`p-2.5 rounded-lg ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function TestingDashboardPage() {
  const { data, isLoading, isError, refetch } = useGetTestingDashboard();

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FlaskConical className="h-6 w-6 text-primary" />
              Testing & QC Dashboard
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Live view of battery lab testing activity</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Refresh
            </Button>
            <Link href="/manufacturing/rework">
              <Button size="sm" variant="outline" className="gap-1">
                <Wrench className="h-4 w-4" /> Rework Queue
              </Button>
            </Link>
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {isError && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-5 flex items-center gap-2 text-red-700">
              <AlertCircle className="h-5 w-5" />
              Failed to load testing dashboard.
            </CardContent>
          </Card>
        )}

        {data && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <KpiCard
                title="Under Test"
                value={data.batteriesUnderTest}
                sub="batteries in lab"
                icon={FlaskConical}
                color="bg-blue-100 text-blue-700"
              />
              <KpiCard
                title="Passed Today"
                value={data.passedToday}
                sub="all test types"
                icon={CheckCircle2}
                color="bg-green-100 text-green-700"
              />
              <KpiCard
                title="Failed Today"
                value={data.failedToday}
                sub="failed tests"
                icon={XCircle}
                color="bg-red-100 text-red-700"
              />
              <KpiCard
                title="Rework Queue"
                value={data.reworkQueueCount}
                sub="open + in-progress"
                icon={Wrench}
                color="bg-orange-100 text-orange-700"
              />
              <KpiCard
                title="QC Pending"
                value={data.qcPendingCount}
                sub="awaiting inspector"
                icon={ShieldCheck}
                color="bg-purple-100 text-purple-700"
              />
              <KpiCard
                title="Avg Test Time"
                value={data.avgTestTimeHrs != null ? `${data.avgTestTimeHrs}h` : "—"}
                sub="testing stage"
                icon={Clock}
                color="bg-gray-100 text-gray-700"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardContent className="pt-5">
                  <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-orange-600" />
                    Rework Queue
                    {data.reworkQueueCount > 0 && (
                      <Badge className="bg-orange-100 text-orange-700 text-xs">{data.reworkQueueCount} open</Badge>
                    )}
                  </h3>
                  {data.reworkQueueCount === 0 ? (
                    <p className="text-sm text-muted-foreground">No open rework items. ✓</p>
                  ) : (
                    <Link href="/manufacturing/rework">
                      <Button variant="outline" size="sm" className="gap-1">
                        View Queue <ArrowRight className="h-3 w-3" />
                      </Button>
                    </Link>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5">
                  <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-purple-600" />
                    QC Pending Approvals
                    {data.qcPendingCount > 0 && (
                      <Badge className="bg-purple-100 text-purple-700 text-xs">{data.qcPendingCount} pending</Badge>
                    )}
                  </h3>
                  {data.qcPendingCount === 0 ? (
                    <p className="text-sm text-muted-foreground">No batteries awaiting QC. ✓</p>
                  ) : (
                    <Link href="/manufacturing/orders">
                      <Button variant="outline" size="sm" className="gap-1">
                        View Orders <ArrowRight className="h-3 w-3" />
                      </Button>
                    </Link>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
