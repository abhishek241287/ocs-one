// Application-wide configuration.
// Values that differ between environments belong here — never hardcode them in components.

export const APP_CONFIG = {
  name: "OCS One",
  companyName: "OCS Oorja Green Pvt. Ltd.",
  version: "1.0.0",
  year: 2026,

  // API base URL — the shared reverse proxy routes /api to the backend service.
  // In production this resolves through the same domain; no hardcoded host needed.
  apiBaseUrl: "/api",

  // Pagination defaults
  defaultPageSize: 25,
  maxPageSize: 100,
} as const;
