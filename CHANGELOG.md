# OCS One — Changelog

All notable changes to this project are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased] — CW-02 Cell Grading

### 📋 Certification Process Review — Post CW-02 (2026-06-28)

Documentation/process-improvement activity (no production code, no platform changes) across the two
completed waves (CW-01, CW-02) to standardize the cert process for CW-03 → CW-08.

- **New:** `certification/CERTIFICATION_PROCESS_REVIEW.md` — 8-section report (Executive Summary,
  Lessons Learned, Standard Certification Templates, Standard Certification Harness, Standard
  Documentation Templates, Certification Metrics, Recommended Improvements, Action Items).
- **New:** `docs/certification-framework-backlog.md` — **CF-001…CF-005** (harness consolidation,
  scaffold generator, metrics rollup, pre-wave readiness check, parameterized perf harness) —
  **recorded, not implemented** per the freeze.
- **Process adopted (doc-only):** frozen 6-phase MAT taxonomy (resolves MAT-03/04 title drift between
  waves); CW-02 documents declared canonical templates; programme index kept current at every gate;
  pre-wave checklist; SS-03 authoritative-mode default for flood/stress waves.
- **Scorecard:** Certification Framework Enhancement Backlog Count 0 → 5.
- **Index refreshed:** `certification/README.md` — CW-01 + CW-02 marked 🔵 Certified, summary table and
  progress (2/8, 25%) corrected, canonical-template + frozen-taxonomy notes added.
- No ODS / ECF / Security Standards / Product Platform / certified-module changes. **CW-03 begins only
  after this review is approved.**

### 🔵 CW-02 — Cell Grading — CERTIFIED (2026-06-28)

Certification Wave 02 is **CERTIFIED** (MAT-01 → MAT-06 all PASS). The **Cell Grading** module and the
**Engineering Correction Framework (ECF) v1.0** (reference consumer: Cell Grading) are frozen on top of
OCS One Foundation v1.0. **0 Critical / 0 High / 0 Medium defects open**; 6 defects all Closed; 4 Low
observations backlogged (SEC-001, MEB-001, MEB-002, accepted JWT residual). Closure suite re-run live:
typecheck 0 · lint 0 · SS-02 235/235 · SS-03 authoritative 12/12 + immutable · SS-04 31/3/0.

- **Freeze package:** `CW-02_CERTIFICATION_REPORT.md` (12 sections + CTO Approval Record `CW-02-APR-001`),
  `CW-02_FREEZE_NOTICE.md` (freeze rules + CW-03 authorization), `certification/CW-02-Cell-Grading/PROJECT_STATUS.md`,
  filled `certification/CW-02-Cell-Grading/Certification.md`. Git tag `CW-02-CERTIFIED` recorded (literal
  ref pending a background task — main agent cannot tag).
- **OBS-CW02-M06-001 → SEC-001** recorded as a **Security Framework v2.0** enhancement in
  `docs/security-framework-backlog.md`; platform scorecard Security Standards backlog 0 → 1. No platform
  code changed — freeze policy maintained.
- **CW-03 — Manufacturing Orders** authorized to begin only after the CW-02 freeze package is approved.

### 🟦 MAT-06 — Security & Reliability Certification — APPROVED & gate CLOSED (2026-06-28)

Full-batch security & reliability certification of the Cell Grading module across the 14 standard
security areas. Cell Grading's security is governed by the **frozen platform standards** (SS-01..04,
ECF immutability); MAT-06 re-runs those suites live, confirms grading endpoints/events are inside each
source-of-truth matrix, and adds grading-specific probes. **Scorecard 10/10 · 0 Critical/High/Medium ·
1 Low platform finding.** No production code or configuration was changed — measurement only.

- **Frozen platform suites (live):** SS-04 config **31 pass / 3 warn / 0 fail** (warns documented
  dev-only); SS-02 authz **235/235** (grading rows correct: grade operator+, correct supervisor+,
  config-update supervisor+, viewer read-only/anon 401); SS-03 audit **authoritative mode
  (`CERT_AUDIT_RATELIMIT=1`) 12/12** incl. `cell_grade_corrected` + immutability proven static + runtime.
- **Grading-specific probes 11/11 PASS:** config empty-body→400; negative-bound grade (capacity/
  voltage/IR)→400 (DEF-CW02-004 regression); blank `gradedBy`→400; **mass-assignment — injected
  `grade:"A"`/`status`/`id`/`lotId` ignored, server computed `reject`**; mandatory `correctionReason`
  blank+missing→400; valid grade + valid correction; ECF genealogy seq1 `original` + seq2 `correction`
  preserved (immutable original).
