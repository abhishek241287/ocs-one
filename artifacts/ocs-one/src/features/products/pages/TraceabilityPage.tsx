import { useState, useRef } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { Search, QrCode } from "lucide-react";
import AppLayout from "@/layouts/AppLayout";
import { Input } from "@/components/ui/input";
import { useListProducts, Product } from "@workspace/api-client-react";
import { Link } from "wouter";
import { ModuleHeader, OdsDataTable } from "@/components/ods";

const STATUS_COLORS: Record<string, string> = {
  manufacturing: "bg-gray-100 text-gray-700",
  qc_passed: "bg-green-100 text-green-700",
  ready_for_packing: "bg-blue-100 text-blue-700",
  packed: "bg-indigo-100 text-indigo-700",
  dispatched: "bg-orange-100 text-orange-700",
  delivered_to_dealer: "bg-emerald-100 text-emerald-700",
};

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
      <span className="text-sm">
        {row.original.model_name ?? row.original.model_code ?? "—"}
      </span>
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
    id: "trace",
    header: "",
    cell: ({ row }) => (
      <Link href={`/products/${row.original.id}`}>
        <span className="text-xs font-medium text-orange-600 hover:underline">
          View genealogy →
        </span>
      </Link>
    ),
  },
];

export default function TraceabilityPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useListProducts({
    page,
    pageSize: 20,
    search: debouncedSearch || undefined,
  });

  const handleSearch = (val: string) => {
    setSearch(val);
    clearTimeout((window as any)._traceSearchTimer);
    (window as any)._traceSearchTimer = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(1);
    }, 300);
  };

  const meta = data?.meta;
  const items = data?.items ?? [];

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <ModuleHeader
          icon="🔎"
          title="Product Traceability"
          description="Trace any serialized unit to its full manufacturing genealogy"
          certification="certified"
        />

        <div className="rounded-lg border bg-card p-5">
          <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
            <QrCode className="h-4 w-4 text-orange-600" />
            Search by serial or production order number
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Scan or type a serial or production order number…"
              className="pl-9 h-11 text-base font-mono"
              autoFocus
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Enter an official product serial (OCS or manufacturer) or a production order number to find the
            unit, then open it to see component genealogy and its full event timeline.
          </p>
        </div>

        <OdsDataTable
          data={items}
          columns={COLUMNS}
          isLoading={isLoading}
          emptyIcon="🔎"
          emptyTitle={debouncedSearch ? "No matching products" : "Search to begin tracing"}
          emptyDescription={
            debouncedSearch
              ? "No serialized product matches that serial number. Check the serial and try again."
              : "Type or scan a serial number above to trace a product to its manufacturing genealogy."
          }
          getRowId={(p) => p.id}
          enableSorting
          pagination={{
            pageIndex: page - 1,
            pageSize: 20,
            total: meta?.total ?? 0,
            onPageChange: (idx) => setPage(idx + 1),
          }}
        />
      </div>
    </AppLayout>
  );
}
