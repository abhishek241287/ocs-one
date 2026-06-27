# CW-01 — Cell Receiving: Defect Log

| Field | Value |
|-------|-------|
| **Wave** | CW-01 |
| **Module** | Cell Receiving |
| **Log opened** | 2026-06-27 |
| **Log closed** | — |

---

## Defect Register

| ID | Title | Severity | Status | Found Date | Fixed Date | Fixed By | Notes |
|----|-------|----------|--------|------------|------------|----------|-------|
| DEF-CW01-001 | `useToast` used instead of `useOdsNotify` in CellReceivingPage | Medium | Verified | 2026-06-27 | 2026-06-27 | Replit Agent | All `toast()` calls replaced with `notify.*()` |
| DEF-CW01-002 | `certification="certified"` shown on uncertified module | Low | Verified | 2026-06-27 | 2026-06-27 | Replit Agent | Prop removed; renders default "development" badge |
| DEF-CW01-003 | React Fragment missing `key` prop in `lots.map()` | Low | Verified | 2026-06-27 | 2026-06-27 | Replit Agent | `<>` replaced with `<Fragment key={lot.id}>` |
| DEF-CW01-004 | `@/components/ods/OdsNotify` import error — DealerMasterPage + DispatchOrdersPage | High | Verified | 2026-06-27 | pre-existing | Prior commit | Both files confirmed using correct path |
| DEF-CW01-005 | Sidebar stub routes `#qr`, `#warranty`, `#service` non-functional | Low | Verified | 2026-06-27 | 2026-06-27 | Replit Agent | Disabled state with "soon" label added |
| DEF-CW01-006 | ZodError unhandled — invalid input returns HTTP 500 instead of 400 | **High** | **Open** | 2026-06-27 | — | — | Blocks MAT-02. Affects CR-04, VL-01, VL-04 |
| DEF-CW01-007 | No PATCH endpoint — cell lots cannot be edited after creation | **High** | **Open** | 2026-06-27 | — | — | Blocks MAT-02. Affects ED-01, ED-02, AU-02 |
| DEF-CW01-008 | Viewer role can create lots — missing `requireRole` on POST route | **High** | **Open** | 2026-06-27 | — | — | Blocks MAT-02. Security defect. Affects SC-02 |
| DEF-CW01-009 | Duplicate lotNumber returns HTTP 500 instead of 409 | Medium | Open | 2026-06-27 | — | — | DB unique constraint `lot_number` error not caught |
| DEF-CW01-010 | Search only filters by lotNumber — supplier, cellModel excluded | Medium | Open | 2026-06-27 | — | — | SR-01 fails; users cannot find lots by supplier |
| DEF-CW01-011 | No filter functionality at API or UI layer | Medium | Open | 2026-06-27 | — | — | FL-01 through FL-04 fail; no status/model/date filters |
| DEF-CW01-012 | cellModel is free text — no FK linkage to Cell Master table | Medium | Open | 2026-06-27 | — | — | RL-01 fails; lot and master records disconnected |
| DEF-CW01-013 | No lot history / audit trail endpoint | Medium | Open | 2026-06-27 | — | — | AU-03 fails; `GET /api/cells/lots/:id/history` → 404 |
| DEF-CW01-014 | No max-length validation on string fields | Low | Open | 2026-06-27 | — | — | VL-02 fails; 5000-char supplier accepted (HTTP 201) |
| DEF-CW01-015 | Future dates accepted in `dateReceived` | Low | Open | 2026-06-27 | — | — | VL-03 fails; date "2099-12-31" accepted (HTTP 201) |
| DEF-CW01-016 | No DELETE endpoint for cell lots | Low | Open | 2026-06-27 | — | — | RL-03 fails; erroneous lots cannot be removed |

---

## Severity Key

| Severity | Definition | Certification Impact |
|----------|-----------|---------------------|
| **Critical** | Data loss, security breach, or complete workflow failure | 🚫 Blocks certification |
| **High** | Primary user journey cannot be completed | 🚫 Blocks certification |
| **Medium** | Usability or secondary workflow issue | ⚠️ Fix before closure (or explicit deferral) |
| **Low** | Cosmetic or minor enhancement | ✅ May defer to maintenance release |

## Status Key — Defect Lifecycle