- **Scanners:** dependency audit **0 critical/high/moderate/low**; HoundDog privacy **0**; SAST **1
  MEDIUM** in `mockup-sandbox` dev canvas tool (off the API/grading surface — same as CW-01).
- **Teardown:** all `CERTM06-*` throwaway fixtures removed set-based → **0 residual** (baseline restored
  exactly: 58 cells / 14 lots / 1 ECF / 23 events).
- **Finding (presented to CTO before any fix — batch methodology): OBS-CW02-M06-001 (Low, platform).**
  SS-03 *default shape-mode* `ratelimit.exceeded` check selects the single most-recent row and asserts
  path includes `/auth/login`; prior global-limiter flood residue (MAT-05) leaves global rows newest →
  **false FAIL** (the cause of the red `audit` workflow). Audit logging is correct & fully wired;
  authoritative mode passes 12/12. Recommend a small SS-03 selector fix or backlog under the freeze
  policy — **CTO decision; NO fix applied.**
- **Gate:** MAT-06 **APPROVED & CLOSED by CTO (2026-06-28)** — decision PASS WITH NOTE; OBS-CW02-M06-001
  accepted as a Low platform observation → SEC-001 (no platform code change authorized). Full record:
  `certification/CW-02-Cell-Grading/MAT-06.md`.

### ✅ MAT-05 — Performance & Stress Certification — APPROVED & gate CLOSED (2026-06-28)

Full-batch performance & stress certification of the Cell Grading module against a representative
1,058-cell dataset. **All measured API + stress thresholds met by 28–60× · scorecard 10/10 ·
0 Critical/High/Medium.** No production code or configuration was changed — measurement only.

- **Dataset:** seeded `CW02-PERF-` lot + 1,000 cells (100 received / 700 approved A·B·C / 200
  rejected) → 1,058 cells total. Prefix-tagged for set-based teardown.
- **API P95:** GET reads 3–12 ms (list/filter/deep-page/search/single-cell/config/measurements);
  write paths `POST /grade` and `POST /correct` 14 ms — all far under their 200–500 ms thresholds.
- **Query plans (`EXPLAIN ANALYZE`):** resolves **OBS-CW02-002** — `cells` indexes are *used* when
  the filter is selective (`grade=A`→`idx_cells_grade`, `status+grade`→`idx_cells_status_grade`) and
  a seq-scan is *correctly* chosen only when non-selective (`status=approved` 67%, `lot_id` 94%).
  Optimal cost-based planning, **not** a missing index. Closed.
- **Stress:** 25/50 concurrent → 75/75 OK (≤ 186 ms, 269 req/s); rapid 100-loop P95 6 ms; rate
  limiter sheds 235/360 under flood (as designed). **Teardown 0 residual**, pre-seed baseline
  restored exactly (58 cells / 14 lots / 1 ECF / 23 events).
- **Findings (presented to CTO before any fix — batch methodology):** (1) **OBS-CW02-003 (Low,
  module-specific)** — no `idx_cells_created_at`; list `ORDER BY created_at DESC` does a top-N
  heapsort (negligible: 0.20 ms / 32 kB at 1,058 rows). Recommend the index for consistency with
  the receiving-side `DEF-CW01-M05-001`; **deferred, not fixed**. (2) **Baseline extension (platform,
  additive)** — grading routes are absent from `PERFORMANCE_BASELINE_V1`; recommend additive
  registration so `/developer/performance` defends them — frozen baseline **not** modified
  unilaterally; CTO decision.
- **Gate:** MAT-05 **APPROVED & CLOSED by CTO (2026-06-28)** — decision PASS WITH NOTES; performance
  observations backlogged (MEB-001/002). Proceeded to MAT-06.

### ✅ MAT-04 — Integration Certification — CERTIFIED & gate CLOSED (2026-06-28)

Full-batch integration certification of the Cell Grading module's contracts with the rest of
the line. **17/17 integration cases PASS · 10/10 scorecard · 0 defects.** No production code or
configuration was changed — verification only.

- **Scope:** upstream (Receiving lot/cell creation → Grading consumes `received` cells; lot
  roll-up `received`→`grading`→`graded`, last-cell-gated; lot isolation) and downstream
  (approved → Matching reserve with atomicity + non-approved exclusion + insufficiency 422 →
  Manufacturing allocation `reserved`→`allocated` + genealogy auto-write + order link →
  bidirectional back-pressure on committed cells), plus an end-to-end single-cell trace.
