# OCS One — Engineering Audit
**Date:** 2026-06-27  
**Codebase commit:** 2b5a6993  
**Auditor:** Automated Engineering Audit Sprint  

---

## Executive Summary

OCS One is a well-structured TypeScript monorepo with a clean contract-first API (Orval codegen from OpenAPI), Drizzle ORM, and a React/Vite/shadcn frontend. The architecture is sound for a V1 ERP. However, several gaps must be closed before a production launch:

1. **No authentication enforcement on any API route** — the login form is purely cosmetic
2. **No database indexes** beyond PKs and unique constraints — will degrade severely at production data volumes
3. **A race condition in order/battery number generation** — non-atomic count-based sequencing
4. **OpenAPI spec is 14 routes behind** — logistics and dashboard routes undocumented
5. **Significant dead code and unused assets** that add bundle weight and confusion

---

## 1. Architecture

### 1.1 Structure

```
artifacts-monorepo/
├── artifacts/
│   ├── api-server/          Express 5 API (3 969 lines of route code)
│   └── ocs-one/             React + Vite frontend (16 291 lines)
├── lib/
│   ├── db/                  Drizzle schema + migrations
│   ├── api-spec/            OpenAPI 3.1 YAML
│   └── api-zod/             Orval-generated hooks + Zod schemas
└── scripts/                 Utility scripts
```

Overall the feature-folder structure (`features/manufacturing/`, `features/cells/`, etc.) is sound and consistent.

### 1.2 Duplicate Logic — CRITICAL

**Stage sequence defined in two places:**

| File | Definition |
|---|---|
| `artifacts/api-server/src/routes/manufacturing/helpers.ts:44` | `STAGE_SEQUENCE` array (authoritative) |
| `artifacts/api-server/src/routes/dashboard/director.ts:248` | `STAGE_META` array (duplicate, adds display metadata) |

Any stage added to the enum must be added in both files. This has already drifted: `STAGE_SEQUENCE` has `bms_allocation` at position 2, but `director.ts` `STAGE_META` lists a different display order. **Recommendation:** move `STAGE_META` to `helpers.ts` and import it in `director.ts`.

### 1.3 Dead Code

| File | Lines | Status |
|---|---|---|
| `artifacts/ocs-one/src/pages/DashboardPage.tsx` | 227 | **Not imported anywhere** in `App.tsx`. Replaced by `DirectorDashboardPage.tsx`. Safe to delete. |
| `artifacts/ocs-one/src/features/dispatch/` | ~20 | Scaffold stubs only — empty `index.ts`, `components/index.ts`, `hooks/index.ts`, `types/index.ts` |
| `artifacts/ocs-one/src/features/inventory/` | ~20 | Same — pure stubs |
| `artifacts/ocs-one/src/features/production/` | ~20 | Same — pure stubs |
| `artifacts/ocs-one/src/features/products/` | ~20 | Same — pure stubs |
| `artifacts/ocs-one/src/features/qc/` | ~20 | Same — pure stubs |
| `artifacts/ocs-one/src/features/service/` | ~20 | Same — pure stubs |

**Action:** Delete `DashboardPage.tsx`. Keep the 6 stub folders but add a `// TODO: Sprint N` comment so they don't get confused with real implementations.

### 1.4 Unused shadcn/ui Components

The following 13 shadcn components are installed but never imported by any feature or page file:

