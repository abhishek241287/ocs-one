# CW-02 Certification Report — Cell Grading

| Field | Value |
|-------|-------|
| **Wave** | CW-02 — Cell Grading |
| **Product** | OCS One — Manufacturing ERP (OCS Oorja Green Pvt. Ltd.) |
| **Baseline** | OCS One Foundation v1.0 (CW-01) + ECF v1.0 |
| **Report Date** | 2026-06-28 |
| **Prepared by** | Replit Agent (QA / Engineering) |
| **Certification Tag** | `CW-02-CERTIFIED` |
| **Approval Number** | `CW-02-APR-001` |
| **Mantra** | Do not assume. Measure. Verify. Document. Only then certify. |

---

## 1. Executive Summary

CW-02 certifies the **Cell Grading** module of OCS One end-to-end across six Module Acceptance
Tests (MAT-01 → MAT-06): page & navigation, functional behaviour, business-rule integrity,
cross-module integration, performance & stress, and security & reliability.

The wave is **certified**. Every actionable test passes, **zero Critical / High / Medium defects
remain open**, all measured performance thresholds are met by 28–60×, and the module's security is
governed by — and re-verified against — the four permanent, frozen Security Standards (SS-01…SS-04)
plus the Engineering Correction Framework (ECF) immutability guarantees.

CW-02 was executed under the **Platform Freeze Policy**: the platform frameworks (ODS, ECF, Security
Standards, Certification Framework, Performance-Regression Framework) were **consumed as frozen
assets, not modified**. The one platform improvement extracted during the wave — the **ECF v1.0**, a
module-agnostic immutable correction ledger generalized from the proven Cell-Grading correction
engine — was itself frozen at v1.0 with Cell Grading as its reference consumer. In keeping with the
project's honesty standard, the single MAT-06 finding (`OBS-CW02-M06-001`) is documented rather than
hidden: it is a certification-harness false negative in the SS-03 *default* mode (the **authoritative**
mode passes 12/12), classified Low/platform and backlogged as **SEC-001** for Security Framework v2.0.

**Certification decision: ✅ PASS — CW-02 CERTIFIED.**

---

## 2. Scope

**In scope:** the Cell Grading module — individual cell grading (capacity / IR / voltage), grade
configuration, automated grade computation, the **controlled append-only correction workflow**
(supervisor+, mandatory reason, immutable original), grade genealogy, and all supporting API
endpoints, RBAC, validation, audit, and performance characteristics.

**Platform work in scope (frozen during this wave):** the **Engineering Correction Framework (ECF)
v1.0** — a generic immutable `engineering_corrections` ledger generalized from the Cell-Grading
correction engine so every future module can adopt it without re-implementing append-only /
immutability / authorization logic. Cell Grading is the **reference consumer**; no other module was
migrated, by direction.

**Out of scope (future waves / backlog):** Manufacturing Orders (CW-03); the Unified Product Platform
implementation (architecture FROZEN v1.0, implementation begins post-CW-02 per its phased plan); ECF
enhancements ECF-001…ECF-005; SEC-001 (SS-03 rate-limit classification); MEB-001/002 (grading
calibration + `cells.created_at` index); the CW-01 static/edge document-CSP recommendation.

**Environment:** Replit dev container · Node.js 24 · Express 5 · PostgreSQL · React 19 + Vite ·
all traffic via the `localhost:80` shared proxy. Performance dataset: 1,058 cells / 14 lots.

---

## 3. Modules Certified

| MAT | Title | Result | Date | Evidence |
|-----|-------|--------|------|----------|
| MAT-01 | Page & Navigation | ✅ PASS — 10/10 · 3 defects resolved | 2026-06-28 | `MAT.md` |
| MAT-02 | Functional Certification | ✅ PASS — 16/16 GR · 10/10 scorecard · 3 defects resolved | 2026-06-28 | `MAT.md` |
| MAT-03 | Business-Rule Certification | ✅ PASS — 30/30 BR · 0 defects | 2026-06-28 | `MAT.md` |
| MAT-04 | Integration Certification | ✅ PASS — 17/17 IT · 10/10 scorecard · 0 defects | 2026-06-28 | `MAT.md` |
| MAT-05 | Performance & Stress | ✅ PASS — all P95 within budget by 28–60× @ 1,058 cells · 10/10 | 2026-06-28 | `MAT.md`, `Performance.md` |
| MAT-06 | Security & Reliability | ✅ PASS WITH NOTE — 14 areas · suites green · 11/11 probes · 10/10 | 2026-06-28 | `MAT-06.md` |