- **Method:** one live batch against `localhost:80` with prefix-tagged (`MAT04-CERT-`) throwaway
  fixtures spanning receiving→grading→matching→allocation; every case DB-verified via SQL.
  Matching algorithm paths tested read-only (global approved pool) while contract mutations ran
  over purpose-built matches on owned cells (no data contamination). Full **set-based,
  prefix-scoped** teardown verified to **0 residual** (`cell_lots` / `cell_matches` /
  `mfg_production_orders` / `engineering_corrections`).
- **Verified findings (positive):** ECF engages at the grading boundary (first grade writes an
  `engineering_corrections` original row); back-pressure is bidirectional and reason-correct
  ("committed to production"); allocation is atomic (no partial reservation on conflict).
- **Gate:** MAT-04 **CLOSED by CTO (2026-06-28)** — 0 defects, 0 open Critical/High. The
  set-based, prefix-scoped teardown is accepted as the **permanent standard teardown methodology
  for all remaining cert waves (CW-02 → CW-08)** (`certification/README.md`). Next: MAT-05
  (Performance & Stress).

### ✅ MAT-03 — Business-Rule Certification — EXECUTED & gate CLOSED (2026-06-28)

Full-batch business-rule certification of the Cell Grading module. **30/30 boundary cases
PASS · 8/8 rule dimensions verified · 0 defects.** No production code or configuration was
changed — verification only.

- **Scope:** grade computation (capacity bands + IR-multiplier, inclusive boundaries,
  first-match-wins), status transitions + override semantics (grade never overridden, `"null"`
  ignored), gradeable-status guards, controlled-correction recompute + status guards +
  append-only history, lot roll-up (partial vs full) + timeline events, and config behaviour
  (singleton, read-only GET, empty-body→400, live-config-drives-grade).
- **Method:** one live batch against `localhost:80` with prefix-tagged throwaway fixtures,
  DB-verified via SQL, config snapshot→flip→restore byte-exact inside `try/finally`. All cert
  fixtures torn down (0 residual). SS-04 re-verified post-run — **no config drift** (31 pass ·
  3 dev-warn · 0 fail).
- **OBS-CW02-001** (IR multiplier non-binding under `nominalIrMohm=25` → capacity-only grading)
  verified by BR-30. **CTO ruling 2026-06-28:** Engineering Calibration Observation, **not a
  certification defect** — grading engine behaves exactly as specified. Recorded in the new
  **Manufacturing Engineering Backlog** (`docs/manufacturing-engineering-backlog.md`, MEB-001);
  grading algorithm + configuration to be reviewed during Manufacturing Engineering
  Optimization after CW-08. No grading engine/config change during CW-02.
- **Gate:** MAT-03 **CLOSED** (0 open Critical/High). Next: MAT-04 Integration Certification.

### 📥 Grading Import Framework — architecture review + Phase 1 extension points (CTO-approved)

Prepares Cell Grading for future bulk / machine grading imports **without a second grading
engine and without changing the certified manual-entry behaviour**. Manual entry remains the
certified reference implementation; the live `POST /:id/grade` route is untouched.

- **Architecture review** (`docs/architecture/grading-import-framework-review.md`): verified
  exactly **one grading engine** — `calcGrade()` in `routes/cells/cells.ts`, shared by both the
  grade and correct routes. No grading-logic duplication. Two *non-engine* blocks
  (status-derivation + config-default fallback) are duplicated verbatim across the two routes —
  noted as a minor future consolidation, not a second engine.
- **Recommended pipeline** (all sources funnel through it): Source → `GradingImportSource` adapter
  → normalized `GradingMeasurementRecord[]` → Validation → Preview → Operator Approval → the
  existing engine → ECF → Audit.
- **Phase 1 (additive only)** — new module `artifacts/api-server/src/routes/cells/import/`:
  `GradingImportSource` adapter interface, normalized `GradingMeasurementRecord`, a
  `ManualGradingSource` reference (manual entry = the one-row import case), and
  `validateRecord()`/`validateContext()`/`buildPreview()` Validation+Preview helpers that
  faithfully mirror the certified `GradeCellBody` contract (measurement bounds, `overrideStatus`
  enum domain, non-blank operator attribution).
- **Scope guard:** `"manual"` active; `"excel"`/`"csv"` **reserved** (no parsers);
  PDF / Word / Machine API / OPC-UA / Modbus explicitly excluded (no code, no enum values).
- **Verified:** typecheck + lint (0 warnings) + SS-02/SS-03/SS-04 cert suites all green; certified
  codebase byte-identical.

