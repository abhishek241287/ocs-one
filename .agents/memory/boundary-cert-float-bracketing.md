---
name: Boundary cert float-bracketing
description: How to certify inclusive numeric thresholds (>=, <=) without floating-point false fails
---

When a grade/threshold rule is computed via division (e.g. `capPct = cap/nominalCap*100`
then compared `>= threshold`), do NOT test the exact boundary value — float rounding can
push the computed value just under the cutoff and produce a misleading FAIL that looks like
a code defect but is a test artifact.

**Technique:** bracket each documented threshold by a small margin far larger than float
error (~1e-13) but far smaller than the next real step — e.g. ±0.01% around 98/95/90.
A value at `threshold+0.01` must grade the higher band and `threshold-0.01` the lower band.
This proves the cutoff sits exactly at the documented threshold AND that it is inclusive,
without ever evaluating the knife-edge exact-equality case.

**Why:** confirms the rule's boundary location robustly; distinguishes a real off-by-one
defect from a float artifact. Used in CW-02 MAT-03 (Cell Grading) — 30/30 BR cases passed.

**How to apply:** any cert wave verifying inclusive numeric bands (charging thresholds,
matching tolerances, QC limits). Read comparison operators from source first (confirm `>=`
vs `>`), then bracket. Read grade/status straight from API responses; verify persisted
state + event counts via comma-free SQL columns (executeSql returns CSV text in `.output`).
Tag all throwaway fixtures with a unique prefix and tear down in a `finally` so a mid-run
throw never leaves residue.
