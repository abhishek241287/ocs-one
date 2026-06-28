import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ThumbsUp, ThumbsDown, Loader2 } from "lucide-react";
import {
  useApproveStage,
  useRejectStage,
} from "@workspace/api-client-react";
import { useOdsNotify } from "@/hooks/use-ods-notify";

type StageKey = "cell_allocation" | "assembly" | "compression" | "bms_allocation" | "bms_programming" | "charging" | "testing" | "quality_control" | "packing";

interface Props {
  orderId: string;
  stageKey: StageKey;
  existingNotes?: string | null;
  onRefresh: () => void;
}

export default function StageApprovalSection({ orderId, stageKey, existingNotes, onRefresh }: Props) {
  const notify = useOdsNotify();
  const [supervisor, setSupervisor] = useState("");
  const [rejectNotes, setRejectNotes] = useState("");
  const [showReject, setShowReject] = useState(false);

  const approveStage = useApproveStage();
  const rejectStage = useRejectStage();
  const isBusy = approveStage.isPending || rejectStage.isPending;

  const handleApprove = async () => {
    if (!supervisor.trim()) {
      notify.error("Supervisor name required");
      return;
    }
    try {
      await approveStage.mutateAsync({ id: orderId, stage: stageKey, data: { supervisorName: supervisor.trim(), notes: existingNotes ?? null } });
      notify.success("Stage approved ✓");
      onRefresh();
    } catch (e: any) {
      notify.error(e?.response?.data?.error ?? "Failed to approve");
    }
  };

  const handleReject = async () => {
    if (!supervisor.trim() || !rejectNotes.trim()) {
      notify.error("Supervisor name and reason required");
      return;
    }
    try {
      await rejectStage.mutateAsync({ id: orderId, stage: stageKey, data: { supervisorName: supervisor.trim(), notes: rejectNotes.trim() } });
      notify.success("Stage rejected — returned to pending");
      setShowReject(false);
      onRefresh();
    } catch (e: any) {
      notify.error(e?.response?.data?.error ?? "Failed to reject");
    }
  };

  return (
    <div className="border-t pt-4 mt-4 space-y-3 bg-amber-50 rounded-b-lg px-4 pb-4 -mx-4 -mb-4">
      <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Awaiting Supervisor Approval</p>
      <div className="space-y-1.5">
        <Label className="text-sm">Supervisor Name *</Label>
        <Input
          placeholder="Who is approving this stage?"
          value={supervisor}
          onChange={(e) => setSupervisor(e.target.value)}
          className="h-11 text-base"
        />
      </div>
      {showReject && (
        <div className="space-y-1.5 border border-red-200 rounded-lg p-3 bg-red-50">
          <Label className="text-sm text-red-700">Rejection Reason *</Label>
          <Textarea
            placeholder="Why is this stage being rejected?"
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            rows={2}
          />
        </div>
      )}
      <div className="flex gap-3 flex-wrap">
        {!showReject ? (
          <>
            <Button onClick={handleApprove} disabled={isBusy} className="h-12 px-6 bg-green-600 hover:bg-green-700 text-base font-semibold flex-1">
              {approveStage.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <ThumbsUp className="h-4 w-4 mr-2" />
              Approve Stage
            </Button>
            <Button onClick={() => setShowReject(true)} variant="outline" disabled={isBusy} className="h-12 px-6 border-red-300 text-red-600 hover:bg-red-50 text-base">
              <ThumbsDown className="h-4 w-4 mr-2" />
              Reject
            </Button>
          </>
        ) : (
          <>
            <Button onClick={handleReject} disabled={isBusy} className="h-12 px-6 bg-red-600 hover:bg-red-700 text-base font-semibold flex-1">
              {rejectStage.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm Reject
            </Button>
            <Button variant="outline" onClick={() => setShowReject(false)} className="h-12 px-4">Cancel</Button>
          </>
        )}
      </div>
    </div>
  );
}
