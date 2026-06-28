import { useMemo } from "react";
import { ColumnDef } from "@tanstack/react-table";
import AppLayout from "@/layouts/AppLayout";
import { useListStockBalances } from "@workspace/api-client-react";
import type { StockBalance } from "@workspace/api-client-react";
import { ModuleHeader, OdsToolbar, OdsDataTable } from "@/components/ods";

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

export default function StockPage() {
  const { data, isLoading, isFetching, refetch } = useListStockBalances();

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
        cell: ({ row }) => (
          <span className="font-mono text-sm">
            {row.original.quantity} {row.original.uom}
          </span>
        ),
      },
    ],
    []
  );

  const items = (data?.items ?? []) as StockBalance[];

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <ModuleHeader
          icon="📦"
          title="Inventory Stock"
          description="On-hand quantity by material and stock state, netted from posted inventory transactions"
          certification="certified"
        />

        <OdsDataTable
          data={items}
          columns={columns}
          isLoading={isLoading}
          emptyIcon="📦"
          emptyTitle="No stock on hand"
          emptyDescription="Post a GRN and inspect material to build inventory balances."
          getRowId={(s) => `${s.material_id}:${s.stock_state}`}
          enableSorting
          enableColumnVisibility
          enableDensity
          toolbar={<OdsToolbar onRefresh={() => refetch()} isRefreshing={isFetching} />}
        />
      </div>
    </AppLayout>
  );
}
