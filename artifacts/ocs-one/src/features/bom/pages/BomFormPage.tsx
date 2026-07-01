import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/layouts/AppLayout";
import {
  useListProductMasters,
  useListMaterialMasters,
  useCreateBom,
  useUpdateBom,
  useGetBom,
} from "@workspace/api-client-react";
import type { BomInput, BomLineInput } from "@workspace/api-client-react";
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
import { Link, useLocation, useParams } from "wouter";

type LineDraft = {
  material_id: string;
  quantity_per: string;
  scrap_percent: string;
  is_critical_component: boolean;
  traceability_required: boolean;
  is_optional: boolean;
  notes: string;
};

const EMPTY_LINE: LineDraft = {
  material_id: "",
  quantity_per: "",
  scrap_percent: "0",
  is_critical_component: false,
  traceability_required: false,
  is_optional: false,
  notes: "",
};

export default function BomFormPage() {
  const notify = useOdsNotify();
  const [, navigate] = useLocation();
  const { id } = useParams<{ id?: string }>();
  const isEdit = !!id;

  const [modelId, setModelId] = useState("");
  const [name, setName] = useState("");
  const [yieldPercent, setYieldPercent] = useState("100");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveTo, setEffectiveTo] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([{ ...EMPTY_LINE }]);

  const { data: models } = useListProductMasters({ pageSize: 500 } as any);
  const { data: materials } = useListMaterialMasters({ pageSize: 500 } as any);
  const { data: existing, isLoading: loadingExisting, isError: existingError } = useGetBom(id ?? "", {
    query: { enabled: isEdit },
  } as any);
  const createBom = useCreateBom();
  const updateBom = useUpdateBom();

  // Prefill the form when editing an existing draft.
  useEffect(() => {
    if (!isEdit || !existing) return;
    setModelId(existing.model_id);
    setName(existing.name ?? "");
    setYieldPercent(String(existing.yield_percent ?? 100));
    setEffectiveFrom(existing.effective_from ?? "");
    setEffectiveTo(existing.effective_to ?? "");
    setNotes(existing.notes ?? "");
    setLines(
      existing.lines.length > 0
        ? existing.lines.map((l) => ({
            material_id: l.material_id,
            quantity_per: String(l.quantity_per),
            scrap_percent: String(l.scrap_percent),
            is_critical_component: l.is_critical_component,
            traceability_required: l.traceability_required,
            is_optional: l.is_optional,
            notes: l.notes ?? "",
          }))
        : [{ ...EMPTY_LINE }]
    );
  }, [isEdit, existing]);

  const modelOptions = useMemo(
    () => (models?.items ?? []).filter((m: any) => m.status === "active" || m.id === modelId),
    [models, modelId]
  );
  const materialList = useMemo(
    () => (materials?.items ?? []).filter((m: any) => m.status === "active"),
    [materials]
  );
  const materialById = useMemo(() => {
    const map = new Map<string, any>();
    for (const m of (materials?.items ?? []) as any[]) map.set(m.id, m);
    return map;
  }, [materials]);

  const updateLine = (idx: number, patch: Partial<LineDraft>) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const addLine = () => setLines((prev) => [...prev, { ...EMPTY_LINE }]);
  const removeLine = (idx: number) =>
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));

  const handleSubmit = async () => {
    if (!isEdit && !modelId) {
      notify.error("Select a product model");
      return;
    }
    const yieldNum = Number(yieldPercent);
    if (!Number.isFinite(yieldNum) || yieldNum < 0 || yieldNum > 100) {
      notify.error("Yield % must be between 0 and 100");
      return;
    }
    const parsedLines: BomLineInput[] = [];
    for (const l of lines) {
      if (!l.material_id) {
        notify.error("Every line needs a material");
        return;
      }
      const qty = Number(l.quantity_per);
      if (!Number.isFinite(qty) || qty <= 0) {
        notify.error("Every line needs a quantity per unit greater than 0");
        return;
      }
      const scrap = Number(l.scrap_percent || "0");
      if (!Number.isFinite(scrap) || scrap < 0 || scrap > 100) {
        notify.error("Scrap % must be between 0 and 100");
        return;
      }
      parsedLines.push({
        material_id: l.material_id,
        quantity_per: qty,
        scrap_percent: scrap,
        is_critical_component: l.is_critical_component,
        traceability_required: l.traceability_required,
        is_optional: l.is_optional,
        position: parsedLines.length + 1,
        notes: l.notes.trim() || undefined,
      });
    }

    const common = {
      name: name.trim() || undefined,
      yield_percent: yieldNum,
      effective_from: effectiveFrom || undefined,
      effective_to: effectiveTo || undefined,
      notes: notes.trim() || undefined,
      lines: parsedLines,
    };

    try {
      if (isEdit) {
        const updated = await updateBom.mutateAsync({ id: id!, data: common });
        notify.success(`BOM ${updated.bom_number} updated`);
        navigate(`/masters/boms/${id}`);
      } else {
        const payload: BomInput = { model_id: modelId, ...common };
        const created = await createBom.mutateAsync({ data: payload });
        notify.success(`BOM ${created.bom_number} created as draft`);
        navigate(`/masters/boms/${created.id}`);
      }
    } catch (e: any) {
      notify.error(e?.data?.error ?? "Failed to save BOM");
    }
  };

  const pending = createBom.isPending || updateBom.isPending;

  if (isEdit && loadingExisting) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (isEdit && (existingError || (!loadingExisting && !existing))) {
    return (
      <AppLayout>
        <div className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            This BOM could not be loaded — it may have been deleted or the link is invalid.
          </p>
          <Link href="/masters/boms">
            <Button variant="outline">Back to BOMs</Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  if (isEdit && existing && existing.status !== "draft") {
    return (
      <AppLayout>
        <div className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            Only draft BOMs can be edited. This BOM is <strong>{existing.status}</strong>.
          </p>
          <Link href={`/masters/boms/${id}`}>
            <Button variant="outline">Back to BOM</Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  const backHref = isEdit ? `/masters/boms/${id}` : "/masters/boms";

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <div className="flex items-center gap-3">
          <Link href={backHref}>
            <Button variant="ghost" size="sm" className="gap-1">
              <ChevronLeft className="h-4 w-4" />{isEdit ? "BOM" : "BOMs"}
            </Button>
          </Link>
        </div>

        <ModuleHeader
          icon="📋"
          title={isEdit ? "Edit Bill of Materials" : "New Bill of Materials"}
          description="Define the component recipe for a product model. Saved as a draft — approve it to lock the revision."
        />

        <Card>
          <CardHeader><CardTitle className="text-sm">Header</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Product Model *</Label>
                <Select value={modelId} onValueChange={setModelId} disabled={isEdit}>
                  <SelectTrigger><SelectValue placeholder="Select model…" /></SelectTrigger>
                  <SelectContent>
                    {modelOptions.map((m: any) => (
                      <SelectItem key={m.id} value={m.id}>{m.name} ({m.code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isEdit && (
                  <p className="text-[11px] text-muted-foreground">
                    Model is fixed for a BOM revision.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Description</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Standard build" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Yield %</Label>
                <Input
                  type="number" min="0" max="100" step="any"
                  value={yieldPercent}
                  onChange={(e) => setYieldPercent(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Effective From</Label>
                <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Effective To</Label>
                <Input type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} />
              </div>
              <div className="space-y-1.5 md:col-span-3">
                <Label className="text-xs">Notes</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Components ({lines.length})</CardTitle>
              <Button size="sm" variant="outline" onClick={addLine} className="gap-1 h-8 text-xs">
                <Plus className="h-3 w-3" /> Add Component
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {lines.map((line, idx) => {
                const mat = materialById.get(line.material_id);
                return (
                  <div key={idx} className="rounded-md border p-3 space-y-3">
                    <div className="grid grid-cols-12 gap-3 items-end">
                      <div className="col-span-5 space-y-1.5">
                        <Label className="text-xs">Material *</Label>
                        <Select
                          value={line.material_id}
                          onValueChange={(v) => updateLine(idx, { material_id: v })}
                        >
                          <SelectTrigger><SelectValue placeholder="Select material…" /></SelectTrigger>
                          <SelectContent>
                            {materialList.map((m: any) => (
                              <SelectItem key={m.id} value={m.id}>{m.name} ({m.code})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2 space-y-1.5">
                        <Label className="text-xs">Qty / Unit *</Label>
                        <Input
                          type="number" min="0" step="any"
                          value={line.quantity_per}
                          onChange={(e) => updateLine(idx, { quantity_per: e.target.value })}
                          placeholder="0"
                        />
                      </div>
                      <div className="col-span-2 space-y-1.5">
                        <Label className="text-xs">Scrap %</Label>
                        <Input
                          type="number" min="0" max="100" step="any"
                          value={line.scrap_percent}
                          onChange={(e) => updateLine(idx, { scrap_percent: e.target.value })}
                          placeholder="0"
                        />
                      </div>
                      <div className="col-span-2 space-y-1.5">
                        <Label className="text-xs">UOM</Label>
                        <Input value={mat?.uom ?? "—"} disabled readOnly className="bg-muted/40" />
                      </div>
                      <div className="col-span-1">
                        <Button
                          size="icon" variant="ghost"
                          className="h-9 w-9 text-red-500"
                          disabled={lines.length === 1}
                          onClick={() => removeLine(idx)}
                          title="Remove component"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-5 pl-1">
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={line.is_critical_component}
                          onChange={(e) => updateLine(idx, { is_critical_component: e.target.checked })}
                        />
                        Critical component
                      </label>
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={line.traceability_required}
                          onChange={(e) => updateLine(idx, { traceability_required: e.target.checked })}
                        />
                        Traceability required
                      </label>
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={line.is_optional}
                          onChange={(e) => updateLine(idx, { is_optional: e.target.checked })}
                        />
                        Optional
                      </label>
                      <Input
                        value={line.notes}
                        onChange={(e) => updateLine(idx, { notes: e.target.value })}
                        placeholder="Line notes (optional)"
                        className="h-8 text-xs flex-1 min-w-[160px]"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Link href={backHref}>
            <Button variant="outline">Cancel</Button>
          </Link>
          <Button onClick={handleSubmit} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {isEdit ? "Save Changes" : "Create Draft BOM"}
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
