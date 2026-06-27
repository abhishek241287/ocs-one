/**
 * ODS Standard 7 — Loading.
 * Page-level loading uses skeleton rows, never a spinner.
 * Spinners are only used inside buttons.
 */

import { Skeleton } from "@/components/ui/skeleton";

interface OdsTableSkeletonProps {
  rows?: number;
  columns?: number;
}

export function OdsTableSkeleton({ rows = 6, columns = 5 }: OdsTableSkeletonProps) {
  return (
    <div className="rounded-md border overflow-hidden">
      {/* Header */}
      <div className="flex gap-4 px-4 py-3 bg-gray-50 border-b">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 px-4 py-3 border-b last:border-0">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton
              key={c}
              className="h-4 flex-1"
              style={{ opacity: 1 - r * 0.1 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
