import { useMemo, useState } from "react";
import AppLayout from "@/layouts/AppLayout";
import {
  useListSuppliers,
  useListMaterialMasters,
  useCreatePurchaseOrder,
} from "@workspace/api-client-react";
import type { PurchaseOrderInput, PurchaseOrderLineInput } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, Plus, Trash2, Loader2, ShoppingCart } from "lucide-react";
import { useOdsNotify } from "@/hooks/use-ods-notify";
import { ModuleHeader } from "@/components/ods";
import { Link, useLocation } from "wouter";

type LineDraft = { material_id: string; ordered_qty: string; unit_price: string; required_date: string; notes: string };

const EMPTY_LINE: LineDraft = { material_id: "", ordered_qty: "", unit_price: "", required_date: "", notes: "" };

export default function PurchaseOrderCreatePage() {
  const notify = useOdsNotify();
  const [, navigate] = useLocation();

  const [supplierId, setSupplierId] = useState("");
  const [orderedDate, setOrderedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [requiredDate, setRequiredDate] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [terms, setTerms] = useState("");
  const [notes, setNotes] = useState("");
  const [overReceiptTolerance, setOverReceiptTolerance] = useState("0");
  const [lines, setLines] = useState<LineDraft[]>([{ ...EMPTY_LINE }]);

  const { data: suppliers } = useListSuppliers({ pageSize: 200 } as any);
  const { data: materials } = useListMaterialMasters({ pageSize: 500 } as any);
  const createPo = useCreatePurchaseOrder();

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
    
    if (currency.length !== 3) {
      notify.error("Currency must be exactly 3 characters (e.g. USD, EUR)");
      return;
    }

    const parsedLines: PurchaseOrderLineInput[] = [];
    for (const l of lines) {
      if (!l.material_id) {
        notify.error("Every line needs a material");
        return;
      }
      const qty = Number(l.ordered_qty);
      if (!Number.isFinite(qty) || qty <= 0) {
        notify.error("Every line needs an ordered quantity greater than 0");
        return;
      }
      const price = l.unit_price ? Number(l.unit_price) : undefined;
      if (price !== undefined && (!Number.isFinite(price) || price < 0)) {
        notify.error("Unit price must be a non-negative number if provided");
        return;
      }

      parsedLines.push({
        material_id: l.material_id,
        ordered_qty: qty,
        unit_price: price,
        required_date: l.required_date || undefined,
        notes: l.notes.trim() || undefined,
      });
    }

    const payload: PurchaseOrderInput = {
      supplier_id: supplierId,
      ordered_date: orderedDate || undefined,
      required_date: requiredDate || undefined,
      currency: currency.toUpperCase(),
      terms: terms.trim() || undefined,
      notes: notes.trim() || undefined,
      over_receipt_tolerance_percent: Number(overReceiptTolerance) || 0,
      lines: parsedLines,
    };

    try {
      const created = await createPo.mutateAsync({ data: payload });
      notify.success(`PO ${created.po_number} created as draft`);
      navigate(`/procurement/purchase-orders/${created.id}`);
    } catch (e: any) {
      notify.error(e?.response?.data?.error ?? "Failed to create Purchase Order");
    }
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <div className="flex items-center gap-3">
          <Link 
            href="/procurement/purchase-orders"
            className="inline-flex items-center justify-center whitespace-nowrap font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground rounded-md h-8 px-3 text-xs gap-1"
          >
            <ChevronLeft className="h-4 w-4" />Purchase Orders
          </Link>
        </div>

        <ModuleHeader
          icon={<ShoppingCart className="h-6 w-6 text-primary" />}
          title="New Purchase Order"
          description="Create a draft purchase order to send to a supplier."
          certification="certified"
        />

        <Card>
          <CardHeader><CardTitle className="text-sm">Header</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-1.5 md:col-span-2">
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
                <Label className="text-xs">Ordered Date</Label>
                <Input type="date" value={orderedDate} onChange={(e) => setOrderedDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Required Date</Label>
                <Input type="date" value={requiredDate} onChange={(e) => setRequiredDate(e.target.value)} />
              </div>
              
              <div className="space-y-1.5">
                <Label className="text-xs">Currency *</Label>
                <Input value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} placeholder="USD" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Over-Receipt Tolerance (%)</Label>
                <Input type="number" min="0" max="100" value={overReceiptTolerance} onChange={(e) => setOverReceiptTolerance(e.target.value)} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label className="text-xs">Terms</Label>
                <Input value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Payment/delivery terms" />
              </div>

              <div className="space-y-1.5 md:col-span-4">
                <Label className="text-xs">Notes</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="General PO notes" />
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
                  <div key={idx} className="rounded-md border p-3 bg-muted/20 space-y-3">
                    <div className="grid grid-cols-12 gap-3 items-end">
                      <div className="col-span-4 space-y-1.5">
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
                      <div className="col-span-2 space-y-1.5">
                        <Label className="text-xs">Ordered Qty *</Label>
                        <div className="flex gap-2">
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            value={line.ordered_qty}
                            onChange={(e) => updateLine(idx, { ordered_qty: e.target.value })}
                            placeholder="0"
                          />
                        </div>
                      </div>
                      <div className="col-span-1 space-y-1.5">
                        <Label className="text-xs">UOM</Label>
                        <Input value={mat?.uom ?? "—"} disabled readOnly className="bg-muted/40" />
                      </div>
                      <div className="col-span-2 space-y-1.5">
                        <Label className="text-xs">Unit Price</Label>
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          value={line.unit_price}
                          onChange={(e) => updateLine(idx, { unit_price: e.target.value })}
                          placeholder="Optional"
                        />
                      </div>
                      <div className="col-span-2 space-y-1.5">
                        <Label className="text-xs">Required Date</Label>
                        <Input
                          type="date"
                          value={line.required_date}
                          onChange={(e) => updateLine(idx, { required_date: e.target.value })}
                        />
                      </div>
                      <div className="col-span-1 text-right">
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
                    <div className="grid grid-cols-12 gap-3 items-end">
                      <div className="col-span-12 space-y-1.5">
                        <Label className="text-xs">Line Notes</Label>
                        <Input
                          value={line.notes}
                          onChange={(e) => updateLine(idx, { notes: e.target.value })}
                          placeholder="Line specific instructions"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Link 
            href="/procurement/purchase-orders"
            className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
          >
            Cancel
          </Link>
          <Button onClick={handleSubmit} disabled={createPo.isPending}>
            {createPo.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Create Draft PO
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
