import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Wrench, PlayCircle, CheckCircle2, Loader2 } from "lucide-react";
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
    </div>
  );
}

export default function AssemblyCard({ orderId, stage, onRefresh }: Props) {
  const { toast } = useToast();
  const sd = (stage.stageData ?? {}) as Record<string, string>;

  const [form, setForm] = useState({
    operatorName: stage.operatorName ?? "",
    assemblyDate: sd.assemblyDate ?? new Date().toISOString().slice(0, 10),
    assemblyStartTime: sd.assemblyStartTime ?? "",
    assemblyEndTime: sd.assemblyEndTime ?? "",
    cabinetSerialNumber: sd.cabinetSerialNumber ?? "",
    busbarBatch: sd.busbarBatch ?? "",
    connectorBatch: sd.connectorBatch ?? "",
    notes: stage.notes ?? "",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const startStage = useStartStage();
  const completeStage = useCompleteStage();
  const isBusy = startStage.isPending || completeStage.isPending;

  const isReadOnly = stage.status === "approved" || stage.status === "completed";
  const isPending = stage.status === "pending";
  const isInProgress = stage.status === "in_progress";

  const handleStart = async () => {
    if (!form.operatorName.trim()) { toast({ title: "Operator name required", variant: "destructive" }); return; }
    try {
      await startStage.mutateAsync({
        id: orderId, stage: "assembly",
        data: { operatorName: form.operatorName.trim(), notes: form.notes || null },
      });
      toast({ title: "Assembly stage started" });
      onRefresh();
    } catch (e: any) {
      toast({ title: e?.response?.data?.error ?? "Failed to start", variant: "destructive" });
    }
  };

  const handleComplete = async () => {
    if (!form.operatorName.trim()) { toast({ title: "Operator name required", variant: "destructive" }); return; }
    if (!form.cabinetSerialNumber.trim()) { toast({ title: "Cabinet serial number required", variant: "destructive" }); return; }
    try {
      await completeStage.mutateAsync({
        id: orderId, stage: "assembly",
        data: {
          operatorName: form.operatorName.trim(),
          notes: form.notes || null,
          stageData: {
            assemblyDate: form.assemblyDate,
            assemblyStartTime: form.assemblyStartTime,
            assemblyEndTime: form.assemblyEndTime,
            cabinetSerialNumber: form.cabinetSerialNumber,
            busbarBatch: form.busbarBatch,
            connectorBatch: form.connectorBatch,
          },
        },
      });
      toast({ title: "Assembly completed — awaiting approval" });
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
            <Wrench className="h-5 w-5 text-orange-600" />
            Stage 2: Assembly
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

      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Assembly Operator *">
            <Input value={form.operatorName} onChange={set("operatorName")} disabled={isReadOnly || isInProgress} placeholder="Operator name" className="h-11 text-base" />
          </Field>
          <Field label="Assembly Date">
            <Input type="date" value={form.assemblyDate} onChange={set("assemblyDate")} disabled={isReadOnly} className="h-11 text-base" />
          </Field>
          <Field label="Assembly Start Time">
            <Input type="time" value={form.assemblyStartTime} onChange={set("assemblyStartTime")} disabled={isReadOnly} className="h-11 text-base" />
          </Field>
          <Field label="Assembly End Time">
            <Input type="time" value={form.assemblyEndTime} onChange={set("assemblyEndTime")} disabled={isReadOnly} className="h-11 text-base" />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Cabinet Serial Number *">
            <Input value={form.cabinetSerialNumber} onChange={set("cabinetSerialNumber")} disabled={isReadOnly} placeholder="e.g. CAB-2026-0001" className="h-11 text-base" />
          </Field>
          <Field label="Busbar Batch">
            <Input value={form.busbarBatch} onChange={set("busbarBatch")} disabled={isReadOnly} placeholder="e.g. BB-2026-01" className="h-11 text-base" />
          </Field>
          <Field label="Connector Batch">
            <Input value={form.connectorBatch} onChange={set("connectorBatch")} disabled={isReadOnly} placeholder="e.g. CON-2026-01" className="h-11 text-base" />
          </Field>
        </div>

        <Field label="Assembly Notes">
          <Textarea value={form.notes} onChange={set("notes")} disabled={isReadOnly} placeholder="Any observations during assembly..." rows={3} />
        </Field>

        {isPending && (
          <Button onClick={handleStart} disabled={isBusy} className="w-full h-12 text-base font-semibold bg-blue-600 hover:bg-blue-700">
            {startStage.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <PlayCircle className="h-5 w-5 mr-2" />
            Start Assembly
          </Button>
        )}
        {isInProgress && (
          <Button onClick={handleComplete} disabled={isBusy} className="w-full h-14 text-base font-semibold bg-orange-600 hover:bg-orange-700">
            {completeStage.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <CheckCircle2 className="h-5 w-5 mr-2" />
            Complete Assembly
          </Button>
        )}
        {stage.status === "approved" && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4" />
            Assembly approved — components logged to genealogy
          </div>
        )}
        {stage.status === "completed" && (
          <StageApprovalSection orderId={orderId} stageKey="assembly" existingNotes={stage.notes} onRefresh={onRefresh} />
        )}
      </CardContent>
    </Card>
  );
}
