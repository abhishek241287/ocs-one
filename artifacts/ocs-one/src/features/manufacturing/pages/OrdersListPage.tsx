import { useState, useRef } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import AppLayout from "@/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useListProductionOrders, ProductionOrder } from "@workspace/api-client-react";
import { Link } from "wouter";
import CreateOrderDrawer from "../components/CreateOrderDrawer";
import { useModuleShortcuts } from "@/hooks/use-module-shortcuts";
import {
  ModuleHeader, OdsToolbar, OdsDataTable, OdsStatusBadge,
} from "@/components/ods";

const PRIORITY_COLORS: Record<string, string> = {
  low:    "bg-slate-100 text-slate-600",
  medium: "bg-orange-100 text-orange-700",
  high:   "bg-red-100 text-red-700",
};

const STAGE_LABELS: Record<string, string> = {
  cell_allocation: "Cell Allocation",
  bms_allocation:  "BMS Allocation",
  assembly:        "Assembly",
  compression:     "Compression",
  charging:        "Charging",
  testing:         "Testing",
  quality_control: "Quality Control",
  packing:         "Packing",
};

const COLUMNS: ColumnDef<ProductionOrder>[] = [
  {
    accessorKey: "orderNumber",
    header: "Order #",
    cell: ({ row }) => (
      <Link href={`/manufacturing/orders/${row.original.id}`}>
        <span className="font-mono text-sm font-medium text-orange-600 hover:underline">
          {row.original.orderNumber}
        </span>
      </Link>
    ),
  },
  {
    accessorKey: "batteryNumber",
    header: "Battery #",
    cell: ({ row }) => (
      <span className="font-mono text-sm">{row.original.batteryNumber}</span>
    ),
  },
  {
    accessorKey: "factoryManager",
    header: "Factory Manager",
  },
  {
    accessorKey: "currentStage",
    header: "Stage",
    cell: ({ row }) => {
      const stage = row.original.currentStage;
      return stage ? (
        <span className="text-sm text-muted-foreground">
          {STAGE_LABELS[stage] ?? stage}
        </span>
      ) : (
        <span className="text-muted-foreground text-sm">—</span>
      );
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <OdsStatusBadge status={row.original.status} />,
  },
  {
    accessorKey: "priority",
    header: "Priority",
    cell: ({ row }) => (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[row.original.priority] ?? ""}`}
      >
        {row.original.priority}
      </span>
    ),
  },
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {new Date(row.original.createdAt).toLocaleDateString()}
      </span>
    ),
  },
];

export default function OrdersListPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useModuleShortcuts({ onNew: () => setCreateOpen(true), searchRef });

  const { data, isLoading, isFetching, refetch } = useListProductionOrders({
    page,
    pageSize: 20,
    search: debouncedSearch || undefined,
    status:
      status !== "all"
        ? (status as "draft" | "released" | "in_progress" | "completed" | "cancelled")
        : undefined,
    priority:
      priority !== "all" ? (priority as "low" | "medium" | "high") : undefined,
  });

  const handleSearch = (val: string) => {
    setSearch(val);
    clearTimeout((window as any)._searchTimer);
    (window as any)._searchTimer = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(1);
    }, 350);
  };

  const meta = data?.meta;
  const items = data?.items ?? [];

  const filters = (
    <div className="flex gap-2">
      <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
        <SelectTrigger className="h-8 w-40 text-xs">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          <SelectItem value="draft">Draft</SelectItem>
          <SelectItem value="released">Released</SelectItem>
          <SelectItem value="in_progress">In Progress</SelectItem>
          <SelectItem value="completed">Completed</SelectItem>
          <SelectItem value="cancelled">Cancelled</SelectItem>
        </SelectContent>
      </Select>
      <Select value={priority} onValueChange={(v) => { setPriority(v); setPage(1); }}>
        <SelectTrigger className="h-8 w-36 text-xs">
          <SelectValue placeholder="All priorities" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Priorities</SelectItem>
          <SelectItem value="low">Low</SelectItem>
          <SelectItem value="medium">Medium</SelectItem>
          <SelectItem value="high">High</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <ModuleHeader
          icon="🏭"
          title="Production Orders"
          description={`${meta?.total ?? 0} orders total`}
          certification="certified"
          actions={
            <Button onClick={() => setCreateOpen(true)} className="bg-orange-600 hover:bg-orange-700">
              <Plus className="h-4 w-4 mr-2" /> New Order
            </Button>
          }
        />

        <OdsDataTable
          data={items}
          columns={COLUMNS}
          isLoading={isLoading}
          emptyIcon="🏭"
          emptyTitle="No production orders found"
          emptyDescription={
            debouncedSearch || status !== "all"
              ? "Try adjusting your filters."
              : "Create your first production order to get started."
          }
          emptyAction={
            !debouncedSearch && status === "all"
              ? { label: "New Order", onClick: () => setCreateOpen(true) }
              : undefined
          }
          getRowId={(o) => o.id}
          enableSorting
          enableColumnVisibility
          enableDensity
          pagination={{
            pageIndex: page - 1,
            pageSize: 20,
            total: meta?.total ?? 0,
            onPageChange: (idx) => setPage(idx + 1),
          }}
          toolbar={
            <OdsToolbar
              search={{
                value: search,
                onChange: handleSearch,
                placeholder: "Search order / battery number…",
                ref: searchRef,
              }}
              filters={filters}
              onRefresh={() => refetch()}
              isRefreshing={isFetching}
            />
          }
        />

        <CreateOrderDrawer
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onSuccess={() => { setCreateOpen(false); refetch(); }}
        />
      </div>
    </AppLayout>
  );
}
