# Manufacturing Engineering Backlog

Engineering **calibration / optimization** items that are **not certification defects** — the
software behaves exactly as specified, but a manufacturing-engineering parameter, threshold,
or calibration value warrants review. These are deliberately deferred so certification waves
(CW-02 → CW-08) stay focused on verifying behaviour, not tuning manufacturing parameters.

> **Process:** items here are reviewed during **Manufacturing Engineering Optimization (after
> CW-08)**, unless a certification wave uncovers that the item is actually a software defect
> (in which case it is re-classified and handled under the relevant cert wave). Nothing in
> this backlog authorizes a code or configuration change during a certification wave.

| ID | Title | Source | Classification | Review window | Status |
|----|-------|--------|----------------|---------------|--------|
| MEB-001 | Grade-config IR-multiplier calibration (`nominalIrMohm`) | CW-02 MAT-03 / OBS-CW02-001 | Engineering Calibration Observation | After CW-08 | Open |
| MEB-002 | `idx_cells_created_at` — list-sort optimization candidate | CW-02 MAT-05 / OBS-CW02-003 | Database Optimization Candidate | Future high-volume deployment | Open |

---

## MEB-001 — Grade-config IR-multiplier calibration (`nominalIrMohm`)

**Origin:** CW-02 Cell Grading, MAT-03 Business-Rule Certification, observation OBS-CW02-001
(verified by test BR-30). **CTO ruling 2026-06-28:** Engineering Calibration Observation, **not
a certification defect.**

**Finding.** The grading engine (`calcGrade`) applies the IR multiplier exactly as documented
— MAT-03 confirmed `irMult = internalResistanceMohm / nominalIrMohm` constrains the grade
(A→B→reject) correctly across its boundaries (BR-07..09). However, the live grade-config row
carries `nominalIrMohm = 25 mΩ`, while a healthy LiFePO4 prismatic cell's true internal
resistance is ≈ 0.29 mΩ. The resulting `irMult ≈ 0.0116` sits far below every IR ceiling
(1.05 / 1.10 / 1.15), so under the current configuration **grade is decided by capacity
alone and the IR dimension is effectively inert** — an IR reading would have to exceed
≈ 26.25 mΩ (~90× a healthy cell) before it could even demote an A.

**Why this is calibration, not a defect.** The engine is correct and certified (MAT-03:
30/30 PASS, 0 software defects). What is in question is the *manufacturing-engineering value*
`nominalIrMohm` — a configuration/calibration input, not implementation logic.

**Deferred decision (review after CW-08).** Decide between:
- **(a)** Calibrate `nominalIrMohm` to the cell's true nominal IR (≈ 0.3 mΩ) so the IR
  multiplier becomes meaningful and IR genuinely co-determines grade alongside capacity.
  *Config-data change only — re-verify SS-04; no schema or route change.*
- **(b)** Formally accept capacity-only grading as the intended policy and document
  `nominalIrMohm` as a deliberate non-binding placeholder until real grading-machine IR data
  is available to set an evidence-based value.

**Constraint.** Per CTO ruling, **do not modify the grading engine or grading configuration
during CW-02 (or any active certification wave).** This item is to be taken up only during
Manufacturing Engineering Optimization after CW-08.

---

## MEB-002 — `idx_cells_created_at` (list-sort optimization candidate)

**Origin:** CW-02 Cell Grading, MAT-05 Performance & Stress Certification, observation
OBS-CW02-003. **CTO ruling 2026-06-28:** approved as a **deferred Low-priority optimization** —
**do not implement during CW-02.**

**Finding.** The `cells` list endpoint always sorts `ORDER BY created_at DESC`, but `cells` has
no index on `created_at`. `EXPLAIN ANALYZE` at 1,058 rows shows a top-N heapsort
(`Sort Method: top-N heapsort  Memory: ~32 kB`, ~0.20 ms) on every list query. The receiving
side received the analogous index (`idx_cell_lots_created_at`) in `DEF-CW01-M05-001`; the
grading side is simply missing the parallel index.

**Why this is deferred, not a defect.** Current performance is well within certification limits
(list P95 7 ms vs < 400 ms threshold — a 50×+ margin) and there is **no measurable business
impact at the current manufacturing scale**. The heapsort cost is negligible at present row
counts and only becomes worth eliminating at high volume.

**Deferred action (future high-volume deployment).** Add `idx_cells_created_at` (single-column
btree on `cells.created_at`) — a purely additive schema index, analogous to
`idx_cell_lots_created_at`. No route, schema-shape, or behaviour change; re-verify SS-04 after.

**Constraint.** Per CTO ruling and the frozen-platform policy, **no code or schema change during
CW-02.** Recorded here as a **Database Optimization Candidate** for future high-volume
deployments.
