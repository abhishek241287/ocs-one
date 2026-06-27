import { useState } from "react";
import {
  useGetOrderTestResults,
  useCreateQcApproval,
  useGetQcApproval,
  useStartStage,
  useCompleteStage,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ShieldCheck, Loader2, CheckCircle2, XCircle, AlertCircle, PlayCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface OrderStage {
  id: string; stageType: string; stageOrder: number; status: string;
  operatorName?: string | null; supervisorName?: string | null;
  startedAt?: string | null; completedAt?: string | null; approvedAt?: string | null;
  notes?: string | null; stageData?: Record<string, unknown> | null;
}

interface Props { orderId: string; stage: OrderStage; onRefresh: () => void; }

const RESULT_BADGE: Record<string, string> = {
  pass: "bg-green-100 text-green-700",
  fail: "bg-red-100 text-red-700",
  warning: "bg-yellow-100 text-yellow-700",
};

const TEST_LABELS: Record<string, string> = {
  capacity: "Capacity Test",
  charge_discharge: "Charge / Discharge Test",
  protection: "Protection Test",
  internal_resistance: "Internal Resistance Test",
};

export default function QualityControlCard({ orderId, stage, onRefresh }: Props) {
  const { toast } = useToast();
  const [operatorName, setOperatorName] = useState(stage.operatorName ?? "");
  const [inspectorName, setInspectorName] = useState("Sujeet");
  const [inspectorRole, setInspectorRole] = useState("Plant Manager");
  const [signature, setSignature] = useState("");
  const [remarks, setRemarks] = useState("");
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  const [failedTests, setFailedTests] = useState<string[]>([]);
  const [failureReason, setFailureReason] = useState("");

  const { data: testResults } = useGetOrderTestResults(orderId);
  const { data: existingApproval } = useGetQcApproval(orderId);
  const startStage = useStartStage();
  const completeStage = useCompleteStage();
  const createApproval = useCreateQcApproval();

  const isBusy = startStage.isPending || completeStage.isPending || createApproval.isPending;

  const toggleFailedTest = (type: string) => {
    setFailedTests((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleStart = async () => {
    if (!operatorName.trim()) { toast({ title: "Operator name required", variant: "destructive" }); return; }
    try {
      await startStage.mutateAsync({ id: orderId, stage: "quality_control", data: { operatorName: operatorName.trim(), notes: null } });
      toast({ title: "QC stage started" });
      onRefresh();
    } catch (e: any) {
      toast({ title: e?.response?.data?.error ?? "Failed to start QC", variant: "destructive" });
    }
  };

  const handleSubmitQc = async () => {
    if (!inspectorName.trim()) { toast({ title: "Inspector name required", variant: "destructive" }); return; }
    if (!decision) { toast({ title: "Select Approve or Reject", variant: "destructive" }); return; }
    if (decision === "rejected" && !failureReason.trim()) {
      toast({ title: "Failure reason required for rejection", variant: "destructive" }); return;
    }
    try {
      await createApproval.mutateAsync({
        id: orderId,
        data: {
          decision,
          inspectorName: inspectorName.trim(),
          inspectorRole: inspectorRole.trim() || "Plant Manager",
          digitalSignature: signature.trim() || null,
          remarks: remarks.trim() || null,
          failedTests,
          failureReason: failureReason.trim() || null,
        },
      });
      toast({ title: decision === "approved" ? "✓ Battery QC Approved!" : "Battery sent to rework queue" });
      onRefresh();
    } catch (e: any) {
      toast({ title: e?.response?.data?.error ?? "Failed to submit QC", variant: "destructive" });
    }
  };

  const hasAnyFail = (testResults ?? []).some((r) => r.result === "fail");

  return (
    <Card className="border-2 border-purple-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Stage {stage.stageOrder}: Quality Control Approval
          </CardTitle>
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
            stage.status === "approved" ? "bg-green-100 text-green-700"
            : stage.status === "rejected" ? "bg-red-100 text-red-700"
            : stage.status === "in_progress" ? "bg-blue-100 text-blue-700"
            : "bg-gray-100 text-gray-600"
          }`}>
            {stage.status.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Show existing approval if done */}
        {(stage.status === "approved" || stage.status === "rejected") && existingApproval && (
          <div className={`p-4 rounded-lg border ${existingApproval.decision === "approved" ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
            <div className="flex items-center gap-2 mb-2">
              {existingApproval.decision === "approved"
                ? <CheckCircle2 className="h-5 w-5 text-green-600" />
                : <XCircle className="h-5 w-5 text-red-600" />}
              <span className="font-semibold text-sm">
                {existingApproval.decision === "approved" ? "QC APPROVED" : "QC REJECTED"}
              </span>
            </div>
            <div className="text-xs space-y-1 text-muted-foreground">
              <p><strong>Inspector:</strong> {existingApproval.inspectorName} — {existingApproval.inspectorRole}</p>
              <p><strong>Date:</strong> {new Date(existingApproval.approvedAt).toLocaleString()}</p>
              {existingApproval.remarks && <p><strong>Remarks:</strong> {existingApproval.remarks}</p>}
              {existingApproval.digitalSignature && <p><strong>Signature:</strong> {existingApproval.digitalSignature}</p>}
            </div>
          </div>
        )}

        {/* Test results summary */}
        {testResults && testResults.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Test Results Summary</p>
            <div className="space-y-1.5">
              {testResults.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                  <span>{TEST_LABELS[r.testType] ?? r.testType}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${RESULT_BADGE[r.result] ?? ""}`}>
                    {r.result.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
            {hasAnyFail && (
              <div className="flex items-center gap-2 mt-2 p-2 rounded bg-red-50 text-red-700 text-xs">
                <AlertCircle className="h-4 w-4 shrink-0" />
                One or more tests failed. QC rejection will auto-generate a rework ticket.
              </div>
            )}
          </div>
        )}

        {testResults?.length === 0 && (
          <div className="text-sm text-muted-foreground p-3 rounded bg-yellow-50 border border-yellow-200">
            No test results recorded yet. Complete the Testing stage first.
          </div>
        )}

        {/* Start stage */}
        {stage.status === "pending" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">QC Inspector *</Label>
              <Input value={operatorName} onChange={(e) => setOperatorName(e.target.value)} placeholder="Inspector name" className="h-11" />
            </div>
            <Button size="sm" onClick={handleStart} disabled={isBusy} className="bg-blue-600 hover:bg-blue-700">
              {startStage.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              <PlayCircle className="h-3 w-3 mr-1" />Start QC Inspection
            </Button>
          </div>
        )}

        {/* QC approval form */}
        {stage.status === "in_progress" && (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-purple-50 border border-purple-200">
              <p className="text-xs font-semibold text-purple-800 mb-1">🔒 Plant Manager Authorization Required</p>
              <p className="text-xs text-purple-700">Only the Plant Manager can submit QC approval or rejection.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Inspector Name *</Label>
                <Input value={inspectorName} onChange={(e) => setInspectorName(e.target.value)} className="h-11" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Role</Label>
                <Input value={inspectorRole} onChange={(e) => setInspectorRole(e.target.value)} className="h-11" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Digital Signature</Label>
              <Input value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="Type name as digital signature" className="h-11" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Remarks</Label>
              <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="QC inspection remarks..." rows={2} />
            </div>

            {decision === "rejected" && (
              <div className="space-y-3 p-3 rounded-lg border border-red-200 bg-red-50">
                <p className="text-xs font-semibold text-red-700">Failed Tests</p>
                <div className="space-y-2">
                  {["capacity", "charge_discharge", "protection", "internal_resistance"].map((t) => (
                    <div key={t} className="flex items-center gap-2">
                      <Checkbox
                        id={`fail-${t}`}
                        checked={failedTests.includes(t)}
                        onCheckedChange={() => toggleFailedTest(t)}
                      />
                      <label htmlFor={`fail-${t}`} className="text-sm cursor-pointer">{TEST_LABELS[t]}</label>
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-red-700">Failure Reason *</Label>
                  <Textarea value={failureReason} onChange={(e) => setFailureReason(e.target.value)} placeholder="Describe the failure..." rows={2} className="border-red-300" />
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => { setDecision("approved"); setTimeout(handleSubmitQc, 0); }}
                disabled={isBusy}
                className="bg-green-600 hover:bg-green-700 flex-1"
              >
                {createApproval.isPending && decision === "approved" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                <CheckCircle2 className="h-3 w-3 mr-1" />Approve Battery
              </Button>
              <Button
                size="sm"
                onClick={() => setDecision("rejected")}
                disabled={isBusy}
                variant="outline"
                className="border-red-300 text-red-600 hover:bg-red-50 flex-1"
              >
                <XCircle className="h-3 w-3 mr-1" />Reject Battery
              </Button>
            </div>
            {decision === "rejected" && (
              <Button size="sm" onClick={handleSubmitQc} disabled={isBusy} className="bg-red-600 hover:bg-red-700 w-full">
                {createApproval.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                Confirm Rejection & Generate Rework Ticket
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
