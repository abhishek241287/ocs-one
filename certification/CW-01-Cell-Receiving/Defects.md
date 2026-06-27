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
| DEF-CW01-006 | ZodError unhandled — invalid input returns HTTP 500 instead of 400 | **High** | **Verified** | 2026-06-27 | 2026-06-27 | Replit Agent | Global error handler added to app.ts; duck-typed ZodError → 400 |
| DEF-CW01-007 | No PATCH endpoint — cell lots cannot be edited after creation | **High** | **Verified** | 2026-06-27 | 2026-06-27 | Replit Agent | PATCH /:id implemented; audit event written to cell_lot_events |
| DEF-CW01-008 | Viewer role can create lots — missing `requireRole` on POST route | **High** | **Verified** | 2026-06-27 | 2026-06-27 | Replit Agent | `requireRole("operator","supervisor","director")` added to POST + PATCH |
| DEF-CW01-009 | Duplicate lotNumber returns HTTP 500 instead of 409 | Medium | **Verified** | 2026-06-27 | 2026-06-27 | Replit Agent | Error handler checks `err.cause.code === "23505"` (Drizzle wraps PG error) |
| DEF-CW01-010 | Search only filters by lotNumber — supplier, cellModel excluded | Medium | **Verified** | 2026-06-27 | 2026-06-27 | Replit Agent | OR clause now covers lotNumber + supplier + cellModel |
| DEF-CW01-011 | No filter functionality at API or UI layer | Medium | **Verified** | 2026-06-27 | 2026-06-27 | Replit Agent | `status` + `cellModel` query params added to API + UI status dropdown |
| DEF-CW01-012 | cellModel is free text — no FK linkage to Cell Master table | Medium | **Verified** | 2026-06-27 | 2026-06-27 | Replit Agent | `cellMasterId` UUID FK column added to `cell_lots` table |
| DEF-CW01-013 | No lot history / audit trail endpoint | Medium | **Verified** | 2026-06-27 | 2026-06-27 | Replit Agent | `GET /:id/history` + `cell_lot_events` table implemented |
| DEF-CW01-014 | No max-length validation on string fields | Low | **Deferred** | 2026-06-27 | — | — | CTO authorized deferral; target: maintenance wave |
| DEF-CW01-015 | Future dates accepted in `dateReceived` | Low | **Deferred** | 2026-06-27 | — | — | CTO authorized deferral; target: maintenance wave |
| DEF-CW01-016 | No DELETE endpoint for cell lots | Low | **Deferred** | 2026-06-27 | — | — | CTO authorized deferral; pending product decision (hard vs. soft delete) |
| DEF-CW01-017 | Invalid cellMasterId FK (PG 23503) returns HTTP 500 instead of 400 | Medium | **Verified** | 2026-06-27 | 2026-06-27 | Replit Agent | Added 23503 branch to global error handler in `app.ts` → HTTP 400 with constraint name |
| DEF-CW01-018 | Lot status does not transition on grading; no PATCH guard when cells are being graded | Medium | **Verified** | 2026-06-27 | 2026-06-27 | Replit Agent | Full state machine implemented: received→grading→graded with field-level PATCH guard |

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

## Defect Detail — MAT-02 Defects

### DEF-CW01-006 ✅ Verified — ZodError unhandled → HTTP 500

| Field | Value |
|-------|-------|
| **ID** | DEF-CW01-006 |
| **Severity** | High |
| **Status** | Verified |
| **Found** | 2026-06-27 (MAT-02) |
| **Fixed** | 2026-06-27 |
| **Fixed By** | Replit Agent |
| **Test cases** | MAT-CR-04, MAT-VL-01, MAT-VL-04 |
| **File** | `artifacts/api-server/src/app.ts` |

**Description:**
`CreateCellLotBody.parse(req.body)` throws a `ZodError` for any invalid request body (empty object, missing required fields, `quantityReceived: 0`). Express had no global error handler that catches `ZodError`, so these fell through to Express's default error handler, which returned an HTML 500 page.

**Fix:**
Added a 4-argument error handler at the bottom of `app.ts` (after all routes). The handler duck-types `ZodError` by checking `err.name === "ZodError" && Array.isArray(err.issues)` to avoid requiring a direct `zod` import. Returns `HTTP 400 { error: "Validation failed", issues: [...] }`.