| Status | Meaning |
|--------|---------|
| **Open** | Newly discovered |
| **Assigned** | Engineer is fixing it |
| **Fixed** | Code implemented |
| **Verified** | Re-tested successfully — defect no longer reproduces |
| **Deferred** | Approved for future release (Medium/Low only) |
| **Closed** | Certification wave completed; defect log archived |

---

## Defect Detail — MAT-01 Defects (all Verified)

### DEF-CW01-001 ✅ Verified
`useToast` → `useOdsNotify` in CellReceivingPage. All three call sites updated. TypeScript clean. Vite HMR clean.

### DEF-CW01-002 ✅ Verified
`certification="certified"` prop removed from ModuleHeader. Module now shows "development" badge.

### DEF-CW01-003 ✅ Verified
`<>` replaced with `<Fragment key={lot.id}>`. React import updated. No key warnings in re-test console.

### DEF-CW01-004 ✅ Verified
`@/components/ods/OdsNotify` → `@/hooks/use-ods-notify` confirmed in both files. Zero browser console errors in re-test.

### DEF-CW01-005 ✅ Verified
Sidebar `disabled: true` flag on stub items. Render branch added: `cursor-not-allowed`, `opacity-40`, `"soon"` label. No navigation on click.

---

## Defect Detail — MAT-02 Defects (all Open)

### DEF-CW01-006 — ZodError unhandled → HTTP 500

| Field | Value |
|-------|-------|
| **ID** | DEF-CW01-006 |
| **Severity** | High |
| **Status** | Open |
| **Found** | 2026-06-27 (MAT-02) |
| **Test cases** | MAT-CR-04, MAT-VL-01, MAT-VL-04 |
| **File** | `artifacts/api-server/src/routes/cells/lots.ts` |

**Description:**
`CreateCellLotBody.parse(req.body)` throws a `ZodError` for any invalid request body (empty object, missing required fields, `quantityReceived: 0`). Express does not have a global error handler that catches `ZodError`, so these fall through to Express's default error handler, which returns an HTML 500 page. The API client receives no structured error message.

**Evidence:**
```
POST /api/cells/lots {}                       → HTTP 500 (empty body)
POST /api/cells/lots { quantityReceived: 0 }  → HTTP 500 (fails min(1))
POST /api/cells/lots { cellModel missing }    → HTTP 500 (required field)
```

**Expected:** HTTP 400 with JSON `{ error: "Validation failed", issues: [...] }`

**Remediation:** Add a global Express error handler that catches `ZodError` and returns `res.status(400).json({ error: "Validation failed", issues: err.issues })`. Or wrap each `Zod.parse()` call in try/catch and return 400 explicitly.

---

### DEF-CW01-007 — No PATCH endpoint — lots cannot be edited

| Field | Value |
|-------|-------|
| **ID** | DEF-CW01-007 |
| **Severity** | High |
| **Status** | Open |
| **Found** | 2026-06-27 (MAT-02) |
| **Test cases** | MAT-ED-01, MAT-ED-02, MAT-AU-02 |
| **File** | `artifacts/api-server/src/routes/cells/lots.ts` |

**Description:**
`artifacts/api-server/src/routes/cells/lots.ts` implements only `GET /` (list), `POST /` (create), and `GET /:id` (detail). There is no `PATCH /:id` or `PUT /:id` endpoint. Once a lot is created, none of its fields (supplier, remarks, receivedBy, quantity) can be corrected. A factory operator who enters a wrong quantity or supplier name cannot fix it.

**Evidence:**
```
PATCH /api/cells/lots/7b5837c7-2e0c-4c5c-877f-ee3404aa725a
{ "remarks": "Updated" }
→ HTTP 404 Not Found
```

**Impact:** ED-01, ED-02 fail. AU-02 (updatedAt change on edit) cannot be tested. This is a core workflow gap — lots are immutable once received.

**Remediation:** Implement `PATCH /api/cells/lots/:id` accepting a subset of updateable fields (`supplier`, `manufacturer`, `remarks`, `invoiceNumber`, `receivedBy`). Fields that should be locked after cells are allocated (`quantityReceived`, `lotNumber`) should be validated as read-only once grading begins.

---

### DEF-CW01-008 — Viewer role can create lots — missing `requireRole`

