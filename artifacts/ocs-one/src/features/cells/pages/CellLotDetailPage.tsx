import { useState } from "react";
import { Link, useRoute } from "wouter";
import {
  ArrowRightLeft,
  Beaker,
  ClipboardList,
  History,
  Package,
} from "lucide-react";
import {
  useGetCellLot,
  useGetCellLotHistory,
  useGetMaterialTransfer,
} from "@workspace/api-client-react";
import {
  CitationBadge,
  FeedEmpty,
  IdentityHeader,
  ObjectFieldGrid,
  ObjectLoading,
  ObjectPanel,
  ObjectPageTab,
  PageShell,
  TabStrip,
} from "@/components/object-page/ObjectPagePrimitives";
import { Button } from "@/components/ui/button";

const STATUS_COLORS: Record<string, string> = {
  received: "bg-blue-100 text-blue-700",
  grading: "bg-yellow-100 text-yellow-800",
  graded: "bg-green-100 text-green-700",
  complete: "bg-emerald-100 text-emerald-700",
};

const BASE_TABS: ObjectPageTab[] = [
  { id: "overview", label: "Overview", icon: ClipboardList },
  { id: "attributes", label: "Attributes", icon: Beaker },
  { id: "audit", label: "Audit", icon: History },
];

export default function CellLotDetailPage() {
  const [, params] = useRoute("/cells/lots/:id");
  const lotId = params?.id ?? "";
  const [activeTab, setActiveTab] = useState("overview");
  const { data: lot, isLoading } = useGetCellLot(lotId);
  const { data: history, isLoading: historyLoading } = useGetCellLotHistory(lotId);
  const { data: transfer, isLoading: transferLoading } = useGetMaterialTransfer(
    lot?.transferId ?? "",
    { query: { enabled: !!lot?.transferId } } as any,
  );

  if (isLoading) {
    return <PageShell backHref="/cells/receiving" backLabel="Cell receiving" eyebrow="Cell Lot" title="Loading"><ObjectLoading /></PageShell>;
  }

  if (!lot) {
    return (
      <PageShell backHref="/cells/receiving" backLabel="Cell receiving" eyebrow="Cell Lot" title="Not found">
        <ObjectPanel title="Cell lot not found">The requested lot does not exist or is no longer available.</ObjectPanel>
      </PageShell>
    );
  }

  const tabs = lot.transferId
    ? [{ id: "movements", label: "Movements", icon: ArrowRightLeft } as ObjectPageTab, ...BASE_TABS]
    : BASE_TABS;
  const stats = lot.stats ?? {};

  return (
    <PageShell backHref="/cells/receiving" backLabel="Cell receiving" eyebrow="Cell Lot" title={lot.lotNumber}>
      <IdentityHeader
        kind="Cell Lot"
        title={lot.lotNumber}
        subtitle={`${lot.cellModel} · ${lot.supplier}`}
        icon={Package}
        status={lot.status}
        statusClassName={STATUS_COLORS[lot.status]}
        metadata={[
          { label: "Supplier", value: lot.supplier },
          { label: "Cell model", value: lot.cellModel },
          { label: "Chemistry", value: lot.cellChemistry },
          { label: "Quantity received", value: lot.quantityReceived },
          { label: "Date received", value: lot.dateReceived },
          { label: "Received by", value: lot.receivedBy },
        ]}
      />

      <TabStrip tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "overview" && (
        <div className="space-y-4">
          <ObjectPanel title="Lot overview" description="The existing Cell Lot detail projection and live cell-status totals.">
            <ObjectFieldGrid
              fields={[
                { label: "Lot number", value: <span className="font-mono">{lot.lotNumber}</span> },
                { label: "Supplier lot", value: lot.supplierLotNumber ?? "—" },
                { label: "Manufacturer", value: lot.manufacturer },
                { label: "Nominal capacity", value: `${lot.nominalCapacityAh} Ah` },
                { label: "Invoice number", value: lot.invoiceNumber ?? "—" },
                { label: "Transfer", value: lot.transferId ? <span className="font-mono">{lot.transferId}</span> : "—" },
              ]}
            />
          </ObjectPanel>
          <ObjectPanel title="Cell status totals">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["Total", stats.total ?? 0],
                ["Received", stats.received ?? 0],
                ["Approved", stats.approved ?? 0],
                ["Rejected", stats.rejected ?? 0],
                ["Reserved", stats.reserved ?? 0],
                ["Allocated", stats.allocated ?? 0],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
                  <p className="mt-1 text-xl font-black">{value}</p>
                </div>
              ))}
            </div>
          </ObjectPanel>
        </div>
      )}

      {activeTab === "movements" && lot.transferId && (
        <ObjectPanel title="Cell-processing transfer" description="Existing transfer document that created this lot.">
          {transferLoading ? (
            <ObjectLoading />
          ) : !transfer ? (
            <FeedEmpty message="The source transfer document could not be loaded." />
          ) : (
            <div className="space-y-5">
              <ObjectFieldGrid
                fields={[
                  { label: "Transfer number", value: <Link href={`/cells/transfers/${transfer.id}`} className="font-mono text-primary hover:underline">{transfer.transfer_number}</Link> },
                  { label: "Movement", value: `${transfer.from_location} → ${transfer.to_location}` },
                  { label: "Material", value: transfer.material_name ?? transfer.material_code ?? transfer.material_id },
                  { label: "Quantity", value: `${transfer.quantity} ${transfer.uom}` },
                  { label: "GRN", value: transfer.grn_number ?? transfer.grn_id },
                  { label: "Operator", value: transfer.operator_name ?? transfer.transferred_by ?? "—" },
                ]}
              />
              {transfer.destination_audit && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 p-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Destination reconciliation</p>
                    <p className="text-sm font-semibold capitalize">{transfer.destination_audit.reconciliation_status.replace(/_/g, " ")}</p>
                  </div>
                  <CitationBadge citation={{ type: "transfer", id: transfer.id }} />
                </div>
              )}
              {transfer.consumed_by && transfer.consumed_by.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-bold">Downstream consumers</h3>
                  {transfer.consumed_by.map((consumer) => (
                    <div key={consumer.production_order_id} className="flex flex-wrap justify-between gap-2 border-b py-2 last:border-0">
                      <span className="text-sm">{consumer.order_number ?? consumer.production_order_id}</span>
                      <span className="text-xs text-muted-foreground">{consumer.cells_consumed} cells consumed</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </ObjectPanel>
      )}

      {activeTab === "attributes" && (
        <ObjectPanel title="Lot attributes" description="Attributes are read from the existing Cell Lot detail projection.">
          <ObjectFieldGrid
            columns={3}
            fields={[
              { label: "Supplier", value: lot.supplier },
              { label: "Manufacturer", value: lot.manufacturer },
              { label: "Cell model", value: lot.cellModel },
              { label: "Chemistry", value: lot.cellChemistry },
              { label: "Nominal capacity", value: `${lot.nominalCapacityAh} Ah` },
              { label: "Invoice number", value: lot.invoiceNumber ?? "—" },
              { label: "Supplier lot number", value: lot.supplierLotNumber ?? "—" },
              { label: "Remarks", value: lot.remarks ?? "—" },
              { label: "Cell master", value: lot.cellMasterId ?? "—" },
            ]}
          />
        </ObjectPanel>
      )}

      {activeTab === "audit" && (
        <ObjectPanel title="Lot audit" description="Append-only lot events from the existing history feed.">
          {historyLoading ? (
            <ObjectLoading />
          ) : !history?.events.length ? (
            <FeedEmpty message="No lot audit events are recorded." />
          ) : (
            <ol className="relative ml-2 space-y-5 border-l border-border">
              {history.events.map((event) => (
                <li key={event.id} className="relative ml-5">
                  <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" />
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold capitalize">{event.eventType.replace(/_/g, " ")}</p>
                      <p className="text-xs text-muted-foreground">{event.performedBy}{event.reason ? ` · ${event.reason}` : ""}</p>
                    </div>
                    <time className="text-xs text-muted-foreground">{new Date(event.performedAt).toLocaleString()}</time>
                  </div>
                  {event.changes && (
                    <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-xs">{JSON.stringify(event.changes, null, 2)}</pre>
                  )}
                </li>
              ))}
            </ol>
          )}
        </ObjectPanel>
      )}
    </PageShell>
  );
}