**Evidence (re-test):**
```
POST /api/cells/lots {}                       → HTTP 400 "Validation failed"
POST /api/cells/lots { quantityReceived: 0 }  → HTTP 400 "Validation failed"
POST /api/cells/lots { cellModel missing }    → HTTP 400 "Validation failed"
```

---

### DEF-CW01-007 ✅ Verified — No PATCH endpoint

| Field | Value |
|-------|-------|
| **ID** | DEF-CW01-007 |
| **Severity** | High |
| **Status** | Verified |
| **Found** | 2026-06-27 (MAT-02) |
| **Fixed** | 2026-06-27 |
| **Fixed By** | Replit Agent |
| **Test cases** | MAT-ED-01, MAT-ED-02, MAT-AU-02 |
| **Files** | `artifacts/api-server/src/routes/cells/lots.ts`, `lib/db/src/schema/cell-grading.ts`, `lib/api-spec/openapi.yaml` |

**Description:**
No `PATCH /:id` endpoint existed. Once a lot was created, none of its fields could be corrected.

**Fix:**
- Added `PATCH /api/cells/lots/:id` accepting editable fields (`supplier`, `manufacturer`, `cellModel`, `cellChemistry`, `nominalCapacityAh`, `invoiceNumber`, `dateReceived`, `receivedBy`, `remarks`, `cellMasterId`) plus a required `reason` field.
- Only changed fields are applied (changeset diff before writing).
- Each PATCH writes a `corrected` event to `cell_lot_events` with the full changeset, performer, and reason.
- `updatedAt` auto-increments via Drizzle `.$onUpdate()`.
- `PatchCellLotBody` schema added to OpenAPI spec + codegen.

**Evidence (re-test):**
```
PATCH /api/cells/lots/:id { invoiceNumber: "INV-2026-999", reason: "..." }
→ HTTP 200 { ..., invoiceNumber: "INV-2026-999", updatedAt: "2026-06-27T18:41:56.278Z" }
updatedAt before: 18:41:56.278Z → after: 18:43:03.318Z ✅
```

---

### DEF-CW01-008 ✅ Verified — Viewer role can create lots

| Field | Value |
|-------|-------|
| **ID** | DEF-CW01-008 |
| **Severity** | High |
| **Status** | Verified |
| **Found** | 2026-06-27 (MAT-02) |
| **Fixed** | 2026-06-27 |
| **Fixed By** | Replit Agent |
| **Test cases** | MAT-SC-02 |
| **File** | `artifacts/api-server/src/routes/cells/lots.ts` |

**Description:**
`POST /api/cells/lots` had no `requireRole` middleware. A `viewer` role user successfully created lot `LOT-SC02-VIEWER`.

**Fix:**
Added `requireRole("operator", "supervisor", "director")` as middleware on both `POST /` and `PATCH /:id`. `GET` routes remain accessible to all authenticated roles.

**Evidence (re-test):**
```
# Login as mat02viewer@ocs.local (viewer role)
POST /api/cells/lots { ...valid payload... }
→ HTTP 403 { "error": "Access denied. Required role: operator or supervisor or director" }

PATCH /api/cells/lots/:id { ...valid payload... }
→ HTTP 403 { "error": "Access denied. Required role: operator or supervisor or director" }
```

---

### DEF-CW01-009 ✅ Verified — Duplicate lotNumber returns HTTP 500

| Field | Value |
|-------|-------|
| **ID** | DEF-CW01-009 |
| **Severity** | Medium |
| **Status** | Verified |
| **Found** | 2026-06-27 (MAT-02) |
| **Fixed** | 2026-06-27 |
| **Fixed By** | Replit Agent |
| **Test case** | MAT-CR-03 |

**Description:**
Inserting a duplicate `lot_number` caused a PostgreSQL unique constraint violation (`23505`) that was not caught. Returned HTTP 500.

**Fix:**
Global error handler in `app.ts` checks `err.cause?.code === "23505"` (Drizzle wraps the original PG `DatabaseError` in `_DrizzleQueryError`; the real error code is on `err.cause`). Returns `HTTP 409 { error: "lot_number \"VALUE\" already exists" }`.

