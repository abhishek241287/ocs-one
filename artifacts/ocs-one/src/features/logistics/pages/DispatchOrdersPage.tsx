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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Loader2, RefreshCw, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { useModuleShortcuts } from "@/hooks/use-module-shortcuts";
import { ModuleHeader, OdsTableSkeleton, OdsEmptyState, OdsStatusBadge } from "@/components/ods";

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
  useModuleShortcuts({ onNew: () => setDialogOpen(true) });

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

  const items = data?.items ?? [];

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <ModuleHeader
          icon="🚚"
          title="Dispatch Orders"
          description="Manage battery dispatch orders and shipments"
          certification="certified"
          actions={
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-1" /> Refresh
              </Button>
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> New Dispatch Order
              </Button>
            </div>
          }
        />

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

        {isLoading ? (
          <OdsTableSkeleton rows={6} columns={7} />
        ) : items.length === 0 ? (
          <OdsEmptyState
            icon="🚚"
            title="No dispatch orders found"
            description={statusFilter !== "all" ? "Try a different status filter." : "Create your first dispatch order to get started."}
            action={statusFilter === "all" ? { label: "New Dispatch Order", onClick: () => setDialogOpen(true) } : undefined}
          />
        ) : (
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
                  {items.map((o) => (
                    <TableRow key={o.id} className="hover:bg-muted/50">
                      <TableCell className="font-mono text-xs font-bold text-blue-700">{o.dispatchNumber}</TableCell>
                      <TableCell className="text-sm">{o.customerName ?? "—"}</TableCell>
                      <TableCell className="text-xs">{o.transporter ?? "—"}</TableCell>
                      <TableCell className="text-xs font-mono">{o.vehicleNumber ?? "—"}</TableCell>
                      <TableCell className="text-xs">{o.dispatchDate ?? "—"}</TableCell>
                      <TableCell>
                        <OdsStatusBadge status={o.status} />
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
        )}
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
