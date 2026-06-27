# CW-01 — Cell Receiving: Module Acceptance Test

| Field | Value |
|-------|-------|
| **Wave** | CW-01 |
| **Module** | Cell Receiving |
| **Version** | v1.0-foundation |
| **Tester** | Replit Agent (automated inspection) |
| **Test Date** | 2026-06-27 |
| **Environment** | Development — Replit (Node 24, PostgreSQL, Vite 7.3.5) |

---

## MAT-01 — Page & Navigation Inspection

> Pre-test check. Must complete before functional test cases.
> 10 areas inspected. Evidence: source review + live API calls + browser console capture.

### MAT-01 Scorecard

| # | Area | Status | Notes |
|---|------|--------|-------|
| 1 | Sidebar Navigation | ✅ Pass | Cell Receiving link present under Manufacturing → Cell Lifecycle. Correct href `/cells/receiving`, icon `Package`, active-state logic correct. |
| 2 | Route Loading | ✅ Pass | Auth guard redirects unauthenticated `/cells/receiving` → `/login` (HTTP 401 on API, login page rendered). Authenticated route wraps in `AppLayout`. |
| 3 | API Connectivity | ✅ Pass | `GET /api/cells/lots` → HTTP 200 in **22.8 ms**. Response schema: `{ items: [...], meta: { total, page, pageSize, totalPages } }`. Auth required (401 without cookie). |
| 4 | Browser Console Errors | ❌ Fail | Two browser-level reload errors captured: `Failed to reload DealerMasterPage.tsx` and `Failed to reload DispatchOrdersPage.tsx`. Cause: both import `useOdsNotify` from `@/components/ods/OdsNotify` (non-existent) instead of `@/hooks/use-ods-notify`. Affects Logistics module; no Cell Receiving–specific console errors. See **DEF-CW01-004**. |
| 5 | Module Header | ⚠️ Partial | `ModuleHeader` present with `icon="📦"`, `title="Cell Receiving"`, dynamic description `"N lots received"`. DEFECT: `certification="certified"` prop renders a Certified badge on an uncertified module. See **DEF-CW01-002**. |
| 6 | Toolbar | ✅ Pass | `OdsToolbar` with `search` (placeholder "Search lot number…"), `onRefresh` callback, and `isRefreshing={isFetching}` state. `searchRef` wired for keyboard shortcuts via `useModuleShortcuts`. |
| 7 | Search | ✅ Pass | Search state managed, page resets to 1 on change. `GET /api/cells/lots?search=nonexistent_xyz` → HTTP 200, `items: []`. Live filter confirmed working at API layer. |
| 8 | Loading Skeleton | ✅ Pass | `OdsTableSkeleton rows={6} columns={10}` rendered when `isLoading === true`. Correct ODS pattern. |
| 9 | Empty State | ✅ Pass | `OdsEmptyState icon="📦" title="No lots received yet"` with action button "Receive New Lot" (opens dialog). Shown when `lots.length === 0`. |
| 10 | ODS Compliance | ⚠️ Partial | ODS components used: `ModuleHeader` ✅, `OdsToolbar` ✅, `OdsTableSkeleton` ✅, `OdsEmptyState` ✅ — all imported from `@/components/ods`. DEFECT: page uses `useToast` (from `@/hooks/use-toast`) instead of `useOdsNotify` (from `@/hooks/use-ods-notify`). See **DEF-CW01-001**. |

**Status legend:** ✅ Pass · ❌ Fail · ⚠️ Partial · ⬜ Not run

### MAT-01 Evidence

**Screenshot — unauthenticated access to `/cells/receiving`:**
Auth guard is active. Navigating to `/cells/receiving` without a session redirects to the login page. The page title, branding, and sign-in form render correctly.

> `http://localhost:80/cells/receiving → Login page (HTTP 401 on /api/auth/me)`

**API probe results:**

```
GET /api/healthz              → 200  4.7 ms
GET /api/cells/lots           → 200  22.8 ms  (authenticated)
GET /api/cells/lots?search=nonexistent_xyz  → 200  8.0 ms  { items: [], meta: { total: 0 } }
GET /api/cells/lots           → 401  (no cookie)
```

**Vite server errors (from workflow log, 2026-06-27):**

```
3:49:44 PM [vite] Internal server error: Failed to resolve import
  "@/components/ods/OdsNotify" from
  "src/features/logistics/pages/DispatchOrdersPage.tsx"
  File: ...DispatchOrdersPage.tsx:18:29

3:50:57 PM [vite] Pre-transform error: Failed to resolve import
  "@/components/ods/OdsNotify" from
  "src/features/logistics/pages/DealerMasterPage.tsx"
  File: ...DealerMasterPage.tsx:17:29
```

