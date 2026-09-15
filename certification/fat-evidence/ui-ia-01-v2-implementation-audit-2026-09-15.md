# UI-IA-01 v2 — Implementation Evidence

**Product:** OCS One  
**Date:** 2026-09-15  
**Scope:** Frontend-only navigation and dashboard consolidation  
**Authority:** Phase 0 audit and UI-IA-01 v2 brief

## Files changed

Application source changed only:

- `artifacts/ocs-one/src/components/layout/Sidebar.tsx`
- `artifacts/ocs-one/src/pages/DirectorDashboardPage.tsx`
- `artifacts/ocs-one/src/layouts/AppLayout.tsx` — acceptance-proven collapse persistence fix

This evidence note is the accompanying certification record.
No authentication/dealer rule, route declaration, backend, database, OpenAPI,
generated client, or genealogy behavior changed. No commit was made.

## Navigation evidence

- The existing sidebar destinations remain the source of navigation; the work
  only reorganizes their labels and nesting.
- `/dashboard` remains under Command.
- Existing developer and user-account destinations remain director/owner-only.
- `/logistics/dispatch-orders` remains owner-only.
- Dealer users still receive no factory sidebar sections, and the existing
  `AppLayout` dealer restriction is untouched.
- Collapsible section state, recently used destinations, pinned destinations,
  active-route highlighting, and scroll persistence are client-only state using
  the existing local/session storage pattern.
- Imported Product Registration has one canonical navigation placement under
  Master Data → Products.
- There is no fabricated Transfers list link: the audited router exposes only
  `/cells/transfers/:id`, while the receiving workspace already links to those
  details. This remains a navigation inventory gap for a later scope.
- The `My Tasks` hash destination is treated as a specialized dashboard
  destination so it does not incorrectly highlight the plain Dashboard item.
- The acceptance run initially found that the shell collapse state reset after
  reload. The smallest fix was to persist the existing shell boolean under the
  existing sidebar local-storage namespace in `AppLayout`; the auth and dealer
  checks were not changed. The director and viewer reload checks now pass.

## Artifact 1 — Route-preservation proof

The pre-implementation set was extracted from the Phase 0 audit route table.
The post-implementation set was extracted from the live `App.tsx` `<Route>`
declarations. Both sets contain 79 paths.

```text
PRE_ROUTE_SET
/
/administration/users
/after-sales/registrations
/after-sales/warranties
/cells/config
/cells/grading
/cells/inventory
/cells/matching
/cells/receiving
/cells/transfers/:id
/dashboard
/design-system
/developer/architecture
/developer/configuration
/developer/performance
/developer/security
/fulfillment/dealers
/fulfillment/dispatch
/fulfillment/dispatch/:id
/fulfillment/dispatch/list
/fulfillment/packing
/inventory
/inventory/grns
/inventory/grns/:id
/inventory/grns/new
/inventory/inspections
/inventory/inspections/:id
/inventory/inspections/new
/inventory/stock
/inventory/workflow-assignments
/login
/logistics
/logistics/dealers
/logistics/dispatch-orders
/logistics/dispatch-orders/:id
/logistics/packing-dashboard
/manufacturing
/manufacturing/chargers
/manufacturing/charging-dashboard
/manufacturing/orders
/manufacturing/orders/:id
/manufacturing/rework
/manufacturing/testing-dashboard
/masters/bms
/masters/boms
/masters/boms/:id
/masters/boms/:id/edit
/masters/boms/new
/masters/busbars
/masters/cabinets
/masters/cables
/masters/cells
/masters/chargers
/masters/connectors
/masters/material-categories
/masters/material-workflows
/masters/materials
/masters/product-categories
/masters/product-workflows
/masters/products
/masters/suppliers
/masters/test-equipment
/procurement
/procurement/purchase-orders
/procurement/purchase-orders/:id
/procurement/purchase-orders/new
/product-inventory
/product-inventory/list
/products
/products/:id
/products/imported
/reports/cells
/reports/executive
/reports/export
/reports/inventory
/reports/logistics
/reports/production
/reports/quality
/traceability
```

