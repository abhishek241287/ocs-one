# UI-IA-01 Phase 0 — Frontend Implementation Audit

**Product:** OCS One  
**Date:** 2026-09-15  
**Authority:** Phase 9 — OCS One Operations Experience  
**Scope:** Read-only inspection for UI-IA-01 Navigation Hierarchy + Dashboard Consolidation

## Audit boundary and verification

This audit inspected the current working tree only. It did not modify application
source, generated clients, OpenAPI, backend, database, configuration, tests, package
manifests, routes, permissions, or certified genealogy behavior.

Before the audit:

```text
git diff --stat
<empty>
```

The three supplied prompt/guideline files were present as user-provided untracked
attachments. The only audit deliverable is this notes file. Application source,
generated-client, OpenAPI, backend, database, configuration, and test diffs remain
absent. No commit was made.

---

## 1. Route / navigation structure

### 1.1 Authoritative router

The active router is Wouter's `Switch`/`Route` tree in
`artifacts/ocs-one/src/App.tsx:93-208`. `artifacts/ocs-one/src/config/routes.ts`
is not authoritative: it contains paths that are not mounted by `App.tsx` and
omits many mounted paths.

`/login` is the public route. `/` redirects to `/dashboard`. All other mounted
feature routes render pages that normally use `AppLayout`, which performs the
frontend authentication gate. `App.tsx` itself does not wrap routes in a common
role guard. Backend authorization is outside this frontend audit.

### 1.2 Complete current route map

Every route below is defined in `artifacts/ocs-one/src/App.tsx`.

| Current path | Component / behavior | Current access |
|---|---|---|
| `/login` | `LoginPage` | Public |
| `/` | Redirect to `/dashboard` | Public redirect |
| `/dashboard` | `DirectorDashboardPage` | `AppLayout` |
| `/design-system` | `DesignSystemPage` | `AppLayout` |
| `/developer/architecture` | `ArchitecturePage` | `AppLayout`; Developer nav is director/owner visible |
| `/developer/performance` | `PerformancePage` | `AppLayout`; Developer nav is director/owner visible |
| `/developer/security` | `SecurityPage` | `AppLayout`; Developer nav is director/owner visible |
| `/developer/configuration` | `ConfigurationPage` | `AppLayout`; Developer nav is director/owner visible |
| `/administration/users` | `UserAccountsPage` | `AppLayout`; Access nav is director/owner visible |
| `/product-inventory` | `ProductInventoryDashboardPage` | `AppLayout` |
| `/product-inventory/list` | `ProductInventoryListPage` | `AppLayout` |
| `/products/imported` | `ImportedProductPage` | `AppLayout` |
| `/traceability` | `TraceabilityPage` | `AppLayout`; read-only genealogy console |
| `/products` | `ProductsListPage` | `AppLayout` |
| `/products/:id` | `ProductDetailPage` | `AppLayout` |
| `/masters/products` | `ProductMasterPage` | `AppLayout` |
| `/masters/product-categories` | `ProductCategoryPage` | `AppLayout` |
| `/masters/product-workflows` | `ProductWorkflowPage` | `AppLayout` |
| `/masters/material-categories` | `MaterialCategoryPage` | `AppLayout` |
| `/masters/materials` | `MaterialMasterPage` | `AppLayout` |
| `/masters/suppliers` | `SupplierMasterPage` | `AppLayout` |
| `/masters/material-workflows` | `MaterialWorkflowPage` | `AppLayout` |
| `/masters/cells` | `CellMasterPage` | `AppLayout` |
| `/masters/bms` | `BmsMasterPage` | `AppLayout` |
| `/masters/cabinets` | `CabinetMasterPage` | `AppLayout` |
| `/masters/connectors` | `ConnectorMasterPage` | `AppLayout` |
| `/masters/cables` | `CableMasterPage` | `AppLayout` |
| `/masters/busbars` | `BusbarMasterPage` | `AppLayout` |
| `/masters/chargers` | `ChargerMasterPage` | `AppLayout` |
| `/masters/test-equipment` | `TestEquipmentMasterPage` | `AppLayout` |
| `/masters/boms/new` | `BomFormPage` | `AppLayout` |
| `/masters/boms/:id/edit` | `BomFormPage` | `AppLayout` |
| `/masters/boms/:id` | `BomDetailPage` | `AppLayout` |
| `/masters/boms` | `BomListPage` | `AppLayout` |
| `/procurement` | Redirect to `/procurement/purchase-orders` | Authenticated redirect |
| `/procurement/purchase-orders` | `PurchaseOrderListPage` | `AppLayout` |
| `/procurement/purchase-orders/new` | `PurchaseOrderCreatePage` | `AppLayout` |
| `/procurement/purchase-orders/:id` | `PurchaseOrderDetailPage` | `AppLayout` |
| `/inventory` | Redirect to `/inventory/grns` | Authenticated redirect |
| `/inventory/grns` | `GrnListPage` | `AppLayout` |
| `/inventory/grns/new` | `GrnCreatePage` | `AppLayout` |
| `/inventory/grns/:id` | `GrnDetailPage` | `AppLayout` |
| `/inventory/inspections` | `InspectionListPage` | `AppLayout` |
| `/inventory/inspections/new` | `InspectionCreatePage` | `AppLayout` |
| `/inventory/inspections/:id` | `InspectionDetailPage` | `AppLayout` |
| `/inventory/stock` | `StockPage` | `AppLayout` |
| `/inventory/workflow-assignments` | `MaterialWorkflowAssignmentPage` | `AppLayout` |
| `/manufacturing` | Redirect to `/manufacturing/orders` | Authenticated redirect |
| `/manufacturing/orders` | `OrdersListPage` | `AppLayout` |
| `/manufacturing/orders/:id` | `OrderDetailPage` | `AppLayout` |
| `/manufacturing/chargers` | `ChargerManagementPage` | `AppLayout` |
| `/manufacturing/charging-dashboard` | `ChargingDashboardPage` | `AppLayout` |
| `/manufacturing/testing-dashboard` | `TestingDashboardPage` | `AppLayout` |
| `/manufacturing/rework` | `ReworkQueuePage` | `AppLayout` |
| `/cells/receiving` | `CellReceivingPage` | `AppLayout` |
| `/cells/transfers/:id` | `MaterialTransferDetailPage` | `AppLayout` |
| `/cells/grading` | `CellGradingPage` | `AppLayout` |
| `/cells/inventory` | `CellInventoryPage` | `AppLayout` |
| `/cells/matching` | `CellMatchingPage` | `AppLayout` |
| `/cells/config` | `GradeConfigPage` | `AppLayout` |
| `/fulfillment/packing` | `PackingPage` | `AppLayout` |
| `/fulfillment/dispatch` | `DispatchPage` | `AppLayout` |
| `/fulfillment/dispatch/list` | `DispatchListPage` | `AppLayout` |
| `/fulfillment/dispatch/:id` | `DispatchDetailPage` | `AppLayout` |
| `/fulfillment/dealers` | `DealerPortalPage` | Dealer portal exception |
| `/after-sales/registrations` | `CustomerRegistrationPage` | `AppLayout` |
| `/after-sales/warranties` | `WarrantyPage` | `AppLayout` |
| `/logistics` | Redirect to `/logistics/packing-dashboard` | Authenticated redirect |
| `/logistics/packing-dashboard` | `PackingDashboardPage` | `AppLayout` |
| `/logistics/dealers` | `DealerMasterPage` | `AppLayout` |
| `/logistics/dispatch-orders` | `DispatchOrdersPage` | `AppLayout`; owner-only sidebar entry |
| `/logistics/dispatch-orders/:id` | `DispatchOrderDetailPage` | `AppLayout` |
| `/reports/executive` | `ExecutiveDashboardPage` | `AppLayout` |
| `/reports/production` | `ProductionReportPage` | `AppLayout` |
| `/reports/cells` | `CellAnalyticsPage` | `AppLayout` |
| `/reports/quality` | `QualityAnalyticsPage` | `AppLayout` |
| `/reports/inventory` | `InventoryAnalyticsPage` | `AppLayout` |
| `/reports/logistics` | `LogisticsAnalyticsPage` | `AppLayout` |
| `/reports/export` | `ExportCenterPage` | `AppLayout` |
| unmatched path | `NotFound` | No page shell |

