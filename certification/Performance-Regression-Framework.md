# Performance Regression Framework

**Status:** Permanent · applies to **all certification waves** (not scoped to CW-01)
**Owner:** Engineering / QA
**Established:** 2026-06-27 (CW-01, MAT-05)
**Authority:** CTO deliverable (2 of 3)

---

## Purpose

Performance is a **certifiable, defended property** of OCS One — not a one-time
measurement that decays after a wave closes. This framework makes regression
detection permanent and mechanical: a defined baseline, a single drift
threshold, and an automatic defect when that threshold is breached. The goal is
that no performance regression can ship silently between waves.

---

## The 10% Rule

A **regression** is any monitored metric that worsens by **more than 10%**
relative to the recorded **Performance Baseline** for the same operation, on the
same dataset and environment class.

`thresholdPct = 10` is defined **once** in code as `REGRESSION_THRESHOLD_PCT`
(`artifacts/api-server/src/lib/performance-baseline.ts`) and reused by the live
endpoint, the dashboard, and this document. Changing the threshold is a
single-line change in one place.

### Monitored metrics and actions on breach

| Metric | Threshold | Action on breach |
|--------|-----------|------------------|
| API latency (P95) | > 10% over baseline | File defect — investigate query/route regression |
| Bundle size (gzip) | > 10% over baseline | File defect — investigate dependency/code growth |
| Query execution time | > 10% over baseline | File defect — re-run `EXPLAIN ANALYZE`, check indexes |
| Page load time | > 10% over baseline | File defect — profile render path |
| Memory growth | > 10% over baseline | File defect — heap snapshot, check for leaks |

> This table is the human-readable mirror of `REGRESSION_RULES` in
> `performance-baseline.ts`. Code is the source of truth; if they diverge, the
> code wins and this doc must be corrected.

---

## Auto-defect protocol

> **What "auto" means here (honesty note):** detection and surfacing are
> **automatic** — the endpoint computes the breach and the dashboard flags it on
> every refresh without human action. The actual **defect ticket is filed
> procedurally** (a human raises the `DEF-…` entry following the steps below)
> until an issue-tracker integration is wired up. We do not claim fully automated
> ticket creation that does not yet exist.

When a monitored metric breaches the 10% rule:

1. **Detect** — the live endpoint `GET /api/developer/performance` compares each
   operation's current P95 against its baseline and sets `regression: true` when
   `deltaPct > 10`.
2. **Confirm sufficiency** — a regression is only asserted once the live sample
   count for that route is **statistically meaningful** (≥ 30 samples since boot).
   Below that, the row is reported as **"warming up"**, never as a regression.
   This prevents cold-start / JIT warm-up noise from raising false alarms — an
   explicit honesty safeguard.
3. **Surface** — the `/developer/performance` Engineering Health dashboard flags
   the row with a red **"Regression > 10%"** badge and increments the
   **Regression Watch** counter at the top of the page.
4. **File** — a defect is raised against the responsible module using the
   standard ID scheme `DEF-<wave>-<matrix>-NNN`
   (e.g. `DEF-CW01-M05-003`), severity assigned by the size of the drift and the
   operation's criticality.
5. **Triage & fix** — follow the per-metric action in the table above, attach the
   before/after evidence to the defect, and re-measure to confirm closure.

---

## Baseline lifecycle

- **Source of truth:** `PERFORMANCE_BASELINE_V1` and `BUNDLE_BASELINE` in
  `artifacts/api-server/src/lib/performance-baseline.ts`.
- **Versioned:** the baseline carries a version (currently **v1.0**) and a
  capture date. A new version is cut only by a deliberate, reviewed re-measure —
  never silently.
- **When to re-baseline (bump the version):**
  - A new certification wave establishes a new performance profile.
  - An intentional architectural change makes the old baseline no longer
    comparable (e.g. a different dataset class, a new runtime, code-splitting
    landing per `DEF-CW01-M05-002`).
  - The reference dataset itself changes.
- **What must NOT happen:** quietly editing a baseline figure to "make the red go
  away." A regression is fixed in the code or formally accepted with a version
  bump and a written rationale — it is never papered over by moving the baseline.

> **Like-for-like rule:** every baseline figure records its **dataset** and
> **environment** alongside the number. A re-measure is only a valid comparison
> when both match. Comparing a 14-lot dev figure against a 1,000-lot stress
> figure is not a regression — it is a category error, and the recorded metadata
> exists to prevent exactly that mistake.

### Deferred roadmap — Performance Baseline v2.0 (post-CW-08)

**CTO ruling 2026-06-28 (CW-02 / MAT-05).** A proposal to additively register the Cell Grading
routes in `PERFORMANCE_BASELINE_V1` (so `/developer/performance` defends them against regression)
was **approved in principle but deferred** to preserve the frozen-platform policy.

- **No modification of the frozen Performance Framework during CW-02** (or any active cert wave).
- **After CW-08**, as part of the post-certification platform enhancement program, **all
  manufacturing modules** (Cell Grading routes included) will be incorporated into a single
  reviewed re-measure cut as **Performance Baseline v2.0**.
- Until then, per-wave performance is certified by direct MAT-05 measurement against the
  documented thresholds (as done for CW-02), not by the live baseline watcher.

---

## Where this lives in the product

| Component | Location | Role |
|-----------|----------|------|
| Baseline + threshold + rules | `artifacts/api-server/src/lib/performance-baseline.ts` | Single source of truth (code) |
| Live metrics collector | `artifacts/api-server/src/lib/metrics.ts` | In-memory per-route P50/P95/P99 ring buffer |
| Live endpoint (director-only) | `GET /api/developer/performance` | Serves live vs baseline comparison + regression flags |
| Engineering Health dashboard | `/developer/performance` (`PerformancePage.tsx`) | Human-facing live view + regression watch |
| This framework | `certification/Performance-Regression-Framework.md` | Permanent policy, all waves |

---

## Honesty principles (non-negotiable)

This framework is built to favour **honesty over optics**, per CTO direction:

- **Never fabricate a number.** Operations with no server endpoint to measure
  (e.g. client-side CSV export) are marked **N/A**, not assigned a flattering
  fake figure.
- **Never cry wolf.** Regressions require sufficient samples; warm-up noise is
  labelled as such.
- **Never hide a real regression.** The fix is in the code or a formally
  accepted, documented baseline bump — never a silent edit.
- **Record the context.** Every figure carries its dataset + environment so it
  can be honestly re-compared later.

**Established:** 2026-06-27 · **Applies to:** all current and future certification waves.
