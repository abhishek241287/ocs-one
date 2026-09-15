import { useMemo, useState, type ReactNode } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import {
  Archive,
  ArrowDownRight,
  ChevronRight,
  CircleAlert,
  FileSearch,
  Layers,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import AppLayout from "@/layouts/AppLayout";
import { ReportShell } from "../components/ReportShell";
import {
  type ValuationLayerTraceRow,
  type ValuationMovementsAtCostRow,
  type ValuationValueOnHandRow,
  useValuationLayerTrace,
  useValuationMovementsAtCost,
  useValuationValueOnHand,
} from "../hooks/useReports";
import { OdsDataTable } from "@/components/ods/OdsDataTable";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type ReportView = "on-hand" | "movements" | "trace";

const today = () => new Date().toISOString().split("T")[0];
const monthAgo = () => new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

const numberFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 });
const currencyFormatter = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function displayNumber(value: number | null | undefined, currency?: string) {
  if (value === null || value === undefined) return "NULL";
  return currency ? `${currency} ${currencyFormatter.format(value)}` : numberFormatter.format(value);
}

function displayDate(value: string | null | undefined) {
  if (!value) return "NULL";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function displayText(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "NULL" : String(value);
}

function NullValue({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[11px] text-amber-700/80">{children}</span>;
}

function ValueCell({ value, currency }: { value: number | null | undefined; currency?: string | null }) {
  return value === null || value === undefined
    ? <NullValue>Unknown</NullValue>
    : <span className="font-mono tabular-nums">{displayNumber(value, currency ?? undefined)}</span>;
}

function StatusBadge({ value }: { value: string | null | undefined }) {
  const normalized = value?.toLowerCase() ?? "";
  const captured = normalized.includes("captur") || normalized === "valued" || normalized === "known";
  return value === null || value === undefined || value === ""
    ? <NullValue>Unknown</NullValue>
    : <Badge
        variant="outline"
        className={cn(
          "font-mono text-[10px] uppercase tracking-[0.08em]",
          captured
            ? "border-emerald-700/25 bg-emerald-50 text-emerald-800"
            : "border-amber-700/25 bg-amber-50 text-amber-800",
        )}
      >
        {value}
      </Badge>;
}

function ReportError({ onRetry }: { onRetry: () => void }) {
  return (
    <Alert variant="destructive" className="border-red-900/15 bg-red-50/60">
      <CircleAlert className="h-4 w-4" />
      <AlertTitle>Valuation report unavailable</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>The evidence endpoint did not return a report. No values have been inferred.</span>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function FilterLabel({ children }: { children: ReactNode }) {
  return <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{children}</label>;
}

const valueColumns: ColumnDef<ValuationValueOnHandRow>[] = [
  {
    accessorKey: "material_code",
    header: "Material",
    cell: ({ row }) => (
      <div className="min-w-[170px]">
        <div className="font-mono text-xs font-semibold text-foreground">{displayText(row.original.material_code)}</div>
        <div className="max-w-[210px] truncate text-xs text-muted-foreground">{displayText(row.original.material_name)}</div>
      </div>
    ),
  },
  {
    accessorKey: "warehouse_code",
    header: "Warehouse",
    cell: ({ row }) => (
      <div className="min-w-[130px]">
        <div className="font-mono text-xs">{displayText(row.original.warehouse_code)}</div>
        <div className="max-w-[160px] truncate text-xs text-muted-foreground">{displayText(row.original.warehouse_name)}</div>
      </div>
    ),
  },
  {
    accessorKey: "stock_state",
    header: "Stock state",
    cell: ({ row }) => <StatusBadge value={row.original.stock_state} />,
  },
  {
    accessorKey: "quantity",
    header: "Quantity",
    cell: ({ row }) => (
      <div className="text-right">
        <div className="font-mono tabular-nums">{displayNumber(row.original.quantity)}</div>
        <div className="text-[11px] text-muted-foreground">{displayText(row.original.uom)}</div>
      </div>
    ),
  },
  {
    accessorKey: "layer_remaining_quantity",
    header: "Layer remaining",
    cell: ({ row }) => <span className="font-mono tabular-nums">{displayNumber(row.original.layer_remaining_quantity)}</span>,
  },
  {
    accessorKey: "value_status",
    header: "Value status",
    cell: ({ row }) => <StatusBadge value={row.original.value_status} />,
  },
  {
    accessorKey: "unit_cost",
    header: "Unit cost",
    cell: ({ row }) => <ValueCell value={row.original.unit_cost} currency={row.original.currency} />,
  },
  {
    accessorKey: "value_amount",
    header: "Captured value",
    cell: ({ row }) => <ValueCell value={row.original.value_amount} currency={row.original.currency} />,
  },
  {
    accessorKey: "policy",
    header: "Policy",
    cell: ({ row }) => <span className="font-mono text-[11px] text-muted-foreground">{displayText(row.original.policy)}</span>,
  },
  {
    accessorKey: "created_at",
    header: "Layer created",
    cell: ({ row }) => <span className="whitespace-nowrap text-xs text-muted-foreground">{displayDate(row.original.created_at)}</span>,
  },
];

const movementColumns = (onTrace: (row: ValuationMovementsAtCostRow) => void): ColumnDef<ValuationMovementsAtCostRow>[] => [
  {
    accessorKey: "event_at",
    header: "Event",
    cell: ({ row }) => <span className="whitespace-nowrap text-xs text-muted-foreground">{displayDate(row.original.event_at)}</span>,
  },
  {
    accessorKey: "material_code",
    header: "Material",
    cell: ({ row }) => (
      <div className="min-w-[155px]">
        <div className="font-mono text-xs font-semibold">{displayText(row.original.material_code)}</div>
        <div className="max-w-[190px] truncate text-xs text-muted-foreground">{displayText(row.original.material_name)}</div>
      </div>
    ),
  },
  {
    accessorKey: "event_type",
    header: "Event type",
    cell: ({ row }) => <StatusBadge value={row.original.event_type} />,
  },
  {
    accessorKey: "transaction_type",
    header: "Transaction",
    cell: ({ row }) => <span className="font-mono text-[11px]">{displayText(row.original.transaction_type)}</span>,
  },
  {
    accessorKey: "quantity",
    header: "Quantity",
    cell: ({ row }) => <span className="font-mono tabular-nums">{displayNumber(row.original.quantity)}</span>,
  },
  {
    accessorKey: "value_status",
    header: "Value status",
    cell: ({ row }) => <StatusBadge value={row.original.value_status} />,
  },
  {
    accessorKey: "unit_cost",
    header: "At cost",
    cell: ({ row }) => <ValueCell value={row.original.unit_cost} currency={row.original.currency} />,
  },
  {
    accessorKey: "value_amount",
    header: "Value movement",
    cell: ({ row }) => <ValueCell value={row.original.value_amount} currency={row.original.currency} />,
  },
  {
    accessorKey: "allocation_index",
    header: "Allocation",
    cell: ({ row }) => <span className="font-mono tabular-nums">{displayText(row.original.allocation_index)}</span>,
  },
  {
    accessorKey: "source_document_id",
    header: "Source",
    cell: ({ row }) => (
      <div className="min-w-[120px]">
        <div className="font-mono text-xs">{displayText(row.original.source_document_id)}</div>
        <div className="text-[11px] text-muted-foreground">{displayText(row.original.source_document_type)}</div>
      </div>
    ),
  },
  {
    id: "trace",
    header: "",
    enableSorting: false,
    cell: ({ row }) => (
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-2 text-xs text-primary"
        onClick={(event) => {
          event.stopPropagation();
          onTrace(row.original);
        }}
      >
        <FileSearch className="h-3.5 w-3.5" />
        Trace
        <ChevronRight className="h-3 w-3" />
      </Button>
    ),
  },
];

const traceColumns: ColumnDef<ValuationLayerTraceRow>[] = [
  {
    accessorKey: "allocation_index",
    header: "Order",
    cell: ({ row }) => <span className="font-mono font-semibold tabular-nums">{displayText(row.original.allocation_index)}</span>,
  },
  {
    accessorKey: "event_at",
    header: "Movement event",
    cell: ({ row }) => <span className="whitespace-nowrap text-xs text-muted-foreground">{displayDate(row.original.event_at)}</span>,
  },
  {
    accessorKey: "direction",
    header: "Direction",
    cell: ({ row }) => <StatusBadge value={row.original.direction} />,
  },
  {
    accessorKey: "quantity",
    header: "Allocated qty",
    cell: ({ row }) => <span className="font-mono tabular-nums">{displayNumber(row.original.quantity)}</span>,
  },
  {
    accessorKey: "value_status",
    header: "Value status",
    cell: ({ row }) => <StatusBadge value={row.original.value_status} />,
  },
  {
    accessorKey: "value_amount",
    header: "Allocated value",
    cell: ({ row }) => <ValueCell value={row.original.value_amount} currency={row.original.currency} />,
  },
  {
    accessorKey: "layer_id",
    header: "Layer",
    cell: ({ row }) => (
      <div className="min-w-[120px]">
        <div className="font-mono text-xs">{displayText(row.original.layer_id)}</div>
        <div className="text-[11px] text-muted-foreground">GRN {displayText(row.original.grn_line_id)}</div>
      </div>
    ),
  },
  {
    accessorKey: "receipt_unit_cost",
    header: "Receipt cost",
    cell: ({ row }) => <ValueCell value={row.original.receipt_unit_cost} currency={row.original.receipt_currency} />,
  },
  {
    accessorKey: "layer_remaining_quantity",
    header: "Layer remaining",
    cell: ({ row }) => <span className="font-mono tabular-nums">{displayNumber(row.original.layer_remaining_quantity)}</span>,
  },
  {
    accessorKey: "receipt_cost_status",
    header: "Receipt status",
    cell: ({ row }) => <StatusBadge value={row.original.receipt_cost_status} />,
  },
  {
    accessorKey: "receipt_document_id",
    header: "Receipt citation",
    cell: ({ row }) => (
      <div className="min-w-[150px]">
        <div className="font-mono text-xs">{displayText(row.original.receipt_document_id)}</div>
        <div className="text-[11px] text-muted-foreground">
          {displayText(row.original.receipt_document_type)} · line {displayText(row.original.receipt_line_id)}
        </div>
      </div>
    ),
  },
];

export default function ValuationReportsPage() {
  const [view, setView] = useState<ReportView>("on-hand");
  const [valueFilters, setValueFilters] = useState({ material_id: "", warehouse_id: "", stock_state: "" });
  const [appliedValueFilters, setAppliedValueFilters] = useState(valueFilters);
  const [movementFilters, setMovementFilters] = useState({ from: monthAgo(), to: today(), material_id: "", movement_id: "", limit: "250" });
  const [appliedMovementFilters, setAppliedMovementFilters] = useState(movementFilters);
  const [traceFilters, setTraceFilters] = useState({ from: monthAgo(), to: today(), movement_id: "", material_id: "", limit: "250" });
  const [appliedTraceFilters, setAppliedTraceFilters] = useState(traceFilters);

  const valueParams = useMemo(() => appliedValueFilters, [appliedValueFilters]);
  const movementParams = useMemo(() => ({
    ...appliedMovementFilters,
    limit: Number(appliedMovementFilters.limit) || 250,
  }), [appliedMovementFilters]);
  const traceParams = useMemo(() => ({
    ...appliedTraceFilters,
    limit: Number(appliedTraceFilters.limit) || 250,
  }), [appliedTraceFilters]);

  const valueQuery = useValuationValueOnHand(valueParams);
  const movementQuery = useValuationMovementsAtCost(movementParams);
  const traceQuery = useValuationLayerTrace(traceParams);

  const activeQuery = view === "on-hand" ? valueQuery : view === "movements" ? movementQuery : traceQuery;
  const activeRefreshedAt = view === "on-hand"
    ? valueQuery.data?.refreshed_at
    : view === "movements"
      ? movementQuery.data?.refreshed_at
      : traceQuery.data?.refreshed_at;

  const openTrace = (row: ValuationMovementsAtCostRow) => {
    const movement_id = row.movement_id === null || row.movement_id === undefined ? "" : String(row.movement_id);
    setTraceFilters((current) => ({ ...current, movement_id, material_id: row.material_id ? String(row.material_id) : current.material_id }));
    setAppliedTraceFilters((current) => ({ ...current, movement_id, material_id: row.material_id ? String(row.material_id) : current.material_id }));
    setView("trace");
  };

  const valueSummary = valueQuery.data?.summary;
  const valueCoverage = valueSummary?.captured_coverage_pct;

  return (
    <AppLayout>
      <ReportShell
        title="Valuation reports"
        subtitle="The read-only value twin for material captured, unknown, and traceable cost layers."
        refreshedAt={activeRefreshedAt}
        onRefresh={() => { void activeQuery.refetch(); }}
        isLoading={activeQuery.isLoading || activeQuery.isFetching}
      >
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <span>Read-only evidence surface</span>
              <span className="text-border">/</span>
              <span className="font-mono">OCS-VAL</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-emerald-600" />
              Live API data
            </div>
          </div>

          <Tabs value={view} onValueChange={(next) => setView(next as ReportView)}>
            <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b border-border bg-transparent p-0">
              <TabsTrigger value="on-hand" className="rounded-t-md rounded-b-none border-b-2 border-transparent px-4 py-3 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                <Archive className="mr-2 h-3.5 w-3.5" />
                Value on hand
              </TabsTrigger>
              <TabsTrigger value="movements" className="rounded-t-md rounded-b-none border-b-2 border-transparent px-4 py-3 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                <ArrowDownRight className="mr-2 h-3.5 w-3.5" />
                Movements at cost
              </TabsTrigger>
              <TabsTrigger value="trace" className="rounded-t-md rounded-b-none border-b-2 border-transparent px-4 py-3 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                <Layers className="mr-2 h-3.5 w-3.5" />
                Layer trace
              </TabsTrigger>
            </TabsList>

            <TabsContent value="on-hand" className="space-y-5">
              <Card className="border-border/80 bg-card/80 shadow-none">
                <CardContent className="pt-5">
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
                    <div className="space-y-1.5">
                      <FilterLabel>Material ID</FilterLabel>
                      <Input value={valueFilters.material_id} onChange={(event) => setValueFilters({ ...valueFilters, material_id: event.target.value })} placeholder="All materials" className="h-9 bg-background/60" />
                    </div>
                    <div className="space-y-1.5">
                      <FilterLabel>Warehouse ID</FilterLabel>
                      <Input value={valueFilters.warehouse_id} onChange={(event) => setValueFilters({ ...valueFilters, warehouse_id: event.target.value })} placeholder="All warehouses" className="h-9 bg-background/60" />
                    </div>
                    <div className="space-y-1.5">
                      <FilterLabel>Stock state</FilterLabel>
                      <Input value={valueFilters.stock_state} onChange={(event) => setValueFilters({ ...valueFilters, stock_state: event.target.value })} placeholder="All states" className="h-9 bg-background/60" />
                    </div>
                    <Button size="sm" className="h-9" onClick={() => setAppliedValueFilters(valueFilters)}>
                      <Search className="mr-1.5 h-3.5 w-3.5" /> Apply filters
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {valueSummary && (
                <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border/80 bg-border/70 md:grid-cols-[1.2fr_1fr_1fr_1fr]">
                  <div className="bg-card p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Quantity on hand</div>
                    <div className="mt-2 font-mono text-2xl font-semibold tracking-tight">{displayNumber(valueSummary.total_quantity)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{numberFormatter.format(valueSummary.row_count)} rows · {numberFormatter.format(valueSummary.layer_count)} layers</div>
                  </div>
                  <div className="bg-card p-4">
                    <div className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
                      <span>Captured coverage</span>
                      <span className="font-mono text-primary">{valueCoverage === null || valueCoverage === undefined ? "Unknown" : `${numberFormatter.format(valueCoverage)}%`}</span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-amber-100">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(0, Math.min(100, valueCoverage ?? 0))}%` }} />
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground"><span className="font-mono">{displayNumber(valueSummary.captured_quantity)}</span> captured · <span className="font-mono text-amber-700">{displayNumber(valueSummary.unknown_quantity)}</span> unknown</div>
                  </div>
                  <div className="bg-card p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Value by currency</div>
                    <div className="mt-2 space-y-1">
                      {valueSummary.captured_value_by_currency.length > 0
                        ? valueSummary.captured_value_by_currency.map((entry) => (
                          <div className="flex items-center justify-between gap-3 font-mono text-sm" key={entry.currency}>
                            <span>{displayText(entry.currency)}</span>
                            <span>{displayNumber(entry.value_amount)}</span>
                          </div>
                        ))
                        : <NullValue>Unknown</NullValue>}
                    </div>
                  </div>
                  <div className="bg-card p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Audit reading</div>
                    <div className="mt-2 flex items-start gap-2 text-sm">
                      <FileSearch className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span className="leading-5 text-muted-foreground">Unknown value fields remain explicit. Inspect the persisted layer and receipt citation below.</span>
                    </div>
                  </div>
                </div>
              )}

              {valueQuery.error ? <ReportError onRetry={() => { void valueQuery.refetch(); }} /> : (
                <OdsDataTable
                  data={valueQuery.data?.rows ?? []}
                  columns={valueColumns}
                  isLoading={valueQuery.isLoading}
                  emptyIcon="—"
                  emptyTitle="No value-on-hand rows"
                  emptyDescription="No persisted layers matched these filters. Try removing a filter to inspect the full on-hand position."
                  enableSorting
                  stickyHeader
                  defaultDensity="compact"
                  className="valuation-table"
                />
              )}
            </TabsContent>

            <TabsContent value="movements" className="space-y-5">
              <Card className="border-border/80 bg-card/80 shadow-none">
                <CardContent className="pt-5">
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.8fr_0.8fr_1fr_1fr_0.7fr_auto] lg:items-end">
                    <div className="space-y-1.5"><FilterLabel>From</FilterLabel><Input type="date" value={movementFilters.from} onChange={(event) => setMovementFilters({ ...movementFilters, from: event.target.value })} className="h-9 bg-background/60" /></div>
                    <div className="space-y-1.5"><FilterLabel>To</FilterLabel><Input type="date" value={movementFilters.to} onChange={(event) => setMovementFilters({ ...movementFilters, to: event.target.value })} className="h-9 bg-background/60" /></div>
                    <div className="space-y-1.5"><FilterLabel>Material ID</FilterLabel><Input value={movementFilters.material_id} onChange={(event) => setMovementFilters({ ...movementFilters, material_id: event.target.value })} placeholder="All materials" className="h-9 bg-background/60" /></div>
                    <div className="space-y-1.5"><FilterLabel>Movement ID</FilterLabel><Input value={movementFilters.movement_id} onChange={(event) => setMovementFilters({ ...movementFilters, movement_id: event.target.value })} placeholder="All movements" className="h-9 bg-background/60" /></div>
                    <div className="space-y-1.5"><FilterLabel>Row limit</FilterLabel><Input type="number" min="1" max="500" value={movementFilters.limit} onChange={(event) => setMovementFilters({ ...movementFilters, limit: event.target.value })} className="h-9 bg-background/60" /></div>
                    <Button size="sm" className="h-9" onClick={() => setAppliedMovementFilters(movementFilters)}><SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" /> Apply</Button>
                  </div>
                </CardContent>
              </Card>

              <div className="flex items-center justify-between gap-3 rounded-md border border-primary/15 bg-primary/5 px-4 py-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-2"><FileSearch className="h-4 w-4 text-primary" /><span>Select a movement to inspect its persisted allocation order and receipt citation.</span></div>
                <span className="hidden font-mono text-[11px] sm:block">{movementQuery.data?.rows.length ?? 0} returned</span>
              </div>

              {movementQuery.error ? <ReportError onRetry={() => { void movementQuery.refetch(); }} /> : (
                <OdsDataTable
                  data={movementQuery.data?.rows ?? []}
                  columns={movementColumns(openTrace)}
                  isLoading={movementQuery.isLoading}
                  emptyIcon="—"
                  emptyTitle="No costed movements"
                  emptyDescription="No movement allocations matched this date range and filter set."
                  onRowClick={openTrace}
                  getRowId={(row) => String(row.event_id)}
                  enableSorting
                  stickyHeader
                  defaultDensity="compact"
                  className="valuation-table"
                />
              )}
            </TabsContent>

            <TabsContent value="trace" className="space-y-5">
              <Card className="border-border/80 bg-card/80 shadow-none">
                <CardContent className="pt-5">
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.8fr_0.8fr_1fr_1fr_0.7fr_auto] lg:items-end">
                    <div className="space-y-1.5"><FilterLabel>From</FilterLabel><Input type="date" value={traceFilters.from} onChange={(event) => setTraceFilters({ ...traceFilters, from: event.target.value })} className="h-9 bg-background/60" /></div>
                    <div className="space-y-1.5"><FilterLabel>To</FilterLabel><Input type="date" value={traceFilters.to} onChange={(event) => setTraceFilters({ ...traceFilters, to: event.target.value })} className="h-9 bg-background/60" /></div>
                    <div className="space-y-1.5"><FilterLabel>Movement ID</FilterLabel><Input value={traceFilters.movement_id} onChange={(event) => setTraceFilters({ ...traceFilters, movement_id: event.target.value })} placeholder="All movements" className="h-9 bg-background/60" /></div>
                    <div className="space-y-1.5"><FilterLabel>Material ID</FilterLabel><Input value={traceFilters.material_id} onChange={(event) => setTraceFilters({ ...traceFilters, material_id: event.target.value })} placeholder="All materials" className="h-9 bg-background/60" /></div>
                    <div className="space-y-1.5"><FilterLabel>Row limit</FilterLabel><Input type="number" min="1" max="500" value={traceFilters.limit} onChange={(event) => setTraceFilters({ ...traceFilters, limit: event.target.value })} className="h-9 bg-background/60" /></div>
                    <Button size="sm" className="h-9" onClick={() => setAppliedTraceFilters(traceFilters)}><SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" /> Apply</Button>
                  </div>
                </CardContent>
              </Card>

              {traceFilters.movement_id && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-700/20 bg-amber-50/70 px-4 py-3 text-xs text-amber-900">
                  <div className="flex items-center gap-2"><Layers className="h-4 w-4" /><span>Focused allocation trace for movement <span className="font-mono font-semibold">{traceFilters.movement_id}</span>.</span></div>
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-amber-900" onClick={() => { const next = { ...traceFilters, movement_id: "" }; setTraceFilters(next); setAppliedTraceFilters(next); }}>Clear focus</Button>
                </div>
              )}

              {traceQuery.error ? <ReportError onRetry={() => { void traceQuery.refetch(); }} /> : (
                <OdsDataTable
                  data={traceQuery.data?.rows ?? []}
                  columns={traceColumns}
                  isLoading={traceQuery.isLoading}
                  emptyIcon="—"
                  emptyTitle="No layer trace rows"
                  emptyDescription="No persisted allocations matched this trace window. Use a movement row to focus the exact receipt path."
                  enableSorting
                  stickyHeader
                  defaultDensity="compact"
                  className="valuation-table"
                />
              )}
            </TabsContent>
          </Tabs>

          <div className="flex items-center gap-2 border-t border-border/70 pt-4 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            <span>All rows are read-only. Display order follows the valuation API response; no client-side values are substituted.</span>
          </div>
        </div>
      </ReportShell>
    </AppLayout>
  );
}