### 1.3 Current sidebar definition

The active sidebar configuration is the `navSections` array in
`artifacts/ocs-one/src/components/layout/Sidebar.tsx:50-201`. Its current
hierarchy is:

```text
Dashboard
Procurement
  Purchase Orders
Inventory
  Raw Material
    Goods Receipt
    Incoming Inspection
    Stock On Hand
  Finished Goods
    Product Inventory
    Imported Product Registration
Production
  Cell Processing
    Receive From Inventory
    Cell Grading
    Cell Matching
    Cell Inventory
  Manufacturing
    Production Orders
    Charging
    Testing
    Rework
  Quality
    QC
    Product Traceability
Dispatch
  Packing
  Dispatch
  All Dispatches
  Dealer Portal
  Packing Dashboard
  Dispatch Orders
After-Sales
  Customer Registration
  Warranty
Masters
  Bill of Materials
  Material Master
  Material Categories
  Supplier Master
  Dealer Master
  Product Categories
  Cell Master
  BMS Master
  Charger Master
  Product Master
  Connector Master
  Cable Master
  Busbar Master
  Cabinet Master
  Test Equipment
Administration
  Workflow Assignment
  Material Workflows
  Product Workflows
  Grade Configuration
  Charger Management
Reports
  Executive Dashboard
  Production Reports
  Cell Analytics
  Quality Analytics
  Inventory Analytics
  Logistics Analytics
  Export Center
Developer [collapsible, director/owner only]
  Architecture Map
  Engineering Health
  Security Posture
  Configuration
Access [director/owner only]
  User Accounts
```

The sidebar has one actual `Production` section. No duplicate `Production`
section was found in the current `navSections` source. Production-related
destinations are nevertheless distributed across the separate Reports,
Administration, Dispatch, and global command-palette surfaces.

### 1.4 Navigation gates and hidden rules

- `NavItem` supports `ownerOnly`; `NavSection` supports `directorOnly`
  (`Sidebar.tsx:50-58`).
- The legacy `/logistics/dispatch-orders` item is marked `ownerOnly`
  (`Sidebar.tsx:129-132`).
- `ownerOnly` filtering is applied to flat `section.items`
  (`Sidebar.tsx:387-393`), not to items inside `section.groups`. There are
  currently no grouped `ownerOnly` items, but this is an implementation risk
  for future grouped navigation.
- Developer and Access sections are visible to `director` and `owner`
  (`Sidebar.tsx:327-338`).
- Dealer users receive no factory sidebar sections
  (`Sidebar.tsx:327-334`).
- Active-link matching supports path prefixes and the QC query-owned link
  (`Sidebar.tsx:203-234`).
- Developer is the only currently collapsible sidebar section. The sidebar
  remembers scroll position in `sessionStorage` (`Sidebar.tsx:256-325`).
- The global `OdsCommandPalette` is mounted for every route
  (`App.tsx:211-226`). Its static item list
  (`components/ods/OdsCommandPalette.tsx:28-58`) has no `useAuth` role
  filtering, so it can expose developer and legacy destinations hidden by the
  sidebar and can expose factory destinations to dealer users.
- The command palette does not cover every mounted route; for example, it does
  not provide all masters, GRNs, suppliers, or detail IDs.

### 1.5 Route and auth shell

`AppLayout` is the common frontend shell and auth gate
(`artifacts/ocs-one/src/layouts/AppLayout.tsx:8-55`). It redirects an
unauthenticated user to `/login`, renders a loading spinner while auth loads,
and blocks dealer users from locations outside `/fulfillment/dealers`.
There is no reusable frontend `RequireRole` or `ProtectedRoute` wrapper in the
current tree. Role checks are page/action-level; backend authorization is not
being changed by UI-IA-01.

