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

> Pre-test check executed **twice** — initial inspection, then re-tested after defect remediation.

### MAT-01 Final Scorecard (post-remediation re-test)

| # | Area | Status | Notes |
|---|------|--------|-------|
| 1 | Sidebar Navigation | ✅ Pass | Cell Receiving link at `/cells/receiving` under Manufacturing → Cell Lifecycle. Correct icon, label, active-state logic. Stub items (Traceability/After-Sales) now render with disabled state — no false navigation. DEF-CW01-005 resolved. |
| 2 | Route Loading | ✅ Pass | Auth guard active: unauthenticated `/cells/receiving` → login redirect (HTTP 401 on API probe). Authenticated route wraps in `AppLayout`. |
| 3 | API Connectivity | ✅ Pass | `GET /api/cells/lots` → HTTP 200 in **18.2 ms**. Response: `{ items: [...], meta: { total, page, pageSize, totalPages } }`. 401 without cookie. |
| 4 | Browser Console Errors | ✅ Pass | **Zero errors** in re-test session. Previous `Failed to reload` errors (DEF-CW01-004) confirmed absent. Only expected events: auth 401 resources and browser autocomplete hint on login form. |
| 5 | Module Header | ✅ Pass | `ModuleHeader` present, `icon="📦"`, `title="Cell Receiving"`, dynamic description. `certification` prop removed — module now correctly shows "development" state. DEF-CW01-002 resolved. |
| 6 | Toolbar | ✅ Pass | `OdsToolbar` with search, `onRefresh`, `isRefreshing={isFetching}`, `searchRef` for keyboard shortcuts. |
| 7 | Search | ✅ Pass | Search input with placeholder "Search lot number…". API probe: `?search=nonexistent_xyz` → HTTP 200, `items: []`, 3.9 ms. Filter confirmed at API layer. |
| 8 | Loading Skeleton | ✅ Pass | `OdsTableSkeleton rows={6} columns={10}` shown on `isLoading`. Correct ODS pattern. |
| 9 | Empty State | ✅ Pass | `OdsEmptyState icon="📦" title="No lots received yet"` with action "Receive New Lot" that opens the dialog. |
| 10 | ODS Compliance | ✅ Pass | All five ODS structural components used correctly: `ModuleHeader`, `OdsToolbar`, `OdsTableSkeleton`, `OdsEmptyState` from `@/components/ods`. Notifications now use `useOdsNotify` from `@/hooks/use-ods-notify`. Fragment key fixed. DEF-CW01-001, -003 resolved. |

**10 / 10 Pass**

---

### MAT-01 Initial Inspection (2026-06-27 — before remediation)

| # | Area | Initial Status | Defect |
|---|------|---------------|--------|
| 1 | Sidebar Navigation | ✅ Pass | DEF-CW01-005 noted (stub routes) |
| 2 | Route Loading | ✅ Pass | — |
| 3 | API Connectivity | ✅ Pass | — |
| 4 | Browser Console Errors | ❌ Fail | DEF-CW01-004 (High) |
| 5 | Module Header | ⚠️ Partial | DEF-CW01-002 (Low) |
| 6 | Toolbar | ✅ Pass | — |
| 7 | Search | ✅ Pass | — |
| 8 | Loading Skeleton | ✅ Pass | — |
| 9 | Empty State | ✅ Pass | — |
| 10 | ODS Compliance | ⚠️ Partial | DEF-CW01-001 (Medium), DEF-CW01-003 (Low) |

Initial result: 7 Pass · 2 Partial · 1 Fail. 5 defects raised. Conditional pass.

---

### MAT-01 Verification Evidence

**API re-test probes (2026-06-27 post-remediation):**

```
GET /api/healthz                                → HTTP 200 in 3.7 ms
GET /api/cells/lots                (no cookie)  → HTTP 401 in 3.2 ms  ✅ auth guard
GET /api/cells/lots                (authed)     → HTTP 200 in 18.2 ms ✅ data returned
GET /api/cells/lots?search=nonexistent_xyz      → HTTP 200 in 3.9 ms  ✅ empty items
```

**TypeScript compile:**
```
pnpm --filter @workspace/ocs-one run typecheck
→ tsc -p tsconfig.json --noEmit
→ (clean exit, zero errors)
```

**Vite HMR log (post-fix):**
```
[vite] hmr update /src/features/cells/pages/CellReceivingPage.tsx  ← clean
[vite] hmr update /src/components/layout/Sidebar.tsx               ← clean
```
No `Internal server error`, no `Pre-transform error`, no `Failed to reload`.

**Browser console (re-test session):**
```
[vite] connecting...
[vite] connected.
[React DevTools hint]                                  ← expected info
Failed to load resource: 401 (Unauthorized)            ← auth guard (expected)
Failed to load resource: 401 (Unauthorized)            ← auth guard (expected)
[DOM] Input autocomplete hint on login form            ← browser suggestion, not an error
```

**Route guard screenshot:** `/cells/receiving` while unauthenticated → login page rendered correctly. OCS One branding, email/password fields, Sign In button all present.

### MAT-01 Defects Summary

| Defect ID | Title | Severity | Resolution |
|-----------|-------|----------|-----------|
| DEF-CW01-001 | `useToast` → `useOdsNotify` | Medium | ✅ Verified 2026-06-27 |
| DEF-CW01-002 | Premature `certification="certified"` badge | Low | ✅ Verified 2026-06-27 |
| DEF-CW01-003 | Fragment missing `key` prop | Low | ✅ Verified 2026-06-27 |
| DEF-CW01-004 | `@/components/ods/OdsNotify` import error (Logistics) | High | ✅ Verified 2026-06-27 |
| DEF-CW01-005 | Sidebar stub routes non-functional | Low | ✅ Verified 2026-06-27 |

**Open blockers: 0**

### MAT-01 Decision

✅ **FULL PASS** — All 10 areas pass on re-test. Zero open defects. Zero browser console errors. TypeScript compiles clean. Auth guard active. API connectivity confirmed. ODS compliance achieved.

MAT-01 complete. Cleared to proceed to MAT-02 functional tests.

---

## 10-Point Functional Scorecard

> Not yet run. MAT-01 cleared.

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
| Defects filed | 5 (all resolved, MAT-01 only) |

## MAT Decision

- [ ] **PASS** — all mandatory tests pass; proceed to defect resolution
- [ ] **FAIL** — one or more mandatory tests failed; do not proceed to certification

**Signed:** _________________________ **Date:** _____________
