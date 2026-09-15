# UI-IA-01 v2.1 — Navigation Hierarchy Correction Evidence

**Product:** OCS One  
**Date:** 2026-09-15  
**Assignment:** UI-IA-01 v2.1 — Navigation Hierarchy Correction  
**Scope:** Presentation-only sidebar correction

## Authority and boundary

The v2.1 correction preserves the certified v2 route inventory, permissions,
dashboard, API contracts, backend behavior, and certified flows.

Frozen model:

```text
Domain → Workspace → Function
```

- Level 0 always exposes Command and My Work utilities, followed by the seven
  business domains.
- At most one business domain is expanded.
- Opening a domain exposes only its immediate workspaces.
- Opening a multi-destination workspace exposes its existing function links.
- The active route reveals only the minimum domain/workspace branch required to
  locate it.
- Persisted state is sanitized to one domain and one workspace branch.
- Dashboard changes, UI-IA-02, and mobile navigation remain out of scope.

Only this application source file changed for v2.1:

- `artifacts/ocs-one/src/components/layout/Sidebar.tsx`

No route declaration, `DirectorDashboardPage`, backend, database, OpenAPI,
generated client, permission rule, or certified flow changed. No commit was
created for v2.1.

## Route-preservation proof

The v2 baseline route set was extracted from the Phase 0 audit and compared
with the live `App.tsx` route declarations after v2.1:

```text
PRE_ROUTE_COUNT 79
POST_ROUTE_COUNT 79
DIFF_ONLY_PRE <empty>
DIFF_ONLY_POST <empty>
IDENTICAL true
```

The baseline and current Sidebar destination inventories were also compared:

```text
PRE_SIDEBAR_DESTINATIONS 58
POST_SIDEBAR_DESTINATIONS 58
SIDEBAR_ONLY_PRE <empty>
SIDEBAR_ONLY_POST <empty>
CURRENT_SIDEBAR_DESTINATIONS_WITHOUT_EXACT_ROUTER_PATH <empty>
```

The previously certified `/products/imported` and legacy
`/masters/materials` destinations remain in the unchanged route set.

## Hierarchy and persistence proof

All checks were run through authenticated FAT sessions with the real login
form.

| Check | Result | Evidence |
|---|---|---|
| Fresh/default state has all business domains collapsed | **PASS** | [All domains collapsed](ui-ia-01-v2.1/all-domains-collapsed.png) |
| Master Data reveals immediate workspaces only | **PASS** | [Master Data workspaces](ui-ia-01-v2.1/master-data-workspaces.png) |
| Materials reveals its contextual function list | **PASS** | [Materials expanded](ui-ia-01-v2.1/master-data-materials-expanded.png) |
| Materials branch persists after reload | **PASS** | [Persisted Materials branch](ui-ia-01-v2.1/master-data-materials-persisted.png) |
| Opening Operations closes Master Data | **PASS** | [Operations workspaces](ui-ia-01-v2.1/operations-workspaces.png) |
| Production reveals its contextual function list | **PASS** | [Production expanded](ui-ia-01-v2.1/operations-production-expanded.png) |
| Active Cell Master reveals only the minimum branch | **PASS** | [Active Cell Master hierarchy](ui-ia-01-v2.1/active-cell-master-hierarchy.png) |
| Persisted all-open state sanitizes to one domain | **PASS** — restored to Operations | Browser proof |
| Active route overrides persisted domain choice | **PASS** — Cell Master restored Master Data → Materials | Browser proof |

The browser proof also asserted that the active Cell Master branch did not
expose unrelated Product, Analytics, Production Orders, or Equipment function
links.

## Role snapshots

| Role | Result | Evidence |
|---|---|---|
| Director | **PASS** — all domains collapsed by default; Director-only Developer remains visible when opened; dashboard surface unchanged | [Director navigation](ui-ia-01-v2.1/director-navigation-collapsed.png) |
| Viewer | **PASS** — all domains collapsed; Developer and User Accounts remain hidden | [Viewer navigation](ui-ia-01-v2.1/viewer-navigation-collapsed.png) |
| Dealer | **PASS** — dealer portal rendered at `/fulfillment/dealers`; factory navigation sections remained hidden | [Dealer navigation](ui-ia-01-v2.1/dealer-navigation.png) |

Existing owner-only and director-only gates were copied without widening or
narrowing access.

## Dashboard and backend invariants

```text
DIRECTOR_DASHBOARD_DIFF <empty>
BACKEND_DIFF <empty>
DASHBOARD_VISUAL_ASSERTION true
```

The dashboard browser assertion found the existing Factory Status,
Manufacturing Pipeline, Attention and Alerts, Production Orders, and My Work
zones, with no Quick Actions regression. No dashboard source file was in the
v2.1 git scope.

## Verification

- `pnpm --filter @workspace/ocs-one run typecheck` — passed.
- `PORT=5000 BASE_PATH=/ocs-one/ pnpm --filter @workspace/ocs-one run build` —
  passed. Existing sourcemap and chunk-size warnings only.
- `git diff --check` — passed.
- Git scope — `artifacts/ocs-one/src/components/layout/Sidebar.tsx` only.
- Route preservation — 79/79, empty two-way diff.
- Sidebar destination preservation — 58/58, empty two-way diff.
- Role snapshots — Director, Viewer, and Dealer passed.
- Accordion/persistence screenshots — passed.
- Backend/generated/OpenAPI/certified-flow diff — empty.
- UI-IA-02 and mobile work — intentionally not started.