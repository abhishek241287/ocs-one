# CW-03 Implementation Plan — Manufacturing Orders Certification

| Field | Value |
|-------|-------|
| **Wave** | CW-03 — Manufacturing Orders |
| **Type** | Certification wave (the module is already **built**; CW-03 **certifies** it) |
| **Prepared** | 2026-06-28 |
| **Status** | **Draft for CTO review — NO implementation/certification execution begins until this plan is approved** |
| **Consumes (unmodified)** | Unified Product Platform architecture v1.0 · ECF v1.0 · Security Standards SS-01…04 · ODS · Certification Framework v1.0 |
| **Mantra** | Do not assume. Measure. Verify. Document. |

> **Pre-implementation reviews completed** (CTO directive items 1–3): the frozen **Unified Product
> Platform** architecture (`docs/architecture/unified-product-platform-review.md`), the frozen **ECF**
> (`docs/engineering-correction-framework.md`), and the **Product Platform** four-concept foundation
> were reviewed. This plan (item 4) consumes them **without modification**. **No production code and no
> certified-module change is proposed.** The *only* possible framework-level action is the **SS-03
> audit-matrix decision** (§5 / §7) — pre-classified as a potential **High / security-defect** path
> permitted by the freeze exception, with a documented no-framework-change fallback. See the
> **Assumption Ledger (§11)** for what is true today vs. planned later.

---

## 1. Executive Summary

The **Manufacturing Orders** module is already fully built: a rigid **9-stage** battery production
lifecycle (`cell_allocation → assembly → compression → bms_allocation → bms_programming → charging →
testing → quality_control → packing`) with cell allocation, charger management, battery genealogy, QC
approval, rework, and a complete ODS frontend (Orders list, Battery Workspace, Charging/Testing
dashboards, Digital Passport). CW-03 therefore **certifies the existing module on the frozen baseline**
using the now-standard certification process — it does **not** build new capability and does **not**
implement the Unified Product Platform.

This is the first wave to run **after** the Certification Framework froze at v1.0, so CW-03 is also the
first wave to **consume the standard process rather than evolve it**: standard MAT taxonomy, canonical
templates, standard harness, standard scorecards, standard freeze package. Engineering effort goes to
*certifying manufacturing capability*, not to process tooling (any tooling idea → CF backlog).

**Recommended CW-03 scope:** certify the **current battery-only Manufacturing Orders module as-is**
(see §2). The Unified Product Platform implementation (products identity, QC-pass emit, workflow-driven
stage engine, INBUILT_LITHIUM/HYBRID) is **separate future manufacturing-capability work** with its own
phased plan and re-certification — explicitly **out of CW-03 scope**, because its Phase 3 *modifies* the
certified manufacturing module, which would contradict "consume the frozen platforms without modifying."

---

## 2. Scope

### In scope — certify the existing built surface

- **9-stage lifecycle** state machine: start / pause / resume / complete / approve / reject, with the
  "previous stage approved" sequential guard.
- **Cell allocation** (links `cell_match_id`, marks cells `allocated`, auto-populates genealogy).
- **Charger management** (`mfg_charger_units` reserve/release; `available`/`busy`; formation reports).
- **Battery genealogy** (`mfg_battery_genealogy` — cells / BMS / cabinet / charger lineage).
- **QC approval** gate (`mfg_qc_approvals`; no `packing` without an `approved` decision).
- **Rework** (`mfg_rework_tickets` — failure, corrective action, re-test).
- **ID generation** (`PO-YYYYMMDD-NNNNNN`, `BAT-YYYYMMDD-NNNNNN` via Postgres sequences).
- **Frontend**: Orders list, Order detail / Battery Workspace (StageStepper, Genealogy, Timeline,
  Digital Passport), Charging & Testing dashboards.
- **Module audit trail**: `mfg_battery_timeline` (per-transition operator-action log).

### Out of scope (reserved future work — record only)

- Unified Product Platform implementation (Phases 1–5): `products`/`product_categories`/
  `product_workflows`/`product_genealogy`/`master_inverters`, QC-pass Product emit, workflow-driven
  stage engine, INBUILT_LITHIUM/HYBRID, downstream repoint. → its **own** capability waves + re-cert.
- Any ECF expansion, any Security-Standard change, any ODS change, any Cert-Framework change.

> **Scope decision for CTO at the approval gate:** confirm CW-03 = "certify the existing battery module
> as-is" (recommended). If instead CW-03 should *also* deliver Product-Platform Phase 1/2, that is a
> materially larger wave (new tables, QC-pass emit, re-cert) and this plan must be re-scoped first.