**Browser console errors (captured):**

```
[vite] Failed to reload /src/features/logistics/pages/DealerMasterPage.tsx.
[vite] Failed to reload /src/features/logistics/pages/DispatchOrdersPage.tsx.
```

**No errors were produced by CellReceivingPage.tsx itself.**

### MAT-01 Defects Raised

| Defect ID | Title | Severity | Area |
|-----------|-------|----------|------|
| DEF-CW01-001 | `useToast` used instead of `useOdsNotify` in CellReceivingPage | Medium | ODS Compliance |
| DEF-CW01-002 | `certification="certified"` shown on uncertified module | Low | Module Header |
| DEF-CW01-003 | React Fragment missing `key` prop in `lots.map()` | Low | Render |
| DEF-CW01-004 | `@/components/ods/OdsNotify` import error — DealerMasterPage + DispatchOrdersPage | High | Logistics (found in CW-01 session) |
| DEF-CW01-005 | Sidebar stub routes `#qr`, `#warranty`, `#service` are non-functional | Low | Sidebar Navigation |

### MAT-01 Summary

| Metric | Value |
|--------|-------|
| Areas inspected | 10 |
| Pass | 7 |
| Partial | 2 |
| Fail | 1 |
| Defects raised | 5 (1 High · 1 Medium · 3 Low) |

### MAT-01 Decision

**CONDITIONAL PASS** — the Cell Receiving page structure, route guard, API connectivity, toolbar, search, loading skeleton, empty state, and core ODS components all function correctly. Two remediation items must be resolved before advancing to functional tests:

1. **DEF-CW01-001 (Medium)** — Replace `useToast` with `useOdsNotify` in `CellReceivingPage.tsx`.
2. **DEF-CW01-004 (High)** — Fix `@/components/ods/OdsNotify` import path in `DealerMasterPage.tsx` and `DispatchOrdersPage.tsx` (Logistics module; causes browser console errors visible in every session).

DEF-CW01-002, -003, -005 are Low severity and may be remediated concurrently or deferred to a maintenance release with explicit approval.

---

## 10-Point Functional Scorecard

> Not yet run. Awaiting MAT-01 defect remediation.

| # | Area | Status | Cases Run | Pass | Fail | Notes |
|---|------|--------|-----------|------|------|-------|
| 1 | Create | ⬜ | | | | |
| 2 | Edit | ⬜ | | | | |
| 3 | Save | ⬜ | | | | |
| 4 | Search | ⬜ | | | | |
| 5 | Filter | ⬜ | | | | |
| 6 | Validation | ⬜ | | | | |
| 7 | Relationships | ⬜ | | | | |
| 8 | Security | ⬜ | | | | |
| 9 | Audit | ⬜ | | | | |
| 10 | Performance | ⬜ | | | | |

**Status legend:** ✅ Pass · ❌ Fail · ⚠️ Partial · ⬜ Not run

---

## Test Cases

### 1 — Create

| ID | Description | Expected Result | Actual Result | Status | Defect |
|----|-------------|-----------------|---------------|--------|--------|
| MAT-CR-01 | Create a new cell lot with all required fields | Lot saved, appears in list, ID assigned | | ⬜ | |
| MAT-CR-02 | Create a cell lot with minimum required fields only | Lot saved with defaults applied | | ⬜ | |
| MAT-CR-03 | Create a cell lot with duplicate batch number | Validation error shown | | ⬜ | |
| MAT-CR-04 | Submit create form with all fields empty | All required-field errors shown | | ⬜ | |

### 2 — Edit

| ID | Description | Expected Result | Actual Result | Status | Defect |
|----|-------------|-----------------|---------------|--------|--------|
| MAT-ED-01 | Edit an existing cell lot's notes and supplier | Changes saved and reflected in detail view | | ⬜ | |
| MAT-ED-02 | Edit a received lot's quantity | Updated quantity saved | | ⬜ | |
| MAT-ED-03 | Navigate away from edit form without saving | Unsaved changes not persisted | | ⬜ | |

### 3 — Save

| ID | Description | Expected Result | Actual Result | Status | Defect |
|----|-------------|-----------------|---------------|--------|--------|
| MAT-SV-01 | Save triggers success notification | ODS notify success toast shown | | ⬜ | |
| MAT-SV-02 | Save with network error | Error toast shown, data not lost | | ⬜ | |
| MAT-SV-03 | Rapid double-submit (double-click Save) | Request deduped, one record created | | ⬜ | |

