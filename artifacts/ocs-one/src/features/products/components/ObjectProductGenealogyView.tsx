import { useGetGenealogyComposition } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";
import { CitationBadge, FeedEmpty, ObjectPanel, getTraceabilityHref, TraceAction } from "@/components/object-page/ObjectPagePrimitives";

export default function ObjectProductGenealogyView({ productId }: { productId: string }) {
  const { data, isLoading, error } = useGetGenealogyComposition(
    { product_id: productId },
    { query: { enabled: !!productId } } as any,
  );

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (error || !data) {
    return <FeedEmpty message="The verified product composition feed could not be loaded." />;
  }

  return (
    <div className="space-y-4">
      <ObjectPanel title="Product edge" description="The serialized unit is linked to its production order by a cited document.">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-sm font-semibold">{data.product.serial_number ?? data.product.product_id}</p>
            <p className="text-xs text-muted-foreground">Order {data.order.number}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <CitationBadge citation={data.product.document_cited} />
            <CitationBadge citation={data.order.document_cited} />
          </div>
        </div>
      </ObjectPanel>
      <ObjectPanel title="Consumed lots" description="Every downstream material edge carries its document citation.">
        {data.consumed_lots.length === 0 ? (
          <FeedEmpty message="No consumed lots are recorded." />
        ) : (
          <div className="divide-y">
            {data.consumed_lots.map((lot) => (
                <div key={lot.lot_id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="font-mono text-sm font-semibold">{lot.lot_number}</p>
                  <p className="text-xs text-muted-foreground">{lot.quantity} units · material {lot.material_id}</p>
                </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CitationBadge citation={lot.document_cited} />
                    <TraceAction href={getTraceabilityHref("downstream", { lot_id: lot.lot_id })} />
                  </div>
              </div>
            ))}
          </div>
        )}
      </ObjectPanel>
      {data.cell_genealogy.length > 0 && (
        <ObjectPanel title="Cell genealogy" description="Cell provenance remains tied to its transfer and GRN documents.">
          <div className="divide-y">
            {data.cell_genealogy.map((edge, index) => (
              <div key={`${edge.cell_lot_id}-${edge.transfer_id}-${edge.grn_line_id}-${index}`} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="font-mono text-sm font-semibold">{edge.cell_lot_id}</p>
                  <p className="text-xs text-muted-foreground">Transfer {edge.transfer_id} · GRN line {edge.grn_line_id}</p>
                </div>
                <CitationBadge citation={edge.document_cited} />
              </div>
            ))}
          </div>
        </ObjectPanel>
      )}
    </div>
  );
}