import { useState, useRef } from "react";
import { useFormKeyboardNav } from "@/hooks/use-form-keyboard-nav";
import { useModuleShortcuts } from "@/hooks/use-module-shortcuts";
import { ModuleHeader, OdsToolbar, OdsTableSkeleton, OdsEmptyState } from "@/components/ods";
import AppLayout from "@/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOdsNotify } from "@/hooks/use-ods-notify";
import { useListCells, useGradeCell } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const GRADE_BADGE: Record<string, string> = {
  A: "bg-green-500 text-white",
  B: "bg-blue-500 text-white",
  C: "bg-yellow-500 text-white",
  reject: "bg-red-500 text-white",
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  received: { label: "Received", className: "bg-gray-100 text-gray-700 border-gray-200" },
  grading: { label: "Grading", className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  approved: { label: "Approved", className: "bg-green-100 text-green-800 border-green-200" },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-800 border-red-200" },
  quarantine: { label: "Quarantine", className: "bg-orange-100 text-orange-800 border-orange-200" },
};

const DEFAULT_GRADE_FORM = {
  voltageV: "",
  capacityAh: "",
  internalResistanceMohm: "",
  temperatureC: "",
  gradingMachineId: "",
  gradedBy: "",
  gradingNotes: "",
  overrideStatus: "none",
};

type GradeForm = typeof DEFAULT_GRADE_FORM;

export default function CellGradingPage() {
  const notify = useOdsNotify();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [selectedCellLabel, setSelectedCellLabel] = useState<string>("");
  const [form, setForm] = useState<GradeForm>(DEFAULT_GRADE_FORM);
  const formRef = useRef<HTMLFormElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useFormKeyboardNav({ ref: formRef, onSubmit: () => formRef.current?.requestSubmit() });
  useModuleShortcuts({ searchRef });

  const status = tab === "pending" ? "received" : undefined;

  const { data, isLoading, isFetching, refetch } = useListCells({
    page,
    pageSize: 50,
    search: search || undefined,
    status: status as any,
  });

  const gradeCell = useGradeCell({
    mutation: {
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: ["/api/cells"] });
        queryClient.invalidateQueries({ queryKey: ["/api/cells/inventory"] });
        setSelectedCellId(null);
        setForm(DEFAULT_GRADE_FORM);
        const grade = (result as any).grade ?? "unknown";
        const status = (result as any).status;
        notify.success(`Cell graded — Grade ${grade}`, { description: `Status set to ${status}` });
      },
      onError: (e: any) =>
        notify.error("Grading failed", { description: e?.message }),
    },
  });

  const handleGrade = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCellId) return;
    if (!form.voltageV || !form.capacityAh || !form.internalResistanceMohm || !form.gradedBy) {
      notify.error("Required fields missing");
      return;
    }
    gradeCell.mutate({
      id: selectedCellId,
      data: {
        voltageV: parseFloat(form.voltageV),
        capacityAh: parseFloat(form.capacityAh),
        internalResistanceMohm: parseFloat(form.internalResistanceMohm),
        temperatureC: form.temperatureC ? parseFloat(form.temperatureC) : null,
        gradingMachineId: form.gradingMachineId || null,
        gradedBy: form.gradedBy,
        gradingNotes: form.gradingNotes || null,
        overrideStatus:
          form.overrideStatus !== "none" ? (form.overrideStatus as "approved" | "rejected" | "quarantine") : null,
      },
    });
  };

  const set = (k: keyof GradeForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const cells = data?.items ?? [];
  const meta = data?.meta;

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto">
        <ModuleHeader
          icon="🔬"
          title="Cell Grading"
          description="Record grading measurements — grade is auto-calculated from tolerance rules"
          certification="development"
        />

        <OdsToolbar
          onRefresh={() => refetch()}
          isRefreshing={isFetching}
          search={{
            value: search,
            onChange: (v) => { setSearch(v); setPage(1); },
            placeholder: "Search cell ID…",
            ref: searchRef,
          }}
          filters={
            <div className="flex rounded-md border overflow-hidden">
              <button
                className={`px-4 py-1.5 text-sm font-medium ${tab === "pending" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                onClick={() => { setTab("pending"); setPage(1); }}
              >
                Pending Grading
              </button>
              <button
                className={`px-4 py-1.5 text-sm font-medium ${tab === "all" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                onClick={() => { setTab("all"); setPage(1); }}
              >
                All Cells
              </button>
            </div>
          }
        />

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cell ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Grade</TableHead>
                <TableHead className="text-right">Voltage (V)</TableHead>
                <TableHead className="text-right">Capacity (Ah)</TableHead>
                <TableHead className="text-right">IR (mΩ)</TableHead>
                <TableHead>Graded By</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="p-0">
                    <OdsTableSkeleton rows={6} columns={8} />
                  </TableCell>
                </TableRow>
              ) : cells.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="p-0">
                    <OdsEmptyState
                      icon="🔬"
                      title={tab === "pending" ? "No cells pending grading" : "No cells found"}
                      description={tab === "pending" ? "All received cells have been graded." : "Receive and grade cells to see them here."}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                cells.map((cell) => {
                  const sb = STATUS_BADGE[cell.status] ?? STATUS_BADGE.received;
                  const canGrade = cell.status === "received" || cell.status === "grading";
                  return (
                    <TableRow key={cell.id}>
                      <TableCell className="font-mono text-xs font-medium">{cell.cellId}</TableCell>
                      <TableCell>
                        <Badge className={sb.className}>{sb.label}</Badge>
                      </TableCell>
                      <TableCell>
                        {cell.grade ? (
                          <Badge className={GRADE_BADGE[cell.grade] ?? ""}>{cell.grade}</Badge>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-right">{cell.voltageV?.toFixed(3) ?? "—"}</TableCell>
                      <TableCell className="text-right">{cell.capacityAh?.toFixed(2) ?? "—"}</TableCell>
                      <TableCell className="text-right">{cell.internalResistanceMohm?.toFixed(3) ?? "—"}</TableCell>
                      <TableCell className="text-sm">{cell.gradedBy ?? "—"}</TableCell>
                      <TableCell>
                        {canGrade && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedCellId(cell.id);
                              setSelectedCellLabel(cell.cellId);
                              setForm(DEFAULT_GRADE_FORM);
                            }}
                          >
                            Grade
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {meta && meta.totalPages > 1 && (
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
            <span className="text-sm self-center">Page {page} of {meta.totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= meta.totalPages}>Next</Button>
          </div>
        )}
      </div>

      <Dialog open={!!selectedCellId} onOpenChange={(o) => !o && setSelectedCellId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Grade Cell — <span className="font-mono text-primary">{selectedCellLabel}</span></DialogTitle>
          </DialogHeader>
          <form ref={formRef} onSubmit={handleGrade} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Voltage (V) *</Label>
                <Input type="number" step="0.001" value={form.voltageV} onChange={set("voltageV")} placeholder="3.300" />
              </div>
              <div className="space-y-1.5">
                <Label>Capacity (Ah) *</Label>
                <Input type="number" step="0.01" value={form.capacityAh} onChange={set("capacityAh")} placeholder="280.00" />
              </div>
              <div className="space-y-1.5">
                <Label>Internal Resistance (mΩ) *</Label>
                <Input type="number" step="0.001" value={form.internalResistanceMohm} onChange={set("internalResistanceMohm")} placeholder="0.280" />
              </div>
              <div className="space-y-1.5">
                <Label>Temperature (°C)</Label>
                <Input type="number" step="0.1" value={form.temperatureC} onChange={set("temperatureC")} placeholder="25.0" />
              </div>
              <div className="space-y-1.5">
                <Label>Grading Machine ID</Label>
                <Input value={form.gradingMachineId} onChange={set("gradingMachineId")} placeholder="MACH-01" />
              </div>
              <div className="space-y-1.5">
                <Label>Operator *</Label>
                <Input value={form.gradedBy} onChange={set("gradedBy")} placeholder="Operator name" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={form.gradingNotes} onChange={set("gradingNotes")} placeholder="Any observations..." />
            </div>
            <div className="space-y-1.5">
              <Label>Override Status (optional)</Label>
              <Select
                value={form.overrideStatus}
                onValueChange={(v) => setForm((f) => ({ ...f, overrideStatus: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Auto-calculate from grade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Auto (from grade)</SelectItem>
                  <SelectItem value="approved">Force Approve</SelectItem>
                  <SelectItem value="rejected">Force Reject</SelectItem>
                  <SelectItem value="quarantine">Quarantine</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground bg-muted rounded p-2">
              Grade is automatically calculated based on tolerance rules in Grade Configuration.
              Grade A/B/C → Approved. Grade Reject → Rejected.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setSelectedCellId(null)}>Cancel</Button>
              <Button type="submit" disabled={gradeCell.isPending}>
                {gradeCell.isPending && <Loader2 size={14} className="mr-1 animate-spin" />}
                Record Grade
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
