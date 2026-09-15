import { useState } from "react";
import AppLayout from "@/layouts/AppLayout";
import { ReportShell } from "../components/ReportShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, FileText, Table, FileSpreadsheet } from "lucide-react";

interface ExportConfig {
  id: string;
  name: string;
  description: string;
  endpoint: string;
}

const EXPORTS: ExportConfig[] = [
  { id: "executive", name: "Executive Dashboard", description: "All KPIs, quality metrics, inventory, and logistics summary", endpoint: "executive" },
  { id: "production", name: "Production Report", description: "Order throughput by day, week, month, operator, and stage", endpoint: "production" },
  { id: "cells", name: "Cell Analytics", description: "Grade distribution, supplier performance, lot yield, capacity and IR data", endpoint: "cells" },
  { id: "quality", name: "Quality Analytics", description: "Test pass rates, QC approvals, rework tickets, defect Pareto", endpoint: "quality" },
  { id: "inventory", name: "Inventory Analytics", description: "Cell stock, battery WIP, finished goods, lot utilization", endpoint: "inventory" },
  { id: "logistics", name: "Logistics Analytics", description: "Dispatch status, dealer performance, territory breakdown", endpoint: "logistics" },
  { id: "valuation", name: "Valuation Reports", description: "Value-on-hand layers and persisted material cost evidence", endpoint: "valuation/value-on-hand" },
];

type Format = "csv" | "json";

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function flattenToRows(obj: unknown, prefix = ""): Record<string, unknown>[] {
  if (Array.isArray(obj)) {
    return obj.flatMap(item => flattenToRows(item, prefix));
  }
  if (obj && typeof obj === "object") {
    const flat: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (Array.isArray(v)) {
        return v.flatMap(item => {
          const sub = flattenToRows(item, "");
          return sub.map(s => ({ ...flat, [`${key}`]: JSON.stringify(v), ...s }));
        });
      } else if (v && typeof v === "object") {
        Object.assign(flat, flattenToRows(v, key)[0]);
      } else {
        flat[key] = v;
      }
    }
    return [flat];
  }
  return [{ value: obj }];
}

function toCSV(data: unknown): string {
  const rows = flattenToRows(data);
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map(r => headers.map(h => {
      const v = r[h];
      const s = v == null ? "" : String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(","))
  ];
  return lines.join("\n");
}

export default function ExportCenterPage() {
  const [from, setFrom] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0]);
  const [to, setTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState<string | null>(null);

  const handleExport = async (config: ExportConfig, format: Format) => {
    const key = `${config.id}-${format}`;
    setLoading(key);
    try {
      const base = import.meta.env.BASE_URL;
      const url = new URL(`${base}api/reports/${config.endpoint}`, window.location.origin);
      if (config.endpoint === "production") {
        url.searchParams.set("from", from);
        url.searchParams.set("to", to);
      }
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const filename = `ocs-${config.id}-${timestamp}`;

      if (format === "json") {
        downloadBlob(JSON.stringify(data, null, 2), `${filename}.json`, "application/json");
      } else {
        downloadBlob(toCSV(data), `${filename}.csv`, "text/csv");
      }
    } catch (e) {
      console.error("Export failed", e);
    } finally {
      setLoading(null);
    }
  };

  return (
    <AppLayout>
      <ReportShell
        title="Export Center"
        subtitle="Download any report as CSV or JSON with your current date filters"
      >
        {/* Date range filter */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground font-medium">From (applies to Production report)</label>
                <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-9 w-40" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground font-medium">To</label>
                <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-9 w-40" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Export cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {EXPORTS.map(config => (
            <Card key={config.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <FileText size={16} />
                  {config.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-4">{config.description}</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    disabled={loading !== null}
                    onClick={() => void handleExport(config, "csv")}
                  >
                    {loading === `${config.id}-csv` ? (
                      <span className="animate-pulse">…</span>
                    ) : (
                      <><Table size={13} className="mr-1.5" /> CSV</>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    disabled={loading !== null}
                    onClick={() => void handleExport(config, "json")}
                  >
                    {loading === `${config.id}-json` ? (
                      <span className="animate-pulse">…</span>
                    ) : (
                      <><FileSpreadsheet size={13} className="mr-1.5" /> JSON</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-xs text-muted-foreground border rounded-md p-4 bg-muted/30">
          <p className="font-semibold mb-1 flex items-center gap-1.5"><Download size={12} /> Export notes</p>
          <ul className="space-y-1 list-disc list-inside">
            <li>All exports pull live data at time of download</li>
            <li>Date range filter applies to the Production report only</li>
            <li>CSV format flattens nested objects — use JSON for full fidelity</li>
            <li>Only Director and Supervisor roles can access report data</li>
          </ul>
        </div>
      </ReportShell>
    </AppLayout>
  );
}
