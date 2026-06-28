import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Gauge, PlayCircle, CheckCircle2, Loader2, Square, CheckSquare } from "lucide-react";
import { useStartStage, useCompleteStage } from "@workspace/api-client-react";
import { useOdsNotify } from "@/hooks/use-ods-notify";
import StageApprovalSection from "./StageApprovalSection";

interface OrderStage {
  id: string; stageType: string; stageOrder: number; status: string;
  operatorName?: string | null; notes?: string | null;
  stageData?: Record<string, unknown> | null;
  startedAt?: string | null; completedAt?: string | null; approvedAt?: string | null;
}
interface Props { orderId: string; stage: OrderStage; onRefresh: () => void; }

const CHECKLIST_ITEMS = [
  { key: "endPlateInstalled", label: "End Plate Installed" },
  { key: "compressionVerified", label: "Compression Verified" },
  { key: "boltTorqueVerified", label: "Bolt Torque Verified" },
  { key: "visualInspectionPassed", label: "Visual Inspection Passed" },
];

export default function CompressionCard({ orderId, stage, onRefresh }: Props) {
  const notify = useOdsNotify();
  const sd = (stage.stageData ?? {}) as Record<string, unknown>;

  const [operatorName, setOperatorName] = useState(stage.operatorName ?? "");
  const [torqueValue, setTorqueValue] = useState((sd.torqueValueNm as string | undefined) ?? "");
  const [checklist, setChecklist] = useState<Record<string, boolean>>({
    endPlateInstalled: !!(sd.endPlateInstalled),
    compressionVerified: !!(sd.compressionVerified),
    boltTorqueVerified: !!(sd.boltTorqueVerified),
    visualInspectionPassed: !!(sd.visualInspectionPassed),
  });

  const startStage = useStartStage();
  const completeStage = useCompleteStage();
  const isBusy = startStage.isPending || completeStage.isPending;

  const isReadOnly = stage.status === "approved" || stage.status === "completed";
  const isPending = stage.status === "pending";
  const isInProgress = stage.status === "in_progress";
  const allChecked = Object.values(checklist).every(Boolean);

  const toggle = (key: string) => {
    if (isReadOnly) return;
    setChecklist((c) => ({ ...c, [key]: !c[key] }));
  };

  const handleStart = async () => {
    if (!operatorName.trim()) { notify.error("Operator name required"); return; }
    try {
      await startStage.mutateAsync({ id: orderId, stage: "compression", data: { operatorName: operatorName.trim() } });
      notify.success("Compression stage started");
      onRefresh();
    } catch (e: any) {
      notify.error(e?.response?.data?.error ?? "Failed to start");
    }
  };

  const handleComplete = async () => {
    if (!operatorName.trim()) { notify.error("Operator name required"); return; }
    if (!allChecked) { notify.error("All checklist items must be verified"); return; }
    if (!torqueValue) { notify.error("Torque value required"); return; }
    try {
      await completeStage.mutateAsync({
        id: orderId, stage: "compression",
        data: {
          operatorName: operatorName.trim(),
          stageData: { ...checklist, torqueValueNm: torqueValue },
          notes: `Torque: ${torqueValue} Nm — all checks passed`,
        },
      });
      notify.success("Compression completed — awaiting approval");
      onRefresh();
    } catch (e: any) {
      notify.error(e?.response?.data?.error ?? "Failed to complete");
    }
  };

  return (
    <Card className="border-2 border-orange-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Gauge className="h-5 w-5 text-orange-600" />
            Stage 3: Compression
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
        {/* Checklist */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Compression Checklist</Label>
          <div className="space-y-2">
            {CHECKLIST_ITEMS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => toggle(item.key)}
                disabled={isReadOnly}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                  checklist[item.key]
                    ? "bg-green-50 border-green-300 text-green-800"
                    : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"
                } ${isReadOnly ? "cursor-default" : "cursor-pointer"}`}
              >
                {checklist[item.key]
                  ? <CheckSquare className="h-5 w-5 text-green-600 shrink-0" />
                  : <Square className="h-5 w-5 text-gray-400 shrink-0" />
                }
                <span className="text-base font-medium">{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Operator Name *</Label>
            <Input value={operatorName} onChange={(e) => setOperatorName(e.target.value)} disabled={isReadOnly || isInProgress} placeholder="Operator name" className="h-11 text-base" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Torque Value (Nm) *</Label>
            <Input type="number" step="0.1" value={torqueValue} onChange={(e) => setTorqueValue(e.target.value)} disabled={isReadOnly} placeholder="e.g. 8.5" className="h-11 text-base" />
          </div>
        </div>

        {isPending && (
          <Button onClick={handleStart} disabled={isBusy} className="w-full h-12 text-base font-semibold bg-blue-600 hover:bg-blue-700">
            {startStage.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <PlayCircle className="h-5 w-5 mr-2" />
            Start Compression
          </Button>
        )}
        {isInProgress && (
          <Button onClick={handleComplete} disabled={isBusy || !allChecked} className="w-full h-14 text-base font-semibold bg-orange-600 hover:bg-orange-700 disabled:opacity-50">
            {completeStage.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <CheckCircle2 className="h-5 w-5 mr-2" />
            Complete Compression {!allChecked && `(${Object.values(checklist).filter(Boolean).length}/4 checks)`}
          </Button>
        )}
        {stage.status === "approved" && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4" />
            Compression approved — torque: {sd.torqueValueNm as string ?? "—"} Nm
          </div>
        )}
        {stage.status === "completed" && (
          <StageApprovalSection orderId={orderId} stageKey="compression" existingNotes={stage.notes} onRefresh={onRefresh} />
        )}
      </CardContent>
    </Card>
  );
}
