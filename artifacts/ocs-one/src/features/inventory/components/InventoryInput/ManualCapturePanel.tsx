import { useEffect, useMemo, useState } from "react";
import {
  usePreviewAttributeTemplateVersion,
  useResolveMaterialAttributeTemplate,
  useCreateGrn,
} from "@workspace/api-client-react";
import type { GrnInput } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Save } from "lucide-react";
import { useOdsNotify } from "@/hooks/use-ods-notify";
import DynamicCaptureFields from "./DynamicCaptureFields";
import {
  toGrnLines,
  validateCaptureValues,
  type CaptureValues,
  type ManualCapturePanelProps,
} from "./types";

export default function ManualCapturePanel({
  supplierId,
  receivedDate,
  invoiceNumber,
  remarks,
  lines,
  materials,
  canSubmit,
  onLineChange,
  onSubmitted,
}: ManualCapturePanelProps) {
  const notify = useOdsNotify();
  const [values, setValues] = useState<CaptureValues>([]);
  const [selectedLine, setSelectedLine] = useState(0);
  const createGrnMutation = useCreateGrn();
  const line = lines[selectedLine] ?? lines[0];
  const material = useMemo(
    () => materials.find((item) => item.id === line?.material_id),
    [line?.material_id, materials],
  );
  const resolution = useResolveMaterialAttributeTemplate(
    line?.material_id ? ({ material_id: line.material_id } as any) : undefined,
    { query: { enabled: Boolean(line?.material_id) } as any },
  );
  const previewVersionId =
    resolution.data?.kind === "OK" ? resolution.data.template_version_id : undefined;

  // The preview operation is deliberately separate from resolution so fields
  // remain server-driven and never get copied into frontend configuration.
  const previewQuery = usePreviewAttributeTemplateVersion(
    previewVersionId ?? "",
    { query: { enabled: Boolean(previewVersionId) } as any },
  );

  useEffect(() => {
    setValues([]);
  }, [line?.material_id, previewVersionId]);

  const submit = async () => {
    if (!supplierId) {
      notify.error("Select a supplier in the GRN header first");
      return;
    }
    if (!receivedDate) {
      notify.error("Received date is required");
      return;
    }
    if (!lines.length || lines.some((item) => !item.material_id)) {
      notify.error("Every GRN line needs a material");
      return;
    }
    if (
      lines.some(
        (item) => !Number.isFinite(Number(item.quantity_received)) || Number(item.quantity_received) <= 0,
      )
    ) {
      notify.error("Every GRN line needs a quantity greater than 0");
      return;
    }
    const captureErrors = validateCaptureValues(previewQuery.data, values);
    if (captureErrors.length) {
      notify.error(captureErrors[0]);
      return;
    }

    const payload: GrnInput = {
      supplier_id: supplierId,
      received_date: receivedDate,
      invoice_number: invoiceNumber.trim() || undefined,
      remarks: remarks.trim() || undefined,
      lines: toGrnLines(lines),
      attribute_values: values.length
        ? [{ line_number: selectedLine + 1, attributes: values }]
        : undefined,
    };

    try {
      const created = await createGrnMutation.mutateAsync({ data: payload });
      notify.success(`GRN ${created.grn_number} created as draft`);
      onSubmitted?.(created.id);
    } catch (error: any) {
      notify.error(error?.data?.error ?? "Failed to create GRN with captured attributes");
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-muted/20 p-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Line to capture</Label>
            <Select
              value={String(selectedLine)}
              onValueChange={(value) => setSelectedLine(Number(value))}
              disabled={lines.length < 2}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {lines.map((item, index) => (
                  <SelectItem key={`${index}-${item.material_id}`} value={String(index)}>
                    Line {index + 1}
                    {item.material_id
                      ? ` · ${materials.find((candidate) => candidate.id === item.material_id)?.code ?? "material"}`
                      : " · select material below"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs">Material *</Label>
            <Select
              value={line?.material_id ?? ""}
              onValueChange={(value) => onLineChange(selectedLine, { material_id: value })}
              disabled={!canSubmit}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select material…" />
              </SelectTrigger>
              <SelectContent>
                {materials.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} ({item.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {material && (
              <p className="text-[11px] text-muted-foreground">
                {material.name} · UOM {material.uom ?? "—"}
              </p>
            )}
          </div>
        </div>
      </div>

      {resolution.isFetching && (
        <p className="text-xs text-muted-foreground">Resolving the active capture template…</p>
      )}
      {resolution.data?.kind === "NO_TEMPLATE" && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
          No active capture template is configured for this material. The plain GRN path remains available.
        </div>
      )}
      {resolution.data?.kind === "ERROR" && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-800">
          Capture template resolution failed: {resolution.data.reason}
        </div>
      )}
      {previewQuery.isFetching && (
        <p className="text-xs text-muted-foreground">Loading server-defined fields…</p>
      )}
      <DynamicCaptureFields
        preview={previewQuery.data}
        values={values}
        onChange={setValues}
        disabled={!canSubmit}
      />

      <div className="flex justify-end">
        <Button onClick={submit} disabled={!canSubmit || createGrnMutation.isPending} className="gap-2">
          {createGrnMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          <Save className="h-4 w-4" />
          Create Draft GRN with Capture
        </Button>
      </div>
    </div>
  );
}