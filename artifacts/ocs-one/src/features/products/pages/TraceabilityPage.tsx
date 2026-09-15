import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  BadgeCheck,
  Boxes,
  CalendarDays,
  Check,
  ClipboardCheck,
  FileCheck2,
  GitBranch,
  Hash,
  History,
  Layers3,
  Loader2,
  PackageSearch,
  QrCode,
  ScanLine,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Truck,
  XCircle,
} from "lucide-react";
import AppLayout from "@/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getGetAttributeTemplateQueryKey,
  getGetAttributeTemplateVersionQueryKey,
  getGetGenealogyCompositionQueryKey,
  getGetGenealogyDownstreamQueryKey,
  getGetGenealogyRecallQueryKey,
  getGetGenealogyUpstreamQueryKey,
  getListAttributeTemplatesQueryKey,
  getListInventoryLotsQueryKey,
  getListProductionOrdersQueryKey,
  useGetAttributeTemplate,
  useGetAttributeTemplateVersion,
  useGetGenealogyComposition,
  useGetGenealogyDownstream,
  useGetGenealogyRecall,
  useGetGenealogyUpstream,
  useListInventoryLots,
  useListAttributeTemplates,
  useListProductionOrders,
} from "@workspace/api-client-react";
import type {
  GenealogyCompositionResponse,
  GenealogyDownstreamResponse,
  GenealogyRecallResponse,
  GenealogyRecallMatch,
  GenealogyUpstreamResponse,
  GenealogyUpstreamInput,
  GenealogyUpstreamAllocation,
} from "@workspace/api-client-react";
import { ModuleHeader, OdsDataTable, OdsEmptyState } from "@/components/ods";

type Mode = "upstream" | "downstream" | "composition" | "recall";

const MODES: { id: Mode; label: string; hint: string; icon: typeof GitBranch }[] = [
  { id: "upstream", label: "Upstream", hint: "Order → source lots", icon: ArrowDownToLine },
  { id: "downstream", label: "Downstream", hint: "Lot → consumers", icon: ArrowRight },
  { id: "composition", label: "Composition", hint: "Serial → certified cells", icon: Boxes },
  { id: "recall", label: "Recall", hint: "Attribute → affected units", icon: ShieldCheck },
];

const MONO = "font-mono tracking-[-0.02em]";

