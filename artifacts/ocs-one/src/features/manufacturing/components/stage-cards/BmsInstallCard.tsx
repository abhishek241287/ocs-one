import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Cpu, PlayCircle, CheckCircle2, Loader2, Wifi, Bluetooth, Radio } from "lucide-react";
import { useStartStage, useCompleteStage, useListBmsMasters } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import StageApprovalSection from "./StageApprovalSection";

interface OrderStage {
  id: string; stageType: string; stageOrder: number; status: string;
  operatorName?: string | null; notes?: string | null;
  stageData?: Record<string, unknown> | null;
  startedAt?: string | null; completedAt?: string | null; approvedAt?: string | null;
}
interface Props { orderId: string; stage: OrderStage; onRefresh: () => void; }

function BoolIcon({ value }: { value: boolean }) {
  return value
    ? <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">YES</span>
    : <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">NO</span>;
}

export default function BmsInstallCard({ orderId, stage, onRefresh }: Props) {
  const { toast } = useToast();
  const sd = (stage.stageData ?? {}) as Record<string, unknown>;

  const [selectedBmsId, setSelectedBmsId] = useState((sd.bmsId as string | undefined) ?? "");
  const [bmsSerialNumber, setBmsSerialNumber] = useState((sd.bmsSerialNumber as string | undefined) ?? "");
  const [operatorName, setOperatorName] = useState(stage.operatorName ?? "");
  const [installTime, setInstallTime] = useState((sd.installTime as string | undefined) ?? "");

  const startStage = useStartStage();
  const completeStage = useCompleteStage();
  const isBusy = startStage.isPending || completeStage.isPending;

  const { data: bmsData } = useListBmsMasters({ pageSize: 100, status: "active" });
  const bmsList = bmsData?.items ?? [];
  const selectedBms = bmsList.find((b) => b.id === selectedBmsId);

  const isReadOnly = stage.status === "approved" || stage.status === "completed";
  const isPending = stage.status === "pending";
  const isInProgress = stage.status === "in_progress";

  const handleStart = async () => {
    if (!operatorName.trim()) { toast({ title: "Operator name required", variant: "destructive" }); return; }
    if (!selectedBmsId) { toast({ title: "Select a BMS from inventory", variant: "destructive" }); return; }
    if (!bmsSerialNumber.trim()) { toast({ title: "BMS serial number required", variant: "destructive" }); return; }
    try {
      await startStage.mutateAsync({
        id: orderId, stage: "bms_allocation",
        data: {
          operatorName: operatorName.trim(),
          notes: `Installing ${selectedBms ? `${selectedBms.manufacturer} ${selectedBms.model}` : selectedBmsId} S/N: ${bmsSerialNumber}`,
        },
      });
      toast({ title: "BMS Installation stage started" });
      onRefresh();
    } catch (e: any) {
      toast({ title: e?.response?.data?.error ?? "Failed to start", variant: "destructive" });
    }
  };

  const handleComplete = async () => {
    if (!operatorName.trim()) { toast({ title: "Operator name required", variant: "destructive" }); return; }
    if (!selectedBmsId) { toast({ title: "BMS selection required", variant: "destructive" }); return; }
    if (!bmsSerialNumber.trim()) { toast({ title: "BMS serial number required", variant: "destructive" }); return; }
    try {
      await completeStage.mutateAsync({
        id: orderId, stage: "bms_allocation",
        data: {
          operatorName: operatorName.trim(),
          stageData: {
            bmsId: selectedBmsId,
            bmsModel: selectedBms ? `${selectedBms.manufacturer} ${selectedBms.model}` : "",
            bmsSerialNumber,
            firmwareVersion: selectedBms?.firmware_version ?? null,
            hasBluetooth: selectedBms?.has_bluetooth ?? false,
            hasCan: selectedBms?.has_can ?? false,
            hasUart: selectedBms?.has_uart ?? false,
            hasRs485: selectedBms?.has_rs485 ?? false,
            installTime,
          },
          notes: `BMS S/N ${bmsSerialNumber} installed`,
        },
      });
      toast({ title: "BMS Installation completed — awaiting approval" });
      onRefresh();
    } catch (e: any) {
      toast({ title: e?.response?.data?.error ?? "Failed to complete", variant: "destructive" });
    }
  };

  return (
    <Card className="border-2 border-orange-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Cpu className="h-5 w-5 text-orange-600" />
            Stage 4: BMS Installation
          </CardTitle>
          <Badge className={
            stage.status === "approved" ? "bg-green-100 text-green-800" :
            stage.status === "completed" ? "bg-yellow-100 text-yellow-800" :
            stage.status === "in_progress" ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-600"
          }>{stage.status.replace(/_/g, " ")}</Badge>
        </div>
        {(stage.startedAt || stage.completedAt || stage.approvedAt) && (
          <div className="grid grid-cols-3 gap-3 text-xs text-gray-500 pt-1">
            <div><span className="block font-medium text-gray-600">Started</span>{stage.startedAt ? new Date(stage.startedAt).toLocaleString() : "—"}</div>
            <div><span className="block font-medium text-gray-600">Completed</span>{stage.completedAt ? new Date(stage.completedAt).toLocaleString() : "—"}</div>
            <div><span className="block font-medium text-gray-600">Approved</span>{stage.approvedAt ? new Date(stage.approvedAt).toLocaleString() : "—"}</div>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-5">
        {/* BMS Picker */}
        {!isReadOnly && (
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Select BMS from Inventory *</Label>
            <Select value={selectedBmsId} onValueChange={setSelectedBmsId} disabled={isInProgress}>
              <SelectTrigger className="h-11 text-base">
                <SelectValue placeholder="Choose BMS model..." />
              </SelectTrigger>
              <SelectContent>
                {bmsList.map((bms) => (
                  <SelectItem key={bms.id} value={bms.id}>
                    {bms.manufacturer} {bms.model} — {bms.cell_support_count}S — FW: {bms.firmware_version ?? "N/A"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* BMS Specs Preview */}
        {selectedBms && (
          <div className="rounded-lg border bg-blue-50 border-blue-200 p-4 space-y-3">
            <p className="text-sm font-semibold text-blue-900">{selectedBms.manufacturer} {selectedBms.model}</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-gray-500">Firmware</span><br /><span className="font-mono font-medium">{selectedBms.firmware_version ?? "—"}</span></div>
              <div><span className="text-gray-500">Cell Support</span><br /><span className="font-medium">{selectedBms.cell_support_count}S</span></div>
              <div><span className="text-gray-500">Current Rating</span><br /><span className="font-medium">{selectedBms.current_rating_a}A</span></div>
              <div><span className="text-gray-500">Voltage Range</span><br /><span className="font-medium">{selectedBms.min_voltage_v}–{selectedBms.max_voltage_v}V</span></div>
            </div>
            <div className="flex gap-3 flex-wrap text-xs">
              <span className="flex items-center gap-1"><Bluetooth className="h-3 w-3" /> Bluetooth <BoolIcon value={!!selectedBms.has_bluetooth} /></span>
              <span className="flex items-center gap-1"><Wifi className="h-3 w-3" /> CAN <BoolIcon value={!!selectedBms.has_can} /></span>
              <span className="flex items-center gap-1"><Radio className="h-3 w-3" /> UART <BoolIcon value={!!selectedBms.has_uart} /></span>
              <span className="flex items-center gap-1"><Radio className="h-3 w-3" /> RS485 <BoolIcon value={!!selectedBms.has_rs485} /></span>
            </div>
          </div>
        )}

        {/* Read-only BMS info if already saved */}
        {isReadOnly && !!sd.bmsModel && !selectedBms && (
          <div className="rounded-lg border bg-blue-50 border-blue-200 p-4">
            <p className="text-sm font-semibold text-blue-900">{String(sd.bmsModel)}</p>
            <p className="text-xs text-gray-500 mt-1">S/N: {String(sd.bmsSerialNumber ?? "—")} | FW: {String(sd.firmwareVersion ?? "—")}</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">BMS Serial Number *</Label>
            <Input value={bmsSerialNumber} onChange={(e) => setBmsSerialNumber(e.target.value)} disabled={isReadOnly} placeholder="e.g. BMS-2026-0001" className="h-11 text-base" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Operator Name *</Label>
            <Input value={operatorName} onChange={(e) => setOperatorName(e.target.value)} disabled={isReadOnly || isInProgress} placeholder="Operator name" className="h-11 text-base" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Install Time</Label>
            <Input type="time" value={installTime} onChange={(e) => setInstallTime(e.target.value)} disabled={isReadOnly} className="h-11 text-base" />
          </div>
        </div>

        {isPending && (
          <Button onClick={handleStart} disabled={isBusy} className="w-full h-12 text-base font-semibold bg-blue-600 hover:bg-blue-700">
            {startStage.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <PlayCircle className="h-5 w-5 mr-2" />
            Start BMS Installation
          </Button>
        )}
        {isInProgress && (
          <Button onClick={handleComplete} disabled={isBusy} className="w-full h-14 text-base font-semibold bg-orange-600 hover:bg-orange-700">
            {completeStage.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <CheckCircle2 className="h-5 w-5 mr-2" />
            Install BMS
          </Button>
        )}
        {stage.status === "approved" && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4" />
            BMS installed — logged to genealogy
          </div>
        )}
        {stage.status === "completed" && (
          <StageApprovalSection orderId={orderId} stageKey="bms_allocation" existingNotes={stage.notes} onRefresh={onRefresh} />
        )}
      </CardContent>
    </Card>
  );
}