---

## 2. Dashboard component structure

### 2.1 Active dashboard path

The root redirect lands on `/dashboard`, which renders
`artifacts/ocs-one/src/pages/DirectorDashboardPage.tsx` through
`App.tsx:97-100`. This is the active dashboard for the factory console. It is
not `ExecutiveDashboardPage` at `/reports/executive`, and it is not one of the
manufacturing stage dashboards.

Component/data path:

```text
App.tsx
  /dashboard
    DirectorDashboardPage.tsx
      AppLayout
      useDirectorDashboard()
        features/dashboard/hooks/useDirectorDashboard.ts
          GET ${BASE_URL}/api/dashboard/director
          React Query refetch interval: 30s
      local presentation helpers:
        StageCard
        AlertRow
        EquipBar
        RefreshCountdown
      ODS:
        OdsMetricGrid
        OdsMetricCard
```

The hook is in
`artifacts/ocs-one/src/features/dashboard/hooks/useDirectorDashboard.ts:21-99`.
The dashboard API is served by
`artifacts/api-server/src/routes/dashboard/director.ts`, mounted through
`artifacts/api-server/src/routes/index.ts:117-127`.

### 2.2 Current widgets and guideline mapping

| Current section | Source / fields | Classification | Current visual grouping | Phase 9 mapping |
|---|---|---|---|---|
| Live header, critical count, refreshed time, refresh/countdown | `data.alerts`, `data.refreshedAt`, client timer | Live + derived presentation | Page header | Level 1 Status |
| Eight KPI cards | `kpis.todayTarget`, `todayCompleted`, `productionEfficiency`, `inProgress`, `qcPending`, `dispatchReady`, `reworkQueue`, `chargerUtilization` | Live endpoint values; efficiency server-derived; threshold colors client-derived | ODS metric grid | Level 1 Status |
| Live Manufacturing Pipeline | `pipeline[]`: active/in progress, waiting, blocked, completed today, health | Live aggregates; stage metadata and links static; health server-derived | Horizontal scroll card chain with arrows | Level 2 Pipeline |
| Factory Alerts | `alerts[]` | Live endpoint array synthesized by server threshold checks; empty copy static | Left side of two-column row | Alerts; distinct from My Work |
| Recent Production Orders | `recentOrders[]`: battery/order identifier, status, current stage, priority | Live recent-order projection; labels/status classes client maps | Right side of alerts row | Production Orders |
| Operator Activity | `operatorActivity[]`: operator, stage, batteries completed today | Live grouped activity; empty copy static | Three-column lower row | My Work candidate, not currently task-oriented |
| Equipment Status | charger/test-equipment totals and available/busy/maintenance | Live aggregates; segment widths client-derived | Three-column lower row | Status / Alerts candidate |
| Cell Inventory | received, grading, approved, allocated, rejected, quarantine | Live status aggregates | Nested in Equipment Status | Status |
| Quality Summary | pass/reject rates, sample count, test pass/fail counts | Live last-30-day aggregate; percentages server-derived | Three-column lower row | Status / Attention candidate |
| Logistics Summary | ready for dispatch, in transit, delivered today, total dealers | Live aggregate | Two-column lower row | Status |
| Quick Actions | static `QUICK_ACTIONS` array | Static navigation actions | Two-column lower row | My Work/navigation candidate, not live work |

Relevant source ranges are
`DirectorDashboardPage.tsx:126-146,148-258,260-295,297-362,364-498,500-562`.
The page already uses `OdsMetricGrid` and `OdsMetricCard`, but most content uses
direct shadcn `Card` components.

### 2.3 Current dashboard risks

- The page presents many metrics at similar visual weight; the guideline's
  Status → Pipeline → Attention → Alerts hierarchy is not yet explicit.
- `Factory Alerts` exists, but there is no separate `Attention Required`
  operator-work section.
- `Operator Activity` is informational, not a task queue with resolve/review/start
  actions.
- Pipeline cards are visually ordered, but source stage links and semantic
  status meanings must be preserved if they are reorganized.
- The dashboard's “Production Orders” row displays `batteryNumber` first and
  falls back to `orderNumber` (`DirectorDashboardPage.tsx:343-346`), so it is
  not reliably displaying the requested Order #.
- The current status badge map omits `released` and `cancelled`, causing those
  values to use the generic fallback style (`DirectorDashboardPage.tsx:126-131`).
- The priority renderer checks `urgent`, although the generated priority enum is
  low/medium/high (`DirectorDashboardPage.tsx:352-354`).

---

## 3. Responsive behavior

### 3.1 Application shell

`AppLayout.tsx:46-53` renders a fixed full-screen flex shell:

```text
Sidebar + TopNavbar + scrollable main
main content: p-6 md:p-8 max-w-7xl mx-auto
```

`Sidebar.tsx:341-345` changes width from `w-64` to `w-[72px]` when the
`collapsed` state changes. This is a user-triggered rail collapse, not a
viewport breakpoint. `TopNavbar.tsx:14-19` always renders a Menu button that
toggles this width state.

There is no navigation overlay, mobile Sheet/drawer, responsive hamburger
drawer, or bottom navigation in the current application shell. The existing
`useIsMobile` hook has a 768px breakpoint
(`artifacts/ocs-one/src/hooks/use-mobile.tsx:3-18`) but has no current
consumer outside its own file.

### 3.2 Existing breakpoint patterns

- Shell content: `md` padding change in `AppLayout`.
- Navbar: company text is hidden below `sm`; user identity is hidden below
  `md` (`TopNavbar.tsx:21-35`).
- Login: `lg` two-panel layout and `sm` padding
  (`pages/LoginPage.tsx:37-70`).
- Dashboard: page-local `flex-wrap`, `grid-cols-1`, `lg:grid-cols-5`,
  `md:grid-cols-3`, and `md:grid-cols-2` layouts
  (`DirectorDashboardPage.tsx:158-184,298,365,501`).
