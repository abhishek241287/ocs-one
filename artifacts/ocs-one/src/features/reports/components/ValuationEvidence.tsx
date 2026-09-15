import { ExternalLink, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import {
  useValuationMovementsAtCost,
  type ValuationMovementsAtCostRow,
} from "../hooks/useReports";

export function valuationDateWindow(days = 365): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - days);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function formatMoney(amount: number, currency: string | null): string {
  if (!currency) return amount.toFixed(2);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function ValuationCostBadge({
  valueAmount,
  valueStatus,
  currency,
  movementId,
  className = "",
}: {
  valueAmount: number | null | undefined;
  valueStatus: string | null | undefined;
  currency: string | null | undefined;
  movementId?: string | number | null;
  className?: string;
}) {
  const captured =
    valueStatus === "CAPTURED" &&
    valueAmount !== null &&
    valueAmount !== undefined &&
    currency;
  const href = movementId
    ? `/reports/valuation?view=trace&movement_id=${encodeURIComponent(String(movementId))}`
    : undefined;
  const badge = (
    <Badge
      variant="outline"
      className={`inline-flex items-center gap-1 text-[10px] ${
        captured
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-50 text-slate-500"
      } ${className}`}
      title={captured ? "Captured receipt cost; open the persisted layer trace" : "Valuation is explicitly unknown (NULL)"}
    >
      {captured ? formatMoney(valueAmount, currency) : "Unknown / NULL"}
      {href && <ExternalLink className="h-3 w-3" />}
    </Badge>
  );
  return href ? <Link href={href}>{badge}</Link> : badge;
}

export function useObjectValuationMovements({
  sourceDocumentIds = [],
  materialIds = [],
}: {
  sourceDocumentIds?: string[];
  materialIds?: string[];
}) {
  const window = valuationDateWindow();
  const query = useValuationMovementsAtCost({
    ...window,
    limit: 500,
  });
  const documentSet = new Set(sourceDocumentIds);
  const materialSet = new Set(materialIds);
  const rows = (query.data?.rows ?? []).filter((row) => {
    const documentMatch =
      documentSet.size > 0 &&
      row.source_document_id != null &&
      documentSet.has(String(row.source_document_id));
    const materialMatch =
      materialSet.size > 0 &&
      row.material_id != null &&
      materialSet.has(String(row.material_id));
    return documentMatch || materialMatch;
  });
  return { ...query, rows };
}

export function ValuationEvidenceStatus({
  isLoading,
  hasError,
  isEmpty,
}: {
  isLoading: boolean;
  hasError: boolean;
  isEmpty: boolean;
}) {
  if (isLoading) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading valuation…
      </span>
    );
  }
  if (hasError) {
    return <span className="text-xs text-muted-foreground">Valuation unavailable</span>;
  }
  if (isEmpty) {
    return <span className="text-xs text-muted-foreground">Unknown / NULL</span>;
  }
  return null;
}

export function valuationRowForLine(
  rows: ValuationMovementsAtCostRow[],
  lineId: string | number | null | undefined,
): ValuationMovementsAtCostRow | undefined {
  if (lineId == null) return undefined;
  return rows.find((row) => row.source_line_id != null && String(row.source_line_id) === String(lineId));
}

export function valuationRowsForLine(
  rows: ValuationMovementsAtCostRow[],
  lineId: string | number | null | undefined,
): ValuationMovementsAtCostRow[] {
  if (lineId == null) return [];
  return rows.filter((row) => row.source_line_id != null && String(row.source_line_id) === String(lineId));
}