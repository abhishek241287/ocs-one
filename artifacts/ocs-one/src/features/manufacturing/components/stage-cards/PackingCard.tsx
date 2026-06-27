import { useState } from "react";
import {
  useStartStage,
  useCompleteStage,
  useApproveStage,
  useRejectStage,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  PlayCircle, CheckCircle2, ThumbsUp, ThumbsDown, Loader2, Package,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface OrderStage {
  id: string; stageType: string; stageOrder: number; status: string;
  operatorName?: string | null; supervisorName?: string | null;
  startedAt?: string | null; completedAt?: string | null; approvedAt?: string | null;
  notes?: string | null; stageData?: Record<string, unknown> | null;
}

interface Props { orderId: string; stage: OrderStage; onRefresh: () => void; }

const CHECKLIST_ITEMS = [
  { key: "warrantyCard", label: "Warranty Card" },
  { key: "userManual", label: "User Manual" },
  { key: "connectingCable", label: "Connecting Cable" },
  { key: "mountingBolts", label: "Mounting Bolts" },
  { key: "supportAccessories", label: "Support Accessories" },
  { key: "finalVisualInspection", label: "Final Visual Inspection" },
];

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-gray-100 text-gray-600" },
  in_progress: { label: "In Progress", className: "bg-blue-100 text-blue-700" },
  completed: { label: "Completed", className: "bg-yellow-100 text-yellow-700" },
  approved: { label: "Approved", className: "bg-green-100 text-green-700" },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-700" },
};

const sd = (stage: OrderStage) => (stage.stageData ?? {}) as Record<string, unknown>;

