# CW-01 — Cell Receiving: Module Acceptance Test

| Field | Value |
|-------|-------|
| **Wave** | CW-01 |
| **Module** | Cell Receiving |
| **Version** | v1.0-foundation |
| **Tester** | Replit Agent (automated inspection + API probe) |
| **Test Date** | 2026-06-27 |
| **Environment** | Development — Replit (Node 24, PostgreSQL, Vite 7.3.5) |

---

## MAT-01 — Page & Navigation ✅ APPROVED AND CLOSED

> **CTO Decision — 2026-06-27:** MAT-01 is officially accepted as PASSED.
> Authorization granted to begin MAT-02 – Functional Certification.

### MAT-01 Final Scorecard (post-remediation)

| # | Area | Status | Notes |
|---|------|--------|-------|
| 1 | Sidebar Navigation | ✅ Pass | Link at `/cells/receiving`, correct icon/label/active-state. Stubs now disabled. DEF-CW01-005 resolved. |
| 2 | Route Loading | ✅ Pass | Auth guard: unauthenticated → login redirect (HTTP 401). |
| 3 | API Connectivity | ✅ Pass | `GET /api/cells/lots` → HTTP 200 in 18 ms. 401 without cookie. |
| 4 | Browser Console Errors | ✅ Pass | Zero errors in re-test. DEF-CW01-004 confirmed absent. |
| 5 | Module Header | ✅ Pass | ModuleHeader correct. `certification="certified"` removed. DEF-CW01-002 resolved. |
| 6 | Toolbar | ✅ Pass | OdsToolbar with search, refresh, isFetching, searchRef. |
| 7 | Search | ✅ Pass | `?search=nonexistent_xyz` → HTTP 200 `{ items: [] }`. |
| 8 | Loading Skeleton | ✅ Pass | OdsTableSkeleton rows=6 cols=10 on isLoading. |
| 9 | Empty State | ✅ Pass | OdsEmptyState with action "Receive New Lot". |
| 10 | ODS Compliance | ✅ Pass | useOdsNotify, Fragment key, all 4 ODS components correct. DEF-CW01-001, -003 resolved. |

**10 / 10 Pass — Full Pass. Zero open defects. Zero console errors. TypeScript clean.**

### MAT-01 Initial Inspection (before remediation)

| # | Area | Initial Status | Defect |
|---|------|---------------|--------|
| 4 | Browser Console Errors | ❌ Fail | DEF-CW01-004 (High — Logistics import error) |
| 5 | Module Header | ⚠️ Partial | DEF-CW01-002 (Low — premature certified badge) |
| 10 | ODS Compliance | ⚠️ Partial | DEF-CW01-001 (Medium — useToast), DEF-CW01-003 (Low — Fragment key) |
| *Noted* | Sidebar | ✅ (stub defect noted) | DEF-CW01-005 (Low) |

Initial: 7 Pass · 2 Partial · 1 Fail. All 5 defects resolved and verified before re-test.

---

## MAT-02 — Functional Certification

**Executed:** 2026-06-27 · **Method:** Live API probes (curl + auth cookie) + source code review for client-side behaviour

### MAT-02 Scorecard

| # | Area | Status | Run | Pass | Fail | Notes |
|---|------|--------|-----|------|------|-------|
| 1 | Create | ⚠️ Partial | 4 | 2 | 2 | CR-03 ❌ duplicate→500, CR-04 ❌ empty→500 |
| 2 | Edit | ❌ Fail | 2 | 0 | 2 | No PATCH endpoint — DEF-CW01-007 |
| 3 | Save | ✅ Pass | 3 | 3 | 0 | Source-code verified (useOdsNotify + isPending guard) |
| 4 | Search | ⚠️ Partial | 4 | 3 | 1 | SR-01 ❌ supplier not searchable — DEF-CW01-010 |
| 5 | Filter | ❌ Fail | 4 | 0 | 4 | No filter at API or UI layer — DEF-CW01-011 |
| 6 | Validation | ⚠️ Partial | 5 | 1 | 4 | Only VL-05 SQL-injection passes |
| 7 | Relationships | ⚠️ Partial | 4 | 2 | 2 | cellModel free-text, no DELETE — DEF-CW01-012, -016 |
| 8 | Security | ⚠️ Partial | 4 | 3 | 1 | SC-02 ❌ viewer can create lots — DEF-CW01-008 |
| 9 | Audit | ⚠️ Partial | 3 | 1 | 2 | No edit, no history endpoint — DEF-CW01-007, -013 |
| 10 | Performance | ✅ Pass | 2 | 2 | 0 | PF-01 5 ms avg, PF-03 7 ms avg; PF-02 skipped (browser) |

