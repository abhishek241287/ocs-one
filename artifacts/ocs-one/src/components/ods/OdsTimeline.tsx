import { cn } from "@/lib/utils";

export type TimelineColor = "default" | "success" | "warning" | "error" | "info";

export interface OdsTimelineItem {
  id: string;
  title: string;
  description?: string;
  timestamp?: string | Date;
  user?: string;
  icon?: React.ReactNode;
  status?: string;
  color?: TimelineColor;
}

export interface OdsTimelineProps {
  items: OdsTimelineItem[];
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

const COLOR_DOT: Record<TimelineColor, string> = {
  default: "bg-slate-400 ring-white",
  success: "bg-green-500 ring-white",
  warning: "bg-amber-500 ring-white",
  error:   "bg-red-500 ring-white",
  info:    "bg-blue-500 ring-white",
};

const COLOR_BORDER: Record<TimelineColor, string> = {
  default: "border-slate-200",
  success: "border-green-200",
  warning: "border-amber-200",
  error:   "border-red-200",
  info:    "border-blue-200",
};

const COLOR_TITLE: Record<TimelineColor, string> = {
  default: "text-slate-800",
  success: "text-green-800",
  warning: "text-amber-800",
  error:   "text-red-800",
  info:    "text-blue-800",
};

function formatTimestamp(ts: string | Date): string {
  const d = typeof ts === "string" ? new Date(ts) : ts;
  if (isNaN(d.getTime())) return String(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TimelineSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className="h-3 w-3 rounded-full bg-slate-200 mt-1" />
            {i < 3 && <div className="w-px flex-1 bg-slate-100 mt-1.5" />}
          </div>
          <div className="pb-4 space-y-1.5 flex-1">
            <div className="h-3.5 w-32 rounded bg-slate-200" />
            <div className="h-3 w-48 rounded bg-slate-100" />
            <div className="h-2.5 w-24 rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function OdsTimeline({
  items,
  isLoading = false,
  emptyTitle = "No events yet",
  emptyDescription = "Events will appear here as they occur.",
  className,
}: OdsTimelineProps) {
  if (isLoading) return <TimelineSkeleton />;

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="text-3xl mb-2">📋</div>
        <p className="text-sm font-medium text-slate-600">{emptyTitle}</p>
        {emptyDescription && (
          <p className="text-xs text-slate-400 mt-1">{emptyDescription}</p>
        )}
      </div>
    );
  }

  return (
    <div className={cn("space-y-0", className)}>
      {items.map((item, idx) => {
        const color = item.color ?? "default";
        const isLast = idx === items.length - 1;
        return (
          <div key={item.id} className="flex gap-3">
            {/* Left: dot + connector */}
            <div className="flex flex-col items-center shrink-0" style={{ width: 20 }}>
              <div className="mt-1.5 relative">
                {item.icon ? (
                  <div className="h-5 w-5 rounded-full bg-white border border-slate-200 flex items-center justify-center text-[11px]">
                    {item.icon}
                  </div>
                ) : (
                  <div className={cn("h-3 w-3 rounded-full ring-2", COLOR_DOT[color])} />
                )}
              </div>
              {!isLast && (
                <div className="flex-1 w-px bg-slate-200 mt-1.5 mb-0" style={{ minHeight: 20 }} />
              )}
            </div>

            {/* Right: content */}
            <div className={cn("pb-4 min-w-0 flex-1", isLast && "pb-0")}>
              <div
                className={cn(
                  "rounded-lg border px-3 py-2.5",
                  "bg-white",
                  COLOR_BORDER[color],
                )}
              >
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <span className={cn("text-sm font-semibold leading-tight", COLOR_TITLE[color])}>
                    {item.title}
                  </span>
                  {item.status && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 shrink-0">
                      {item.status}
                    </span>
                  )}
                </div>
                {item.description && (
                  <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{item.description}</p>
                )}
                {(item.timestamp || item.user) && (
                  <div className="flex items-center gap-2 mt-1.5 text-[11px] text-slate-400">
                    {item.timestamp && <span>{formatTimestamp(item.timestamp)}</span>}
                    {item.user && item.timestamp && <span>·</span>}
                    {item.user && <span>{item.user}</span>}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
