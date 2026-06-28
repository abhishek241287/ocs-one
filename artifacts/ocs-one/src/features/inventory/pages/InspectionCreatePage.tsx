import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/layouts/AppLayout";
import {
  useListEligibleGrns,
  useGetGrn,
  useListMaterialMasters,
  useCreateInspection,
  getListEligibleGrnsQueryKey,
  getListInspectionsQueryKey,
  getListStockBalancesQueryKey,
} from "@workspace/api-client-react";
import type {
  IncomingInspectionInput,
  IncomingInspectionLineInput,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, Loader2 } from "lucide-react";
import { useOdsNotify } from "@/hooks/use-ods-notify";
import { ModuleHeader } from "@/components/ods";
import { Link, useLocation } from "wouter";

// Per-line working state. accepted is user-entered; rejected auto-complements to the
// immutable received quantity (accepted + rejected MUST equal received — server-enforced).
type LineDraft = {
  grn_line_id: string;
  material_id: string;
  received: number;
  accepted: string;
  rejection_reason: string;
};

export default function InspectionCreatePage() {
  const notify = useOdsNotify();
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const [grnId, setGrnId] = useState("");
  const [remarks, setRemarks] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);

  const { data: eligible } = useListEligibleGrns();
  const { data: grn } = useGetGrn(grnId, { query: { enabled: !!grnId } } as any);
  const { data: materials } = useListMaterialMasters({ pageSize: 500 } as any);
  const createInspection = useCreateInspection();

  const eligibleList = (eligible?.items ?? []) as any[];
  const materialById = useMemo(() => {
    const map = new Map<string, any>();
    for (const m of (materials?.items ?? []) as any[]) map.set(m.id, m);
    return map;
  }, [materials]);

  // When a GRN is chosen, seed the line drafts from its inspection-pending lines only.
  useEffect(() => {
    if (!grn) {
      setLines([]);
      return;
    }
    const pending = (grn.lines ?? []).filter((l: any) => l.inspection_status === "pending");
    setLines(
      pending.map((l: any) => ({
        grn_line_id: l.id,
        material_id: l.material_id,
        received: Number(l.quantity_received),
        accepted: String(l.quantity_received),
        rejection_reason: "",
      }))
    );
  }, [grn]);

  const updateLine = (idx: number, patch: Partial<LineDraft>) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const computeRejected = (l: LineDraft): number => {
    const acc = Number(l.accepted);
    if (!Number.isFinite(acc)) return NaN;
    return Math.round((l.received - acc) * 1000) / 1000;
  };

  const handleSubmit = async () => {
    if (!grnId) {
      notify.error("Select a GRN to inspect");
      return;
    }
    if (lines.length === 0) {
      notify.error("This GRN has no inspection-pending lines");
      return;
    }

    const payloadLines: IncomingInspectionLineInput[] = [];
    for (const l of lines) {
      const accepted = Number(l.accepted);
      const rejected = computeRejected(l);
      if (!Number.isFinite(accepted) || accepted < 0) {
        notify.error("Accepted quantity must be 0 or more on every line");
        return;
      }
      if (!Number.isFinite(rejected) || rejected < 0 || accepted > l.received) {
        notify.error(`Accepted cannot exceed received (${l.received})`);
        return;
      }
      if (rejected > 0 && !l.rejection_reason.trim()) {
        notify.error("A rejection reason is required for any line with rejected quantity");
        return;
      }
      payloadLines.push({
        grn_line_id: l.grn_line_id,
        accepted_qty: accepted,
        rejected_qty: rejected,
        rejection_reason: rejected > 0 ? l.rejection_reason.trim() : null,
      });
    }

    const payload: IncomingInspectionInput = {
      grn_id: grnId,
      remarks: remarks || undefined,
      lines: payloadLines,
    };

    try {
      const created = await createInspection.mutateAsync({ data: payload });
      notify.success(`Inspection ${created.inspection_number} recorded`);
      qc.invalidateQueries({ queryKey: getListInspectionsQueryKey() });
      qc.invalidateQueries({ queryKey: getListEligibleGrnsQueryKey() });
      qc.invalidateQueries({ queryKey: getListStockBalancesQueryKey() });
      navigate(`/inventory/inspections/${created.id}`);
    } catch (e: any) {
      notify.error(e?.response?.data?.error ?? "Failed to record inspection");
    }
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <div className="flex items-center gap-3">
          <Link href="/inventory/inspections">
            <Button variant="ghost" size="sm" className="gap-1">
              <ChevronLeft className="h-4 w-4" />Inspections
            </Button>
          </Link>
        </div>

        <ModuleHeader
          icon="🔍"
          title="New Incoming Inspection"
          description="Accept or reject each pending line. The GRN's received quantities are never changed — this records what OCS accepted."
          certification="certified"
        />

        <Card>
          <CardHeader><CardTitle className="text-sm">Select GRN</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Posted GRN awaiting inspection *</Label>
                <Select value={grnId} onValueChange={setGrnId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an eligible GRN…" />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleList.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        No GRNs awaiting inspection
                      </div>
                    ) : (
                      eligibleList.map((g) => (
                        <SelectItem key={g.grn_id} value={g.grn_id}>
                          {g.grn_number} · {g.pending_line_count} pending line(s)
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Remarks</Label>
                <Input
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {grnId && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                Pending Lines ({lines.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {lines.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  This GRN has no inspection-pending lines.
                </p>
              ) : (
                <div className="space-y-4">
                  {lines.map((line, idx) => {
                    const mat = materialById.get(line.material_id);
                    const rejected = computeRejected(line);
                    const showReason = Number.isFinite(rejected) && rejected > 0;
                    return (
                      <div
                        key={line.grn_line_id}
                        className="rounded-lg border p-4 space-y-3"
                      >
                        <div className="text-sm font-medium">
                          {mat ? `${mat.name} (${mat.code})` : line.material_id}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs">Received (immutable)</Label>
                            <Input
                              value={`${line.received} ${mat?.uom ?? ""}`.trim()}
                              disabled
                              readOnly
                              className="bg-muted/40 font-mono"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Accepted *</Label>
                            <Input
                              type="number"
                              min="0"
                              max={line.received}
                              step="any"
                              value={line.accepted}
                              onChange={(e) => updateLine(idx, { accepted: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Rejected (auto)</Label>
                            <Input
                              value={Number.isFinite(rejected) ? String(rejected) : "—"}
                              disabled
                              readOnly
                              className={`font-mono ${rejected > 0 ? "bg-red-50 text-red-700" : "bg-muted/40"}`}
                            />
                          </div>
                        </div>
                        {showReason && (
                          <div className="space-y-1.5">
                            <Label className="text-xs">Rejection Reason *</Label>
                            <Input
                              value={line.rejection_reason}
                              onChange={(e) =>
                                updateLine(idx, { rejection_reason: e.target.value })
                              }
                              placeholder="Why was this quantity rejected?"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="flex justify-end gap-2">
          <Link href="/inventory/inspections">
            <Button variant="outline">Cancel</Button>
          </Link>
          <Button
            onClick={handleSubmit}
            disabled={createInspection.isPending || !grnId || lines.length === 0}
          >
            {createInspection.isPending && (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            )}
            Record Inspection
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