**Status legend:** ✅ Pass · ❌ Fail · ⚠️ Partial · ⬜ Not run

### MAT-02 Test Cases

#### 1 — Create

| ID | Description | Expected | Actual | Status | Defect |
|----|-------------|----------|--------|--------|--------|
| MAT-CR-01 | Create lot with all required + optional fields | HTTP 201, lot in list, cells auto-generated | HTTP 201 in 64 ms · lot `LOT-MAT02-001` · 10 cells generated (CELL-20260627-000001…000010) | ✅ Pass | — |
| MAT-CR-02 | Create lot with minimum required fields only | HTTP 201, optional fields null | HTTP 201 in 12 ms · lot `LOT-MAT02-MIN` · invoiceNumber null · 1 cell generated | ✅ Pass | — |
| MAT-CR-03 | Duplicate lot number (LOT-MAT02-001) | HTTP 409 Conflict | HTTP 500 Internal Server Error — DB unique constraint `lot_number` not caught | ❌ Fail | DEF-CW01-009 |
| MAT-CR-04 | Submit empty body `{}` | HTTP 400 with field errors | HTTP 500 — ZodError not caught by Express error handler | ❌ Fail | DEF-CW01-006 |

#### 2 — Edit

| ID | Description | Expected | Actual | Status | Defect |
|----|-------------|----------|--------|--------|--------|
| MAT-ED-01 | PATCH lot — update remarks and supplier | HTTP 200, changes saved | HTTP 404 Not Found — no PATCH `/api/cells/lots/:id` endpoint | ❌ Fail | DEF-CW01-007 |
| MAT-ED-02 | PATCH lot — update quantity | HTTP 200, quantity updated | HTTP 404 — same as ED-01 | ❌ Fail | DEF-CW01-007 |
| MAT-ED-03 | Navigate away without saving | Changes not persisted | ⬜ Not run — blocked by missing edit endpoint | ⬜ | DEF-CW01-007 |

#### 3 — Save

| ID | Description | Expected | Actual | Status | Defect |
|----|-------------|----------|--------|--------|--------|
| MAT-SV-01 | Save triggers success notification | ODS notify success toast | `notify.success("Lot received", { description: "Individual cell records generated." })` called on `onSuccess` callback — verified via source | ✅ Pass | — |
| MAT-SV-02 | Save with network error triggers error notification | ODS notify error toast | `notify.error("Error", { description: e?.message ?? "Failed" })` called on `onError` callback — verified via source | ✅ Pass | — |
| MAT-SV-03 | Double-click submit deduped | One record created | `<Button disabled={createLot.isPending}>` — button disabled during in-flight request; verified via source | ✅ Pass | — |

#### 4 — Search

| ID | Description | Expected | Actual | Status | Defect |
|----|-------------|----------|--------|--------|--------|
| MAT-SR-01 | Search by supplier name "CATL" | Matching lots returned | HTTP 200 `{ items: [], total: 0 }` — search only uses `ilike(lotNumber, ...)`, supplier column excluded | ❌ Fail | DEF-CW01-010 |
| MAT-SR-02 | Search by lot number "LOT-2026-001" | Exact match returned | HTTP 200 · lot `LOT-2026-001` (CATL, 20 cells) returned correctly | ✅ Pass | — |
| MAT-SR-03 | Search with no results "ZZZNOMATCH9999" | Empty state shown | HTTP 200 `{ items: [], total: 0 }` — correct empty response | ✅ Pass | — |
| MAT-SR-04 | No search — full list | All lots shown | HTTP 200 · 8 lots returned · `total: 8` | ✅ Pass | — |

#### 5 — Filter

| ID | Description | Expected | Actual | Status | Defect |
|----|-------------|----------|--------|--------|--------|
| MAT-FL-01 | Filter by lot status (received / grading / complete) | Filtered list correct | No status filter parameter on `GET /api/cells/lots` — not implemented | ❌ Fail | DEF-CW01-011 |
| MAT-FL-02 | Filter by cell model | Only matching lots shown | No cellModel filter parameter — not implemented | ❌ Fail | DEF-CW01-011 |
| MAT-FL-03 | Combine search + filter | Both constraints satisfied | Not possible — filter layer missing | ❌ Fail | DEF-CW01-011 |
| MAT-FL-04 | Reset all filters | Full unfiltered list | Nothing to reset — filters not present | ❌ Fail | DEF-CW01-011 |

