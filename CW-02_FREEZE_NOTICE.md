# CW-02 Freeze Notice — Cell Grading (on OCS One Foundation v1.0)

> **OFFICIAL BASELINE EXTENSION.** This notice declares the **Cell Grading** module and the
> **Engineering Correction Framework (ECF) v1.0** frozen following the certification and CTO approval
> of Certification Wave 02. It is the authoritative reference for what is now locked, what is carried
> forward, and what is permitted from this point on. OCS One Foundation v1.0 (CW-01) remains the
> baseline; this notice extends it.

---

## Freeze Summary

| Field | Value |
|-------|-------|
| **Wave Frozen** | CW-02 — Cell Grading |
| **Baseline** | OCS One Foundation v1.0 (CW-01) + ECF v1.0 |
| **Certification Date** | 2026-06-28 |
| **Approval Number** | `CW-02-APR-001` |
| **Git Tag** | `CW-02-CERTIFIED` |
| **Database Version** | v1.0 baseline, extended — 32 tables · 22 enums · 95 indexes |
| **API Version** | `@workspace/api-server` `1.0.0` (Express 5 · 47 protected endpoints in the authz matrix) |
| **ECF Version** | v1.0 — FROZEN (reference consumer: Cell Grading) |
| **ODS Version** | v1.0 — FROZEN (unchanged) |
| **Security Standard Version** | SS-01…SS-04 — v1.0 (permanent, unchanged) |
| **Approved By** | CTO, OCS Oorja Green Pvt. Ltd. |

---

## Modules Covered

CW-02 certifies the **Cell Grading** module end-to-end (MAT-01 → MAT-06), plus the platform asset
frozen during the wave:

- **Cell Grading** — individual cell grading (capacity / IR / voltage), grade configuration, automated
  grade computation, the controlled append-only **correction workflow** (supervisor+, mandatory
  reason, immutable original), grade genealogy, and supporting API/RBAC/validation/audit/performance.
- **Engineering Correction Framework (ECF) v1.0** — a module-agnostic immutable `engineering_corrections`
  ledger generalized from the Cell-Grading correction engine; one ledger is the correction history
  across all modules, the module table stays the source of truth for current state. Cell Grading is the
  reference consumer; **no other module migrated, by direction.** Full guide:
  `docs/engineering-correction-framework.md`.

Full evidence: `certification/CW-02-Cell-Grading/` (archived read-only) and `CW-02_CERTIFICATION_REPORT.md`.

---

## Carried Forward (none block certification; all CTO-acknowledged)

| ID | Severity | Class | Disposition | Item |
|----|----------|-------|-------------|------|
| OBS-CW02-M06-001 | Low | Platform | Backlog **SEC-001** | SS-03 default-mode rate-limit false negative (authoritative mode passes 12/12) |
| OBS-CW02-001 | Low | Module | Backlog **MEB-001** | IR non-binding under `nominalIrMohm=25` — calibration review after CW-08 |
| OBS-CW02-003 | Low | Module | Backlog **MEB-002** | No `idx_cells_created_at` — deferred DB optimization |
| DEF-CW01-M06-005 | Low | Platform | Residual risk accepted | Stateless JWT has no server-side revocation (≤8h window) |

**Interim operating rule (CTO directive):** use SS-03 **authoritative mode** (`CERT_AUDIT_RATELIMIT=1`)
whenever a certification run intentionally floods/stress-tests before audit verification.

---

## Freeze Rules

In force from 2026-06-28 until explicitly lifted by the CTO:

1. **Cell Grading + ECF v1.0 are frozen** on top of OCS One Foundation v1.0. Certified evidence in
   `certification/CW-02-Cell-Grading/` is archived read-only — corrections are appended, never rewritten.
2. **No platform changes** are permitted (ODS, ECF, Security Standards, Certification Framework,
   Performance-Regression Framework) — the Platform Freeze Policy stays in force through CW-08.
3. **The only permitted platform change is a fix required by a Critical/High certification defect or a
   security vulnerability.** Any such fix is made once in the shared framework and re-verified against
   SS-02 / SS-03 / SS-04. Every other idea goes to the relevant enhancement backlog.
4. **Every correction-allowing module MUST integrate with ECF** (future work) — it never builds its own
   correction history; Correction IDs and Engineering Versions never reset/renumber (Compatibility Rule).
5. **The three automated suites (`authz`, `audit`, `config`) must remain green** in every subsequent
   wave; a failure reverts the affected module to `✅ Built` until fixed. The default-mode `audit`
   workflow may show red purely from prior global-limiter residue — authoritative mode is the SS-03 gate.
6. **The Unified Product Platform architecture (FROZEN v1.0)** is not expanded during CW-02→CW-08;
   implementation begins post-CW-02 per its phased plan; new ideas go to the PP-001…PP-006 backlog.

---

## Authorization for CW-03

**Certification Wave 03 — Manufacturing Orders is authorized to begin ONLY after this CW-02 freeze
package is approved** (effective 2026-06-28 on approval).

- **Scope:** Manufacturing Orders business logic and the full stage lifecycle (cell allocation →
  assembly → compression → BMS install → BMS programming → charging → testing → QC → packing).
- **Constraint:** the platform foundation + ECF + Security Standards are frozen (see Freeze Rules);
  platform improvements are permitted only under the Critical/High/security-vuln gate.
- **Standing gates:** SS-01 (pre-merge matrix) + SS-02 / SS-03 / SS-04 automated suites apply to every
  new Manufacturing Orders endpoint and operation; the standard batch-MAT methodology and set-based,
  prefix-scoped teardown apply.

---

*Issued 2026-06-28 · Approval `CW-02-APR-001` · Git tag `CW-02-CERTIFIED` · Cell Grading + ECF v1.0 frozen on OCS One Foundation v1.0.*