Evidence folder: `certification/CW-02-Cell-Grading/`.

---

## 4. Total Test Cases

| Category | Count | Detail |
|----------|-------|--------|
| MAT functional / rule / integration cases | **73** | MAT-01: 10 · MAT-02: 16 · MAT-03: 30 · MAT-04: 17 |
| Performance / stress suite | 13 endpoints · 6 query plans · 5 stress scenarios | MAT-05 |
| Security areas assessed | 14 | MAT-06 (authn, RBAC, input validation, rate-limit, CSRF/XSS, audit, backup, failure recovery, pen-test, dependency, secrets, file-upload N/A, API abuse) |
| Grading-specific security probes | **11** | MAT-06 — all PASS (incl. mass-assignment, mandatory reason, ECF immutability) |
| **Permanent automated assertions (re-run live)** | **SS-02 235 · SS-03 12 + immutability · SS-04 34** | 47 endpoints × 5 principals; 12 audited ops (authoritative); 34 config checks / 12 categories |

---

## 5. Defects

**Total filed across CW-02: 6** (all from MAT-01 → MAT-02) — **all Closed**. Plus observations.

### By severity

| Severity | Found | Resolved & Verified | Carried forward |
|----------|-------|---------------------|-----------------|
| **Critical** | 0 | 0 | 0 |
| **High** | 1 | 1 | 0 |
| **Medium** | 3 | 3 | 0 |
| **Low** | 2 | 2 | 0 |
| **Total** | **6** | **6** | **0** |

- **High (1):** DEF-CW02-004 (negative/impossible measurements accepted → schema bounds + 400). Resolved & verified.
- **Medium (3):** DEF-CW02-002 (platform `useToast`→`useOdsNotify`), -005 (blank `gradedBy`), -006 (controlled correction workflow). Resolved & verified.
- **Low (2):** DEF-CW02-001 (premature badge), -003 (page/nav). Resolved & verified.
- **0 open Critical / High / Medium** entering freeze.

### Observations (no open defect)

| ID | Severity | Class | Disposition |
|----|----------|-------|-------------|
| OBS-CW02-001 | Low | Module (calibration) | IR non-binding under `nominalIrMohm=25` — Engineering Calibration Observation → **MEB-001** (review after CW-08) |
| OBS-CW02-002 | — | Module | cells list seq-scan on non-selective filters — **RESOLVED in MAT-05** (optimal planner behaviour, not a missing index) |
| OBS-CW02-003 | Low | Module | no `idx_cells_created_at` (negligible top-N heapsort) → **MEB-002** (deferred DB optimization) |
| OBS-CW02-M06-001 | Low | Platform | SS-03 default-mode rate-limit false negative (authoritative mode passes) → **SEC-001** (Security Framework v2.0 backlog) |

No Critical or High defect was ever deferred, per project policy.

---

## 6. Performance Results

Measured at full dataset (1,058 cells / 14 lots); full methodology in `Performance.md`.

| Metric | Measured (P95) | Threshold | Status |
|--------|----------------|-----------|--------|
| List / filtered list reads | 3–12 ms | < 300 ms | ✅ |
| Single-cell + genealogy | 7 ms | < 300 ms | ✅ |
| Write paths (`grade` / `correct`) | 14 ms | < 500 ms | ✅ |
| Index usage under load (`EXPLAIN`) | selective→index, non-selective→seq | optimal | ✅ |
| Concurrency 25/50 | 75/75 OK · ≤186 ms · 269 req/s | no errors | ✅ |
| Rate limiter under flood | sheds 235/360 → 429 by design | graceful | ✅ |

- **OBS-CW02-002 resolved:** `EXPLAIN ANALYZE` proves `cells` indexes are used when selective and a
  seq-scan is correctly chosen only when non-selective — optimal cost-based planning, not a defect.
- **Honest gap:** frontend client micro-metrics (FCP) are design-assessed, not instrumented —
  consistent with the CW-01 posture (the page is part of the already-certified shared SPA bundle).

---

## 7. Security Results

### Permanent standards (re-run live at certification — all PASS)

