import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export type MetricStatus = "positive" | "negative" | "warning" | "neutral";
export type MetricTrend = "up" | "down" | "flat";

export interface OdsMetricCardProps {
  /** Emoji string or React node */
  icon?: React.ReactNode;
  title: string;
  value: string | number;
  unit?: string;
  trend?: MetricTrend;
  trendValue?: string;
  /** Colours the value and trend indicator */
  status?: MetricStatus;
  footer?: React.ReactNode;
  onClick?: () => void;
  isLoading?: boolean;
  className?: string;
}

const STATUS_VALUE: Record<MetricStatus, string> = {
  positive: "text-green-700",
  negative: "text-red-600",
  warning:  "text-amber-600",
  neutral:  "text-slate-800",
};

const STATUS_TREND: Record<MetricStatus, string> = {
  positive: "text-green-600 bg-green-50",
  negative: "text-red-600 bg-red-50",
  warning:  "text-amber-600 bg-amber-50",
  neutral:  "text-slate-500 bg-slate-100",
};

const TREND_ICON: Record<MetricTrend, React.ComponentType<{ className?: string }>> = {
  up:   TrendingUp,
  down: TrendingDown,
  flat: Minus,
};

export function OdsMetricCard({
  icon,
  title,
  value,
  unit,
  trend,
  trendValue,
  status = "neutral",
  footer,
  onClick,
  isLoading = false,
  className,
}: OdsMetricCardProps) {
  const TrendIcon = trend ? TREND_ICON[trend] : null;
  const valueColor = STATUS_VALUE[status];
  const trendColor = STATUS_TREND[status];

  if (isLoading) {
    return (
      <div className={cn("rounded-xl border border-slate-200 bg-white p-5 space-y-3 animate-pulse", className)}>
        <div className="flex items-center justify-between">
          <div className="h-3 w-24 rounded bg-slate-200" />
          <div className="h-7 w-7 rounded-lg bg-slate-200" />
        </div>
        <div className="h-8 w-20 rounded bg-slate-200" />
        <div className="h-3 w-16 rounded bg-slate-100" />
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-xl border border-slate-200 bg-white p-5 space-y-2 transition-shadow",
        onClick && "cursor-pointer hover:shadow-md hover:border-slate-300",
        className,
      )}
    >
      {/* Header: title + icon */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 leading-tight">
          {title}
        </p>
        {icon && (
          <span className="text-xl leading-none shrink-0">{icon}</span>
        )}
      </div>

      {/* Value */}
      <div className="flex items-baseline gap-1.5">
        <span className={cn("text-3xl font-bold leading-none", valueColor)}>
          {value}
        </span>
        {unit && (
          <span className="text-sm font-medium text-slate-500">{unit}</span>
        )}
      </div>

      {/* Trend */}
      {(trend || trendValue) && (
        <div
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
            trendColor,
          )}
        >
          {TrendIcon && <TrendIcon className="h-3 w-3" />}
          {trendValue}
        </div>
      )}

      {/* Footer */}
      {footer && (
        <div className="pt-1 border-t border-slate-100 text-xs text-slate-500">
          {footer}
        </div>
      )}
    </div>
  );
}
