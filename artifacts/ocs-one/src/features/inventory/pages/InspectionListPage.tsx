import { useMemo } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { ClipboardCheck, ArrowRight } from "lucide-react";
import AppLayout from "@/layouts/AppLayout";
import { useListInspections } from "@workspace/api-client-react";
import type { IncomingInspection } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { useModuleShortcuts } from "@/hooks/use-module-shortcuts";
import { ModuleHeader, OdsToolbar, OdsDataTable } from "@/components/ods";

export default function InspectionListPage() {
  const [, navigate] = useLocation();
  const { data, isLoading, isFetching, refetch } = useListInspections();

  useModuleShortcuts({ onNew: () => navigate("/inventory/inspections/new") });

  const columns: ColumnDef<IncomingInspection>[] = useMemo(
    () => [
      {
        accessorKey: "inspection_number",
        header: "Inspection #",
        cell: ({ row }) => (
          <span className="font-mono text-xs font-bold text-blue-700">
            {row.original.inspection_number}
          </span>
        ),
      },
      {
        accessorKey: "grn_number",
        header: "GRN #",
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.grn_number ?? "—"}</span>
        ),
      },
      {
        accessorKey: "created_at",
        header: "Inspected",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {new Date(row.original.created_at).toLocaleString()}
          </span>
        ),
      },
    ],
    []
  );

  const items = (data?.items ?? []) as IncomingInspection[];

  const rowActions = (i: IncomingInspection) => (
    <Link href={`/inventory/inspections/${i.id}`}>
      <Button size="sm" variant="outline" className="gap-1 h-7 text-xs">
        View <ArrowRight className="h-3 w-3" />
      </Button>
    </Link>
  );

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <ModuleHeader
          icon="🔍"
          title="Incoming Inspections"
          description="Accept or reject received material line-by-line — the GRN records what was delivered, the inspection records what OCS accepted"
          certification="certified"
          actions={
            <Button size="sm" onClick={() => navigate("/inventory/inspections/new")}>
              <ClipboardCheck className="h-4 w-4 mr-1" /> New Inspection
            </Button>
          }
        />

        <OdsDataTable
          data={items}
          columns={columns}
          isLoading={isLoading}
          emptyIcon="🔍"
          emptyTitle="No inspections yet"
          emptyDescription="Inspect a posted GRN's pending lines to accept or reject received material."
          emptyAction={{
            label: "New Inspection",
            onClick: () => navigate("/inventory/inspections/new"),
          }}
          rowActions={rowActions}
          onRowClick={(i) => navigate(`/inventory/inspections/${i.id}`)}
          getRowId={(i) => i.id}
          enableSorting
          enableColumnVisibility
          enableDensity
          toolbar={<OdsToolbar onRefresh={() => refetch()} isRefreshing={isFetching} />}
        />
      </div>
    </AppLayout>
  );
}