- Dashboard pipeline uses horizontal overflow at all widths
  (`DirectorDashboardPage.tsx:276-293`).
- Tables and cards have page-local responsive behavior; there is no single
  app-level mobile navigation contract.
- Traceability uses responsive input/result grids and a wide content max width,
  but this is local to `TraceabilityPage.tsx`.

Touch targets are generally button/link-sized, but the audit found no shared
mobile task workflow or bottom-navigation treatment. A future mobile phase must
not be inferred from the current desktop shell.

---

## 4. Role / permission handling

### 4.1 Auth shape

`artifacts/ocs-one/src/hooks/use-auth.ts:20-51` calls `GET /api/auth/me`
with credentials and maps 401 to an unauthenticated state. The frontend role
union is:

```text
owner | director | supervisor | operator | viewer | dealer
```

The authenticated user includes the identity fields consumed by the hook and
an optional `dealerId`. `AppLayout` consumes `user`, `isLoading`, and
`isAuthenticated`; `Sidebar` consumes `user.role`.

### 4.2 Current visible gates

- `Sidebar` hides the entire factory navigation for `dealer`.
- `Sidebar` exposes Developer and Access only to `director` and `owner`.
- `Sidebar` exposes legacy Dispatch Orders only to `owner`.
- `AppLayout` blocks dealer users from factory locations and leaves the dealer
  portal path available.
- Login redirects dealer users to `/fulfillment/dealers`; other roles go to
  `/dashboard` (`pages/LoginPage.tsx:26-31`).
- Page/action checks exist in individual features, including purchase-order
  creation, master writes, product advancement, cell correction, material
  issue, and user-account management. These checks must not be broadened or
  changed by UI-IA-01.
- There is no universal frontend route-level role wrapper.

### 4.3 Dealer-specific handling

`DealerPortalPage` uses `user.dealerId` for a linked dealer and disables the
dealer list query for dealer users
(`features/dealer/pages/DealerPortalPage.tsx:29-49`). Dealer session errors
can redirect to `/login?reason=dealer-access-changed` through
`hooks/dealer-session.ts`.

The current frontend dealer gate is a prefix check:
`location.startsWith("/fulfillment/dealers")` in `AppLayout.tsx:31-44`.
Only `/fulfillment/dealers` is currently routed in `App.tsx`; this distinction
must be preserved and not widened accidentally.

### 4.4 Important current inconsistencies

- The global command palette has no role filtering and can expose destinations
  hidden in the Sidebar.
- `UserMenu.tsx:13-50` displays hard-coded “Abhishek”, “Director”, and email
  text rather than the authenticated user. Its “Log out” entry is a link to
  `/login`, while `useLogout` in `use-auth.ts:86-100` performs the actual
  logout request and cache clear. This is factual existing behavior and is
  outside UI-IA-01 unless explicitly included in scope.
- Frontend route matching alone does not prove backend authorization.

UI-IA-01 must preserve all current role visibility and action restrictions
verbatim. No permission changes are authorized by this audit.

---

## 5. Reusable UI / ODS components

### 5.1 Certified ODS layer

The ODS registry is documented in
`artifacts/ocs-one/docs/ods-component-registry.md:1-31,429-455`.
The barrel at `artifacts/ocs-one/src/components/ods/index.ts:1-34` exports:

```text
ModuleHeader
OdsCertBadge
OdsStatusBadge
OdsEmptyState
OdsTableSkeleton
OdsSearchBar
OdsToolbar
OdsDrawer
OdsDialog
OdsDataTable
OdsCommandPalette
OdsCorrectionHistory
OdsMetricCard
OdsMetricGrid
OdsChartCard
OdsTimeline
OdsStepper
OdsPageLayout
```

There is no generic `OdsCard`; pages generally use the shadcn
`components/ui/card.tsx` primitive directly.

### 5.2 Relevant primitive inventory

| Primitive | Current path | Current usage / audit result |
|---|---|---|
| Page shell | `components/ods/OdsPageLayout.tsx` | Canonical ODS shell; wraps `AppLayout`; not used uniformly |
| Module header | `components/ods/ModuleHeader.tsx` | Used by production lists and other module pages |
| Cards | `components/ui/card.tsx` | Used directly throughout dashboards/detail pages |
| Metrics | `components/ods/OdsMetricCard.tsx`, `OdsMetricGrid.tsx` | Used by current dashboard KPI grid |
| Tables | `components/ods/OdsDataTable.tsx`, `components/ui/table.tsx` | ODS table supports sorting, visibility, density, selection, loading, empty state, pagination, keyboard navigation |
| Badges/status | `components/ods/OdsStatusBadge.tsx`, `OdsCertBadge.tsx` | ODS semantic status/certification surfaces exist; several detail pages still use local color maps |
| Tabs | `components/ui/tabs.tsx:1-53` | Exists and exports `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` |
| Drawers/dialogs | `components/ods/OdsDrawer.tsx`, `OdsDialog.tsx`; `components/ui/drawer.tsx`, `dialog.tsx`, `sheet.tsx` | Shared primitives exist; feature pages use a mixture of ODS and direct Radix/shadcn primitives |
| Command/search | `components/ods/OdsCommandPalette.tsx`, `OdsSearchBar.tsx`, `OdsToolbar.tsx` | Global command palette exists; Sidebar has no search field |
| Breadcrumbs | `components/ui/breadcrumb.tsx:1-114` | Primitive exists but no consuming TSX usage was found; pages use ad hoc back links |
| Empty/loading/error | `OdsEmptyState`, `OdsTableSkeleton`, page-local errors | Certified primitives exist, but detail pages often use spinner/plain not-found text; Traceability has richer retryable states |
| Responsive container | `OdsPageLayout.tsx`; `AppLayout.tsx` | Shared shell exists, but page layout conventions are mixed |

### 5.3 Navigation support gaps

- Sidebar supports a collapsed rail, nested groups, one explicit collapsible
  section, path/query-aware active links, and persisted scroll.
