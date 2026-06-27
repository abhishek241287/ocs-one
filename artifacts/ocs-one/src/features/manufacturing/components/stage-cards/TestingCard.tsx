import { useState } from "react";
import {
  useGetOrderTestResults,
  useUpsertTestResult,
  useStartStage,
  useCompleteStage,
  useApproveStage,
  useRejectStage,
} from "@workspace/api-client-react";
import { TestResult } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  PlayCircle, CheckCircle2, ThumbsUp, ThumbsDown, Loader2, ChevronDown, ChevronRight,
  Circle, Clock, XCircle, FlaskConical, Save,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface OrderStage {
  id: string; stageType: string; stageOrder: number; status: string;
  operatorName?: string | null; supervisorName?: string | null;
  startedAt?: string | null; completedAt?: string | null; approvedAt?: string | null;
  notes?: string | null; stageData?: Record<string, unknown> | null;
}

interface Props { orderId: string; stage: OrderStage; onRefresh: () => void; }

type TestType = "capacity" | "charge_discharge" | "protection" | "internal_resistance";

const TEST_INFO: { type: TestType; label: string; icon: string }[] = [
  { type: "capacity", label: "Capacity Test", icon: "🔋" },
  { type: "charge_discharge", label: "Charge / Discharge Test", icon: "⚡" },
  { type: "protection", label: "Protection Test", icon: "🛡️" },
  { type: "internal_resistance", label: "Internal Resistance Test", icon: "🔬" },
];

const RESULT_BADGE: Record<string, string> = {
  pass: "bg-green-100 text-green-700",
  fail: "bg-red-100 text-red-700",
  warning: "bg-yellow-100 text-yellow-700",
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-gray-100 text-gray-600" },
  in_progress: { label: "In Progress", className: "bg-blue-100 text-blue-700" },
  completed: { label: "Completed", className: "bg-yellow-100 text-yellow-700" },
  approved: { label: "Approved", className: "bg-green-100 text-green-700" },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-700" },
};

