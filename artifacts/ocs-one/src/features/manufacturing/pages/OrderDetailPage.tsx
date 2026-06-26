import { useState } from "react";
import { useRoute, Link } from "wouter";
import AppLayout from "@/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Loader2,
  Factory,
  Calendar,
  User,
  QrCode,
  Clock,
  GitBranch,
  Layers,
} from "lucide-react";
import { useGetProductionOrder } from "@workspace/api-client-react";
import { QRCodeSVG } from "qrcode.react";
import StageStepper, { STAGE_SEQUENCE } from "../components/StageStepper";
import StageCard from "../components/StageCard";
import TimelineView from "../components/TimelineView";
import GenealogyView from "../components/GenealogyView";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  released: "bg-blue-100 text-blue-700",
  in_progress: "bg-yellow-100 text-yellow-800",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-orange-100 text-orange-700",
  high: "bg-red-100 text-red-700",
};

export default function OrderDetailPage() {
  const [, params] = useRoute("/manufacturing/orders/:id");
  const orderId = params?.id ?? "";

  const { data: order, isLoading, refetch } = useGetProductionOrder(orderId);

  const stages = (order as any)?.stages ?? [];
  const activeStageKey = order?.currentStage ?? stages[0]?.stageType ?? null;

  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const displayStageKey = selectedStage ?? activeStageKey;
  const displayStage = stages.find((s: any) => s.stageType === displayStageKey);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </AppLayout>
    );
  }

  if (!order) {
    return (
      <AppLayout>
        <div className="p-6">
          <p className="text-gray-500">Production order not found.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Back + breadcrumb */}
        <div className="flex items-center gap-3">
          <Link href="/manufacturing/orders">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Orders
            </Button>
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm font-mono text-gray-600">{order.orderNumber}</span>
        </div>

        {/* Hero Card */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <Factory className="h-5 w-5 text-orange-600" />
                    {order.orderNumber}
                  </h1>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[order.status] ?? ""}`}>
                    {order.status.replace(/_/g, " ")}
                  </span>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[order.priority] ?? ""}`}>
                    {order.priority} priority
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Battery #</p>
                    <p className="font-mono font-medium text-orange-700">{order.batteryNumber}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5 flex items-center gap-1"><User className="h-3 w-3" /> Factory Manager</p>
                    <p className="font-medium">{order.factoryManager}</p>
                  </div>
                  {order.plannedStartDate && (
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5 flex items-center gap-1"><Calendar className="h-3 w-3" /> Planned Start</p>
                      <p>{order.plannedStartDate}</p>
                    </div>
                  )}
                  {order.plannedEndDate && (
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5 flex items-center gap-1"><Calendar className="h-3 w-3" /> Planned End</p>
                      <p>{order.plannedEndDate}</p>
                    </div>
                  )}
                </div>
                {order.notes && (
                  <p className="text-sm text-gray-500 bg-gray-50 rounded p-2">{order.notes}</p>
                )}
              </div>
              <div className="flex-shrink-0">
                <QRCodeSVG
                  value={order.batteryNumber}
                  size={80}
                  className="rounded border p-1"
                />
                <p className="text-[10px] text-center text-gray-400 mt-1">Scan to trace</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stage Stepper */}
        <Card>
          <CardContent className="p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Production Progress</h2>
            <StageStepper
              stages={stages}
              activeStage={displayStageKey}
              onSelectStage={(key) => setSelectedStage(key)}
            />
          </CardContent>
        </Card>

        {/* Main Tabs */}
        <Tabs defaultValue="stages">
          <TabsList>
            <TabsTrigger value="stages" className="flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" />
              Active Stage
            </TabsTrigger>
            <TabsTrigger value="timeline" className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Timeline
            </TabsTrigger>
            <TabsTrigger value="genealogy" className="flex items-center gap-1.5">
              <GitBranch className="h-3.5 w-3.5" />
              Genealogy
            </TabsTrigger>
            <TabsTrigger value="passport" className="flex items-center gap-1.5">
              <QrCode className="h-3.5 w-3.5" />
              Digital Passport
            </TabsTrigger>
          </TabsList>

          <TabsContent value="stages" className="mt-4">
            {displayStage ? (
              <StageCard
                key={displayStage.id}
                orderId={orderId}
                stage={displayStage}
                onRefresh={refetch}
              />
            ) : (
              <p className="text-gray-400 text-sm py-8 text-center">No stage selected</p>
            )}
          </TabsContent>

          <TabsContent value="timeline" className="mt-4">
            <TimelineView orderId={orderId} />
          </TabsContent>

          <TabsContent value="genealogy" className="mt-4">
            <GenealogyView orderId={orderId} />
          </TabsContent>

          <TabsContent value="passport" className="mt-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex gap-8 items-start flex-wrap">
                  <div>
                    <QRCodeSVG value={order.batteryNumber} size={160} />
                    <p className="text-xs text-center text-gray-500 mt-2">Scan to identify battery</p>
                  </div>
                  <div className="space-y-4 flex-1">
                    <h3 className="font-bold text-gray-900">Battery Digital Passport</h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-gray-500">Battery Number</p>
                        <p className="font-mono font-bold text-orange-700 text-lg">{order.batteryNumber}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Production Order</p>
                        <p className="font-mono font-medium">{order.orderNumber}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Manufacturer</p>
                        <p className="font-medium">OCS Oorja Green Pvt. Ltd.</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Factory Manager</p>
                        <p className="font-medium">{order.factoryManager}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Status</p>
                        <p className="font-medium capitalize">{order.status.replace(/_/g, " ")}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Current Stage</p>
                        <p className="font-medium capitalize">
                          {order.currentStage?.replace(/_/g, " ") ?? "Not started"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Created</p>
                        <p className="font-medium">{new Date(order.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Stages Complete</p>
                        <p className="font-medium">
                          {stages.filter((s: any) => s.status === "approved").length} / {STAGE_SEQUENCE.length}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