| Standard | What it proves | Command | Result |
|----------|----------------|---------|--------|
| **SS-01** | Every grading endpoint declares auth/role/audit/rate-limit/validation/sanitisation | `docs/security-matrix.md` (review gate) | ✅ Enforced |
| **SS-02** | Authorization holds for every protected endpoint × 5 principals | `authz` | ✅ **235/235** |
| **SS-03** | Each critical operation records the correct, immutable audit event | `audit` (`CERT_AUDIT_RATELIMIT=1`) | ✅ **12/12 + immutable (static + runtime)** |
| **SS-04** | Production configuration matches explicit rules; drift fails cert | `config` | ✅ **31 pass / 3 warn / 0 fail** |

The three SS-04 warnings are documented development-mode exceptions (dev cookie `secure` off, dev
`script-src 'unsafe-inline'` for Vite HMR, seed admin password). Grading rows in SS-02 are correct:
`grade` operator+, `correct` supervisor+, `config-update` supervisor+, viewer read-only, anon 401.

### Grading-specific probes (11/11 PASS)

Config empty-body → 400; negative-bound grade (capacity/voltage/IR) → 400 (DEF-CW02-004 regression);
blank `gradedBy` → 400; **mass-assignment — injected `grade:"A"`/`status`/`id`/`lotId` ignored, server
computed `reject`**; mandatory `correctionReason` (blank + missing) → 400; valid grade + valid
correction; **ECF genealogy — seq1 `original` + seq2 `correction` preserved (immutable original).**

### Scanner results

- **Dependency audit:** 0 critical / 0 high / 0 moderate / 0 low.
- **Privacy scan (HoundDog):** 0 findings.
- **SAST:** 1 MEDIUM, in the `mockup-sandbox` dev canvas tool — **outside** the API / grading surface
  (same finding as CW-01; never deployed).

### Finding (documented, not hidden)

**OBS-CW02-M06-001 (Low, platform) → SEC-001.** SS-03 *default* shape-mode selects the newest
`ratelimit.exceeded` row and expects an `/auth/login` path; prior global-limiter flood residue
(MAT-05) leaves a global event newest → a **false FAIL** (the cause of the red default-mode `audit`
workflow). The audit logging is correct and fully wired; **authoritative mode passes 12/12**. No
grading audit gap, no security defect. Backlogged for Security Framework v2.0; **interim rule: use
authoritative mode whenever a run floods before audit verification.**

---

## 8. Architecture Decisions (wave-specific)

| # | Decision | Rationale |
|---|----------|-----------|
| AD-1 | Controlled measurement correction is append-only | Graded cells are corrected, never silently overwritten; mandatory reason + immutable original = factory traceability |
| AD-2 | Generalize the correction engine into the ECF | One module-agnostic immutable ledger (`engineering_corrections`) so every future module adopts correction without re-implementing immutability/authz; frozen v1.0 |
| AD-3 | Module table = current state; ledger = immutable history | The `cells` snapshot reflects the active (latest-sequence) result; full genealogy reconstructable from the ledger |
| AD-4 | TOCTOU-safe corrections | State guard re-checked inside the tx under `SELECT … FOR UPDATE`; ledger + snapshot + audit commit atomically |
| AD-5 | Computed grade, never client-trusted | Mass-assignment of `grade`/`status` is ignored; the server always computes the grade from measurements |
| AD-6 | Empty-body guard on all-optional PATCH/PUT | `{}` passes Zod but `db.update().set({})` throws → reject empty bodies with 400 (config update) |

Full detail: `replit.md` → Architecture decisions; `docs/engineering-correction-framework.md`.

---

## 9. Lessons Learned

1. **Generalize a proven engine once.** The ECF turned the Cell-Grading correction logic into a
   platform asset every module can reuse — platform improvement, not module-specific work.
2. **A frozen platform is consumed, not edited.** CW-02 added manufacturing capability on top of the
   frozen baseline; the Platform Scorecard's *Modules Using It* grows while *Version* stays put.
3. **Authoritative beats incidental in test design.** The SS-03 false negative shows a recency-based
   selector is fragile; deterministic verification (authoritative mode / class filtering) is correct.
4. **Mass-assignment defence must be positive.** Always compute server-side; never trust a body field
   that maps to a protected/derived value — proven by probe P4.
