import CellAllocationCard from "./stage-cards/CellAllocationCard";
import AssemblyCard from "./stage-cards/AssemblyCard";
import CompressionCard from "./stage-cards/CompressionCard";
import BmsInstallCard from "./stage-cards/BmsInstallCard";
import BmsProgrammingCard from "./stage-cards/BmsProgrammingCard";
import ChargingCard from "./stage-cards/ChargingCard";
import TestingCard from "./stage-cards/TestingCard";
import QualityControlCard from "./stage-cards/QualityControlCard";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  PlayCircle, CheckCircle2, ThumbsUp, ThumbsDown, Loader2,
  Clock, XCircle, Circle,
} from "lucide-react";
import {
  useStartStage, useCompleteStage, useApproveStage, useRejectStage,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

interface OrderStage {
  id: string;
  stageType: string;
  stageOrder: number;
  status: string;
  operatorName?: string | null;
  supervisorName?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  approvedAt?: string | null;
  notes?: string | null;
  stageData?: Record<string, unknown> | null;
}

interface Props {
  orderId: string;
  stage: OrderStage;
  onRefresh: () => void;
}

// ─── Sprint 5 specialized cards ───────────────────────────────────────────────

export default function StageCard({ orderId, stage, onRefresh }: Props) {
  if (stage.stageType === "cell_allocation") {
    return <CellAllocationCard orderId={orderId} stage={stage} onRefresh={onRefresh} />;
  }
  if (stage.stageType === "assembly") {
    return <AssemblyCard orderId={orderId} stage={stage} onRefresh={onRefresh} />;
  }
  if (stage.stageType === "compression") {
    return <CompressionCard orderId={orderId} stage={stage} onRefresh={onRefresh} />;
  }
  if (stage.stageType === "bms_allocation") {
    return <BmsInstallCard orderId={orderId} stage={stage} onRefresh={onRefresh} />;
  }
  if (stage.stageType === "bms_programming") {
    return <BmsProgrammingCard orderId={orderId} stage={stage} onRefresh={onRefresh} />;
  }
  if (stage.stageType === "charging") {
    return <ChargingCard orderId={orderId} stage={stage} onRefresh={onRefresh} />;
  }
  if (stage.stageType === "testing") {
    return <TestingCard orderId={orderId} stage={stage} onRefresh={onRefresh} />;
  }
  if (stage.stageType === "quality_control") {
    return <QualityControlCard orderId={orderId} stage={stage} onRefresh={onRefresh} />;
  }

  // Generic fallback for packing
  return <GenericStageCard orderId={orderId} stage={stage} onRefresh={onRefresh} />;
}

// ─── Generic fallback card ────────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  cell_allocation: "Cell Allocation",
  assembly: "Assembly",
  compression: "Compression",
  bms_allocation: "BMS Installation",
  bms_programming: "BMS Programming",
  charging: "Charging",
  testing: "Testing",
  quality_control: "Quality Control",
  packing: "Packing",
};

const STATUS_BADGE: Record<string, { label: string; className: string; Icon: React.FC<{ className?: string }> }> = {
  pending: { label: "Pending", className: "bg-gray-100 text-gray-600", Icon: Circle },
  in_progress: { label: "In Progress", className: "bg-blue-100 text-blue-700", Icon: PlayCircle },
  completed: { label: "Completed", className: "bg-yellow-100 text-yellow-700", Icon: Clock },
  approved: { label: "Approved", className: "bg-green-100 text-green-700", Icon: CheckCircle2 },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-700", Icon: XCircle },
};

type StageKey = "cell_allocation" | "assembly" | "compression" | "bms_allocation" | "bms_programming" | "charging" | "testing" | "quality_control" | "packing";

