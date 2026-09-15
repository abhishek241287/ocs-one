import { useState, useRef, useMemo, Fragment } from "react";
import { Link } from "wouter";
import { useFormKeyboardNav } from "@/hooks/use-form-keyboard-nav";
import { useModuleShortcuts } from "@/hooks/use-module-shortcuts";
import { useTableKeyboardNav } from "@/hooks/use-table-keyboard-nav";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { ModuleHeader, OdsToolbar, OdsTableSkeleton, OdsEmptyState } from "@/components/ods";
import AppLayout from "@/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  useListCellStock,
  useListMaterialTransfers,
  useCreateMaterialTransfer,
} from "@workspace/api-client-react";
import { Plus, ChevronDown, ChevronUp, Loader2, Pencil, History, ArrowRightLeft, ExternalLink } from "lucide-react";
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
  if (status === "graded") return <Badge className="bg-green-100 text-green-800 border-green-200">Graded</Badge>;
  if (status === "complete") return <Badge className="bg-green-100 text-green-800 border-green-200">Complete</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

// ─── Event type display helpers ───────────────────────────────────────────────

const EVENT_META: Record<string, { label: string; dot: string }> = {
  lot_received:             { label: "Lot Received",            dot: "bg-blue-500" },
  cell_records_generated:   { label: "Cell Records Generated",  dot: "bg-blue-300" },
  grading_started:          { label: "Grading Started",         dot: "bg-yellow-500" },
  cell_graded:              { label: "Cell Graded",             dot: "bg-yellow-400" },
  lot_fully_graded:         { label: "Lot Fully Graded",        dot: "bg-green-500" },
  lot_updated:              { label: "Lot Updated",             dot: "bg-gray-400" },
  remarks_updated:          { label: "Remarks Updated",         dot: "bg-gray-300" },
  // legacy
  received:                 { label: "Lot Received",            dot: "bg-blue-500" },
  corrected:                { label: "Lot Updated",             dot: "bg-gray-400" },
  status_changed:           { label: "Status Changed",          dot: "bg-purple-400" },
};

function eventMeta(type: string) {
  return EVENT_META[type] ?? { label: type.replace(/_/g, " "), dot: "bg-gray-300" };
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

const Req = () => <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>;

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    day: "2-digit", month: "short", year: "numeric",
  });
}

// ─── History dialog ───────────────────────────────────────────────────────────

