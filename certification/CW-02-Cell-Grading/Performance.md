# CW-02 — Cell Grading: Performance Test

| Field | Value |
|-------|-------|
| **Wave** | CW-02 |
| **Module** | Cell Grading |
| **Test Date** | 2026-06-28 |
| **Tester** | Replit Agent (QA) |
| **Environment** | Replit dev container · Express 5 · PostgreSQL · all traffic via `localhost:80` proxy |
| **Dataset size** | 1,058 cells (seeded `CW02-PERF-` lot + 1,000 cells: 100 received / 700 approved A·B·C / 200 rejected) |

> Full evidence (per-endpoint samples, query plans, stress, scorecard, findings) in `MAT.md` → **MAT-05** section.

---

## API Performance

| Endpoint | Method | Dataset | p95 Response Time | Threshold | Status |
|----------|--------|---------|-------------------|-----------|--------|
| `/api/cells` (grading list) | GET | 1,058 cells | 7 ms | < 400 ms | ✅ PASS |
| `/api/cells?status=approved` | GET | 710 match | 5 ms | < 400 ms | ✅ PASS |
| `/api/cells?grade=A` | GET | 326 match | 12 ms | < 400 ms | ✅ PASS |
| `/api/cells?status=&grade=` | GET | 310 match | 9 ms | < 400 ms | ✅ PASS |
| `/api/cells?lotId=` | GET | 1,000 match | 6 ms | < 400 ms | ✅ PASS |
| `/api/cells?search=` (ILIKE) | GET | 999 match | 6 ms | < 500 ms | ✅ PASS |
| `/api/cells?page=40` (deep page) | GET | 1,058 cells | 5 ms | < 400 ms | ✅ PASS |
| `/api/cells?pageSize=100` | GET | 1,058 cells | 7 ms | < 500 ms | ✅ PASS |
| `/api/cells/:id` (+ lot + genealogy) | GET | — | 7 ms | < 300 ms | ✅ PASS |
| `/api/cells/config` (grade-config) | GET | — | 3 ms | < 200 ms | ✅ PASS |
| `/api/cells/:id/measurements` (ECF history) | GET | — | 6 ms | < 300 ms | ✅ PASS |
| `/api/cells/:id/grade` | POST | 32/32 200 | 14 ms | < 400 ms | ✅ PASS |
| `/api/cells/:id/correct` | POST | 32/32 200 | 14 ms | < 400 ms | ✅ PASS |

> **Note (doc correction):** the grade-config route is `/api/cells/config` (the prior template listed `/api/cells/grade-config`, which does not exist).

### Query plans (`EXPLAIN ANALYZE`, 1,058 rows) — OBS-CW02-002 resolution

| Filter | Selectivity | Plan | Time |
|--------|-------------|------|------|
| `status='approved'` | 67% | Seq Scan + top-N heapsort | 0.20 ms |
| `grade='A'` | 31% | Index Scan `idx_cells_grade` | 0.14 ms |
| `status='approved' AND grade='A'` | 29% | Index Scan `idx_cells_status_grade` | 0.14 ms |
| `lot_id=…` | 94% | Seq Scan | 0.23 ms |
| `cell_id ILIKE '%…%'` | leading wildcard | Seq Scan (un-indexable by btree) | 0.61 ms |
| no filter | — | Seq Scan + top-N heapsort | 0.23 ms |

**OBS-CW02-002 → RESOLVED (not a defect):** indexes are used when the filter is selective; a seq-scan is correctly chosen only when the filter matches most rows — optimal cost-based planning.

### Stress

| Scenario | Result | Status |
|----------|--------|--------|
| 25 concurrent (list) | 25/25 OK · 146 ms · 171 req/s | ✅ PASS |
| 50 concurrent (list) | 50/50 OK · 186 ms · 269 req/s | ✅ PASS |
| rapid 100-request loop | P95 6 ms · no leak | ✅ PASS |
| rate-limiter flood (360 burst) | 125 × 200 / 235 × 429 shed (as designed) | ✅ PASS |
| teardown residual | 0 across cells / lots / ECF / lot-events | ✅ PASS |

---

## Frontend Performance

| Page / Interaction | Metric | Measured | Threshold | Status |
|--------------------|--------|----------|-----------|--------|
| Cell Grading page — initial load | FCP | Design-assessed (not instrumented) — shares the ocs-one SPA bundle certified in CW-01/MAT-05 (364.68 kB gzip, single chunk) | < 1.5 s | ☑ NOTE |
| Grade 50 cells in sequence | Throughput | 14 ms p95 per grade write (server) — well under 1 s/cell | < 1 s per cell | ✅ PASS |

> Client micro-metrics (FCP) are reported as **design-assessed, not fabricated** (honesty principle), consistent with the CW-01 posture. The grading page is server-paginated (≤ pageSize DOM rows, O(pageSize)), so render cost is independent of dataset size.

---

## Performance Decision

- [ ] **PASS**
- [x] **PASS WITH NOTES**
- [ ] **FAIL** — defect filed

**Notes / findings (full set presented to CTO before any fix — batch methodology):**

1. **OBS-CW02-002 — RESOLVED** (not a defect). No action.
2. **OBS-CW02-003 (Low, module-specific) — deferred, pending CTO.** No `idx_cells_created_at`; every list `ORDER BY created_at DESC` does a top-N heapsort (0.20 ms / 32 kB at 1,058 rows — negligible). Recommend adding the index for consistency with the receiving-side fix `DEF-CW01-M05-001`. **Not fixed** (awaiting approval).
3. **Baseline-extension decision (platform, additive) — CTO decision.** Grading routes are not in `PERFORMANCE_BASELINE_V1`, so `/developer/performance` does not yet defend them for regression. Recommend an **additive** extension; the frozen baseline is **not** modified unilaterally.

**0 Critical / High / Medium defects.** All measured API + stress thresholds met by 28–60×.

**CTO sign-off (2026-06-28):** **APPROVED — gate CLOSED.** Both notes accepted as deferred: OBS-CW02-003 → **MEB-002** (deferred Low DB-optimization candidate, not implemented during CW-02); baseline extension → **Performance Baseline v2.0** post-CW-08 roadmap (frozen framework unchanged). Next: MAT-06.

**Defects filed:** none (1 Low observation deferred → MEB-002) **Signed:** Replit Agent (QA) **Date:** 2026-06-28