| Field | Value |
|-------|-------|
| **ID** | DEF-CW01-008 |
| **Severity** | High |
| **Status** | Open |
| **Found** | 2026-06-27 (MAT-02) |
| **Test cases** | MAT-SC-02 |
| **File** | `artifacts/api-server/src/routes/cells/lots.ts` |

**Description:**
The `POST /api/cells/lots` route is protected by `requireAuth` (via the parent router) but has no `requireRole` middleware. A user with role `viewer` can successfully create new cell lots. The RBAC model defines `viewer` as read-only; write operations should require at least `operator`.

**Evidence:**
```
# Login as viewer role: mat02viewer@ocs.local
POST /api/cells/lots { ...valid payload... }
→ HTTP 201 — lot "LOT-SC02-VIEWER" created by viewer account
```

**Expected:** HTTP 403 Forbidden for viewer role on POST

**Remediation:** Add `requireRole("operator", "supervisor", "director")` middleware to the `POST /` route (and the future `PATCH /:id` route) in `lots.ts`. The GET routes may remain accessible to all authenticated roles.

---

### DEF-CW01-009 — Duplicate lotNumber returns HTTP 500 instead of 409

| Field | Value |
|-------|-------|
| **ID** | DEF-CW01-009 |
| **Severity** | Medium |
| **Status** | Open |
| **Found** | 2026-06-27 (MAT-02) |
| **Test case** | MAT-CR-03 |

**Description:**
The `lot_number` column has a `UNIQUE` constraint (confirmed in schema: `varchar("lot_number", { length: 100 }).notNull().unique()`). Inserting a duplicate lot number causes a PostgreSQL unique constraint violation, which is not caught in the route handler. The unhandled DB error propagates as HTTP 500.

**Evidence:**
```
POST /api/cells/lots { lotNumber: "LOT-MAT02-001" }  (first time) → HTTP 201
POST /api/cells/lots { lotNumber: "LOT-MAT02-001" }  (duplicate)  → HTTP 500
```

**Remediation:** Catch PostgreSQL error code `23505` (unique_violation) in the lots POST handler and return `HTTP 409 { error: "Lot number already exists" }`.

---

### DEF-CW01-010 — Search only filters by lotNumber

| Field | Value |
|-------|-------|
| **ID** | DEF-CW01-010 |
| **Severity** | Medium |
| **Status** | Open |
| **Found** | 2026-06-27 (MAT-02) |
| **Test case** | MAT-SR-01 |

**Description:**
`GET /api/cells/lots?search=CATL` returns zero results even though a lot with `supplier: "CATL"` exists. The search implementation uses only `ilike(cellLotsTable.lotNumber, '%CATL%')`. Operators typically look up lots by supplier name (e.g. "find all CATL lots"), which is not supported.

**Evidence:**
```javascript
// lots.ts search clause
conditions.push(ilike(cellLotsTable.lotNumber, `%${search}%`));
// supplier, manufacturer, cellModel columns excluded
```

**Remediation:** Extend the OR clause to include `supplier`, `manufacturer`, and `cellModel`:
```javascript
conditions.push(or(
  ilike(cellLotsTable.lotNumber, `%${search}%`),
  ilike(cellLotsTable.supplier, `%${search}%`),
  ilike(cellLotsTable.cellModel, `%${search}%`),
));
```

---

### DEF-CW01-011 — No filter functionality

| Field | Value |
|-------|-------|
| **ID** | DEF-CW01-011 |
| **Severity** | Medium |
| **Status** | Open |
| **Found** | 2026-06-27 (MAT-02) |
| **Test cases** | MAT-FL-01 through MAT-FL-04 |

**Description:**
`GET /api/cells/lots` accepts only `page`, `pageSize`, and `search`. There is no `status`, `cellModel`, `supplier`, or date-range filter. The OdsToolbar renders only a search input — no filter dropdown or date picker. Factory supervisors need to view lots by status (e.g. "all lots currently in grading") or by cell model.

**Remediation:** Add optional query parameters (`status`, `cellModel`, `dateFrom`, `dateTo`) to `GET /api/cells/lots`. Add filter UI (OdsToolbar filter slot or dropdown) in `CellReceivingPage.tsx`.

---

### DEF-CW01-012 — cellModel free text — no FK to Cell Master

| Field | Value |
|-------|-------|
| **ID** | DEF-CW01-012 |
| **Severity** | Medium |
| **Status** | Open |
| **Found** | 2026-06-27 (MAT-02) |
| **Test case** | MAT-RL-01 |

