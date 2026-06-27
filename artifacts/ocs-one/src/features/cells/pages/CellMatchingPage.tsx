import { useState, useRef } from "react";
import { useFormKeyboardNav } from "@/hooks/use-form-keyboard-nav";
import AppLayout from "@/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  useListCellMatches,
  useCreateCellMatch,
  useGetCellMatch,
  useAcceptCellMatch,
  useRegenerateCellMatch,
} from "@workspace/api-client-react";
import { BrainCircuit, Plus, RefreshCw, CheckCircle, Loader2, ChevronRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const MATCH_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-gray-100 text-gray-700 border-gray-200" },
  reserved: { label: "Reserved", className: "bg-blue-100 text-blue-800 border-blue-200" },
  allocated: { label: "Allocated", className: "bg-purple-100 text-purple-800 border-purple-200" },
  cancelled: { label: "Cancelled", className: "bg-red-100 text-red-800 border-red-200" },
};

function ScoreBadge({ score }: { score: number }) {
  const cls =
    score >= 90 ? "bg-green-500" : score >= 75 ? "bg-yellow-500" : "bg-red-500";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold text-white ${cls}`}>
      {score.toFixed(1)}%
    </span>
  );
}

function MatchDetailPanel({ matchId, onClose }: { matchId: string; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useGetCellMatch(matchId);
  const accept = useAcceptCellMatch({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/cells/matches"] });
        queryClient.invalidateQueries({ queryKey: [`/api/cells/matches/${matchId}`] });
        queryClient.invalidateQueries({ queryKey: ["/api/cells/inventory"] });
        toast({ title: "Cells reserved", description: "All selected cells are now reserved for this match." });
      },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    },
  });
  const regenerate = useRegenerateCellMatch({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [`/api/cells/matches/${matchId}`] });
        toast({ title: "New match generated" });
      },
      onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
    },
  });

  if (isLoading || !data) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  const matchData = data as any;
  const batteries = matchData.batteries ?? [];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex items-center justify-between p-4 border-b">
        <div>
          <h2 className="font-semibold text-lg">{matchData.batteryModel}</h2>
          <p className="text-sm text-muted-foreground">
            {matchData.quantity} × {matchData.cellsPerBattery} cells · Created by {matchData.createdBy}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {matchData.matchScore != null && <ScoreBadge score={matchData.matchScore} />}
          {(() => {
            const sb = MATCH_STATUS_BADGE[matchData.status] ?? MATCH_STATUS_BADGE.draft;
            return <Badge className={sb.className}>{sb.label}</Badge>;
          })()}
        </div>
      </div>

      {matchData.status === "draft" && (
        <div className="flex gap-2 p-4 border-b bg-muted/30">
          <Button
            size="sm"
            onClick={() => accept.mutate({ id: matchId })}
            disabled={accept.isPending}
          >
            {accept.isPending ? <Loader2 size={14} className="mr-1 animate-spin" /> : <CheckCircle size={14} className="mr-1" />}
            Accept & Reserve
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => regenerate.mutate({ id: matchId })}
            disabled={regenerate.isPending}
          >
            {regenerate.isPending ? <Loader2 size={14} className="mr-1 animate-spin" /> : <RefreshCw size={14} className="mr-1" />}
            Generate New Match
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </div>
      )}

      <div className="p-4 space-y-4">
        {batteries.map((battery: any) => (
          <div key={battery.slot} className="rounded-lg border">
            <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
              <span className="font-medium text-sm">Battery {battery.slot}</span>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>Avg Cap: <strong>{battery.avgCapacityAh?.toFixed(2)} Ah</strong></span>
                <span>Max ΔCap: <strong>{battery.maxCapacityDiff?.toFixed(3)} Ah</strong></span>
                <span>Avg IR: <strong>{battery.avgIrMohm?.toFixed(3)} mΩ</strong></span>
                <span>Max ΔIR: <strong>{battery.maxIrDiff?.toFixed(4)} mΩ</strong></span>
                <ScoreBadge score={battery.matchScore} />
              </div>
            </div>
            <div className="p-3">
              <div className="grid grid-cols-4 gap-1">
                {(battery.cells ?? []).map((cell: any, i: number) => (
                  <div key={cell.id} className="rounded border px-2 py-1.5 bg-card text-xs">
                    <p className="font-mono text-muted-foreground text-[10px]">#{i + 1}</p>
                    <p className="font-mono font-medium truncate">{cell.cellId}</p>
                    <p className="text-muted-foreground">{cell.capacityAh?.toFixed(2)} Ah · {cell.internalResistanceMohm?.toFixed(3)} mΩ</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const DEFAULT_FORM = {
  batteryModel: "",
  quantity: "1",
  cellsPerBattery: "16",
  createdBy: "",
  notes: "",
};

export default function CellMatchingPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const formRef = useRef<HTMLFormElement>(null);
  useFormKeyboardNav({ ref: formRef, onSubmit: () => formRef.current?.requestSubmit() });
  const [page, setPage] = useState(1);

  const { data, isLoading } = useListCellMatches({ page, pageSize: 25 });
  const createMatch = useCreateCellMatch({
    mutation: {
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: ["/api/cells/matches"] });
        setOpen(false);
        setForm(DEFAULT_FORM);
        setSelectedMatchId((result as any).id);
        toast({ title: "Match generated", description: `Score: ${(result as any).matchScore?.toFixed(1)}%` });
      },
      onError: (e: any) =>
        toast({ title: "Matching failed", description: e?.message ?? "Not enough approved cells", variant: "destructive" }),
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.batteryModel || !form.quantity || !form.createdBy) {
      toast({ title: "Required fields missing", variant: "destructive" });
      return;
    }
    createMatch.mutate({
      data: {
        batteryModel: form.batteryModel,
        quantity: parseInt(form.quantity),
        cellsPerBattery: parseInt(form.cellsPerBattery) || 16,
        createdBy: form.createdBy,
        notes: form.notes || null,
      },
    });
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const matches = data?.items ?? [];
  const meta = data?.meta;

  return (
    <AppLayout>
      <div className="flex h-full">
        {/* List panel */}
        <div className={`flex flex-col border-r ${selectedMatchId ? "w-96 shrink-0" : "flex-1 p-6"}`}>
          {!selectedMatchId && (
            <div className="max-w-7xl mx-auto w-full">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-bold flex items-center gap-2">
                    <BrainCircuit className="text-primary" size={24} />
                    Intelligent Cell Matching
                  </h1>
                  <p className="text-muted-foreground text-sm mt-1">
                    Algorithm selects optimally-matched cell groups for each battery
                  </p>
                </div>
                <Button onClick={() => setOpen(true)}>
                  <Plus size={16} className="mr-1" /> New Match
                </Button>
              </div>
            </div>
          )}

          {selectedMatchId && (
            <div className="flex items-center gap-2 p-4 border-b">
              <BrainCircuit size={18} className="text-primary" />
              <span className="font-semibold">Cell Matches</span>
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setOpen(true)}>
                <Plus size={14} className="mr-1" /> New
              </Button>
            </div>
          )}

          <div className={selectedMatchId ? "overflow-y-auto flex-1" : ""}>
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="animate-spin text-muted-foreground" />
              </div>
            ) : matches.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground">
                <BrainCircuit size={32} className="mx-auto mb-3 opacity-30" />
                <p>No matches yet</p>
                <p className="text-sm">Create a match to group cells for a battery</p>
                {!selectedMatchId && (
                  <Button className="mt-4" onClick={() => setOpen(true)}>
                    <Plus size={14} className="mr-1" /> New Match
                  </Button>
                )}
              </div>
            ) : (
              <div className={selectedMatchId ? "divide-y" : "rounded-md border"}>
                {selectedMatchId ? (
                  matches.map((match) => {
                    const sb = MATCH_STATUS_BADGE[match.status] ?? MATCH_STATUS_BADGE.draft;
                    return (
                      <button
                        key={match.id}
                        className={`w-full text-left p-4 hover:bg-muted/50 flex items-center gap-2 ${selectedMatchId === match.id ? "bg-muted" : ""}`}
                        onClick={() => setSelectedMatchId(match.id)}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{match.batteryModel}</p>
                          <p className="text-xs text-muted-foreground">{match.quantity} battery × {match.cellsPerBattery} cells</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <Badge className={`text-xs ${sb.className}`}>{sb.label}</Badge>
                          {match.matchScore != null && <ScoreBadge score={match.matchScore} />}
                        </div>
                        <ChevronRight size={14} className="text-muted-foreground" />
                      </button>
                    );
                  })
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Battery Model</TableHead>
                        <TableHead>Configuration</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Match Score</TableHead>
                        <TableHead>Created By</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {matches.map((match) => {
                        const sb = MATCH_STATUS_BADGE[match.status] ?? MATCH_STATUS_BADGE.draft;
                        return (
                          <TableRow key={match.id} className="cursor-pointer" onClick={() => setSelectedMatchId(match.id)}>
                            <TableCell className="font-medium">{match.batteryModel}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{match.quantity} × {match.cellsPerBattery} cells</TableCell>
                            <TableCell><Badge className={sb.className}>{sb.label}</Badge></TableCell>
                            <TableCell>
                              {match.matchScore != null ? <ScoreBadge score={match.matchScore} /> : "—"}
                            </TableCell>
                            <TableCell>{match.createdBy}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {new Date(match.createdAt).toLocaleDateString()}
                            </TableCell>
                            <TableCell><ChevronRight size={14} className="text-muted-foreground" /></TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>
            )}

            {meta && meta.totalPages > 1 && (
              <div className="flex gap-2 justify-end mt-4 px-4">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
                <span className="text-sm self-center">Page {page} of {meta.totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= meta.totalPages}>Next</Button>
              </div>
            )}
          </div>
        </div>

        {/* Detail panel */}
        {selectedMatchId && (
          <MatchDetailPanel matchId={selectedMatchId} onClose={() => setSelectedMatchId(null)} />
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BrainCircuit size={18} />
              New Intelligent Match
            </DialogTitle>
          </DialogHeader>
          <form ref={formRef} onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Battery Model *</Label>
              <Input value={form.batteryModel} onChange={set("batteryModel")} placeholder="e.g. OCS-48V-280Ah" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Quantity (batteries) *</Label>
                <Input type="number" min="1" value={form.quantity} onChange={set("quantity")} placeholder="1" />
              </div>
              <div className="space-y-1.5">
                <Label>Cells per Battery</Label>
                <Input type="number" min="1" value={form.cellsPerBattery} onChange={set("cellsPerBattery")} placeholder="16" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Created By *</Label>
              <Input value={form.createdBy} onChange={set("createdBy")} placeholder="Factory Manager name" />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={set("notes")} placeholder="Any additional context..." />
            </div>
            <div className="bg-muted/50 rounded p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">How matching works:</p>
              <p>• Selects from all approved, unreserved cells</p>
              <p>• Sorts by capacity, finds tightest group</p>
              <p>• Minimises capacity and IR spread within each battery</p>
              <p>• Score = 100 − capacity penalty − IR penalty</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMatch.isPending}>
                {createMatch.isPending ? <Loader2 size={14} className="mr-1 animate-spin" /> : <BrainCircuit size={14} className="mr-1" />}
                Run Matching
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