function LotHistoryDialog({ lotId, open, onClose }: { lotId: string; open: boolean; onClose: () => void }) {
  const { data, isLoading } = useGetCellLotHistory(lotId);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manufacturing Timeline</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : !data?.events.length ? (
          <p className="text-sm text-muted-foreground py-4">No events recorded.</p>
        ) : (
          <ol className="relative border-l border-border ml-3 space-y-0">
            {data.events.map((ev, idx) => {
              const meta = eventMeta(ev.eventType);
              const hasDetails = ev.changes && typeof ev.changes === "object" && Object.keys(ev.changes as object).length > 0;
              return (
                <li key={ev.id} className={`ml-4 ${idx < data.events.length - 1 ? "pb-6" : "pb-2"}`}>
                  <span className={`absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-background ${meta.dot}`} />
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{meta.label}</p>
                      <p className="mt-0.5 text-sm font-medium leading-snug">
                        {(ev as any).summary ?? ev.eventType}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {ev.performedBy}
                        {ev.reason ? ` · ${ev.reason}` : ""}
                      </p>
                    </div>
                    <time className="shrink-0 text-xs text-muted-foreground tabular-nums pt-0.5">
                      {new Date(ev.performedAt).toLocaleString(undefined, {
                        month: "short", day: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </time>
                  </div>
                  {hasDetails && (
                    <details className="mt-1.5">
                      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                        Details
                      </summary>
                      <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-x-auto leading-relaxed">
                        {JSON.stringify(ev.changes, null, 2)}
                      </pre>
                    </details>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Manual ("Historical Import") create form defaults ───────────────────────

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
  reason: "",
};

// ─── Transfer dialog defaults ────────────────────────────────────────────────

const DEFAULT_TRANSFER = {
  grnLineId: "",
  quantity: "",
  receivedBy: "",
  remarks: "",
};

// ═══════════════════════════════════════════════════════════════════════════════
// New Transfer dialog — inventory picker (cell-stock) → select line + qty → POST
// ═══════════════════════════════════════════════════════════════════════════════

function NewTransferDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const notify = useOdsNotify();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(DEFAULT_TRANSFER);

  const { data, isLoading } = useListCellStock(
    { search: search || undefined },
    { query: { enabled: open } } as any,
  );
  const lines = data?.items ?? [];
  const selected = useMemo(
    () => lines.find((l) => l.grn_line_id === form.grnLineId),
    [lines, form.grnLineId],
  );

  const createTransfer = useCreateMaterialTransfer({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/inventory/transfers"] });
        queryClient.invalidateQueries({ queryKey: ["/api/inventory/cell-stock"] });
        queryClient.invalidateQueries({ queryKey: ["/api/cells/lots"] });
        notify.success("Transfer recorded", { description: "Cell lot and individual cell records generated." });
        setForm(DEFAULT_TRANSFER);
        onClose();
      },
      onError: (e: any) =>
        notify.error("Transfer failed", { description: e?.response?.data?.error ?? e?.message ?? "Failed" }),
    },
  });

  const qtyNum = Number(form.quantity);
  const qtyValid = Number.isFinite(qtyNum) && qtyNum > 0 && (!selected || qtyNum <= selected.available_qty);
  const canSubmit = !!selected && selected.is_mapped && qtyValid && !createTransfer.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) {
      notify.error("Select a stock line to transfer");
      return;
    }
    if (!selected.is_mapped) {
      notify.error("Material not mapped", {
        description: "This material has no cell-master mapping. Set Cell Master on the Material Master first.",
      });
      return;
    }
    if (!qtyValid) {
      notify.error("Invalid quantity", { description: `Enter a quantity between 1 and ${selected.available_qty}.` });
      return;
    }
    createTransfer.mutate({
      data: {
        grn_line_id: selected.grn_line_id,
        quantity: qtyNum,
        received_by: form.receivedBy.trim() || null,
        remarks: form.remarks.trim() || null,
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setForm(DEFAULT_TRANSFER); onClose(); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Transfer From Inventory</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Search stock</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search material, GRN, supplier…"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Cell stock line<Req /></Label>
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 size={14} className="animate-spin" /> Loading available stock…
              </div>
            ) : lines.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No available cell stock. Receive and inspect a GRN for a LiFePO4 cell material first.
              </p>
            ) : (
              <Select value={form.grnLineId} onValueChange={(v) => setForm((f) => ({ ...f, grnLineId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a GRN line to transfer from…" />
                </SelectTrigger>
                <SelectContent>
                  {lines.map((l) => (
                    <SelectItem key={l.grn_line_id} value={l.grn_line_id} disabled={!l.is_mapped || l.available_qty <= 0}>
                      {l.material_name} · GRN {l.grn_number} · {l.available_qty} {l.uom} avail
                      {!l.is_mapped ? " · (unmapped)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {selected && (
            <>
              <div className="rounded-md border bg-muted/30 p-3 text-sm grid grid-cols-2 gap-x-4 gap-y-1.5 md:grid-cols-3">
                <div><span className="text-muted-foreground">Material:</span> {selected.material_name}</div>
                <div><span className="text-muted-foreground">GRN:</span> {selected.grn_number}</div>
                <div><span className="text-muted-foreground">Supplier:</span> {selected.supplier_name}</div>
                <div><span className="text-muted-foreground">Cell Model:</span> {selected.cell_model ?? "—"}</div>
                <div><span className="text-muted-foreground">Chemistry:</span> {selected.cell_chemistry ?? "—"}</div>
                <div><span className="text-muted-foreground">Capacity:</span> {selected.nominal_capacity_ah != null ? `${selected.nominal_capacity_ah} Ah` : "—"}</div>
                <div><span className="text-muted-foreground">Voltage:</span> {selected.nominal_voltage_v != null ? `${selected.nominal_voltage_v} V` : "—"}</div>
                <div><span className="text-muted-foreground">Supplier Lot:</span> {selected.supplier_lot_number ?? "—"}</div>
                <div><span className="text-muted-foreground">Available:</span> <strong>{selected.available_qty} {selected.uom}</strong></div>
              </div>
              {!selected.is_mapped && (
                <div className="rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2 text-sm text-yellow-800">
                  ⚠ This material has no cell-master mapping — set <strong>Cell Master</strong> on the Material Master before transferring.
                </div>
              )}
            </>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Quantity to transfer<Req /></Label>
              <Input
                type="number"
                min="1"
                step="1"
                value={form.quantity}
                onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                placeholder={selected ? `Max ${selected.available_qty}` : "0"}
              />
              {selected && qtyNum > selected.available_qty && (
                <p className="text-xs text-red-500">Exceeds available ({selected.available_qty}).</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Received By</Label>
              <Input
                value={form.receivedBy}
                onChange={(e) => setForm((f) => ({ ...f, receivedBy: e.target.value }))}
                placeholder="Engineer name (optional)"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Remarks</Label>
            <Input
              value={form.remarks}
              onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
              placeholder="Any additional notes (optional)"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => { setForm(DEFAULT_TRANSFER); onClose(); }}>Cancel</Button>
            <Button type="submit" disabled={!canSubmit}>
              {createTransfer.isPending && <Loader2 size={14} className="mr-1 animate-spin" />}
              Transfer to Cell Processing
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Transfers tab — transfer document list
// ═══════════════════════════════════════════════════════════════════════════════

function TransfersTab() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [transferOpen, setTransferOpen] = useState(false);

  const { data, isLoading, isFetching, refetch } = useListMaterialTransfers({
    page,
    pageSize: 25,
    search: search || undefined,
  } as any);

  const transfers = data?.items ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center justify-between flex-wrap">
        <OdsToolbar
          search={{
            value: search,
            onChange: (v) => { setSearch(v); setPage(1); },
            placeholder: "Search transfer no., material, GRN, supplier…",
          }}
          onRefresh={() => refetch()}
          isRefreshing={isFetching}
        />
        <Button onClick={() => setTransferOpen(true)}>
          <ArrowRightLeft size={16} className="mr-1" /> New Transfer
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Transfer No.</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Material</TableHead>
              <TableHead>GRN</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead>Cell Lot</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="p-0">
                  <OdsTableSkeleton rows={6} columns={8} />
                </TableCell>
              </TableRow>
            ) : transfers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="p-0">
                  <OdsEmptyState
                    icon="🔁"
                    title="No transfers yet"
                    description="Transfer received cell stock from inventory into Cell Processing."
                    action={{ label: "New Transfer", onClick: () => setTransferOpen(true) }}
                  />
                </TableCell>
              </TableRow>
            ) : (
              transfers.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono font-medium">{t.transfer_number}</TableCell>
                  <TableCell>{new Date(t.created_at).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}</TableCell>
                  <TableCell>{t.material_name ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{t.grn_number ?? "—"}</TableCell>
                  <TableCell>{t.supplier_name ?? "—"}</TableCell>
                  <TableCell className="text-right font-medium">{t.quantity} {t.uom}</TableCell>
                  <TableCell className="font-mono text-xs">{t.lot_number ?? "—"}</TableCell>
                  <TableCell>
                    <Link href={`/cells/transfers/${t.id}`}>
                      <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs">
                        <ExternalLink size={13} /> View
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
          <span className="text-sm self-center">Page {page} of {meta.totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= meta.totalPages}>Next</Button>
        </div>
      )}

      <NewTransferDialog open={transferOpen} onClose={() => setTransferOpen(false)} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Cell Lots tab — existing lot list + edit + history + director-only manual import
// ═══════════════════════════════════════════════════════════════════════════════

function CellLotsTab() {
  const notify = useOdsNotify();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isDirector = user?.role === "director";

  // List filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const searchRef = useRef<HTMLInputElement>(null);

  // Create dialog (Historical Import / Emergency Recovery — director only)
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const formRef = useRef<HTMLFormElement>(null);
  useFormKeyboardNav({ ref: formRef, onSubmit: () => formRef.current?.requestSubmit() });
  useModuleShortcuts({ onNew: () => { if (isDirector) setOpen(true); }, searchRef });

  // Row expand + action dialogs
  const [expandedLot, setExpandedLot] = useState<string | null>(null);
  const [editLotId, setEditLotId] = useState<string | null>(null);
  const [historyLotId, setHistoryLotId] = useState<string | null>(null);

  // Edit form state
  const [editLotStatus, setEditLotStatus] = useState<string>("received");
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

  const { data, isLoading, isFetching, refetch } = useListCellLots({
    page,
    pageSize: 25,
    search: search || undefined,
    status: statusFilter !== "all" ? (statusFilter as "received" | "grading" | "graded" | "complete") : undefined,
  });

  const createLot = useCreateCellLot({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/cells/lots"] });
        setConfirmOpen(false);
        setOpen(false);
        setForm(DEFAULT_FORM);
        notify.success("Lot imported", { description: "Individual cell records generated." });
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const REQUIRED: Array<[keyof typeof form, string]> = [
      ["supplier", "Supplier"], ["manufacturer", "Manufacturer"], ["cellModel", "Cell Model"],
      ["nominalCapacityAh", "Nominal Capacity"], ["lotNumber", "Lot Number"],
      ["dateReceived", "Date Received"], ["quantityReceived", "Quantity Received"], ["receivedBy", "Received By"],
    ];
    const missing = REQUIRED.filter(([k]) => !form[k]).map(([, label]) => label);
    if (missing.length) {
      notify.error("Required fields missing", { description: missing.join(", ") });
      return;
    }
    if (!form.reason.trim()) {
      notify.error("Reason required", {
        description: "A justification is mandatory for a manual historical import.",
      });
      return;
    }
    // Confirm before bypassing the inventory production path.
    setConfirmOpen(true);
  };

  const doImport = () => {
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
        reason: form.reason,
      },
    });
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

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
    setEditLotStatus(lot.status);
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

  const kbd = useTableKeyboardNav({
    rowCount: lots.length,
    enabled: !isLoading,
    onEnter: (i) => {
      const lot = lots[i];
      if (lot) openEditDialog(lot);
    },
    onHistory: (i) => {
      const lot = lots[i];
      if (lot) setHistoryLotId(lot.id);
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-end justify-between flex-wrap">
        <div className="flex gap-3 items-end flex-wrap">
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
                <SelectItem value="graded">Graded</SelectItem>
                <SelectItem value="complete">Complete</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {isDirector && (
          <Button variant="outline" onClick={() => setOpen(true)}>
            <Plus size={16} className="mr-1" /> Historical Import
          </Button>
        )}
      </div>

      {isDirector && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          <strong>Historical Import / Emergency Recovery</strong> — manual lot entry bypasses inventory and is director-only.
          Production cell intake must flow through <strong>Transfers</strong> from inventory.
        </div>
      )}

      <div
        {...(!isLoading && lots.length > 0 ? kbd.containerProps : {})}
        className="rounded-md border outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
      >
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
                    description="Cell lots appear here once stock is transferred from inventory."
                  />
                </TableCell>
              </TableRow>
            ) : (
              lots.map((lot, rowIndex) => (
                <Fragment key={lot.id}>
                  <TableRow
                    ref={kbd.registerRow(rowIndex)}
                    role="row"
                    aria-selected={kbd.selectedIndex === rowIndex}
                    className={cn(
                      "cursor-pointer",
                      kbd.selectedIndex === rowIndex && "bg-blue-50",
                      kbd.activeIndex === rowIndex
                        ? "ring-2 ring-inset ring-blue-500 bg-blue-50/60"
                        : "hover:bg-muted/50"
                    )}
                    onClick={() => {
                      kbd.setActiveIndex(rowIndex);
                      setExpandedLot(expandedLot === lot.id ? null : lot.id);
                    }}
                  >
                    <TableCell className="font-mono font-medium">
                      <Link
                        href={`/cells/lots/${lot.id}`}
                        className="text-primary hover:underline"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {lot.lotNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{lot.supplier}</TableCell>
                    <TableCell>{lot.manufacturer}</TableCell>
                    <TableCell>{lot.cellModel}</TableCell>
                    <TableCell className="text-right">{lot.nominalCapacityAh} Ah</TableCell>
                    <TableCell className="text-right font-medium">{lot.quantityReceived}</TableCell>
                    <TableCell>{formatDate(lot.dateReceived)}</TableCell>
                    <TableCell>{lot.receivedBy}</TableCell>
                    <TableCell><LotStatusBadge status={lot.status} /></TableCell>
                    <TableCell><LotStatsRow lotId={lot.id} /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          aria-label="Edit lot"
                          title="Edit lot"
                          onClick={() => openEditDialog(lot)}
                        >
                          <Pencil size={14} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          aria-label="View manufacturing timeline"
                          title="View manufacturing timeline"
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

      {!isLoading && lots.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Tip: click the table, then use <kbd className="rounded border px-1">↑</kbd>{" "}
          <kbd className="rounded border px-1">↓</kbd> to move,{" "}
          <kbd className="rounded border px-1">Enter</kbd> to edit,{" "}
          <kbd className="rounded border px-1">H</kbd> for history,{" "}
          <kbd className="rounded border px-1">Space</kbd> to select,{" "}
          <kbd className="rounded border px-1">Esc</kbd> to clear.
        </p>
      )}

      {meta && meta.totalPages > 1 && (
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
          <span className="text-sm self-center">Page {page} of {meta.totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= meta.totalPages}>Next</Button>
        </div>
      )}

      {/* ── Historical Import dialog (director only) ── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Historical Import / Emergency Recovery</DialogTitle>
          </DialogHeader>
          <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 mb-1">
            Manual lot entry bypasses inventory stock. Use only for migrating historical records or emergency recovery.
          </div>
          <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Supplier<Req /></Label>
                <Input value={form.supplier} onChange={set("supplier")} placeholder="e.g. CATL" />
              </div>
              <div className="space-y-1.5">
                <Label>Manufacturer<Req /></Label>
                <Input value={form.manufacturer} onChange={set("manufacturer")} placeholder="e.g. CATL Technologies" />
              </div>
              <div className="space-y-1.5">
                <Label>Cell Model<Req /></Label>
                <Input value={form.cellModel} onChange={set("cellModel")} placeholder="e.g. LFP-280Ah" />
              </div>
              <div className="space-y-1.5">
                <Label>Cell Chemistry</Label>
                <Input value={form.cellChemistry} onChange={set("cellChemistry")} placeholder="LiFePO4" />
              </div>
              <div className="space-y-1.5">
                <Label>Nominal Capacity (Ah)<Req /></Label>
                <Input type="number" step="0.1" value={form.nominalCapacityAh} onChange={set("nominalCapacityAh")} placeholder="280" />
              </div>
              <div className="space-y-1.5">
                <Label>Lot Number<Req /></Label>
                <Input value={form.lotNumber} onChange={set("lotNumber")} placeholder="LOT-2026-001" />
              </div>
              <div className="space-y-1.5">
                <Label>Invoice Number</Label>
                <Input value={form.invoiceNumber} onChange={set("invoiceNumber")} placeholder="INV-12345" />
              </div>
              <div className="space-y-1.5">
                <Label>Date Received<Req /></Label>
                <Input type="date" value={form.dateReceived} onChange={set("dateReceived")} />
              </div>
              <div className="space-y-1.5">
                <Label>Quantity Received<Req /></Label>
                <Input type="number" value={form.quantityReceived} onChange={set("quantityReceived")} placeholder="100" />
              </div>
              <div className="space-y-1.5">
                <Label>Received By<Req /></Label>
                <Input value={form.receivedBy} onChange={set("receivedBy")} placeholder="Engineer name" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Remarks</Label>
              <Input value={form.remarks} onChange={set("remarks")} placeholder="Any additional notes..." />
            </div>
            <div className="space-y-1.5">
              <Label>Reason for Manual Import<Req /></Label>
              <Input
                value={form.reason}
                onChange={set("reason")}
                placeholder="Mandatory justification — recorded to the audit trail"
              />
              <p className="text-xs text-muted-foreground">
                Why is this lot being entered manually instead of via Inventory? This is logged to the security audit.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createLot.isPending}>
                {createLot.isPending && <Loader2 size={14} className="mr-1 animate-spin" />}
                Import Lot
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Historical Import confirmation ── */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Historical Import</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              This creates <strong>{form.quantityReceived || 0}</strong> cell record(s) for lot{" "}
              <strong className="font-mono">{form.lotNumber}</strong> <strong>outside</strong> the normal
              Inventory → Material Transfer path. Inventory stock will <strong>not</strong> be netted.
            </div>
            <div className="text-muted-foreground">
              <span className="font-medium text-foreground">Reason:</span> {form.reason}
            </div>
            <p className="text-muted-foreground">This action is recorded to the security audit trail. Proceed?</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button type="button" onClick={doImport} disabled={createLot.isPending}>
              {createLot.isPending && <Loader2 size={14} className="mr-1 animate-spin" />}
              Confirm Import
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Edit dialog ── */}
      <Dialog open={!!editLotId} onOpenChange={(v) => !v && setEditLotId(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Cell Lot</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            {editLotStatus !== "received" && (
              <div className="rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2 text-sm text-yellow-800">
                🔒 This lot is in <strong>{editLotStatus}</strong> status — Supplier, Cell Model, and Date Received are locked. Only remarks and non-identifying fields can be changed.
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className={editLotStatus !== "received" ? "text-muted-foreground" : ""}>
                  Supplier {editLotStatus !== "received" && <span className="text-xs">(locked)</span>}
                </Label>
                <Input value={editForm.supplier} onChange={setEdit("supplier")} disabled={editLotStatus !== "received"} />
              </div>
              <div className="space-y-1.5">
                <Label>Manufacturer</Label>
                <Input value={editForm.manufacturer} onChange={setEdit("manufacturer")} />
              </div>
              <div className="space-y-1.5">
                <Label className={editLotStatus !== "received" ? "text-muted-foreground" : ""}>
                  Cell Model {editLotStatus !== "received" && <span className="text-xs">(locked)</span>}
                </Label>
                <Input value={editForm.cellModel} onChange={setEdit("cellModel")} disabled={editLotStatus !== "received"} />
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
                <Label className={editLotStatus !== "received" ? "text-muted-foreground" : ""}>
                  Date Received {editLotStatus !== "received" && <span className="text-xs">(locked)</span>}
                </Label>
                <Input type="date" value={editForm.dateReceived} onChange={setEdit("dateReceived")} disabled={editLotStatus !== "received"} />
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
              <Label>Reason for correction<Req /></Label>
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

      {historyLotId && (
        <LotHistoryDialog lotId={historyLotId} open={!!historyLotId} onClose={() => setHistoryLotId(null)} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════════════════════════

export default function CellReceivingPage() {
  const [tab, setTab] = useState("transfers");

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto">
        <ModuleHeader
          icon="📦"
          title="Receive From Inventory"
          description="Transfer received cell stock from inventory into Cell Processing"
        />

        <Tabs value={tab} onValueChange={setTab} className="mt-2">
          <TabsList>
            <TabsTrigger value="transfers">Transfers</TabsTrigger>
            <TabsTrigger value="lots">Cell Lots</TabsTrigger>
          </TabsList>
          <TabsContent value="transfers" className="mt-4">
            <TransfersTab />
          </TabsContent>
          <TabsContent value="lots" className="mt-4">
            <CellLotsTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