**Evidence (re-test):**
```
POST /api/cells/lots { lotNumber: "LOT-SC02-VIEWER" }  (duplicate)
→ HTTP 409 { "error": "lot_number \"LOT-SC02-VIEWER\" already exists" }
```

---

### DEF-CW01-010 ✅ Verified — Search only filters by lotNumber

| Field | Value |
|-------|-------|
| **ID** | DEF-CW01-010 |
| **Severity** | Medium |
| **Status** | Verified |
| **Found** | 2026-06-27 (MAT-02) |
| **Fixed** | 2026-06-27 |
| **Fixed By** | Replit Agent |
| **Test case** | MAT-SR-01 |

**Description:**
`GET /api/cells/lots?search=CATL` returned zero results because search only used `ilike(lotNumber, ...)`.

**Fix:**
Search clause extended to OR across `lotNumber`, `supplier`, and `cellModel` using Drizzle's `or()`:
```typescript
or(
  ilike(cellLotsTable.lotNumber, `%${search}%`),
  ilike(cellLotsTable.supplier, `%${search}%`),
  ilike(cellLotsTable.cellModel, `%${search}%`)
)
```

**Evidence (re-test):**
```
GET /api/cells/lots?search=CATL  → HTTP 200 { total: 1, items: [{ supplier: "CATL" }] } ✅
GET /api/cells/lots?search=LFP-280  → HTTP 200 { total: 1, items: [{ cellModel: "LFP-280Ah" }] } ✅
```

---

### DEF-CW01-011 ✅ Verified — No filter functionality

| Field | Value |
|-------|-------|
| **ID** | DEF-CW01-011 |
| **Severity** | Medium |
| **Status** | Verified |
| **Found** | 2026-06-27 (MAT-02) |
| **Fixed** | 2026-06-27 |
| **Fixed By** | Replit Agent |
| **Test cases** | MAT-FL-01 through MAT-FL-04 |

**Description:**
`GET /api/cells/lots` had no `status` or `cellModel` filter params. No filter UI existed.

**Fix:**
- Added `status` (enum: `received | grading | complete`) and `cellModel` (string, ILIKE) query params to the OpenAPI spec, codegen, and route handler.
- Added a `cellLotStatusEnum` PG enum and `status` column (default `"received"`) to `cellLotsTable`.
- Added a status dropdown filter to `CellReceivingPage.tsx` (Select component with All/Received/Grading/Complete options).

**Evidence (re-test):**
```
GET /api/cells/lots?status=received  → HTTP 200 { total: 8, items all with status: "received" } ✅
GET /api/cells/lots?cellModel=LFP    → HTTP 200 { total: 1, items: [{ cellModel: "LFP-280Ah" }] } ✅
```

---

### DEF-CW01-012 ✅ Verified — cellModel free text — no FK to Cell Master

| Field | Value |
|-------|-------|
| **ID** | DEF-CW01-012 |
| **Severity** | Medium |
| **Status** | Verified |
| **Found** | 2026-06-27 (MAT-02) |
| **Fixed** | 2026-06-27 |
| **Fixed By** | Replit Agent |
| **Test case** | MAT-RL-01 |

**Description:**
`cellLotsTable.cellModel` was a free-text `varchar` with no FK to the cell masters table. Lot→master traceability was broken.

**Fix:**
Added nullable `cellMasterId UUID` FK column to `cellLotsTable` referencing `masterCellsTable.id`. Column added to DB schema, `cellMasterId` exposed in all lot responses. `PatchCellLotBody` and `CellLotInput` accept optional `cellMasterId`. Edit dialog in `CellReceivingPage.tsx` exposes the field. DB migration run with `drizzle-kit push`.

**Evidence (re-test):**
```
GET /api/cells/lots?pageSize=1
→ { id, status: "received", cellMasterId: null }  — field present ✅
```

---

### DEF-CW01-013 ✅ Verified — No lot history / audit trail endpoint

| Field | Value |
|-------|-------|
| **ID** | DEF-CW01-013 |
| **Severity** | Medium |
| **Status** | Verified |
| **Found** | 2026-06-27 (MAT-02) |
| **Fixed** | 2026-06-27 |
| **Fixed By** | Replit Agent |
| **Test case** | MAT-AU-03 |

