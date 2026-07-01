import { useState } from "react";
import AppLayout from "@/layouts/AppLayout";
import {
  useGetBom,
  useApproveBom,
  useObsoleteBom,
  useDeleteBom,
  getGetBomQueryKey,
  getListBomsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { ChevronLeft, Loader2, CheckCircle2, Trash2, Pencil, Archive } from "lucide-react";
import { useOdsNotify } from "@/hooks/use-ods-notify";
import { OdsStatusBadge } from "@/components/ods";
import { Link, useParams, useLocation } from "wouter";

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

export default function BomDetailPage() {
  const { id } = useParams<{ id: string }>();
  const bomId = id ?? "";
  const notify = useOdsNotify();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [showApprove, setShowApprove] = useState(false);
  const [showObsolete, setShowObsolete] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const { data: bom, isLoading } = useGetBom(bomId);
  const approveBom = useApproveBom();
  const obsoleteBom = useObsoleteBom();
  const deleteBom = useDeleteBom();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getGetBomQueryKey(bomId) });
    qc.invalidateQueries({ queryKey: getListBomsQueryKey() });
  };

  const handleApprove = async () => {
    try {
      await approveBom.mutateAsync({ id: bomId });
      notify.success("BOM approved");
      setShowApprove(false);
      invalidate();
    } catch (e: any) {
      notify.error(e?.response?.data?.error ?? "Failed to approve BOM");
    }
  };

  const handleObsolete = async () => {
    try {
      await obsoleteBom.mutateAsync({ id: bomId });
      notify.success("BOM marked obsolete");
      setShowObsolete(false);
      invalidate();
    } catch (e: any) {
      notify.error(e?.response?.data?.error ?? "Failed to obsolete BOM");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteBom.mutateAsync({ id: bomId });
      notify.success("Draft BOM deleted");
      qc.invalidateQueries({ queryKey: getListBomsQueryKey() });
      navigate("/masters/boms");
    } catch (e: any) {
      notify.error(e?.response?.data?.error ?? "Failed to delete BOM");
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

  if (!bom) {
    return (
      <AppLayout>
        <div className="p-6 text-muted-foreground">BOM not found.</div>
      </AppLayout>
    );
  }

  const isDraft = bom.status === "draft";
  const isApproved = bom.status === "approved";

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/masters/boms">
            <Button variant="ghost" size="sm" className="gap-1">
              <ChevronLeft className="h-4 w-4" />BOMs
            </Button>
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold font-mono">{bom.bom_number}</h1>
              <span className="font-mono text-xs text-muted-foreground">v{bom.revision}</span>
              <OdsStatusBadge status={bom.status} />
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Model:{" "}
              <strong>
                {bom.model_name ? `${bom.model_name} (${bom.model_code})` : bom.model_id}
              </strong>
              {bom.name ? ` · ${bom.name}` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            {isDraft && (
              <>
                <Button variant="outline" onClick={() => navigate(`/masters/boms/${bomId}/edit`)}>
                  <Pencil className="h-4 w-4 mr-1" /> Edit
                </Button>
                <Button variant="outline" className="text-red-500" onClick={() => setShowDelete(true)}>
                  <Trash2 className="h-4 w-4 mr-1" /> Delete
                </Button>
                <Button onClick={() => setShowApprove(true)} className="bg-blue-600 hover:bg-blue-700">
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                </Button>
              </>
            )}
            {isApproved && (
              <Button variant="outline" className="text-amber-600" onClick={() => setShowObsolete(true)}>
                <Archive className="h-4 w-4 mr-1" /> Make Obsolete
              </Button>
            )}
          </div>
        </div>

        {/* Metadata */}
        <Card>
          <CardContent className="pt-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Meta label="Yield %" value={`${bom.yield_percent}%`} />
              <Meta label="Components" value={bom.line_count} />
              <Meta label="Effective From" value={bom.effective_from ?? "—"} />
              <Meta label="Effective To" value={bom.effective_to ?? "—"} />
              <Meta label="Created By" value={bom.created_by ?? "—"} />
              <Meta label="Created" value={new Date(bom.created_at).toLocaleString()} />
              <Meta label="Approved By" value={bom.approved_by ?? "—"} />
              <Meta
                label="Approved At"
                value={bom.approved_at ? new Date(bom.approved_at).toLocaleString() : "—"}
              />
            </div>
            {bom.notes && (
              <p className="text-sm text-muted-foreground mt-4 border-t pt-4">{bom.notes}</p>
            )}
          </CardContent>
        </Card>

        {/* Components */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Components ({bom.lines.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">#</th>
                  <th className="px-4 py-3 font-semibold">Material</th>
                  <th className="px-4 py-3 font-semibold text-right">Qty / Unit</th>
                  <th className="px-4 py-3 font-semibold">UOM</th>
                  <th className="px-4 py-3 font-semibold text-right">Scrap %</th>
                  <th className="px-4 py-3 font-semibold">Flags</th>
                  <th className="px-4 py-3 font-semibold">Notes</th>
                </tr>
              </thead>
              <tbody>
                {bom.lines.map((line, idx) => (
                  <tr key={line.id} className="border-b last:border-0">
                    <td className="px-4 py-3 text-muted-foreground">{idx + 1}</td>
                    <td className="px-4 py-3">
                      {line.material_name
                        ? `${line.material_name} (${line.material_code})`
                        : line.material_id}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{line.quantity_per}</td>
                    <td className="px-4 py-3">{line.uom}</td>
                    <td className="px-4 py-3 text-right font-mono">{line.scrap_percent}%</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {line.is_critical_component && (
                          <span className="inline-flex px-1.5 py-0.5 rounded bg-red-100 text-red-600 text-[11px] font-medium">
                            Critical
                          </span>
                        )}
                        {line.traceability_required && (
                          <span className="inline-flex px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[11px] font-medium">
                            Traceable
                          </span>
                        )}
                        {line.is_optional && (
                          <span className="inline-flex px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[11px] font-medium">
                            Optional
                          </span>
                        )}
                        {!line.is_critical_component &&
                          !line.traceability_required &&
                          !line.is_optional && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{line.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* Approve confirm */}
      <Dialog open={showApprove} onOpenChange={setShowApprove}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Approve BOM {bom.bom_number}?</DialogTitle>
            <DialogDescription>
              Approving locks this revision. An approved BOM can no longer be edited — corrections are
              made by creating a new revision.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApprove(false)}>Cancel</Button>
            <Button onClick={handleApprove} disabled={approveBom.isPending} className="bg-blue-600 hover:bg-blue-700">
              {approveBom.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Obsolete confirm */}
      <Dialog open={showObsolete} onOpenChange={setShowObsolete}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Make BOM {bom.bom_number} obsolete?</DialogTitle>
            <DialogDescription>
              An obsolete BOM is retired from active use. This cannot be undone — create a new revision if
              you need an active BOM for this model.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowObsolete(false)}>Cancel</Button>
            <Button onClick={handleObsolete} disabled={obsoleteBom.isPending} className="bg-amber-600 hover:bg-amber-700">
              {obsoleteBom.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Make Obsolete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete draft BOM {bom.bom_number}?</DialogTitle>
            <DialogDescription>
              This permanently removes the draft BOM and its components. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)}>Cancel</Button>
            <Button onClick={handleDelete} disabled={deleteBom.isPending} className="bg-red-600 hover:bg-red-700">
              {deleteBom.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