- Sidebar has no recent or pinned state.
- Sidebar has no search field.
- Global command/search exists but is static and role-unaware.
- A Tabs primitive exists and is already used by Product and Production Order
  detail pages.
- Existing components can support collapsible sections, status cards, and
  pipeline cards; no existing component was found for My Work, recently used,
  pinned/favorites, or object identity headers as a shared ODS primitive.

---

## 6. Production-order data audit

### 6.1 Current list path

The active production-order list is
`artifacts/ocs-one/src/features/manufacturing/pages/OrdersListPage.tsx`.
It calls generated `useListProductionOrders` with page, page size, search,
status, priority, and stage filters (`OrdersListPage.tsx:122-136`).
The generated client request is a GET to
`/api/manufacturing/orders`; the server list route is
`artifacts/api-server/src/routes/manufacturing/orders.ts:27-91`.

The generated item type is
`lib/api-zod/src/generated/types/productionOrder.ts:12-33`.

### 6.2 Field availability

| Guideline field | Source | Exact current availability | Client-derivable? |
|---|---|---|---|
| Order # | `ProductionOrder.orderNumber`; `GET /api/manufacturing/orders` | Available | Yes |
| Product | `ProductionOrder.productId` | Only nullable product ID; no name/SKU/product projection | No faithful display identity |
| Stage | `ProductionOrder.currentStage` | Available and nullable; enum covers cell allocation, BMS allocation, assembly, compression, charging, testing, quality control, packing | Yes, label only |
| Progress | List item has no percent, stage sequence position, or stages array | Missing | No |
| Priority | `ProductionOrder.priority` | Available; generated values are low/medium/high | Yes |
| Age | `ProductionOrder.createdAt` | Available | Yes for order age as `now - createdAt`; not stage age |
| Status | `ProductionOrder.status` | Available | Yes |
| Stage timestamps | `ProductionOrderDetail.stages[]` only | Missing from list response; detail stage type has started/paused/resumed/completed/approved timestamps | Not for the list without additional detail reads |
| Order completion timestamp | Production-order list/schema | Missing; `updatedAt` is not a completion timestamp | No |
| Product display identity in dashboard recent orders | `/api/dashboard/director` `recentOrders[]` | Not returned as name/SKU; dashboard renders battery/order identifier | No |

The current list renders Order #, Battery #, Factory Manager, Stage, Status,
Priority, and date-only Created (`OrdersListPage.tsx:34-96`). The dashboard
recent-order row renders `batteryNumber ?? orderNumber`, status, stage, and
priority, but not product, progress, or age
(`DirectorDashboardPage.tsx:321-362`).

### 6.3 Mandatory stop-list

The Phase 9 guideline requires stopping instead of guessing when the target
production-order data is unavailable.

1. **Missing Product display identity**
   - Current endpoints: `GET /api/manufacturing/orders` and
     `GET /api/dashboard/director`.
   - Current shape: nullable `productId`; no product name/SKU projection.
   - Why it cannot be derived: a UUID does not provide the operator-facing
     product identity without a read join or an additional product lookup.
   - Smallest possible additive to consider later: a read-only product display
     projection in the order list/dashboard response. Do not implement in
     UI-IA-01.

2. **Missing Progress**
   - Current endpoint: `GET /api/manufacturing/orders`.
   - Current shape: `currentStage`, status, dates, and IDs; no stage list,
     ordered stage position, or percentage.
   - Why it cannot be derived: current stage alone does not prove how much of
     the workflow is complete, especially across configurable workflows.
   - Smallest possible additive to consider later: a read-only progress
     projection based on the authoritative workflow/stage data. Do not
     implement in UI-IA-01.

3. **Missing stage-age/order-completion timestamps**
   - Current list has `createdAt` and `updatedAt`; detail stages have timestamps.
   - Why it cannot be derived: `updatedAt` cannot be treated as completion, and
     list rows do not include the current-stage timestamps.
   - Smallest possible additive to consider later: a read-only list projection
     of the selected age basis. Do not infer it from `updatedAt`.

**Conclusion:** Order #, Stage, Priority, Status, and order Age from
`createdAt` are available. Product display identity and Progress are not. The
target §10 table cannot be implemented faithfully from the active list data.
UI-IA-01 must stop at this boundary and must not add backend fields.

---

## 7. Object / detail page patterns

### 7.1 GRN detail

Route: `/inventory/grns/:id` → `features/inventory/pages/GrnDetailPage.tsx`.

- Fetches the GRN, transactions, supplier/material context, and inspections.
- Supports operational actions including post, delete, inspect, and put-away.
- Uses spinner/plain not-found states (`GrnDetailPage.tsx:177-193`).
- Header uses a back link, GRN identity, status, supplier, and date
  (`:198-215`).
- Content presents lines, transactions, and dialogs.
- Uses `OdsStatusBadge` for status (`:209-214`).
- Uses direct dialog primitives for several workflows.

### 7.2 Product detail

Route: `/products/:id` → `features/products/pages/ProductDetailPage.tsx`.

- Hero identity card with QR and status/serial badges.
- Metadata and a role-gated lifecycle advance action.
- Four tabs: 360 Traceability, Genealogy, Timeline, Details
  (`ProductDetailPage.tsx:169-241`).
- Composes `ProductTraceabilityView`, `ProductGenealogyView`, and
  `ProductEventsView`.
- Uses local status-color maps rather than `OdsStatusBadge`
  (`ProductDetailPage.tsx:25-42,120-125`).
- Breadcrumb treatment is a plain back link plus slash text
  (`:100-109`).

### 7.3 Production Order detail

Route: `/manufacturing/orders/:id` → 
`features/manufacturing/pages/OrderDetailPage.tsx`.

- Hero identity/priority card with QR.
- Stage stepper.
- Five tabs: Active Stage, Materials, Timeline, Genealogy, Digital Passport
  (`OrderDetailPage.tsx:157-260`).
- Composes `StageStepper`, `StageCard`, `TimelineView`, `GenealogyView`, and
  `MaterialIssuePanel`.