**Description:**
`GET /api/cells/lots/:id/history` returned HTTP 404. No event log existed.

**Fix:**
- Created `cell_lot_events` table with columns `(id, lotId, eventType, performedBy, performedAt, changes JSON, reason)`. Indexed on `lotId` and `performedAt`.
- `POST /cells/lots` records a `received` event on lot creation.
- `PATCH /cells/lots/:id` records a `corrected` event with full changeset diff and reason.
- `GET /api/cells/lots/:id/history` returns `{ lotId, events: [...] }` ordered by `performedAt DESC`.
- History dialog added to `CellReceivingPage.tsx` (History icon button per row).

**Evidence (re-test):**
```
GET /api/cells/lots/:id/history
→ HTTP 200 {
    lotId: "e27f0de0-...",
    events: [
      { eventType: "corrected", performedBy: "admin@ocs.local",
        changes: { invoiceNumber: { from: null, to: "INV-UPDATED-001" } },
        reason: "Corrected invoice number after vendor confirmation" }
    ]
  }
```

---

### DEF-CW01-014 ⬜ Deferred — No max-length validation on string fields

| Field | Value |
|-------|-------|
| **ID** | DEF-CW01-014 |
| **Severity** | Low |
| **Status** | Deferred |
| **Found** | 2026-06-27 (MAT-02) |
| **Deferred By** | CTO |
| **Reason** | Low severity; no production impact in current controlled environment |
| **Target Wave** | Maintenance wave (post-CW-01) |

**Description:**
A 5000-character supplier name is accepted (HTTP 201). Zod schema uses bare `zod.string()` with no `.max()`. Long strings waste storage and can break UI rendering.

**Remediation (deferred):** Add `.max(255)` (or appropriate limits) to `supplier`, `manufacturer`, `cellModel`, `receivedBy`, `invoiceNumber`, and `remarks` in `CreateCellLotBody` and `PatchCellLotBody`. Mirror constraints in Drizzle schema.

---

### DEF-CW01-015 ⬜ Deferred — Future dates accepted in `dateReceived`

| Field | Value |
|-------|-------|
| **ID** | DEF-CW01-015 |
| **Severity** | Low |
| **Status** | Deferred |
| **Found** | 2026-06-27 (MAT-02) |
| **Deferred By** | CTO |
| **Reason** | Low severity; no immediate production impact |
| **Target Wave** | Maintenance wave (post-CW-01) |

**Description:**
`dateReceived: "2099-12-31"` is accepted without error. Lots with future receive dates could corrupt inventory timelines.

**Remediation (deferred):** Change to `zod.string().date()` (Zod v4) and add `.refine(d => d <= today)` to reject future dates.

---

### DEF-CW01-016 ⬜ Deferred — No DELETE endpoint for cell lots

| Field | Value |
|-------|-------|
| **ID** | DEF-CW01-016 |
| **Severity** | Low |
| **Status** | Deferred |
| **Found** | 2026-06-27 (MAT-02) |
| **Deferred By** | CTO |
| **Reason** | Pending product decision: hard delete vs. soft delete (traceability requirement) |
| **Target Wave** | Maintenance wave (post-CW-01) |

**Description:**
`DELETE /api/cells/lots/:id` returns HTTP 404. Test lots with erroneous data (5000-char supplier, 2099 date) cannot be removed from the system.

**Note:** Whether lots should be deletable by design is a product decision. If traceability requires lots are never hard-deleted, implement soft-delete with `deletedAt` and document as policy.

---

## Summary

| Metric | Value |
|--------|-------|
| Total defects found | 18 |
| Critical | 0 |
| High | 4 |
| Medium | 8 |
| Low | 6 |
| **Verified (fixed + re-tested)** | **15** |
| **Deferred (Low, CTO-authorized)** | **3** |
| Open High | **0** |
| Open Medium | **0** |
| Open Low | 0 (all deferred) |

> **Certification gate:** Open Critical or High count must be **0** before certification is granted.
> **Current status: 0 open High defects, 0 open Medium defects. ✅**

---

### DEF-CW01-017 — Invalid cellMasterId FK returns HTTP 500