```text
POST_ROUTE_SET
/
/administration/users
/after-sales/registrations
/after-sales/warranties
/cells/config
/cells/grading
/cells/inventory
/cells/matching
/cells/receiving
/cells/transfers/:id
/dashboard
/design-system
/developer/architecture
/developer/configuration
/developer/performance
/developer/security
/fulfillment/dealers
/fulfillment/dispatch
/fulfillment/dispatch/:id
/fulfillment/dispatch/list
/fulfillment/packing
/inventory
/inventory/grns
/inventory/grns/:id
/inventory/grns/new
/inventory/inspections
/inventory/inspections/:id
/inventory/inspections/new
/inventory/stock
/inventory/workflow-assignments
/login
/logistics
/logistics/dealers
/logistics/dispatch-orders
/logistics/dispatch-orders/:id
/logistics/packing-dashboard
/manufacturing
/manufacturing/chargers
/manufacturing/charging-dashboard
/manufacturing/orders
/manufacturing/orders/:id
/manufacturing/rework
/manufacturing/testing-dashboard
/masters/bms
/masters/boms
/masters/boms/:id
/masters/boms/:id/edit
/masters/boms/new
/masters/busbars
/masters/cabinets
/masters/cables
/masters/cells
/masters/chargers
/masters/connectors
/masters/material-categories
/masters/material-workflows
/masters/materials
/masters/product-categories
/masters/product-workflows
/masters/products
/masters/suppliers
/masters/test-equipment
/procurement
/procurement/purchase-orders
/procurement/purchase-orders/:id
/procurement/purchase-orders/new
/product-inventory
/product-inventory/list
/products
/products/:id
/products/imported
/reports/cells
/reports/executive
/reports/export
/reports/inventory
/reports/logistics
/reports/production
/reports/quality
/traceability
```

```text
DIFF_ONLY_PRE
<empty>
DIFF_ONLY_POST
<empty>
IDENTICAL true
```

The pre/post navigation-destination sets were also extracted from the
baseline and current Sidebar source:

```text
PRE_SIDEBAR_DESTINATIONS 58
POST_SIDEBAR_DESTINATIONS 58
SIDEBAR_ONLY_PRE <empty>
SIDEBAR_ONLY_POST <empty>
CURRENT_SIDEBAR_DESTINATIONS_WITHOUT_EXACT_ROUTER_PATH <empty>
```

This proves that removing the duplicate navigation entry did not remove its
destination. Direct authenticated checks passed:

- `/products/imported` — Imported Product Registration rendered for Director and
  Viewer. Screenshots:
  [Director](ui-ia-01-v2/director-imported-product.png),
  [Viewer](ui-ia-01-v2/viewer-imported-product.png).
- `/masters/materials` — legacy deep link rendered Material Master for Director
  and Viewer. Screenshots:
  [Director](ui-ia-01-v2/director-legacy-materials.png),
  [Viewer](ui-ia-01-v2/viewer-legacy-materials.png).
- Pipeline stage click-through — the first rendered stage opened
  `/cells/receiving` for Director and Viewer.

## Artifact 2 — Manual acceptance matrix

Authenticated sessions were exercised through the actual login form using the
seeded FAT accounts. The dashboard response was live during the run.

| Role | Collapse persistence | My Tasks / My Work honesty | Pipeline click-through | Legacy deep-link | Dashboard zones | Role-correct navigation |
|---|---|---|---|---|---|---|
| Director | **PASS** — collapse persisted after reload; [collapsed screenshot](ui-ia-01-v2/director-sidebar-collapsed.png) | **PASS** — only verified QC approvals, Rework queue, Production in progress, and Dispatch ready feeds rendered; [dashboard](ui-ia-01-v2/director-dashboard.png) | **PASS** — opened `/cells/receiving` | **PASS** — `/masters/materials`; [screenshot](ui-ia-01-v2/director-legacy-materials.png) | **PASS** — Factory Status, Manufacturing Pipeline, Attention/Alerts, Production Orders, and My Work rendered with live data | **PASS** — direct section query found Admin and Developer; [scrolled navigation](ui-ia-01-v2/director-admin-developer-nav.png); owner-only Dispatch Orders was absent |
| Viewer | **PASS** — the same shell collapse state persisted after reload | **PASS** — same verified feeds only; no submit controls in My Work | **PASS** — opened `/cells/receiving` | **PASS** — `/masters/materials`; [screenshot](ui-ia-01-v2/viewer-legacy-materials.png) | **PASS** — all dashboard zones rendered; [dashboard](ui-ia-01-v2/viewer-dashboard.png) | **PASS** — Developer and User Accounts were absent; My Work contained no submit buttons |
| Dealer | **N/A** — dealer remains on the dedicated portal surface | **N/A** — factory My Work is not exposed | **N/A** — dealer is not exposed to factory pipeline | **N/A** — dealer is not exposed to factory deep links | **N/A** — factory dashboard is blocked by the existing shell gate | **PASS** — dealer landed on `/fulfillment/dealers` with factory navigation hidden; [screenshot](ui-ia-01-v2/dealer-surface.png) |

