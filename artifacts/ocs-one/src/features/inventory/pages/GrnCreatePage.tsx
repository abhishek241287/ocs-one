import { useMemo, useState } from "react";
import AppLayout from "@/layouts/AppLayout";
import {
  useListSuppliers,
  useListMaterialMasters,
  useCreateGrn,
} from "@workspace/api-client-react";
import type { GrnInput, GrnLineItemInput } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, Plus, Trash2, Loader2 } from "lucide-react";
import { useOdsNotify } from "@/hooks/use-ods-notify";
import { ModuleHeader } from "@/components/ods";
import { Link, useLocation } from "wouter";

type LineDraft = { material_id: string; quantity_received: string };

const EMPTY_LINE: LineDraft = { material_id: "", quantity_received: "" };

export default function GrnCreatePage() {
  const notify = useOdsNotify();
  const [, navigate] = useLocation();

  const [supplierId, setSupplierId] = useState("");
  const [receivedDate, setReceivedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [remarks, setRemarks] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([{ ...EMPTY_LINE }]);

  const { data: suppliers } = useListSuppliers({ pageSize: 200 } as any);
  const { data: materials } = useListMaterialMasters({ pageSize: 500 } as any);
  const createGrn = useCreateGrn();

  const supplierOptions = useMemo(
    () => (suppliers?.items ?? []).filter((s: any) => s.status === "active"),
    [suppliers]
  );
  const materialList = useMemo(
    () => (materials?.items ?? []).filter((m: any) => m.status === "active"),
    [materials]
  );
  const materialById = useMemo(() => {
    const map = new Map<string, any>();
    for (const m of materialList) map.set(m.id, m);
    return map;
  }, [materialList]);

  const updateLine = (idx: number, patch: Partial<LineDraft>) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const addLine = () => setLines((prev) => [...prev, { ...EMPTY_LINE }]);
  const removeLine = (idx: number) =>
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));

  const handleSubmit = async () => {
    if (!supplierId) {
      notify.error("Select a supplier");
      return;
    }
    if (!receivedDate) {
      notify.error("Received date is required");
      return;
    }
    const parsedLines: GrnLineItemInput[] = [];
    for (const l of lines) {
      if (!l.material_id) {
        notify.error("Every line needs a material");
        return;
      }
      const qty = Number(l.quantity_received);
      if (!Number.isFinite(qty) || qty <= 0) {
        notify.error("Every line needs a quantity greater than 0");
        return;
      }
      parsedLines.push({ material_id: l.material_id, quantity_received: qty });
    }

    const payload: GrnInput = {
      supplier_id: supplierId,
      received_date: receivedDate,
      remarks: remarks || undefined,
      lines: parsedLines,
    };

    try {
      const created = await createGrn.mutateAsync({ data: payload });
      notify.success(`GRN ${created.grn_number} created as draft`);
      navigate(`/inventory/grns/${created.id}`);
    } catch (e: any) {
      notify.error(e?.response?.data?.error ?? "Failed to create GRN");
    }
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <div className="flex items-center gap-3">
          <Link href="/inventory/grns">
            <Button variant="ghost" size="sm" className="gap-1">
              <ChevronLeft className="h-4 w-4" />GRNs
            </Button>
          </Link>
        </div>

        <ModuleHeader
          icon="📥"
          title="New Goods Receipt Note"
          description="Record received material. The GRN is created as a draft — post it to generate inventory transactions."
          certification="certified"
        />

        <Card>
          <CardHeader><CardTitle className="text-sm">Header</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Supplier *</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger><SelectValue placeholder="Select supplier…" /></SelectTrigger>
                  <SelectContent>
                    {supplierOptions.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Received Date *</Label>
                <Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Remarks</Label>
                <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Line Items</CardTitle>
              <Button size="sm" variant="outline" onClick={addLine} className="gap-1 h-8 text-xs">
                <Plus className="h-3 w-3" /> Add Line
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {lines.map((line, idx) => {
                const mat = materialById.get(line.material_id);
                return (
                  <div key={idx} className="grid grid-cols-12 gap-3 items-end">
                    <div className="col-span-6 space-y-1.5">
                      <Label className="text-xs">Material *</Label>
                      <Select
                        value={line.material_id}
                        onValueChange={(v) => updateLine(idx, { material_id: v })}
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
                    <div className="col-span-3 space-y-1.5">
                      <Label className="text-xs">Quantity *</Label>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={line.quantity_received}
                        onChange={(e) => updateLine(idx, { quantity_received: e.target.value })}
                        placeholder="0"
                      />
                    </div>
                    <div className="col-span-2 space-y-1.5">
                      <Label className="text-xs">UOM</Label>
                      <Input value={mat?.uom ?? "—"} disabled readOnly className="bg-muted/40" />
                    </div>
                    <div className="col-span-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9 text-red-500"
                        disabled={lines.length === 1}
                        onClick={() => removeLine(idx)}
                        title="Remove line"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Link href="/inventory/grns">
            <Button variant="outline">Cancel</Button>
          </Link>
          <Button onClick={handleSubmit} disabled={createGrn.isPending}>
            {createGrn.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Create Draft GRN
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