- Uses local status treatment and a plain back-link breadcrumb pattern.

### 7.4 Other analogues

No standalone detail page was found for Lot, Supplier, Material, or Serial.
Supplier and Material are master list/form surfaces. Lots appear in inventory
list/lookup data and genealogy nodes. Serial lookup exists in the product
identity/composition path rather than a standalone serial route.

**Strongest convention for UI-IA-03:** the Product and Production Order pages
already establish the closest object-page pattern: identity header, status and
metadata, QR/identity affordance, tabs, and domain-specific views. GRN is the
closest operational transaction-detail analogue. A shared identity header and
breadcrumb convention would be new reusable UI work, not a reason to alter
certified backend behavior.

---

## 8. Genealogy / Traceability integration

### 8.1 Current certified page

`artifacts/ocs-one/src/features/products/pages/TraceabilityPage.tsx` is
mounted at `/traceability` by `App.tsx:108-114`. It is a read-only Batch 73-E
console and uses `ModuleHeader`, `OdsDataTable`, and `OdsEmptyState`.

The four local modes are declared at `TraceabilityPage.tsx:63-70`:

```text
Upstream       Order → source lots
Downstream     Lot → consumers
Composition    Serial → certified cells
Recall         Attribute → affected units
```

### 8.2 Hooks and API reads

The page uses generated React Query hooks only:

- `useGetGenealogyUpstream`
  → `GET /api/genealogy/upstream?production_order_id=`
- `useGetGenealogyDownstream`
  → `GET /api/genealogy/downstream?lot_id=`
- `useGetGenealogyComposition`
  → `GET /api/genealogy/composition?product_id=|serial_number=`
- `useGetGenealogyRecall`
  → `GET /api/genealogy/recall?template_id=&attribute_code=&min=&max=&date_from=&date_to=`

Hook setup is `TraceabilityPage.tsx:573-608`. The authenticated read-only
server routes are mounted in `artifacts/api-server/src/routes/index.ts:53-56`
and implemented in `artifacts/api-server/src/routes/genealogy.ts`.

### 8.3 Current lookup and linking behavior

- Upstream accepts an order number or UUID-like order ID. It searches
  production orders and resolves a selected order before tracing
  (`TraceabilityPage.tsx:632-644`).
- Downstream accepts a lot ID or lot number. Lot numbers are resolved through
  the generated inventory-lot list before the lot-ID genealogy request
  (`:646-652,749-763`).
- Composition accepts a product ID or serial number using a UUID-shape
  heuristic (`:654-659,765`).
- Recall selects a template, version, attribute, numeric minimum/maximum, and
  optional paired dates with strict validation (`:662-679,806-873`).
- State is local React state. There is no `useLocation`, URL search parsing,
  query-parameter initialization, or deep-link state in the page. The mode,
  input, and active result cannot currently be deep-linked.

### 8.4 Evidence behavior

`CitationBadge` is defined at `TraceabilityPage.tsx:88-116`. It visibly renders
`type · id`, exposes an accessible copy action, and has a disabled unavailable
state. The page surfaces `document_cited` across:

- upstream issue, bulk issue, lot, and captured attributes
  (`:305-380`);
- downstream consumer rows (`:384-424`);
- composition product, order, consumed lots, and cell provenance
  (`:427-484`);
- recall matches and capped downstream consumers (`:487-551`).

Recall downstream results display total, returned, and truncated metadata.
The server cap is 25 consumers per matching lot; the UI renders the cap state
(`TraceabilityPage.tsx:518-545` and `routes/genealogy.ts`).

The page explicitly excludes component-serial UI in its composition helper text:
“Only consumed lots and certified cell provenance are shown; component serials
are excluded” (`TraceabilityPage.tsx:765`). This certified boundary must remain
unchanged. A finished-product serial displayed as an output is not a
component-serial genealogy edge.

### 8.5 UI-IA-04 deep-link implications

Future TRACE actions from these contexts need a defined URL/state contract:

| Source context | Current trace target | Current deep-link status |
|---|---|---|
| Production Order | Upstream by `production_order_id` | Not deep-linkable; prefill/state must be added later |
| Lot / Supplier Lot | Downstream by resolved `lot_id` | Not deep-linkable; lot number-to-ID resolution exists inside page |
| Product | Composition by `product_id` or serial | Product detail has a separate genealogy tab; console state is not URL-addressable |
| Supplier | No standalone supplier-lot detail route | Requires future supplier-lot context mapping; do not infer genealogy |

No UI-IA-01 implementation should modify `TraceabilityPage.tsx`,
`routes/genealogy.ts`, generated hooks, or the certified 73-D APIs.

---

## 9. UI-IA-01 file map

This is a predicted implementation map only. No files in this section were
modified by the audit.

### A. Definitely modify

- `artifacts/ocs-one/src/components/layout/Sidebar.tsx` — replace or
  reorganize the current flat section presentation into the Phase 9
  collapsible, hierarchical navigation while preserving every href and gate.
- `artifacts/ocs-one/src/pages/DirectorDashboardPage.tsx` — reorder current
  live widgets into Status, Pipeline, Attention/Alerts, Production Orders,
  My Work, and remaining summary groups using only available data.
- `artifacts/ocs-one/src/layouts/AppLayout.tsx` — likely shell integration
  point if the new navigation requires a shared section/search/mobile state.
  Do not change its auth or dealer rules.

### B. Possibly modify

- `artifacts/ocs-one/src/components/layout/TopNavbar.tsx` — only if the
  hierarchy needs a command/search or mobile-navigation trigger.
- `artifacts/ocs-one/src/components/ods/OdsCommandPalette.tsx` — only if the
  command surface is brought into role-aware navigation parity.
- `artifacts/ocs-one/src/components/ods/OdsPageLayout.tsx` — only if the
  dashboard shell adopts the canonical ODS page-shell contract.
- `artifacts/ocs-one/src/components/ods/OdsMetricCard.tsx`
  and `OdsMetricGrid.tsx` — only if the existing status-card primitives need
  presentation changes; do not introduce a second metric pattern.
