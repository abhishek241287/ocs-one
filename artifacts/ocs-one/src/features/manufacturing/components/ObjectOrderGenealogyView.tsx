import { useGetGenealogyUpstream } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";
import { CitationBadge, FeedEmpty, ObjectPanel, getTraceabilityHref, TraceAction } from "@/components/object-page/ObjectPagePrimitives";

export default function ObjectOrderGenealogyView({ orderId }: { orderId: string }) {
  const { data, isLoading, error } = useGetGenealogyUpstream({ production_order_id: orderId });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (error || !data) {
    return <FeedEmpty message="The verified upstream genealogy feed could not be loaded." />;
  }
  if (data.inputs.length === 0) {
    return <FeedEmpty message="No cited material inputs are recorded for this production order." />;
  }

  return (
    <div className="space-y-4">
      {data.inputs.map((input) => (
        <ObjectPanel
          key={`${input.material_id}-${input.issue.note_id}`}
          title={`${input.material_code} · ${input.quantity_issued} ${input.uom}`}
          description="Material input edges are shown with their source documents."
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 p-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Issue note</p>
                <p className="font-mono text-sm font-semibold">{input.issue.note_number}</p>
              </div>
              <CitationBadge citation={input.issue.document_cited} />
            </div>
            {input.allocations.map((allocation) => (
              <div key={allocation.allocation_id} className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{allocation.lot_number}</p>
                  <p className="text-xs text-muted-foreground">
                    {allocation.supplier_name} · {allocation.quantity} issued · GRN {allocation.grn_number}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <CitationBadge citation={allocation.document_cited} />
                  <TraceAction href={getTraceabilityHref("downstream", { lot_id: allocation.lot_id })} />
                </div>
              </div>
            ))}
            {input.attributes.map((attribute) => (
              <div key={`${attribute.attribute_code}-${attribute.document_cited.id}`} className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-0 last:pb-0">
                <span className="text-sm">{attribute.attribute_code}: {String(attribute.value ?? "—")} {attribute.unit ?? ""}</span>
                <CitationBadge citation={attribute.document_cited} />
              </div>
            ))}
            {input.bulk_issue && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm">Bulk issue {input.bulk_issue.batch_id}</span>
                <CitationBadge citation={input.bulk_issue.document_cited} />
              </div>
            )}
          </div>
        </ObjectPanel>
      ))}
    </div>
  );
}