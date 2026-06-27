/**
 * ODS Standard 2 — Semantic status colors.
 * One color = one meaning, forever.
 *
 * 🟢 Green  — Active / Passed / Approved / Completed / Delivered
 * 🔵 Blue   — Running / In Progress / Released / Confirmed / Loaded / In Transit
 * 🟡 Yellow — Pending / Waiting / Under Review / Draft (soft)
 * 🔴 Red    — Rejected / Failed / Error / Cancelled / Critical
 * ⚫ Gray   — Inactive / Disabled / Archived / Draft (hard)
 */

type StatusColor = "green" | "blue" | "yellow" | "red" | "gray";

const SEMANTIC: Record<string, StatusColor> = {
  // Green
  active: "green", completed: "green", approved: "green", passed: "green",
  delivered: "green", graded: "green", matched: "green",
  // Blue
  in_progress: "blue", running: "blue", released: "blue",
  confirmed: "blue", loaded: "blue", in_transit: "blue", charging: "blue",
  // Yellow
  pending: "yellow", waiting: "yellow", under_review: "yellow",
  received: "yellow", allocated: "yellow", reserved: "yellow",
  // Red
  rejected: "red", failed: "red", cancelled: "red", error: "red", critical: "red",
  // Gray
  inactive: "gray", disabled: "gray", archived: "gray", draft: "gray", locked: "gray",
};

const CLASSES: Record<StatusColor, string> = {
  green:  "bg-green-50  text-green-700  border-green-200",
  blue:   "bg-blue-50   text-blue-700   border-blue-200",
  yellow: "bg-yellow-50 text-yellow-700 border-yellow-200",
  red:    "bg-red-50    text-red-700    border-red-200",
  gray:   "bg-gray-100  text-gray-600   border-gray-200",
};

function label(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface OdsStatusBadgeProps {
  status: string;
  /** Override the semantic color (use sparingly — prefer the auto-mapped value) */
  color?: StatusColor;
}

export function OdsStatusBadge({ status, color }: OdsStatusBadgeProps) {
  const resolved = color ?? SEMANTIC[status] ?? "gray";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${CLASSES[resolved]}`}
    >
      {label(status)}
    </span>
  );
}

/** Resolve just the color class string, useful when you need raw Tailwind classes */
export function odsStatusColor(status: string): StatusColor {
  return SEMANTIC[status] ?? "gray";
}