- `artifacts/ocs-one/src/features/dashboard/hooks/useDirectorDashboard.ts` —
  not authorized for new backend fields; only inspect/use existing response
  fields if needed.
- `artifacts/ocs-one/src/config/routes.ts` — do not assume it should be
  changed; it is stale and not the active router. Any cleanup would be
  outside UI-IA-01 unless separately authorized.

### C. New files likely required

- `artifacts/ocs-one/src/components/layout/SectionNav.tsx` or an equivalent
  focused navigation primitive, if the Sidebar becomes too large.
- A dashboard-only component split such as
  `artifacts/ocs-one/src/features/dashboard/components/*`, only if the
  existing monolith is decomposed during implementation.
- A `MyWork`/attention component is conditional. Existing data must first be
  mapped; do not invent work items or new API fields.

### D. Must not touch

- `artifacts/api-server/**`
- `lib/db/**`
- `lib/api-spec/**`
- `lib/api-client-react/**`
- `lib/api-zod/**`
- `artifacts/ocs-one/src/features/products/pages/TraceabilityPage.tsx`
- `artifacts/api-server/src/routes/genealogy.ts`
- certified business logic, database schema, auth middleware, and permission
  enforcement
- route URLs or route removal
- tests and package manifests unless a later implementation task explicitly
  authorizes frontend-only regression coverage

The predicted UI-IA-01 scope contains no backend, API, database, generated
client, or certified-adjacent file changes.

---

## 10. Route preservation map

The future hierarchy may move labels and parents, but these URL destinations
must remain unchanged.

| Existing route family / exact routes | Current component(s) | Future conceptual location |
|---|---|---|
| `/dashboard` | `DirectorDashboardPage` | Command → Dashboard |
| `/design-system` | `DesignSystemPage` | Developer / internal utility |
| `/developer/architecture`, `/developer/performance`, `/developer/security`, `/developer/configuration` | Developer pages | Admin / Developer |
| `/administration/users` | `UserAccountsPage` | Admin → Users |
| `/product-inventory`, `/product-inventory/list`, `/products/imported` | Product inventory/import pages | Operations → Inventory / Products |
| `/products`, `/products/:id` | Product list/detail | Object Pages → Product |
| `/traceability` | `TraceabilityPage` | Operations → Traceability |
| `/masters/products`, `/masters/product-categories`, `/masters/product-workflows` | Product master pages | Master Data → Products |
| `/masters/material-categories`, `/masters/materials`, `/masters/material-workflows` | Material master/workflow pages | Master Data → Materials |
| `/masters/suppliers` | `SupplierMasterPage` | Master Data → Suppliers |
| `/masters/cells`, `/masters/bms`, `/masters/cabinets`, `/masters/connectors`, `/masters/cables`, `/masters/busbars` | Component master pages | Master Data → Materials → Type/Category |
| `/masters/chargers`, `/masters/test-equipment` | Equipment master pages | Master Data → Equipment |
| `/masters/boms`, `/masters/boms/new`, `/masters/boms/:id`, `/masters/boms/:id/edit` | BOM pages | Master Data → BOM |
| `/procurement`, `/procurement/purchase-orders`, `/procurement/purchase-orders/new`, `/procurement/purchase-orders/:id` | Procurement pages | Supply Chain → Procurement |
| `/inventory`, `/inventory/grns`, `/inventory/grns/new`, `/inventory/grns/:id` | GRN pages | Supply Chain → Receiving |
| `/inventory/inspections`, `/inventory/inspections/new`, `/inventory/inspections/:id` | Inspection pages | Supply Chain → Receiving / Quality |
| `/inventory/stock` | `StockPage` | Operations → Inventory |
| `/inventory/workflow-assignments` | Workflow assignment | Admin / Configuration |
| `/manufacturing`, `/manufacturing/orders`, `/manufacturing/orders/:id` | Order list/detail | Operations → Production |
| `/manufacturing/chargers` | Charger management | Admin / Equipment |
| `/manufacturing/charging-dashboard`, `/manufacturing/testing-dashboard` | Stage dashboards | Operations → Production |
| `/manufacturing/rework` | Rework queue | My Work / Production |
| `/cells/receiving`, `/cells/grading`, `/cells/inventory`, `/cells/matching`, `/cells/config` | Cell workflow pages | Operations → Production / Quality |
| `/cells/transfers/:id` | Transfer detail | Supply Chain → Transfers |
| `/fulfillment/packing`, `/fulfillment/dispatch`, `/fulfillment/dispatch/list`, `/fulfillment/dispatch/:id` | Fulfillment pages | Operations → Logistics / Sales → Dispatch |
| `/fulfillment/dealers` | Dealer portal | Sales → Dealers; dealer-only entry |
| `/after-sales/registrations`, `/after-sales/warranties` | After-sales pages | Sales / After-Sales |
| `/logistics`, `/logistics/packing-dashboard` | Packing dashboard | Operations → Logistics |
| `/logistics/dealers` | Dealer master | Master Data / Sales → Dealers |
| `/logistics/dispatch-orders`, `/logistics/dispatch-orders/:id` | Legacy dispatch pages | Sales → Dispatch; owner-only visibility preserved |
| `/reports/executive`, `/reports/production`, `/reports/cells`, `/reports/quality`, `/reports/inventory`, `/reports/logistics`, `/reports/export` | Report pages | Analytics |
| `/`, `/login`, unmatched paths | Redirect, login, not-found | Shell/public behavior preserved |

No URL change, route removal, or functionality removal is authorized.

---

## 11. Permission preservation map