---

## 3. Frozen-platform consumption (no modification)

| Platform | How CW-03 consumes it | Modification? |
|----------|-----------------------|---------------|
| **Security Standards SS-01..04** | Manufacturing endpoints already populate the **SS-02** authz matrix; CW-03 *verifies/extends coverage* of every endpoint (adoption, not change). SS-03/SS-04 run as standing gates. | None |
| **ECF v1.0** | **Factual today: Cell Grading is the *only* ECF consumer; the manufacturing routes have *no* ECF integration.** Manufacturing currently records changes on its own `mfg_battery_timeline`. **Manufacturing ECF adoption is OUT OF SCOPE for CW-03** (it is reserved future work per the ECF mandatory-integration rule), *unless* a CW-03 cert defect mandates a platform fix. CW-03 certifies the module's current correction/audit behaviour as-is; the ECF ledger's own immutability stays covered by the existing SS-03 suite independently. | None |
| **Unified Product Platform arch v1.0** | CW-03 certifies the module **as the BATTERY workflow's current definition** (the architecture explicitly keeps the certified detailed stages as BATTERY). The cert is Product-Platform-aware so it does not certify anything the frozen plan will rip up. | None |
| **ODS** | All manufacturing UI is already ODS; MAT-04 verifies ODS compliance (keyboard/focus/notify). | None |
| **Certification Framework v1.0** | Standard 6-phase MAT taxonomy, canonical CW-02 templates, standard harness, scorecards, freeze package. | None |

---

## 4. Certification Approach (standard process — reuse, don't reinvent)

Per the CTO Standing Rule, CW-03 **reuses** the standard taxonomy, templates, harness, scorecards, and
freeze package adopted in the Certification Process Review.

### 4.1 MAT phases (frozen 6-phase taxonomy)

| Phase | Manufacturing-Orders focus |
|-------|----------------------------|
| MAT-01 Page & Navigation | Orders list, Battery Workspace, Charging/Testing dashboards, Digital Passport — routes, load, error boundaries |
| MAT-02 Functional | Order CRUD, stage start/pause/resume/complete/approve/reject, charger reserve/release, rework, QC; 10-point scorecard; RBAC surface |
| MAT-03 Business-Rule & Data Integrity | Stage sequence guard (no skip; previous must be `approved`), QC-gate before packing, cell-allocation atomicity, charger double-assignment prevention, genealogy correctness, sequence/ID race-safety, **state-transition TOCTOU under `FOR UPDATE`** |
| MAT-04 Integration & UX | Upstream (Cell Grading/Matching pool, allocation) + downstream (Logistics dispatch keyed on `production_order_id`, Reports, Director KPIs) agreement; ODS UX/keyboard; Digital Passport/QR |
| MAT-05 Performance & Stress | P95 budgets on list/detail/stage transitions/dashboards at scale; concurrency on stage approve + charger reservation; query plans; rate-limit shedding |
| MAT-06 Security & Reliability | 14 security areas for manufacturing; SS-02 (authz on every mfg endpoint × 5 principals) / SS-03 (audit) / SS-04 (config) standing gates; module probes (stage authz, mass-assignment on stage_data, input bounds, immutable genealogy/timeline) |

### 4.2 Batch-MAT cycle (per phase, mandatory)

Run the **whole phase** → collect **all** findings → classify **severity × (module vs platform)** →
present the consolidated set to the CTO → **approval before any fix** → fix all Crit/High/Med together
→ re-run the **full** phase → close the gate. No per-defect loops.

### 4.3 Fixtures & teardown (standard)

Prefix-tag every fixture `CW03-CERT-…`; tear down **set-based by prefix** (not captured IDs); break FKs
before deleting parents; surface every teardown error; assert **0 residual** across **every** table a
tested operation writes — for manufacturing that is the full set: `mfg_production_orders`,
`mfg_order_stages`, `mfg_battery_genealogy`, `mfg_battery_timeline`, `mfg_charger_units` (state reset),
`mfg_formation_reports`, `mfg_test_results`, `mfg_qc_approvals`, `mfg_rework_tickets`, plus any
`cells`/`cell_matches` it touches and any `engineering_corrections` rows it appends.

### 4.4 Evidence & freeze package (canonical templates)

