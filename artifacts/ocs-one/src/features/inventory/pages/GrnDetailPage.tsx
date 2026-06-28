import { useMemo, useState } from "react";
import AppLayout from "@/layouts/AppLayout";
import {
  useGetGrn,
  useListGrnTransactions,
  usePostGrn,
  useDeleteGrn,
  useListSuppliers,
  useListMaterialMasters,
  getGetGrnQueryKey,
  getListGrnTransactionsQueryKey,
  getListGrnsQueryKey,
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

export default function GrnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const grnId = id ?? "";
  const notify = useOdsNotify();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [showPost, setShowPost] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const { data: grn, isLoading } = useGetGrn(grnId);
  const { data: txData } = useListGrnTransactions(grnId);
  const { data: suppliers } = useListSuppliers({ pageSize: 200 } as any);
  const { data: materials } = useListMaterialMasters({ pageSize: 500 } as any);
  const postGrn = usePostGrn();
  const deleteGrn = useDeleteGrn();

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

  const handlePost = async () => {
    try {
      await postGrn.mutateAsync({ id: grnId });
      notify.success("GRN posted — inventory transactions generated");
      setShowPost(false);
      qc.invalidateQueries({ queryKey: getGetGrnQueryKey(grnId) });
      qc.invalidateQueries({ queryKey: getListGrnTransactionsQueryKey(grnId) });
      qc.invalidateQueries({ queryKey: getListGrnsQueryKey() });
    } catch (e: any) {
      notify.error(e?.response?.data?.error ?? "Failed to post GRN");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteGrn.mutateAsync({ id: grnId });
      notify.success("Draft GRN deleted");
      qc.invalidateQueries({ queryKey: getListGrnsQueryKey() });
      navigate("/inventory/grns");
    } catch (e: any) {
      notify.error(e?.response?.data?.error ?? "Failed to delete GRN");
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
                  <th className="px-4 py-3 font-semibold text-right">Quantity</th>
                  <th className="px-4 py-3 font-semibold">UOM</th>
                  <th className="px-4 py-3 font-semibold">Inspection Status</th>
                </tr>
              </thead>
              <tbody>
                {grn.lines.map((line) => {
                  const mat = materialById.get(line.material_id);
                  const insp = line.inspection_status;
                  return (
                    <tr key={line.id} className="border-b last:border-0">
                      <td className="px-4 py-3 text-muted-foreground">{line.line_number}</td>
                      <td className="px-4 py-3">
                        {mat ? `${mat.name} (${mat.code})` : line.material_id}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{line.quantity_received}</td>
                      <td className="px-4 py-3">{line.uom}</td>
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

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
              Posting is final. Each line is routed by its material workflow — inspected materials become
              "inspection pending", others go straight to available inventory. Inventory transactions will be
              generated and the GRN can no longer be edited or deleted.
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
    </AppLayout>
  );
}
