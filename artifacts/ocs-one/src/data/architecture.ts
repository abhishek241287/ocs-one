/**
 * OCS One — Architecture Module Registry
 *
 * Single source of truth for every module's dependencies, APIs, DB tables,
 * components, ODS components, cert status, test coverage, and version.
 *
 * Update this file when you add new modules or change existing ones.
 */

export type CertStatus = "certified" | "under-validation" | "development";
export type Layer = "foundation" | "cell" | "manufacturing" | "logistics" | "reporting" | "executive";
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiEntry {
  method: HttpMethod;
  path: string;
  description: string;
}

export interface ModuleNode {
  id: string;
  name: string;
  icon: string;
  path: string;
  description: string;
  layer: Layer;
  certStatus: CertStatus;
  version: string;
  testCoverage: string;
  dependsOn: string[];  // module ids
  usedBy: string[];     // module ids
  apis: ApiEntry[];
  dbTables: string[];
  components: string[];
  odsComponents: string[];
}

export const PIPELINE_ORDER: string[] = [
  "ods",
  "masters",
  "cell-receiving",
  "cell-grading",
  "cell-matching",
  "production",
  "charging",
  "testing",
  "qc",
  "packing",
  "dispatch",
  "reports",
  "director",
];

export const LAYER_META: Record<Layer, { label: string; color: string; bg: string }> = {
  foundation:    { label: "Foundation",    color: "text-teal-700",    bg: "bg-teal-50 border-teal-200" },
  cell:          { label: "Cell",          color: "text-blue-700",    bg: "bg-blue-50 border-blue-200" },
  manufacturing: { label: "Manufacturing", color: "text-orange-700",  bg: "bg-orange-50 border-orange-200" },
  logistics:     { label: "Logistics",     color: "text-purple-700",  bg: "bg-purple-50 border-purple-200" },
  reporting:     { label: "Reporting",     color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  executive:     { label: "Executive",     color: "text-indigo-700",  bg: "bg-indigo-50 border-indigo-200" },
};

export const CERT_META: Record<CertStatus, { label: string; dot: string; badge: string }> = {
  "certified":        { label: "Certified",        dot: "bg-green-500",  badge: "bg-green-100 text-green-800 border-green-200" },
  "under-validation": { label: "Under Validation", dot: "bg-amber-500",  badge: "bg-amber-100 text-amber-800 border-amber-200" },
  "development":      { label: "Development",      dot: "bg-slate-400",  badge: "bg-slate-100 text-slate-700 border-slate-200" },
};

export const METHOD_META: Record<HttpMethod, { color: string; bg: string }> = {
  GET:    { color: "text-blue-700",  bg: "bg-blue-100" },
  POST:   { color: "text-green-700", bg: "bg-green-100" },
  PUT:    { color: "text-amber-700", bg: "bg-amber-100" },
  PATCH:  { color: "text-orange-700",bg: "bg-orange-100" },
  DELETE: { color: "text-red-700",   bg: "bg-red-100" },
};

const MODULES: ModuleNode[] = [
  {
    id: "ods",
    name: "ODS Design System",
    icon: "🎨",
    path: "/design-system",
    description: "OCS One Design System v2.0 — tokens, core components, patterns. Foundation for every page in the app.",
    layer: "foundation",
    certStatus: "certified",
    version: "2.0.0",
    testCoverage: "Visual (showcase)",
    dependsOn: [],
    usedBy: ["masters", "cell-receiving", "cell-grading", "cell-matching", "production", "charging", "testing", "qc", "packing", "dispatch", "reports", "director"],
    apis: [],
    dbTables: [],
    components: [
      "ModuleHeader", "OdsCertBadge", "OdsStatusBadge", "OdsEmptyState", "OdsTableSkeleton",
      "OdsSearchBar", "OdsToolbar", "OdsDrawer", "OdsDialog", "OdsDataTable",
      "OdsCommandPalette", "OdsDevMode", "DevModeProvider",
    ],
    odsComponents: [],
  },
  {
    id: "masters",
    name: "Masters",
    icon: "⚙️",
    path: "/masters/products",
    description: "Reference data for manufacturing — Products, BMS, Cells, Chargers, Test Equipment, Connectors, Cables, Busbars, Cabinets.",
    layer: "foundation",
    certStatus: "certified",
    version: "1.2.0",
    testCoverage: "Manual",
    dependsOn: ["ods"],
    usedBy: ["cell-receiving", "production", "dispatch"],
    apis: [
      { method: "GET",   path: "/api/masters/products",         description: "List products" },
      { method: "POST",  path: "/api/masters/products",         description: "Create product" },
      { method: "PUT",   path: "/api/masters/products/:id",     description: "Update product" },
      { method: "PATCH", path: "/api/masters/products/:id/status", description: "Toggle product status" },
      { method: "GET",   path: "/api/masters/bms",              description: "List BMS models" },
      { method: "POST",  path: "/api/masters/bms",              description: "Create BMS model" },
      { method: "PUT",   path: "/api/masters/bms/:id",          description: "Update BMS model" },
      { method: "GET",   path: "/api/masters/cells",            description: "List cell models" },
      { method: "GET",   path: "/api/masters/chargers",         description: "List chargers" },
      { method: "GET",   path: "/api/masters/test-equipment",   description: "List test equipment" },
      { method: "GET",   path: "/api/masters/connectors",       description: "List connectors" },
      { method: "GET",   path: "/api/masters/cables",           description: "List cables" },
      { method: "GET",   path: "/api/masters/busbars",          description: "List busbars" },
      { method: "GET",   path: "/api/masters/cabinets",         description: "List cabinets" },
    ],
    dbTables: ["products", "bms_models", "cell_models", "chargers", "test_equipment", "connectors", "cables", "busbars", "cabinets"],
    components: ["MasterPage", "MasterEditDrawer", "TextField", "NumberField", "DateField", "SelectField", "BooleanField", "TextareaField"],
    odsComponents: ["ModuleHeader", "OdsToolbar", "OdsDataTable", "OdsDrawer", "OdsDialog", "OdsStatusBadge"],
  },
  {
    id: "cell-receiving",
    name: "Cell Receiving",
    icon: "📦",
    path: "/cells/receiving",
    description: "Inbound lot reception — create cell lots, record supplier, model, quantity, and generate individual cell records.",
    layer: "cell",
    certStatus: "certified",
    version: "1.1.0",
    testCoverage: "Manual",
    dependsOn: ["ods", "masters"],
    usedBy: ["cell-grading"],
    apis: [
      { method: "GET",  path: "/api/cells/lots",      description: "List cell lots (paginated, search)" },
      { method: "POST", path: "/api/cells/lots",      description: "Create lot — auto-generates cell records" },
      { method: "GET",  path: "/api/cells/lots/:id",  description: "Get lot with grading stats breakdown" },
    ],
    dbTables: ["cell_lots", "cells"],
    components: ["CellReceivingPage", "LotStatsRow"],
    odsComponents: ["ModuleHeader", "OdsToolbar", "OdsTableSkeleton", "OdsEmptyState"],
  },
  {
    id: "cell-grading",
    name: "Cell Grading",
    icon: "🔬",
    path: "/cells/grading",
    description: "Record voltage, capacity, and IR measurements per cell. Grade is auto-calculated from tolerance rules. Override available for QC.",
    layer: "cell",
    certStatus: "certified",
    version: "1.1.0",
    testCoverage: "Manual",
    dependsOn: ["ods", "cell-receiving"],
    usedBy: ["cell-matching", "cell-inventory"],
    apis: [
      { method: "GET",   path: "/api/cells",               description: "List cells (paginated, filter by lot/status/grade)" },
      { method: "POST",  path: "/api/cells/:id/grade",     description: "Submit grading measurements — returns computed grade" },
      { method: "GET",   path: "/api/cells/inventory",     description: "Get available cell inventory by grade" },
      { method: "GET",   path: "/api/cells/grade-config",  description: "List tolerance rules" },
      { method: "POST",  path: "/api/cells/grade-config",  description: "Create tolerance rule" },
      { method: "PUT",   path: "/api/cells/grade-config/:id", description: "Update tolerance rule" },
    ],
    dbTables: ["cells", "cell_grades", "grade_configs"],
    components: ["CellGradingPage", "GradeConfigPage", "CellInventoryPage"],
    odsComponents: ["ModuleHeader", "OdsToolbar", "OdsTableSkeleton", "OdsEmptyState"],
  },
  {
    id: "cell-matching",
    name: "Cell Matching",
    icon: "🧠",
    path: "/cells/matching",
    description: "Group graded cells into matched sets for battery assembly. Automated slot allocation with reserve/release lifecycle.",
    layer: "cell",
    certStatus: "certified",
    version: "1.0.0",
    testCoverage: "Manual",
    dependsOn: ["ods", "cell-grading"],
    usedBy: ["production"],
    apis: [
      { method: "GET",    path: "/api/cells/matches",              description: "List cell match groups" },
      { method: "POST",   path: "/api/cells/matches",              description: "Create match group" },
      { method: "GET",    path: "/api/cells/matches/:id",          description: "Get match with slots" },
      { method: "POST",   path: "/api/cells/matches/:id/slots",    description: "Add cell slot to match" },
      { method: "DELETE", path: "/api/cells/matches/:id/slots/:slotId", description: "Remove cell slot" },
      { method: "PATCH",  path: "/api/cells/matches/:id/reserve",  description: "Reserve match for production order" },
      { method: "PATCH",  path: "/api/cells/matches/:id/release",  description: "Release reserved match" },
    ],
    dbTables: ["cell_matches", "match_slots"],
    components: ["CellMatchingPage"],
    odsComponents: ["ModuleHeader", "OdsTableSkeleton", "OdsEmptyState"],
  },
  {
    id: "production",
    name: "Production Orders",
    icon: "🏭",
    path: "/manufacturing/orders",
    description: "Full manufacturing order lifecycle — create, stage progression (Cell Allocation → Assembly → Compression → BMS → Charging → Testing → QC → Packing), data capture per stage.",
    layer: "manufacturing",
    certStatus: "certified",
    version: "1.3.0",
    testCoverage: "Manual",
    dependsOn: ["ods", "masters", "cell-matching"],
    usedBy: ["charging", "testing", "qc", "packing", "reports", "director"],
    apis: [
      { method: "GET",   path: "/api/manufacturing/orders",                          description: "List orders (paginated, filter status/priority/stage)" },
      { method: "POST",  path: "/api/manufacturing/orders",                          description: "Create production order — allocates battery ID via sequence" },
      { method: "GET",   path: "/api/manufacturing/orders/:id",                      description: "Get order with all stage history" },
      { method: "PATCH", path: "/api/manufacturing/orders/:id",                      description: "Update order metadata" },
      { method: "POST",  path: "/api/manufacturing/orders/:id/stages/:stage/start",    description: "Start a stage" },
      { method: "POST",  path: "/api/manufacturing/orders/:id/stages/:stage/complete", description: "Complete a stage with data" },
      { method: "POST",  path: "/api/manufacturing/orders/:id/stages/:stage/approve",  description: "Approve completed stage" },
      { method: "POST",  path: "/api/manufacturing/orders/:id/stages/:stage/reject",   description: "Reject stage — triggers rework" },
      { method: "GET",   path: "/api/manufacturing/stages/metrics",                  description: "Aggregate KPI metrics across all stages" },
    ],
    dbTables: ["production_orders", "production_stages", "stage_data"],
    components: ["OrdersListPage", "OrderDetailPage", "CreateOrderDrawer", "StageCard", "ChargerManagementPage"],
    odsComponents: ["ModuleHeader", "OdsToolbar", "OdsDataTable", "OdsStatusBadge"],
  },
  {
    id: "charging",
    name: "Charging",
    icon: "⚡",
    path: "/manufacturing/charging-dashboard",
    description: "Charging stage dashboard — monitor active charging sessions, record charger assignment, voltage and current readings.",
    layer: "manufacturing",
    certStatus: "certified",
    version: "1.0.0",
    testCoverage: "Manual",
    dependsOn: ["ods", "production", "masters"],
    usedBy: ["testing"],
    apis: [
      { method: "GET",   path: "/api/manufacturing/orders?stage=charging", description: "Orders in charging stage" },
      { method: "POST",  path: "/api/manufacturing/orders/:id/stages/charging/start",    description: "Start charging stage" },
      { method: "POST",  path: "/api/manufacturing/orders/:id/stages/charging/complete", description: "Complete charging with readings" },
    ],
    dbTables: ["production_stages", "stage_data"],
    components: ["ChargingDashboardPage"],
    odsComponents: ["ModuleHeader", "OdsStatusBadge"],
  },
  {
    id: "testing",
    name: "Testing",
    icon: "🧪",
    path: "/manufacturing/testing-dashboard",
    description: "Testing stage — record BMS programming results, electrical test readings, and pass/fail decisions.",
    layer: "manufacturing",
    certStatus: "certified",
    version: "1.0.0",
    testCoverage: "Manual",
    dependsOn: ["ods", "production"],
    usedBy: ["qc"],
    apis: [
      { method: "GET",   path: "/api/manufacturing/orders?stage=testing", description: "Orders in testing stage" },
      { method: "POST",  path: "/api/manufacturing/orders/:id/stages/testing/start",    description: "Start testing stage" },
      { method: "POST",  path: "/api/manufacturing/orders/:id/stages/testing/complete", description: "Complete testing with results" },
    ],
    dbTables: ["production_stages", "stage_data"],
    components: ["TestingDashboardPage"],
    odsComponents: ["ModuleHeader", "OdsStatusBadge"],
  },
  {
    id: "qc",
    name: "Quality Control",
    icon: "✅",
    path: "/manufacturing/orders",
    description: "QC inspection stage — supervisor approval gate. Reject triggers rework queue, approve advances to packing.",
    layer: "manufacturing",
    certStatus: "under-validation",
    version: "0.9.0",
    testCoverage: "Manual",
    dependsOn: ["ods", "production"],
    usedBy: ["packing"],
    apis: [
      { method: "POST", path: "/api/manufacturing/orders/:id/stages/quality_control/start",   description: "Start QC inspection" },
      { method: "POST", path: "/api/manufacturing/orders/:id/stages/quality_control/approve", description: "Approve QC — advance to packing" },
      { method: "POST", path: "/api/manufacturing/orders/:id/stages/quality_control/reject",  description: "Reject QC — push to rework queue" },
      { method: "GET",  path: "/api/manufacturing/rework",                                    description: "List rework queue" },
    ],
    dbTables: ["production_stages", "stage_data"],
    components: ["OrderDetailPage (QC stage card)", "ReworkQueuePage"],
    odsComponents: ["ModuleHeader", "OdsStatusBadge", "OdsDialog"],
  },
  {
    id: "packing",
    name: "Packing",
    icon: "📦",
    path: "/logistics/packing-dashboard",
    description: "Packing stage — final labelling, packaging verification, and handoff to logistics for dispatch.",
    layer: "logistics",
    certStatus: "under-validation",
    version: "0.9.0",
    testCoverage: "Manual",
    dependsOn: ["ods", "production", "qc"],
    usedBy: ["dispatch"],
    apis: [
      { method: "POST", path: "/api/manufacturing/orders/:id/stages/packing/start",    description: "Start packing stage" },
      { method: "POST", path: "/api/manufacturing/orders/:id/stages/packing/complete", description: "Complete packing — ready for dispatch" },
      { method: "GET",  path: "/api/logistics/packing",                                description: "Batteries ready for dispatch" },
    ],
    dbTables: ["production_stages", "stage_data"],
    components: ["PackingDashboardPage"],
    odsComponents: ["ModuleHeader", "OdsStatusBadge"],
  },
  {
    id: "dispatch",
    name: "Dispatch",
    icon: "🚚",
    path: "/logistics/dispatch-orders",
    description: "Dispatch order management — dealer accounts, shipment events, vehicle and driver tracking.",
    layer: "logistics",
    certStatus: "certified",
    version: "1.1.0",
    testCoverage: "Manual",
    dependsOn: ["ods", "masters", "packing"],
    usedBy: ["reports", "director"],
    apis: [
      { method: "GET",   path: "/api/logistics/dispatch-orders",              description: "List dispatch orders (filter by status)" },
      { method: "POST",  path: "/api/logistics/dispatch-orders",              description: "Create dispatch order" },
      { method: "GET",   path: "/api/logistics/dispatch-orders/:id",          description: "Get dispatch order detail" },
      { method: "PATCH", path: "/api/logistics/dispatch-orders/:id/status",   description: "Update dispatch status" },
      { method: "POST",  path: "/api/logistics/dispatch-orders/:id/events",   description: "Add shipment event" },
      { method: "GET",   path: "/api/logistics/dealers",                      description: "List dealers" },
      { method: "POST",  path: "/api/logistics/dealers",                      description: "Create dealer" },
      { method: "PUT",   path: "/api/logistics/dealers/:id",                  description: "Update dealer" },
      { method: "DELETE",path: "/api/logistics/dealers/:id",                  description: "Delete dealer" },
    ],
    dbTables: ["dispatch_orders", "dealers", "shipment_events"],
    components: ["DispatchOrdersPage", "DispatchOrderDetailPage", "DealerMasterPage"],
    odsComponents: ["ModuleHeader", "OdsToolbar", "OdsDataTable", "OdsDrawer", "OdsDialog", "OdsStatusBadge"],
  },
  {
    id: "reports",
    name: "Reports",
    icon: "📈",
    path: "/reports/executive",
    description: "Analytics suite — Executive dashboard, Production report, Cell analytics, Quality analytics, Inventory, Logistics, Export Centre.",
    layer: "reporting",
    certStatus: "under-validation",
    version: "0.8.0",
    testCoverage: "Manual",
    dependsOn: ["ods", "production", "cell-grading", "dispatch"],
    usedBy: ["director"],
    apis: [
      { method: "GET", path: "/api/manufacturing/orders",          description: "Filtered production data for reports" },
      { method: "GET", path: "/api/manufacturing/stages/metrics",  description: "Aggregate KPI metrics" },
      { method: "GET", path: "/api/cells/inventory",               description: "Cell inventory breakdown" },
      { method: "GET", path: "/api/logistics/dispatch-orders",     description: "Dispatch data for logistics report" },
    ],
    dbTables: ["production_orders", "production_stages", "cells", "cell_lots", "dispatch_orders"],
    components: [
      "ExecutiveDashboardPage", "ProductionReportPage", "CellAnalyticsPage",
      "QualityAnalyticsPage", "InventoryAnalyticsPage", "LogisticsAnalyticsPage", "ExportCenterPage",
    ],
    odsComponents: ["ModuleHeader", "OdsToolbar", "OdsDataTable"],
  },
  {
    id: "director",
    name: "Director Dashboard",
    icon: "📊",
    path: "/dashboard",
    description: "Real-time executive overview — pipeline health, stage KPIs, throughput metrics, and alert feed for the plant director.",
    layer: "executive",
    certStatus: "certified",
    version: "1.0.0",
    testCoverage: "Manual",
    dependsOn: ["ods", "production", "reports"],
    usedBy: [],
    apis: [
      { method: "GET", path: "/api/manufacturing/orders",         description: "Live order pipeline" },
      { method: "GET", path: "/api/manufacturing/stages/metrics", description: "Real-time stage KPIs" },
    ],
    dbTables: ["production_orders", "production_stages"],
    components: ["DirectorDashboardPage"],
    odsComponents: ["ModuleHeader", "OdsStatusBadge"],
  },
];

export const MODULE_MAP: Record<string, ModuleNode> = Object.fromEntries(
  MODULES.map((m) => [m.id, m])
);

export default MODULES;
