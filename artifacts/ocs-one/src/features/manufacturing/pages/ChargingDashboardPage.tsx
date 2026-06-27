import AppLayout from "@/layouts/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Zap, BatteryCharging, Clock, CheckCircle2, RefreshCw, Loader2, AlertTriangle } from "lucide-react";
import { useGetChargingDashboard, useListChargerUnits } from "@workspace/api-client-react";
import { Link } from "wouter";
import { OdsMetricCard, OdsMetricGrid } from "@/components/ods";

const CHARGER_STATUS_CONFIG = {
  available:   { label: "Available",   className: "bg-green-100 text-green-800 border-green-300" },
  busy:        { label: "Charging",    className: "bg-blue-100 text-blue-800 border-blue-300" },
  maintenance: { label: "Maintenance", className: "bg-yellow-100 text-yellow-800 border-yellow-300" },
};

export default function ChargingDashboardPage() {
  const { data: dash, isLoading: dashLoading, refetch: refetchDash } = useGetChargingDashboard();
  const { data: unitData, isLoading: unitsLoading, refetch: refetchUnits } = useListChargerUnits({});

  const units = unitData?.items ?? [];

  const handleRefresh = () => {
    refetchDash();
    refetchUnits();
  };

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Zap className="h-6 w-6 text-yellow-500" />
              Live Charging Dashboard
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Real-time view of charging floor activity</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-1" />Refresh
            </Button>
            <Link href="/manufacturing/chargers">
              <Button size="sm" variant="outline">Manage Chargers</Button>
            </Link>
          </div>
        </div>

        {/* KPIs */}
        {dashLoading ? (
          <OdsMetricGrid columns={4}>
            {Array.from({ length: 8 }).map((_, i) => (
              <OdsMetricCard key={i} title="" value="" isLoading />
            ))}
          </OdsMetricGrid>
        ) : dash ? (
          <OdsMetricGrid columns={4}>
            <OdsMetricCard
              title="Chargers Available"
              value={dash.chargersAvailable}
              icon={<Zap className="h-4 w-4 text-green-600" />}
              status="positive"
              footer={`of ${dash.totalChargers} total`}
            />
            <OdsMetricCard
              title="Chargers Busy"
              value={dash.chargersBusy}
              icon={<BatteryCharging className="h-4 w-4 text-blue-600" />}
              status="neutral"
              footer="active charging sessions"
            />
            <OdsMetricCard
              title="Batteries Charging"
              value={dash.batteriesCharging}
              icon={<BatteryCharging className="h-4 w-4 text-yellow-600" />}
              status="neutral"
            />
            <OdsMetricCard
              title="Waiting for Charger"
              value={dash.batteriesWaiting}
              icon={<Clock className="h-4 w-4 text-orange-600" />}
              status={dash.batteriesWaiting > 3 ? "warning" : "neutral"}
            />
            <OdsMetricCard
              title="Today's Completions"
              value={dash.todayCompletedCharges}
              icon={<CheckCircle2 className="h-4 w-4 text-teal-600" />}
              status="positive"
              footer="formation reports generated"
            />
            <OdsMetricCard
              title="Avg Charge Time"
              value={
                dash.avgChargeTimeMin != null
                  ? `${Math.floor(dash.avgChargeTimeMin / 60)}h ${dash.avgChargeTimeMin % 60}m`
                  : "—"
              }
              icon={<Clock className="h-4 w-4 text-purple-600" />}
              status="neutral"
              footer="across all completed charges"
            />
            <OdsMetricCard
              title="In Maintenance"
              value={dash.chargersMaintenance}
              icon={<AlertTriangle className="h-4 w-4 text-yellow-700" />}
              status={dash.chargersMaintenance > 0 ? "warning" : "neutral"}
            />
            <OdsMetricCard
              title="Total Chargers"
              value={dash.totalChargers}
              icon={<Zap className="h-4 w-4 text-slate-600" />}
              status="neutral"
            />
          </OdsMetricGrid>
        ) : null}

        {/* Charger Unit Status Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Charger Unit Status</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {unitsLoading ? (
              <div className="flex items-center justify-center py-10 text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />Loading...
              </div>
            ) : units.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">
                No chargers registered.{" "}
                <Link href="/manufacturing/chargers" className="text-yellow-600 hover:underline">
                  Register chargers
                </Link>
              </div>
            ) : (
              <div className="divide-y">
                {units.map((unit: any) => {
                  const cfg = CHARGER_STATUS_CONFIG[unit.status as keyof typeof CHARGER_STATUS_CONFIG]
                    ?? { label: unit.status, className: "bg-gray-100" };
                  return (
                    <div key={unit.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-gray-900">{unit.chargerCode}</span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${cfg.className}`}>
                            {cfg.label}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {unit.manufacturer} {unit.model} · S/N: {unit.serialNumber}
                        </p>
                      </div>
                      <div className="text-right text-xs text-gray-500 shrink-0">
                        <div>
                          {unit.outputVoltageV != null ? `${unit.outputVoltageV}V` : "—"} /{" "}
                          {unit.maxCurrentA != null ? `${unit.maxCurrentA}A` : "—"}
                        </div>
                        {unit.currentOrderId && (
                          <Link href={`/manufacturing/orders/${unit.currentOrderId}`}>
                            <span className="text-blue-600 hover:underline">View Order →</span>
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
