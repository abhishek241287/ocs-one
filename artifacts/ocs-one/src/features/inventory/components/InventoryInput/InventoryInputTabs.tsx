import { useState } from "react";
import { Link } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { AlertTriangle, FileSpreadsheet, Keyboard, PencilLine } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import ManualCapturePanel from "./ManualCapturePanel";
import CsvCapturePanel from "./CsvCapturePanel";
import ScanCapturePanel from "./ScanCapturePanel";
import type { InventoryInputContext } from "./types";

type Props = InventoryInputContext & {
  onLineChange: (index: number, patch: Partial<InventoryInputContext["lines"][number]>) => void;
  onSubmitted?: (documentId: string) => void;
};

export default function InventoryInputTabs({
  onLineChange,
  onSubmitted,
  ...context
}: Props) {
  const [tab, setTab] = useState("manual");
  const { user, isLoading } = useAuth();
  const canSubmit = user?.role === "supervisor" || user?.role === "director" || user?.role === "owner";

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Universal inventory capture</h2>
          <p className="text-xs text-muted-foreground">
            Use a server-defined manual form, a staged CSV review, or a keyboard-wedge scan session.
          </p>
        </div>
        {!isLoading && !canSubmit && (
          <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Viewer access is read-only.
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid h-auto w-full grid-cols-3">
          <TabsTrigger value="manual" className="gap-2 py-2">
            <PencilLine className="h-4 w-4" /> Manual
          </TabsTrigger>
          <TabsTrigger value="csv" className="gap-2 py-2">
            <FileSpreadsheet className="h-4 w-4" /> CSV
          </TabsTrigger>
          <TabsTrigger value="scan" className="gap-2 py-2">
            <Keyboard className="h-4 w-4" /> Scan
          </TabsTrigger>
        </TabsList>

        <TabsContent value="manual" className="rounded-md border p-4">
          <ManualCapturePanel
            {...context}
            canSubmit={canSubmit}
            onLineChange={onLineChange}
            onSubmitted={onSubmitted}
          />
        </TabsContent>
        <TabsContent value="csv" className="rounded-md border p-4">
          <CsvCapturePanel {...context} canSubmit={canSubmit} onSubmitted={onSubmitted} />
        </TabsContent>
        <TabsContent value="scan" className="rounded-md border p-4">
          <ScanCapturePanel {...context} canSubmit={canSubmit} onSubmitted={onSubmitted} />
        </TabsContent>
      </Tabs>

      {!canSubmit && !isLoading && (
        <p className="text-xs text-muted-foreground">
          Need to submit a captured receipt? Ask a supervisor or director, or return to{" "}
          <Link href="/inventory/grns" className="underline">
            GRN list
          </Link>
          .
        </p>
      )}
    </section>
  );
}