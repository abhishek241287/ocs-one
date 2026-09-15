import { useState } from "react";
import { useRoute } from "wouter";
import {
  Calendar,
  Clock,
  Factory,
  GitBranch,
  Layers,
  PackageOpen,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useGetProductionOrder } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import StageStepper, { STAGE_SEQUENCE } from "../components/StageStepper";
import StageCard from "../components/StageCard";
import TimelineView from "../components/TimelineView";
import MaterialIssuePanel from "../components/MaterialIssuePanel";
import ObjectOrderGenealogyView from "../components/ObjectOrderGenealogyView";
import {
  IdentityHeader,
  ObjectFieldGrid,
  ObjectLoading,
  ObjectPanel,
  ObjectPageTab,
  PageShell,
  TabStrip,
  getTraceabilityHref,
} from "@/components/object-page/ObjectPagePrimitives";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  released: "bg-blue-100 text-blue-700",
  in_progress: "bg-yellow-100 text-yellow-800",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

const TABS: ObjectPageTab[] = [
  { id: "overview", label: "Overview", icon: Layers },
  { id: "movements", label: "Movements", icon: PackageOpen },
  { id: "genealogy", label: "Genealogy", icon: GitBranch },
  { id: "audit", label: "Audit", icon: Clock },
];

export default function OrderDetailPage() {
  const [, params] = useRoute("/manufacturing/orders/:id");
  const orderId = params?.id ?? "";
  const { data: order, isLoading, refetch } = useGetProductionOrder(orderId);
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedStage, setSelectedStage] = useState<string | null>(null);

  if (isLoading) {
    return <PageShell backHref="/manufacturing/orders" backLabel="Orders" eyebrow="Production Order" title="Loading"><ObjectLoading /></PageShell>;
  }

  if (!order) {
    return (
      <PageShell backHref="/manufacturing/orders" backLabel="Orders" eyebrow="Production Order" title="Not found">
        <ObjectPanel title="Production order not found">The requested production order does not exist or is no longer available.</ObjectPanel>
      </PageShell>
    );
  }

  const stages = order.stages ?? [];
  const activeStageKey = order.currentStage ?? stages[0]?.stageType ?? null;
  const displayStageKey = selectedStage ?? activeStageKey;
  const displayStage = stages.find((stage) => stage.stageType === displayStageKey);

  return (
    <PageShell backHref="/manufacturing/orders" backLabel="Orders" eyebrow="Production Order" title={order.orderNumber}>
      <IdentityHeader
        kind="Production Order"
        title={order.orderNumber}
        subtitle={order.productName ?? order.productSku ?? "Product identity unavailable"}
        icon={Factory}
        status={order.status}
        statusClassName={STATUS_COLORS[order.status]}
        traceHref={getTraceabilityHref("upstream", { production_order_id: orderId })}
        metadata={[
          { label: "Battery", value: <span className="font-mono">{order.batteryNumber}</span> },
          { label: "Current stage", value: order.currentStage?.replace(/_/g, " ") ?? "Not started" },
          { label: "Priority", value: `${order.priority} priority` },
          { label: "Factory manager", value: order.factoryManager },
          { label: "Planned start", value: order.plannedStartDate ?? "—" },
          { label: "Planned end", value: order.plannedEndDate ?? "—" },
        ]}
      />

      <TabStrip tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "overview" && (
        <div className="space-y-4">
          <ObjectPanel
            title="Production progress"
            description="The runtime sequence remains the certified nine-stage order."
          >
            <StageStepper
              stages={stages}
              activeStage={displayStageKey}
              onSelectStage={(key) => setSelectedStage(key)}
            />
          </ObjectPanel>
          <ObjectPanel title="Active stage" description={displayStage ? "Existing stage workspace embedded in the object page." : undefined}>
            {displayStage ? (
              <StageCard stage={displayStage} orderId={orderId} onRefresh={refetch} />
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">No stage selected.</p>
            )}
          </ObjectPanel>
          <ObjectPanel title="Order overview">
            <ObjectFieldGrid
              fields={[
                { label: "Order number", value: <span className="font-mono">{order.orderNumber}</span> },
                { label: "Battery number", value: <span className="font-mono">{order.batteryNumber}</span> },
                { label: "Model", value: order.productName ?? "—" },
                { label: "SKU", value: order.productSku ?? "—" },
                { label: "Notes", value: order.notes ?? "—" },
                { label: "Created", value: new Date(order.createdAt).toLocaleString() },
              ]}
            />
          </ObjectPanel>
        </div>
      )}

      {activeTab === "movements" && (
        <ObjectPanel title="Material movements" description="Existing material issue notes and their current line state.">
          <MaterialIssuePanel orderId={orderId} onRefresh={refetch} />
        </ObjectPanel>
      )}

      {activeTab === "genealogy" && <ObjectOrderGenealogyView orderId={orderId} />}

      {activeTab === "audit" && (
        <ObjectPanel title="Audit timeline" description="Immutable order and stage events from the existing timeline feed.">
          <TimelineView orderId={orderId} />
        </ObjectPanel>
      )}
    </PageShell>
  );
}