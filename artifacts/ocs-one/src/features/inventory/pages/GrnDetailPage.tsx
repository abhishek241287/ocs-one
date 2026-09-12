import { useMemo, useState } from "react";
import AppLayout from "@/layouts/AppLayout";
import {
  useGetGrn,
  useListGrnTransactions,
  usePostGrn,
  useDeleteGrn,
  useListSuppliers,
  useListMaterialMasters,
  useListInspections,
  useGetInspection,
  useInspectGrn,
  usePutAwayGrn,
  getGetGrnQueryKey,
  getListGrnTransactionsQueryKey,
  getListGrnsQueryKey,
  getListInspectionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { ChevronLeft, Loader2, CheckCircle2, Trash2, Boxes } from "lucide-react";
import { useOdsNotify } from "@/hooks/use-ods-notify";
import { OdsStatusBadge } from "@/components/ods";
import { Link, useParams, useLocation } from "wouter";
import { Input } from "@/components/ui/input";

const INSPECTION_COLOR: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  passed: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-600",
  partial: "bg-orange-100 text-orange-700",
};

const STOCK_STATE_LABEL: Record<string, string> = {
  inspection_pending: "Inspection Pending",
  available: "Available",
};

const USAGE_LABEL: Record<string, string> = {
  INVENTORY_COMPONENT: "Inventory Component",
  CONSUMABLE: "Consumable",
  PACKAGING: "Packaging",
  SERVICE_ITEM: "Service Item",
};

