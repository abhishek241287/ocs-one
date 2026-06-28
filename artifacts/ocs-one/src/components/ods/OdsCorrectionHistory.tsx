import { cn } from "@/lib/utils";

// ─── OdsCorrectionHistory — reusable Engineering Correction Framework (ECF) view ─
// Renders the append-only correction genealogy for ANY entity (cell, battery,
// shipment, QC record, …). It is intentionally module-agnostic: a module maps its
// ECF ledger rows to `OdsCorrectionEntry[]` and passes them in. Cell Grading is the
// reference implementation. Each entry shows the engineering version, the unique
// Correction ID, who performed it, the reason, and the changed field values —
// with the previous → new value diff highlighted for corrections.

export interface OdsCorrectionField {
  label: string;
  /** Value before the change (omit/undefined for the original baseline). */
  previous?: string | number | null;
  /** Value after the change (the value recorded in this version). */
  value: string | number | null | undefined;
}

export interface OdsCorrectionEntry {
  id: string;
  /** Engineering version (1 = original, then incrementing). */
  version: number;
  type: "original" | "correction";
  /** Globally-unique Correction ID (CORR-YYYYMMDD-NNNNNN). */
  correctionId: string;
  performedBy: string;
  /** Mandatory for corrections; null/undefined for the original. */
  reason?: string | null;
  timestamp?: string | Date;
  /** A short status/grade chip (e.g. resulting grade or status). */
  status?: string;
  /** The recorded field values for this version (with optional diff). */
  fields: OdsCorrectionField[];
}

export interface OdsCorrectionHistoryProps {
  entries: OdsCorrectionEntry[];
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

function formatTimestamp(ts: string | Date): string {
  const d = typeof ts === "string" ? new Date(ts) : ts;
  if (isNaN(d.getTime())) return String(ts);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function HistorySkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {[1, 2].map((i) => (
        <div key={i} className="rounded-lg border border-slate-200 p-3 space-y-2">
          <div className="h-3.5 w-40 rounded bg-slate-200" />
          <div className="h-3 w-56 rounded bg-slate-100" />
          <div className="h-3 w-32 rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

export function OdsCorrectionHistory({
  entries,
  isLoading = false,
  emptyTitle = "No history yet",
  emptyDescription = "Records will appear here once captured.",
  className,
}: OdsCorrectionHistoryProps) {
  if (isLoading) return <HistorySkeleton />;

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="text-3xl mb-2">🧬</div>
        <p className="text-sm font-medium text-slate-600">{emptyTitle}</p>
        {emptyDescription && (
          <p className="text-xs text-slate-400 mt-1">{emptyDescription}</p>
        )}
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {entries.map((entry) => {
        const isOriginal = entry.type === "original";
        return (
          <div
            key={entry.id}
            className={cn(
              "rounded-lg border px-3 py-2.5",
              isOriginal ? "border-slate-200 bg-slate-50" : "border-amber-200 bg-amber-50/60",
            )}
          >
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={cn(
                    "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold",
                    isOriginal ? "bg-slate-200 text-slate-700" : "bg-amber-200 text-amber-900",
                  )}
                >
                  v{entry.version} · {isOriginal ? "Original" : "Correction"}
                </span>
                <span className="font-mono text-[11px] text-slate-500">{entry.correctionId}</span>
                {entry.status && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-white border border-slate-200 text-slate-600">
                    {entry.status}
                  </span>
                )}
              </div>
              {entry.timestamp && (
                <span className="text-[11px] text-slate-400">{formatTimestamp(entry.timestamp)}</span>
              )}
            </div>

            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
              {entry.fields.map((f) => {
                const changed =
                  f.previous !== undefined &&
                  f.previous !== null &&
                  String(f.previous) !== String(f.value);
                return (
                  <div key={f.label} className="text-[11px] leading-tight">
                    <span className="text-slate-400">{f.label}: </span>
                    {changed ? (
                      <span>
                        <span className="text-slate-400 line-through">{String(f.previous)}</span>{" "}
                        <span className="font-medium text-amber-800">{String(f.value ?? "—")}</span>
                      </span>
                    ) : (
                      <span className="font-medium text-slate-700">{String(f.value ?? "—")}</span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500 flex-wrap">
              <span>by {entry.performedBy}</span>
              {entry.reason && (
                <>
                  <span>·</span>
                  <span className="italic text-slate-600">“{entry.reason}”</span>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
