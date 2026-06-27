import { useState } from "react";
import AppLayout from "@/layouts/AppLayout";
import {
  useListDispatchOrders, useCreateDispatchOrder, useListDealers,
  getListDispatchOrdersQueryKey, DispatchOrderInput,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Truck, Plus, Loader2, RefreshCw, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  confirmed: "bg-blue-100 text-blue-700",
  loaded: "bg-yellow-100 text-yellow-700",
  in_transit: "bg-orange-100 text-orange-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-600",
};

const EMPTY_FORM: DispatchOrderInput = {
  dealerId: undefined, customerName: "", transporter: "", vehicleNumber: "",
  driverName: "", driverMobile: "", dispatchDate: "", notes: "", createdBy: "Abhishek",
};

export default function DispatchOrdersPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<DispatchOrderInput>(EMPTY_FORM);

  const { data, isLoading, refetch } = useListDispatchOrders(
    statusFilter !== "all" ? { status: statusFilter as any } : {}
  );
  const { data: dealers } = useListDealers({ pageSize: 100 });
  const createOrder = useCreateDispatchOrder();

  const handleCreate = async () => {
    try {
      const payload: DispatchOrderInput = {
        ...form,
        dealerId: form.dealerId || undefined,
        customerName: form.customerName || undefined,
        transporter: form.transporter || undefined,
        vehicleNumber: form.vehicleNumber || undefined,
        driverName: form.driverName || undefined,
        driverMobile: form.driverMobile || undefined,
        dispatchDate: form.dispatchDate || undefined,
        notes: form.notes || undefined,
      };
      await createOrder.mutateAsync({ data: payload });
      toast({ title: "Dispatch order created" });
      qc.invalidateQueries({ queryKey: getListDispatchOrdersQueryKey() });
      setDialogOpen(false);
      setForm(EMPTY_FORM);
    } catch (e: any) {
      toast({ title: e?.response?.data?.error ?? "Failed to create order", variant: "destructive" });
    }
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Truck className="h-6 w-6 text-blue-600" />Dispatch Orders
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Manage battery dispatch orders and shipments</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4 mr-1" />Refresh</Button>
            <Button size="sm" onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-1" />New Dispatch Order</Button>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          {["all", "draft", "confirmed", "loaded", "in_transit", "delivered", "cancelled"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${statusFilter === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
            >
              {s === "all" ? "All" : s.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
            </button>
          ))}
        </div>

        <Card>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dispatch #</TableHead>
                  <TableHead>Dealer / Customer</TableHead>
                  <TableHead>Transporter</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Dispatch Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={8} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
                )}
                {!isLoading && data?.items.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No dispatch orders found.</TableCell></TableRow>
                )}
                {data?.items.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs font-bold text-blue-700">{o.dispatchNumber}</TableCell>
                    <TableCell className="text-sm">{o.customerName ?? "—"}</TableCell>
                    <TableCell className="text-xs">{o.transporter ?? "—"}</TableCell>
                    <TableCell className="text-xs font-mono">{o.vehicleNumber ?? "—"}</TableCell>
                    <TableCell className="text-xs">{o.dispatchDate ?? "—"}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[o.status] ?? ""}`}>
                        {o.status.replace("_", " ")}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(o.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Link href={`/logistics/dispatch-orders/${o.id}`}>
                        <Button size="sm" variant="outline" className="gap-1">
                          View <ArrowRight className="h-3 w-3" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>New Dispatch Order</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Dealer</Label>
              <Select value={form.dealerId ?? ""} onValueChange={(v) => setForm((f) => ({ ...f, dealerId: v || undefined }))}>
                <SelectTrigger><SelectValue placeholder="Select dealer..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No dealer</SelectItem>
                  {dealers?.items.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.dealerName} ({d.dealerCode})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Customer Name</Label><Input value={form.customerName ?? ""} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))} placeholder="End customer" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Transporter</Label><Input value={form.transporter ?? ""} onChange={(e) => setForm((f) => ({ ...f, transporter: e.target.value }))} placeholder="Transporter name" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Vehicle Number</Label><Input value={form.vehicleNumber ?? ""} onChange={(e) => setForm((f) => ({ ...f, vehicleNumber: e.target.value }))} placeholder="MH12AB1234" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Driver Name</Label><Input value={form.driverName ?? ""} onChange={(e) => setForm((f) => ({ ...f, driverName: e.target.value }))} placeholder="Driver name" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Driver Mobile</Label><Input value={form.driverMobile ?? ""} onChange={(e) => setForm((f) => ({ ...f, driverMobile: e.target.value }))} placeholder="+91..." /></div>
            <div className="space-y-1.5"><Label className="text-xs">Dispatch Date</Label><Input type="date" value={form.dispatchDate ?? ""} onChange={(e) => setForm((f) => ({ ...f, dispatchDate: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Created By</Label><Input value={form.createdBy ?? ""} onChange={(e) => setForm((f) => ({ ...f, createdBy: e.target.value }))} /></div>
            <div className="col-span-2 space-y-1.5"><Label className="text-xs">Notes</Label><Input value={form.notes ?? ""} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Dispatch notes..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createOrder.isPending}>
              {createOrder.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}Create Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