### 🧬 Engineering Correction Framework (ECF) — platform extraction (CTO-approved, pre-MAT-03)

The proven Cell-Grading correction engine (DEF-CW02-006) is extracted into a reusable
platform framework so **every** module corrects certified engineering records the same
audited way — instead of re-implementing append-only/immutability/authorization logic
per module. **Only Cell Grading is migrated now** (the reference consumer); no other
module is touched, by direction.

- **Generic ledger (`engineering_corrections`).** One module-agnostic append-only store
  is the immutable correction history across all modules; the module table stays the
  source of truth for *current* state. Columns carry no module vocabulary —
  `entityType` / `entityId` / `sequence` (engineering version) / `correctionType` /
  `previousValue` / `newValue` (JSONB) / `reason` / `performedBy` / `approvedBy` /
  `auditEventType` / `metadata` (JSONB). `entityType` enum ships 14 values (8 base +
  INVERTER / SOLAR_SYSTEM / EV_CHARGER / RAW_MATERIAL / BMS / CABINET).
- **Unique Correction ID on every row.** `CORR-YYYYMMDD-NNNNNN` (originals included),
  numbered from a global Postgres sequence (`ecf_correction_seq`) — collision-free under
  concurrency.
- **Service lib `@workspace/ecf`.** `EngineeringCorrectionService` —
  `recordOriginal` / `correct` / `getHistory` / `validateCorrection`, all writes inside a
  caller-provided transaction. The framework owns storage, version generation, Correction
  ID generation, reason+actor validation, role authorization, and immutability; the module
  owns its row lock, business rules, value recalculation, snapshot update, and its own
  audit event.
- **Cell Grading migrated (behavior + API contract unchanged).** Grade →
  `recordOriginal` (entityType `CELL`); correct → `correct` (mandatory reason, prev/new
  snapshot, role-gated, still emits `cell_grade_corrected` on `cell_lot_events`);
  `GET /cells/{id}/measurements` → `getHistory` mapped to the identical `CellMeasurement`
  shape (now also carrying `correctionId`). `cell_grade_measurements` dropped.
- **Reusable ODS `OdsCorrectionHistory`.** Module-agnostic genealogy view (version,
  Correction ID, actor, reason, previous→new field diff). Cell Grading's grading page is
  the reference consumer — a **History** action on any graded cell.
- **SS-03 extended to the ledger.** `engineering_corrections` is now in the
  audit-immutability suite (static: no app route updates/deletes it; runtime: a captured
  row is byte-identical after a full run). SS-02 / SS-03 / SS-04 all PASS; full typecheck
  and lint (0 warnings) green.
- **ECF v1.0 FROZEN (CTO directive).** ECF is accepted as a core platform service. Frozen
  interfaces — `recordOriginal` / `correct` / `getHistory` / `validateCorrection`. Platform
  rules now binding: the generic ledger is the single correction history (no module may
  build its own); every correction-allowing module **must** integrate with ECF (future
  work — not during CW-02); Engineering Version (`sequence`, 1=original / 2+=correction)
  is a platform concept that never resets or renumbers; Correction ID `CORR-YYYYMMDD-NNNNNN`
  is the official engineering reference number. **No further ECF expansion during CW-02** —
  improvements (e.g. correction attachments) are recorded as ECF v1.1 enhancement requests
  for after all certification waves. Continue Cell Grading certification on the frozen
  framework.
- **ECF Compatibility Rule + Enhancement Backlog (CTO directive).** Once a module uses
  ECF its integration contract stays backward compatible: existing APIs keep working,
  existing correction records stay readable, Correction IDs never change, Engineering
  Versions stay valid, new capabilities are additive. A breaking change ships only as
  **ECF v2.0** after an explicit migration plan + compatibility review. A structured
  enhancement backlog is now maintained (ID / description / business value / impacted
  modules / complexity / target version): **ECF-001** Correction Attachments,
  **ECF-002** Digital Approval Signatures, **ECF-003** Multi-level Engineering Approval
  Workflow, **ECF-004** Electronic NCR / CAPA Integration, **ECF-005** External ERP / MES
  Synchronization. None built during certification waves unless a cert defect requires a
  platform fix. See `docs/engineering-correction-framework.md`.
