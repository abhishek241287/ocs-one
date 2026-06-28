import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Zap, PlayCircle, PauseCircle, RotateCcw, CheckCircle2,
  Loader2, Thermometer, BatteryCharging, Info,
} from "lucide-react";
import {
  useStartStage, useCompleteStage,
  usePauseStage, useResumeStage,
  useListChargerUnits,
} from "@workspace/api-client-react";
import { useOdsNotify } from "@/hooks/use-ods-notify";
import StageApprovalSection from "./StageApprovalSection";

interface OrderStage {
  id: string; stageType: string; stageOrder: number; status: string;
  operatorName?: string | null; notes?: string | null;
  stageData?: Record<string, unknown> | null;
  startedAt?: string | null; pausedAt?: string | null;
  resumedAt?: string | null; completedAt?: string | null; approvedAt?: string | null;
}

interface Props { orderId: string; stage: OrderStage; onRefresh: () => void; }

function balancingBadge(status: string | null | undefined) {
  if (!status) return null;
  const map: Record<string, { label: string; className: string }> = {
    pass: { label: "✓ Pass", className: "bg-green-100 text-green-800 border-green-300" },
    warning: { label: "⚠ Warning", className: "bg-yellow-100 text-yellow-800 border-yellow-300" },
    fail: { label: "✗ Fail", className: "bg-red-100 text-red-800 border-red-300" },
  };
  const b = map[status];
  if (!b) return null;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${b.className}`}>
      {b.label}
    </span>
  );
}

export default function ChargingCard({ orderId, stage, onRefresh }: Props) {
  const notify = useOdsNotify();
  const sd = (stage.stageData ?? {}) as Record<string, unknown>;

  const [operatorName, setOperatorName] = useState(stage.operatorName ?? "");
  const [chargerUnitId, setChargerUnitId] = useState((sd.chargerUnitId as string) ?? "");
  const [chargingCurrentA, setChargingCurrentA] = useState((sd.chargingCurrentA as string) ?? "30");
  const [startVoltageV, setStartVoltageV] = useState((sd.startVoltageV as string) ?? "");
  const [finalVoltageV, setFinalVoltageV] = useState((sd.finalVoltageV as string) ?? "");
  const [finalCurrentA, setFinalCurrentA] = useState((sd.finalCurrentA as string) ?? "");
  const [ambientTempC, setAmbientTempC] = useState((sd.ambientTempC as string) ?? "");
  const [batteryTempC, setBatteryTempC] = useState((sd.batteryTempC as string) ?? "");
  const [chargeStartTime, setChargeStartTime] = useState((sd.chargeStartTime as string) ?? "");
  const [chargeEndTime, setChargeEndTime] = useState((sd.chargeEndTime as string) ?? "");
  const [remarks, setRemarks] = useState((sd.remarks as string) ?? "");

  // Top balancing
  const [topBalancingRequired, setTopBalancingRequired] = useState(!!(sd.topBalancingRequired));
  const [topBalancingStartAt, setTopBalancingStartAt] = useState((sd.topBalancingStartAt as string) ?? "");
  const [topBalancingEndAt, setTopBalancingEndAt] = useState((sd.topBalancingEndAt as string) ?? "");
  const [maxCellVoltageV, setMaxCellVoltageV] = useState((sd.maxCellVoltageV as string) ?? "");
  const [minCellVoltageV, setMinCellVoltageV] = useState((sd.minCellVoltageV as string) ?? "");

  const startStage = useStartStage();
  const completeStage = useCompleteStage();
  const pauseStage = usePauseStage();
  const resumeStage = useResumeStage();
  const isBusy = startStage.isPending || completeStage.isPending || pauseStage.isPending || resumeStage.isPending;

  const { data: chargerUnitsData } = useListChargerUnits({ status: "available" });
  const availableChargers = chargerUnitsData?.items ?? [];

  const isReadOnly = stage.status === "approved" || stage.status === "completed";
  const isPending = stage.status === "pending";
  const isInProgress = stage.status === "in_progress";
  const isPaused = stage.status === "paused";

  // Calculate voltage diff live
  const maxV = parseFloat(maxCellVoltageV || "0");
  const minV = parseFloat(minCellVoltageV || "0");
  const voltageDiffMv = maxV > 0 && minV > 0 ? Math.round((maxV - minV) * 1000) : null;
  const balancingStatus =
    voltageDiffMv === null ? null
    : voltageDiffMv <= 20 ? "pass"
    : voltageDiffMv <= 50 ? "warning"
    : "fail";

  const getStageData = () => ({
    chargerUnitId,
    chargerCode: availableChargers.find((c: any) => c.id === chargerUnitId)?.chargerCode
      ?? (sd.chargerCode as string | undefined) ?? "",
    chargingCurrentA,
    startVoltageV,
    finalVoltageV,
    finalCurrentA,
    ambientTempC,
    batteryTempC,
    chargeStartTime,
    chargeEndTime,
    remarks,
    topBalancingRequired,
    topBalancingStartAt,
    topBalancingEndAt,
    maxCellVoltageV,
    minCellVoltageV,
    finalCellVoltageSpreadMv: voltageDiffMv != null ? String(voltageDiffMv) : "",
  });

  const handleStart = async () => {
    if (!operatorName.trim()) { notify.error("Operator name required"); return; }
    if (!chargerUnitId) { notify.error("Select a charger"); return; }
    const now = new Date().toISOString();
    const stageData = { ...getStageData(), chargeStartTime: chargeStartTime || now };
    try {
      await startStage.mutateAsync({
        id: orderId, stage: "charging",
        data: { operatorName: operatorName.trim(), stageData },
      });
      notify.success("Charging started — charger reserved");
      onRefresh();
    } catch (e: any) {
      notify.error(e?.response?.data?.error ?? "Failed to start charging");
    }
  };

  const handlePause = async () => {
    if (!operatorName.trim()) { notify.error("Operator name required"); return; }
    try {
      await pauseStage.mutateAsync({
        id: orderId, stage: "charging",
        data: { operatorName: operatorName.trim() },
      });
      notify.success("Charging paused");
      onRefresh();
    } catch (e: any) {
      notify.error(e?.response?.data?.error ?? "Failed to pause");
    }
  };

  const handleResume = async () => {
    if (!operatorName.trim()) { notify.error("Operator name required"); return; }
    try {
      await resumeStage.mutateAsync({
        id: orderId, stage: "charging",
        data: { operatorName: operatorName.trim() },
      });
      notify.success("Charging resumed");
      onRefresh();
    } catch (e: any) {
      notify.error(e?.response?.data?.error ?? "Failed to resume");
    }
  };

  const handleComplete = async () => {
    if (!operatorName.trim()) { notify.error("Operator name required"); return; }
    if (!finalVoltageV) { notify.error("Final voltage required"); return; }
    const now = new Date().toISOString();
    const stageData = { ...getStageData(), chargeEndTime: chargeEndTime || now };
    try {
      await completeStage.mutateAsync({
        id: orderId, stage: "charging",
        data: {
          operatorName: operatorName.trim(),
          stageData,
          notes: `Charging complete — Final: ${finalVoltageV}V @ ${chargingCurrentA}A${topBalancingRequired ? `, Balancing: ${balancingStatus ?? "—"}` : ""}`,
        },
      });
      notify.success("Charging complete — Formation Report generated");
      onRefresh();
    } catch (e: any) {
      notify.error(e?.response?.data?.error ?? "Failed to complete");
    }
  };

  const chargerInfo = (id: string) => {
    const c = availableChargers.find((x: any) => x.id === id) as any;
    if (!c) return null;
    return `${c.manufacturer} ${c.model} — ${c.maxCurrentA}A / ${c.outputVoltageV}V`;
  };

  return (
    <Card className="border-2 border-yellow-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-600" />
            Stage 6: Charging & Formation
          </CardTitle>
          <Badge className={
            stage.status === "approved" ? "bg-green-100 text-green-800" :
            stage.status === "completed" ? "bg-yellow-100 text-yellow-800" :
            stage.status === "in_progress" ? "bg-blue-100 text-blue-800" :
            stage.status === "paused" ? "bg-orange-100 text-orange-800" :
            "bg-gray-100 text-gray-600"
          }>{stage.status.replace(/_/g, " ")}</Badge>
        </div>
        <div className="grid grid-cols-4 gap-3 text-xs text-gray-500 pt-1">
          <div><span className="block font-medium text-gray-600">Started</span>{stage.startedAt ? new Date(stage.startedAt).toLocaleString() : "—"}</div>
          <div><span className="block font-medium text-gray-600">Paused</span>{(stage as any).pausedAt ? new Date((stage as any).pausedAt).toLocaleString() : "—"}</div>
          <div><span className="block font-medium text-gray-600">Completed</span>{stage.completedAt ? new Date(stage.completedAt).toLocaleString() : "—"}</div>
          <div><span className="block font-medium text-gray-600">Approved</span>{stage.approvedAt ? new Date(stage.approvedAt).toLocaleString() : "—"}</div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Operator + Charger */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Operator *</Label>
            <Input
              value={operatorName}
              onChange={(e) => setOperatorName(e.target.value)}
              disabled={isReadOnly || isInProgress || isPaused}
              placeholder="Operator name"
              className="h-11 text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Charger Unit *</Label>
            {isPending ? (
              <Select value={chargerUnitId} onValueChange={setChargerUnitId}>
                <SelectTrigger className="h-11 text-base">
                  <SelectValue placeholder="Select available charger..." />
                </SelectTrigger>
                <SelectContent>
                  {availableChargers.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.chargerCode} — {c.manufacturer} {c.model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={String(sd.chargerCode ?? chargerUnitId ?? "—")}
                disabled
                className="h-11 text-base bg-gray-50"
              />
            )}
            {chargerUnitId && isPending && (
              <p className="text-xs text-gray-500">{chargerInfo(chargerUnitId)}</p>
            )}
          </div>
        </div>

        {/* Charging Parameters */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
            <BatteryCharging className="h-4 w-4 text-yellow-600" />
            Charging Parameters
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600">Charging Current (A)</Label>
              <Input type="number" value={chargingCurrentA} onChange={(e) => setChargingCurrentA(e.target.value)} disabled={isReadOnly} placeholder="30" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600">Start Voltage (V)</Label>
              <Input type="number" step="0.01" value={startVoltageV} onChange={(e) => setStartVoltageV(e.target.value)} disabled={isReadOnly} placeholder="e.g. 3.20" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600">Final Voltage (V) *</Label>
              <Input type="number" step="0.01" value={finalVoltageV} onChange={(e) => setFinalVoltageV(e.target.value)} disabled={isReadOnly} placeholder="e.g. 3.65" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600">Final Current (A)</Label>
              <Input type="number" step="0.01" value={finalCurrentA} onChange={(e) => setFinalCurrentA(e.target.value)} disabled={isReadOnly} placeholder="e.g. 0.5" className="h-10" />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600">Start Time</Label>
              <Input type="datetime-local" value={chargeStartTime.slice(0, 16)} onChange={(e) => setChargeStartTime(e.target.value ? new Date(e.target.value).toISOString() : "")} disabled={isReadOnly} className="h-10 text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600">End Time</Label>
              <Input type="datetime-local" value={chargeEndTime.slice(0, 16)} onChange={(e) => setChargeEndTime(e.target.value ? new Date(e.target.value).toISOString() : "")} disabled={isReadOnly} className="h-10 text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600 flex items-center gap-1"><Thermometer className="h-3 w-3" />Ambient Temp (°C)</Label>
              <Input type="number" step="0.1" value={ambientTempC} onChange={(e) => setAmbientTempC(e.target.value)} disabled={isReadOnly} placeholder="e.g. 25.0" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600 flex items-center gap-1"><Thermometer className="h-3 w-3 text-red-400" />Battery Temp (°C)</Label>
              <Input type="number" step="0.1" value={batteryTempC} onChange={(e) => setBatteryTempC(e.target.value)} disabled={isReadOnly} placeholder="e.g. 32.0" className="h-10" />
            </div>
          </div>
        </div>

        <Separator />

        {/* Top Balancing */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-700">Top Balancing</h4>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-gray-600">Required</Label>
              <Switch
                checked={topBalancingRequired}
                onCheckedChange={setTopBalancingRequired}
                disabled={isReadOnly}
              />
            </div>
          </div>
          {topBalancingRequired && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-gray-600">Balancing Start</Label>
                  <Input type="datetime-local" value={topBalancingStartAt.slice(0, 16)} onChange={(e) => setTopBalancingStartAt(e.target.value ? new Date(e.target.value).toISOString() : "")} disabled={isReadOnly} className="h-10 text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-gray-600">Balancing End</Label>
                  <Input type="datetime-local" value={topBalancingEndAt.slice(0, 16)} onChange={(e) => setTopBalancingEndAt(e.target.value ? new Date(e.target.value).toISOString() : "")} disabled={isReadOnly} className="h-10 text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-gray-600">Max Cell Voltage (V)</Label>
                  <Input type="number" step="0.001" value={maxCellVoltageV} onChange={(e) => setMaxCellVoltageV(e.target.value)} disabled={isReadOnly} placeholder="e.g. 3.652" className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-gray-600">Min Cell Voltage (V)</Label>
                  <Input type="number" step="0.001" value={minCellVoltageV} onChange={(e) => setMinCellVoltageV(e.target.value)} disabled={isReadOnly} placeholder="e.g. 3.648" className="h-10" />
                </div>
              </div>
              {voltageDiffMv !== null && (
                <div className="flex items-center gap-4 pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600">Voltage Spread:</span>
                    <span className="text-sm font-bold font-mono">{voltageDiffMv} mV</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600">Status:</span>
                    {balancingBadge(balancingStatus)}
                  </div>
                  <div className="ml-auto text-xs text-gray-400">
                    ≤20 mV Pass • ≤50 mV Warning • &gt;50 mV Fail
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Remarks */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Remarks</Label>
          <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} disabled={isReadOnly} placeholder="Any observations, anomalies, or notes..." className="h-10" />
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3 pt-1">
          {isPending && (
            <Button onClick={handleStart} disabled={isBusy} className="h-12 px-6 text-sm font-semibold bg-blue-600 hover:bg-blue-700">
              {startStage.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <PlayCircle className="h-5 w-5 mr-2" />
              Start Charging
            </Button>
          )}
          {isInProgress && (
            <>
              <Button onClick={handlePause} disabled={isBusy} variant="outline" className="h-12 px-5 text-sm font-semibold border-orange-300 text-orange-700 hover:bg-orange-50">
                {pauseStage.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <PauseCircle className="h-5 w-5 mr-2" />
                Pause Charging
              </Button>
              <Button onClick={handleComplete} disabled={isBusy} className="h-12 px-6 text-sm font-semibold bg-green-600 hover:bg-green-700">
                {completeStage.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <CheckCircle2 className="h-5 w-5 mr-2" />
                Complete Charging
              </Button>
            </>
          )}
          {isPaused && (
            <>
              <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg text-orange-800 text-sm font-medium">
                <PauseCircle className="h-4 w-4" />
                Charging Paused
              </div>
              <Button onClick={handleResume} disabled={isBusy} className="h-12 px-5 text-sm font-semibold bg-blue-600 hover:bg-blue-700">
                {resumeStage.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <RotateCcw className="h-5 w-5 mr-2" />
                Resume Charging
              </Button>
              <Button onClick={handleComplete} disabled={isBusy} className="h-12 px-6 text-sm font-semibold bg-green-600 hover:bg-green-700">
                {completeStage.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <CheckCircle2 className="h-5 w-5 mr-2" />
                Complete Charging
              </Button>
            </>
          )}
        </div>

        {stage.status === "completed" && (
          <>
            <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm">
              <Info className="h-4 w-4" />
              Formation Report generated — awaiting supervisor approval.
            </div>
            <StageApprovalSection orderId={orderId} stageKey="charging" existingNotes={stage.notes} onRefresh={onRefresh} />
          </>
        )}
        {stage.status === "approved" && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4" />
            Charging & Formation approved — battery cleared for Testing
            {topBalancingRequired && balancingBadge(String(sd.balancingStatus ?? balancingStatus ?? ""))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
