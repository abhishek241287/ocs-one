# Certification Process Review — Post CW-02

| Field | Value |
|-------|-------|
| **Scope** | Process & documentation improvement only (no production code, no platform changes) |
| **Waves reviewed** | CW-01 (Cell Receiving) · CW-02 (Cell Grading) — both 🔵 CERTIFIED 2026-06-28 |
| **Prepared by** | Replit Agent (QA / Engineering) |
| **Date** | 2026-06-28 |
| **Status** | Draft for CTO approval — **CW-03 begins only after this review is approved** |
| **Mantra** | Do not assume. Measure. Verify. Document. |

> **Constraint honoured.** This review modifies only the certification *process* and its
> documentation. It does **not** touch ODS, ECF, Security Standards, the Product Platform, or any
> certified module. Every framework improvement discovered is **recorded in an enhancement backlog,
> not implemented** — consistent with the Platform Freeze Policy (CW-02 → CW-08).

---

## 1. Executive Summary

Two certification waves are complete and frozen: **CW-01 (Cell Receiving)** and **CW-02 (Cell
Grading)**, both certified 2026-06-28 with **0 open Critical / High / Medium defects** and all four
permanent Security Standards green. The process that produced them is sound — batch-MAT methodology,
defect triage by severity *and* module-vs-platform class, single-source matrices shared between cert
suite and dashboard, and set-based prefix-scoped teardown to zero residual. These are the assets worth
standardizing.

The review finds the process is **repeatable but not yet templatized**: each wave re-creates the same
six evidence documents, the same report/freeze/approval structure, and the three cert suites carry
**triplicated helper code** (`login`, 429-backoff, SQL verification, teardown, immutability scan). The
biggest wins for CW-03 → CW-08 are (a) freezing the MAT phase definitions (MAT-03/04 titles drifted
between the two waves), (b) adopting the CW-02 documents as **canonical templates**, (c) consolidating
the cert harness into one shared library (**backlogged** — it is a code change), and (d) a consistent
per-wave metrics set.

No new framework is proposed for build during the freeze. Five certification-process enhancements are
recorded as **CF-001 … CF-005** in the new `docs/certification-framework-backlog.md`; the Platform
Scorecard's Certification Framework backlog count moves 0 → 5. Everything in Sections 3–6 below is
either already in place (and should simply be reused) or backlogged for the post-certification roadmap.

---

## 2. Lessons Learned (consolidated CW-01 + CW-02)

### What worked well

1. **Platform-vs-module defect triage.** Classifying every defect *module-specific vs.
   platform-improvement* and fixing systemic issues **once** in the shared framework (RBAC
   write-gating, `useOdsNotify` migration, ECF correction engine) means later modules inherit the fix.
2. **One source of truth per standard.** `authz-matrix` / `audit-matrix` / `config-integrity` each
   drive **both** the cert suite **and** a director dashboard, so "what we test" and "what we show"
   cannot drift.
3. **Batch-then-triage MAT.** Running the whole phase, collecting all findings, and getting CTO
   approval **before any fix** kept remediation auditable and avoided test→fix→retest churn.
4. **Set-based, prefix-scoped teardown.** Deleting by stable prefix (not captured IDs) and asserting
   0 residual prevents certification data polluting the live dataset across partial reruns.
5. **Architect review before merge.** The CW-01 RBAC fix review surfaced three additional authorization
   bypasses (stage sign-off, a GET write side-effect, a routing-prefix shadow) humans missed.
6. **Honest disclosure of limitations.** The static-frontend CSP caveat (CW-01) and the SS-03
   default-mode rate-limit false negative (CW-02) were documented, not hidden — preserving trust and
   producing clean, tracked action items instead of silent risk.

### Repeated mistakes / friction (to fix in the process)

1. **MAT phase definitions drifted.** MAT-03 was "Workflow & Data Integrity" (CW-01) but "Business-Rule
   Certification" (CW-02); MAT-04 was "UX & Operator Workflow" (CW-01) but "Integration Certification"
   (CW-02). Same slot, different meaning → the phase taxonomy must be frozen.
