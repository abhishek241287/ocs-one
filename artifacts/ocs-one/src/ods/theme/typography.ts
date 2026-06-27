/** ODS Design Tokens — Typography */
export const odsTypography = {
  heading: {
    h1: "text-2xl font-bold tracking-tight text-gray-900",
    h2: "text-xl font-semibold text-gray-900",
    h3: "text-lg font-semibold text-gray-800",
    h4: "text-base font-semibold text-gray-800",
  },
  body: {
    lg: "text-base text-gray-700",
    md: "text-sm text-gray-700",
    sm: "text-xs text-gray-600",
    muted: "text-sm text-gray-500",
    mutedSm: "text-xs text-gray-500",
  },
  label: {
    field: "text-xs font-medium text-gray-700",
    section: "text-xs font-semibold uppercase tracking-wide text-gray-500",
  },
  mono: {
    sm: "font-mono text-xs",
    md: "font-mono text-sm",
    semibold: "font-mono text-sm font-semibold",
  },
  code: "font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-800",
} as const;
