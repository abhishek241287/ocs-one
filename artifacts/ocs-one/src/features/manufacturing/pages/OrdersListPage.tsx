import { useState, useRef } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import AppLayout from "@/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useListProductionOrders, ProductionOrder } from "@workspace/api-client-react";
import { Link, useSearch } from "wouter";
import CreateOrderDrawer from "../components/CreateOrderDrawer";
import {
  getStageProgress,
  MANUFACTURING_STAGE_LABELS,
  MANUFACTURING_STAGE_SEQUENCE,
  type ManufacturingStage,
} from "../stage-sequence";
import { useModuleShortcuts } from "@/hooks/use-module-shortcuts";
import {
  ModuleHeader, OdsToolbar, OdsDataTable, OdsStatusBadge,
} from "@/components/ods";

const PRIORITY_COLORS: Record<string, string> = {
  low:    "bg-slate-100 text-slate-600",
  medium: "bg-orange-100 text-orange-700",
  high:   "bg-red-100 text-red-700",
};

function StageProgress({ stage }: { stage: string | null | undefined }) {
  const progress = getStageProgress(stage);
  if (!progress) return <span className="text-sm text-muted-foreground">—</span>;

  return (
    <div className="min-w-24" title={`Stage ${progress.step} of ${progress.total}`}>
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>{progress.step}/{progress.total}</span>
        <span>{progress.percent}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-orange-500" style={{ width: `${progress.percent}%` }} />
      </div>
    </div>
  );
}

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
    id: "product",
    header: "Product",
    cell: ({ row }) => (
      row.original.productName || row.original.productSku ? (
        <div className="min-w-36">
          <div className="truncate text-sm font-medium">{row.original.productName ?? "—"}</div>
          <div className="truncate font-mono text-[11px] text-muted-foreground">{row.original.productSku ?? "—"}</div>
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">—</span>
      )
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
          {MANUFACTURING_STAGE_LABELS[stage as ManufacturingStage] ?? stage}
        </span>
      ) : (
        <span className="text-muted-foreground text-sm">—</span>
      );
    },
  },
  {
    id: "progress",
    header: "Progress",
    cell: ({ row }) => <StageProgress stage={row.original.currentStage} />,
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

const STAGE_VALUES = [
  ...MANUFACTURING_STAGE_SEQUENCE,
] as const;
type StageValue = (typeof STAGE_VALUES)[number];

export default function OrdersListPage() {
  const rawSearch = useSearch();
  const params = new URLSearchParams(rawSearch);
  const rawStage = params.get("stage");
  const rawStatus = params.get("status");
  const stage = STAGE_VALUES.includes(rawStage as StageValue)
    ? (rawStage as StageValue)
    : undefined;
  const initialStatus = ["draft", "released", "in_progress", "completed", "cancelled"].includes(rawStatus ?? "")
    ? rawStatus!
    : "all";
  const isQcView = stage === "quality_control";

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<string>(initialStatus);
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
    stage:
      stage as
        | "cell_allocation" | "bms_allocation" | "assembly" | "compression"
        | "bms_programming" | "charging" | "testing" | "quality_control" | "packing" | undefined,
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
          icon={isQcView ? "🛡️" : "🏭"}
          title={isQcView ? "Quality Control" : "Production Orders"}
          description={
            isQcView
              ? `${meta?.total ?? 0} order(s) currently awaiting Quality Control`
              : `${meta?.total ?? 0} orders total`
          }
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