5. **Batch-then-triage works.** Running each MAT phase as one batch, collecting all findings, and
   getting CTO approval before any fix kept the wave clean and auditable.

---

## 10. Risks Accepted / Carried Forward

| Risk | Severity | Decision | Plan |
|------|----------|----------|------|
| SS-03 default-mode rate-limit false negative | Low | Backlogged (SEC-001) | Class-aware selector in Security Framework v2.0; use authoritative mode in the interim |
| IR non-binding under `nominalIrMohm=25` | Low | Calibration observation (MEB-001) | Grading algorithm + config review after CW-08 |
| No `idx_cells_created_at` | Low | Deferred (MEB-002) | Add for consistency in a future high-volume deployment |
| Stateless JWT has no revocation (≤8h window) | Low | Accepted (DEF-CW01-M06-005) | Platform-wide; revisit with denylist/refresh model if requirements change |
| Static-frontend document CSP absent | Low | Carried CW-01 recommendation | Add CSP at the static-serving/edge layer for the SPA document |

---

## 11. Certification Decision

**✅ PASS — CW-02 (Cell Grading) is CERTIFIED.**

All **required engineering** certification exit criteria are met (UAT sign-off is a non-blocking factory formality, pending):

- ✅ MAT-01 → MAT-06 complete; all actionable test cases passing.
- ✅ 0 Critical / 0 High / 0 Medium defects open.
- ✅ TypeScript: 0 errors across all workspace packages.
- ✅ ESLint: 0 warnings.
- ✅ Production-grade contracts verified (Orval codegen in sync; no spec drift).
- ✅ DB schema applied (`db push`) and verified (32 tables · 22 enums · 95 indexes).
- ✅ Security suites: SS-02 PASS (235/235) · SS-03 PASS (authoritative 12/12 + immutable) · SS-04 PASS (31/3/0).
- ✅ Integration with Receiving (upstream) and Matching/Manufacturing (downstream) verified live.
- ✅ Director dashboard reflects correct grading data.
- ✅ Documentation updated (`PROJECT_STATUS.md`, `CHANGELOG.md`, scorecard, backlogs, `MAT.md`).
- ✅ Certification fixtures torn down — 0 residual.

Carried forward: 4 Low observations (SEC-001, MEB-001, MEB-002, accepted JWT residual) — none block certification.

---

## 12. Sign-off

| Role | Name | Decision | Date | Signature |
|------|------|----------|------|-----------|
| QA / Engineering | Replit Agent | Recommend **CERTIFY** | 2026-06-28 | _Replit Agent (QA)_ |
| CTO | _________________ | ✅ Approved | 2026-06-28 | _CTO, OCS Oorja Green Pvt. Ltd._ |
| Factory UAT (Director/Supervisor) | _________________ | ☐ Accept ☐ Reject | __________ | _________________ |

---

## CTO Approval Record

| Field | Value |
|-------|-------|
| **Approval Number** | `CW-02-APR-001` |
| **Approval Date** | 2026-06-28 |
| **Wave Certified** | CW-02 — Cell Grading |
| **Baseline** | OCS One Foundation v1.0 (CW-01) + ECF v1.0 |
| **Git Tag** | `CW-02-CERTIFIED` |
| **Approved By** | CTO, OCS Oorja Green Pvt. Ltd. |
| **Next Authorized Wave** | CW-03 — Manufacturing Orders (begins only after the CW-02 freeze package is approved) |

> **CTO statement (2026-06-28):** MAT-06 is officially APPROVED and the CW-02 certification gate is
> CLOSED. Results accepted: 10/10 scorecard, PASS WITH NOTE, 0 Critical / 0 High / 0 Medium, all
> grading-specific security probes PASS, SS-02 / SS-03 (authoritative) / SS-04 PASS, dependency audit
> clean, SAST findings outside the certified grading surface, zero residual certification data.
> `OBS-CW02-M06-001` is a Low-priority platform observation (certification-harness limitation, not an
> audit or security defect) — recorded as Security Framework v2.0 enhancement **SEC-001**; no platform
> code changes authorized. Cell Grading certification is complete. CW-03 does not begin until the CW-02
> freeze package is completed and approved; the frozen-platform policy is maintained throughout.

---

*This document is the permanent audit record for CW-02. Per project policy, certified evidence is
immutable — corrections are appended as new entries, never rewritten.*
