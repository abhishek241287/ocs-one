import { useState } from "react";
import { useRoute, Link } from "wouter";
import AppLayout from "@/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft, Loader2, Package, GitBranch, Info, ArrowRight,
} from "lucide-react";
import {
  useGetProduct,
  useUpdateProductStatus,
  getGetProductQueryKey,
  ProductStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/hooks/use-auth";
import { useOdsNotify } from "@/hooks/use-ods-notify";
import { OdsDialog } from "@/components/ods";
import ProductGenealogyView from "../components/ProductGenealogyView";

const STATUS_COLORS: Record<string, string> = {
  manufacturing: "bg-gray-100 text-gray-700",
  qc_passed: "bg-green-100 text-green-700",
  ready_for_packing: "bg-blue-100 text-blue-700",
  packed: "bg-indigo-100 text-indigo-700",
  dispatched: "bg-orange-100 text-orange-700",
  delivered_to_dealer: "bg-emerald-100 text-emerald-700",
};

// Forward-only lifecycle (mirrors backend ALLOWED_TRANSITIONS).
const NEXT_STATUS: Record<string, ProductStatus | null> = {
  manufacturing: "qc_passed",
  qc_passed: "ready_for_packing",
  ready_for_packing: "packed",
  packed: "dispatched",
  dispatched: "delivered_to_dealer",
  delivered_to_dealer: null,
};

export default function ProductDetailPage() {
  const [, params] = useRoute("/products/:id");
  const productId = params?.id ?? "";
  const queryClient = useQueryClient();
  const notify = useOdsNotify();
  const { user } = useAuth();

  const { data: product, isLoading } = useGetProduct(productId);
  const updateStatus = useUpdateProductStatus();

  const [advanceOpen, setAdvanceOpen] = useState(false);

  const canAdvance = user?.role === "director" || user?.role === "supervisor";

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </AppLayout>
    );
  }

  if (!product) {
    return (
      <AppLayout>
        <div className="p-6">
          <p className="text-gray-500">Product not found.</p>
        </div>
      </AppLayout>
    );
  }

  const nextStatus = NEXT_STATUS[product.product_status];

  const handleAdvance = async () => {
    if (!nextStatus) return;
    try {
      await updateStatus.mutateAsync({
        id: productId,
        data: { status: nextStatus },
      });
      queryClient.invalidateQueries({ queryKey: getGetProductQueryKey(productId) });
      notify.success("Status updated", {
        description: `Product advanced to ${nextStatus.replace(/_/g, " ")}`,
      });
      setAdvanceOpen(false);
    } catch (error: any) {
      notify.error("Update failed", { description: error?.message || "Could not update status" });
    }
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/products">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Products
            </Button>
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm font-mono text-gray-600">{product.official_product_serial}</span>
        </div>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <Package className="h-5 w-5 text-orange-600" />
                    {product.official_product_serial}
                  </h1>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[product.product_status] ?? ""}`}>
                    {product.product_status.replace(/_/g, " ")}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                    {product.serial_source} serial
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Category</p>
                    <p className="font-medium">{product.category_name ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Model</p>
                    <p className="font-medium">{product.model_name ?? product.model_code ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Workflow</p>
                    <p className="font-mono text-xs">{product.workflow_code}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Dealer</p>
                    <p className="font-medium">{product.dealer_name ?? "—"}</p>
                  </div>
                  {product.current_location && (
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Location</p>
                      <p className="font-medium">{product.current_location}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Created</p>
                    <p className="font-medium">{new Date(product.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-center gap-3">
                <QRCodeSVG value={product.official_product_serial} size={80} className="rounded border p-1" />
                {canAdvance && nextStatus && (
                  <Button size="sm" onClick={() => setAdvanceOpen(true)}>
                    <ArrowRight className="h-3.5 w-3.5 mr-1" />
                    Advance to {nextStatus.replace(/_/g, " ")}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="genealogy">
          <TabsList>
            <TabsTrigger value="genealogy" className="flex items-center gap-1.5">
              <GitBranch className="h-3.5 w-3.5" />
              Genealogy
            </TabsTrigger>
            <TabsTrigger value="details" className="flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5" />
              Details
            </TabsTrigger>
          </TabsList>

          <TabsContent value="genealogy" className="mt-4">
            <ProductGenealogyView productId={productId} />
          </TabsContent>

          <TabsContent value="details" className="mt-4">
            <Card>
              <CardContent className="p-5">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-gray-500">Official Serial</p>
                    <p className="font-mono font-medium">{product.official_product_serial}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Serial Source</p>
                    <p className="font-medium">{product.serial_source}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">QC Status</p>
                    <p className="font-medium">{product.qc_status ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Source Production Order</p>
                    <p className="font-mono text-xs">{product.source_production_order_id ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Last Updated</p>
                    <p className="font-medium">{new Date(product.updated_at).toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

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
      </div>
    </AppLayout>
  );
}