- **Platform Scorecard — operational dashboard (CTO directive).** Platforms are measured by
  **adoption AND platform health**. `docs/platform-scorecard.md` is now an operational
  dashboard (the first place to look before modifying any platform), tracking each frozen
  platform (ODS, ECF, Security Standards, Certification Framework) by ten fields — Version,
  Freeze Status, Modules Using It, Last Platform Change, Open Critical Defects, Open High
  Defects, Breaking Changes Since Freeze, Certification Status, Next Planned Version,
  Enhancement Backlog Count. Adoption metric = *Modules Using It* (grow while version stays
  put); health metrics = *Open Critical/High Defects = 0* and *Breaking Changes Since
  Freeze = 0*. A healthy platform supports more manufacturing capability with fewer changes
  over time.
- **Unified Product Platform — architecture FROZEN v1.0 (CTO, architecture-only).** Approved
  and frozen design (no code): everything leaving the factory becomes a serialized **Product**
  created at the QC-pass gate; all downstream modules reference Product. Four orthogonal
  concepts (Product Category / Product Model = existing `master_products` / Manufacturing
  Workflow / Product) + a Manufacturer master; unified `official_product_serial` + `serial_source`;
  permanent rule **No Product before QC PASS**. Strictly additive phased migration, consumes the
  frozen platforms unmodified. No new architectural concepts during CW-02→CW-08 except for a
  Critical cert defect; implementation starts after CW-02 closes; future ideas tracked in the
  Product Platform Enhancement Backlog (PP-001…PP-006). Full review + ERD/diagrams + freeze +
  backlog: `docs/architecture/unified-product-platform-review.md`.
- **Documentation Refactoring Sprint — PLANNED for immediately after CW-02 closes (CTO).** Doc-only
  cleanup, deferred to avoid churn during certification. During CW-02, keep updating existing
  documentation locations. After CW-02: keep `replit.md` a lightweight index + dev guide; move
  detailed architecture → `docs/architecture/`, governance → `docs/governance/`, Product Platform
  docs → `docs/product/`; preserve all content and cross-reference (no duplication). **Maintenance
  only — no implementation changes; the certified codebase must not be touched.**


> **Certification Wave 02 — Cell Grading.** MAT-01 (Page & Navigation) and MAT-02 (CRUD &
> Data Integrity) both executed and closed at FULL PASS (10/10 each). Platform/ODS remains
> frozen except CTO-approved cert-driven corrections.

### 🛡️ MAT-02 remediation — data integrity & controlled corrections (DEF-CW02-004/005/006)

CTO-approved single-batch remediation of all 3 MAT-02 defects; full MAT-02 batch re-run to PASS.

- **DEF-CW02-004 (High) — strict numeric measurement validation.** `CellGradeInput` (and the new
  `CellCorrectionInput`) now bound engineering values: `capacityAh` and `voltageV` carry
  `exclusiveMinimum: 0`, `internalResistanceMohm` carries `minimum: 0` (IR=0 is physically valid).
  Zod/hooks regenerated; the server rejects out-of-range values with **400** before any DB write,
  so corrupt data can no longer enter the certified grade record or feed downstream matching.
- **DEF-CW02-005 (Medium) — operator attribution required.** `gradedBy` (and correction
  `correctedBy`) carry `minLength: 1`; the server **trims** then rejects blank/whitespace with
  **400**, closing the empty-actor traceability gap.
- **DEF-CW02-006 (Medium) — controlled correction workflow.** Graded cells are no longer locked
  out of correction. New append-only `cell_grade_measurements` store (sequence, type
  `original|correction`, measurements, grade/status, gradedBy, correctionReason, createdAt; latest
  sequence = active). `POST /cells/{id}/correct` (**supervisor/director only, mandatory
  `correctionReason`**) recomputes the grade, **appends** a correction (original immutable),
  updates the cell snapshot, and emits a `cell_grade_corrected` audit event. `GET
  /cells/{id}/measurements` exposes the full reconstructable genealogy. The grade route now also
  writes the seq-1 `original` measurement. ODS-only supervisor+ **Correct** action + mandatory-reason
  modal added to the grading page.
  - **Concurrency hardening (architect review):** the `reserved`/`allocated` production-committed
    guard is re-validated INSIDE the correction transaction under a `SELECT … FOR UPDATE` row lock,
    not only in the pre-check — closing a TOCTOU window and serialising concurrent corrections so the
    append `sequence` cannot collide.
  - **Security matrices extended (cannot drift):** SS-02 authz adds `cells.correct`
    (supervisor/director write; operator/viewer/anon denied) + `cells.measurements` (all authed
    read); SS-03 audit adds `cell_grade_corrected` (store `cell_lot`). SS-01 security matrix doc
    updated for both new endpoints.