Fill the existing scaffolds in `certification/CW-03-Manufacturing-Orders/` (`MAT.md`, `Defects.md`,
`Performance.md`, `Integration.md`, `UAT.md`, `Certification.md`) + `PROJECT_STATUS.md`; then the freeze
package: `CW-03_CERTIFICATION_REPORT.md`, `CW-03_FREEZE_NOTICE.md`, CTO Approval Record `CW-03-APR-001`.

---

## 5. Pre-wave readiness checklist (do before MAT-01)

- [ ] **Folder stamped** — CW-03 evidence scaffolds already exist; fill headers (dates, lead, version).
- [ ] **SS-02 coverage verified/extended** — confirm **every** manufacturing endpoint across all 14
      route files (`orders`, `stages`, `charger-units`, `genealogy`, `qc-approval`, `rework`,
      `test-results`, `formation-report`, `timeline`, `dashboard`, `testing-dashboard`,
      `allocated-cells`) is in `lib/authz-matrix.ts` × 5 principals. (Orders/stages already present;
      audit the remainder.) *Adoption of SS-02, not a framework change.*
- [ ] **SS-03 audit decision (CTO branch required — top pre-wave finding, resolve before MAT-06)** —
      manufacturing currently audits via `mfg_battery_timeline`, and it has **no entries in
      `audit-matrix.ts`**. First decide per SS-01 which critical manufacturing operations (e.g. stage
      approve/reject, QC approve, rework open) are "audit required." Then pick:
    - **Option A — extend SS-03 to cover manufacturing** (add those operations to `audit-matrix.ts` and
      teach `audit-suite.ts` that `mfg_battery_timeline` is a third append-only store). This *changes
      the SS-03 harness*, so it is permitted **only** under the freeze's **High / security-defect**
      exception — i.e. if leaving manufacturing's critical operations outside automated audit
      verification is judged a High/security gap (C3-R1). **Requires explicit CTO authorisation.**
    - **Option B — scope-limited audit evidence (no framework change)** — for CW-03, certify
      manufacturing audit by **direct evidence in MAT-06** (assert each critical op writes the correct
      immutable `mfg_battery_timeline` record), document that `mfg_battery_timeline` is not yet in the
      SS-03 automated matrix, and **backlog** the matrix extension (CF / SEC) for a future wave.
    - **Recommendation:** if MAT-06 finds manufacturing's audit coverage adequate via Option B, prefer
      B (keeps the freeze intact); escalate to A only if the gap is classified High/security.
- [ ] **SS-01 rows** — confirm `docs/security-matrix.md` has a row per manufacturing endpoint.
- [ ] **Fixtures prefixed + teardown enumerated** (§4.3) and proven to 0 residual on a dry run.
- [ ] **Workflows green** — typecheck 0, lint 0, and the three standing suites (`authz`/`audit`/`config`)
      captured as the pre-wave baseline (note: default-mode `audit` red can be stale limiter residue —
      use authoritative mode `CERT_AUDIT_RATELIMIT=1`).

---

## 6. Dependencies & Integration

| Direction | Module | Integration point |
|-----------|--------|-------------------|
| Upstream | Cell Grading / Matching (CW-02 certified) | `cell_match_id`, approved-cell pool, allocation marks cells `allocated` |
| Downstream | Logistics / Dispatch (certified) | `logistics_dispatch_items.production_order_id` (UNIQUE) — QC-pass gate before dispatch |
| Downstream | Reports & Director Dashboard | aggregate production orders / stage KPIs |
| Platform | ECF | corrections to certified measurements (test results / stage data) |

CW-03 must assert these contracts **read-mostly** (MAT-04), mutating only prefix-tagged cert fixtures.

---

## 7. Risks

| # | Risk | Sev | Mitigation |
|---|------|-----|------------|
| C3-R1 | **SS-03 gap** — manufacturing audit lives in `mfg_battery_timeline`, absent from the audit-matrix; critical ops may be unverified by SS-03 | **High** | Resolve the §5 audit decision pre-MAT-06; add timeline as an SS-03 store or justify exclusion per SS-01 (adoption, not framework change) |
| C3-R2 | **Stateful multi-stage TOCTOU** — concurrent stage approve / charger reservation races | **High** | MAT-03 concurrency probes; assert re-check inside tx under `SELECT … FOR UPDATE` |
| C3-R3 | **Large fixture graph** — orders × stages × genealogy × timeline × charger/test/QC/rework | Med | Enumerate every written table (§4.3); set-based prefix teardown; residual=0 assertion |
| C3-R4 | **Cross-module fan-out** widens integration surface | Med | Explicit upstream/downstream MAT-04 assertions; read-mostly contract tests |
| C3-R5 | **Scope creep into Product Platform** during cert | Med | Hard boundary (§2): UPP implementation is out of CW-03; ideas → PP backlog |
| C3-R6 | **Charger double-assignment** under concurrency | Med | MAT-03 probe: two orders contend for one charger → exactly one wins |
| C3-R7 | Default-mode SS-03 false-negative from prior flood | Low | Authoritative mode is the gate (SEC-001) |