### 4 — Search

| ID | Description | Expected Result | Actual Result | Status | Defect |
|----|-------------|-----------------|---------------|--------|--------|
| MAT-SR-01 | Search by supplier name | Matching lots returned | | ⬜ | |
| MAT-SR-02 | Search by batch number | Exact match returned | | ⬜ | |
| MAT-SR-03 | Search with no results | Empty state component shown | | ⬜ | |
| MAT-SR-04 | Clear search | Full list restored | | ⬜ | |

### 5 — Filter

| ID | Description | Expected Result | Actual Result | Status | Defect |
|----|-------------|-----------------|---------------|--------|--------|
| MAT-FL-01 | Filter by lot status (received / grading / complete) | Filtered list correct | | ⬜ | |
| MAT-FL-02 | Filter by cell model | Only matching lots shown | | ⬜ | |
| MAT-FL-03 | Combine search + filter | Results satisfy both constraints | | ⬜ | |
| MAT-FL-04 | Reset all filters | Full unfiltered list restored | | ⬜ | |

### 6 — Validation

| ID | Description | Expected Result | Actual Result | Status | Defect |
|----|-------------|-----------------|---------------|--------|--------|
| MAT-VL-01 | Lot quantity set to 0 or negative | Validation error shown | | ⬜ | |
| MAT-VL-02 | Supplier name exceeds max length | Validation error shown | | ⬜ | |
| MAT-VL-03 | Received date set to future date | Validation error shown | | ⬜ | |
| MAT-VL-04 | Cell model not selected | Required-field error shown | | ⬜ | |
| MAT-VL-05 | API rejects invalid payload independently of frontend | 400 response with field errors | | ⬜ | |

### 7 — Relationships

| ID | Description | Expected Result | Actual Result | Status | Defect |
|----|-------------|-----------------|---------------|--------|--------|
| MAT-RL-01 | Cell lot links to correct cell model from masters | Cell model name resolves correctly | | ⬜ | |
| MAT-RL-02 | Cells created within a lot reference the lot ID | Cell detail shows correct parent lot | | ⬜ | |
| MAT-RL-03 | Deleting a lot with linked cells blocked (or cascades correctly) | No orphan records | | ⬜ | |
| MAT-RL-04 | Lot appears in Cell Inventory after creation | Inventory count updated | | ⬜ | |

### 8 — Security

| ID | Description | Expected Result | Actual Result | Status | Defect |
|----|-------------|-----------------|---------------|--------|--------|
| MAT-SC-01 | Unauthenticated GET `/api/cells/lots` returns 401 | 401 Unauthorized | | ⬜ | |
| MAT-SC-02 | Viewer role cannot create a lot (POST blocked) | 403 Forbidden | | ⬜ | |
| MAT-SC-03 | SQL injection attempt in search field | Parameterised query — no injection | | ⬜ | |
| MAT-SC-04 | Authenticated operator can create and edit lots | 200 OK | | ⬜ | |

### 9 — Audit

| ID | Description | Expected Result | Actual Result | Status | Defect |
|----|-------------|-----------------|---------------|--------|--------|
| MAT-AU-01 | Lot creation records creator and timestamp | `created_at` and `created_by` populated | | ⬜ | |
| MAT-AU-02 | Lot update records updater and timestamp | `updated_at` and `updated_by` populated | | ⬜ | |
| MAT-AU-03 | Stage history (if applicable) shows receiving event | Event present in timeline | | ⬜ | |

### 10 — Performance

| ID | Description | Expected Result | Actual Result | Status | Defect |
|----|-------------|-----------------|---------------|--------|--------|
| MAT-PF-01 | GET `/api/cells/lots` with 100 records | Response < 300 ms | | ⬜ | |
| MAT-PF-02 | Cell Receiving page initial load | FCP < 1.5 s | | ⬜ | |
| MAT-PF-03 | Search response time | Results < 500 ms | | ⬜ | |

---

## Summary

| Metric | Value |
|--------|-------|
| Total test cases | 32 |
| Pass | — |
| Fail | — |
| Blocked | — |
| Not run | 32 |
| **Pass rate** | — |
| Defects filed | 5 (MAT-01 inspection only) |

## MAT Decision

- [ ] **PASS** — all mandatory tests pass; proceed to defect resolution
- [ ] **FAIL** — one or more mandatory tests failed; do not proceed to certification

**Signed:** _________________________ **Date:** _____________