- **Verification (FULL MAT-02 re-run, batch — no per-defect loops):** 16/16 GR assertions PASS;
  10/10 scorecard (Edit/correction + Validation now ✅). SS-02 (235/235), SS-03 (12/12 +
  immutability static+runtime), SS-04 (31 pass · 3 dev-warn · 0 fail) all green; `typecheck` +
  `lint` (0 warnings) green. All throwaway cert fixtures torn down. **DEF-CW02-004/005/006 Closed;
  MAT-02 gate closed (0 open Critical/High).**
  - **Observations (recorded, not in scope):** the correction pattern (append-only versioned
    measurement + mandatory-reason audit + immutable original) is a candidate for a reusable
    platform framework; a repo-wide SS-01 sweep of other unconstrained numeric schemas is
    recommended — both deferred to a future wave.

### ♻️ Platform certification defect — notifications unified on ODS (DEF-CW02-002)

- **`useToast` → `useOdsNotify` (platform-wide).** MAT-01 found the Cell Grading module (and ~17
  other surfaces) calling the raw shadcn `useToast` instead of the ODS-certified `useOdsNotify`
  wrapper. Per the standing cert-wave triage rule, the CTO classified this as a **platform
  improvement** (Option 1) and authorized a one-time migration so every module benefits, not just
  the module under cert.
  - **145 calls migrated across 18 files.** Mapping: `variant:"destructive"` → `notify.error(title, { description })`; everything else → `notify.success(title, { description })`. All title/description text preserved verbatim.
  - `useToast` is now **DEPRECATED** for application code and confined to its 3 infra files
    (`hooks/use-toast.ts` primitive, `components/ui/toaster.tsx` renderer, `hooks/use-ods-notify.ts`
    wrapper). `useOdsNotify` is **MANDATORY** for all modules. ODS registry updated accordingly.
  - **Verification:** zero `useToast`/bare `toast(` calls remain in consumers; `typecheck` +
    `lint` (0 warnings) green; SS-02 (225/225), SS-03 (11/11 + immutable), SS-04 (31 pass · 3
    dev-warn · 0 fail) all PASS; smoke test — all 18 files hot-reloaded with zero console errors.

### 🩹 Module fixes — Cell Grading (DEF-CW02-001, DEF-CW02-003)

- **DEF-CW02-001** — removed premature `certification="certified"` badge on the Cell Grading
  `ModuleHeader` (set to `development`); the module no longer claims certification before CW-02 closes.
- **DEF-CW02-003** — added refresh action (`onRefresh` + `isRefreshing`) to the Cell Grading
  `OdsToolbar`, mirroring the certified Cell Receiving page.

---

## [1.0.1] — CW-01 Cell Receiving CERTIFIED — 2026-06-28 (tag `CW-01-CERTIFIED`)

> **Certification Wave 01 — Cell Receiving — CERTIFIED.** MAT-01 → MAT-06 all PASS; 37 defects
> filed, 0 Critical/High/Medium open at freeze. Full audit record: `CW-01_CERTIFICATION_REPORT.md`.
> This release also adds four permanent certification standards on top of the foundation, plus
> the CSP production hardening that resolves DEF-CW01-M06-004. All four standards run as automated
> regression suites; any failure fails certification.

### 🔐 Permanent certification standards

- **SS-01 — Security matrix** (permanent rule): every new endpoint must declare auth required? /
  minimum role / audit required? / rate limited? / input validation? / output sanitised? before
  merge. `docs/security-matrix.md` is authoritative per-endpoint.
- **SS-02 — Authorization regression** (validation command `authz`): `lib/authz-matrix.ts`
  (45 endpoints × 5 principals = 225 assertions) drives `cert/authz-suite.ts` and the security
  dashboard from one source. ✅ 225/225.
- **SS-03 — Audit-trail verification** (validation command `audit`): `lib/audit-matrix.ts`
  (11 operations across `security_events` + `cell_lot_events`) drives `cert/audit-suite.ts`;
  performs each real operation, asserts the event persisted with all fields, and proves
  immutability (static + runtime). ✅ 11/11 + immutable.
- **SS-04 — Configuration integrity** (validation command `config`): `lib/config-integrity.ts`
  (`gatherConfig()` + `validateConfig()`, 34 checks across 12 categories) drives
  `cert/config-suite.ts` and the new configuration dashboard from one source. FAIL = drift =
  production defect; WARN only for documented dev-mode exceptions. ✅ 31 pass / 3 warn / 0 fail.
  A production-mode run correctly FAILS on the default admin password — enforcement is real.

### 🛡️ Security hardening

