import { useRoute, Link } from "wouter";
import AppLayout from "@/layouts/AppLayout";
import { useGetMaterialTransfer } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Loader2, Printer } from "lucide-react";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value ?? "—"}</span>
    </div>
  );
}

export default function MaterialTransferDetailPage() {
  const [, params] = useRoute("/cells/transfers/:id");
  const id = params?.id ?? "";
  const { data, isLoading } = useGetMaterialTransfer(id, { query: { enabled: !!id } } as any);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading transfer…
        </div>
      </AppLayout>
    );
  }

  if (!data) {
    return (
      <AppLayout>
        <div className="p-6 space-y-4">
          <Link href="/cells/receiving">
            <Button variant="ghost" size="sm" className="gap-1"><ChevronLeft className="h-4 w-4" />Receive From Inventory</Button>
          </Link>
          <p className="text-sm text-muted-foreground">Transfer not found.</p>
        </div>
      </AppLayout>
    );
  }

  const lot = data.cell_lot;
  const dateStr = new Date(data.created_at).toLocaleString(undefined, {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  return (
    <AppLayout>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #transfer-note, #transfer-note * { visibility: visible; }
          #transfer-note { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>
      <div className="p-6 space-y-5 max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-4 no-print">
          <Link href="/cells/receiving">
            <Button variant="ghost" size="sm" className="gap-1"><ChevronLeft className="h-4 w-4" />Receive From Inventory</Button>
          </Link>
          <Button variant="outline" size="sm" className="gap-1" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print Note
          </Button>
        </div>

        <div id="transfer-note" className="space-y-5">
          <div className="border-b pb-4">
            <h1 className="text-xl font-bold">Material Transfer Note</h1>
            <p className="font-mono text-sm text-muted-foreground mt-1">{data.transfer_number}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{dateStr}</p>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-sm">Transfer Details</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Row label="From" value={data.from_location} />
              <Row label="To" value={data.to_location} />
              <Row label="Quantity" value={`${data.quantity} ${data.uom}`} />
              <Row label="Material" value={data.material_name ?? data.material_code} />
              <Row label="Source GRN" value={data.grn_number} />
              <Row label="Supplier" value={data.supplier_name} />
              <Row label="Invoice #" value={data.invoice_number} />
              <Row label="Supplier Lot #" value={data.supplier_lot_number} />
              <Row label="Operator" value={data.operator_name} />
              <Row label="Remarks" value={data.remarks} />
            </CardContent>
          </Card>

          {lot && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Generated Cell Lot</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Row label="Lot Number" value={<span className="font-mono">{lot.lotNumber}</span>} />
                <Row label="Cell Model" value={lot.cellModel} />
                <Row label="Chemistry" value={lot.cellChemistry} />
                <Row label="Nominal Capacity" value={`${lot.nominalCapacityAh} Ah`} />
                <Row label="Quantity" value={lot.quantityReceived} />
                <Row label="Date Received" value={lot.dateReceived} />
                <Row label="Manufacturer" value={lot.manufacturer} />
                <Row label="Received By" value={lot.receivedBy} />
                <Row label="Invoice #" value={lot.invoiceNumber} />
              </CardContent>
            </Card>
          )}

          {data.consumed_by && data.consumed_by.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Consumed By (Downstream Production Orders)</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Production Order</th>
                      <th className="px-4 py-2 font-medium">Battery #</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 font-medium text-right">Cells Consumed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.consumed_by.map((c) => (
                      <tr key={c.production_order_id} className="border-b last:border-0">
                        <td className="px-4 py-2 font-mono">{c.order_number ?? "—"}</td>
                        <td className="px-4 py-2 font-mono">{c.battery_number ?? "—"}</td>
                        <td className="px-4 py-2">{c.status ?? "—"}</td>
                        <td className="px-4 py-2 text-right">{c.cells_consumed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