// ─── Capacity Test Panel ───────────────────────────────────────────────────────
function CapacityPanel({ orderId, existing, operatorName }: { orderId: string; existing?: TestResult; operatorName: string; }) {
  const { toast } = useToast();
  const upsert = useUpsertTestResult();
  const [rated, setRated] = useState(String(existing?.testData?.ratedCapacityAh ?? ""));
  const [measured, setMeasured] = useState(String(existing?.testData?.measuredCapacityAh ?? ""));
  const [ambientTemp, setAmbientTemp] = useState(String(existing?.testData?.ambientTempC ?? ""));
  const [batteryTemp, setBatteryTemp] = useState(String(existing?.testData?.batteryTempC ?? ""));
  const [equipName, setEquipName] = useState(existing?.testEquipmentName ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");

  const ratedN = parseFloat(rated);
  const measuredN = parseFloat(measured);
  const capacityPct = !isNaN(ratedN) && ratedN > 0 && !isNaN(measuredN) ? Math.round((measuredN / ratedN) * 1000) / 10 : null;
  const autoResult = capacityPct === null ? null : capacityPct >= 80 ? "pass" : capacityPct >= 70 ? "warning" : "fail";

  const save = async () => {
    if (!rated || !measured) { toast({ title: "Rated and measured capacity required", variant: "destructive" }); return; }
    try {
      await upsert.mutateAsync({
        id: orderId, testType: "capacity",
        data: {
          operatorName, result: autoResult ?? "fail",
          testEquipmentName: equipName || null,
          completedAt: new Date().toISOString(),
          testData: { ratedCapacityAh: ratedN, measuredCapacityAh: measuredN, capacityPct, ambientTempC: parseFloat(ambientTemp) || null, batteryTempC: parseFloat(batteryTemp) || null },
          notes: notes || null,
        },
      });
      toast({ title: `Capacity test saved — ${autoResult?.toUpperCase()}` });
    } catch { toast({ title: "Failed to save capacity test", variant: "destructive" }); }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><Label className="text-xs">Rated Capacity (Ah) *</Label><Input type="number" value={rated} onChange={(e) => setRated(e.target.value)} placeholder="e.g. 100" /></div>
        <div className="space-y-1"><Label className="text-xs">Measured Capacity (Ah) *</Label><Input type="number" value={measured} onChange={(e) => setMeasured(e.target.value)} placeholder="e.g. 98.5" /></div>
        <div className="space-y-1"><Label className="text-xs">Ambient Temp (°C)</Label><Input type="number" value={ambientTemp} onChange={(e) => setAmbientTemp(e.target.value)} placeholder="25" /></div>
        <div className="space-y-1"><Label className="text-xs">Battery Temp (°C)</Label><Input type="number" value={batteryTemp} onChange={(e) => setBatteryTemp(e.target.value)} placeholder="28" /></div>
      </div>
      <div className="space-y-1"><Label className="text-xs">Equipment Used</Label><Input value={equipName} onChange={(e) => setEquipName(e.target.value)} placeholder="Capacity tester name/model" /></div>
      {capacityPct !== null && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
          <span className="text-sm font-medium">Capacity: <strong>{capacityPct}%</strong></span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${RESULT_BADGE[autoResult ?? "fail"]}`}>
            Auto: {(autoResult ?? "fail").toUpperCase()}
          </span>
          <span className="text-xs text-muted-foreground">(≥80% pass, ≥70% warning)</span>
        </div>
      )}
      <div className="space-y-1"><Label className="text-xs">Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Test notes..." /></div>
      <Button size="sm" onClick={save} disabled={upsert.isPending} className="bg-blue-600 hover:bg-blue-700">
        {upsert.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}<Save className="h-3 w-3 mr-1" />Save Capacity Test
      </Button>
    </div>
  );
}

// ─── Charge/Discharge Panel ───────────────────────────────────────────────────
function ChargeDischargePanel({ orderId, existing, operatorName }: { orderId: string; existing?: TestResult; operatorName: string; }) {
  const { toast } = useToast();
  const upsert = useUpsertTestResult();
  const [chargeEff, setChargeEff] = useState(String(existing?.testData?.chargeEfficiencyPct ?? ""));
  const [dischargeEff, setDischargeEff] = useState(String(existing?.testData?.dischargeEfficiencyPct ?? ""));
  const [energyWh, setEnergyWh] = useState(String(existing?.testData?.energyDeliveredWh ?? ""));
  const [finalVolt, setFinalVolt] = useState(String(existing?.testData?.finalVoltageV ?? ""));
  const [finalCurr, setFinalCurr] = useState(String(existing?.testData?.finalCurrentA ?? ""));
  const [result, setResult] = useState<string>(existing?.result ?? "pass");
  const [notes, setNotes] = useState(existing?.notes ?? "");

  const save = async () => {
    try {
      await upsert.mutateAsync({
        id: orderId, testType: "charge_discharge",
        data: {
          operatorName, result: result as any,
          completedAt: new Date().toISOString(),
          testData: {
            chargeEfficiencyPct: parseFloat(chargeEff) || null,
            dischargeEfficiencyPct: parseFloat(dischargeEff) || null,
            energyDeliveredWh: parseFloat(energyWh) || null,
            finalVoltageV: parseFloat(finalVolt) || null,
            finalCurrentA: parseFloat(finalCurr) || null,
          },
          notes: notes || null,
        },
      });
      toast({ title: `Charge/Discharge test saved — ${result.toUpperCase()}` });
    } catch { toast({ title: "Failed to save test", variant: "destructive" }); }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><Label className="text-xs">Charge Efficiency (%)</Label><Input type="number" value={chargeEff} onChange={(e) => setChargeEff(e.target.value)} placeholder="98" /></div>
        <div className="space-y-1"><Label className="text-xs">Discharge Efficiency (%)</Label><Input type="number" value={dischargeEff} onChange={(e) => setDischargeEff(e.target.value)} placeholder="97" /></div>
        <div className="space-y-1"><Label className="text-xs">Energy Delivered (Wh)</Label><Input type="number" value={energyWh} onChange={(e) => setEnergyWh(e.target.value)} placeholder="5120" /></div>
        <div className="space-y-1"><Label className="text-xs">Final Voltage (V)</Label><Input type="number" value={finalVolt} onChange={(e) => setFinalVolt(e.target.value)} placeholder="58.4" /></div>
        <div className="space-y-1"><Label className="text-xs">Final Current (A)</Label><Input type="number" value={finalCurr} onChange={(e) => setFinalCurr(e.target.value)} placeholder="0.5" /></div>
        <div className="space-y-1">
          <Label className="text-xs">Overall Result</Label>
          <Select value={result} onValueChange={setResult}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pass">Pass</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="fail">Fail</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1"><Label className="text-xs">Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Test notes..." /></div>
      <Button size="sm" onClick={save} disabled={upsert.isPending} className="bg-blue-600 hover:bg-blue-700">
        {upsert.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}<Save className="h-3 w-3 mr-1" />Save Test
      </Button>
    </div>
  );
}

// ─── Protection Panel ─────────────────────────────────────────────────────────
const PROTECTIONS = [
  { key: "overVoltage", label: "Over Voltage Protection" },
  { key: "underVoltage", label: "Under Voltage Protection" },
  { key: "overCurrent", label: "Over Current Protection" },
  { key: "shortCircuit", label: "Short Circuit Protection" },
  { key: "temperature", label: "Temperature Protection" },
  { key: "cellBalancing", label: "Cell Balancing Check" },
];

function ProtectionPanel({ orderId, existing, operatorName }: { orderId: string; existing?: TestResult; operatorName: string; }) {
  const { toast } = useToast();
  const upsert = useUpsertTestResult();
  const td = existing?.testData as Record<string, string> | null | undefined;
  const [checks, setChecks] = useState<Record<string, string>>(
    PROTECTIONS.reduce((acc, p) => ({ ...acc, [p.key]: td?.[p.key] ?? "pass" }), {})
  );
  const [equipName, setEquipName] = useState(existing?.testEquipmentName ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");

  const allPass = Object.values(checks).every((v) => v === "pass");
  const autoResult = allPass ? "pass" : "fail";

  const save = async () => {
    try {
      await upsert.mutateAsync({
        id: orderId, testType: "protection",
        data: {
          operatorName, result: autoResult,
          testEquipmentName: equipName || null,
          completedAt: new Date().toISOString(),
          testData: checks,
          notes: notes || null,
        },
      });
      toast({ title: `Protection test saved — ${autoResult.toUpperCase()}` });
    } catch { toast({ title: "Failed to save test", variant: "destructive" }); }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2">
        {PROTECTIONS.map((p) => (
          <div key={p.key} className="flex items-center justify-between">
            <span className="text-sm">{p.label}</span>
            <Select value={checks[p.key]} onValueChange={(v) => setChecks((c) => ({ ...c, [p.key]: v }))}>
              <SelectTrigger className="w-28 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pass">✓ Pass</SelectItem>
                <SelectItem value="fail">✗ Fail</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
        <span className="text-sm font-medium">Overall Result:</span>
        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${RESULT_BADGE[autoResult]}`}>
          {autoResult.toUpperCase()}
        </span>
      </div>
      <div className="space-y-1"><Label className="text-xs">Protection Tester Model</Label><Input value={equipName} onChange={(e) => setEquipName(e.target.value)} placeholder="Equipment name/model" /></div>
      <div className="space-y-1"><Label className="text-xs">Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Test notes..." /></div>
      <Button size="sm" onClick={save} disabled={upsert.isPending} className="bg-blue-600 hover:bg-blue-700">
        {upsert.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}<Save className="h-3 w-3 mr-1" />Save Test
      </Button>
    </div>
  );
}

// ─── Internal Resistance Panel ────────────────────────────────────────────────
function IrPanel({ orderId, existing, operatorName }: { orderId: string; existing?: TestResult; operatorName: string; }) {
  const { toast } = useToast();
  const upsert = useUpsertTestResult();
  const [ir, setIr] = useState(String(existing?.testData?.internalResistanceMohm ?? ""));
  const [limit, setLimit] = useState(String(existing?.testData?.acceptableLimitMohm ?? "80"));
  const [temp, setTemp] = useState(String(existing?.testData?.temperatureC ?? ""));
  const [equipName, setEquipName] = useState(existing?.testEquipmentName ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");

  const irN = parseFloat(ir);
  const limitN = parseFloat(limit);
  const autoResult = !isNaN(irN) && !isNaN(limitN)
    ? irN <= limitN ? "pass" : irN <= limitN * 1.15 ? "warning" : "fail"
    : null;

  const save = async () => {
    if (!ir) { toast({ title: "IR measurement required", variant: "destructive" }); return; }
    try {
      await upsert.mutateAsync({
        id: orderId, testType: "internal_resistance",
        data: {
          operatorName, result: autoResult ?? "fail",
          testEquipmentName: equipName || null,
          completedAt: new Date().toISOString(),
          testData: { internalResistanceMohm: irN, acceptableLimitMohm: limitN, temperatureC: parseFloat(temp) || null },
          notes: notes || null,
        },
      });
      toast({ title: `IR test saved — ${(autoResult ?? "fail").toUpperCase()}` });
    } catch { toast({ title: "Failed to save test", variant: "destructive" }); }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><Label className="text-xs">Battery IR (mΩ) *</Label><Input type="number" value={ir} onChange={(e) => setIr(e.target.value)} placeholder="e.g. 45" /></div>
        <div className="space-y-1"><Label className="text-xs">Acceptable Limit (mΩ)</Label><Input type="number" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="80" /></div>
        <div className="space-y-1"><Label className="text-xs">Temperature (°C)</Label><Input type="number" value={temp} onChange={(e) => setTemp(e.target.value)} placeholder="25" /></div>
        <div className="space-y-1"><Label className="text-xs">IR Meter Model</Label><Input value={equipName} onChange={(e) => setEquipName(e.target.value)} placeholder="Equipment name" /></div>
      </div>
      {autoResult && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
          <span className="text-sm font-medium">IR: <strong>{irN} mΩ</strong> / Limit: <strong>{limitN} mΩ</strong></span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${RESULT_BADGE[autoResult]}`}>
            {autoResult.toUpperCase()}
          </span>
        </div>
      )}
      <div className="space-y-1"><Label className="text-xs">Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Test notes..." /></div>
      <Button size="sm" onClick={save} disabled={upsert.isPending} className="bg-blue-600 hover:bg-blue-700">
        {upsert.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}<Save className="h-3 w-3 mr-1" />Save Test
      </Button>
    </div>
  );
}

// ─── Test Sub-Panel wrapper ───────────────────────────────────────────────────
function TestPanel({ info, existing, orderId, operatorName, active }: {
  info: { type: TestType; label: string; icon: string };
  existing?: TestResult;
  orderId: string;
  operatorName: string;
  active: boolean;
}) {
  const [open, setOpen] = useState(!existing);

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <span>{info.icon}</span>
          {info.label}
        </span>
        <span className="flex items-center gap-2">
          {existing && (
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${RESULT_BADGE[existing.result] ?? ""}`}>
              {existing.result.toUpperCase()}
            </span>
          )}
          {!existing && <Badge variant="outline" className="text-xs text-muted-foreground">Not recorded</Badge>}
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>
      {open && active && (
        <div className="p-4 border-t bg-background">
          {info.type === "capacity" && <CapacityPanel orderId={orderId} existing={existing} operatorName={operatorName} />}
          {info.type === "charge_discharge" && <ChargeDischargePanel orderId={orderId} existing={existing} operatorName={operatorName} />}
          {info.type === "protection" && <ProtectionPanel orderId={orderId} existing={existing} operatorName={operatorName} />}
          {info.type === "internal_resistance" && <IrPanel orderId={orderId} existing={existing} operatorName={operatorName} />}
        </div>
      )}
      {open && !active && (
        <div className="p-4 border-t bg-background text-sm text-muted-foreground">
          Start the testing stage first to record results.
        </div>
      )}
    </div>
  );
}