- **CSP environment-aware (DEF-CW01-M06-004 RESOLVED)** — `script-src` drops `'unsafe-inline'`
  in production (kept in dev only for the Vite HMR client); `style-src` retains `'unsafe-inline'`
  as a documented temporary exception (Radix/shadcn/Recharts inject inline styles). SS-04
  enforces both rules. Caveat: the frontend is served as static files separate from the API, so
  this helmet CSP governs API responses (defense-in-depth); a static/edge-layer document CSP is a
  CW-02 recommendation.
- **Persistent security audit** — `security_events` table records `auth.login.success`/`failed`,
  `auth.logout`, `user.created`, `authz.denied` (403s), and `ratelimit.exceeded` via
  fire-and-forget `recordSecurityEvent()`.
- **RBAC enforcement** — `requireWriteRole(...)` makes viewer read-only everywhere; writes gated
  to listed roles (director always included). Public self-registration removed (`/auth/register`
  director-only, rate-limited, audit-logged).
- **Input validation** — all-optional PATCH/PUT bodies reject `{}` with 400 (DEF-EMPTY-BODY).

### 🧭 Developer dashboards (director-only)

- **`/developer/security`** — 12 sections (users-by-role, live authorization matrix, failed
  logins, rate-limit events, account creations, permission failures, audit feed, event
  histogram, SAST/privacy summary, dependency audit, CSP status, JWT/session + cert status).
- **`/developer/configuration`** — live configuration-integrity report driven by the same
  `gatherConfig()`/`validateConfig()` SS-04 uses (never exposes secret values).

### 🏷️ Versioning

- `@workspace/api-server` bumped `0.0.0` → `1.0.0` (SS-04 version-consistency check now passes).

---

## [1.0.0-foundation] — 2026-06-27

> **Foundation Release.** The complete operational baseline for OCS Oorja Green Pvt. Ltd.
> manufacturing ERP. All core infrastructure, business modules, and the ODS design system are frozen at v1.0.

---

### 🗄️ Database Architecture

- **PostgreSQL + Drizzle ORM** — 15 schema modules, fully typed
- `users` — RBAC user accounts (`director | supervisor | operator | viewer`)
- `manufacturing` — production orders, stage lifecycle, cell allocation, BMS allocation
- `cell_grading` — cell lots, individual cell grades, grade configuration
- `logistics` — dispatch orders, dispatch items, shipment events, dealers
- **Masters**: products, BMS, cells, chargers, test equipment, connectors, cables, busbars, cabinets
- Postgres sequences `mfg_order_seq` / `mfg_battery_seq` for race-free ID generation
- DB indexes on all high-traffic query columns
- Admin seed on startup: `admin@ocs.local` (director)

---

### 🔌 API Framework

- **Express 5** + Pino structured logging
- **JWT in httpOnly cookie** (`ocs_token`, signed with `SESSION_SECRET`) — eliminates XSS token theft
- **RBAC middleware** — `requireAuth` / `requireRole(...roles)` on every protected route
- **Helmet** security headers
- **CORS** controlled via `ALLOWED_ORIGINS` env var
- **Rate limiting** — 300 req/min global, 20/15min on auth routes
- **Trust proxy = 1** — required for Replit reverse proxy compatibility
- **OpenAPI spec** (`lib/api-spec/`) as the single contract source
- **Orval codegen** — React Query hooks (`lib/api-client-react`) + Zod schemas (`lib/api-zod`) generated from OpenAPI

---

### 🏗️ Engineering Masters

Fully CRUD, paginated, searchable, with ODS toolbar + data table.

| Master | Route | Description |
|--------|-------|-------------|
| Products | `/masters/products` | Battery pack product catalogue |
| BMS | `/masters/bms` | BMS model registry |
| Cells | `/masters/cells` | Cell model specifications |
| Chargers | `/masters/chargers` | Charger unit registry |
| Test Equipment | `/masters/test-equipment` | Testing instrument registry |
| Connectors | `/masters/connectors` | Connector type catalogue |
| Cables | `/masters/cables` | Cable type catalogue |
| Busbars | `/masters/busbars` | Busbar specification registry |
| Cabinets | `/masters/cabinets` | Cabinet/enclosure catalogue |
| Charger Units | `/manufacturing/chargers` | Physical charger unit management |
| Dealers | `/logistics/dealers` | Dealer master with GST/location |

---

### ⚙️ Manufacturing Engine

**Cell Receiving & Grading**
- Inbound cell lot creation with supplier, model, batch, quantity
- Per-cell grading (capacity, internal resistance, voltage)
- Grade configuration (A/B/C thresholds)
- Grade-based cell allocation for battery packs
- Cell reservation / release lifecycle