#### 6 — Validation

| ID | Description | Expected | Actual | Status | Defect |
|----|-------------|----------|--------|--------|--------|
| MAT-VL-01 | Quantity = 0 | HTTP 400 — `quantityReceived` min(1) fails | HTTP 500 — ZodError thrown (min(1) validation fires) but not caught | ❌ Fail | DEF-CW01-006 |
| MAT-VL-02 | Supplier = 5000-character string | HTTP 400 — max length exceeded | HTTP 201 — 5000-char supplier accepted · no max-length constraint in Zod schema or DB (`varchar` without explicit max in Drizzle) | ❌ Fail | DEF-CW01-014 |
| MAT-VL-03 | dateReceived = "2099-12-31" | HTTP 400 — future dates rejected | HTTP 201 — future date accepted · `dateReceived` declared `zod.string()` with no date/range validation | ❌ Fail | DEF-CW01-015 |
| MAT-VL-04 | Missing required field `cellModel` | HTTP 400 with field error | HTTP 500 — ZodError thrown (required field missing) but not caught | ❌ Fail | DEF-CW01-006 |
| MAT-VL-05 | SQL injection in `receivedBy` field | String stored safely; no injection | HTTP 201 · value stored as literal `"T'); DROP TABLE cell_lots; --"` · DB intact · 8 lots still queryable | ✅ Pass | — |

#### 7 — Relationships

| ID | Description | Expected | Actual | Status | Defect |
|----|-------------|----------|--------|--------|--------|
| MAT-RL-01 | Cell lot cellModel links to Cell Master record | Lot cellModel resolves to master FK | cellModel is `varchar` free text — no FK to `cell_masters` table. Lot `INR21700-50E` has no corresponding master record. Masters use different identifiers. | ❌ Fail | DEF-CW01-012 |
| MAT-RL-02 | Cells within a lot reference correct lot ID | `lotId` populated on each cell | HTTP 200 · 10 cells queried for lot `7b5837c7` · all have `lotId: "7b5837c7-2e0c-4c5c-877f-ee3404aa725a"` · `cellId` sequence correct | ✅ Pass | — |
| MAT-RL-03 | Delete lot with cells: blocked or cascades | No orphan records | HTTP 404 — no `DELETE /api/cells/lots/:id` endpoint | ❌ Fail | DEF-CW01-016 |
| MAT-RL-04 | Lot appears in Cell Inventory after creation | Inventory count updated | HTTP 200 · inventory: `{ total: 35, received: 19, allocated: 16, available: 0, receivedToday: 15 }` — counts reflect test lots | ✅ Pass | — |

#### 8 — Security

| ID | Description | Expected | Actual | Status | Defect |
|----|-------------|----------|--------|--------|--------|
| MAT-SC-01 | Unauthenticated `GET /api/cells/lots` | HTTP 401 Unauthorized | HTTP 401 in 3 ms | ✅ Pass | — |
| MAT-SC-02 | Viewer role `POST /api/cells/lots` | HTTP 403 Forbidden | HTTP 201 — viewer role `mat02viewer@ocs.local` created lot `LOT-SC02-VIEWER` successfully. No `requireRole` middleware on POST route. | ❌ Fail | DEF-CW01-008 |
| MAT-SC-03 | SQL injection in `?search=` parameter | Parameterised — no injection | HTTP 200 `{ items: [], total: 0 }` — `ilike()` with Drizzle ORM safely parameterised; DB intact | ✅ Pass | — |
| MAT-SC-04 | Authenticated director creates lot | HTTP 201 | HTTP 201 — lot `LOT-SC04` created, 2 cells generated | ✅ Pass | — |

#### 9 — Audit

| ID | Description | Expected | Actual | Status | Defect |
|----|-------------|----------|--------|--------|--------|
| MAT-AU-01 | Lot creation records `createdAt` and `updatedAt` | Both timestamps populated | `createdAt: 2026-06-27T18:11:29.281Z` · `updatedAt: 2026-06-27T18:11:29.281Z` — both set on INSERT | ✅ Pass | — |
| MAT-AU-02 | `updatedAt` changes after edit | `updatedAt` > `createdAt` after save | ❌ Not verifiable — no PATCH endpoint. Cannot trigger an update to observe `updatedAt` change. | ❌ Fail | DEF-CW01-007 |
| MAT-AU-03 | Lot history endpoint shows receiving event | `GET /api/cells/lots/:id/history` returns timeline | HTTP 404 — no history endpoint implemented | ❌ Fail | DEF-CW01-013 |

