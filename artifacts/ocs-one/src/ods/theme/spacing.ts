/** ODS Design Tokens — Spacing & Layout */
export const odsSpacing = {
  page: "p-6",
  pageLg: "p-8",
  section: "space-y-5",
  sectionLg: "space-y-8",
  card: "p-4",
  cardLg: "p-6",
  gap: "gap-3",
  gapLg: "gap-6",
  stack: "space-y-3",
  stackSm: "space-y-1.5",
  stackLg: "space-y-6",
  inlinePill: "px-2.5 py-0.5",
  inlineTag: "px-2 py-1",
} as const;

/** ODS Design Tokens — Border Radius */
export const odsRadius = {
  sm: "rounded",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  full: "rounded-full",
  card: "rounded-xl",
  input: "rounded-md",
  badge: "rounded-full",
} as const;

/** ODS Design Tokens — Shadows */
export const odsShadows = {
  card: "shadow-sm",
  elevated: "shadow-md",
  overlay: "shadow-xl",
  none: "",
} as const;
