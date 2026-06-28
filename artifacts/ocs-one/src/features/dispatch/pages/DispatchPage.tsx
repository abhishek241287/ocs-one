import { useMemo, useState } from "react";
import AppLayout from "@/layouts/AppLayout";
import {
  useListProducts,
  useListDealers,
  useDispatchProducts,
  getListProductsQueryKey,
} from "@workspace/api-client-react";
import type { DispatchProductsInput } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Truck } from "lucide-react";
import { useOdsNotify } from "@/hooks/use-ods-notify";
import { ModuleHeader } from "@/components/ods";

const today = () => new Date().toISOString().split("T")[0];

export default function DispatchPage() {
  const notify = useOdsNotify();
  const qc = useQueryClient();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dealerId, setDealerId] = useState("");
  const [dispatchNumber, setDispatchNumber] = useState("");
  const [dispatchDate, setDispatchDate] = useState(today());
  const [invoiceNumber, setInvoiceNumber] = useState("");

  const eligibleParams = { product_status: "packed", pageSize: 200 } as const;
  const { data, isLoading, isFetching, refetch } = useListProducts(eligibleParams);
  const { data: dealersData } = useListDealers({ pageSize: 500 } as any);
  const dispatchProducts = useDispatchProducts();

  const items = useMemo(() => data?.items ?? [], [data]);
  const dealers = useMemo(
    () => (dealersData?.items ?? []).filter((d: any) => d.status === "active"),
    [dealersData],
  );
  const allSelected = items.length > 0 && selected.size === items.length;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) =>
      prev.size === items.length ? new Set() : new Set(items.map((p) => p.id)),
    );

  const handleSubmit = async () => {
    if (selected.size === 0) {
      notify.error("Select at least one product to dispatch");
      return;
    }
    if (!dealerId) {
      notify.error("Select a dealer");
      return;
    }
    if (!dispatchNumber.trim()) {
      notify.error("Dispatch number is required");
      return;
    }
    if (!dispatchDate) {
      notify.error("Dispatch date is required");
      return;
    }
    if (!invoiceNumber.trim()) {
      notify.error("Invoice number is required");
      return;
    }

    const payload: DispatchProductsInput = {
      product_ids: Array.from(selected),
      dealer_id: dealerId,
      dispatch_number: dispatchNumber.trim(),
      dispatch_date: dispatchDate,
      invoice_number: invoiceNumber.trim(),
    };

    try {
      const result = await dispatchProducts.mutateAsync({ data: payload });
      notify.success(`Dispatched ${result.dispatched} product(s)`);
      setSelected(new Set());
      setDispatchNumber("");
      setInvoiceNumber("");
      qc.invalidateQueries({ queryKey: getListProductsQueryKey() });
    } catch (e: any) {
      const invalid = e?.response?.data?.invalid as
        | { serial?: string; product_id: string; reason: string }[]
        | undefined;
      if (invalid?.length) {
        const names = invalid.map((i) => i.serial ?? i.product_id).join(", ");
        notify.error(`Not in packed status: ${names}`);
      } else {
        notify.error(e?.response?.data?.error ?? "Failed to dispatch products");
      }
    }
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <ModuleHeader
          icon="🚚"
          title="Dispatch"
          description="Dispatch packed products to a dealer. Each dispatch assigns the dealer and records the dispatch, invoice, and date on the product timeline."
          certification="certified"
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Packed ({items.length})</CardTitle>
              <div className="flex items-center gap-3">
                {items.length > 0 && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                    Select all
                  </label>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetch()}
                  disabled={isFetching}
                >
                  {isFetching && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="py-10 flex justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : items.length === 0 ? (
                <p className="text-sm text-muted-foreground py-10 text-center">
                  No packed products awaiting dispatch.
                </p>
              ) : (
                <div className="space-y-2">
                  {items.map((p) => {
                    const checked = selected.has(p.id);
                    return (
                      <label
                        key={p.id}
                        className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                          checked ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                        }`}
                      >
                        <Checkbox checked={checked} onCheckedChange={() => toggle(p.id)} />
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-sm font-medium text-orange-600">
                            {p.official_product_serial}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {p.category_name ?? "—"} ·{" "}
                            {p.model_name ?? p.model_code ?? "—"}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-sm">Dispatch Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
                <span className="font-semibold">{selected.size}</span> product(s) selected
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Dealer *</Label>
                <Select value={dealerId} onValueChange={setDealerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a dealer…" />
                  </SelectTrigger>
                  <SelectContent>
                    {dealers.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        No active dealers
                      </div>
                    ) : (
                      dealers.map((d: any) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.dealerName} ({d.dealerCode})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Dispatch Number *</Label>
                <Input
                  value={dispatchNumber}
                  onChange={(e) => setDispatchNumber(e.target.value)}
                  placeholder="e.g. DSP-2026-001"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Dispatch Date *</Label>
                <Input
                  type="date"
                  value={dispatchDate}
                  onChange={(e) => setDispatchDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Invoice Number *</Label>
                <Input
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="e.g. INV-2026-001"
                />
              </div>
              <Button
                className="w-full gap-1"
                onClick={handleSubmit}
                disabled={dispatchProducts.isPending || selected.size === 0}
              >
                {dispatchProducts.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Truck className="h-4 w-4" />
                )}
                Dispatch Selected
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
