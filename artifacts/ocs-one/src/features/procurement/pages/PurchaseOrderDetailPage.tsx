import { useState, useMemo } from "react";
import AppLayout from "@/layouts/AppLayout";
import {
  useGetPurchaseOrder,
  useSubmitPurchaseOrder,
  useApprovePurchaseOrder,
  useCancelPurchaseOrder,
  useAddPurchaseOrderLine,
  useUpdatePurchaseOrderLine,
  useDeletePurchaseOrderLine,
  useListSuppliers,
  useListMaterialMasters,
  getGetPurchaseOrderQueryKey,
  getListPurchaseOrdersQueryKey,
} from "@workspace/api-client-react";
import type { PurchaseOrderLineInput, PurchaseOrderLineUpdate } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, Loader2, CheckCircle2, Trash2, Edit, XCircle, Send, Plus } from "lucide-react";
import { useOdsNotify } from "@/hooks/use-ods-notify";
import { OdsStatusBadge } from "@/components/ods";
import { Link, useParams, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

export default function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const poId = id ?? "";
  const notify = useOdsNotify();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const [showSubmit, setShowSubmit] = useState(false);
  const [showApprove, setShowApprove] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [newLineMode, setNewLineMode] = useState(false);
  const [lineDraft, setLineDraft] = useState<Partial<PurchaseOrderLineInput>>({});

  const { data: po, isLoading } = useGetPurchaseOrder(poId);
  const { data: suppliers } = useListSuppliers({ pageSize: 200 } as any);
  const { data: materials } = useListMaterialMasters({ pageSize: 500 } as any);

  const submitPo = useSubmitPurchaseOrder();
  const approvePo = useApprovePurchaseOrder();
  const cancelPo = useCancelPurchaseOrder();
  const addLine = useAddPurchaseOrderLine();
  const updateLine = useUpdatePurchaseOrderLine();
  const deleteLine = useDeletePurchaseOrderLine();

  const isDirectorOrOwner = user?.role === "director" || user?.role === "owner";
  
  const supplierName = useMemo(() => {
    if (!po) return "—";
    const s = (suppliers?.items ?? []).find((x: any) => x.id === po.supplier_id);
    return s ? `${s.name} (${s.code})` : (po.supplier_name ?? po.supplier_id);
  }, [suppliers, po]);

  const materialList = useMemo(
    () => (materials?.items ?? []).filter((m: any) => m.status === "active"),
    [materials]
  );
  
  const materialById = useMemo(() => {
    const map = new Map<string, any>();
    for (const m of materialList) map.set(m.id, m);
    return map;
  }, [materialList]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft": return "gray";
      case "submitted": return "yellow";
      case "approved": return "green";
      case "partially_received": return "blue";
      case "fully_received": return "green";
      case "closed": return "gray";
      case "cancelled": return "red";
      default: return "gray";
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

  if (!po) {
    return (
      <AppLayout>
        <div className="p-6 text-muted-foreground">Purchase Order not found.</div>
      </AppLayout>
    );
  }

  const isDraft = po.status === "draft";
  const isSubmitted = po.status === "submitted";
  const isActive = po.status === "approved" || po.status === "partially_received";

  const handleSubmit = async () => {
    try {
      await submitPo.mutateAsync({ id: poId });
      notify.success("Purchase Order submitted for approval");
      setShowSubmit(false);
      qc.invalidateQueries({ queryKey: getGetPurchaseOrderQueryKey(poId) });
      qc.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
    } catch (e: any) {
      notify.error(e?.data?.error ?? "Failed to submit PO");
    }
  };

  const handleApprove = async () => {
    try {
      await approvePo.mutateAsync({ id: poId });
      notify.success("Purchase Order approved");
      setShowApprove(false);
      qc.invalidateQueries({ queryKey: getGetPurchaseOrderQueryKey(poId) });
      qc.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
    } catch (e: any) {
      notify.error(e?.data?.error ?? "Failed to approve PO");
    }
  };

  const handleCancel = async () => {
    if (!cancelReason.trim()) {
      notify.error("Cancellation reason is required");
      return;
    }
    try {
      await cancelPo.mutateAsync({ id: poId, data: { reason: cancelReason.trim() } });
      notify.success("Purchase Order cancelled");
      setShowCancel(false);
      qc.invalidateQueries({ queryKey: getGetPurchaseOrderQueryKey(poId) });
      qc.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
    } catch (e: any) {
      notify.error(e?.data?.error ?? "Failed to cancel PO");
    }
  };

  const handleSaveLine = async () => {
    if (!lineDraft.material_id) {
      notify.error("Select a material");
      return;
    }
    const qty = Number(lineDraft.ordered_qty);
    if (!Number.isFinite(qty) || qty <= 0) {
      notify.error("Ordered quantity must be greater than 0");
      return;
    }
    const price = lineDraft.unit_price ? Number(lineDraft.unit_price) : undefined;
    if (price !== undefined && (!Number.isFinite(price) || price < 0)) {
      notify.error("Unit price must be a non-negative number if provided");
      return;
    }

    try {
      if (newLineMode) {
        await addLine.mutateAsync({
          id: poId,
          data: {
            material_id: lineDraft.material_id,
            ordered_qty: qty,
            unit_price: price,
            required_date: lineDraft.required_date || undefined,
            notes: lineDraft.notes || undefined,
          }
        });
        notify.success("Line added");
      } else if (editingLineId) {
        await updateLine.mutateAsync({
          id: poId,
          lineId: editingLineId,
          data: {
            material_id: lineDraft.material_id,
            ordered_qty: qty,
            unit_price: price,
            required_date: lineDraft.required_date || undefined,
            notes: lineDraft.notes || undefined,
          }
        });
        notify.success("Line updated");
      }
      setNewLineMode(false);
      setEditingLineId(null);
      setLineDraft({});
      qc.invalidateQueries({ queryKey: getGetPurchaseOrderQueryKey(poId) });
    } catch (e: any) {
      notify.error(e?.data?.error ?? "Failed to save line");
    }
  };

  const handleDeleteLine = async (lineId: string) => {
    if (!confirm("Remove this line?")) return;
    try {
      await deleteLine.mutateAsync({ id: poId, lineId });
      notify.success("Line removed");
      qc.invalidateQueries({ queryKey: getGetPurchaseOrderQueryKey(poId) });
    } catch (e: any) {
      notify.error(e?.data?.error ?? "Failed to remove line");
    }
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link 
            href="/procurement/purchase-orders"
            className="inline-flex items-center justify-center whitespace-nowrap font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground rounded-md h-8 px-3 text-xs gap-1"
          >
            <ChevronLeft className="h-4 w-4" />POs
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold font-mono">{po.po_number}</h1>
              <OdsStatusBadge status={po.status} color={getStatusColor(po.status as any)} />
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Supplier: <strong>{supplierName}</strong> · Ordered: {po.ordered_date ?? "Pending"}
            </p>
          </div>
          <div className="flex gap-2">
            {(isDraft || isSubmitted || isActive) && isDirectorOrOwner && (
              <Button variant="outline" className="text-red-500" onClick={() => setShowCancel(true)}>
                <XCircle className="h-4 w-4 mr-1" /> Cancel
              </Button>
            )}
            {isDraft && (
              <Button onClick={() => setShowSubmit(true)} className="bg-blue-600 hover:bg-blue-700">
                <Send className="h-4 w-4 mr-1" /> Submit
              </Button>
            )}
            {isSubmitted && isDirectorOrOwner && (
              <Button onClick={() => setShowApprove(true)} className="bg-green-600 hover:bg-green-700">
                <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Lines ({po.lines.length})</CardTitle>
                {isDraft && !newLineMode && !editingLineId && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                    setNewLineMode(true);
                    setLineDraft({});
                  }}>
                    <Plus className="h-3 w-3 mr-1" /> Add Line
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 font-semibold">Line</th>
                    <th className="px-4 py-3 font-semibold">Material</th>
                    <th className="px-4 py-3 font-semibold text-right">Ordered</th>
                    <th className="px-4 py-3 font-semibold text-right">Received</th>
                    <th className="px-4 py-3 font-semibold text-right">Price</th>
                    <th className="px-4 py-3 font-semibold">UOM</th>
                    {isDraft && <th className="px-4 py-3 font-semibold text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {po.lines.map((line) => {
                    if (editingLineId === line.id) {
                      return (
                        <tr key={line.id} className="border-b bg-muted/20">
                          <td colSpan={isDraft ? 7 : 6} className="p-4">
                            <div className="grid grid-cols-12 gap-3 items-end">
                              <div className="col-span-5 space-y-1.5">
                                <Label className="text-xs">Material *</Label>
                                <Select
                                  value={lineDraft.material_id}
                                  onValueChange={(v) => setLineDraft((d) => ({ ...d, material_id: v }))}
                                >
                                  <SelectTrigger><SelectValue placeholder="Select material…" /></SelectTrigger>
                                  <SelectContent>
                                    {materialList.map((m: any) => (
                                      <SelectItem key={m.id} value={m.id}>
                                        {m.name} ({m.code})
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="col-span-2 space-y-1.5">
                                <Label className="text-xs">Qty *</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={lineDraft.ordered_qty ?? ""}
                                  onChange={(e) => setLineDraft((d) => ({ ...d, ordered_qty: Number(e.target.value) || undefined }))}
                                />
                              </div>
                              <div className="col-span-2 space-y-1.5">
                                <Label className="text-xs">Price</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={lineDraft.unit_price ?? ""}
                                  onChange={(e) => setLineDraft((d) => ({ ...d, unit_price: Number(e.target.value) || undefined }))}
                                />
                              </div>
                              <div className="col-span-3 flex justify-end gap-2">
                                <Button size="sm" variant="outline" onClick={() => setEditingLineId(null)}>Cancel</Button>
                                <Button size="sm" onClick={handleSaveLine} disabled={updateLine.isPending}>Save</Button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    const mat = materialById.get(line.material_id);
                    return (
                      <tr key={line.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                        <td className="px-4 py-3 font-mono text-muted-foreground text-xs">{line.line_number}</td>
                        <td className="px-4 py-3">
                          {line.material_name
                            ? `${line.material_name} (${line.material_code})`
                            : mat
                              ? `${mat.name} (${mat.code})`
                              : line.material_id}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-medium">{line.ordered_qty}</td>
                        <td className="px-4 py-3 text-right font-mono text-green-700">{line.received_qty}</td>
                        <td className="px-4 py-3 text-right font-mono">
                          {line.unit_price ? line.unit_price.toFixed(2) : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs">{line.uom}</td>
                        {isDraft && (
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => {
                                  setEditingLineId(line.id);
                                  setNewLineMode(false);
                                  setLineDraft({
                                    material_id: line.material_id,
                                    ordered_qty: line.ordered_qty,
                                    unit_price: line.unit_price ?? undefined,
                                    required_date: line.required_date ?? undefined,
                                    notes: line.notes ?? undefined,
                                  });
                                }}
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-red-500"
                                onClick={() => handleDeleteLine(line.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  
                  {newLineMode && (
                    <tr className="border-b bg-muted/20">
                      <td colSpan={isDraft ? 7 : 6} className="p-4">
                        <div className="grid grid-cols-12 gap-3 items-end">
                          <div className="col-span-5 space-y-1.5">
                            <Label className="text-xs">Material *</Label>
                            <Select
                              value={lineDraft.material_id}
                              onValueChange={(v) => setLineDraft((d) => ({ ...d, material_id: v }))}
                            >
                              <SelectTrigger><SelectValue placeholder="Select material…" /></SelectTrigger>
                              <SelectContent>
                                {materialList.map((m: any) => (
                                  <SelectItem key={m.id} value={m.id}>
                                    {m.name} ({m.code})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-2 space-y-1.5">
                            <Label className="text-xs">Qty *</Label>
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              value={lineDraft.ordered_qty ?? ""}
                              onChange={(e) => setLineDraft((d) => ({ ...d, ordered_qty: Number(e.target.value) || undefined }))}
                            />
                          </div>
                          <div className="col-span-2 space-y-1.5">
                            <Label className="text-xs">Price</Label>
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              value={lineDraft.unit_price ?? ""}
                              onChange={(e) => setLineDraft((d) => ({ ...d, unit_price: Number(e.target.value) || undefined }))}
                            />
                          </div>
                          <div className="col-span-3 flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => setNewLineMode(false)}>Cancel</Button>
                            <Button size="sm" onClick={handleSaveLine} disabled={addLine.isPending}>Add</Button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  {po.lines.length === 0 && !newLineMode && (
                    <tr>
                      <td colSpan={isDraft ? 7 : 6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No lines added.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
          
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Total Amount</span>
                  <span className="font-mono font-medium text-base">
                    {po.total_amount != null 
                      ? `${po.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${po.currency}` 
                      : `0.00 ${po.currency}`}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Required Date</span>
                  <span>{po.required_date ?? "—"}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Over-receipt</span>
                  <span>{po.over_receipt_tolerance_percent}%</span>
                </div>
                
                {po.approved_by && (
                  <div className="pt-3 border-t">
                    <div className="text-xs text-muted-foreground mb-1">Approved By</div>
                    <div className="text-sm font-medium">{po.approved_by}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {new Date(po.approved_at!).toLocaleString()}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Terms & Notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Terms</h4>
                  <p className="text-sm leading-relaxed">{po.terms || "—"}</p>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Notes</h4>
                  <p className="text-sm leading-relaxed">{po.notes || "—"}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Submit dialog */}
      <Dialog open={showSubmit} onOpenChange={setShowSubmit}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Submit PO {po.po_number}?</DialogTitle>
            <DialogDescription>
              This will lock the purchase order for editing and submit it to a Director for approval.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSubmit(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitPo.isPending} className="bg-blue-600 hover:bg-blue-700">
              {submitPo.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Approve dialog */}
      <Dialog open={showApprove} onOpenChange={setShowApprove}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Approve PO {po.po_number}?</DialogTitle>
            <DialogDescription>
              Approving the purchase order indicates it has been authorized and dispatched to the supplier.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApprove(false)}>Cancel</Button>
            <Button onClick={handleApprove} disabled={approvePo.isPending} className="bg-green-600 hover:bg-green-700">
              {approvePo.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel dialog */}
      <Dialog open={showCancel} onOpenChange={setShowCancel}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel PO {po.po_number}?</DialogTitle>
            <DialogDescription>
              This permanently cancels the purchase order. Provide a reason below.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label className="text-xs mb-2 block">Reason for cancellation</Label>
            <Input 
              value={cancelReason} 
              onChange={(e) => setCancelReason(e.target.value)} 
              placeholder="E.g., Supplier out of stock" 
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancel(false)}>Back</Button>
            <Button onClick={handleCancel} disabled={cancelPo.isPending || !cancelReason.trim()} className="bg-red-600 hover:bg-red-700">
              {cancelPo.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Cancel PO
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