`accordion`, `aspect-ratio`, `carousel`, `chart`, `context-menu`, `drawer`, `hover-card`, `input-otp`, `kbd`, `menubar`, `navigation-menu`, `resizable`, `sidebar` (the shadcn one — the custom `Sidebar.tsx` is what's used)

These add ~150 KB to the bundle. They should remain for now (shadcn components are zero-cost at build if tree-shaken by Vite), but document that they are available for future use.

### 1.5 Duplicate Patterns

**Inconsistent query invalidation in mutations:**

Some pages use Orval-generated query keys:
```ts
queryClient.invalidateQueries({ queryKey: getListReworkTicketsQueryKey() });
```

Others use raw string keys:
```ts
queryClient.invalidateQueries({ queryKey: ["/api/cells"] });
queryClient.invalidateQueries({ queryKey: ["/api/cells/inventory"] });
```

If the API base URL ever changes, raw-string keys will silently stop invalidating. All mutations should use the generated `get*QueryKey()` helpers from `@workspace/api-zod`.

**HTTP verb inconsistency:**

| Domain | Update verb |
|---|---|
| Manufacturing orders | `PATCH` |
| Logistics dealers | `PUT` |
| Logistics dispatch orders | `PUT` |
| Masters (all) | `PATCH` |

`PUT` implies full replacement; `PATCH` is partial update. All routes accept partial updates — they should all use `PATCH`.

---

## 2. Code Quality

### 2.1 Typecheck

Both `@workspace/api-server` and `@workspace/ocs-one` typechecks **pass clean** as of the audited commit.

### 2.2 Lint

ESLint is not installed or configured in this project. There is no `.eslintrc` or `eslint.config.*` file. The `pnpm --filter @workspace/ocs-one exec eslint` command returns `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command "eslint" not found`. **Recommendation:** add `@typescript-eslint/eslint-plugin` and `eslint-plugin-react-hooks` to the root workspace.

### 2.3 Files Exceeding 500 Lines

| File | Lines | Recommendation |
|---|---|---|
| `components/ui/sidebar.tsx` | 727 | shadcn generated — leave as-is |
| `pages/DirectorDashboardPage.tsx` | 544 | Extract 9 section components into `features/dashboard/components/` |
| `features/manufacturing/.../TestingCard.tsx` | 520 | Extract `TestResultsTable`, `TestSummaryBar`, `StartTestingForm` |
| `features/manufacturing/.../ChargingCard.tsx` | 421 | Extract `ChargerSelector`, `ChargingProgressBar` |
| `routes/manufacturing/stages.ts` | 621 | Split into `stages-start.ts`, `stages-complete.ts`, `stages-approve.ts` |
| `routes/dashboard/director.ts` | 417 | Extract `buildPipelineSection()`, `buildAlertsSection()` to helpers |

### 2.4 Missing Global Error Boundary

`App.tsx` has no React `ErrorBoundary` wrapping the router. An unhandled render error in any component will crash the entire app with a blank white screen. Add a top-level `<ErrorBoundary>` before release.

---

## 3. Frontend Consistency

### 3.1 Loading / Error / Empty States

| Page | Loading | Error | Empty |
|---|---|---|---|
| `OrdersListPage` | ✅ Spinner | ✅ Alert | ✅ Empty state |
| `CellInventoryPage` | ✅ | ✅ | ✅ |
| `DirectorDashboardPage` | ✅ | ✅ | — (not applicable) |
| `DealerMasterPage` | ✅ | ✅ | ✅ |
| `PackingDashboardPage` | ✅ | ✅ | ✅ |
| `ChargerManagementPage` | ✅ | ✅ | — |

State handling is generally consistent across pages. No critical gaps found.

### 3.2 Mobile Responsiveness

The app uses Tailwind responsive prefixes (`lg:`, `md:`, `sm:`) throughout. The sidebar has a proper mobile collapse. However, complex data tables (`CellMatchingPage`, `DispatchOrderDetailPage`) do not have horizontal scroll wrappers — they will overflow on screens narrower than ~900px. Add `<div className="overflow-x-auto">` wrappers around all `<Table>` components.

### 3.3 Authentication (UI Layer)

`LoginPage.tsx` has a form that calls `handleLogin()` which simply redirects to `/dashboard` without any server call. There is no token stored, no session cookie set, no auth guard on any route. Any user who navigates directly to `/dashboard` without going through `/login` first will have full access. See Security Report for the full finding.

---

## 4. API Contract

### 4.1 OpenAPI Spec vs Implementation

| Category | Count |
|---|---|
| Paths in `openapi.yaml` | 76 |
| Route handlers in implementation | 71 |
| Routes in spec but not implemented | ~5 (minor — some listed as future) |
| Routes implemented but not in spec | **14** (all logistics + dashboard routes) |

The 14 unspecified routes:
- `GET /api/logistics/packing-dashboard`
- `GET/POST/GET/:id/PUT/:id/DELETE/:id /api/logistics/dealers`
- `GET/POST/GET/:id/PUT/:id/POST/:id/items/DELETE/:id/items/:itemId/POST/:id/status /api/logistics/dispatch-orders`
- `GET /api/dashboard/director`

These were built after the OpenAPI spec was last updated. Codegen will not generate typed hooks for them until they are added to the spec.

### 4.2 Error Response Format

All routes return `{ error: string }` for client errors — consistent. Masters `common.ts` is the canonical implementation. One edge case: the `status` toggle endpoint returns `parsed.error.message` (Zod v4 format) — verify this serializes as expected on the client.

---

## 5. Dependencies

### api-server dependencies
`express ^5.2.1`, `drizzle-orm`, `pg`, `pino`, `pino-http`, `zod`, `cors`, `@workspace/db`, `@workspace/api-zod`

### ocs-one dependencies  
`react`, `react-dom`, `@tanstack/react-query`, `wouter`, `axios`, `lucide-react`, `tailwindcss`, `@radix-ui/*`, `zod`, `react-hook-form`, `@hookform/resolvers`

No obviously outdated or vulnerable packages identified at this level of analysis. Run `pnpm audit` for a full CVE report.
