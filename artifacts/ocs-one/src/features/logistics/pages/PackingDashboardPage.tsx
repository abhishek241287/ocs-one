import AppLayout from "@/layouts/AppLayout";
import { useGetPackingDashboard } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, Truck, CheckCircle2, Clock, RefreshCw, Loader2, AlertCircle, ArrowRight } from "lucide-react";
import { Link } from "wouter";

function KpiCard({ title, value, sub, icon: Icon, color }: { title: string; value: number | string; sub?: string; icon: React.FC<{ className?: string }>; color: string; }) {
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

export default function PackingDashboardPage() {
  const { data, isLoading, isError, refetch } = useGetPackingDashboard();

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Package className="h-6 w-6 text-orange-600" />
              Packing & Dispatch Dashboard
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Live logistics activity overview</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-1" />Refresh
            </Button>
            <Link href="/logistics/dispatch-orders">
              <Button size="sm" className="gap-1">
                <Truck className="h-4 w-4" />Dispatch Orders
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
              <AlertCircle className="h-5 w-5" />Failed to load packing dashboard.
            </CardContent>
          </Card>
        )}

        {data && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <KpiCard title="Ready for Dispatch" value={data.readyForDispatch} sub="packing approved" icon={CheckCircle2} color="bg-green-100 text-green-700" />
              <KpiCard title="Packed Today" value={data.packedToday} sub="packing completed" icon={Package} color="bg-orange-100 text-orange-700" />
              <KpiCard title="Waiting Dispatch" value={data.waitingDispatch} sub="draft/confirmed/loaded" icon={Clock} color="bg-yellow-100 text-yellow-700" />
              <KpiCard title="In Transit" value={data.inTransit} sub="dispatch orders" icon={Truck} color="bg-blue-100 text-blue-700" />
              <KpiCard title="Delivered Today" value={data.deliveredToday} sub="shipments" icon={CheckCircle2} color="bg-purple-100 text-purple-700" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardContent className="pt-5">
                  <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                    <Truck className="h-4 w-4 text-blue-600" />Dispatch Orders
                  </h3>
                  <Link href="/logistics/dispatch-orders">
                    <Button variant="outline" size="sm" className="gap-1">
                      View All Orders <ArrowRight className="h-3 w-3" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5">
                  <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                    <Package className="h-4 w-4 text-orange-600" />Dealer Management
                  </h3>
                  <Link href="/logistics/dealers">
                    <Button variant="outline" size="sm" className="gap-1">
                      Manage Dealers <ArrowRight className="h-3 w-3" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