| Field | Value |
|-------|-------|
| **ID** | DEF-CW01-017 |
| **Severity** | Medium |
| **Status** | Open |
| **Found** | 2026-06-27 (MAT-03) |
| **Test case** | MAT-DI-03 |
| **File** | `artifacts/api-server/src/app.ts` |

**Description:**
When `POST /api/cells/lots` is called with a `cellMasterId` that references a non-existent `master_cells` record, PostgreSQL throws a foreign key violation (error code `23503`). The global error handler in `app.ts` only checks for `23505` (unique constraint) via `err.cause?.code`. A `23503` error falls through to the catch-all 500 handler.

The data integrity outcome is correct — the lot INSERT fails atomically, no orphan records are created — but the HTTP response is `500 Internal Server Error` instead of a structured `400`/`422` with a human-readable message.

**Evidence:**
```
POST /api/cells/lots { cellMasterId: "00000000-0000-0000-0000-000000000099" }
→ HTTP 500 { "error": "Internal server error" }
GET /api/cells/lots?search=LOT-DI01-ROLLBACK → { total: 0 } (no orphan — transaction rolled back)
```

**Remediation:** Extend the global error handler in `app.ts` to also catch PG code `23503`:
```typescript
if (pgCode === "23503") {
  const constraint = (err as any)?.constraint ?? (err as any)?.cause?.constraint ?? "";
  res.status(400).json({ error: `Referenced record does not exist${constraint ? ` (${constraint})` : ""}` });
  return;
}
```

---

### DEF-CW01-018 — Lot status does not transition on grading; no PATCH guard

| Field | Value |
|-------|-------|
| **ID** | DEF-CW01-018 |
| **Severity** | Medium |
| **Status** | Open |
| **Found** | 2026-06-27 (MAT-03) |
| **Test case** | MAT-BR-01 |
| **Files** | `artifacts/api-server/src/routes/cells/lots.ts`, `artifacts/api-server/src/routes/cells/cells.ts` |

**Description:**
Two related gaps in the lot lifecycle state machine:

1. **No auto-transition**: When cells in a lot are graded (their `status` changes to `approved`, `rejected`, etc.), the lot's `status` column remains `"received"`. There is no trigger or application-level logic to set the lot to `"grading"` when the first cell is graded, or to `"complete"` when all cells are graded.

2. **No PATCH guard**: The `PATCH /api/cells/lots/:id` endpoint has no check on the lot's current `status`. A lot can be freely edited even while cells are being graded or after all cells are approved. The `status` field is not in the `editableFields` array, meaning the status can never be changed via PATCH at all — but nor is there any check preventing edits when status should be locked.

**Evidence:**
```
# Grade one cell
POST /api/cells/3b2db783-.../grade { capacityAh: 298, ... }
→ HTTP 200 { cellId: "CELL-20260627-000018", status: "approved", grade: "A" }

# Lot status unchanged
GET /api/cells/lots/1e587cb0-...
→ { status: "received" }  ← expected: "grading"

# Edit still allowed
PATCH /api/cells/lots/1e587cb0-... { supplier: "BYD Re-edit During Grading", reason: "test" }
→ HTTP 200  ← expected: HTTP 422 "Lot cannot be edited while grading is in progress"
```

**Product decision required:** The intended rule ("lot cannot be edited after grading begins") must be confirmed by product owner before implementation. If confirmed:

**Remediation:**
1. Add lot status transition logic to `POST /cells/:id/grade`: when the first cell in a lot is graded, set the lot `status` to `"grading"`; when all cells are graded, set to `"complete"`.
2. Add a guard at the top of `PATCH /lots/:id`: if `existing.status !== "received"`, return HTTP 422 `{ error: "Lot cannot be edited — grading is in progress or complete" }`.

---

## Deferred Defects

| ID | Title | Severity | Reason for Deferral | Approved By | Target Wave |
|----|-------|----------|---------------------|-------------|-------------|
| DEF-CW01-014 | No max-length validation on string fields | Low | Controlled env; no prod impact | CTO | Maintenance |
| DEF-CW01-015 | Future dates accepted in dateReceived | Low | No immediate prod impact | CTO | Maintenance |
| DEF-CW01-016 | No DELETE endpoint for cell lots | Low | Product decision pending (hard vs soft delete) | CTO | Maintenance |
