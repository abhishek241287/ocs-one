import { useMemo, useRef, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import AppLayout from "@/layouts/AppLayout";
import { useListStockBalances } from "@workspace/api-client-react";
import type { StockBalance } from "@workspace/api-client-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ModuleHeader, OdsToolbar, OdsDataTable } from "@/components/ods";
import { AlertTriangle } from "lucide-react";

const STATE_LABEL: Record<string, string> = {
  inspection_pending: "Inspection Pending",
  available: "Available",
  rejected: "Rejected",
};

const STATE_COLOR: Record<string, string> = {
  inspection_pending: "bg-yellow-100 text-yellow-700",
  available: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-600",
};

const USAGE_LABEL: Record<string, string> = {
  INVENTORY_COMPONENT: "Inventory Component",
  CONSUMABLE: "Consumable",
  PACKAGING: "Packaging",
  SERVICE_ITEM: "Service Item",
};

const STATE_OPTIONS = ["inspection_pending", "available", "rejected"] as const;
const PAGE_SIZE = 25;

// The unified inventory page is ONE projection over the FROZEN signed ledger; every tab
// is just a filter (master_type for the 7 component families, usage_type for the
// non-component buckets). "All" applies no material filter.
type TabDef = {
  key: string;
  label: string;
  masterType?: "CELL" | "BMS" | "CABLE" | "BUSBAR" | "CONNECTOR" | "CHARGER" | "CABINET";
  usageType?: "CONSUMABLE" | "PACKAGING";
};

const TABS: TabDef[] = [
  { key: "all", label: "All" },
  { key: "CELL", label: "Cells", masterType: "CELL" },
  { key: "BMS", label: "BMS", masterType: "BMS" },
  { key: "CABLE", label: "Cable", masterType: "CABLE" },
  { key: "BUSBAR", label: "Busbar", masterType: "BUSBAR" },
  { key: "CONNECTOR", label: "Connector", masterType: "CONNECTOR" },
  { key: "CHARGER", label: "Charger", masterType: "CHARGER" },
  { key: "CABINET", label: "Cabinet", masterType: "CABINET" },
  { key: "CONSUMABLE", label: "Consumables", usageType: "CONSUMABLE" },
  { key: "PACKAGING", label: "Packaging", usageType: "PACKAGING" },
];

export default function StockPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [stockState, setStockState] = useState<string>("all");
  const [tab, setTab] = useState<string>("all");
  const [page, setPage] = useState(1);
  const searchRef = useRef<HTMLInputElement>(null);

  const activeTab = TABS.find((t) => t.key === tab) ?? TABS[0];

  const { data, isLoading, isFetching, refetch } = useListStockBalances({
    page,
    pageSize: PAGE_SIZE,
    search: debouncedSearch || undefined,
    stock_state: stockState !== "all" ? (stockState as (typeof STATE_OPTIONS)[number]) : undefined,
    master_type: activeTab.masterType,
    usage_type: activeTab.usageType,
  });

  const handleSearch = (val: string) => {
    setSearch(val);
    clearTimeout((window as any)._stockSearchTimer);
    (window as any)._stockSearchTimer = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(1);
    }, 350);
  };

  const columns: ColumnDef<StockBalance>[] = useMemo(
    () => [
      {
        accessorKey: "material_code",
        header: "Code",
        cell: ({ row }) => (
          <span className="font-mono text-xs font-bold text-blue-700">
            {row.original.material_code}
          </span>
        ),
      },
      {
        accessorKey: "material_name",
        header: "Material",
        cell: ({ row }) => <span className="text-sm">{row.original.material_name}</span>,
      },
      {
        accessorKey: "usage_type",
        header: "Usage",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.usage_type
              ? USAGE_LABEL[row.original.usage_type] ?? row.original.usage_type
              : "—"}
          </span>
        ),
      },
      {
        id: "component_type",
        header: "Type",
        cell: ({ row }) =>
          row.original.linked_master ? (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-xs font-medium">
              {row.original.linked_master.type}
            </span>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          ),
      },
      {
        id: "linked_master",
        header: "Linked Master",
        cell: ({ row }) =>
          row.original.linked_master ? (
            <span className="text-xs">
              <span className="font-mono font-semibold">{row.original.linked_master.code}</span>{" "}
              <span className="text-muted-foreground">{row.original.linked_master.name}</span>
            </span>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          ),
      },
      {
        accessorKey: "stock_state",
        header: "State",
        cell: ({ row }) => (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATE_COLOR[row.original.stock_state] ?? "bg-gray-100 text-gray-600"}`}
          >
            {STATE_LABEL[row.original.stock_state] ?? row.original.stock_state}
          </span>
        ),
      },
      {
        accessorKey: "quantity",
        header: "On Hand",
        cell: ({ row }) => {
          // INV-010: a negative on-hand means the ledger over-released for this bucket —
          // a data-integrity signal that must never be hidden. Surface it in red with an alert.
          const negative = row.original.quantity < 0;
          return (
            <span
              className={`inline-flex items-center gap-1 font-mono text-sm ${negative ? "font-bold text-red-600" : ""}`}
              title={negative ? "Negative stock — ledger over-released; investigate" : undefined}
            >
              {negative && <AlertTriangle size={13} className="text-red-600" />}
              {row.original.quantity} {row.original.uom}
            </span>
          );
        },
      },
    ],
    []
  );

  const meta = data?.meta;
  const items = (data?.items ?? []) as StockBalance[];

  const filters = (
    <Select value={stockState} onValueChange={(v) => { setStockState(v); setPage(1); }}>
      <SelectTrigger className="h-8 w-44 text-xs">
        <SelectValue placeholder="All states" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All States</SelectItem>
        {STATE_OPTIONS.map((s) => (
          <SelectItem key={s} value={s}>{STATE_LABEL[s]}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <ModuleHeader
          icon="📦"
          title="Inventory Stock"
          description={`${meta?.total ?? 0} stock balances · netted from posted inventory transactions`}
          certification="certified"
        />

        <div className="flex flex-wrap gap-1.5 border-b pb-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => { setTab(t.key); setPage(1); }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                tab === t.key
                  ? "bg-blue-600 text-white"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <OdsDataTable
          data={items}
          columns={columns}
          isLoading={isLoading}
          emptyIcon="📦"
          emptyTitle="No stock on hand"
          emptyDescription={
            debouncedSearch || stockState !== "all" || tab !== "all"
              ? "Try adjusting your filters."
              : "Post a GRN and inspect material to build inventory balances."
          }
          getRowId={(s) => `${s.material_id}:${s.stock_state}`}
          enableSorting
          enableColumnVisibility
          enableDensity
          pagination={{
            pageIndex: page - 1,
            pageSize: PAGE_SIZE,
            total: meta?.total ?? 0,
            onPageChange: (idx) => setPage(idx + 1),
          }}
          toolbar={
            <OdsToolbar
              search={{
                value: search,
                onChange: handleSearch,
                placeholder: "Search material code or name…",
                ref: searchRef,
              }}
              filters={filters}
              onRefresh={() => refetch()}
              isRefreshing={isFetching}
            />
          }
        />
      </div>
    </AppLayout>
  );
}
