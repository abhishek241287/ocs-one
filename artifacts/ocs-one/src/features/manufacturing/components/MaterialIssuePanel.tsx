import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  usePreviewMaterialIssue,
  useListMaterialIssues,
  useGetMaterialIssue,
  useIssueMaterials,
  useReverseMaterialIssue,
  type MinRequirementView,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  PackageOpen, PackageCheck, AlertTriangle, Loader2, Undo2, ShieldAlert, FileText,
} from "lucide-react";
import { useOdsNotify } from "@/hooks/use-ods-notify";
import { useAuth } from "@/hooks/use-auth";

interface Props { orderId: string; onRefresh: () => void; }

type LineCapture = { supplierLot: string };

function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, "");
}

export default function MaterialIssuePanel({ orderId, onRefresh }: Props) {
  const notify = useOdsNotify();
  const qc = useQueryClient();
  const { user } = useAuth();
  const canWrite = user?.role === "director" || user?.role === "supervisor";

  const { data: preview, isLoading: previewLoading } = usePreviewMaterialIssue(orderId);
  const { data: list } = useListMaterialIssues(orderId);

  const activeMinId = preview?.active_min_id ?? null;
  const { data: activeMin } = useGetMaterialIssue(orderId, activeMinId ?? "", {
    query: { enabled: !!activeMinId },
  } as any);

  const issue = useIssueMaterials();
  const reverse = useReverseMaterialIssue();

  const [captures, setCaptures] = useState<Record<string, LineCapture>>({});
  const [notes, setNotes] = useState("");
  const [reverseReason, setReverseReason] = useState("");
  const [showReverse, setShowReverse] = useState(false);

  const requirements = useMemo(() => preview?.requirements ?? [], [preview]);
  const shortages = requirements.filter((r) => r.available_qty < r.required_qty);
  const hasShortage = shortages.length > 0;

  const capFor = (r: MinRequirementView): string =>
    captures[r.bom_line_id]?.supplierLot ?? r.suggested_supplier_lot_number ?? "";

  const missingTrace = requirements.filter(
    (r) => r.traceability_required && !capFor(r).trim(),
  );

  const invalidate = () => {
    qc.invalidateQueries();
    onRefresh();
  };

  const handleIssue = async () => {
    if (hasShortage) {
      notify.error(`Cannot issue — short: ${shortages.map((s) => s.material_code ?? s.material_id).join(", ")}`);
      return;
    }
    if (missingTrace.length > 0) {
      notify.error(`Supplier batch/lot required for: ${missingTrace.map((m) => m.material_code ?? m.material_id).join(", ")}`);
      return;
    }
    try {
      await issue.mutateAsync({
        id: orderId,
        data: {
          notes: notes.trim() || null,
          lines: requirements.map((r) => ({
            source_bom_line_id: r.bom_line_id,
            issued_qty: r.required_qty,
            grn_id: r.suggested_grn_id ?? null,
            grn_line_id: r.suggested_grn_line_id ?? null,
            supplier_lot_number: capFor(r).trim() || null,
          })),
        },
      });
      notify.success("Materials issued — stock deducted");
      setNotes("");
      invalidate();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Failed to issue materials");
    }
  };

  const handleReverse = async () => {
    if (!activeMinId) return;
    if (!reverseReason.trim()) { notify.error("Reversal reason is required"); return; }
    try {
      await reverse.mutateAsync({ id: orderId, minId: activeMinId, data: { reason: reverseReason.trim() } });
      notify.success("Material issue reversed — stock restored");
      setReverseReason("");
      setShowReverse(false);
      invalidate();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Failed to reverse");
    }
  };

  if (previewLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!preview?.has_approved_bom) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-gray-400 space-y-2">
          <FileText className="h-10 w-10 mx-auto text-gray-300" />
          <p className="text-sm font-medium">No approved BOM for this model</p>
          <p className="text-xs">
            Material issue requires an approved Bill of Materials. This order proceeds without material consumption.
          </p>
        </CardContent>
      </Card>
    );
  }

  const reversedMins = (list?.items ?? []).filter((m) => m.is_reversed);

  // ── Active MIN — finalized, read-only ──────────────────────────────────────
  if (activeMinId) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <PackageCheck className="h-5 w-5 text-green-600" />
                Material Issue Note
                <span className="font-mono text-sm text-green-700">{preview.active_min_number}</span>
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">
                  Issued · BOM {activeMin?.bom_number ?? preview.bom_number} rev {activeMin?.bom_revision ?? preview.bom_revision}
                </Badge>
                {canWrite && !showReverse && (
                  <Button variant="outline" size="sm" onClick={() => setShowReverse(true)}>
                    <Undo2 className="h-4 w-4 mr-1" /> Reverse
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="text-xs">Material</TableHead>
                    <TableHead className="text-xs text-right">Issued</TableHead>
                    <TableHead className="text-xs">UoM</TableHead>
                    <TableHead className="text-xs">Supplier Batch / Lot</TableHead>
                    <TableHead className="text-xs">Trace</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(activeMin?.lines ?? []).map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-sm font-medium">
                        {l.material_name ?? l.material_code ?? l.material_id}
                        {l.material_code && l.material_name && (
                          <span className="ml-1 text-xs text-gray-400 font-mono">{l.material_code}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-right font-mono">{fmtQty(l.issued_qty)}</TableCell>
                      <TableCell className="text-sm">{l.uom}</TableCell>
                      <TableCell className="text-xs font-mono text-gray-600">{l.supplier_lot_number ?? "—"}</TableCell>
                      <TableCell>
                        {l.traceability_required ? (
                          <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700 text-[10px]">
                            required
                          </Badge>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {activeMin?.notes && (
              <p className="text-sm text-gray-500 bg-gray-50 rounded p-2">{activeMin.notes}</p>
            )}

            {showReverse && canWrite && (
              <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 text-amber-800 text-sm font-medium">
                  <AlertTriangle className="h-4 w-4" /> Reverse this material issue
                </div>
                <p className="text-xs text-amber-700">
                  Restores all deducted stock and appends a reversal document. A fresh MIN can be posted afterwards.
                </p>
                <Label className="text-sm">Reason (required)</Label>
                <Textarea
                  value={reverseReason}
                  onChange={(e) => setReverseReason(e.target.value)}
                  placeholder="Why is this issue being reversed?"
                  rows={2}
                />
                <div className="flex gap-2">
                  <Button variant="destructive" size="sm" onClick={handleReverse} disabled={reverse.isPending}>
                    {reverse.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Undo2 className="h-4 w-4 mr-1" />}
                    Confirm Reversal
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setShowReverse(false); setReverseReason(""); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        {reversedMins.length > 0 && <ReversedHistory count={reversedMins.length} />}
      </div>
    );
  }

  // ── No active MIN — requirements + issue action ────────────────────────────
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <PackageOpen className="h-5 w-5 text-orange-600" />
              Issue Materials
            </CardTitle>
            <Badge variant="outline">
              BOM {preview.bom_number} rev {preview.bom_revision}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasShortage && (
            <div className="flex items-start gap-2 border border-red-200 bg-red-50 rounded-lg p-3 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>
                Insufficient stock for {shortages.length} material(s):{" "}
                <span className="font-medium">{shortages.map((s) => s.material_code ?? s.material_name ?? s.material_id).join(", ")}</span>.
                Receive stock before issuing.
              </span>
            </div>
          )}

          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="text-xs">Material</TableHead>
                  <TableHead className="text-xs text-right">Required</TableHead>
                  <TableHead className="text-xs text-right">Available</TableHead>
                  <TableHead className="text-xs">UoM</TableHead>
                  <TableHead className="text-xs">Supplier Batch / Lot (GRN)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requirements.map((r) => {
                  const short = r.available_qty < r.required_qty;
                  return (
                    <TableRow key={r.bom_line_id} className={short ? "bg-red-50/50" : ""}>
                      <TableCell className="text-sm font-medium">
                        {r.material_name ?? r.material_code ?? r.material_id}
                        {r.material_code && r.material_name && (
                          <span className="ml-1 text-xs text-gray-400 font-mono">{r.material_code}</span>
                        )}
                        {r.traceability_required && (
                          <Badge variant="outline" className="ml-2 border-orange-200 bg-orange-50 text-orange-700 text-[10px]">
                            trace required
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-right font-mono">{fmtQty(r.required_qty)}</TableCell>
                      <TableCell className={`text-sm text-right font-mono ${short ? "text-red-600 font-semibold" : "text-gray-700"}`}>
                        {fmtQty(r.available_qty)}
                      </TableCell>
                      <TableCell className="text-sm">{r.uom}</TableCell>
                      <TableCell>
                        <Input
                          value={capFor(r)}
                          disabled={!canWrite}
                          onChange={(e) =>
                            setCaptures((c) => ({ ...c, [r.bom_line_id]: { supplierLot: e.target.value } }))
                          }
                          placeholder={r.traceability_required ? "batch/lot (required)" : "batch/lot (optional)"}
                          className={`h-8 text-xs font-mono ${r.traceability_required && !capFor(r).trim() ? "border-orange-300" : ""}`}
                        />
                        {r.suggested_grn_number && (
                          <p className="text-[10px] text-gray-400 mt-0.5">FIFO: {r.suggested_grn_number}</p>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {canWrite ? (
            <>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Notes (optional)</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Issue notes…" />
              </div>
              <Button onClick={handleIssue} disabled={issue.isPending || hasShortage}>
                {issue.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <PackageCheck className="h-4 w-4 mr-1" />}
                Issue Materials
              </Button>
            </>
          ) : (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <ShieldAlert className="h-4 w-4" />
              Only supervisors and directors can issue materials.
            </div>
          )}
        </CardContent>
      </Card>
      {reversedMins.length > 0 && <ReversedHistory count={reversedMins.length} />}
    </div>
  );
}

function ReversedHistory({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-2 text-xs text-gray-400 px-1">
      <Undo2 className="h-3.5 w-3.5" />
      {count} reversed material issue{count > 1 ? "s" : ""} in history (append-only).
    </div>
  );
}