Any framework improvement discovered → appropriate backlog (CF / SEC / ECF / PP / MEB), **not** built.

---

## 8. Metrics (standard per-wave set)

Defects by severity · defects by class (module vs platform) · open Crit/High/Med at cert (must be 0) ·
carried-forward · certification duration · regression suite results (SS-02 / SS-03 / SS-04) · automated
assertions · platform adoption (modules using each platform) · documentation completeness · **residual
fixture count (must be 0)** · automation %. Recorded in `PROJECT_STATUS.md` and the certification report.

---

## 9. Deliverables & Exit Criteria

**Deliverables:** filled CW-03 evidence set + `PROJECT_STATUS.md`; `CW-03_CERTIFICATION_REPORT.md`;
`CW-03_FREEZE_NOTICE.md`; CTO Approval Record `CW-03-APR-001`; updated `certification/README.md`
(CW-03 → 🔵 Certified, 3/8, 37.5%), `docs/platform-scorecard.md`, `CHANGELOG.md`.

**Exit criteria (standard 11):** MAT-01→06 all PASS · 0 open Crit/High/Med · typecheck 0 · lint 0 ·
SS-02/SS-03/SS-04 green (authoritative) · integration verified · performance within budget · fixtures
torn down to 0 residual · UAT signed (factory formality) · CTO certification decision recorded.

---

## 10. Sequencing & Approval Gate

1. **CTO reviews & approves this plan** (and confirms the §2 scope decision). **No certification
   execution — and no code/platform change — begins before this approval.**
2. On approval → run the pre-wave checklist (§5), then execute MAT-01 → MAT-06 as batch phases with a
   CTO triage/approval gate per phase.
3. Close CW-03 with the standard freeze package; update the scorecard, README index, and changelog.
4. Product Platform implementation remains separate, post-CW-03 manufacturing-capability work.

> This plan consumes the frozen ODS / ECF / Security Standards / Product Platform / Certification
> Framework **without modifying any of them** (the sole possible exception being the **SS-03
> audit-matrix decision** in §5/§7, taken under the freeze's High/security-defect exception *only if*
> the CTO authorises Option A), and proposes **no production code change**. Awaiting CTO approval to
> begin CW-03.

---

## 11. Assumption Ledger (true today vs. planned later)

Maintained to prevent scope drift during execution. CW-03 certifies the **"true today"** column; the
**"planned later"** column is explicitly out of scope and must not leak into the wave.

| # | Topic | True today (CW-03 certifies this) | Planned later (NOT in CW-03) |
|---|-------|-----------------------------------|------------------------------|
| A1 | Workflow | Single **hardcoded** 9-stage BATTERY chain + sequential guard in `stages.ts` | Workflow-driven engine (UPP Phase 3); INBUILT_LITHIUM / HYBRID |
| A2 | Product identity | A finished unit **is** a `mfg_production_orders` row (`battery_number`); downstream keys off `production_order_id` | Serialized `products` identity emitted at QC-pass (UPP Phases 1–2); downstream repoint (Phase 4) |
| A3 | ECF | **No** manufacturing ECF integration; Cell Grading is the only consumer; manufacturing logs to `mfg_battery_timeline` | Manufacturing ECF adoption (mandatory-integration rule) — future work, not CW-03 |
| A4 | SS-02 | Manufacturing endpoints already in `authz-matrix.ts`; CW-03 *verifies/extends* full coverage (adoption) | — |
| A5 | SS-03 | Manufacturing has **no** `audit-matrix.ts` entries; audit lives in `mfg_battery_timeline` | **Decision required** (§5): Option A extend SS-03 (freeze exception) vs Option B scope-limited audit evidence |
| A6 | Inverters / categories | No `master_inverters`, no `product_categories`, no `product_workflows` | All added in UPP implementation — not CW-03 |
| A7 | Serial | `PO-…` / `BAT-…` via Postgres sequences | `official_product_serial` + `serial_source` on `products` — not CW-03 |
