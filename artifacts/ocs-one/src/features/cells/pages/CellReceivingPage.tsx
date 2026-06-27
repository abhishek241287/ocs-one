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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useOdsNotify } from "@/hooks/use-ods-notify";
import { useListCellLots, useCreateCellLot, useGetCellLot } from "@workspace/api-client-react";
import { Plus, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

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

export default function CellReceivingPage() {
  const notify = useOdsNotify();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [expandedLot, setExpandedLot] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useFormKeyboardNav({ ref: formRef, onSubmit: () => formRef.current?.requestSubmit() });
  useModuleShortcuts({ onNew: () => setOpen(true), searchRef });

  const { data, isLoading, isFetching, refetch } = useListCellLots({ page, pageSize: 25, search: search || undefined });
  const createLot = useCreateCellLot({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/cells/lots"] });
        setOpen(false);
        setForm(DEFAULT_FORM);
        notify.success("Lot received", { description: "Individual cell records generated." });
      },
      onError: (e: any) => notify.error("Error", { description: e?.message ?? "Failed" }),
    },
  });

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

        <OdsToolbar
          search={{
            value: search,
            onChange: (v) => { setSearch(v); setPage(1); },
            placeholder: "Search lot number…",
            ref: searchRef,
          }}
          onRefresh={() => refetch()}
          isRefreshing={isFetching}
        />

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
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={10} className="p-0">
                    <OdsTableSkeleton rows={6} columns={10} />
                  </TableCell>
                </TableRow>
              ) : lots.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="p-0">
                    <OdsEmptyState
                      icon="📦"
                      title="No lots received yet"
                      description="Receive your first cell lot to get started."
                      action={{ label: "Receive New Lot", onClick: () => setOpen(true) }}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                lots.map((lot) => (
                  <Fragment key={lot.id}>
                    <TableRow
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setExpandedLot(expandedLot === lot.id ? null : lot.id)}
                    >
                      <TableCell className="font-mono font-medium">{lot.lotNumber}</TableCell>
                      <TableCell>{lot.supplier}</TableCell>
                      <TableCell>{lot.manufacturer}</TableCell>
                      <TableCell>{lot.cellModel}</TableCell>
                      <TableCell className="text-right">{lot.nominalCapacityAh} Ah</TableCell>
                      <TableCell className="text-right font-medium">{lot.quantityReceived}</TableCell>
                      <TableCell>{lot.dateReceived}</TableCell>
                      <TableCell>{lot.receivedBy}</TableCell>
                      <TableCell>
                        <LotStatsRow lotId={lot.id} />
                      </TableCell>
                      <TableCell>
                        {expandedLot === lot.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </TableCell>
                    </TableRow>
                    {expandedLot === lot.id && (
                      <TableRow>
                        <TableCell colSpan={10} className="bg-muted/30 px-6 py-3 text-sm">
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
    </AppLayout>
  );
}