2. **The programme index went stale.** `certification/README.md` still showed 0/8 certified after two
   waves were certified — evidence docs were updated but the index was not.
3. **Cert-harness helper duplication.** `login()`, the `fetchResilient()` 429-backoff, cookie handling,
   SQL verification, and teardown logic are re-implemented across `authz-suite.ts` / `audit-suite.ts` /
   `config-suite.ts` — three copies to keep in sync.
4. **Manual metric collation.** Per-wave metrics (defects by severity, suite counts, residual) were
   assembled by hand into each report rather than rolled up from a consistent schema.
5. **SS-03 default-mode fragility under prior flood.** A recency-based rate-limit selector false-FAILs
   when an earlier stress test left a global-limiter event newest (OBS-CW02-M06-001 → SEC-001).

### Risks to monitor during Manufacturing certification (CW-03)

- **Stateful multi-stage workflow** (9-stage lifecycle, rework loops, genealogy) is far more complex
  than single-record grading — expect more state-transition TOCTOU and integration defects.
- **Cross-module fan-out** (allocation ↔ matching ↔ charging ↔ QC) widens the integration surface;
  the integration harness needs explicit upstream/downstream assertions.
- **Larger fixtures** (orders × batteries × stage events × ECF rows) make set-based teardown
  enumeration critical — every table a tested operation writes must be cleared.
- **Freeze discipline.** Manufacturing will tempt platform changes; route them through the freeze gate
  (Critical/High/security only) and the backlogs, not into the frozen frameworks.

---

## 3. Standard Certification Templates (MAT framework)

The MAT activities that repeat every wave and should become **permanent templates** (CW-02 is the
canonical reference for each):

| Repeated activity | Standardize as | Canonical reference |
|-------------------|----------------|---------------------|
| MAT execution flow | **Frozen 6-phase MAT taxonomy** (see below) | `MAT.md` |
| Defect classification | Severity (Crit/High/Med/Low) **×** class (module vs platform) table | `Defects.md` |
| Approval workflow | Authorization Chain table + CTO Approval Record block | `PROJECT_STATUS.md`, `*_CERTIFICATION_REPORT.md` |
| Evidence collection | Fixed 6-doc evidence set + split MAT-0N files for heavy phases | `certification/README.md` |
| Gate closure | 11 exit criteria with tool-output evidence | `Certification.md` |
| Freeze package | Certification Report + Freeze Notice + Approval Record | `CW-02_*` (root) |

**Frozen MAT phase taxonomy (proposed — resolves the drift in §2):**

| Phase | Canonical title | Covers |
|-------|-----------------|--------|
| MAT-01 | Page & Navigation | routes, nav, page load, error boundaries |
| MAT-02 | Functional Certification | CRUD, validation, RBAC surface, 10-point scorecard |
| MAT-03 | Business-Rule & Data Integrity | domain rules, state machine, constraints, append-only history |
| MAT-04 | Integration & UX | cross-module flow, dashboard agreement, operator UX, keyboard/focus |
| MAT-05 | Performance & Stress | P95 budgets, query plans, concurrency, rate-limit shedding |
| MAT-06 | Security & Reliability | 14 security areas + SS-02/03/04 + module probes + scanners |

> Adopting one taxonomy lets every future wave reuse the same scorecard and report skeleton verbatim.

---

## 4. Standard Certification Harness

The harness lives in `artifacts/api-server/src/cert/` (three suites) plus three single-source matrices
in `artifacts/api-server/src/lib/`. It is **permanent and frozen**; the table records which utilities
are already reusable and which are duplicated (consolidation is **backlogged**, not done here).

