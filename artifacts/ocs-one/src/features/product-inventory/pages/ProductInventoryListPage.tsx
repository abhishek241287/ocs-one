import { useState, useRef, useEffect } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { Link, useSearch } from "wouter";
import AppLayout from "@/layouts/AppLayout";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  useListProducts,
  useListProductCategories,
  useListProductMasters,
  useListDealers,
  Product,
} from "@workspace/api-client-react";
import { ModuleHeader, OdsToolbar, OdsDataTable } from "@/components/ods";

const STATUS_COLORS: Record<string, string> = {
  manufacturing: "bg-gray-100 text-gray-700",
  qc_passed: "bg-green-100 text-green-700",
  ready_for_packing: "bg-blue-100 text-blue-700",
  packed: "bg-indigo-100 text-indigo-700",
  dispatched: "bg-orange-100 text-orange-700",
  delivered_to_dealer: "bg-emerald-100 text-emerald-700",
};

const STATUS_OPTIONS = [
  "manufacturing", "qc_passed", "ready_for_packing", "packed", "dispatched", "delivered_to_dealer",
] as const;

const COLUMNS: ColumnDef<Product>[] = [
  {
    accessorKey: "official_product_serial",
    header: "Serial",
    cell: ({ row }) => (
      <Link href={`/products/${row.original.id}`}>
        <span className="font-mono text-sm font-medium text-orange-600 hover:underline">
          {row.original.official_product_serial}
        </span>
      </Link>
    ),
  },
  {
    accessorKey: "category_name",
    header: "Category",
    cell: ({ row }) => <span className="text-sm">{row.original.category_name ?? "—"}</span>,
  },
  {
    accessorKey: "model_name",
    header: "Model",
    cell: ({ row }) => (
      <span className="text-sm">{row.original.model_name ?? row.original.model_code ?? "—"}</span>
    ),
  },
  {
    accessorKey: "product_status",
    header: "Status",
    cell: ({ row }) => (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[row.original.product_status] ?? ""}`}>
        {row.original.product_status.replace(/_/g, " ")}
      </span>
    ),
  },
  {
    accessorKey: "current_location",
    header: "Location",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">{row.original.current_location ?? "—"}</span>
    ),
  },
  {
    accessorKey: "dealer_name",
    header: "Dealer",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">{row.original.dealer_name ?? "—"}</span>
    ),
  },
  {
    accessorKey: "manufacturing_completed_at",
    header: "Mfg Date",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {row.original.manufacturing_completed_at
          ? new Date(row.original.manufacturing_completed_at).toLocaleDateString()
          : "—"}
      </span>
    ),
  },
];

export default function ProductInventoryListPage() {
  const searchString = useSearch();
  const initial = new URLSearchParams(searchString);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<string>(initial.get("status") ?? "all");
  const [categoryId, setCategoryId] = useState<string>(initial.get("category_id") ?? "all");
  const [modelId, setModelId] = useState<string>("all");
  const [dealerId, setDealerId] = useState<string>("all");
  const [location, setLocation] = useState("");
  const [debouncedLocation, setDebouncedLocation] = useState("");
  const [mfgFrom, setMfgFrom] = useState("");
  const [mfgTo, setMfgTo] = useState("");
  const [page, setPage] = useState(1);
  const searchRef = useRef<HTMLInputElement>(null);

  // Sync from URL query (deep links from dashboard cards)
  useEffect(() => {
    const p = new URLSearchParams(searchString);
    setStatus(p.get("status") ?? "all");
    setCategoryId(p.get("category_id") ?? "all");
    setPage(1);
  }, [searchString]);

  const { data: categoriesData } = useListProductCategories({ pageSize: 200 });
  const { data: modelsData } = useListProductMasters({ pageSize: 500 });
  const { data: dealersData } = useListDealers({ pageSize: 500 });

  const { data, isLoading, isFetching, refetch } = useListProducts({
    page,
    pageSize: 20,
    search: debouncedSearch || undefined,
    product_status: status !== "all" ? (status as (typeof STATUS_OPTIONS)[number]) : undefined,
    category_id: categoryId !== "all" ? categoryId : undefined,
    model_id: modelId !== "all" ? modelId : undefined,
    dealer_id: dealerId !== "all" ? dealerId : undefined,
    current_location: debouncedLocation || undefined,
    manufactured_from: mfgFrom || undefined,
    manufactured_to: mfgTo || undefined,
  });

  const handleSearch = (val: string) => {
    setSearch(val);
    clearTimeout((window as any)._invSearchTimer);
    (window as any)._invSearchTimer = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(1);
    }, 350);
  };

  const handleLocation = (val: string) => {
    setLocation(val);
    clearTimeout((window as any)._invLocTimer);
    (window as any)._invLocTimer = setTimeout(() => {
      setDebouncedLocation(val);
      setPage(1);
    }, 350);
  };

  const meta = data?.meta;
  const items = data?.items ?? [];

  const filters = (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
        <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="All statuses" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          {STATUS_OPTIONS.map((s) => (
            <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={categoryId} onValueChange={(v) => { setCategoryId(v); setPage(1); }}>
        <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="All categories" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Categories</SelectItem>
          {(categoriesData?.items ?? []).map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={modelId} onValueChange={(v) => { setModelId(v); setPage(1); }}>
        <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="All models" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Models</SelectItem>
          {(modelsData?.items ?? []).map((m) => (
            <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={dealerId} onValueChange={(v) => { setDealerId(v); setPage(1); }}>
        <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="All dealers" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Dealers</SelectItem>
          {(dealersData?.items ?? []).map((d) => (
            <SelectItem key={d.id} value={d.id}>{d.dealerName}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        value={location}
        onChange={(e) => handleLocation(e.target.value)}
        placeholder="Location…"
        className="h-8 w-36 text-xs"
      />

      <div className="flex items-center gap-1">
        <Input
          type="date"
          value={mfgFrom}
          onChange={(e) => { setMfgFrom(e.target.value); setPage(1); }}
          className="h-8 w-36 text-xs"
          title="Mfg date from"
        />
        <span className="text-xs text-muted-foreground">→</span>
        <Input
          type="date"
          value={mfgTo}
          onChange={(e) => { setMfgTo(e.target.value); setPage(1); }}
          className="h-8 w-36 text-xs"
          title="Mfg date to"
        />
      </div>
    </div>
  );

  const hasFilters =
    debouncedSearch || status !== "all" || categoryId !== "all" || modelId !== "all" ||
    dealerId !== "all" || debouncedLocation || mfgFrom || mfgTo;

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <ModuleHeader
          icon="📦"
          title="Product Inventory"
          description={`${meta?.total ?? 0} products`}
          certification="certified"
        />

        <OdsDataTable
          data={items}
          columns={COLUMNS}
          isLoading={isLoading}
          emptyIcon="📦"
          emptyTitle="No products found"
          emptyDescription={hasFilters ? "Try adjusting your filters." : "No products in inventory yet."}
          getRowId={(p) => p.id}
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
                placeholder: "Search serial, model, or dealer…",
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
