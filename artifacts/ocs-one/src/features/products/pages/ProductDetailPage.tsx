import { useState } from "react";
import { useRoute } from "wouter";
import {
  Activity,
  ArrowRight,
  FileText,
  GitBranch,
  Info,
  Package,
  QrCode,
  Route,
} from "lucide-react";
import {
  getGetProductQueryKey,
  ProductStatus,
  useGetProduct,
  useUpdateProductStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/hooks/use-auth";
import { useOdsNotify } from "@/hooks/use-ods-notify";
import { OdsDialog } from "@/components/ods";
import { Button } from "@/components/ui/button";
import ProductEventsView from "../components/ProductEventsView";
import ProductTraceabilityView from "../components/ProductTraceabilityView";
import ObjectProductGenealogyView from "../components/ObjectProductGenealogyView";
import {
  IdentityHeader,
  ObjectFieldGrid,
  ObjectLoading,
  ObjectPanel,
  ObjectPageTab,
  PageShell,
  TabStrip,
} from "@/components/object-page/ObjectPagePrimitives";

const STATUS_COLORS: Record<string, string> = {
  manufacturing: "bg-gray-100 text-gray-700",
  qc_passed: "bg-green-100 text-green-700",
  ready_for_packing: "bg-blue-100 text-blue-700",
  packed: "bg-indigo-100 text-indigo-700",
  dispatched: "bg-orange-100 text-orange-700",
  delivered_to_dealer: "bg-emerald-100 text-emerald-700",
};

const NEXT_STATUS: Record<string, ProductStatus | null> = {
  manufacturing: "qc_passed",
  qc_passed: "ready_for_packing",
  ready_for_packing: "packed",
  packed: "dispatched",
  dispatched: "delivered_to_dealer",
  delivered_to_dealer: null,
};

const TABS: ObjectPageTab[] = [
  { id: "overview", label: "Overview", icon: Route },
  { id: "genealogy", label: "Genealogy", icon: GitBranch },
  { id: "attributes", label: "Attributes", icon: Info },
  { id: "audit", label: "Audit", icon: FileText },
];

export default function ProductDetailPage() {
  const [, params] = useRoute("/products/:id");
  const productId = params?.id ?? "";
  const queryClient = useQueryClient();
  const notify = useOdsNotify();
  const { user } = useAuth();
  const { data: product, isLoading } = useGetProduct(productId);
  const updateStatus = useUpdateProductStatus();
  const [activeTab, setActiveTab] = useState("overview");
  const [advanceOpen, setAdvanceOpen] = useState(false);

  if (isLoading) {
    return <PageShell backHref="/products" backLabel="Products" eyebrow="Serialized Product" title="Loading"><ObjectLoading /></PageShell>;
  }

  if (!product) {
    return (
      <PageShell backHref="/products" backLabel="Products" eyebrow="Serialized Product" title="Not found">
        <ObjectPanel title="Product not found">The requested serialized Product does not exist or is no longer available.</ObjectPanel>
      </PageShell>
    );
  }

  const nextStatus = NEXT_STATUS[product.product_status];
  const canAdvance = user?.role === "director" || user?.role === "supervisor";

  const handleAdvance = async () => {
    if (!nextStatus) return;
    try {
      await updateStatus.mutateAsync({ id: productId, data: { status: nextStatus } });
      queryClient.invalidateQueries({ queryKey: getGetProductQueryKey(productId) });
      notify.success("Status updated", { description: `Product advanced to ${nextStatus.replace(/_/g, " ")}` });
      setAdvanceOpen(false);
    } catch (error: any) {
      notify.error("Update failed", { description: error?.message || "Could not update status" });
    }
  };

  return (
    <PageShell backHref="/products" backLabel="Products" eyebrow="Serialized Product" title={product.official_product_serial}>
      <IdentityHeader
        kind="Product"
        title={product.official_product_serial}
        subtitle={`${product.model_name ?? product.model_code ?? "Model unavailable"} · ${product.category_name ?? "Category unavailable"}`}
        icon={Package}
        status={product.product_status}
        statusClassName={STATUS_COLORS[product.product_status]}
        traceHref={`/traceability?mode=composition&product_id=${encodeURIComponent(productId)}`}
        actions={canAdvance && nextStatus ? (
          <Button size="sm" onClick={() => setAdvanceOpen(true)} className="gap-1.5">
            <ArrowRight className="h-4 w-4" />
            Advance
          </Button>
        ) : null}
        metadata={[
          { label: "Serial source", value: `${product.serial_source} serial` },
          { label: "Category", value: product.category_name ?? "—" },
          { label: "Model", value: product.model_name ?? product.model_code ?? "—" },
          { label: "Workflow", value: <span className="font-mono">{product.workflow_code}</span> },
          { label: "Dealer", value: product.dealer_name ?? "—" },
          { label: "Location", value: product.current_location ?? "—" },
        ]}
      />

      <TabStrip tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "overview" && (
        <div className="space-y-4">
          <ObjectPanel title="360° traceability" description="Existing read-only lifecycle aggregation for the serialized unit.">
            <ProductTraceabilityView productId={productId} />
          </ObjectPanel>
          <ObjectPanel title="Digital identity">
            <div className="flex flex-wrap items-start gap-6">
              <div className="rounded-lg border bg-white p-3">
                <QRCodeSVG value={product.official_product_serial} size={132} />
                <p className="mt-2 text-center text-[10px] text-muted-foreground">Scan to trace</p>
              </div>
              <ObjectFieldGrid
                fields={[
                  { label: "Official serial", value: <span className="font-mono">{product.official_product_serial}</span> },
                  { label: "QC status", value: product.qc_status ?? "—" },
                  { label: "Source production order", value: <span className="font-mono">{product.source_production_order_id ?? "—"}</span> },
                  { label: "Manufactured", value: new Date(product.manufacturing_completed_at).toLocaleString() },
                  { label: "Record created", value: new Date(product.created_at).toLocaleString() },
                  { label: "Last updated", value: new Date(product.updated_at).toLocaleString() },
                ]}
              />
            </div>
          </ObjectPanel>
        </div>
      )}

      {activeTab === "genealogy" && <ObjectProductGenealogyView productId={productId} />}

      {activeTab === "attributes" && (
        <ObjectPanel title="Product attributes" description="Attributes are read from the existing Product detail projection.">
          <ObjectFieldGrid
            fields={[
              { label: "Official serial", value: product.official_product_serial },
              { label: "Serial source", value: product.serial_source },
              { label: "Category", value: product.category_name ?? product.category_id },
              { label: "Model", value: product.model_name ?? product.model_code },
              { label: "Workflow", value: product.workflow_code },
              { label: "QC status", value: product.qc_status ?? "—" },
              { label: "Dealer", value: product.dealer_name ?? "—" },
              { label: "Current location", value: product.current_location ?? "—" },
            ]}
            columns={4}
          />
        </ObjectPanel>
      )}

      {activeTab === "audit" && (
        <ObjectPanel title="Audit timeline" description="Lifecycle events from the existing Product events feed.">
          <ProductEventsView productId={productId} />
        </ObjectPanel>
      )}

      <OdsDialog
        open={advanceOpen}
        onClose={() => setAdvanceOpen(false)}
        onConfirm={handleAdvance}
        title={`Advance to ${nextStatus?.replace(/_/g, " ") ?? ""}`}
        description="Move this product forward in its lifecycle. This action is recorded."
        variant="confirm"
        confirmLabel="Advance"
        loading={updateStatus.isPending}
      />
    </PageShell>
  );
}