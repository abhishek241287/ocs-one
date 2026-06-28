import { useMemo } from "react";
import AppLayout from "@/layouts/AppLayout";
import {
  useGetInspection,
  useListMaterialMasters,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Loader2 } from "lucide-react";
import { Link, useParams } from "wouter";

const RESULT_COLOR: Record<string, string> = {
  passed: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-600",
  partial: "bg-orange-100 text-orange-700",
};

export default function InspectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const inspectionId = id ?? "";

  const { data: inspection, isLoading } = useGetInspection(inspectionId);
  const { data: materials } = useListMaterialMasters({ pageSize: 500 } as any);

  const materialById = useMemo(() => {
    const map = new Map<string, any>();
    for (const m of (materials?.items ?? []) as any[]) map.set(m.id, m);
    return map;
  }, [materials]);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!inspection) {
    return (
      <AppLayout>
        <div className="p-6 text-muted-foreground">Inspection not found.</div>
      </AppLayout>
    );
  }

  const lines = (inspection.lines ?? []) as any[];

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/inventory/inspections">
            <Button variant="ghost" size="sm" className="gap-1">
              <ChevronLeft className="h-4 w-4" />Inspections
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold font-mono">{inspection.inspection_number}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              GRN: <strong className="font-mono">{inspection.grn_number ?? inspection.grn_id}</strong>{" "}
              · Inspected {new Date(inspection.created_at).toLocaleString()}
            </p>
          </div>
        </div>

        {inspection.remarks && (
          <Card>
            <CardContent className="pt-4 pb-4 text-sm text-muted-foreground">
              {inspection.remarks}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Inspected Lines ({lines.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Material</th>
                  <th className="px-4 py-3 font-semibold text-right">Received</th>
                  <th className="px-4 py-3 font-semibold text-right">Accepted</th>
                  <th className="px-4 py-3 font-semibold text-right">Rejected</th>
                  <th className="px-4 py-3 font-semibold">Result</th>
                  <th className="px-4 py-3 font-semibold">Rejection Reason</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const mat = materialById.get(line.material_id);
                  return (
                    <tr key={line.id} className="border-b last:border-0">
                      <td className="px-4 py-3">
                        {mat ? `${mat.name} (${mat.code})` : line.material_id}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{line.quantity_received}</td>
                      <td className="px-4 py-3 text-right font-mono text-green-700">
                        {line.accepted_qty}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-red-600">
                        {line.rejected_qty}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${RESULT_COLOR[line.result] ?? "bg-gray-100 text-gray-600"}`}
                        >
                          {String(line.result).replace(/\b\w/g, (l: string) => l.toUpperCase())}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {line.rejection_reason ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