**Production Orders**
- Full 9-stage lifecycle: Cell Allocation → Assembly → Compression → BMS Install → BMS Programming → Charging → Testing → Quality Control → Packing
- Stage state machine: `pending → in_progress → completed → approved / rejected`
- Per-stage data capture with supervisor sign-off
- Priority levels: low / medium / high / urgent
- Rework queue for rejected stages

**Charging**
- Charger unit assignment to production orders
- Live charging dashboard (available / busy / maintenance)
- Formation charge completion reports

**Testing & QC**
- Test result capture (pass/fail per parameter)
- QC approval / rejection with notes
- 30-day quality summary metrics

**Packing**
- Packing completion with final weight / dimensions
- Dispatch readiness flag

---

### 🚚 Logistics

- Dispatch orders with dealer assignment
- 5-step status workflow: Draft → Confirmed → Loaded → In Transit → Delivered
- Battery item addition / removal (draft stage only)
- Shipment event logging (actor, notes, timestamp)
- Dealer master with GSTIN, location, contact

---

### 📊 Reporting

| Report | Route | Description |
|--------|-------|-------------|
| Production Report | `/reports/production` | Orders, throughput, efficiency by date range |
| QC Report | `/reports/qc` | Pass rates, reject reasons, sample counts |
| Cell Grading Report | `/reports/cell-grading` | Grade distribution, supplier analysis |
| Logistics Report | `/reports/logistics` | Dispatch summary, dealer performance |

---

### 📈 Director Dashboard

Live command center at `/` (director role):

- **8 KPI cards** — Today's Target, Completed, Efficiency, In Progress, QC Pending, Dispatch Ready, Rework Queue, Charger Utilisation
- **Manufacturing pipeline** — Live stage-by-stage health (green / yellow / red)
- **Factory alerts** — Critical / Warning / Info feed
- **Recent production orders** — Last 10 with status + priority
- **Operator activity** — Per-operator battery completions today
- **Equipment status** — Charger + test equipment availability bars
- **Cell inventory** — Received / Grading / Approved / Allocated / Rejected / Quarantine
- **Quality summary** — 30-day pass rate, reject rate, sample count
- **Logistics summary** — Ready for dispatch, in transit, delivered today
- **Quick actions** — 6 one-click navigation shortcuts
- **Auto-refresh** — 30-second countdown with manual override

---

### 🎨 ODS Design System v1.0 — FROZEN

**19 certified components:**

| Component | Category |
|-----------|----------|
| ModuleHeader | Foundation |
| OdsCertBadge | Foundation |
| OdsStatusBadge | Foundation |
| OdsEmptyState | Foundation |
| OdsTableSkeleton | Foundation |
| OdsSearchBar | Interaction |
| OdsToolbar | Interaction |
| OdsDrawer | Overlay |
| OdsDialog | Overlay |
| OdsDataTable | Data |
| OdsCommandPalette | Navigation |
| useOdsNotify | Feedback |
| OdsDevMode | Developer |
| OdsMetricCard | KPI |
| OdsMetricGrid | KPI |
| OdsChartCard | Chart |
| OdsTimeline | History |
| OdsStepper | Workflow |
| OdsPageLayout | Layout |

Design tokens in `src/ods/theme/`. Registry at `artifacts/ocs-one/docs/ods-component-registry.md`.

---

### 🛠️ Developer Portal

- **`/developer/architecture`** — Interactive module dependency map (13 nodes, detail panel with APIs / tables / components / ODS usage)
- **`/design-system`** — Live component showcase with interactive examples for all 19 ODS components
- **`Ctrl+K`** — Global command palette with module navigation and developer shortcuts
- **`Ctrl+Shift+D`** — Developer mode overlay showing page info, environment, shortcuts

---

### 🔐 Security & Auth

- JWT httpOnly cookie — no localStorage token exposure
- bcryptjs password hashing (10 rounds)
- Role-based access control on all routes
- Helmet security headers
- CORS allowlist
- Rate limiting (auth routes: 20 req/15min)
- Input validation via Zod on all API endpoints
- SQL injection protection via Drizzle ORM parameterised queries

---

### 🏗️ Infrastructure

- pnpm workspaces monorepo (Node.js 24, TypeScript 5.9)
- Shared libs: `@workspace/db`, `@workspace/api-spec`, `@workspace/api-client-react`, `@workspace/api-zod`
- esbuild CJS bundle for API server
- Vite + React 19 frontend
- ESLint flat config (zero warnings enforced)
- Replit workflow-based process management