function display(value: unknown, fallback = "—") {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function errorMessage(error: unknown, fallback = "The trace could not be loaded.") {
  const candidate = error as { data?: { error?: string }; message?: string } | undefined;
  return candidate?.data?.error ?? candidate?.message ?? fallback;
}

function CitationBadge({ citation, testId }: { citation?: { type: string; id: string }; testId: string }) {
  const [copied, setCopied] = useState(false);
  const citationText = citation ? `${citation.type} ${citation.id}` : "";

  const copyCitation = async () => {
    if (!citationText) return;
    try {
      await navigator.clipboard.writeText(citationText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={copyCitation}
      disabled={!citation}
      aria-label={citation ? `Copy citation ${citationText}` : "Source document unavailable"}
      data-testid={testId}
      title={citation ? `${citationText}${copied ? " — copied" : " — click to copy"}` : "Source document unavailable"}
      className="inline-flex max-w-[15rem] items-center gap-1 rounded-sm border border-primary/25 bg-primary/8 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-primary transition-colors hover:bg-primary/15 disabled:cursor-default disabled:opacity-70"
    >
      {copied ? <Check className="h-3 w-3 shrink-0" /> : <FileCheck2 className="h-3 w-3 shrink-0" />}
      <span className="truncate">{citation ? `${citation.type} · ${citation.id}` : "citation unavailable"}</span>
    </button>
  );
}

function KeyValue({ label, value, mono = false, testId }: { label: string; value: unknown; mono?: boolean; testId?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">{label}</div>
      <div data-testid={testId} className={`mt-1 truncate text-sm text-foreground ${mono ? MONO : ""}`}>
        {display(value)}
      </div>
    </div>
  );
}

function QueryError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const message = errorMessage(error);
  const status = (error as { status?: number } | undefined)?.status;
  return (
    <div data-testid="status-trace-error" className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/6 p-4">
      <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-foreground">
          {status === 404 ? "No trace found" : status === 422 ? "Trace parameters need attention" : "Trace unavailable"}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      </div>
      <Button data-testid="button-retry-trace" variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

function LoadingBlock({ label = "Resolving cited records" }: { label?: string }) {
  return (
    <div data-testid="status-trace-loading" className="rounded-md border border-border bg-card p-5">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        {label}
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-3 w-2/5 animate-pulse rounded bg-muted" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
        <div className="h-3 w-3/5 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

function EmptyTrace({ mode, hasLookup }: { mode: Mode; hasLookup: boolean }) {
  const copy = hasLookup
    ? { title: "No cited records returned", description: "The source accepted the lookup, but no linked records were found." }
    : {
        title: `Start a ${mode} trace`,
        description: "Enter a known identifier above. Results remain visible while you prepare the next lookup.",
      };
  return (
    <div data-testid={`empty-trace-${mode}`} className="rounded-md border border-dashed border-border bg-card/70">
      <OdsEmptyState icon="∅" title={copy.title} description={copy.description} />
    </div>
  );
}

function SectionHeading({ icon: Icon, title, count, testId }: { icon: typeof Layers3; title: string; count?: number; testId?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/70 pb-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h3 data-testid={testId} className="text-sm font-semibold tracking-tight">{title}</h3>
      </div>
      {count !== undefined && <span className={`${MONO} text-xs text-muted-foreground`}>{count}</span>}
    </div>
  );
}

function NodeLine({
  eyebrow,
  title,
  details,
  citation,
  testId,
}: {
  eyebrow: string;
  title: string;
  details?: React.ReactNode;
  citation?: { type: string; id: string };
  testId: string;
}) {
  return (
    <div data-testid={testId} className="relative rounded-md border border-border/80 bg-background/55 p-3 transition-transform duration-200 hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{eyebrow}</div>
          <div className={`${MONO} mt-1 truncate text-sm font-bold text-foreground`}>{title}</div>
        </div>
        <CitationBadge citation={citation} testId={`${testId}-citation`} />
      </div>
      {details && <div className="mt-3">{details}</div>}
    </div>
  );
}

function TraceInput({
  mode,
  value,
  onChange,
  onSubmit,
  placeholder,
  label,
  helper,
  actionLabel = "Resolve",
}: {
  mode: Mode;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  label: string;
  helper: string;
  actionLabel?: string;
}) {
  return (
    <form
      data-testid={`form-trace-${mode}`}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="rounded-md border border-border bg-card p-4 shadow-[0_8px_24px_hsl(210_32%_17%/0.04)]"
    >
      <Label htmlFor={`trace-input-${mode}`} className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <ScanLine className="h-4 w-4 text-primary" />
        {label}
      </Label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={`trace-input-${mode}`}
            data-testid={`input-trace-${mode}`}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            className={`h-11 pl-9 ${MONO} text-sm`}
            autoComplete="off"
            autoFocus={mode === "upstream"}
          />
        </div>
        <Button data-testid={`button-submit-trace-${mode}`} type="submit" className="h-11 gap-2 sm:min-w-32">
          <Search className="h-4 w-4" />
          {actionLabel}
        </Button>
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <QrCode className="h-3.5 w-3.5" />
        {helper}
      </div>
    </form>
  );
}

function UpstreamResults({ data }: { data: GenealogyUpstreamResponse }) {
  return (
    <div data-testid="results-upstream" className="space-y-4">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="grid gap-4 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">Production order</div>
            <div data-testid="text-upstream-order-number" className={`${MONO} mt-1 text-lg font-bold`}>{data.order_number}</div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <BadgeCheck className="h-4 w-4 text-primary" />
            <span data-testid="text-upstream-input-count">{data.inputs.length} cited material inputs</span>
          </div>
        </CardContent>
      </Card>
      {data.inputs.length === 0 ? (
        <EmptyTrace mode="upstream" hasLookup />
      ) : (
        <div className="space-y-3">
          {data.inputs.map((input) => (
            <UpstreamInput key={input.material_id} input={input} />
          ))}
        </div>
      )}
    </div>
  );
}

function UpstreamInput({ input }: { input: GenealogyUpstreamInput }) {
  return (
    <Card data-testid={`card-upstream-material-${input.material_id}`} className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-muted/30 px-4 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <PackageSearch className="h-4 w-4 shrink-0 text-primary" />
            <CardTitle className={`${MONO} truncate text-sm`}>{input.material_code}</CardTitle>
            <CitationBadge citation={input.document_cited} testId={`text-upstream-material-citation-${input.material_id}`} />
          </div>
          <span className="text-xs text-muted-foreground">{input.quantity_issued} {input.uom} issued</span>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-2">
          <NodeLine
            eyebrow="Issue note"
            title={input.issue.note_number}
            citation={input.issue.document_cited}
            testId={`node-issue-${input.issue.note_id}`}
            details={<span className="text-xs text-muted-foreground">Material issue document · {input.issue.note_id}</span>}
          />
          {input.bulk_issue && (
            <NodeLine
              eyebrow="Bulk issue"
              title={input.bulk_issue.batch_id}
              citation={input.bulk_issue.document_cited}
              testId={`node-bulk-issue-${input.bulk_issue.batch_id}`}
              details={<span className="text-xs text-muted-foreground">Batch line {input.bulk_issue.batch_line_id}</span>}
            />
          )}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Lot allocations</div>
            <span className={`${MONO} text-xs text-muted-foreground`}>{input.allocations.length}</span>
          </div>
          {input.allocations.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">No lot allocation was cited.</div>
          ) : (
            input.allocations.map((allocation) => <AllocationNode key={allocation.allocation_id} allocation={allocation} attributes={input.attributes} />)
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AllocationNode({ allocation, attributes }: { allocation: GenealogyUpstreamAllocation; attributes: GenealogyUpstreamInput["attributes"] }) {
  return (
    <NodeLine
      eyebrow="Lot / GRN / supplier"
      title={allocation.lot_number}
      citation={allocation.document_cited}
      testId={`node-lot-${allocation.lot_id}`}
      details={
        <div className="grid gap-3 sm:grid-cols-3">
          <KeyValue label="GRN" value={allocation.grn_number} mono testId={`text-grn-${allocation.grn_id}`} />
          <KeyValue label="Supplier" value={allocation.supplier_name} testId={`text-supplier-${allocation.supplier_id}`} />
          <KeyValue label="Allocated" value={allocation.quantity} mono testId={`text-allocation-${allocation.allocation_id}`} />
          {attributes.length > 0 && (
            <div className="sm:col-span-3 border-t border-border/60 pt-2">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Captured attributes</div>
              <div className="flex flex-wrap gap-1.5">
                {attributes.map((attribute) => (
                  <span key={attribute.attribute_code} data-testid={`attribute-lot-${allocation.lot_id}-${attribute.attribute_code}`} className="rounded-sm bg-accent/35 px-2 py-1 text-xs text-foreground">
                    <span className={MONO}>{attribute.attribute_code}</span>: {display(attribute.value)} {display(attribute.unit, "")}
                    <CitationBadge citation={attribute.document_cited} testId={`attribute-citation-${allocation.lot_id}-${attribute.attribute_code}`} />
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      }
    />
  );
}

function DownstreamResults({ data }: { data: GenealogyDownstreamResponse }) {
  const groups = [
    { id: "reservations", title: "Reservations / POs", icon: ClipboardCheck, items: data.reservations, render: (item: (typeof data.reservations)[number]) => `${item.number} · ${item.quantity_active} active` },
    { id: "wip", title: "WIP / consumptions", icon: Layers3, items: data.wip, render: (item: (typeof data.wip)[number]) => `${item.wip_issue_note_id} · ${item.consumed_qty} / ${item.quantity} consumed` },
    { id: "consumptions", title: "Confirmations", icon: Check, items: data.consumptions, render: (item: (typeof data.consumptions)[number]) => `${item.number} · ${item.actual_qty} actual` },
    { id: "transfers", title: "Transfers", icon: Truck, items: data.transfers, render: (item: (typeof data.transfers)[number]) => `${item.number} · ${item.quantity} · ${item.status}` },
    { id: "outputs", title: "Outputs", icon: Boxes, items: data.outputs, render: (item: (typeof data.outputs)[number]) => `${item.serial_number ?? item.product_id} · ${item.production_order_id}` },
  ] as Array<{ id: string; title: string; icon: typeof Layers3; items: Array<{ document_cited: { type: string; id: string } }>; render: (item: any) => string }>;

  return (
    <div data-testid="results-downstream" className="space-y-4">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="grid gap-4 p-4 sm:grid-cols-3">
          <KeyValue label="Lot number" value={data.lot_number} mono testId="text-downstream-lot-number" />
          <KeyValue label="Lot ID" value={data.lot_id} mono testId="text-downstream-lot-id" />
          <KeyValue label="Material ID" value={data.material_id} mono testId="text-downstream-material-id" />
        </CardContent>
      </Card>
      <div className="grid gap-3 md:grid-cols-2">
        {groups.map(({ id, title, icon: Icon, items, render }) => (
          <Card key={id} data-testid={`section-downstream-${id}`}>
            <CardContent className="p-4">
              <SectionHeading icon={Icon} title={title} count={items.length} testId={`heading-downstream-${id}`} />
              <div className="mt-3 space-y-2">
                {items.length === 0 ? (
                  <div className="rounded border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">No cited records in this branch.</div>
                ) : (
                  items.map((item, index) => (
                    <div key={`${id}-${index}`} data-testid={`row-downstream-${id}-${index}`} className="flex items-center justify-between gap-3 rounded-md border border-border/80 bg-background/55 px-3 py-2">
                      <span className="min-w-0 truncate text-xs">{render(item)}</span>
                      <CitationBadge citation={item.document_cited} testId={`citation-downstream-${id}-${index}`} />
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function CompositionResults({ data }: { data: GenealogyCompositionResponse }) {
  return (
    <div data-testid="results-composition" className="space-y-4">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="grid gap-4 p-4 sm:grid-cols-3">
          <KeyValue label="Product serial" value={data.product.serial_number} mono testId="text-composition-serial" />
          <KeyValue label="Production order" value={data.order.number} mono testId="text-composition-order" />
          <KeyValue label="Product ID" value={data.product.product_id} mono testId="text-composition-product-id" />
          <div className="sm:col-span-3 flex flex-wrap gap-2 border-t border-primary/15 pt-3">
            <CitationBadge citation={data.product.document_cited} testId="citation-composition-product" />
            <CitationBadge citation={data.order.document_cited} testId="citation-composition-order" />
            <span className="text-xs text-muted-foreground">Product and order identity are cited.</span>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <SectionHeading icon={PackageSearch} title="Consumed lots" count={data.consumed_lots.length} testId="heading-composition-lots" />
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {data.consumed_lots.length === 0 ? (
              <div className="col-span-full rounded border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">No consumed lots were cited.</div>
            ) : (
              data.consumed_lots.map((lot) => (
                <div key={lot.lot_id} data-testid={`card-composition-lot-${lot.lot_id}`} className="rounded-md border border-border/80 bg-background/55 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className={`${MONO} text-sm font-bold`}>{lot.lot_number}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{lot.quantity} consumed · {lot.material_id}</div>
                    </div>
                    <CitationBadge citation={lot.document_cited} testId={`citation-composition-lot-${lot.lot_id}`} />
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <SectionHeading icon={BadgeCheck} title="Certified cell provenance" count={data.cell_genealogy.length} testId="heading-composition-cells" />
          <div className="mt-3 space-y-2">
            {data.cell_genealogy.length === 0 ? (
              <div className="rounded border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">No certified cell provenance was cited.</div>
            ) : (
              data.cell_genealogy.map((cell, index) => (
                <div key={`${cell.cell_lot_id}-${index}`} data-testid={`row-composition-cell-${cell.cell_lot_id}`} className="grid gap-2 rounded-md border border-border/80 bg-background/55 p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-center">
                  <KeyValue label="Cell lot" value={cell.cell_lot_id} mono testId={`text-cell-lot-${cell.cell_lot_id}`} />
                  <KeyValue label="Transfer" value={cell.transfer_id} mono testId={`text-cell-transfer-${cell.transfer_id}`} />
                  <KeyValue label="GRN line" value={cell.grn_line_id} mono testId={`text-cell-grn-${cell.grn_line_id}`} />
                  <CitationBadge citation={cell.document_cited} testId={`citation-composition-cell-${cell.cell_lot_id}`} />
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const RECALL_COLUMNS: ColumnDef<GenealogyRecallMatch>[] = [
  { accessorKey: "lot_number", header: "Lot", cell: ({ row }) => <span data-testid={`text-recall-lot-${row.original.lot_id}`} className={MONO}>{row.original.lot_number}</span> },
  { accessorKey: "value_num", header: "Captured value", cell: ({ row }) => <span data-testid={`text-recall-value-${row.original.lot_id}`} className={MONO}>{row.original.value_num} {row.original.unit ?? ""}</span> },
  { accessorKey: "material_id", header: "Material", cell: ({ row }) => <span className={MONO}>{row.original.material_id}</span> },
  { accessorKey: "grn_number", header: "GRN", cell: ({ row }) => <span className={MONO}>{row.original.grn_id}</span> },
  { id: "citation", header: "Evidence", cell: ({ row }) => <CitationBadge citation={row.original.document_cited} testId={`citation-recall-match-${row.original.lot_id}`} /> },
];

function RecallResults({ data }: { data: GenealogyRecallResponse }) {
  return (
    <div data-testid="results-recall" className="space-y-4">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex flex-wrap items-center gap-x-5 gap-y-2 p-4 text-xs">
          <span className="font-semibold text-foreground">Criteria confirmed</span>
          <span data-testid="text-recall-criteria-attribute" className={MONO}>{data.criteria.attribute_code}</span>
          <span className={MONO}>{data.criteria.min}–{data.criteria.max}</span>
          <span className="text-muted-foreground">{data.criteria.date_from ?? "Any date"} to {data.criteria.date_to ?? "Any date"}</span>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <SectionHeading icon={SlidersHorizontal} title="Matching lots" count={data.matches.length} testId="heading-recall-matches" />
          <div className="mt-3">
            <div data-testid="table-recall-matches">
              <OdsDataTable data={data.matches} columns={RECALL_COLUMNS} getRowId={(row) => row.lot_id} isLoading={false} emptyIcon="∅" emptyTitle="No matching lots" emptyDescription="No captured value fell within the selected criteria." enableColumnVisibility={false} enableDensity={false} />
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <SectionHeading icon={ArrowRight} title="Capped downstream expansion" count={data.downstream.length} testId="heading-recall-downstream" />
          <div className="mt-3 space-y-2">
            {data.downstream.length === 0 ? (
              <div className="rounded border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">No downstream consumers returned for the matching lots.</div>
            ) : (
              data.downstream.map((branch) => (
                <div key={branch.lot_id} data-testid={`card-recall-downstream-${branch.lot_id}`} className="rounded-md border border-border/80 bg-background/55 p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <span className={`${MONO} text-sm font-bold`}>{branch.lot_id}</span>
                    <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.09em]">
                      <span data-testid={`text-recall-total-${branch.lot_id}`} className="rounded bg-muted px-2 py-1 text-muted-foreground">total {branch.meta.total}</span>
                      <span data-testid={`text-recall-returned-${branch.lot_id}`} className="rounded bg-primary/10 px-2 py-1 text-primary">returned {branch.meta.returned}</span>
                      <span data-testid={`text-recall-truncated-${branch.lot_id}`} className={`rounded px-2 py-1 ${branch.meta.truncated ? "bg-accent/50 text-foreground" : "bg-muted text-muted-foreground"}`}>
                        {branch.meta.truncated ? "truncated" : "complete"}
                      </span>
                    </div>
                  </div>
                  {branch.consumers.length > 0 && (
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {branch.consumers.map((consumer, index) => (
                        <div key={`${consumer.kind}-${index}`} data-testid={`row-recall-consumer-${branch.lot_id}-${index}`} className="flex items-center justify-between gap-2 rounded border border-border/70 px-2.5 py-2 text-xs">
                          <span className="truncate">{consumer.kind} · {consumer.number ?? consumer.production_order_id ?? consumer.confirmation_id ?? "record"}</span>
                          <CitationBadge citation={consumer.document_cited} testId={`citation-recall-consumer-${branch.lot_id}-${index}`} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function TraceabilityPage() {
  const [mode, setMode] = useState<Mode>("upstream");
  const [upstreamInput, setUpstreamInput] = useState("");
  const [upstreamOrderId, setUpstreamOrderId] = useState("");
  const [downstreamInput, setDownstreamInput] = useState("");
  const [downstreamLotId, setDownstreamLotId] = useState("");
  const [compositionInput, setCompositionInput] = useState("");
  const [compositionParams, setCompositionParams] = useState<{ product_id?: string; serial_number?: string } | null>(null);
  const [recallTemplateId, setRecallTemplateId] = useState("");
  const [recallVersionId, setRecallVersionId] = useState("");
  const [recallAttribute, setRecallAttribute] = useState("");
  const [recallMin, setRecallMin] = useState("");
  const [recallMax, setRecallMax] = useState("");
  const [recallDateFrom, setRecallDateFrom] = useState("");
  const [recallDateTo, setRecallDateTo] = useState("");
  const [recallParams, setRecallParams] = useState<{ template_id: string; attribute_code: string; min: number; max: number; date_from?: string; date_to?: string } | null>(null);
  const [formError, setFormError] = useState("");

  const orderSearchParams = useMemo(() => ({ search: upstreamInput.trim(), page: 1, pageSize: 8 }), [upstreamInput]);
  const orderSearch = useListProductionOrders(orderSearchParams, {
    query: { enabled: mode === "upstream" && upstreamInput.trim().length >= 2, queryKey: getListProductionOrdersQueryKey(orderSearchParams) },
  });
  const lotSearch = useListInventoryLots({
    query: {
      enabled: mode === "downstream" && downstreamInput.trim().length >= 2 && !isUuid(downstreamInput.trim()),
      queryKey: getListInventoryLotsQueryKey(),
    },
  });
  const templateSearch = useListAttributeTemplates(undefined, {
    query: { enabled: mode === "recall", queryKey: getListAttributeTemplatesQueryKey(undefined) },
  });
  const template = useGetAttributeTemplate(recallTemplateId || "", {
    query: { enabled: mode === "recall" && !!recallTemplateId, queryKey: getGetAttributeTemplateQueryKey(recallTemplateId || "") },
  });
  const version = useGetAttributeTemplateVersion(recallVersionId || "", {
    query: { enabled: mode === "recall" && !!recallVersionId, queryKey: getGetAttributeTemplateVersionQueryKey(recallVersionId || "") },
  });

  const upstream = useGetGenealogyUpstream(
    { production_order_id: upstreamOrderId || "" },
    { query: { enabled: mode === "upstream" && !!upstreamOrderId, queryKey: getGetGenealogyUpstreamQueryKey({ production_order_id: upstreamOrderId || "" }) } },
  );
  const downstream = useGetGenealogyDownstream(
    { lot_id: downstreamLotId || "" },
    { query: { enabled: mode === "downstream" && !!downstreamLotId, queryKey: getGetGenealogyDownstreamQueryKey({ lot_id: downstreamLotId || "" }) } },
  );
  const composition = useGetGenealogyComposition(
    compositionParams ?? {},
    { query: { enabled: mode === "composition" && !!compositionParams, queryKey: getGetGenealogyCompositionQueryKey(compositionParams ?? {}) } },
  );
  const recall = useGetGenealogyRecall(
    recallParams ?? { template_id: "", attribute_code: "", min: 0, max: 0 },
    { query: { enabled: mode === "recall" && !!recallParams, queryKey: getGetGenealogyRecallQueryKey(recallParams ?? undefined) } },
  );

  const templates = templateSearch.data?.items ?? [];
  const templateVersions = template.data?.versions ?? [];
  const attributes = version.data?.attributes ?? [];
  const orders = orderSearch.data?.items ?? [];
  const lots = lotSearch.data?.items ?? [];

  useEffect(() => {
    if (mode !== "recall") return;
    if (!recallTemplateId && templates[0]) setRecallTemplateId(templates[0].id);
  }, [mode, recallTemplateId, templates]);

  useEffect(() => {
    if (mode !== "recall" || !recallTemplateId) return;
    const activeVersion = templateVersions.find((item) => item.status === "ACTIVE") ?? templateVersions[0];
    if (activeVersion && !templateVersions.some((item) => item.id === recallVersionId)) setRecallVersionId(activeVersion.id);
  }, [mode, recallTemplateId, recallVersionId, templateVersions]);

  useEffect(() => {
    if (!recallAttribute && attributes[0]) setRecallAttribute(attributes[0].attribute_code ?? attributes[0].id ?? "");
    if (recallAttribute && !attributes.some((item) => (item.attribute_code ?? item.id) === recallAttribute)) setRecallAttribute(attributes[0]?.attribute_code ?? attributes[0]?.id ?? "");
  }, [attributes, recallAttribute]);

  const chooseOrder = (order: { id: string; orderNumber: string }) => {
    setUpstreamInput(order.orderNumber);
    setUpstreamOrderId(order.id);
    setFormError("");
  };

  const submitUpstream = () => {
    const value = upstreamInput.trim();
    if (!value) return setFormError("Enter a production order ID or order number.");
    const exact = orders.find((order) => order.orderNumber.toLowerCase() === value.toLowerCase());
    setUpstreamOrderId(exact?.id ?? value);
    setFormError("");
  };

  const submitDownstream = () => {
    const value = downstreamInput.trim();
    if (!value) return setFormError("Scan or enter a lot ID or lot number.");
    const exact = lots.find((lot) => lot.lot_number.toLowerCase() === value.toLowerCase());
    setDownstreamLotId(exact?.id ?? value);
    setFormError("");
  };

  const submitComposition = () => {
    const value = compositionInput.trim();
    if (!value) return setFormError("Enter a product serial or product ID.");
    const isId = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value);
    setCompositionParams(isId ? { product_id: value } : { serial_number: value });
    setFormError("");
  };

  const submitRecall = () => {
    const min = Number(recallMin);
    const max = Number(recallMax);
    if (!recallVersionId || !recallAttribute) return setFormError("Select a template version and attribute before running recall.");
    if (!Number.isFinite(min) || !Number.isFinite(max) || recallMin === "" || recallMax === "") return setFormError("Enter numeric minimum and maximum values.");
    if (min >= max) return setFormError("Minimum must be less than maximum.");
    if ((recallDateFrom && !recallDateTo) || (!recallDateFrom && recallDateTo)) return setFormError("Enter both dates to apply a date range.");
    if (recallDateFrom && recallDateTo && recallDateFrom > recallDateTo) return setFormError("The date range is reversed.");
    setRecallParams({
      template_id: recallVersionId,
      attribute_code: recallAttribute,
      min,
      max,
      ...(recallDateFrom ? { date_from: recallDateFrom } : {}),
      ...(recallDateTo ? { date_to: recallDateTo } : {}),
    });
    setFormError("");
  };

  const activeError = mode === "upstream" ? upstream.error : mode === "downstream" ? downstream.error : mode === "composition" ? composition.error : recall.error;
  const activeLoading = mode === "upstream" ? upstream.isLoading : mode === "downstream" ? downstream.isLoading : mode === "composition" ? composition.isLoading : recall.isLoading;
  const hasLookup = mode === "upstream" ? !!upstreamOrderId : mode === "downstream" ? !!downstreamLotId : mode === "composition" ? !!compositionParams : !!recallParams;
  const retry = () => {
    if (mode === "upstream") void upstream.refetch();
    if (mode === "downstream") void downstream.refetch();
    if (mode === "composition") void composition.refetch();
    if (mode === "recall") void recall.refetch();
  };

  return (
    <AppLayout>
      <div className="min-h-[calc(100dvh-4rem)] bg-background p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-[1480px] space-y-5">
          <ModuleHeader
            icon={<GitBranch className="h-5 w-5 text-primary" />}
            title="Genealogy console"
            description="A cited, read-only chain from finished unit to source records."
            certification="certified"
            meta={[{ label: "Batch", value: "73-E" }, { label: "Mode", value: "read-only" }]}
          />

          <div className="grid gap-5 xl:grid-cols-[260px_1fr]">
            <aside className="space-y-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Trace direction</div>
              <nav data-testid="nav-trace-modes" className="grid grid-cols-2 gap-2 xl:grid-cols-1">
                {MODES.map(({ id, label, hint, icon: Icon }) => (
                  <button
                    key={id}
                    data-testid={`button-mode-${id}`}
                    type="button"
                    onClick={() => {
                      setMode(id);
                      setFormError("");
                    }}
                    className={`group rounded-md border p-3 text-left transition-transform duration-200 hover:-translate-y-0.5 ${mode === id ? "border-primary/45 bg-primary/9 shadow-[inset_3px_0_0_hsl(var(--primary))]" : "border-border bg-card hover:border-primary/25"}`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${mode === id ? "text-primary" : "text-muted-foreground group-hover:text-primary"}`} />
                      <span className="text-sm font-semibold">{label}</span>
                    </div>
                    <div className="mt-1 pl-6 text-[11px] text-muted-foreground">{hint}</div>
                  </button>
                ))}
              </nav>
              <div className="hidden rounded-md border border-border bg-card p-3 text-xs text-muted-foreground xl:block">
                <div className="flex items-center gap-2 font-semibold text-foreground"><History className="h-4 w-4 text-primary" /> Provenance standard</div>
                <p className="mt-2 leading-relaxed">Every edge displayed in this console carries its source document citation.</p>
              </div>
            </aside>

            <main className="min-w-0 space-y-4">
              {mode === "upstream" && (
                <>
                  <TraceInput mode="upstream" value={upstreamInput} onChange={(value) => { setUpstreamInput(value); setUpstreamOrderId(""); }} onSubmit={submitUpstream} label="Production order" placeholder="Scan or enter order number / ID" helper="Search by order number, then resolve the cited material chain." />
                  {upstreamInput.trim().length >= 2 && mode === "upstream" && (
                    <div data-testid="list-production-order-suggestions" className="rounded-md border border-border bg-card p-2 shadow-sm">
                      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Production order matches</div>
                      {orderSearch.isLoading ? <div className="px-2 py-3 text-xs text-muted-foreground">Searching order register…</div> : orders.length === 0 ? <div className="px-2 py-3 text-xs text-muted-foreground">No order numbers match this input. Resolve as an ID with Enter.</div> : orders.map((order) => (
                        <button key={order.id} type="button" data-testid={`button-select-production-order-${order.id}`} onClick={() => chooseOrder(order)} className="flex w-full items-center justify-between rounded px-2 py-2 text-left hover:bg-muted">
                          <span className={`${MONO} text-xs font-semibold`}>{order.orderNumber}</span>
                          <span className="text-[11px] text-muted-foreground">{order.status} · {order.batteryNumber}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
               {mode === "downstream" && (
                 <>
                   <TraceInput mode="downstream" value={downstreamInput} onChange={(value) => { setDownstreamInput(value); setDownstreamLotId(""); }} onSubmit={submitDownstream} label="Material lot" placeholder="Scan lot ID or lot number, then press Enter" helper="Keyboard-wedge friendly. Enter submits the current scan without leaving the field." />
                   {downstreamInput.trim().length >= 2 && !isUuid(downstreamInput.trim()) && (
                     <div data-testid="list-inventory-lot-suggestions" className="rounded-md border border-border bg-card p-2 shadow-sm">
                       <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Lot matches</div>
                       {lotSearch.isLoading ? <div className="px-2 py-3 text-xs text-muted-foreground">Searching lot register…</div> : lots.length === 0 ? <div className="px-2 py-3 text-xs text-muted-foreground">No lot number matches this input. Resolve as an ID with Enter.</div> : lots.filter((lot) => lot.lot_number.toLowerCase().includes(downstreamInput.trim().toLowerCase())).slice(0, 8).map((lot) => (
                         <button key={lot.id} type="button" data-testid={`button-select-inventory-lot-${lot.id}`} onClick={() => { setDownstreamInput(lot.lot_number); setDownstreamLotId(lot.id); setFormError(""); }} className="flex w-full items-center justify-between rounded px-2 py-2 text-left hover:bg-muted">
                           <span className={`${MONO} text-xs font-semibold`}>{lot.lot_number}</span>
                           <span className="text-[11px] text-muted-foreground">{lot.material_code ?? lot.material_id}</span>
                         </button>
                       ))}
                     </div>
                   )}
                 </>
               )}
              {mode === "composition" && <TraceInput mode="composition" value={compositionInput} onChange={setCompositionInput} onSubmit={submitComposition} label="Finished product" placeholder="Scan product serial or enter product ID" helper="Only consumed lots and certified cell provenance are shown; component serials are excluded." />}
              {mode === "recall" && (
                <RecallForm
                  templateId={recallTemplateId}
                  setTemplateId={(value) => { setRecallTemplateId(value); setRecallVersionId(""); }}
                  versionId={recallVersionId}
                  setVersionId={setRecallVersionId}
                  attribute={recallAttribute}
                  setAttribute={setRecallAttribute}
                  min={recallMin}
                  setMin={setRecallMin}
                  max={recallMax}
                  setMax={setRecallMax}
                  dateFrom={recallDateFrom}
                  setDateFrom={setRecallDateFrom}
                  dateTo={recallDateTo}
                  setDateTo={setRecallDateTo}
                  templates={templates}
                  versions={templateVersions}
                  attributes={attributes}
                  loadingTemplates={templateSearch.isLoading}
                  loadingTemplate={template.isLoading}
                  onSubmit={submitRecall}
                />
              )}

              {formError && <div data-testid="status-trace-validation" className="flex items-center gap-2 rounded-md border border-accent/60 bg-accent/20 px-3 py-2 text-sm text-foreground"><AlertTriangle className="h-4 w-4 text-amber-700" />{formError}</div>}
              {activeLoading && <LoadingBlock label={mode === "recall" ? "Matching captured attributes and expanding capped consumers" : "Resolving cited records"} />}
              {!activeLoading && activeError && <QueryError error={activeError} onRetry={retry} />}
              {!activeLoading && !activeError && mode === "upstream" && (upstream.data ? <UpstreamResults data={upstream.data} /> : <EmptyTrace mode={mode} hasLookup={hasLookup} />)}
              {!activeLoading && !activeError && mode === "downstream" && (downstream.data ? <DownstreamResults data={downstream.data} /> : <EmptyTrace mode={mode} hasLookup={hasLookup} />)}
              {!activeLoading && !activeError && mode === "composition" && (composition.data ? <CompositionResults data={composition.data} /> : <EmptyTrace mode={mode} hasLookup={hasLookup} />)}
              {!activeLoading && !activeError && mode === "recall" && (recall.data ? <RecallResults data={recall.data} /> : <EmptyTrace mode={mode} hasLookup={hasLookup} />)}
            </main>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function RecallForm({
  templateId,
  setTemplateId,
  versionId,
  setVersionId,
  attribute,
  setAttribute,
  min,
  setMin,
  max,
  setMax,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  templates,
  versions,
  attributes,
  loadingTemplates,
  loadingTemplate,
  onSubmit,
}: {
  templateId: string;
  setTemplateId: (value: string) => void;
  versionId: string;
  setVersionId: (value: string) => void;
  attribute: string;
  setAttribute: (value: string) => void;
  min: string;
  setMin: (value: string) => void;
  max: string;
  setMax: (value: string) => void;
  dateFrom: string;
  setDateFrom: (value: string) => void;
  dateTo: string;
  setDateTo: (value: string) => void;
  templates: { id: string; code: string; name: string }[];
  versions: { id: string; version_no: number; status: string }[];
  attributes: { id?: string; attribute_code?: string; name?: string; data_type?: string; unit_override?: string | null }[];
  loadingTemplates: boolean;
  loadingTemplate: boolean;
  onSubmit: () => void;
}) {
  return (
    <form data-testid="form-trace-recall" onSubmit={(event) => { event.preventDefault(); onSubmit(); }} className="rounded-md border border-border bg-card p-4 shadow-[0_8px_24px_hsl(210_32%_17%/0.04)]">
      <div className="flex items-center gap-2 border-b border-border/70 pb-3">
        <SlidersHorizontal className="h-4 w-4 text-primary" />
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.12em]">Recall criteria</div>
          <div className="mt-0.5 text-xs text-muted-foreground">Match captured lot attributes, then inspect a capped downstream expansion.</div>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <FieldSelect id="recall-template" label="Attribute template" value={templateId} onChange={setTemplateId} disabled={loadingTemplates} options={templates.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))} />
        <FieldSelect id="recall-version" label="Template version" value={versionId} onChange={setVersionId} disabled={loadingTemplate || !templateId} options={versions.map((item) => ({ value: item.id, label: `v${item.version_no} · ${item.status}` }))} />
        <FieldSelect id="recall-attribute" label="Captured attribute" value={attribute} onChange={setAttribute} disabled={!versionId || attributes.length === 0} options={attributes.map((item) => ({ value: item.attribute_code ?? item.id ?? "", label: `${item.attribute_code ?? item.id} · ${item.name ?? item.data_type ?? "value"}` }))} />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FieldInput id="recall-min" label="Minimum" type="number" value={min} onChange={setMin} placeholder="e.g. 2.5" />
        <FieldInput id="recall-max" label="Maximum" type="number" value={max} onChange={setMax} placeholder="e.g. 3.1" />
        <FieldInput id="recall-date-from" label="Date from (optional)" type="date" value={dateFrom} onChange={setDateFrom} />
        <FieldInput id="recall-date-to" label="Date to (optional)" type="date" value={dateTo} onChange={setDateTo} />
      </div>
      <div className="mt-4 flex flex-col gap-2 border-t border-border/70 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" /> Dates filter captured records, not document creation time.</div>
        <Button data-testid="button-submit-trace-recall" type="submit" className="gap-2"><Search className="h-4 w-4" /> Run recall</Button>
      </div>
    </form>
  );
}

function FieldSelect({ id, label, value, onChange, options, disabled }: { id: string; label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; disabled?: boolean }) {
  return (
    <div>
      <Label htmlFor={id} className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</Label>
      <select id={id} data-testid={`select-${id}`} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60">
        <option value="">Select…</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );
}

function FieldInput({ id, label, value, onChange, type = "text", placeholder }: { id: string; label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <Label htmlFor={id} className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</Label>
      <Input id={id} data-testid={`input-${id}`} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={`mt-1 h-10 ${type === "number" ? MONO : ""}`} />
    </div>
  );
}
