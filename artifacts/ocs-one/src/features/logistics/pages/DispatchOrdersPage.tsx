import { useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { Plus, ArrowRight } from "lucide-react";
import AppLayout from "@/layouts/AppLayout";
import {
  useListDispatchOrders, useCreateDispatchOrder, useListDealers,
  getListDispatchOrdersQueryKey, DispatchOrderInput,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Link } from "wouter";
import { useModuleShortcuts } from "@/hooks/use-module-shortcuts";
import { useOdsNotify } from "@/hooks/use-ods-notify";
import {
  ModuleHeader, OdsToolbar, OdsDataTable, OdsStatusBadge, OdsDrawer,
} from "@/components/ods";

const EMPTY_FORM: DispatchOrderInput = {
  dealerId: undefined, customerName: "", transporter: "", vehicleNumber: "",
  driverName: "", driverMobile: "", dispatchDate: "", notes: "", createdBy: "Abhishek",
};

const STATUS_PILLS = ["all", "draft", "confirmed", "loaded", "in_transit", "delivered", "cancelled"];

type DispatchOrder = {
  id: string;
  dispatchNumber: string;
  customerName?: string | null;
  transporter?: string | null;
  vehicleNumber?: string | null;
  dispatchDate?: string | null;
  status: string;
  createdAt: string;
};

const COLUMNS: ColumnDef<DispatchOrder>[] = [
  {
    accessorKey: "dispatchNumber",
    header: "Dispatch #",
    cell: ({ row }) => (
      <span className="font-mono text-xs font-bold text-blue-700">{row.original.dispatchNumber}</span>
    ),
  },
  {
    accessorKey: "customerName",
    header: "Dealer / Customer",
    cell: ({ row }) => <span className="text-sm">{row.original.customerName ?? "—"}</span>,
  },
  {
    accessorKey: "transporter",
    header: "Transporter",
    cell: ({ row }) => <span className="text-xs">{row.original.transporter ?? "—"}</span>,
  },
  {
    accessorKey: "vehicleNumber",
    header: "Vehicle",
    cell: ({ row }) => <span className="text-xs font-mono">{row.original.vehicleNumber ?? "—"}</span>,
  },
  {
    accessorKey: "dispatchDate",
    header: "Dispatch Date",
    cell: ({ row }) => <span className="text-xs">{row.original.dispatchDate ?? "—"}</span>,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <OdsStatusBadge status={row.original.status} />,
  },
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {new Date(row.original.createdAt).toLocaleDateString()}
      </span>
    ),
  },
];

export default function DispatchOrdersPage() {
  const notify = useOdsNotify();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<DispatchOrderInput>(EMPTY_FORM);

  useModuleShortcuts({ onNew: () => setDrawerOpen(true) });

  const { data, isLoading, isFetching, refetch } = useListDispatchOrders(
    statusFilter !== "all" ? { status: statusFilter as any } : {}
  );
  const { data: dealers } = useListDealers({ pageSize: 100 });
  const createOrder = useCreateDispatchOrder();

  const handleCreate = async () => {
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
    notify.success("Dispatch order created");
    qc.invalidateQueries({ queryKey: getListDispatchOrdersQueryKey() });
    setDrawerOpen(false);
    setForm(EMPTY_FORM);
  };

  const f = (k: keyof DispatchOrderInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const items = (data?.items ?? []) as DispatchOrder[];

  const rowActions = (o: DispatchOrder) => (
    <Link href={`/logistics/dispatch-orders/${o.id}`}>
      <Button size="sm" variant="outline" className="gap-1 h-7 text-xs">
        View <ArrowRight className="h-3 w-3" />
      </Button>
    </Link>
  );

  const statusPills = (
    <div className="flex gap-1.5 flex-wrap">
      {STATUS_PILLS.map((s) => (
        <button
          key={s}
          onClick={() => setStatusFilter(s)}
          className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
            statusFilter === s
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          {s === "all" ? "All" : s.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
        </button>
      ))}
    </div>
  );

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <ModuleHeader
          icon="🚚"
          title="Dispatch Orders"
          description="Manage battery dispatch orders and shipments"
          certification="certified"
          actions={
            <Button size="sm" onClick={() => setDrawerOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> New Dispatch Order
            </Button>
          }
        />

        <OdsDataTable
          data={items}
          columns={COLUMNS}
          isLoading={isLoading}
          emptyIcon="🚚"
          emptyTitle="No dispatch orders found"
          emptyDescription={
            statusFilter !== "all"
              ? "Try a different status filter."
              : "Create your first dispatch order to get started."
          }
          emptyAction={
            statusFilter === "all"
              ? { label: "New Dispatch Order", onClick: () => setDrawerOpen(true) }
              : undefined
          }
          rowActions={rowActions}
          getRowId={(o) => o.id}
          enableSorting
          enableColumnVisibility
          enableDensity
          toolbar={
            <OdsToolbar
              filters={statusPills}
              onRefresh={() => refetch()}
              isRefreshing={isFetching}
            />
          }
        />

        <OdsDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title="New Dispatch Order"
          description="Fill in the dispatch details below."
          onSave={handleCreate}
          isSaving={createOrder.isPending}
          size="lg"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">Dealer</Label>
              <Select
                value={form.dealerId ?? ""}
                onValueChange={(v) => setForm((p) => ({ ...p, dealerId: v || undefined }))}
              >
                <SelectTrigger><SelectValue placeholder="Select dealer…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No dealer</SelectItem>
                  {dealers?.items.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.dealerName} ({d.dealerCode})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Customer Name</Label>
              <Input value={form.customerName ?? ""} onChange={f("customerName")} placeholder="End customer" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Transporter</Label>
              <Input value={form.transporter ?? ""} onChange={f("transporter")} placeholder="Transporter name" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Vehicle Number</Label>
              <Input value={form.vehicleNumber ?? ""} onChange={f("vehicleNumber")} placeholder="MH12AB1234" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Driver Name</Label>
              <Input value={form.driverName ?? ""} onChange={f("driverName")} placeholder="Driver name" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Driver Mobile</Label>
              <Input value={form.driverMobile ?? ""} onChange={f("driverMobile")} placeholder="+91…" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Dispatch Date</Label>
              <Input type="date" value={form.dispatchDate ?? ""} onChange={f("dispatchDate")} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Created By</Label>
              <Input value={form.createdBy ?? ""} onChange={f("createdBy")} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Input value={form.notes ?? ""} onChange={f("notes")} placeholder="Dispatch notes…" />
            </div>
          </div>
        </OdsDrawer>
      </div>
    </AppLayout>
  );
}