export default function GrnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const grnId = id ?? "";
  const notify = useOdsNotify();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [showPost, setShowPost] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [inspectionDraft, setInspectionDraft] = useState<Record<string, { accepted: string; rejected: string; reason: string }>>({});
  const [putAwayLine, setPutAwayLine] = useState<any | null>(null);
  const [putAwayQty, setPutAwayQty] = useState("");
  const [putAwayWarehouse, setPutAwayWarehouse] = useState("");
  const [putAwayLocation, setPutAwayLocation] = useState("");
  const [putAwayBin, setPutAwayBin] = useState("");

  const { data: grn, isLoading } = useGetGrn(grnId);
  const { data: txData } = useListGrnTransactions(grnId);
  const { data: suppliers } = useListSuppliers({ pageSize: 200 } as any);
  const { data: materials } = useListMaterialMasters({ pageSize: 500 } as any);
  const postGrn = usePostGrn();
  const deleteGrn = useDeleteGrn();
  const inspectGrn = useInspectGrn();
  const putAwayGrn = usePutAwayGrn();

  const supplierName = useMemo(() => {
    if (!grn) return "—";
    const s = (suppliers?.items ?? []).find((x: any) => x.id === grn.supplier_id);
    return s ? `${s.name} (${s.code})` : grn.supplier_id;
  }, [suppliers, grn]);

  const materialById = useMemo(() => {
    const map = new Map<string, any>();
    for (const m of (materials?.items ?? []) as any[]) map.set(m.id, m);
    return map;
  }, [materials]);

  // Read-only inspection projection for this GRN. A GRN has at most one inspection
  // (unique grn_id). We never mutate the GRN — we only join the separate inspection
  // document's per-line accepted/rejected back onto the GRN view by grn_line_id.
  // pageSize large enough to return every inspection in one page: a GRN has at most
  // one inspection (unique grn_id), so a default page-1 list could otherwise miss this
  // GRN's inspection and silently show "—". Bounded by the number of posted+inspected GRNs.
  const { data: inspectionsData } = useListInspections({ pageSize: 1000 });
  const inspectionForGrn = useMemo(
    () => (inspectionsData?.items ?? []).find((i: any) => i.grn_id === grnId),
    [inspectionsData, grnId]
  );
  const { data: inspectionDetail } = useGetInspection(inspectionForGrn?.id ?? "", {
    query: { enabled: !!inspectionForGrn?.id },
  } as any);
  const inspectionByLineId = useMemo(() => {
    const map = new Map<string, any>();
    for (const l of (inspectionDetail?.lines ?? []) as any[]) map.set(l.grn_line_id, l);
    return map;
  }, [inspectionDetail]);

  const handlePost = async () => {
    try {
      await postGrn.mutateAsync({ id: grnId });
      notify.success("GRN posted — inventory transactions generated");
      setShowPost(false);
      qc.invalidateQueries({ queryKey: getGetGrnQueryKey(grnId) });
      qc.invalidateQueries({ queryKey: getListGrnTransactionsQueryKey(grnId) });
      qc.invalidateQueries({ queryKey: getListGrnsQueryKey() });
    } catch (e: any) {
      notify.error(e?.data?.error ?? "Failed to post GRN");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteGrn.mutateAsync({ id: grnId });
      notify.success("Draft GRN deleted");
      qc.invalidateQueries({ queryKey: getListGrnsQueryKey() });
      navigate("/inventory/grns");
    } catch (e: any) {
      notify.error(e?.data?.error ?? "Failed to delete GRN");
    }
  };

  const handleInspect = async () => {
    const lines = Object.entries(inspectionDraft)
      .map(([grn_line_id, value]) => ({
        grn_line_id,
        accepted_qty: Number(value.accepted),
        rejected_qty: Number(value.rejected),
        rejection_reason: value.reason || null,
      }))
      .filter((line) => line.accepted_qty > 0 || line.rejected_qty > 0);
    if (lines.length === 0) {
      notify.error("Enter an accepted or rejected quantity for at least one pending line");
      return;
    }
    try {
      await inspectGrn.mutateAsync({ id: grnId, data: { lines } });
      notify.success("Inspection event recorded");
      setInspectionDraft({});
      qc.invalidateQueries({ queryKey: getGetGrnQueryKey(grnId) });
      qc.invalidateQueries({ queryKey: getListGrnTransactionsQueryKey(grnId) });
      qc.invalidateQueries({ queryKey: getListInspectionsQueryKey() });
    } catch (e: any) {
      notify.error(e?.data?.error ?? "Failed to record inspection");
    }
  };

  const handlePutAway = async () => {
    if (!putAwayLine) return;
    try {
      await putAwayGrn.mutateAsync({
        id: grnId,
        data: {
          grn_line_id: putAwayLine.id,
          warehouse_id: putAwayWarehouse,
          location_id: putAwayLocation || null,
          bin_id: putAwayBin || null,
          quantity: Number(putAwayQty),
        },
      });
      notify.success("Accepted stock put away");
      setPutAwayLine(null);
      setPutAwayQty("");
      qc.invalidateQueries({ queryKey: getGetGrnQueryKey(grnId) });
    } catch (e: any) {
      notify.error(e?.data?.error ?? "Failed to put away stock");
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!grn) {
    return (
      <AppLayout>
        <div className="p-6 text-muted-foreground">GRN not found.</div>
      </AppLayout>
    );
  }

  const isDraft = grn.status === "draft";
  const transactions = (txData?.items ?? []) as any[];

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/inventory/grns">
            <Button variant="ghost" size="sm" className="gap-1">
              <ChevronLeft className="h-4 w-4" />GRNs
            </Button>
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold font-mono">{grn.grn_number}</h1>
              <OdsStatusBadge status={grn.status} />
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Supplier: <strong>{supplierName}</strong> · Received {grn.received_date}
            </p>
          </div>
          {isDraft && (
            <div className="flex gap-2">
              <Button variant="outline" className="text-red-500" onClick={() => setShowDelete(true)}>
                <Trash2 className="h-4 w-4 mr-1" /> Delete
              </Button>
              <Button onClick={() => setShowPost(true)} className="bg-blue-600 hover:bg-blue-700">
                <CheckCircle2 className="h-4 w-4 mr-1" /> Post GRN
              </Button>
            </div>
          )}
        </div>

        {grn.remarks && (
          <Card>
            <CardContent className="pt-4 pb-4 text-sm text-muted-foreground">{grn.remarks}</CardContent>
          </Card>
        )}

        {/* Lines */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Line Items ({grn.lines.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">#</th>
                  <th className="px-4 py-3 font-semibold">Material</th>
                  <th className="px-4 py-3 font-semibold">Usage</th>
                  <th className="px-4 py-3 font-semibold">Linked Master</th>
                  <th className="px-4 py-3 font-semibold text-right">Received</th>
                  <th className="px-4 py-3 font-semibold">UOM</th>
                  <th className="px-4 py-3 font-semibold text-right">Accepted</th>
                  <th className="px-4 py-3 font-semibold text-right">Rejected</th>
                      <th className="px-4 py-3 font-semibold">Inspection Status</th>
                      <th className="px-4 py-3 font-semibold">Put-away</th>
                </tr>
              </thead>
              <tbody>
                {grn.lines.map((line) => {
                  const mat = materialById.get(line.material_id);
                  const insp = line.inspection_status;
                  const inspLine = inspectionByLineId.get(line.id);
                  return (
                    <tr key={line.id} className="border-b last:border-0">
                      <td className="px-4 py-3 text-muted-foreground">{line.line_number}</td>
                      <td className="px-4 py-3">
                        {line.material_name
                          ? `${line.material_name} (${line.material_code})`
                          : mat
                            ? `${mat.name} (${mat.code})`
                            : line.material_id}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {line.usage_type ? USAGE_LABEL[line.usage_type] ?? line.usage_type : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {line.linked_master ? (
                          <span>
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium mr-1.5">
                              {line.linked_master.type}
                            </span>
                            {line.linked_master.name} ({line.linked_master.code})
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{line.quantity_received}</td>
                      <td className="px-4 py-3">{line.uom}</td>
                      <td className="px-4 py-3 text-right font-mono text-green-700">
                        {line.accepted_qty ?? (inspLine ? inspLine.accepted_qty : "—")}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-red-600">
                        {line.rejected_qty ?? (inspLine ? inspLine.rejected_qty : "—")}
                      </td>
                      <td className="px-4 py-3">
                        {insp ? (
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${INSPECTION_COLOR[insp] ?? "bg-gray-100 text-gray-600"}`}
                          >
                            {insp.replace(/\b\w/g, (l) => l.toUpperCase())}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">— (direct to inventory)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="font-mono">{line.put_away_qty ?? 0} / {line.accepted_qty ?? 0}</div>
                        {(line.accepted_qty ?? 0) > (line.put_away_qty ?? 0) && line.lot_id && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-1"
                            onClick={() => {
                              setPutAwayLine(line);
                              setPutAwayQty(String(Number(line.accepted_qty ?? 0) - Number(line.put_away_qty ?? 0)));
                            }}
                          >
                            Put away
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {grn.status === "posted" && grn.lines.some((line) => line.inspection_status === "pending") && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Record inspection event</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Inspect one or more pending lines. Partial events are allowed; accepted plus rejected cannot exceed the remaining quantity.
              </p>
              {grn.lines.filter((line) => line.inspection_status === "pending").map((line) => {
                const value = inspectionDraft[line.id] ?? { accepted: "", rejected: "", reason: "" };
                const remaining = Number(line.quantity_received) - Number(line.accepted_qty ?? 0) - Number(line.rejected_qty ?? 0);
                return (
                  <div key={line.id} className="grid grid-cols-1 gap-2 rounded border p-3 md:grid-cols-[1.5fr_1fr_1fr_2fr] md:items-end">
                    <div className="text-sm">
                      <div className="font-medium">{line.material_name ?? line.material_id}</div>
                      <div className="text-xs text-muted-foreground">Remaining: {remaining} {line.uom}</div>
                    </div>
                    <label className="text-xs">Accepted
                      <Input type="number" min="0" value={value.accepted} onChange={(e) => setInspectionDraft((current) => ({ ...current, [line.id]: { ...value, accepted: e.target.value } }))} />
                    </label>
                    <label className="text-xs">Rejected
                      <Input type="number" min="0" value={value.rejected} onChange={(e) => setInspectionDraft((current) => ({ ...current, [line.id]: { ...value, rejected: e.target.value } }))} />
                    </label>
                    <label className="text-xs">Reason when rejected
                      <Input value={value.reason} onChange={(e) => setInspectionDraft((current) => ({ ...current, [line.id]: { ...value, reason: e.target.value } }))} placeholder="Required for rejected quantity" />
                    </label>
                  </div>
                );
              })}
              <Button onClick={handleInspect} disabled={inspectGrn.isPending}>
                {inspectGrn.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Record inspection
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Inventory transactions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Boxes className="h-4 w-4" /> Inventory Transactions ({transactions.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {transactions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {isDraft
                  ? "No transactions yet — post the GRN to generate inventory transactions."
                  : "No transactions recorded."}
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 font-semibold">Material</th>
                    <th className="px-4 py-3 font-semibold text-right">Quantity</th>
                    <th className="px-4 py-3 font-semibold">UOM</th>
                    <th className="px-4 py-3 font-semibold">Stock State</th>
                    <th className="px-4 py-3 font-semibold">Recorded</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => {
                    const mat = materialById.get(t.material_id);
                    return (
                      <tr key={t.id} className="border-b last:border-0">
                        <td className="px-4 py-3 font-mono text-xs">{t.transaction_type}</td>
                        <td className="px-4 py-3">{mat ? `${mat.name} (${mat.code})` : t.material_id}</td>
                        <td className="px-4 py-3 text-right font-mono">{t.quantity}</td>
                        <td className="px-4 py-3">{t.uom}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${t.stock_state === "available" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}
                          >
                            {STOCK_STATE_LABEL[t.stock_state] ?? t.stock_state}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {new Date(t.created_at).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Post confirm dialog */}
      <Dialog open={showPost} onOpenChange={setShowPost}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Post GRN {grn.grn_number}?</DialogTitle>
            <DialogDescription>
              Posting is final. Each line is routed by its material's assigned workflow — inspected materials
              become "inspection pending", others go straight to available inventory. Every material's category
              must have an assigned workflow or posting will be blocked. Inventory transactions will be generated
              and the GRN can no longer be edited or deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPost(false)}>Cancel</Button>
            <Button onClick={handlePost} disabled={postGrn.isPending} className="bg-blue-600 hover:bg-blue-700">
              {postGrn.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Post GRN
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete draft GRN {grn.grn_number}?</DialogTitle>
            <DialogDescription>
              This permanently removes the draft GRN and its line items. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)}>Cancel</Button>
            <Button onClick={handleDelete} disabled={deleteGrn.isPending} className="bg-red-600 hover:bg-red-700">
              {deleteGrn.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!putAwayLine} onOpenChange={(open) => !open && setPutAwayLine(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Put away accepted stock</DialogTitle>
            <DialogDescription>
              Physical put-away changes the lot location only; it does not create another stock movement.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="text-sm">Quantity
              <Input type="number" min="0.001" value={putAwayQty} onChange={(e) => setPutAwayQty(e.target.value)} />
            </label>
            <label className="text-sm">Warehouse ID
              <Input value={putAwayWarehouse} onChange={(e) => setPutAwayWarehouse(e.target.value)} placeholder="UUID" />
            </label>
            <label className="text-sm">Location ID (optional)
              <Input value={putAwayLocation} onChange={(e) => setPutAwayLocation(e.target.value)} placeholder="UUID" />
            </label>
            <label className="text-sm">Bin ID (optional)
              <Input value={putAwayBin} onChange={(e) => setPutAwayBin(e.target.value)} placeholder="UUID" />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPutAwayLine(null)}>Cancel</Button>
            <Button onClick={handlePutAway} disabled={putAwayGrn.isPending || !putAwayWarehouse || !putAwayQty}>
              {putAwayGrn.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Put away
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
