// ERP module definitions.
// Used by the sidebar, dashboard cards, and permission checks.
// Add new modules here and they will automatically propagate.

export type ModuleId =
  | "dashboard"
  | "manufacturing"
  | "inventory"
  | "cell_grading"
  | "qc"
  | "qr_traceability"
  | "dispatch"
  | "warranty"
  | "service"
  | "reports"
  | "ai_assistant";

export const MODULE_LABELS: Record<ModuleId, string> = {
  dashboard: "Dashboard",
  manufacturing: "Manufacturing",
  inventory: "Inventory",
  cell_grading: "Cell Grading",
  qc: "Quality Control",
  qr_traceability: "QR Traceability",
  dispatch: "Dispatch",
  warranty: "Warranty",
  service: "Service",
  reports: "Reports",
  ai_assistant: "AI Assistant",
};
