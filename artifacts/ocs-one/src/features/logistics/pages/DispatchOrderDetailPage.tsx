import { useState } from "react";
import AppLayout from "@/layouts/AppLayout";
import {
  useGetDispatchOrder, useAddDispatchItem, useRemoveDispatchItem, useAdvanceDispatchStatus,
  getGetDispatchOrderQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Truck, Plus, Trash2, Loader2, ChevronLeft, Package, MapPin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link, useParams } from "wouter";

const STATUS_STEPS = [
  { key: "draft", label: "Draft" },
  { key: "confirmed", label: "Confirmed" },
  { key: "loaded", label: "Loaded" },
  { key: "in_transit", label: "In Transit" },
  { key: "delivered", label: "Delivered" },
];

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  confirmed: "bg-blue-100 text-blue-700",
  loaded: "bg-yellow-100 text-yellow-700",
  in_transit: "bg-orange-100 text-orange-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-600",
};

const NEXT_STATUS: Record<string, string> = {
  draft: "confirmed",
  confirmed: "loaded",
  loaded: "in_transit",
  in_transit: "delivered",
};

const EVENT_ICONS: Record<string, string> = {
  ready_for_dispatch: "📦",
  loaded: "🚚",
  in_transit: "🛣️",
  delivered: "✅",
  received_by_dealer: "🤝",
};

