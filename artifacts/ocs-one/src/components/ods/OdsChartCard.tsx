import { RefreshCw, Download, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface OdsChartCardProps {
  title: string;
  subtitle?: string;
  /** Extra controls placed in the card header toolbar (filters, selectors) */
  toolbar?: React.ReactNode;
  onExport?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Legend rendered below the chart body */
  legend?: React.ReactNode;
  /** The recharts / custom chart component */
  children: React.ReactNode;
  /** Explicit height of the chart body area. Defaults to 240px. */
  height?: number | string;
  className?: string;
}

function ChartSkeleton({ height }: { height: number | string }) {
  return (
    <div
      className="animate-pulse bg-slate-100 rounded-lg flex items-end gap-1 px-4 pb-4 pt-8"
      style={{ height }}
    >
      {[40, 70, 55, 85, 60, 75, 50, 90, 65, 80, 45, 95].map((h, i) => (
        <div
          key={i}
          className="flex-1 bg-slate-200 rounded-t"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

export function OdsChartCard({
  title,
  subtitle,
  toolbar,
  onExport,
  onRefresh,
  isRefreshing = false,
  isLoading = false,
  isEmpty = false,
  emptyTitle = "No data available",
  emptyDescription = "Data will appear here once available.",
  legend,
  children,
  height = 240,
  className,
}: OdsChartCardProps) {
  return (
    <div className={cn("rounded-xl border border-slate-200 bg-white", className)}>
      {/* Card header */}
      <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-800 leading-tight">{title}</h3>
          {subtitle && (
            <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {toolbar}
          {onRefresh && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onRefresh}
              disabled={isRefreshing}
              title="Refresh"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
            </Button>
          )}
          {onExport && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onExport}
              title="Export"
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Chart body */}
      <div className="px-5 pb-4">
        {isLoading ? (
          <ChartSkeleton height={height} />
        ) : isEmpty ? (
          <div
            className="flex flex-col items-center justify-center rounded-lg bg-slate-50 border border-dashed border-slate-200 text-center"
            style={{ height }}
          >
            <BarChart3 className="h-8 w-8 text-slate-300 mb-2" />
            <p className="text-sm font-medium text-slate-500">{emptyTitle}</p>
            {emptyDescription && (
              <p className="text-xs text-slate-400 mt-0.5 max-w-xs">{emptyDescription}</p>
            )}
          </div>
        ) : (
          <div style={{ height }}>{children}</div>
        )}
      </div>

      {/* Legend */}
      {legend && (
        <div className="px-5 pb-4 border-t border-slate-100 pt-3">
          {legend}
        </div>
      )}
    </div>
  );
}
