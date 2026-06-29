import { Link } from "wouter";
import AppLayout from "@/layouts/AppLayout";
import { ModuleHeader } from "@/components/ods";
import { Card, CardContent } from "@/components/ui/card";
import { useGetProductInventorySummary } from "@workspace/api-client-react";
import {
  Package,
  CheckCircle2,
  Boxes,
  Truck,
  Store,
  ShieldAlert,
  PackageCheck,
  ArrowRight,
} from "lucide-react";

type SummaryCard = {
  key: string;
  label: string;
  value: number;
  icon: typeof Package;
  tone: string;
  status?: string;
};

export default function ProductInventoryDashboardPage() {
  const { data, isLoading } = useGetProductInventorySummary();

  const s = data;

  const summaryCards: SummaryCard[] = [
    { key: "total", label: "Total Products", value: s?.total ?? 0, icon: Package, tone: "text-slate-600 bg-slate-100" },
    { key: "available", label: "Available", value: s?.available ?? 0, icon: CheckCircle2, tone: "text-green-600 bg-green-100", status: "qc_passed" },
    { key: "packed", label: "Packed", value: s?.packed ?? 0, icon: Boxes, tone: "text-indigo-600 bg-indigo-100", status: "packed" },
    { key: "dispatched", label: "Dispatched", value: s?.dispatched ?? 0, icon: Truck, tone: "text-orange-600 bg-orange-100", status: "dispatched" },
    { key: "dealer_stock", label: "Dealer Stock", value: s?.dealer_stock ?? 0, icon: Store, tone: "text-emerald-600 bg-emerald-100", status: "dispatched" },
    { key: "quarantined", label: "Quarantined", value: s?.quarantined ?? 0, icon: ShieldAlert, tone: "text-rose-600 bg-rose-100" },
  ];

  const stageCards = [
    { key: "ready_for_packing", label: "Ready for Packing", value: s?.ready_for_packing ?? 0, icon: PackageCheck, status: "ready_for_packing", desc: "Products awaiting packing" },
    { key: "packed", label: "Packed", value: s?.packed ?? 0, icon: Boxes, status: "packed", desc: "Packed, ready for dispatch" },
    { key: "dispatched", label: "Dispatched", value: s?.dispatched ?? 0, icon: Truck, status: "dispatched", desc: "In transit to dealers" },
    { key: "dealer_inventory", label: "Dealer Inventory", value: s?.dealer_stock ?? 0, icon: Store, status: "dispatched", desc: "Dispatched to dealers" },
  ];

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <ModuleHeader
          icon="📊"
          title="Product Inventory"
          description="Read-only inventory view projected from the Product Platform"
          certification="certified"
        />

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {summaryCards.map((c) => {
            const Icon = c.icon;
            const inner = (
              <Card className="hover:shadow-md transition-shadow h-full">
                <CardContent className="p-4 flex flex-col gap-2">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${c.tone}`}>
                    <Icon size={18} />
                  </div>
                  <div className="text-2xl font-bold tabular-nums">
                    {isLoading ? "—" : c.value.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">{c.label}</div>
                </CardContent>
              </Card>
            );
            return c.status ? (
              <Link key={c.key} href={`/product-inventory/list?status=${c.status}`}>
                <span className="cursor-pointer">{inner}</span>
              </Link>
            ) : (
              <div key={c.key}>{inner}</div>
            );
          })}
        </div>

        {/* Stage dashboard cards */}
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Distribution Pipeline
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {stageCards.map((c) => {
              const Icon = c.icon;
              return (
                <Link key={c.key} href={`/product-inventory/list?status=${c.status}`}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer group h-full">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between">
                        <div className="flex flex-col gap-1">
                          <div className="text-3xl font-bold tabular-nums">
                            {isLoading ? "—" : c.value.toLocaleString()}
                          </div>
                          <div className="text-sm font-medium">{c.label}</div>
                          <div className="text-xs text-muted-foreground">{c.desc}</div>
                        </div>
                        <div className="text-muted-foreground">
                          <Icon size={22} />
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-1 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                        View products <ArrowRight size={12} />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>

        {/* By category */}
        {s?.by_category && s.by_category.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              By Product Category
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {s.by_category.map((cat) => (
                <Link
                  key={cat.category_id ?? cat.category_name}
                  href={cat.category_id ? `/product-inventory/list?category_id=${cat.category_id}` : "/product-inventory/list"}
                >
                  <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                    <CardContent className="p-4 flex items-center justify-between">
                      <span className="text-sm font-medium">{cat.category_name}</span>
                      <span className="text-xl font-bold tabular-nums">{cat.count.toLocaleString()}</span>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
