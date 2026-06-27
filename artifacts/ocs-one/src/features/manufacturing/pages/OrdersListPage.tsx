import { useState, useRef } from "react";
import AppLayout from "@/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Search, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { useListProductionOrders } from "@workspace/api-client-react";
import { Link } from "wouter";
import CreateOrderDrawer from "../components/CreateOrderDrawer";
import { useModuleShortcuts } from "@/hooks/use-module-shortcuts";
import { ModuleHeader, OdsTableSkeleton, OdsEmptyState, OdsStatusBadge } from "@/components/ods";

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

export default function OrdersListPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  useModuleShortcuts({ onNew: () => setCreateOpen(true), searchRef });

  const { data, isLoading, refetch } = useListProductionOrders({
    page,
    pageSize: 20,
    search: debouncedSearch || undefined,
    status: status !== "all" ? (status as "draft" | "released" | "in_progress" | "completed" | "cancelled") : undefined,
    priority: priority !== "all" ? (priority as "low" | "medium" | "high") : undefined,
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

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <ModuleHeader
          icon="🏭"
          title="Production Orders"
          description={`${meta?.total ?? 0} orders total`}
          certification="certified"
          actions={
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-1" /> Refresh
              </Button>
              <Button onClick={() => setCreateOpen(true)} className="bg-orange-600 hover:bg-orange-700">
                <Plus className="h-4 w-4 mr-2" /> New Order
              </Button>
            </div>
          }
        />

        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              ref={searchRef}
              placeholder="Search order / battery number..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="w-44">
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
            <SelectTrigger className="w-36">
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

        {isLoading ? (
          <OdsTableSkeleton rows={8} columns={7} />
        ) : items.length === 0 ? (
          <OdsEmptyState
            icon="🏭"
            title="No production orders found"
            description={debouncedSearch || status !== "all" ? "Try adjusting your filters." : "Create your first production order to get started."}
            action={!debouncedSearch && status === "all" ? { label: "New Order", onClick: () => setCreateOpen(true) } : undefined}
          />
        ) : (
          <div className="border rounded-lg bg-white overflow-hidden shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead>Order #</TableHead>
                  <TableHead>Battery #</TableHead>
                  <TableHead>Factory Manager</TableHead>
                  <TableHead>Current Stage</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((order) => (
                  <TableRow key={order.id} className="hover:bg-gray-50 cursor-pointer">
                    <TableCell>
                      <Link href={`/manufacturing/orders/${order.id}`}>
                        <span className="font-mono text-sm font-medium text-orange-600 hover:underline">
                          {order.orderNumber}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{order.batteryNumber}</TableCell>
                    <TableCell>{order.factoryManager}</TableCell>
                    <TableCell>
                      {order.currentStage ? (
                        <span className="text-sm text-gray-600">
                          {STAGE_LABELS[order.currentStage] ?? order.currentStage}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <OdsStatusBadge status={order.status} />
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[order.priority] ?? ""}`}>
                        {order.priority}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, meta.total)} of {meta.total}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page === meta.totalPages}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <CreateOrderDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => { setCreateOpen(false); refetch(); }}
      />
    </AppLayout>
  );
}
