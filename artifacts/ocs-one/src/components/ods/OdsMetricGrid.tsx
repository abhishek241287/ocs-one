import { cn } from "@/lib/utils";

export interface OdsMetricGridProps {
  /** Number of columns. "auto" picks the best fit based on available space. */
  columns?: 2 | 3 | 4 | "auto";
  children: React.ReactNode;
  className?: string;
}

const COL_CLASS: Record<string, string> = {
  "2":    "grid-cols-1 sm:grid-cols-2",
  "3":    "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  "4":    "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
  "auto": "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
};

export function OdsMetricGrid({ columns = "auto", children, className }: OdsMetricGridProps) {
  return (
    <div className={cn("grid gap-4", COL_CLASS[String(columns)], className)}>
      {children}
    </div>
  );
}