| Current role | Current frontend access/visibility | UI-IA-01 placement rule |
|---|---|---|
| `owner` | Factory navigation, director-only Developer and Access sections, owner-only legacy Dispatch Orders | Preserve all current destinations and owner-only visibility |
| `director` | Factory navigation plus Developer and Access sections; not owner-only legacy Dispatch Orders | Preserve director-only sections without adding owner-only entries |
| `supervisor` | Factory navigation subject to page/action gates; no Developer or Access sidebar sections | Preserve existing page/action access; do not broaden navigation |
| `operator` | Factory navigation subject to page/action gates; no Developer or Access sidebar sections | Preserve existing page/action access; do not broaden navigation |
| `viewer` | Factory navigation/read surfaces subject to existing page/backend gates; no Developer or Access sidebar sections | Preserve read-only behavior and no write affordances |
| `dealer` | Login redirects to dealer portal; no factory sidebar; AppLayout blocks non-portal locations | Preserve the dedicated dealer portal and current isolation |

The sidebar role checks live in `Sidebar.tsx:327-338`, the auth/dealer shell
checks live in `AppLayout.tsx:13-44`, and feature-specific checks remain in
their current pages/components. The command palette must not become an
unfiltered bypass for a hidden route during UI-IA-01.

---

## 12. Final audit summary

### A. CURRENT ARCHITECTURE

OCS One uses a Wouter route tree in `App.tsx`, a component-level
`AppLayout` auth shell, a single `navSections` sidebar array with nested
groups, and a global static command palette. The active factory dashboard is
`DirectorDashboardPage` at `/dashboard`, backed by a live director dashboard
endpoint refreshed every 30 seconds. ODS primitives exist alongside direct
shadcn primitives, and Product/Production Order detail pages already establish
an object-page/tab pattern.

### B. UI-IA-01 DESIGN OPPORTUNITIES

Frontend-only work can:

1. Reorganize the existing sidebar into the Phase 9 conceptual hierarchy.
2. Preserve every route while presenting Masters as configuration-driven
   Materials/Product/BOM/Equipment workspaces.
3. Make Dashboard Status, Pipeline, Alerts, Production Orders, and existing
   operational summaries visually hierarchical.
4. Add a focused navigation section/search presentation using existing
   primitives.
5. Reuse existing live KPI, pipeline, alert, quality, logistics, and equipment
   data without backend changes.
6. Make the command palette and sidebar navigation consistent, provided role
   filtering is preserved.

### C. STOP-LIST

Do not implement Product display identity or Progress in the target Production
Orders table from current list data. `productId` is not a display identity and
`currentStage` is not a progress percentage. Do not infer stage age or
completion from `updatedAt`. Report the missing fields and consider any
read-only additive separately after UI-IA-01.

### D. ROUTE PRESERVATION

All routes in `App.tsx:96-204` must remain mounted at the same URLs. Redirect
routes for `/`, `/procurement`, `/inventory`, `/manufacturing`, and `/logistics`
must remain. The QC query-owned route must continue to distinguish the filtered
orders view from the plain orders link.

### E. PERMISSION PRESERVATION

Preserve the six-role model, dealer isolation, director/owner-only Developer
and Access sections, owner-only legacy Dispatch Orders visibility, and all
existing page/action gates. Do not use navigation restructuring to broaden
access. Do not treat a hidden sidebar item as permission enforcement, and do
not let the command palette bypass role visibility.

### F. PREDICTED FILES

Primary files:

- `artifacts/ocs-one/src/components/layout/Sidebar.tsx`
- `artifacts/ocs-one/src/pages/DirectorDashboardPage.tsx`
- `artifacts/ocs-one/src/layouts/AppLayout.tsx` if shared navigation state is needed

Possible supporting files:

- `artifacts/ocs-one/src/components/layout/TopNavbar.tsx`
- `artifacts/ocs-one/src/components/ods/OdsCommandPalette.tsx`
- `artifacts/ocs-one/src/components/ods/OdsPageLayout.tsx`
- focused new navigation/dashboard components under `artifacts/ocs-one/src/components/layout/` or `features/dashboard/components/`

### G. CERTIFIED-ADJACENT FILES

**NONE.** The implementation map must not require changes to genealogy,
backend, database, OpenAPI, generated client, authentication middleware, or
certified business logic.

### H. IMPLEMENTATION RISKS

1. The stale `config/routes.ts` can be mistaken for the active route source.
2. The command palette is currently role-unaware and does not mirror the
   Sidebar.
3. Grouped sidebar items do not currently apply `ownerOnly` filtering.
4. Dealer isolation relies on a frontend prefix check in addition to backend
   protection.
5. The current shell has no responsive navigation drawer; collapsing the rail
   is not equivalent to mobile navigation.
6. Production-order Product and Progress fields are absent from the list
   response; implementing the target table without a stop would create
   invented data.
7. The dashboard is a large page-local component; broad refactoring could
   accidentally change live aggregation semantics or navigation links.
8. Product and Production Order detail pages use local status/breadcrumb
   patterns in parallel with ODS primitives, so a shared visual grammar needs
   controlled scope.

### I. RECOMMENDED UI-IA-01 IMPLEMENTATION ORDER

1. Freeze the route and permission preservation maps above as acceptance
   criteria.
2. Define the new sidebar hierarchy from the existing `navSections` entries;
   do not delete or rename hrefs.
3. Preserve dealer, director/owner, and owner-only filters while making all
   navigation surfaces role-aware.
4. Reorganize the dashboard using the current live response only:
   Status → Pipeline → Attention/Alerts → Production Orders → existing
   summaries/Quick Actions.
5. Keep the Production Orders stop-list explicit; implement only Order #,
   Stage, Status, Priority, and honest order Age if the UI batch includes that
   table. Do not add Product or Progress.
6. Add only the smallest focused shared frontend components needed for the
   hierarchy; keep ODS usage consistent.
7. Verify route preservation, role visibility, viewer read-only behavior,
   dealer isolation, typecheck, production build, and frontend/backend diff
   boundaries.
8. Leave authenticated UI automation claims to follow-up #90, as required by
   the Phase 9 guideline.

**Audit conclusion:** The current frontend can support UI-IA-01 entirely within
the frontend, but the Production Orders Product/Progress target is blocked by
the documented data stop-list. No backend-lite decision should be made inside
the audit or silently folded into UI-IA-01.