function GenericStageCard({ orderId, stage, onRefresh }: Props) {
  const { toast } = useToast();
  const [operatorName, setOperatorName] = useState(stage.operatorName ?? "");
  const [supervisorName, setSupervisorName] = useState(stage.supervisorName ?? "");
  const [notes, setNotes] = useState(stage.notes ?? "");
  const [rejectNotes, setRejectNotes] = useState("");
  const [showReject, setShowReject] = useState(false);

  const startStage = useStartStage();
  const completeStage = useCompleteStage();
  const approveStage = useApproveStage();
  const rejectStage = useRejectStage();

  const stageKey = stage.stageType as StageKey;
  const statusInfo = STATUS_BADGE[stage.status] ?? STATUS_BADGE.pending;
  const isBusy = startStage.isPending || completeStage.isPending || approveStage.isPending || rejectStage.isPending;

  const handleStart = async () => {
    if (!operatorName.trim()) { toast({ title: "Operator name required", variant: "destructive" }); return; }
    try {
      await startStage.mutateAsync({ id: orderId, stage: stageKey, data: { operatorName: operatorName.trim(), notes: notes || null } });
      toast({ title: "Stage started" });
      onRefresh();
    } catch (e: any) {
      toast({ title: e?.response?.data?.error ?? "Failed to start stage", variant: "destructive" });
    }
  };

  const handleComplete = async () => {
    if (!operatorName.trim()) { toast({ title: "Operator name required", variant: "destructive" }); return; }
    try {
      await completeStage.mutateAsync({ id: orderId, stage: stageKey, data: { operatorName: operatorName.trim(), notes: notes || null } });
      toast({ title: "Stage completed — awaiting supervisor approval" });
      onRefresh();
    } catch (e: any) {
      toast({ title: e?.response?.data?.error ?? "Failed to complete stage", variant: "destructive" });
    }
  };

  const handleApprove = async () => {
    if (!supervisorName.trim()) { toast({ title: "Supervisor name required", variant: "destructive" }); return; }
    try {
      await approveStage.mutateAsync({ id: orderId, stage: stageKey, data: { supervisorName: supervisorName.trim(), notes: notes || null } });
      toast({ title: "Stage approved" });
      onRefresh();
    } catch (e: any) {
      toast({ title: e?.response?.data?.error ?? "Failed to approve stage", variant: "destructive" });
    }
  };

  const handleReject = async () => {
    if (!supervisorName.trim() || !rejectNotes.trim()) { toast({ title: "Supervisor name and reason required", variant: "destructive" }); return; }
    try {
      await rejectStage.mutateAsync({ id: orderId, stage: stageKey, data: { supervisorName: supervisorName.trim(), notes: rejectNotes.trim() } });
      toast({ title: "Stage rejected — returned to pending" });
      setShowReject(false);
      onRefresh();
    } catch (e: any) {
      toast({ title: e?.response?.data?.error ?? "Failed to reject stage", variant: "destructive" });
    }
  };

  return (
    <Card className="border-2 border-orange-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            Stage {stage.stageOrder}: {STAGE_LABELS[stage.stageType] ?? stage.stageType}
          </CardTitle>
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${statusInfo.className}`}>
            <statusInfo.Icon className="h-3 w-3" />
            {statusInfo.label}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3 text-xs text-gray-500">
          <div><span className="block font-medium text-gray-600">Started</span>{stage.startedAt ? new Date(stage.startedAt).toLocaleString() : "—"}</div>
          <div><span className="block font-medium text-gray-600">Completed</span>{stage.completedAt ? new Date(stage.completedAt).toLocaleString() : "—"}</div>
          <div><span className="block font-medium text-gray-600">Approved</span>{stage.approvedAt ? new Date(stage.approvedAt).toLocaleString() : "—"}</div>
        </div>
        {(stage.status === "pending" || stage.status === "in_progress" || stage.status === "rejected") && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Operator Name *</Label>
              <Input placeholder="Who is performing this stage?" value={operatorName} onChange={(e) => setOperatorName(e.target.value)} disabled={stage.status !== "pending" && stage.status !== "rejected"} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea placeholder="Stage notes..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </div>
        )}
        {stage.status === "completed" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Supervisor Name *</Label>
              <Input placeholder="Who is approving this stage?" value={supervisorName} onChange={(e) => setSupervisorName(e.target.value)} className="h-11" />
            </div>
            {!showReject && stage.notes && <p className="text-xs text-gray-500 bg-gray-50 rounded p-2">{stage.notes}</p>}
          </div>
        )}
        {showReject && (
          <div className="space-y-1.5 border border-red-200 rounded-lg p-3 bg-red-50">
            <Label className="text-xs text-red-700">Rejection Reason *</Label>
            <Textarea placeholder="Why is this stage being rejected?" value={rejectNotes} onChange={(e) => setRejectNotes(e.target.value)} rows={2} />
          </div>
        )}
        <div className="flex gap-2 pt-1 flex-wrap">
          {(stage.status === "pending" || stage.status === "rejected") && (
            <Button size="sm" onClick={handleStart} disabled={isBusy} className="bg-blue-600 hover:bg-blue-700">
              {startStage.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              <PlayCircle className="h-3 w-3 mr-1" />Start Stage
            </Button>
          )}
          {stage.status === "in_progress" && (
            <Button size="sm" onClick={handleComplete} disabled={isBusy} className="bg-yellow-600 hover:bg-yellow-700">
              {completeStage.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              <CheckCircle2 className="h-3 w-3 mr-1" />Mark Complete
            </Button>
          )}
          {stage.status === "completed" && !showReject && (
            <>
              <Button size="sm" onClick={handleApprove} disabled={isBusy} className="bg-green-600 hover:bg-green-700">
                {approveStage.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                <ThumbsUp className="h-3 w-3 mr-1" />Approve
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowReject(true)} className="border-red-300 text-red-600 hover:bg-red-50">
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
