# CW-02 — Cell Grading: Defect Log

| Field | Value |
|-------|-------|
| **Wave** | CW-02 |
| **Module** | Cell Grading |
| **Log opened** | 2026-06-28 (MAT-01) |
| **Log closed** | — (wave in progress; MAT-01 + MAT-02 gates closed) |

---

## Defect Register

| ID | Title | Severity | Status | Found Date | Fixed Date | Fixed By | Notes |
|----|-------|----------|--------|------------|------------|----------|-------|
| DEF-CW02-001 | Premature `certification="certified"` badge on Cell Grading | Low | **Closed** | 2026-06-28 (MAT-01) | 2026-06-28 | Replit Agent | Badge removed. |
| DEF-CW02-002 | Module using raw `useToast` instead of ODS `useOdsNotify` | Medium | **Closed** | 2026-06-28 (MAT-01) | 2026-06-28 | Replit Agent | Platform fix (CTO Option 1) — 145 calls / 18 files migrated; `useToast` deprecated. |
| DEF-CW02-003 | MAT-01 minor page/nav defect | Low | **Closed** | 2026-06-28 (MAT-01) | 2026-06-28 | Replit Agent | MAT-01 remediation. |
| DEF-CW02-004 | Negative / physically-impossible measurements accepted (capacityAh<0, voltageV<0, IR<0 → 200) | High | **Closed** | 2026-06-28 (MAT-02) | 2026-06-28 | Replit Agent | `CellGradeInput`/`CellCorrectionInput` `exclusiveMinimum:0` (cap/volt) + `minimum:0` (IR); server rejects 400. |
| DEF-CW02-005 | Blank `gradedBy` accepted → empty operator attribution | Medium | **Closed** | 2026-06-28 (MAT-02) | 2026-06-28 | Replit Agent | `minLength:1` + server trim; blank → 400. Same for correction `correctedBy`. |
| DEF-CW02-006 | No correction path — graded cell locked, no audited re-grade | Medium | **Closed** | 2026-06-28 (MAT-02) | 2026-06-28 | Replit Agent | Controlled correction workflow: `POST /cells/{id}/correct` (supervisor+, mandatory reason), append-only `cell_grade_measurements`, immutable original, `cell_grade_corrected` audit event, `GET /cells/{id}/measurements` genealogy. |

---

## Summary

| Metric | Value |
|--------|-------|
| Total defects found | 6 |
| Critical | 0 |
| High | 1 |
| Medium | 3 |
| Low | 2 |
| Fixed & verified | 6 |
| Deferred | 0 |
| Open at wave close | 0 (MAT-01 + MAT-02 gates) |

> **Certification gate:** Open Critical or High count must be **0**.

## Deferred Defects

| ID | Title | Severity | Reason | Approved By | Target Wave |
|----|-------|----------|--------|-------------|-------------|
