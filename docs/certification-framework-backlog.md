# Certification Framework — Enhancement Backlog

> **Purpose.** The parking lot for **certification-process** improvements discovered during the
> Certification Process Review (post CW-02). The Certification Framework is FROZEN (CW-02 → CW-08);
> per the Platform Freeze Policy these items are **recorded, not implemented** — they are built on the
> post-certification roadmap unless a Critical/High certification defect or security vulnerability
> forces an earlier change. Process/documentation improvements (frozen MAT taxonomy, canonical
> templates, current index) are adopted directly and are **not** in this code backlog.

| ID | Title | Value | Affects | Complexity | Target |
|----|-------|-------|---------|------------|--------|
| CF-001 | Shared certification harness library (`@workspace/cert-harness`) | Removes triplicated `login`/429-backoff/SQL-verify/teardown/immutability-scan across the three suites | `cert/authz-suite.ts`, `cert/audit-suite.ts`, `cert/config-suite.ts` | M | Post-CW-08 |
| CF-002 | Certification folder scaffold generator | Stamps a new `CW-XX` evidence set from canonical templates in one command | `certification/` programme tooling | S | Post-CW-08 |
| CF-003 | Automated per-wave metrics rollup | Aggregates the standard metric set (defects, durations, suite counts, residual) into a programme view | reporting tooling | M | Post-CW-08 |
| CF-004 | Pre-wave readiness check (scripted) | Verifies folder stamped, matrices extended, fixtures prefixed, teardown enumerated before a wave starts | programme tooling | S | Post-CW-08 |
| CF-005 | Parameterized performance/stress harness | Reusable per-module perf/stress runner instead of re-authoring scripts each wave | perf harness | M | Post-CW-08 |

---

## CF-001 — Shared certification harness library

`login()`, the `fetchResilient()` 429 backoff/retry, cookie-jar handling, SQL verification helpers
(`findSecurityEvent` / `findLotEvent`), the static immutability scanner, and the set-based
prefix-scoped teardown + residual-count assertion are currently re-implemented across the three cert
suites and per-wave `code_execution` harnesses. Extract them into one `@workspace/cert-harness` library
consumed by every suite and wave. **Code change — deferred under the freeze.**

## CF-002 — Certification folder scaffold generator

A script that copies the canonical CW-02 evidence templates (`MAT.md`, `Defects.md`, `Performance.md`,
`Integration.md`, `UAT.md`, `Certification.md`, `PROJECT_STATUS.md`) into a new `CW-XX-<Module>/` folder
with placeholders filled (wave number, module, dates). Reduces setup friction and enforces structure.

## CF-003 — Automated per-wave metrics rollup

A script that reads each wave's standard metric set and produces a programme-wide comparison (trends in
defects-by-severity, certification duration, regression counts, residual). Complements the Platform
Scorecard's adoption/health view.

## CF-004 — Pre-wave readiness check (scripted)

Codifies the pre-wave checklist (R-4) as an automated gate: folder stamped, authz/audit matrices
extended with the new module's endpoints/ops, fixtures prefix-tagged, and every table a tested
operation writes enumerated for teardown.

## CF-005 — Parameterized performance/stress harness

Generalize the per-wave performance and stress scripts into a reusable runner parameterized by module
(endpoints, dataset size, concurrency targets), driven by the Performance-Regression Framework.

---

*All items are certification-process enhancements only. None modify ODS, ECF, Security Standards, the
Product Platform, or any certified module. Build on the post-certification roadmap per the freeze.*