| Utility | Where | Status | Recommendation |
|---------|-------|--------|----------------|
| Authorization matrix (47 endpoints × 5 principals) | `lib/authz-matrix.ts` | ✅ Reusable, single-source (suite + dashboard) | Keep; extend the matrix per new module |
| Audit matrix (11 ops × 2 append-only stores) | `lib/audit-matrix.ts` | ✅ Reusable, single-source | Keep; add new critical ops per module |
| Config integrity (34 checks / 12 categories) | `lib/config-integrity.ts` | ✅ Reusable, single-source | Keep; read-only |
| SS-02 / SS-03 / SS-04 runners | `cert/authz-suite.ts`, `audit-suite.ts`, `config-suite.ts` | ✅ Permanent (validation cmds `authz`/`audit`/`config`) | Keep as standing gates every wave |
| `login()` + cookie-jar | duplicated in suites | ⚠️ Triplicated | **CF-001** extract to shared cert lib |
| `fetchResilient()` 429 backoff/retry | duplicated in suites | ⚠️ Triplicated | **CF-001** extract |
| SQL verification (`findSecurityEvent`/`findLotEvent`) | `audit-suite.ts` | ⚠️ Suite-local | **CF-001** generalize to a reusable verifier |
| Static immutability scanner (no `.update()/.delete()` on audit tables) | `audit-suite.ts` | ⚠️ Suite-local | **CF-001** extract |
| Fixture prefix-tag + set-based teardown + residual=0 assertion | per-harness (code_execution) | ⚠️ Re-authored per wave | **CF-001/CF-002** reusable teardown helper |
| Performance / stress harness | `Performance-Regression-Framework.md` + per-wave scripts | ⚠️ Re-authored per wave | **CF-005** parameterized perf/stress harness |

**Recommendation:** keep all four standing gates exactly as-is (frozen). Consolidate the duplicated
helpers into a single `@workspace/cert-harness` library **after** the freeze (CF-001) — it is a code
change and therefore must not be built during CW-02 → CW-08.

---

## 5. Standard Documentation Templates

CW-01 and CW-02 produced the same document set with the same structure. CW-02 is now the **canonical
template** for each (cleanest, most consistent). No new templates need authoring — future waves copy
these and fill them in.

| Document | Canonical template | Reusable structure |
|----------|--------------------|--------------------|
| MAT report | `CW-02-Cell-Grading/MAT.md` (+ `MAT-06.md` for heavy phases) | 10-point scorecard · test-case table · per-phase results |
| Certification report | `CW-02_CERTIFICATION_REPORT.md` | 12 sections + CTO Approval Record |
| Freeze notice | `CW-02_FREEZE_NOTICE.md` | Freeze Summary · Modules Covered · Carried Forward · Freeze Rules · Next-wave Authorization |
| Approval record | CTO Approval Record block (`CW-0X-APR-001`) | Approval #, date, version, tag, approver, next wave |
| Performance report | `CW-02-Cell-Grading/Performance.md` | P95 table vs budget · query plans · concurrency · stress |
| Security report | `CW-02-Cell-Grading/MAT-06.md` | 14 areas · SS-02/03/04 results · module probes · scanners |
| Project status | `CW-02-Cell-Grading/PROJECT_STATUS.md` | status · MAT summary · metrics · defects · authorization chain |
| Architecture review | `docs/architecture/unified-product-platform-review.md` | review · diagrams · freeze · backlog (when a wave introduces architecture) |
| Defect log | `CW-02-Cell-Grading/Defects.md` | register (ID/title/severity/status/dates) · observations → backlog |

**Backlog format (already consistent — keep):** `ID · Title · Severity · Value · Affects · Target`
with a detail block per item (ECF-00N, SEC-001, MEB-00N, PP-00N, and now CF-00N all follow this shape).

---

## 6. Certification Metrics (track consistently every wave)

A fixed metric set, recorded in each wave's `PROJECT_STATUS.md` and rolled into its certification
report, so trends are comparable across CW-01 → CW-08:

