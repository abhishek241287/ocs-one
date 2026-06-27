import { useState, useRef, Fragment } from "react";
import { useFormKeyboardNav } from "@/hooks/use-form-keyboard-nav";
import { useModuleShortcuts } from "@/hooks/use-module-shortcuts";
import { ModuleHeader, OdsToolbar, OdsTableSkeleton, OdsEmptyState } from "@/components/ods";
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
import { useOdsNotify } from "@/hooks/use-ods-notify";
import {
  useListCellLots,
  useCreateCellLot,
  useGetCellLot,
  usePatchCellLot,
  useGetCellLotHistory,
} from "@workspace/api-client-react";
import { Plus, ChevronDown, ChevronUp, Loader2, Pencil, History } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

// ─── Lot stats pill row (lazy-loaded per lot) ────────────────────────────────

function LotStatsRow({ lotId }: { lotId: string }) {
  const { data } = useGetCellLot(lotId);
  if (!data?.stats) return null;
  const approved = data.stats.approved ?? 0;
  const rejected = data.stats.rejected ?? 0;
  const quarantine = data.stats.quarantine ?? 0;
  const reserved = data.stats.reserved ?? 0;
  return (
    <div className="flex gap-2 flex-wrap">
      {approved > 0 && <Badge className="bg-green-100 text-green-800 border-green-200">{approved} Approved</Badge>}
      {rejected > 0 && <Badge className="bg-red-100 text-red-800 border-red-200">{rejected} Rejected</Badge>}
      {quarantine > 0 && <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">{quarantine} Quarantine</Badge>}
      {reserved > 0 && <Badge className="bg-blue-100 text-blue-800 border-blue-200">{reserved} Reserved</Badge>}
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function LotStatusBadge({ status }: { status: string }) {
  if (status === "received") return <Badge variant="outline">Received</Badge>;
  if (status === "grading") return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Grading</Badge>;
  if (status === "complete") return <Badge className="bg-green-100 text-green-800 border-green-200">Complete</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

// ─── History dialog ───────────────────────────────────────────────────────────

function LotHistoryDialog({ lotId, open, onClose }: { lotId: string; open: boolean; onClose: () => void }) {
  const { data, isLoading } = useGetCellLotHistory(lotId);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lot History</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : data?.events.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No events recorded.</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {data?.events.map((ev) => (
              <li key={ev.id} className="border rounded-md p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium capitalize">{ev.eventType}</span>
                  <span className="text-xs text-muted-foreground">{new Date(ev.performedAt).toLocaleString()}</span>
                </div>
                <div className="text-muted-foreground">By: {ev.performedBy}</div>
                {ev.reason && <div className="text-muted-foreground">Reason: {ev.reason}</div>}
                {ev.changes && typeof ev.changes === "object" && Object.keys(ev.changes).length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-muted-foreground">Changes</summary>
                    <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-x-auto">
                      {JSON.stringify(ev.changes, null, 2)}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Create form defaults ─────────────────────────────────────────────────────

const DEFAULT_FORM = {
  supplier: "",
  manufacturer: "",
  cellModel: "",
  cellChemistry: "LiFePO4",
  nominalCapacityAh: "",
  lotNumber: "",
  invoiceNumber: "",
  dateReceived: new Date().toISOString().split("T")[0],
  quantityReceived: "",
  receivedBy: "",
  remarks: "",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CellReceivingPage() {
  const notify = useOdsNotify();
  const queryClient = useQueryClient();

  // List filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const searchRef = useRef<HTMLInputElement>(null);

  // Create dialog
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const formRef = useRef<HTMLFormElement>(null);
  useFormKeyboardNav({ ref: formRef, onSubmit: () => formRef.current?.requestSubmit() });
  useModuleShortcuts({ onNew: () => setOpen(true), searchRef });

  // Row expand + action dialogs
  const [expandedLot, setExpandedLot] = useState<string | null>(null);
  const [editLotId, setEditLotId] = useState<string | null>(null);
  const [historyLotId, setHistoryLotId] = useState<string | null>(null);

  // Edit form state
  const [editForm, setEditForm] = useState({
    supplier: "",
    manufacturer: "",
    cellModel: "",
    cellChemistry: "",
    nominalCapacityAh: "",
    invoiceNumber: "",
    dateReceived: "",
    receivedBy: "",
    remarks: "",
    reason: "",
  });

  // API hooks
  const { data, isLoading, isFetching, refetch } = useListCellLots({
    page,
    pageSize: 25,
    search: search || undefined,
    status: statusFilter !== "all" ? (statusFilter as "received" | "grading" | "complete") : undefined,
  });

  const createLot = useCreateCellLot({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/cells/lots"] });
        setOpen(false);
        setForm(DEFAULT_FORM);
        notify.success("Lot received", { description: "Individual cell records generated." });
      },
      onError: (e: any) => notify.error("Error", { description: e?.response?.data?.error ?? e?.message ?? "Failed" }),
    },
  });

  const patchLot = usePatchCellLot({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/cells/lots"] });
        setEditLotId(null);
        notify.success("Lot updated", { description: "Changes recorded in audit history." });
      },
      onError: (e: any) => notify.error("Error", { description: e?.response?.data?.error ?? e?.message ?? "Failed" }),
    },
  });

  // Create submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.supplier || !form.manufacturer || !form.cellModel || !form.nominalCapacityAh || !form.lotNumber || !form.dateReceived || !form.quantityReceived || !form.receivedBy) {
      notify.error("Required fields missing");
      return;
    }
    createLot.mutate({
      data: {
        supplier: form.supplier,
        manufacturer: form.manufacturer,
        cellModel: form.cellModel,
        cellChemistry: form.cellChemistry || "LiFePO4",
        nominalCapacityAh: parseFloat(form.nominalCapacityAh),
        lotNumber: form.lotNumber,
        invoiceNumber: form.invoiceNumber || null,
        dateReceived: form.dateReceived,
        quantityReceived: parseInt(form.quantityReceived),
        receivedBy: form.receivedBy,
        remarks: form.remarks || null,
      },
    });
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // Edit submit
  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editLotId) return;
    if (!editForm.reason.trim()) {
      notify.error("Reason required", { description: "Please provide a reason for this correction." });
      return;
    }
    patchLot.mutate({
      id: editLotId,
      data: {
        supplier: editForm.supplier || undefined,
        manufacturer: editForm.manufacturer || undefined,
        cellModel: editForm.cellModel || undefined,
        cellChemistry: editForm.cellChemistry || undefined,
        nominalCapacityAh: editForm.nominalCapacityAh ? parseFloat(editForm.nominalCapacityAh) : undefined,
        invoiceNumber: editForm.invoiceNumber || null,
        dateReceived: editForm.dateReceived || undefined,
        receivedBy: editForm.receivedBy || undefined,
        remarks: editForm.remarks || null,
        reason: editForm.reason,
      },
    });
  };

  const setEdit = (k: keyof typeof editForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setEditForm((f) => ({ ...f, [k]: e.target.value }));

  const openEditDialog = (lot: NonNullable<typeof data>["items"][number]) => {
    setEditForm({
      supplier: lot.supplier,
      manufacturer: lot.manufacturer,
      cellModel: lot.cellModel,
      cellChemistry: lot.cellChemistry,
      nominalCapacityAh: String(lot.nominalCapacityAh),
      invoiceNumber: lot.invoiceNumber ?? "",
      dateReceived: lot.dateReceived,
      receivedBy: lot.receivedBy,
      remarks: lot.remarks ?? "",
      reason: "",
    });
    setEditLotId(lot.id);
  };

  const lots = data?.items ?? [];
  const meta = data?.meta;

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto">
        <ModuleHeader
          icon="📦"
          title="Cell Receiving"
          description={`${meta?.total ?? 0} lots received`}
          actions={
            <Button onClick={() => setOpen(true)}>
              <Plus size={16} className="mr-1" /> Receive New Lot
            </Button>
          }
        />

        <div className="flex gap-3 items-end mb-4 flex-wrap">
          <OdsToolbar
            search={{
              value: search,
              onChange: (v) => { setSearch(v); setPage(1); },
              placeholder: "Search lot number, supplier, model…",
              ref: searchRef,
            }}
            onRefresh={() => refetch()}
            isRefreshing={isFetching}
          />
          <div className="flex items-center gap-2">
            <Label className="text-sm whitespace-nowrap">Status</Label>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-36 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="received">Received</SelectItem>
                <SelectItem value="grading">Grading</SelectItem>
                <SelectItem value="complete">Complete</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lot Number</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Manufacturer</TableHead>
                <TableHead>Cell Model</TableHead>
                <TableHead className="text-right">Nominal Cap.</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Date Received</TableHead>
                <TableHead>Received By</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Grading</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={11} className="p-0">
                    <OdsTableSkeleton rows={6} columns={11} />
                  </TableCell>
                </TableRow>
              ) : lots.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="p-0">
                    <OdsEmptyState
                      icon="📦"
                      title="No lots found"
                      description="Adjust filters or receive a new lot."
                      action={{ label: "Receive New Lot", onClick: () => setOpen(true) }}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                lots.map((lot) => (
                  <Fragment key={lot.id}>
                    <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => setExpandedLot(expandedLot === lot.id ? null : lot.id)}>
                      <TableCell className="font-mono font-medium">{lot.lotNumber}</TableCell>
                      <TableCell>{lot.supplier}</TableCell>
                      <TableCell>{lot.manufacturer}</TableCell>
                      <TableCell>{lot.cellModel}</TableCell>
                      <TableCell className="text-right">{lot.nominalCapacityAh} Ah</TableCell>
                      <TableCell className="text-right font-medium">{lot.quantityReceived}</TableCell>
                      <TableCell>{lot.dateReceived}</TableCell>
                      <TableCell>{lot.receivedBy}</TableCell>
                      <TableCell><LotStatusBadge status={lot.status} /></TableCell>
                      <TableCell><LotStatsRow lotId={lot.id} /></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            title="Edit lot"
                            onClick={() => openEditDialog(lot)}
                          >
                            <Pencil size={14} />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            title="View history"
                            onClick={() => setHistoryLotId(lot.id)}
                          >
                            <History size={14} />
                          </Button>
                          {expandedLot === lot.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedLot === lot.id && (
                      <TableRow>
                        <TableCell colSpan={11} className="bg-muted/30 px-6 py-3 text-sm">
                          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                            <div><span className="text-muted-foreground">Chemistry:</span> {lot.cellChemistry}</div>
                            <div><span className="text-muted-foreground">Invoice #:</span> {lot.invoiceNumber ?? "—"}</div>
                            <div><span className="text-muted-foreground">Remarks:</span> {lot.remarks ?? "—"}</div>
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            Cell IDs generated: CELL-{lot.dateReceived.replace(/-/g, "")}-000001 … {lot.quantityReceived}
                          </p>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))
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

      {/* ── Create dialog ── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Receive New Cell Lot</DialogTitle>
          </DialogHeader>
          <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Supplier *</Label>
                <Input value={form.supplier} onChange={set("supplier")} placeholder="e.g. CATL" />
              </div>
              <div className="space-y-1.5">
                <Label>Manufacturer *</Label>
                <Input value={form.manufacturer} onChange={set("manufacturer")} placeholder="e.g. CATL Technologies" />
              </div>
              <div className="space-y-1.5">
                <Label>Cell Model *</Label>
                <Input value={form.cellModel} onChange={set("cellModel")} placeholder="e.g. LFP-280Ah" />
              </div>
              <div className="space-y-1.5">
                <Label>Cell Chemistry</Label>
                <Input value={form.cellChemistry} onChange={set("cellChemistry")} placeholder="LiFePO4" />
              </div>
              <div className="space-y-1.5">
                <Label>Nominal Capacity (Ah) *</Label>
                <Input type="number" step="0.1" value={form.nominalCapacityAh} onChange={set("nominalCapacityAh")} placeholder="280" />
              </div>
              <div className="space-y-1.5">
                <Label>Lot Number *</Label>
                <Input value={form.lotNumber} onChange={set("lotNumber")} placeholder="LOT-2026-001" />
              </div>
              <div className="space-y-1.5">
                <Label>Invoice Number</Label>
                <Input value={form.invoiceNumber} onChange={set("invoiceNumber")} placeholder="INV-12345" />
              </div>
              <div className="space-y-1.5">
                <Label>Date Received *</Label>
                <Input type="date" value={form.dateReceived} onChange={set("dateReceived")} />
              </div>
              <div className="space-y-1.5">
                <Label>Quantity Received *</Label>
                <Input type="number" value={form.quantityReceived} onChange={set("quantityReceived")} placeholder="100" />
              </div>
              <div className="space-y-1.5">
                <Label>Received By *</Label>
                <Input value={form.receivedBy} onChange={set("receivedBy")} placeholder="Engineer name" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Remarks</Label>
              <Input value={form.remarks} onChange={set("remarks")} placeholder="Any additional notes..." />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createLot.isPending}>
                {createLot.isPending && <Loader2 size={14} className="mr-1 animate-spin" />}
                Receive Lot
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit dialog ── */}
      <Dialog open={!!editLotId} onOpenChange={(v) => !v && setEditLotId(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Cell Lot</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Supplier</Label>
                <Input value={editForm.supplier} onChange={setEdit("supplier")} />
              </div>
              <div className="space-y-1.5">
                <Label>Manufacturer</Label>
                <Input value={editForm.manufacturer} onChange={setEdit("manufacturer")} />
              </div>
              <div className="space-y-1.5">
                <Label>Cell Model</Label>
                <Input value={editForm.cellModel} onChange={setEdit("cellModel")} />
              </div>
              <div className="space-y-1.5">
                <Label>Cell Chemistry</Label>
                <Input value={editForm.cellChemistry} onChange={setEdit("cellChemistry")} />
              </div>
              <div className="space-y-1.5">
                <Label>Nominal Capacity (Ah)</Label>
                <Input type="number" step="0.1" value={editForm.nominalCapacityAh} onChange={setEdit("nominalCapacityAh")} />
              </div>
              <div className="space-y-1.5">
                <Label>Invoice Number</Label>
                <Input value={editForm.invoiceNumber} onChange={setEdit("invoiceNumber")} placeholder="INV-12345" />
              </div>
              <div className="space-y-1.5">
                <Label>Date Received</Label>
                <Input type="date" value={editForm.dateReceived} onChange={setEdit("dateReceived")} />
              </div>
              <div className="space-y-1.5">
                <Label>Received By</Label>
                <Input value={editForm.receivedBy} onChange={setEdit("receivedBy")} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Remarks</Label>
              <Input value={editForm.remarks} onChange={setEdit("remarks")} placeholder="Any additional notes..." />
            </div>
            <div className="space-y-1.5 border-t pt-3">
              <Label>Reason for correction *</Label>
              <Input value={editForm.reason} onChange={setEdit("reason")} placeholder="e.g. Corrected invoice number after vendor confirmation" />
              <p className="text-xs text-muted-foreground">Required — recorded in audit history.</p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditLotId(null)}>Cancel</Button>
              <Button type="submit" disabled={patchLot.isPending}>
                {patchLot.isPending && <Loader2 size={14} className="mr-1 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── History dialog ── */}
      {historyLotId && (
        <LotHistoryDialog
          lotId={historyLotId}
          open={!!historyLotId}
          onClose={() => setHistoryLotId(null)}
        />
      )}
    </AppLayout>
  );
}
