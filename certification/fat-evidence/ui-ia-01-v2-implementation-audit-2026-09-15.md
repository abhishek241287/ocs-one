# UI-IA-01 v2 — Implementation Evidence

**Product:** OCS One  
**Date:** 2026-09-15  
**Scope:** Frontend-only navigation and dashboard consolidation  
**Authority:** Phase 0 audit and UI-IA-01 v2 brief

## Files changed

Application source changed only:

- `artifacts/ocs-one/src/components/layout/Sidebar.tsx`
- `artifacts/ocs-one/src/pages/DirectorDashboardPage.tsx`

This evidence note is the accompanying certification record.
No route declarations, authentication shell, backend, database, OpenAPI,
generated client, or genealogy files changed. No commit was made.

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