| Metric | Definition | CW-01 | CW-02 |
|--------|------------|-------|-------|
| Defects by severity | Crit / High / Med / Low found | 0 / 7 / 12 / 18 | 0 / 1 / 3 / 2 |
| Defects by class | module-specific vs platform-improvement | mixed (RBAC platform) | 1 platform (ECF) + 5 module |
| Open Crit/High/Med at cert | must be 0 | 0 | 0 |
| Carried-forward (Low) | deferrals + accepted risk + backlog | 6 | 4 |
| Certification duration | calendar days start→cert | ~2 (06-27→06-28) | ~1 (06-28) |
| Regression suite results | SS-02 / SS-03 / SS-04 | 225/225 · 11/11 · 31/3/0 | 235/235 · 12/12 · 31/3/0 |
| Automated assertions | count re-run each wave | 270 | 281 |
| Platform adoption | modules using each platform (scorecard) | ODS/SS baseline | + ECF (1) |
| Documentation completeness | required evidence docs present | full set | full set |
| Residual fixture count | must be 0 | 0 | 0 |
| Automation % | automated assertions ÷ (automated + manual probes) | — | record from CW-03 |
| Code coverage | optional, if adopted later | not adopted | not adopted |

> **Adoption + Health are already tracked** in `docs/platform-scorecard.md` (Modules Using It; Open
> Critical/High; Breaking Changes Since Freeze). The wave-level metrics above complement it.

---

## 7. Recommended Improvements for CW-03 → CW-08

All are **process/documentation** changes (apply now) **or backlog** (defer per freeze). None modify a
frozen framework or certified module.

| # | Improvement | Type | Disposition |
|---|-------------|------|-------------|
| R-1 | Freeze the 6-phase MAT taxonomy (§3) so MAT-03/04 stop drifting | Process | **Adopt now** (doc) |
| R-2 | Treat the CW-02 documents as canonical templates; copy-and-fill each wave | Process | **Adopt now** (doc) |
| R-3 | Keep `certification/README.md` index current at every gate (status + summary + %) | Process | **Adopt now** (doc) — fixed in this pass |
| R-4 | Pre-wave checklist (folder stamped, matrices extended, fixtures prefixed, teardown enumerated) | Process | **Adopt now** (doc) |
| R-5 | Default SS-03 to authoritative mode in any wave that floods/stress-tests before audit | Process | **Adopt now** (doc) — see SEC-001 |
| R-6 | Consolidate duplicated cert-harness helpers into `@workspace/cert-harness` | Code | **Backlog CF-001** |
| R-7 | Template scaffold generator (stamp a new CW folder from canonical templates) | Code | **Backlog CF-002** |
| R-8 | Automated per-wave metrics rollup into a programme view | Code | **Backlog CF-003** |
| R-9 | Class-aware SS-03 rate-limit selector | Code (Security) | **Backlog SEC-001** (already recorded) |
| R-10 | Parameterized, reusable performance/stress harness per module | Code | **Backlog CF-005** |

---

## 8. Action Items (documentation only)

Completed in this review pass (no production code touched):

- [x] Create this **Certification Process Review** report.
- [x] Create `docs/certification-framework-backlog.md` with **CF-001 … CF-005** (none implemented).
- [x] Update `docs/platform-scorecard.md` — Certification Framework Enhancement Backlog Count 0 → 5;
      reference the new backlog doc.
- [x] Refresh `certification/README.md` — CW-01 + CW-02 marked 🔵 Certified, summary table and progress
      updated, and the canonical-template + frozen-MAT-taxonomy notes added.
- [x] Record R-1…R-5 (process adoptions) in the README as standing practice for CW-03 → CW-08.
- [x] Append a Certification Process Review entry to `CHANGELOG.md`.

Pending CTO decision (no work started):

- [ ] Approve the frozen 6-phase MAT taxonomy (§3).
- [ ] Approve CF-001…CF-005 dispositions (build post-certification, per freeze).
- [ ] On approval, **begin CW-03 (Manufacturing Orders)** using the canonical templates.

---

*This review improves only the certification process. The frozen platform baseline (ODS, ECF, Security
Standards, Product Platform, Certification Framework) is unchanged. Discovered framework improvements
are backlogged, not implemented.*
