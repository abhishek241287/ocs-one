import { useMemo } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { Plus, ArrowRight } from "lucide-react";
import AppLayout from "@/layouts/AppLayout";
import {
  useListGrns,
  useListSuppliers,
} from "@workspace/api-client-react";
import type { Grn } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { useModuleShortcuts } from "@/hooks/use-module-shortcuts";
import {
  ModuleHeader, OdsToolbar, OdsDataTable, OdsStatusBadge,
} from "@/components/ods";

export default function GrnListPage() {
  const [, navigate] = useLocation();
  const { data, isLoading, isFetching, refetch } = useListGrns();
  const { data: suppliers } = useListSuppliers({ pageSize: 200 } as any);

  useModuleShortcuts({ onNew: () => navigate("/inventory/grns/new") });

  const supplierNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of (suppliers?.items ?? []) as any[]) map.set(s.id, s.name);
    return map;
  }, [suppliers]);

  const columns: ColumnDef<Grn>[] = useMemo(
    () => [
      {
        accessorKey: "grn_number",
        header: "GRN #",
        cell: ({ row }) => (
          <span className="font-mono text-xs font-bold text-blue-700">{row.original.grn_number}</span>
        ),
      },
      {
        id: "supplier",
        header: "Supplier",
        accessorFn: (row: any) => supplierNameById.get(row.supplier_id) ?? row.supplier_id ?? "—",
        cell: ({ getValue }) => <span className="text-sm">{getValue() as string}</span>,
      },
      {
        accessorKey: "received_date",
        header: "Received",
        cell: ({ row }) => <span className="text-xs">{row.original.received_date ?? "—"}</span>,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <OdsStatusBadge status={row.original.status} />,
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

  const items = (data?.items ?? []) as Grn[];

  const rowActions = (g: Grn) => (
    <Link href={`/inventory/grns/${g.id}`}>
      <Button size="sm" variant="outline" className="gap-1 h-7 text-xs">
        View <ArrowRight className="h-3 w-3" />
      </Button>
    </Link>
  );

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <ModuleHeader
          icon="📥"
          title="Goods Receipt Notes"
          description="Record incoming material against approved suppliers and post to inventory"
          certification="certified"
          actions={
            <Button size="sm" onClick={() => navigate("/inventory/grns/new")}>
              <Plus className="h-4 w-4 mr-1" /> New GRN
            </Button>
          }
        />

        <OdsDataTable
          data={items}
          columns={columns}
          isLoading={isLoading}
          emptyIcon="📥"
          emptyTitle="No goods receipt notes yet"
          emptyDescription="Create your first GRN to record received material."
          emptyAction={{ label: "New GRN", onClick: () => navigate("/inventory/grns/new") }}
          rowActions={rowActions}
          onRowClick={(g) => navigate(`/inventory/grns/${g.id}`)}
          getRowId={(g) => g.id}
          enableSorting
          enableColumnVisibility
          enableDensity
          toolbar={<OdsToolbar onRefresh={() => refetch()} isRefreshing={isFetching} />}
        />
      </div>
    </AppLayout>
  );
}
