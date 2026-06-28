import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Battery, CheckCircle2, Loader2, PlayCircle, AlertCircle } from "lucide-react";
import {
  useGetAllocatedCells,
  useListCellMatches,
  useStartStage,
  useCompleteStage,
} from "@workspace/api-client-react";
import { useOdsNotify } from "@/hooks/use-ods-notify";
import StageApprovalSection from "./StageApprovalSection";

interface OrderStage {
  id: string; stageType: string; stageOrder: number; status: string;
  operatorName?: string | null; notes?: string | null;
  stageData?: Record<string, unknown> | null;
}

interface Props { orderId: string; stage: OrderStage; onRefresh: () => void; }

const GRADE_COLORS: Record<string, string> = {
  A: "bg-green-100 text-green-800 border-green-200",
  B: "bg-blue-100 text-blue-800 border-blue-200",
  C: "bg-yellow-100 text-yellow-800 border-yellow-200",
  reject: "bg-red-100 text-red-800 border-red-200",
};

export default function CellAllocationCard({ orderId, stage, onRefresh }: Props) {
  const notify = useOdsNotify();
  const [operator, setOperator] = useState(stage.operatorName ?? "");
  const [selectedMatchId, setSelectedMatchId] = useState<string>(
    (stage.stageData?.matchId as string | undefined) ?? ""
  );

  const startStage = useStartStage();
  const completeStage = useCompleteStage();
  const isBusy = startStage.isPending || completeStage.isPending;

  const { data: allocatedData, isLoading: loadingCells } = useGetAllocatedCells(orderId);
  const { data: matchesData } = useListCellMatches({ status: "reserved", pageSize: 50 });

  const reservedMatches = matchesData?.items ?? [];
  const allocatedCells = allocatedData?.items ?? [];
  const _matchLinked = !!allocatedData?.matchId;

  const isReadOnly = stage.status === "approved" || stage.status === "completed";
  const isPending = stage.status === "pending";
  const isInProgress = stage.status === "in_progress";

  const handleStart = async () => {
    if (!operator.trim()) { notify.error("Operator name required"); return; }
    if (!selectedMatchId) { notify.error("Select a reserved cell match first"); return; }
    try {
      await startStage.mutateAsync({
        id: orderId, stage: "cell_allocation",
        data: { operatorName: operator.trim(), notes: `Match ID: ${selectedMatchId}` },
      });
      notify.success("Cell Allocation stage started");
      onRefresh();
    } catch (e: any) {
      notify.error(e?.response?.data?.error ?? "Failed to start");
    }
  };

  const handleConfirm = async () => {
    if (!operator.trim()) { notify.error("Operator name required"); return; }
    const matchId = (stage.stageData?.matchId as string | undefined) ?? selectedMatchId;
    if (!matchId) { notify.error("No match linked to this stage"); return; }
    try {
      await completeStage.mutateAsync({
        id: orderId, stage: "cell_allocation",
        data: {
          operatorName: operator.trim(),
          stageData: { matchId },
          notes: `Confirmed allocation of ${allocatedCells.length} cells`,
        },
      });
      notify.success(`✓ Cell allocation confirmed — ${allocatedCells.length} cells allocated`);
      onRefresh();
    } catch (e: any) {
      notify.error(e?.response?.data?.error ?? "Failed to confirm allocation");
    }
  };

  return (
    <Card className="border-2 border-orange-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Battery className="h-5 w-5 text-orange-600" />
            Stage 1: Cell Allocation
          </CardTitle>
          <Badge className={
            stage.status === "approved" ? "bg-green-100 text-green-800" :
            stage.status === "completed" ? "bg-yellow-100 text-yellow-800" :
            stage.status === "in_progress" ? "bg-blue-100 text-blue-800" :
            "bg-gray-100 text-gray-600"
          }>
            {stage.status.replace(/_/g, " ")}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Operator */}
        {!isReadOnly && (
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Operator Name *</Label>
            <Input
              placeholder="Who is performing this stage?"
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              disabled={isInProgress}
              className="h-11 text-base"
            />
          </div>
        )}

        {/* Match Picker — only shown in pending state */}
        {isPending && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Select Reserved Cell Match *</Label>
            {reservedMatches.length === 0 ? (
              <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                <AlertCircle className="h-4 w-4 shrink-0" />
                No reserved cell matches found. Complete cell matching first.
              </div>
            ) : (
              <Select value={selectedMatchId} onValueChange={setSelectedMatchId}>
                <SelectTrigger className="h-11 text-base">
                  <SelectValue placeholder="Choose a reserved match..." />
                </SelectTrigger>
                <SelectContent>
                  {reservedMatches.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.batteryModel} — {m.cellsPerBattery} cells — Score: {m.matchScore?.toFixed(1) ?? "?"}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {/* Cells table */}
        {(isInProgress || isReadOnly) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Allocated Cells</Label>
              {allocatedData?.matchScore && (
                <Badge className="bg-emerald-100 text-emerald-800">
                  Match Score: {allocatedData.matchScore.toFixed(1)}%
                </Badge>
              )}
            </div>
            {loadingCells ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : allocatedCells.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No cells linked yet</p>
            ) : (
              <div className="border rounded-lg overflow-hidden max-h-80 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50 sticky top-0">
                      <TableHead className="text-xs w-12">Pos</TableHead>
                      <TableHead className="text-xs">Cell ID</TableHead>
                      <TableHead className="text-xs">Grade</TableHead>
                      <TableHead className="text-xs text-right">Cap (Ah)</TableHead>
                      <TableHead className="text-xs text-right">IR (mΩ)</TableHead>
                      <TableHead className="text-xs text-right">V</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allocatedCells.map((cell) => (
                      <TableRow key={cell.cellId}>
                        <TableCell className="font-mono text-xs font-bold text-gray-500">{cell.position}</TableCell>
                        <TableCell className="font-mono text-xs">{cell.cellId}</TableCell>
                        <TableCell>
                          <span className={`px-1.5 py-0.5 rounded text-xs font-bold border ${GRADE_COLORS[cell.grade ?? ""] ?? "bg-gray-100"}`}>
                            {cell.grade ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-right">{cell.capacityAh?.toFixed(2) ?? "—"}</TableCell>
                        <TableCell className="text-xs text-right">{cell.internalResistanceMohm?.toFixed(3) ?? "—"}</TableCell>
                        <TableCell className="text-xs text-right">{cell.voltageV?.toFixed(3) ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        {isPending && (
          <Button onClick={handleStart} disabled={isBusy || !selectedMatchId} className="w-full h-12 text-base font-semibold bg-blue-600 hover:bg-blue-700">
            {startStage.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <PlayCircle className="h-5 w-5 mr-2" />
            Start Cell Allocation
          </Button>
        )}

        {isInProgress && (
          <Button onClick={handleConfirm} disabled={isBusy} className="w-full h-14 text-base font-semibold bg-orange-600 hover:bg-orange-700">
            {completeStage.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <CheckCircle2 className="h-5 w-5 mr-2" />
            Confirm Cell Allocation ({allocatedCells.length} cells)
          </Button>
        )}

        {stage.status === "approved" && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4" />
            Cell Allocation approved — {allocatedCells.length} cells registered in genealogy
          </div>
        )}

        {stage.status === "completed" && (
          <StageApprovalSection orderId={orderId} stageKey="cell_allocation" existingNotes={stage.notes} onRefresh={onRefresh} />
        )}
      </CardContent>
    </Card>
  );
}
