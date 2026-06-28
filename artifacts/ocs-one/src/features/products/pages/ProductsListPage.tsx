import { useState, useRef } from "react";
import { ColumnDef } from "@tanstack/react-table";
import AppLayout from "@/layouts/AppLayout";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useListProducts, Product } from "@workspace/api-client-react";
import { Link } from "wouter";
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
    cell: ({ row }) => (
      <span className="text-sm">{row.original.category_name ?? "—"}</span>
    ),
  },
  {
    accessorKey: "model_name",
    header: "Model",
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.model_name ?? row.original.model_code ?? "—"}
      </span>
    ),
  },
  {
    accessorKey: "serial_source",
    header: "Source",
    cell: ({ row }) => (
      <span className="text-xs font-medium text-muted-foreground">{row.original.serial_source}</span>
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
    accessorKey: "dealer_name",
    header: "Dealer",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">{row.original.dealer_name ?? "—"}</span>
    ),
  },
  {
    accessorKey: "created_at",
    header: "Created",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {new Date(row.original.created_at).toLocaleDateString()}
      </span>
    ),
  },
];

export default function ProductsListPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(1);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, isFetching, refetch } = useListProducts({
    page,
    pageSize: 20,
    search: debouncedSearch || undefined,
    product_status: status !== "all" ? (status as (typeof STATUS_OPTIONS)[number]) : undefined,
  });

  const handleSearch = (val: string) => {
    setSearch(val);
    clearTimeout((window as any)._prodSearchTimer);
    (window as any)._prodSearchTimer = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(1);
    }, 350);
  };

  const meta = data?.meta;
  const items = data?.items ?? [];

  const filters = (
    <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
      <SelectTrigger className="h-8 w-44 text-xs">
        <SelectValue placeholder="All statuses" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Statuses</SelectItem>
        {STATUS_OPTIONS.map((s) => (
          <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <ModuleHeader
          icon="📦"
          title="Products"
          description={`${meta?.total ?? 0} serialized products`}
          certification="certified"
        />

        <OdsDataTable
          data={items}
          columns={COLUMNS}
          isLoading={isLoading}
          emptyIcon="📦"
          emptyTitle="No products found"
          emptyDescription={
            debouncedSearch || status !== "all"
              ? "Try adjusting your filters."
              : "Products are created automatically when an order passes QC."
          }
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
                placeholder: "Search serial number…",
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