// ─── Main TestingCard ─────────────────────────────────────────────────────────
export default function TestingCard({ orderId, stage, onRefresh }: Props) {
  const { toast } = useToast();
  const [operatorName, setOperatorName] = useState(stage.operatorName ?? "");
  const [supervisorName, setSupervisorName] = useState(stage.supervisorName ?? "");
  const [notes, setNotes] = useState(stage.notes ?? "");
  const [rejectNotes, setRejectNotes] = useState("");
  const [showReject, setShowReject] = useState(false);

  const { data: testResults, refetch: refetchResults } = useGetOrderTestResults(orderId);
  const startStage = useStartStage();
  const completeStage = useCompleteStage();
  const approveStage = useApproveStage();
  const rejectStage = useRejectStage();
  const isBusy = startStage.isPending || completeStage.isPending || approveStage.isPending || rejectStage.isPending;

  const resultsByType = (testResults ?? []).reduce<Record<string, TestResult>>((acc, r) => {
    acc[r.testType] = r;
    return acc;
  }, {});

  const statusInfo = STATUS_BADGE[stage.status] ?? STATUS_BADGE.pending;
  const isActive = stage.status === "in_progress";

  const handleStart = async () => {
    if (!operatorName.trim()) { toast({ title: "Operator name required", variant: "destructive" }); return; }
    try {
      await startStage.mutateAsync({ id: orderId, stage: "testing", data: { operatorName: operatorName.trim(), notes: null } });
      toast({ title: "Testing stage started" });
      onRefresh();
    } catch (e: any) {
      toast({ title: e?.response?.data?.error ?? "Failed to start stage", variant: "destructive" });
    }
  };

  const handleComplete = async () => {
    if (!operatorName.trim()) { toast({ title: "Operator name required", variant: "destructive" }); return; }
    const results = Object.values(resultsByType);
    if (results.length === 0) {
      toast({ title: "Record at least one test result before completing", variant: "destructive" }); return;
    }
    try {
      await completeStage.mutateAsync({ id: orderId, stage: "testing", data: { operatorName: operatorName.trim(), notes: notes || null } });
      toast({ title: "Testing complete — awaiting QC approval" });
      onRefresh();
    } catch (e: any) {
      toast({ title: e?.response?.data?.error ?? "Failed to complete stage", variant: "destructive" });
    }
  };

  const handleApprove = async () => {
    if (!supervisorName.trim()) { toast({ title: "Supervisor name required", variant: "destructive" }); return; }
    try {
      await approveStage.mutateAsync({ id: orderId, stage: "testing", data: { supervisorName: supervisorName.trim(), notes: notes || null } });
      toast({ title: "Testing stage approved" });
      onRefresh();
    } catch (e: any) {
      toast({ title: e?.response?.data?.error ?? "Failed to approve", variant: "destructive" });
    }
  };

  const handleReject = async () => {
    if (!supervisorName.trim() || !rejectNotes.trim()) { toast({ title: "Supervisor name and reason required", variant: "destructive" }); return; }
    try {
      await rejectStage.mutateAsync({ id: orderId, stage: "testing", data: { supervisorName: supervisorName.trim(), notes: rejectNotes.trim() } });
      toast({ title: "Stage rejected — returned to pending" });
      setShowReject(false);
      onRefresh();
    } catch (e: any) {
      toast({ title: e?.response?.data?.error ?? "Failed to reject", variant: "destructive" });
    }
  };

  return (
    <Card className="border-2 border-blue-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4" />
            Stage {stage.stageOrder}: Battery Testing Laboratory
          </CardTitle>
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${statusInfo.className}`}>
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

        {/* Operator / Supervisor fields */}
        {(stage.status === "pending" || stage.status === "in_progress" || stage.status === "rejected") && (
          <div className="space-y-1.5">
            <Label className="text-xs">Operator Name *</Label>
            <Input placeholder="Lab technician name" value={operatorName} onChange={(e) => setOperatorName(e.target.value)} disabled={stage.status === "in_progress"} className="h-11" />
          </div>
        )}
        {stage.status === "completed" && (
          <div className="space-y-1.5">
            <Label className="text-xs">Supervisor Name *</Label>
            <Input placeholder="Approving supervisor" value={supervisorName} onChange={(e) => setSupervisorName(e.target.value)} className="h-11" />
          </div>
        )}
        {showReject && (
          <div className="space-y-1.5 border border-red-200 rounded-lg p-3 bg-red-50">
            <Label className="text-xs text-red-700">Rejection Reason *</Label>
            <Textarea placeholder="Why is this stage being rejected?" value={rejectNotes} onChange={(e) => setRejectNotes(e.target.value)} rows={2} />
          </div>
        )}

        {/* 4 test panels */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Test Results</p>
          {TEST_INFO.map((info) => (
            <TestPanel
              key={info.type}
              info={info}
              existing={resultsByType[info.type]}
              orderId={orderId}
              operatorName={operatorName || stage.operatorName || ""}
              active={isActive}
            />
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 pt-1 flex-wrap">
          {(stage.status === "pending" || stage.status === "rejected") && (
            <Button size="sm" onClick={handleStart} disabled={isBusy} className="bg-blue-600 hover:bg-blue-700">
              {startStage.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              <PlayCircle className="h-3 w-3 mr-1" />Start Testing
            </Button>
          )}
          {stage.status === "in_progress" && (
            <Button size="sm" onClick={handleComplete} disabled={isBusy} className="bg-yellow-600 hover:bg-yellow-700">
              {completeStage.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              <CheckCircle2 className="h-3 w-3 mr-1" />Complete Testing
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