#### 10 — Performance

| ID | Description | Expected | Actual | Status | Defect |
|----|-------------|----------|--------|--------|--------|
| MAT-PF-01 | `GET /api/cells/lots` (8 records) | Response < 300 ms | 4.8 ms · 4.7 ms · 5.0 ms — **avg 4.8 ms** ✅ | ✅ Pass | — |
| MAT-PF-02 | Cell Receiving page initial load FCP | FCP < 1.5 s | ⬜ Not run — FCP is a browser paint metric; not measurable via automated API probe. Requires Lighthouse or browser DevTools. | ⬜ | — |
| MAT-PF-03 | Search response time | Results < 500 ms | 5.0 ms · 11.3 ms · 4.1 ms — **avg 6.8 ms** ✅ | ✅ Pass | — |

---

### MAT-02 Defects Raised

| Defect ID | Title | Severity | Blocks Cert? | Found In |
|-----------|-------|----------|-------------|---------|
| DEF-CW01-006 | ZodError unhandled — invalid input returns 500 instead of 400 | **High** | 🚫 Yes | CR-04, VL-01, VL-04 |
| DEF-CW01-007 | No PATCH endpoint — lots cannot be edited | **High** | 🚫 Yes | ED-01, ED-02, AU-02 |
| DEF-CW01-008 | Viewer role can create lots — missing `requireRole` | **High** | 🚫 Yes | SC-02 |
| DEF-CW01-009 | Duplicate lotNumber returns 500 instead of 409 | Medium | ⚠️ Fix before closure | CR-03 |
| DEF-CW01-010 | Search only filters by lotNumber — supplier/model excluded | Medium | ⚠️ Fix before closure | SR-01 |
| DEF-CW01-011 | No filter functionality at API or UI layer | Medium | ⚠️ Fix before closure | FL-01 to FL-04 |
| DEF-CW01-012 | cellModel is free text — no FK linkage to Cell Master | Medium | ⚠️ Fix before closure | RL-01 |
| DEF-CW01-013 | No lot history/audit trail endpoint | Medium | ⚠️ Fix before closure | AU-03 |
| DEF-CW01-014 | No max-length validation on string fields | Low | ✅ May defer | VL-02 |
| DEF-CW01-015 | Future dates accepted in dateReceived | Low | ✅ May defer | VL-03 |
| DEF-CW01-016 | No DELETE endpoint for cell lots | Low | ✅ May defer | RL-03 |

### MAT-02 Summary

| Metric | Value |
|--------|-------|
| Total test cases | 37 |
| Pass | 17 |
| Fail | 18 |
| Not run / Blocked | 2 |
| **Pass rate (of run cases)** | **17 / 35 = 48.6%** |
| New defects filed | 11 |
| High (cert-blocking) | 3 |
| Medium | 5 |
| Low | 3 |

### MAT-02 Decision

❌ **FAIL** — Certification gate not met. Three High severity defects are open:

1. **DEF-CW01-006 (High)** — Any invalid API request (empty body, missing required field, quantity=0) crashes the server with HTTP 500 instead of returning a structured 400 error. Operators receive no useful error message.
2. **DEF-CW01-007 (High)** — No PATCH endpoint exists. A lot received with incorrect data cannot be corrected. The entire Edit, and partial Audit test areas fail as a direct consequence.
3. **DEF-CW01-008 (High)** — The `POST /api/cells/lots` route has no `requireRole` middleware. A `viewer` role account successfully creates cell lots. This is a security defect — write access should be restricted to `operator` and above.

**Do not proceed to MAT-03 until all three High defects are resolved, re-tested, and verified.**

---

## Overall MAT Summary

| Metric | Value |
|--------|-------|
| Total test cases | 37 |
| Pass | 17 |
| Fail | 18 |
| Not run | 2 |
| **Pass rate** | 48.6% |
| Total defects filed | 16 (5 from MAT-01, 11 from MAT-02) |
| Open High defects | 3 |
| Open Medium defects | 5 |
| Open Low defects | 3 |

## MAT Decision

- [ ] **PASS** — all mandatory tests pass; proceed to defect resolution
- [x] **FAIL** — MAT-02 failed; 3 High defects must be resolved and re-tested

**Signed:** _________________________ **Date:** _____________
