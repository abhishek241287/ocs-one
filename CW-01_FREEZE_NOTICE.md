# CW-01 Freeze Notice — OCS One Foundation v1.0

> **OFFICIAL BASELINE.** This notice declares OCS One Foundation v1.0 frozen following the
> certification and CTO approval of Certification Wave 01 (Cell Receiving). It is the
> authoritative reference for what is locked, what is carried forward, and what is permitted
> from this point on.

---

## Freeze Summary

| Field | Value |
|-------|-------|
| **Version Frozen** | OCS One Foundation v1.0 (CW-01) |
| **Certification Date** | 2026-06-28 |
| **Approval Number** | `CW-01-APR-001` |
| **Git Tag** | `CW-01-CERTIFIED` |
| **Database Version** | v1.0 — `docs/schema_v1.0_foundation.sql` (29 tables · 19 enums · 31 indexes) |
| **API Version** | `@workspace/api-server` `1.0.0` (Express 5 · 81 endpoints) |
| **ODS Version** | v1.0 — FROZEN (19 components) |
| **Security Standard Version** | SS-01, SS-02, SS-03, SS-04 — v1.0 (permanent) |
| **Approved By** | CTO, OCS Oorja Green Pvt. Ltd. |

---

## Modules Covered

CW-01 certifies the **Cell Receiving** module end-to-end (MAT-01 → MAT-06), plus the
foundation-wide platform deliverables authorized during the wave:

- **Cell Receiving** — lot creation, intake workflow, list/search/filter/pagination,
  status-aware edit, history timeline, supporting API/RBAC/validation/audit/performance.
- **Platform (foundation-wide):** RBAC write-gating (`requireWriteRole`), persistent security
  audit (`security_events`), and the four permanent certification standards:
  - **SS-01** — pre-merge security matrix (`docs/security-matrix.md`)
  - **SS-02** — authorization regression (`authz`, 225/225)
  - **SS-03** — audit-trail verification (`audit`, 11/11 + immutable)
  - **SS-04** — configuration integrity (`config`, 31 pass / 3 warn / 0 fail)
  - Director-only dashboards: `/developer/security`, `/developer/configuration`

Full evidence: `certification/CW-01-Cell-Receiving/` (archived read-only) and
`CW-01_CERTIFICATION_REPORT.md`.

---

## Deferred Items

Six Low-severity items are carried forward — none block certification; all CTO-acknowledged.

| ID | Severity | Disposition | Item |
|----|----------|-------------|------|
| DEF-CW01-014 | Low | Deferred | No max-length validation on text fields |
| DEF-CW01-015 | Low | Deferred | Future dates accepted on receive date |
| DEF-CW01-016 | Low | Deferred | No DELETE endpoint for lots |
| DEF-CW01-M04-003 | Low | Deferred | Expanded-row cell-ID range uses formula, not stored values (display only) |
| DEF-CW01-M05-002 | Low | Deferred | Single ~365 kB-gzip JS chunk, no route-level code-splitting (within budget) |
| DEF-CW01-M06-005 | Low | **Residual risk accepted** | Stateless JWT has no server-side revocation (≤8h exposure window) |

**Documented recommendation (CW-02):** add a static-serving/edge-layer document CSP for the
SPA — the helmet CSP governs API responses only (the frontend is served as static files).

---

## Freeze Rules

These rules are in force from 2026-06-28 until explicitly lifted by the CTO:

1. **OCS One Foundation v1.0 is the official baseline.** Database schema v1.0, API v1.0.0, ODS
   v1.0, and Security Standards SS-01→SS-04 v1.0 are frozen.
2. **No platform changes** are permitted from CW-02 onward — no ODS redesign, no platform
   architecture changes, no new certification framework work, no governance changes.
3. **The only permitted platform change is a fix required by a certification defect.** Any such
   fix must be made once in the shared framework so every module benefits, and must be
   re-verified against SS-02 / SS-03 / SS-04.
4. **Certified evidence is immutable.** The `certification/CW-01-Cell-Receiving/` folder is
   archived read-only. Corrections are appended as new entries, never rewritten.
5. **CW-02 focuses almost entirely on Cell Grading business logic.**
6. **The three automated suites (`authz`, `audit`, `config`) must remain green** in every
   subsequent wave; a failure reverts the affected module to `✅ Built` until fixed.

---

## Authorization for CW-02

**Certification Wave 02 — Cell Grading is formally authorized** (effective 2026-06-28).

- **Scope:** Cell Grading business logic, plus the wave's scorecard, barcode scanner
  integration, and bulk CSV import.
- **Constraint:** platform foundation is frozen (see Freeze Rules); platform improvements are
  permitted only when a certification defect requires them.
- **Standing gates:** SS-01 (pre-merge matrix) + SS-02/SS-03/SS-04 automated suites apply to
  every new Cell Grading endpoint and operation.

---

*Issued 2026-06-28 · Approval `CW-01-APR-001` · Git tag `CW-01-CERTIFIED` · OCS One Foundation v1.0.*