export default function DispatchOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [addBatteryId, setAddBatteryId] = useState("");
  const [showAddBattery, setShowAddBattery] = useState(false);
  const [statusActor, setStatusActor] = useState("Abhishek");
  const [statusNotes, setStatusNotes] = useState("");
  const [showStatusDialog, setShowStatusDialog] = useState(false);

  const { data: order, isLoading } = useGetDispatchOrder(id ?? "");
  const addItem = useAddDispatchItem();
  const removeItem = useRemoveDispatchItem();
  const advanceStatus = useAdvanceDispatchStatus();

  const invalidate = () => qc.invalidateQueries({ queryKey: getGetDispatchOrderQueryKey(id ?? "") });

  const handleAddBattery = async () => {
    if (!addBatteryId.trim()) { toast({ title: "Production order ID required", variant: "destructive" }); return; }
    try {
      await addItem.mutateAsync({ id: id ?? "", data: { productionOrderId: addBatteryId.trim() } });
      toast({ title: "Battery added to dispatch order" });
      setAddBatteryId("");
      setShowAddBattery(false);
      invalidate();
    } catch (e: any) {
      toast({ title: e?.response?.data?.error ?? "Failed to add battery", variant: "destructive" });
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    try {
      await removeItem.mutateAsync({ id: id ?? "", itemId });
      toast({ title: "Battery removed" });
      invalidate();
    } catch { toast({ title: "Failed to remove battery", variant: "destructive" }); }
  };

  const handleAdvanceStatus = async () => {
    if (!order) return;
    const nextStatus = NEXT_STATUS[order.status];
    if (!nextStatus) return;
    try {
      await advanceStatus.mutateAsync({ id: id ?? "", data: { status: nextStatus as any, actor: statusActor, notes: statusNotes || undefined } });
      toast({ title: `Status updated to ${nextStatus.replace("_", " ")}` });
      setShowStatusDialog(false);
      setStatusNotes("");
      invalidate();
    } catch (e: any) {
      toast({ title: e?.response?.data?.error ?? "Failed to update status", variant: "destructive" });
    }
  };

  if (isLoading) {
    return <AppLayout><div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div></AppLayout>;
  }

  if (!order) {
    return <AppLayout><div className="p-6 text-muted-foreground">Dispatch order not found.</div></AppLayout>;
  }

  const currentStepIdx = STATUS_STEPS.findIndex((s) => s.key === order.status);
  const nextStatus = NEXT_STATUS[order.status];

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/logistics/dispatch-orders">
            <Button variant="ghost" size="sm" className="gap-1"><ChevronLeft className="h-4 w-4" />Orders</Button>
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold font-mono">{order.dispatchNumber}</h1>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLOR[order.status] ?? ""}`}>
                {order.status.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
              </span>
            </div>
            {order.dealer && (
              <p className="text-sm text-muted-foreground mt-1">
                Dealer: <strong>{order.dealer.dealerName}</strong> ({order.dealer.dealerCode})
              </p>
            )}
          </div>
          {nextStatus && (
            <Button onClick={() => setShowStatusDialog(true)} className="bg-blue-600 hover:bg-blue-700">
              <Truck className="h-4 w-4 mr-1" />Mark as {nextStatus.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
            </Button>
          )}
        </div>

        {/* Status stepper */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-0">
              {STATUS_STEPS.map((step, idx) => {
                const isCompleted = idx < currentStepIdx;
                const isCurrent = idx === currentStepIdx;
                const _isFuture = idx > currentStepIdx;
                return (
                  <div key={step.key} className="flex items-center flex-1">
                    <div className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isCompleted ? "bg-green-500 text-white" : isCurrent ? "bg-blue-600 text-white ring-2 ring-blue-300" : "bg-gray-100 text-gray-400"}`}>
                        {isCompleted ? "✓" : idx + 1}
                      </div>
                      <span className={`text-xs mt-1 font-medium ${isCurrent ? "text-blue-600" : isCompleted ? "text-green-600" : "text-gray-400"}`}>{step.label}</span>
                    </div>
                    {idx < STATUS_STEPS.length - 1 && (
                      <div className={`flex-1 h-0.5 mx-2 mt-[-0.85rem] ${isCompleted ? "bg-green-500" : "bg-gray-200"}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Order details */}
          <Card className="md:col-span-1">
            <CardHeader><CardTitle className="text-sm">Order Details</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Customer</span><span>{order.customerName ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Transporter</span><span>{order.transporter ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Vehicle</span><span className="font-mono">{order.vehicleNumber ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Driver</span><span>{order.driverName ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Driver Mobile</span><span>{order.driverMobile ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Dispatch Date</span><span>{order.dispatchDate ?? "—"}</span></div>
              {order.notes && <div className="pt-2 text-xs text-muted-foreground border-t">{order.notes}</div>}
            </CardContent>
          </Card>

          {/* Batteries */}
          <Card className="md:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Package className="h-4 w-4" />Batteries ({order.items.length})
                </CardTitle>
                {order.status === "draft" && (
                  <Button size="sm" variant="outline" onClick={() => setShowAddBattery(true)}>
                    <Plus className="h-3 w-3 mr-1" />Add Battery
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {order.items.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No batteries added yet.</p>
              ) : (
                <div className="space-y-2">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/20">
                      <div>
                        <p className="font-mono text-sm font-semibold">{item.batteryNumber}</p>
                        <p className="text-xs text-muted-foreground">{item.orderNumber} · Added {new Date(item.addedAt).toLocaleDateString()}</p>
                      </div>
                      {order.status === "draft" && (
                        <Button size="sm" variant="ghost" onClick={() => handleRemoveItem(item.id)} className="text-red-500">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Shipment timeline */}
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><MapPin className="h-4 w-4" />Shipment Events</CardTitle></CardHeader>
          <CardContent>
            {order.shipmentEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No events yet. Advance the status to log shipment events.</p>
            ) : (
              <div className="space-y-3">
                {order.shipmentEvents.map((e) => (
                  <div key={e.id} className="flex items-start gap-3">
                    <span className="text-lg">{EVENT_ICONS[e.eventType] ?? "📋"}</span>
                    <div>
                      <p className="text-sm font-medium">{e.eventType.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(e.occurredAt).toLocaleString()}
                        {e.actor && ` · ${e.actor}`}
                      </p>
                      {e.notes && <p className="text-xs text-muted-foreground">{e.notes}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Battery Dialog */}
      {showAddBattery && (
        <Dialog open onOpenChange={() => setShowAddBattery(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Add Battery to Dispatch</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <p className="text-xs text-muted-foreground">Only QC-approved batteries can be added.</p>
              <div className="space-y-1.5">
                <Label className="text-xs">Production Order ID</Label>
                <Input value={addBatteryId} onChange={(e) => setAddBatteryId(e.target.value)} placeholder="UUID of the production order" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddBattery(false)}>Cancel</Button>
              <Button onClick={handleAddBattery} disabled={addItem.isPending}>
                {addItem.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}Add Battery
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Status Advance Dialog */}
      {showStatusDialog && nextStatus && (
        <Dialog open onOpenChange={() => setShowStatusDialog(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Mark as {nextStatus.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Updated by *</Label>
                <Input value={statusActor} onChange={(e) => setStatusActor(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Notes</Label>
                <Input value={statusNotes} onChange={(e) => setStatusNotes(e.target.value)} placeholder="Optional notes..." />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowStatusDialog(false)}>Cancel</Button>
              <Button onClick={handleAdvanceStatus} disabled={advanceStatus.isPending}>
                {advanceStatus.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}Confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </AppLayout>
  );
}
