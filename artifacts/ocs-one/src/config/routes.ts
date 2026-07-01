// Centralised route paths for the app.
// Import from here instead of spelling out strings in Link/navigate calls.
// This makes refactoring routes a single-file change.

export const ROUTES = {
  login: "/login",
  dashboard: "/dashboard",

  // Operations
  manufacturing: "/manufacturing",
  inventory: "/inventory",
  inventoryGrns: "/inventory/grns",
  inventoryGrnNew: "/inventory/grns/new",
  inventoryInspections: "/inventory/inspections",
  inventoryInspectionNew: "/inventory/inspections/new",
  inventoryStock: "/inventory/stock",
  inventoryWorkflowAssignments: "/inventory/workflow-assignments",
  cellGrading: "/cell-grading",
  qualityControl: "/qc",

  // Products
  products: "/products",
  productsImported: "/products/imported",
  productInventory: "/product-inventory",
  productInventoryList: "/product-inventory/list",

  // Fulfillment (Product-Platform-driven)
  fulfillmentPacking: "/fulfillment/packing",
  fulfillmentDispatch: "/fulfillment/dispatch",
  fulfillmentDispatchList: "/fulfillment/dispatch/list",
  fulfillmentDealers: "/fulfillment/dealers",

  // Traceability
  qrTraceability: "/qr",
  dispatch: "/dispatch",

  // After-Sales
  customerRegistrations: "/after-sales/registrations",
  warranty: "/after-sales/warranties",
  service: "/service",

  // Masters
  masters: {
    products: "/masters/products",
    cells: "/masters/cells",
    bms: "/masters/bms",
    cabinets: "/masters/cabinets",
    connectors: "/masters/connectors",
    cables: "/masters/cables",
    busbars: "/masters/busbars",
    chargers: "/masters/chargers",
    testEquipment: "/masters/test-equipment",
    materials: "/masters/materials",
    materialCategories: "/masters/material-categories",
    boms: "/masters/boms",
    bomNew: "/masters/boms/new",
  },

  // Analytics
  reports: "/reports",
  aiAssistant: "/ai",
} as const;

export type AppRoute = (typeof ROUTES)[keyof typeof ROUTES];