Visual review: **PASS**. The dashboard reads in the intended order, the pipeline
is the visual hero, Attention and Alerts are distinct, the production-order
table is restrained to supported fields, and the Details strip keeps secondary
live feeds accessible without competing with the primary hierarchy.

## Dashboard data-source audit

Every live dashboard element below is supplied by the existing
`useDirectorDashboard()` hook, which reads the existing
`GET /api/dashboard/director` response. No new hook, query, endpoint, or
polling mechanism was added.

| UI element | Existing response source |
|---|---|
| Factory Status cards | `kpis.todayTarget`, `kpis.todayCompleted`, `kpis.inProgress`, `kpis.chargerUtilization` |
| Manufacturing Pipeline | `pipeline[]`, including server-provided counts, stage links, and health |
| Attention Required | `kpis.qcPending`, `kpis.reworkQueue`, equipment maintenance counts, and pipeline `blocked` counts |
| Factory Alerts | `alerts[]` |
| Production Orders | `recentOrders[].orderNumber`, `currentStage`, `priority`, `createdAt` |
| Order Age | deterministic client calculation from confirmed `recentOrders[].createdAt` |
| My Work | existing `kpis.qcPending`, `reworkQueue`, `inProgress`, and `dispatchReady` feeds |
| Details → additional metrics | remaining `kpis` fields |
| Details → operator activity | `operatorActivity[]` |
| Details → equipment and cells | `equipmentStatus` and `cellInventory` |
| Details → quality and logistics | `qualitySummary` and `logistics` |

The existing hook's 30-second React Query refresh remains unchanged. No new
business-state calculation or inferred lifecycle state was introduced.

## Stop-list and widget disposition for UI-IA-02

### Confirmed stop-list

- **Product display identity:** the dashboard response does not include a
  product name/SKU projection. `productId` is not an operator-facing identity.
  Product is therefore omitted from Production Orders.
- **Progress:** the dashboard response provides current stage but no workflow
  position or percentage. Progress is therefore omitted.
- **Stage age / completion age:** order age uses only `createdAt`. No
  stage-age or completion inference is made from `updatedAt`.
- **Transfers navigation:** no list route was found; only transfer detail routes
  exist. No invented list destination was added.
- **Authenticated visual smoke:** the unauthenticated preview correctly lands on
  the existing login route. A status-only direct API smoke with the seeded FAT
  director returned 200 for login and 200 for
  `/api/dashboard/director`, with the expected existing response keys and
  `recentOrders[].createdAt`. Authenticated browser screenshot coverage remains
  a manual environment check because the preview screenshot tool did not share
  the shell session cookie.

### Widget disposition

- Live KPI, pipeline, alert, order, operator, equipment, cell, quality, and
  logistics feeds remain visible.
- The dashboard's primary hierarchy is Status → Pipeline →
  Attention/Alerts → Production Orders → My Work.
- Existing secondary live/derived feeds are demoted into one muted,
  collapsible Details strip.
- The previous static Quick Actions block was not promoted into operational
  meaning; existing sidebar navigation remains the route-preserving access
  surface.
- Product identity and Progress remain deferred exactly as required by the
  UI-IA-02 stop-list.

## Verification

- `pnpm --filter @workspace/ocs-one run typecheck` — passed.
- `PORT=5000 BASE_PATH=/ocs-one/ pnpm --filter @workspace/ocs-one run build` —
  passed. Vite emitted existing sourcemap and chunk-size warnings only.
- `git diff --check` — passed.
- Preview screenshot — existing unauthenticated login screen rendered without
  a frontend runtime error; API auth returned 401 as expected without a
  session.
- Direct authenticated API smoke — FAT director login 200; dashboard response
  200; no credentials or response contents printed.
- Route declarations remain unchanged in `artifacts/ocs-one/src/App.tsx`.