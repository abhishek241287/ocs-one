import { useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { Plus, ArrowRight } from "lucide-react";
import AppLayout from "@/layouts/AppLayout";
import { useListBoms, useListProductMasters } from "@workspace/api-client-react";
import type { Bom, BomStatus } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Link, useLocation } from "wouter";
import { useModuleShortcuts } from "@/hooks/use-module-shortcuts";
import { ModuleHeader, OdsToolbar, OdsDataTable, OdsStatusBadge } from "@/components/ods";

const STATUS_OPTIONS: { value: BomStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "approved", label: "Approved" },
  { value: "obsolete", label: "Obsolete" },
];

export default function BomListPage() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<BomStatus | "all">("all");
  const [modelId, setModelId] = useState<string>("all");

  const params = {
    pageSize: 200,
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(status !== "all" ? { status } : {}),
    ...(modelId !== "all" ? { model_id: modelId } : {}),
  };
  const { data, isLoading, isFetching, refetch } = useListBoms(params as any);
  const { data: models } = useListProductMasters({ pageSize: 500 } as any);

  useModuleShortcuts({ onNew: () => navigate("/masters/boms/new") });

  const modelOptions = useMemo(
    () => (models?.items ?? []) as any[],
    [models]
  );

  const columns: ColumnDef<Bom>[] = useMemo(
    () => [
      {
        accessorKey: "bom_number",
        header: "BOM #",
        cell: ({ row }) => (
          <span className="font-mono text-xs font-bold text-blue-700">{row.original.bom_number}</span>
        ),
      },
      {
        id: "model",
        header: "Model",
        accessorFn: (row) =>
          row.model_name ? `${row.model_name} (${row.model_code})` : row.model_id,
        cell: ({ getValue }) => <span className="text-sm">{getValue() as string}</span>,
      },
      {
        accessorKey: "name",
        header: "Description",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.name || "—"}</span>
        ),
      },
      {
        accessorKey: "revision",
        header: "Rev",
        cell: ({ row }) => <span className="font-mono text-xs">v{row.original.revision}</span>,
      },
      {
        accessorKey: "line_count",
        header: "Lines",
        cell: ({ row }) => <span className="text-sm tabular-nums">{row.original.line_count}</span>,
      },
      {
        accessorKey: "yield_percent",
        header: "Yield %",
        cell: ({ row }) => <span className="text-sm tabular-nums">{row.original.yield_percent}%</span>,
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
    []
  );

  const items = (data?.items ?? []) as Bom[];

  const rowActions = (b: Bom) => (
    <Link href={`/masters/boms/${b.id}`}>
      <Button size="sm" variant="outline" className="gap-1 h-7 text-xs">
        View <ArrowRight className="h-3 w-3" />
      </Button>
    </Link>
  );

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <ModuleHeader
          icon="📋"
          title="Bill of Materials"
          description="Define the component recipe for each product model — versioned, approved, and traceable"
          actions={
            <Button size="sm" onClick={() => navigate("/masters/boms/new")}>
              <Plus className="h-4 w-4 mr-1" /> New BOM
            </Button>
          }
        />

        <div className="flex flex-wrap items-center gap-3">
          <Input
            placeholder="Search BOM #, name, model…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Select value={status} onValueChange={(v) => setStatus(v as BomStatus | "all")}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={modelId} onValueChange={setModelId}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="All models" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All models</SelectItem>
              {modelOptions.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.name} ({m.code})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <OdsDataTable
          data={items}
          columns={columns}
          isLoading={isLoading}
          emptyIcon="📋"
          emptyTitle="No bills of materials yet"
          emptyDescription="Create your first BOM to define a product model's component recipe."
          emptyAction={{ label: "New BOM", onClick: () => navigate("/masters/boms/new") }}
          rowActions={rowActions}
          onRowClick={(b) => navigate(`/masters/boms/${b.id}`)}
          getRowId={(b) => b.id}
          enableSorting
          enableColumnVisibility
          enableDensity
          toolbar={<OdsToolbar onRefresh={() => refetch()} isRefreshing={isFetching} />}
        />
      </div>
    </AppLayout>
  );
}