**Description:**
`cellLotsTable.cellModel` is a `varchar` free-text column with no foreign key to the cell masters table. A lot received for model "INR21700-50E" cannot be traced back to the corresponding cell master record. This breaks lot→master traceability.

**Remediation:** Add a `cellMasterId` UUID FK column to `cellLotsTable` referencing the cell masters table. Add a dropdown (or type-ahead) in the Create Lot form to select from registered cell masters. Keep `cellModel` as a denormalized display field (populated from the selected master).

---

### DEF-CW01-013 — No lot history / audit trail endpoint

| Field | Value |
|-------|-------|
| **ID** | DEF-CW01-013 |
| **Severity** | Medium |
| **Status** | Open |
| **Found** | 2026-06-27 (MAT-02) |
| **Test case** | MAT-AU-03 |

**Description:**
`GET /api/cells/lots/:id/history` returns HTTP 404. There is no event log or audit trail for a cell lot. Changes to lot status (e.g. grading started, all cells approved) are not recorded in a structured timeline.

**Remediation:** Implement a `cell_lot_events` table with columns `(id, lotId, eventType, performedBy, performedAt, metadata)`. Record events on lot creation and on all future state transitions.

---

### DEF-CW01-014 — No max-length validation on string fields

| Field | Value |
|-------|-------|
| **ID** | DEF-CW01-014 |
| **Severity** | Low |
| **Status** | Open |
| **Found** | 2026-06-27 (MAT-02) |
| **Test case** | MAT-VL-02 |

**Description:**
A 5000-character supplier name is accepted (HTTP 201). The Zod schema uses bare `zod.string()` with no `.max()`. DB columns use `varchar` without an explicit length in Drizzle (defaults to `text` behaviour in PostgreSQL). Long strings waste storage and can break UI rendering.

**Remediation:** Add `.max(255)` (or appropriate limits) to `supplier`, `manufacturer`, `cellModel`, `receivedBy`, `invoiceNumber`, and `remarks` in `CreateCellLotBody`. Mirror the constraints in the Drizzle schema.

---

### DEF-CW01-015 — Future dates accepted in `dateReceived`

| Field | Value |
|-------|-------|
| **ID** | DEF-CW01-015 |
| **Severity** | Low |
| **Status** | Open |
| **Found** | 2026-06-27 (MAT-02) |
| **Test case** | MAT-VL-03 |

**Description:**
`dateReceived: "2099-12-31"` is accepted without error. The Zod schema uses `zod.string()` with no date parsing or range check. Lots with future receive dates would corrupt inventory and production timelines.

**Remediation:** Change to `zod.string().date()` (Zod v4) and add a `.refine(d => d <= today)` check to reject future dates.

---

### DEF-CW01-016 — No DELETE endpoint for cell lots

| Field | Value |
|-------|-------|
| **ID** | DEF-CW01-016 |
| **Severity** | Low |
| **Status** | Open |
| **Found** | 2026-06-27 (MAT-02) |
| **Test case** | MAT-RL-03 |

**Description:**
`DELETE /api/cells/lots/:id` returns HTTP 404. Test lots created during MAT-02 (including a lot with a 5000-char supplier and one with a 2099 date) cannot be removed from the system.

**Note:** Whether lots should be deletable by design is a product decision. If traceability requires that received lots are never deleted (soft-delete only), this should be documented as a policy decision rather than a defect, and the test case updated accordingly. If hard delete is acceptable, implement the endpoint with cascade rules verified.

---

## Summary

| Metric | Value |
|--------|-------|
| Total defects found | 16 |
| Critical | 0 |
| High | 4 (DEF-CW01-004 through -008, excl. verified) |
| Medium | 6 |
| Low | 6 |
| Fixed & verified (MAT-01) | 5 |
| Open High | **3** (DEF-CW01-006, -007, -008) |
| Open Medium | 5 |
| Open Low | 3 |

> **Certification gate:** Open Critical or High count must be **0** before certification is granted.
> **Current status: 3 open High defects — gate BLOCKED.**

## Deferred Defects (if any)

| ID | Title | Severity | Reason for Deferral | Approved By | Target Wave |
|----|-------|----------|---------------------|-------------|-------------|
