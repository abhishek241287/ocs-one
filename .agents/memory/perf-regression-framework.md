---
name: Performance regression framework
description: Durable design decisions for the OCS One performance baseline + regression framework (MAT-05 deliverable)
---

# Performance regression framework — design rules

The baseline + regression system is a permanent product feature, not a one-off
cert artifact. Source of truth in code: `performance-baseline.ts`
(`PERFORMANCE_BASELINE_V1`, `BUNDLE_BASELINE`, `REGRESSION_RULES`,
`REGRESSION_THRESHOLD_PCT`); live endpoint `GET /api/developer/performance`
(director-only); dashboard `/developer/performance`; policy doc
`certification/Performance-Regression-Framework.md` (applies to ALL waves, not
scoped under CW-01).

## Non-obvious decisions (honesty-driven — CTO values honesty over optics)

- **Gate regressions behind a minimum sample count** (currently 30 samples since
  boot). Below that, report "warming up", never a regression.
  **Why:** in-memory P95 on a freshly-booted process is dominated by JIT/pool
  cold-start spikes (e.g. dashboard P95 ~63ms cold vs ~4ms warm). Without the
  gate the dashboard cried wolf on every restart, which destroys trust in the
  signal. **How to apply:** any new live-vs-baseline comparison must apply the
  same sufficiency gate before asserting a regression.

- **Never fabricate a target/actual for un-instrumented operations.** Client-only
  ops with no server endpoint (e.g. CSV Export built in-browser) use
  `targetMs: null`, `baselineMs: null`, `measured: false`, and render "N/A".
  **Why:** a flattering fake number is worse than an honest gap. **How to apply:**
  drive UI "N/A" off `measured === false`, not off a sentinel number.

- **Baseline dataset is recorded alongside every figure** and is deliberately
  distinct from the stress dataset. Baseline = regression detection on a stable
  small dev dataset; stress tests = scaling headroom on a large dataset.
  Comparing across the two is a category error, not a regression — the recorded
  dataset/environment metadata exists to prevent that. **How to apply:** a
  re-measure is only a valid comparison when dataset AND environment match.

- **A real regression is fixed in code or formally accepted with a version bump +
  written rationale — never by silently editing the baseline number** to make the
  red go away.

- **"Auto-defect" = detection/surfacing is automatic; ticket filing is procedural**
  (manual `DEF-…`) until an issue-tracker integration exists. Do not imply fully
  automated ticket creation that isn't built. UI copy must say "auto-flagged here;
  defect filed per certification process" — not "files a defect automatically".

- **Historical baseline storage**: snapshots persist via `performance_snapshots`
  (full report stored as JSONB `metrics`). Capture (`POST .../snapshots`) and the
  live `GET` endpoint share one `buildPerformanceReport()` so a stored run is
  shape-identical to a live run by construction — never build the snapshot payload
  separately. **Why:** divergent shapes make trend comparison lie. Snapshot
  capture + history are director-only; trend sparklines skip null/no-traffic runs
  (don't zero-chart them — a missing point is not an improvement to 0ms).
