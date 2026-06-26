// Centralised route paths for the app.
// Import from here instead of spelling out strings in Link/navigate calls.
// This makes refactoring routes a single-file change.

export const ROUTES = {
  login: "/login",
  dashboard: "/dashboard",

  // Operations
  manufacturing: "/manufacturing",
  inventory: "/inventory",
  cellGrading: "/cell-grading",
  qualityControl: "/qc",

  // Traceability
  qrTraceability: "/qr",
  dispatch: "/dispatch",

  // After-Sales
  warranty: "/warranty",
  service: "/service",

  // Analytics
  reports: "/reports",
  aiAssistant: "/ai",
} as const;

export type AppRoute = (typeof ROUTES)[keyof typeof ROUTES];
