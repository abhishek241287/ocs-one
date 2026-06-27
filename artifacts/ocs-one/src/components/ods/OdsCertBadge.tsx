export type CertLevel = "certified" | "under-validation" | "development";

const CONFIG: Record<CertLevel, { dot: string; label: string; bg: string; text: string }> = {
  "certified": {
    dot: "bg-green-500",
    label: "Certified",
    bg: "bg-green-50 border-green-200",
    text: "text-green-700",
  },
  "under-validation": {
    dot: "bg-yellow-400",
    label: "Under Validation",
    bg: "bg-yellow-50 border-yellow-200",
    text: "text-yellow-700",
  },
  "development": {
    dot: "bg-red-500",
    label: "Development",
    bg: "bg-red-50 border-red-200",
    text: "text-red-700",
  },
};

export function OdsCertBadge({ level }: { level: CertLevel }) {
  const c = CONFIG[level];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${c.bg} ${c.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}
