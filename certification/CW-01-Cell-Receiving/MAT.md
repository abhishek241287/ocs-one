# CW-01 — Cell Receiving: Module Acceptance Test

| Field | Value |
|-------|-------|
| **Wave** | CW-01 |
| **Module** | Cell Receiving |
| **Version** | — |
| **Tester** | — |
| **Test Date** | — |
| **Environment** | — |

---

## 10-Point Scorecard

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
| MAT-SC-01 | Unauthenticated GET `/api/cells` returns 401 | 401 Unauthorized | | ⬜ | |
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
| Total test cases | |
| Pass | |
| Fail | |
| Blocked | |
| Not run | |
| **Pass rate** | |
| Defects filed | |

## MAT Decision

- [ ] **PASS** — all mandatory tests pass; proceed to defect resolution
- [ ] **FAIL** — one or more mandatory tests failed; do not proceed to certification

**Signed:** _________________________ **Date:** _____________
