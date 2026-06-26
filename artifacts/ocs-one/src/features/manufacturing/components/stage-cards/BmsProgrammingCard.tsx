import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Code2, PlayCircle, CheckCircle2, Loader2, Square, CheckSquare } from "lucide-react";
import { useStartStage, useCompleteStage } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import StageApprovalSection from "./StageApprovalSection";

interface OrderStage {
  id: string; stageType: string; stageOrder: number; status: string;
  operatorName?: string | null; notes?: string | null;
  stageData?: Record<string, unknown> | null;
  startedAt?: string | null; completedAt?: string | null; approvedAt?: string | null;
}
interface Props { orderId: string; stage: OrderStage; onRefresh: () => void; }

const COMM_TESTS = [
  { key: "canCommunicationOk", label: "CAN Communication" },
  { key: "bluetoothPairingOk", label: "Bluetooth Pairing" },
  { key: "balancingEnabled", label: "Cell Balancing Enabled" },
  { key: "mosFetTestPassed", label: "MOS FET Test Passed" },
];

export default function BmsProgrammingCard({ orderId, stage, onRefresh }: Props) {
  const { toast } = useToast();
  const sd = (stage.stageData ?? {}) as Record<string, unknown>;

  const [operatorName, setOperatorName] = useState(stage.operatorName ?? "");
  const [firmwareVersion, setFirmwareVersion] = useState((sd.firmwareVersion as string | undefined) ?? "");
  const [programmingResult, setProgrammingResult] = useState((sd.programmingResult as string | undefined) ?? "");
  const [programmingTime, setProgrammingTime] = useState((sd.programmingTime as string | undefined) ?? "");
  const [tests, setTests] = useState<Record<string, boolean>>({
    canCommunicationOk: !!(sd.canCommunicationOk),
    bluetoothPairingOk: !!(sd.bluetoothPairingOk),
    balancingEnabled: !!(sd.balancingEnabled),
    mosFetTestPassed: !!(sd.mosFetTestPassed),
  });

  const startStage = useStartStage();
  const completeStage = useCompleteStage();
  const isBusy = startStage.isPending || completeStage.isPending;

  const isReadOnly = stage.status === "approved" || stage.status === "completed";
  const isPending = stage.status === "pending";
  const isInProgress = stage.status === "in_progress";
  const allPassed = Object.values(tests).every(Boolean);

  const toggle = (key: string) => {
    if (isReadOnly) return;
    setTests((t) => ({ ...t, [key]: !t[key] }));
  };

  const handleStart = async () => {
    if (!operatorName.trim()) { toast({ title: "Operator name required", variant: "destructive" }); return; }
    try {
      await startStage.mutateAsync({ id: orderId, stage: "bms_programming", data: { operatorName: operatorName.trim() } });
      toast({ title: "BMS Programming stage started" });
      onRefresh();
    } catch (e: any) {
      toast({ title: e?.response?.data?.error ?? "Failed to start", variant: "destructive" });
    }
  };

  const handleComplete = async () => {
    if (!operatorName.trim()) { toast({ title: "Operator name required", variant: "destructive" }); return; }
    if (!programmingResult) { toast({ title: "Programming result required", variant: "destructive" }); return; }
    if (programmingResult === "pass" && !allPassed) { toast({ title: "All communication tests must pass", variant: "destructive" }); return; }
    try {
      await completeStage.mutateAsync({
        id: orderId, stage: "bms_programming",
        data: {
          operatorName: operatorName.trim(),
          stageData: { firmwareVersion, programmingResult, programmingTime, ...tests },
          notes: `Programming ${programmingResult === "pass" ? "PASSED" : "FAILED"} — FW: ${firmwareVersion}`,
        },
      });
      toast({ title: "BMS Programming completed — awaiting approval" });
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
            <Code2 className="h-5 w-5 text-orange-600" />
            Stage 5: BMS Programming
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Firmware Version</Label>
            <Input value={firmwareVersion} onChange={(e) => setFirmwareVersion(e.target.value)} disabled={isReadOnly} placeholder="e.g. v2.4.1" className="h-11 text-base font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Programming Result *</Label>
            <Select value={programmingResult} onValueChange={setProgrammingResult} disabled={isReadOnly}>
              <SelectTrigger className="h-11 text-base">
                <SelectValue placeholder="Select result..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pass">✓ Pass</SelectItem>
                <SelectItem value="fail">✗ Fail</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Programming Time</Label>
            <Input type="time" value={programmingTime} onChange={(e) => setProgrammingTime(e.target.value)} disabled={isReadOnly} className="h-11 text-base" />
          </div>
        </div>

        {/* Communication Tests */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Communication & Function Tests</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {COMM_TESTS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => toggle(item.key)}
                disabled={isReadOnly}
                className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                  tests[item.key]
                    ? "bg-green-50 border-green-300 text-green-800"
                    : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"
                } ${isReadOnly ? "cursor-default" : "cursor-pointer"}`}
              >
                {tests[item.key]
                  ? <CheckSquare className="h-5 w-5 text-green-600 shrink-0" />
                  : <Square className="h-5 w-5 text-gray-400 shrink-0" />
                }
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Operator Name *</Label>
          <Input value={operatorName} onChange={(e) => setOperatorName(e.target.value)} disabled={isReadOnly || isInProgress} placeholder="Operator name" className="h-11 text-base" />
        </div>

        {isPending && (
          <Button onClick={handleStart} disabled={isBusy} className="w-full h-12 text-base font-semibold bg-blue-600 hover:bg-blue-700">
            {startStage.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <PlayCircle className="h-5 w-5 mr-2" />
            Start BMS Programming
          </Button>
        )}
        {isInProgress && (
          <Button onClick={handleComplete} disabled={isBusy} className="w-full h-14 text-base font-semibold bg-orange-600 hover:bg-orange-700">
            {completeStage.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <CheckCircle2 className="h-5 w-5 mr-2" />
            Complete Programming
          </Button>
        )}
        {stage.status === "approved" && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4" />
            BMS Programming approved — {Object.values(tests).filter(Boolean).length}/{COMM_TESTS.length} tests passed
          </div>
        )}
        {stage.status === "completed" && (
          <StageApprovalSection orderId={orderId} stageKey="bms_programming" existingNotes={stage.notes} onRefresh={onRefresh} />
        )}
      </CardContent>
    </Card>
  );
}
