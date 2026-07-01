import { useMemo, useState } from "react";
import AppLayout from "@/layouts/AppLayout";
import {
  useListProductMasters,
  useListProductCategories,
  useCreateImportedProduct,
  getListProductsQueryKey,
} from "@workspace/api-client-react";
import type { ImportedProductInput } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, PackagePlus, Trash2, Plus } from "lucide-react";
import { useOdsNotify } from "@/hooks/use-ods-notify";
import { ModuleHeader } from "@/components/ods";

// Category codes that may be imported as finished goods (Product Platform-driven).
// OCS_SERIAL → OCS mints the official serial (quantity input).
// OEM_SERIAL → the manufacturer's serial is captured (one per unit).
const OCS_SERIAL_CATEGORY = "INBUILT_LITHIUM_INVERTER";
const OEM_SERIAL_CATEGORY = "HYBRID_INVERTER";
const IMPORTABLE_CATEGORIES = [OCS_SERIAL_CATEGORY, OEM_SERIAL_CATEGORY];

export default function ImportedProductPage() {
  const notify = useOdsNotify();
  const qc = useQueryClient();

  const { data: categoriesData } = useListProductCategories({ pageSize: 200 });
  const { data: modelsData, isLoading } = useListProductMasters({ pageSize: 200, status: "active" });
  const createImported = useCreateImportedProduct();

  const [modelId, setModelId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [oemSerials, setOemSerials] = useState<string[]>([""]);
  const [notes, setNotes] = useState("");

  // Map category id → code so we can resolve each model's serial mode by an
  // immutable key (a category's display name is director-editable; its id is not).
  const categoryCodeById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categoriesData?.items ?? []) map.set(c.id, c.code);
    return map;
  }, [categoriesData]);

  // Only models whose category is importable are selectable here.
  const importableModels = useMemo(() => {
    return (modelsData?.items ?? []).filter((m) => {
      const code = m.category_id ? categoryCodeById.get(m.category_id) : undefined;
      return code ? IMPORTABLE_CATEGORIES.includes(code) : false;
    });
  }, [modelsData, categoryCodeById]);

  const selectedModel = importableModels.find((m) => m.id === modelId);
  const selectedCode = selectedModel?.category_id
    ? categoryCodeById.get(selectedModel.category_id)
    : undefined;
  const mode: "OCS" | "OEM" | null =
    selectedCode === OCS_SERIAL_CATEGORY ? "OCS" : selectedCode === OEM_SERIAL_CATEGORY ? "OEM" : null;

  const updateSerial = (i: number, v: string) =>
    setOemSerials((prev) => prev.map((s, idx) => (idx === i ? v : s)));
  const addSerialRow = () => setOemSerials((prev) => [...prev, ""]);
  const removeSerialRow = (i: number) =>
    setOemSerials((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));

  const reset = () => {
    setModelId("");
    setQuantity("1");
    setOemSerials([""]);
    setNotes("");
  };

  const handleSubmit = async () => {
    if (!modelId) {
      notify.error("Select a product model");
      return;
    }
    const payload: ImportedProductInput = { model_id: modelId };
    if (notes.trim()) payload.notes = notes.trim();

    if (mode === "OCS") {
      const qty = parseInt(quantity, 10);
      if (!Number.isInteger(qty) || qty < 1) {
        notify.error("Enter a quantity of at least 1");
        return;
      }
      payload.quantity = qty;
    } else if (mode === "OEM") {
      const serials = oemSerials.map((s) => s.trim()).filter((s) => s.length > 0);
      if (serials.length === 0) {
        notify.error("Enter at least one OEM serial number");
        return;
      }
      const dupes = serials.filter((s, i) => serials.indexOf(s) !== i);
      if (dupes.length > 0) {
        notify.error(`Duplicate serial(s): ${[...new Set(dupes)].join(", ")}`);
        return;
      }
      payload.oem_serials = serials;
    } else {
      notify.error("Selected model is not importable");
      return;
    }

    try {
      const result = await createImported.mutateAsync({ data: payload });
      notify.success(`Created ${result.created} imported product(s)`, {
        description: result.items.map((p) => p.official_product_serial).join(", "),
      });
      reset();
      qc.invalidateQueries({ queryKey: getListProductsQueryKey() });
    } catch (e: any) {
      notify.error(e?.data?.error ?? e?.message ?? "Failed to create imported products");
    }
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <ModuleHeader
          icon="📥"
          title="Imported Product Creation"
          description="Create serialized Products for imported finished goods (Inbuilt Lithium & Hybrid inverters). No production order, BOM, or inventory consumption — units enter the platform ready for packing."
          certification="certified"
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-sm">Import Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Product Model *</Label>
                <Select value={modelId} onValueChange={setModelId}>
                  <SelectTrigger>
                    <SelectValue placeholder={isLoading ? "Loading…" : "Select an importable model"} />
                  </SelectTrigger>
                  <SelectContent>
                    {importableModels.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.code} — {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!isLoading && importableModels.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No active importable models. Add an Inbuilt Lithium or Hybrid Inverter model master first.
                  </p>
                )}
              </div>

              {mode === "OCS" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Quantity *</Label>
                  <Input
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    OCS mints one official serial per unit (LIV-YYYYMMDD-NNNNNN).
                  </p>
                </div>
              )}

              {mode === "OEM" && (
                <div className="space-y-2">
                  <Label className="text-xs">Manufacturer (OEM) Serial Numbers *</Label>
                  <p className="text-xs text-muted-foreground">
                    One Product is created per serial. The OEM serial becomes the official serial.
                  </p>
                  <div className="space-y-2">
                    {oemSerials.map((s, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input
                          value={s}
                          onChange={(e) => updateSerial(i, e.target.value)}
                          placeholder={`OEM serial #${i + 1}`}
                          className="font-mono"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeSerialRow(i)}
                          disabled={oemSerials.length === 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addSerialRow} className="gap-1">
                    <Plus className="h-3.5 w-3.5" /> Add serial
                  </Button>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs">Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes (recorded in genealogy)"
                  rows={2}
                />
              </div>

              <Button
                className="w-full gap-1"
                onClick={handleSubmit}
                disabled={createImported.isPending || !modelId || !mode}
              >
                {createImported.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PackagePlus className="h-4 w-4" />
                )}
                Create Imported Product(s)
              </Button>
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-sm">How it works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">Inbuilt Lithium Inverter</span> — OCS
                assigns the official serial automatically. Enter the quantity to create.
              </p>
              <p>
                <span className="font-medium text-foreground">Hybrid Inverter</span> — capture the
                manufacturer's serial for each unit; it becomes the official serial.
              </p>
              <p>
                Every unit is created at <span className="font-mono">ready_for_packing</span> and flows
                through the same Packing → Dispatch → Warranty chain as manufactured products.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
