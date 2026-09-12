import { useMemo } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { Plus, ArrowRight, ShoppingCart } from "lucide-react";
import AppLayout from "@/layouts/AppLayout";
import { useListPurchaseOrders, useListSuppliers } from "@workspace/api-client-react";
import type { PurchaseOrder } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { useModuleShortcuts } from "@/hooks/use-module-shortcuts";
import { ModuleHeader, OdsToolbar, OdsDataTable, OdsStatusBadge } from "@/components/ods";
import { useAuth } from "@/hooks/use-auth";

export default function PurchaseOrderListPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { data, isLoading, isFetching, refetch } = useListPurchaseOrders();
  const { data: suppliers } = useListSuppliers({ pageSize: 200 } as any);

  const canCreate = user?.role === "supervisor" || user?.role === "director" || user?.role === "owner";

  useModuleShortcuts({
    onNew: canCreate ? () => navigate("/procurement/purchase-orders/new") : undefined,
  });

  const supplierNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of (suppliers?.items ?? []) as any[]) map.set(s.id, s.name);
    return map;
  }, [suppliers]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft": return "gray";
      case "submitted": return "yellow";
      case "approved": return "green";
      case "partially_received": return "blue";
      case "fully_received": return "green";
      case "closed": return "gray";
      case "cancelled": return "red";
      default: return "gray";
    }
  };

  const columns: ColumnDef<PurchaseOrder>[] = useMemo(
    () => [
      {
        accessorKey: "po_number",
        header: "PO Number",
        cell: ({ row }) => (
          <span className="font-mono text-xs font-bold text-blue-700">
            {row.original.po_number}
          </span>
        ),
      },
      {
        id: "supplier",
        header: "Supplier",
        accessorFn: (row) => supplierNameById.get(row.supplier_id) ?? row.supplier_name ?? row.supplier_id,
        cell: ({ getValue }) => <span className="text-sm font-medium">{getValue() as string}</span>,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <OdsStatusBadge status={row.original.status} color={getStatusColor(row.original.status)} />,
      },
      {
        accessorKey: "total_amount",
        header: "Total Amount",
        cell: ({ row }) => {
          const val = row.original.total_amount;
          if (val == null) return <span className="text-xs text-muted-foreground">—</span>;
          return (
            <span className="text-sm font-mono">
              {val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {row.original.currency}
            </span>
          );
        },
      },
      {
        accessorKey: "ordered_date",
        header: "Ordered Date",
        cell: ({ row }) => <span className="text-xs">{row.original.ordered_date ?? "—"}</span>,
      },
      {
        accessorKey: "created_at",
        header: "Created",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {new Date(row.original.created_at).toLocaleDateString()}
          </span>
        ),
      },
    ],
    [supplierNameById]
  );

  const items = (data?.items ?? []) as PurchaseOrder[];

  const rowActions = (po: PurchaseOrder) => (
    <Link href={`/procurement/purchase-orders/${po.id}`} className="inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-7 px-3 text-xs gap-1">
      View <ArrowRight className="h-3 w-3" />
    </Link>
  );

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <ModuleHeader
          icon={<ShoppingCart className="h-6 w-6 text-primary" />}
          title="Purchase Orders"
          description="Manage supplier purchase orders and view procurement lifecycle"
          certification="certified"
          actions={
            canCreate && (
              <Button size="sm" onClick={() => navigate("/procurement/purchase-orders/new")}>
                <Plus className="h-4 w-4 mr-1" /> New PO
              </Button>
            )
          }
        />

        <OdsDataTable
          data={items}
          columns={columns}
          isLoading={isLoading}
          emptyIcon=""
          emptyTitle="No purchase orders yet"
          emptyDescription="Create your first PO to begin the procurement process."
          emptyAction={canCreate ? { label: "New PO", onClick: () => navigate("/procurement/purchase-orders/new") } : undefined}
          rowActions={rowActions}
          onRowClick={(po) => navigate(`/procurement/purchase-orders/${po.id}`)}
          getRowId={(po) => po.id}
          enableSorting
          enableColumnVisibility
          enableDensity
          toolbar={<OdsToolbar onRefresh={() => refetch()} isRefreshing={isFetching} />}
        />
      </div>
    </AppLayout>
  );
}