export default function PackingCard({ orderId, stage, onRefresh }: Props) {
  const { toast } = useToast();
  const existingData = sd(stage);

  const [operatorName, setOperatorName] = useState(stage.operatorName ?? "");
  const [supervisorName, setSupervisorName] = useState(stage.supervisorName ?? "");
  const [packingDate, setPackingDate] = useState(String(existingData.packingDate ?? new Date().toISOString().split("T")[0]));
  const [boxNumber, setBoxNumber] = useState(String(existingData.boxNumber ?? ""));
  const [boxType, setBoxType] = useState(String(existingData.boxType ?? "Standard"));
  const [grossWeight, setGrossWeight] = useState(String(existingData.grossWeightKg ?? ""));
  const [netWeight, setNetWeight] = useState(String(existingData.netWeightKg ?? ""));
  const [batteryPhotoUrl, setBatteryPhotoUrl] = useState(String(existingData.batteryPhotoUrl ?? ""));
  const [boxPhotoUrl, setBoxPhotoUrl] = useState(String(existingData.boxPhotoUrl ?? ""));
  const [notes, setNotes] = useState(stage.notes ?? "");
  const [rejectNotes, setRejectNotes] = useState("");
  const [showReject, setShowReject] = useState(false);

  const defaultChecklist = CHECKLIST_ITEMS.reduce<Record<string, boolean>>(
    (acc, item) => ({ ...acc, [item.key]: Boolean((existingData.checklist as Record<string, boolean>)?.[item.key]) }),
    {}
  );
  const [checklist, setChecklist] = useState(defaultChecklist);

  const startStage = useStartStage();
  const completeStage = useCompleteStage();
  const approveStage = useApproveStage();
  const rejectStage = useRejectStage();
  const isBusy = startStage.isPending || completeStage.isPending || approveStage.isPending || rejectStage.isPending;

  const statusInfo = STATUS_BADGE[stage.status] ?? STATUS_BADGE.pending;

  const handleStart = async () => {
    if (!operatorName.trim()) { toast({ title: "Operator name required", variant: "destructive" }); return; }
    try {
      await startStage.mutateAsync({
        id: orderId, stage: "packing",
        data: {
          operatorName: operatorName.trim(),
          notes: null,
          stageData: { packingDate, boxNumber, boxType, grossWeightKg: parseFloat(grossWeight) || null, netWeightKg: parseFloat(netWeight) || null },
        },
      });
      toast({ title: "Packing stage started" });
      onRefresh();
    } catch (e: any) {
      toast({ title: e?.response?.data?.error ?? "Failed to start", variant: "destructive" });
    }
  };

  const handleComplete = async () => {
    if (!operatorName.trim() || !boxNumber.trim()) {
      toast({ title: "Operator name and box number required", variant: "destructive" }); return;
    }
    try {
      await completeStage.mutateAsync({
        id: orderId, stage: "packing",
        data: {
          operatorName: operatorName.trim(),
          notes: notes || null,
          stageData: {
            packingDate, boxNumber: boxNumber.trim(), boxType,
            grossWeightKg: parseFloat(grossWeight) || null,
            netWeightKg: parseFloat(netWeight) || null,
            checklist, batteryPhotoUrl: batteryPhotoUrl || null, boxPhotoUrl: boxPhotoUrl || null,
          },
        },
      });
      toast({ title: "Packing complete" });
      onRefresh();
    } catch (e: any) {
      toast({ title: e?.response?.data?.error ?? "Failed to complete", variant: "destructive" });
    }
  };

  const handleApprove = async () => {
    if (!supervisorName.trim()) { toast({ title: "Supervisor name required", variant: "destructive" }); return; }
    try {
      await approveStage.mutateAsync({ id: orderId, stage: "packing", data: { supervisorName: supervisorName.trim(), notes: notes || null } });
      toast({ title: "Packing approved — battery ready for dispatch" });
      onRefresh();
    } catch (e: any) {
      toast({ title: e?.response?.data?.error ?? "Failed to approve", variant: "destructive" });
    }
  };

  const handleReject = async () => {
    if (!supervisorName.trim() || !rejectNotes.trim()) {
      toast({ title: "Supervisor name and reason required", variant: "destructive" }); return;
    }
    try {
      await rejectStage.mutateAsync({ id: orderId, stage: "packing", data: { supervisorName: supervisorName.trim(), notes: rejectNotes.trim() } });
      toast({ title: "Packing rejected" });
      setShowReject(false);
      onRefresh();
    } catch (e: any) {
      toast({ title: e?.response?.data?.error ?? "Failed to reject", variant: "destructive" });
    }
  };

  return (
    <Card className="border-2 border-orange-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" />
            Stage {stage.stageOrder}: Packing
          </CardTitle>
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusInfo.className}`}>
            {statusInfo.label}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Timestamps */}
        <div className="grid grid-cols-3 gap-3 text-xs text-gray-500">
          <div><span className="block font-medium text-gray-600">Started</span>{stage.startedAt ? new Date(stage.startedAt).toLocaleString() : "—"}</div>
          <div><span className="block font-medium text-gray-600">Completed</span>{stage.completedAt ? new Date(stage.completedAt).toLocaleString() : "—"}</div>
          <div><span className="block font-medium text-gray-600">Approved</span>{stage.approvedAt ? new Date(stage.approvedAt).toLocaleString() : "—"}</div>
        </div>

        {/* Operator name */}
        {(stage.status === "pending" || stage.status === "rejected") && (
          <div className="space-y-1.5">
            <Label className="text-xs">Packing Operator *</Label>
            <Input value={operatorName} onChange={(e) => setOperatorName(e.target.value)} placeholder="Operator name" className="h-11" />
          </div>
        )}

        {/* Main form */}
        {(stage.status === "in_progress") && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Packing Date</Label><Input type="date" value={packingDate} onChange={(e) => setPackingDate(e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Box Number *</Label><Input value={boxNumber} onChange={(e) => setBoxNumber(e.target.value)} placeholder="BOX-001" /></div>
              <div className="space-y-1.5">
                <Label className="text-xs">Box Type</Label>
                <Select value={boxType} onValueChange={setBoxType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Standard">Standard</SelectItem>
                    <SelectItem value="Reinforced">Reinforced</SelectItem>
                    <SelectItem value="Export">Export Grade</SelectItem>
                    <SelectItem value="Custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label className="text-xs">Gross Weight (kg)</Label><Input type="number" value={grossWeight} onChange={(e) => setGrossWeight(e.target.value)} placeholder="25.5" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Net Weight (kg)</Label><Input type="number" value={netWeight} onChange={(e) => setNetWeight(e.target.value)} placeholder="22.0" /></div>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Packing Checklist</p>
              <div className="space-y-2 p-3 rounded-lg border bg-muted/20">
                {CHECKLIST_ITEMS.map((item) => (
                  <div key={item.key} className="flex items-center gap-2">
                    <Checkbox
                      id={item.key}
                      checked={!!checklist[item.key]}
                      onCheckedChange={(v) => setChecklist((c) => ({ ...c, [item.key]: Boolean(v) }))}
                    />
                    <label htmlFor={item.key} className="text-sm cursor-pointer">{item.label}</label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Photo URLs</p>
              <div className="space-y-1.5"><Label className="text-xs">Battery Photo URL</Label><Input value={batteryPhotoUrl} onChange={(e) => setBatteryPhotoUrl(e.target.value)} placeholder="https://..." /></div>
              <div className="space-y-1.5"><Label className="text-xs">Packed Box Photo URL</Label><Input value={boxPhotoUrl} onChange={(e) => setBoxPhotoUrl(e.target.value)} placeholder="https://..." /></div>
            </div>

            <div className="space-y-1.5"><Label className="text-xs">Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Packing notes..." /></div>
          </div>
        )}

        {/* Supervisor form */}
        {stage.status === "completed" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Supervisor Name *</Label>
              <Input value={supervisorName} onChange={(e) => setSupervisorName(e.target.value)} placeholder="Approving supervisor" className="h-11" />
            </div>
            {showReject && (
              <div className="space-y-1.5 border border-red-200 rounded-lg p-3 bg-red-50">
                <Label className="text-xs text-red-700">Rejection Reason *</Label>
                <Textarea value={rejectNotes} onChange={(e) => setRejectNotes(e.target.value)} rows={2} placeholder="Why is packing being rejected?" />
              </div>
            )}
          </div>
        )}

        {stage.status === "approved" && (
          <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800">
            ✅ Packing approved by {stage.supervisorName ?? "supervisor"}. Battery is ready for dispatch.
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap pt-1">
          {(stage.status === "pending" || stage.status === "rejected") && (
            <Button size="sm" onClick={handleStart} disabled={isBusy} className="bg-blue-600 hover:bg-blue-700">
              {startStage.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              <PlayCircle className="h-3 w-3 mr-1" />Start Packing
            </Button>
          )}
          {stage.status === "in_progress" && (
            <Button size="sm" onClick={handleComplete} disabled={isBusy} className="bg-orange-600 hover:bg-orange-700">
              {completeStage.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              <CheckCircle2 className="h-3 w-3 mr-1" />Complete Packing
            </Button>
          )}
          {stage.status === "completed" && !showReject && (
            <>
              <Button size="sm" onClick={handleApprove} disabled={isBusy} className="bg-green-600 hover:bg-green-700">
                {approveStage.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                <ThumbsUp className="h-3 w-3 mr-1" />Approve
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowReject(true)} className="border-red-300 text-red-600">
                <ThumbsDown className="h-3 w-3 mr-1" />Reject
              </Button>
            </>
          )}
          {showReject && (
            <>
              <Button size="sm" onClick={handleReject} disabled={isBusy} className="bg-red-600 hover:bg-red-700">
                {rejectStage.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}Confirm Reject
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowReject(false)}>Cancel</Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
