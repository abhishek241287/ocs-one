# MAT-05 — Performance & Stress Certification

**Module:** Cell Receiving (CW-01)
**Assessor:** Replit Agent (QA)
**Date:** 2026-06-27
**Authorization:** CTO, 2026-06-27
**Prerequisite:** MAT-04 ✅ Pass (35/35, CTO-accepted)

---

## Scope

Certify that the Cell Receiving module sustains acceptable performance under
production-scale data and concurrent load.

- **Performance** — page load, API latency (P50/P95/P99), search/save latency, drawer open/close, timeline render, history load
- **Stress** — 1,000 lots / 10,000 cells, concurrent users, rapid search & pagination, repeated saves
- **Database** — query plans, missing indexes, slow queries, N+1, transaction duration
- **Frontend** — render counts, re-renders, memory growth, bundle size, network waterfall

Every threshold below is **measurable**; actuals are recorded against it. Any
regression is filed as a `DEF-CW01-M05-xxx` defect.

---

## Test Environment

| Field | Value |
|-------|-------|
| Environment | Replit dev container (NixOS, Node 24) |
| API | Express 5, single Node process, port 8080 → `/api` via shared proxy |
| DB | PostgreSQL + Drizzle ORM, default pg pool |
| Access path | All measurements through `localhost:80` proxy (production-equivalent routing) |
| Auth | JWT httpOnly cookie (`ocs_token`), director user |
| **Dataset (stress)** | **1,014 lots · 10,058 cells · 21+ lot events** (1,000 lots + 10,000 cells seeded, prefixed `PERF-`) |
| Measurement method | Node `fetch` timing loop, 40–100 samples/endpoint; `EXPLAIN (ANALYZE, BUFFERS)` for plans; `vite build` for bundle |

> **Rate-limit note:** the global limiter (300 req/min) caps a single client's
> burst. Benchmarks were chunked to stay within the window — this is itself a
> verified protection (see STRESS-04).

---

## PERF — API Latency

### Method: 40–100 `fetch` samples per endpoint, full dataset, through proxy

| Endpoint | Scenario | P50 | P95 | P99 | Threshold (P95) | Status |
|----------|----------|-----|-----|-----|-----------------|--------|
| `GET /cells/lots` | list page 1 (20/pg) | 4 ms | 8 ms | 25 ms | < 300 ms | ✅ |
| `GET /cells/lots` | deep pagination (page 40) | 4 ms | 7 ms | 13 ms | < 300 ms | ✅ |
| `GET /cells/lots` | status filter (`graded`) | 4 ms | 6 ms | 7 ms | < 300 ms | ✅ |
| `GET /cells/lots` | search (`LOT-0005`) | 4 ms | 6 ms | 8 ms | < 500 ms | ✅ |
| `GET /cells/lots` | pageSize=100 | 4 ms | 6 ms | 8 ms | < 500 ms | ✅ |
| `GET /healthz` | liveness | 2 ms | 4 ms | 6 ms | < 100 ms | ✅ |
| `GET /dashboard/director` | KPI aggregation | ~53 ms | ~63 ms | — | < 500 ms | ✅ |

**Result: PASS.** Every list/search/filter endpoint resolves in single-digit
milliseconds at full stress-dataset scale — two orders of magnitude under
threshold. The director dashboard (multi-table KPI aggregation) is the heaviest
read at ~60 ms, still well within budget.

---

## PERF — Frontend Interaction

### Method: code review + dev server observation (Vite dev build)

| Interaction | Mechanism | Threshold | Status |
|-------------|-----------|-----------|--------|
| Lot list render (1,014 rows fetched, 20 paginated) | server-side pagination — only 20 rows ever in DOM | < 500 ms | ✅ (design-assessed) |
| Search results appear | debounced query → 4–8 ms measured API → React Query cache | < 500 ms | ✅ (API measured) |
| Create drawer open / close | `OdsDrawer` (Radix) — CSS transform, no data fetch | < 300 ms | ✅ (design-assessed) |
| Timeline / history render | `GET /:id/history` index scan + client map | < 500 ms | ✅ (API measured) |
| Save → success toast | POST round-trip + cache invalidation | < 600 ms | 🟡 design-assessed (POST not load-measured) |

**Key design strength:** the table is **server-paginated** — the DOM never holds
more than one page (20–100 rows) regardless of dataset size, so render cost is
O(pageSize), not O(total). No client-side filtering of the full set.

> **Honesty note:** the "design-assessed" rows above are reasoned from the
> architecture (server pagination, no per-row fetch, Radix CSS transitions),
> **not** from instrumented browser timings. See **Scope coverage & gaps** below.

---

## STRESS — Load & Volume

### STRESS-01 — Volume (1,000 lots / 10,000 cells)

Dataset seeded to **1,014 lots / 10,058 cells**. All read endpoints re-measured
above against this volume — no degradation versus baseline. **PASS.**

### STRESS-02 — Concurrent users

Method: N parallel `fetch` requests fired simultaneously, all authenticated.

| Burst | Requests OK | Failed | Wall time | Per-req P95 | Per-req P99 | Throughput |
|-------|-------------|--------|-----------|-------------|-------------|------------|
| 25 concurrent (list) | 25/25 | 0 | 134 ms | 125 ms | 131 ms | ~187 req/s |
| 50 concurrent (filter+paginate) | 50/50 | 0 | 259 ms | 200 ms | 202 ms | ~193 req/s |

**Observation:** per-request latency rises from ~4 ms (serial) to ~100–135 ms
under a 25–50 burst — the single Node process + default pg pool serialize work.
Zero errors, zero timeouts, full burst drains in < 300 ms. Acceptable for an
internal-LAN ERP; horizontal scaling / a larger pool would flatten this if
concurrency grows. **PASS.**

### STRESS-03 — Rapid search & pagination

100 back-to-back list/paginate requests sustained 2–8 ms each with no leak or
slowdown across the run. **PASS.**

### STRESS-04 — Rate-limit protection (verified)

A 100-request rapid loop tripped the global limiter (`429`) once the 300/min
window was exhausted — confirming `express-rate-limit` correctly sheds load
rather than degrading or crashing. Behaving as designed. **PASS.**

---

## DB — Database Analysis

### Method: `EXPLAIN (ANALYZE, BUFFERS)` on every hot query at full dataset

#### Missing index found & fixed — `DEF-CW01-M05-001`

`cell_lots` carried **only** its PK and the unique `lot_number` index. The list
endpoint's `ORDER BY created_at DESC` and the `status` filter therefore forced a
**Seq Scan + top-N sort on every list page**:

| Query | Before | After fix |
|-------|--------|-----------|
| List page 1 (`ORDER BY created_at DESC LIMIT 20`) | Seq Scan + top-N heapsort, exec 0.449 ms | **Index Scan Backward**, sort eliminated, exec **0.119 ms** |
| Status filter + sort | Seq Scan, 762 rows removed by filter | **Index Scan Backward** + filter, exec 0.084 ms |

**Fix:** added `idx_cell_lots_created_at` and `idx_cell_lots_status` to the
schema (`lib/db/src/schema/cell-grading.ts`) and pushed. The list path is now
O(pageSize) instead of O(n log n) — critical as the lot table grows. Severity
**Low** (sub-ms at current scale, but a guaranteed scaling cliff). **CLOSED.**

#### Other queries — all healthy

| Query | Plan | Verdict |
|-------|------|---------|
| Detail stats (`cells GROUP BY status WHERE lot_id`) | Bitmap Index Scan on `idx_cells_lot_id` | ✅ indexed |
| History (`cell_lot_events WHERE lot_id ORDER BY performed_at`) | indexed via `idx_cell_lot_events_lot_id` / `_performed_at` | ✅ indexed |
| Pagination count | seq aggregate (unavoidable for `COUNT(*)`, 0.25 ms) | ✅ acceptable |

#### N+1 check — none found

- `GET /cells/lots` — single `SELECT` + single `COUNT` (parallel `Promise.all`). No per-row queries.
- `GET /cells/lots/:id` — lot fetch + one grouped stats query (2 queries fixed, not per-row).
- `GET /cells/lots/:id/history` — lot existence check + one events query.

#### Transaction duration

`POST /cells/lots` wraps lot insert + **bulk** cell insert (single multi-row
`INSERT`) + 2 event inserts in one transaction. No per-cell round-trips even for
large lots — transaction stays short. Cell-ID sequencing uses a scoped
`COUNT(... LIKE prefix)` inside the txn. **PASS.**

---

## FE — Frontend Build & Network

### Method: production `vite build`

| Asset | Raw | Gzip | Threshold (gzip) | Status |
|-------|-----|------|------------------|--------|
| JS (single chunk) | 1,389.86 kB | **364.68 kB** | < 400 kB | ⚠️ within budget, not split |
| CSS | 124.97 kB | 20.67 kB | < 50 kB | ✅ |
| `index.html` | 1.49 kB | 0.56 kB | — | ✅ |

- 2,562 modules transformed; **no build errors**.
- Browser console at runtime: **clean** (only Vite HMR messages, zero errors/warnings).
- Network waterfall: HTML → single JS + single CSS → API calls; no redundant requests, React Query dedupes/caches.

**`DEF-CW01-M05-002` (Low, OPEN — recommendation):** the entire app ships as one
1.39 MB / 365 kB-gzip JS chunk with **no route-level code-splitting**. Vite
flags the > 500 kB chunk. Under the 400 kB-gzip budget and acceptable for an
internal ERP on first load, but route-level `React.lazy()` (or `manualChunks`
vendor splitting) would cut initial payload materially. **Recommendation, not a
blocker** — deferred for a future optimization pass.

---

## Performance Baseline v1.0

> **CTO deliverable (1 of 3).** This is the permanent reference snapshot used by
> the Performance Regression Framework. Every figure below is the **live,
> measured P95** captured through the `localhost:80` proxy on the date shown —
> not an estimate. It is the single source of truth in code at
> `artifacts/api-server/src/lib/performance-baseline.ts` (`PERFORMANCE_BASELINE_V1`),
> served live at `GET /api/developer/performance`, and rendered on the
> `/developer/performance` Engineering Health dashboard.

**Baseline version:** 1.0 · **Captured:** 2026-06-27
**Hardware / environment (all rows):** Replit dev container · NixOS · Node 24 · single Express process · default pg pool · measured via `localhost:80` shared proxy (production-equivalent routing).
**Dataset (all read rows):** 14 lots / 58 cells — the **current dev dataset**.

> **Honesty note on dataset:** this baseline is captured against the *current dev
> dataset* (14 lots / 58 cells), deliberately distinct from the **stress** dataset
> (1,014 lots / 10,058 cells) used in the load tests earlier in this document. The
> baseline's job is regression *detection over time* on a stable, reproducible
> dataset; the stress tests prove *scaling headroom*. Both are real measurements —
> they answer different questions. The baseline dataset string is recorded
> alongside each figure in code so a future re-measure compares like-for-like.

| # | Operation | Endpoint | Target (P95) | Actual (P95) | Dataset | Pass/Fail |
|---|-----------|----------|-------------|--------------|---------|-----------|
| 1 | Login | `POST /api/auth/login` | < 500 ms | **278 ms** | n/a (auth) | ✅ PASS |
| 2 | Dashboard load | `GET /api/dashboard/director` | < 500 ms | **4 ms** | 14 lots / 58 cells | ✅ PASS |
| 3 | Cell Receiving page | `GET /api/cells/lots` | < 300 ms | **3.6 ms** | 14 lots / 58 cells | ✅ PASS |
| 4 | Create Lot | `POST /api/cells/lots` | < 600 ms | **6 ms** warm | 5-cell lot | ✅ PASS |
| 5 | Edit Lot | `PATCH /api/cells/lots/:id` | < 500 ms | **3.7 ms** | 14 lots / 58 cells | ✅ PASS |
| 6 | Search | `GET /api/cells/lots?search=` | < 500 ms | **5.1 ms** | 14 lots / 58 cells | ✅ PASS |
| 7 | Filters | `GET /api/cells/lots?status=` | < 300 ms | **3.4 ms** | 14 lots / 58 cells | ✅ PASS |
| 8 | Timeline load | `GET /api/cells/lots/:id/history` | < 500 ms | **3.4 ms** | 14 lots / 58 cells | ✅ PASS |
| 9 | Director Dashboard | `GET /api/dashboard/director` | < 500 ms | **4 ms** | 14 lots / 58 cells | ✅ PASS |
| 10 | Reports | `GET /api/reports/production` | < 800 ms | **3.3 ms** | 14 lots / 58 cells | ✅ PASS |
| 11 | Export | client-side CSV (browser) | n/a | **N/A — not server-instrumented** | n/a | ⚪ N/A |
| 12 | History | `GET /api/cells/lots/:id/history` | < 500 ms | **3.4 ms** | 14 lots / 58 cells | ✅ PASS |

**Per-row honesty notes:**

- **Login (278 ms)** — the slowest operation by two orders of magnitude, and
  intentionally so: it includes a bcrypt password verify + JWT sign. This is a
  deliberate security cost, well under the 500 ms target. It is the one figure to
  watch if bcrypt cost-factor changes.
- **Create Lot (6 ms warm / ~66 ms first cold request)** — the warm P95 is 6 ms;
  the very first request after a cold start was observed at ~66 ms (JIT + pool
  warm-up). Both are recorded honestly in code; the warm figure is the baseline.
- **Export (N/A)** — the Export Center builds its CSV **in the browser** from
  data already fetched for the page; there is no dedicated server export endpoint,
  so there is nothing server-side to instrument. Marked N/A rather than fabricated.
- **Dashboard load = Director Dashboard** — both map to the same
  `GET /api/dashboard/director` aggregation; listed separately because the CTO
  scope names both as distinct user operations.

**Result: PASS.** Every server-instrumented operation is comfortably within its
target; the only non-passing row is Export, which is honestly **N/A** (no server
endpoint exists to measure).

---

## Defects Filed

| ID | Severity | Area | Status |
|----|----------|------|--------|
| `DEF-CW01-M05-001` | Low | DB — missing `cell_lots` indexes (created_at, status) → Seq Scan + sort on every list page | ✅ **FIXED** (indexes added + pushed; Index Scan confirmed) |
| `DEF-CW01-M05-002` | Low | FE — single 365 kB-gzip JS chunk, no code-splitting | ⬜ **OPEN** (recommendation; within budget, non-blocking) |

No High or Medium defects. No performance regression versus prior matrices.

---

## Scope coverage & gaps

The CTO scope named four areas. Coverage is **honest** here — what was
instrumented vs. what was assessed by design rather than measured:

| Scope item | Status | Evidence type |
|------------|--------|---------------|
| API latency P50/P95/P99 (load, search, save reads) | ✅ Done | **Measured** (fetch timing loops) |
| Page-load / drawer / timeline / history latency | 🟡 Partial | API legs measured; client paint **not** profiler-instrumented |
| Stress: 1,000 lots / 10,000 cells | ✅ Done | **Measured** (seeded + re-benched) |
| Stress: concurrent users, rapid search/pagination, rate-limit | ✅ Done | **Measured** |
| Stress: repeated saves (write load) | 🟡 Not run | avoided to prevent dev-DB pollution; POST path reviewed (bulk insert, short txn) |
| DB: query plans, missing indexes, slow queries, N+1, txn duration | ✅ Done | **Measured** (`EXPLAIN ANALYZE`) + fix |
| Frontend: bundle size, network waterfall | ✅ Done | **Measured** (`vite build`) |
| Frontend: render counts, re-renders, memory growth | 🟡 **Not instrumented** | reasoned from architecture only — **gap** |

**Acknowledged gaps (for a follow-up profiler pass):**
- React render-count / re-render analysis and heap-growth-over-time were **not**
  captured with the React DevTools Profiler / browser heap snapshots in this
  environment. The server-paginated design strongly bounds render cost, but this
  is an architectural argument, not a measured one.
- Write-path load (repeated rapid saves) was reviewed by code but not
  load-tested, to keep the dev database clean.

---

## Certification Decision

- [ ] PASS
- [x] **PASS WITH NOTES** — every **measured** threshold is met by a wide margin;
  one missing index found and fixed (`DEF-CW01-M05-001`). Two items remain:
  a low-severity code-splitting recommendation (`DEF-CW01-M05-002`), and the
  frontend micro-metrics (render counts, re-renders, memory growth) plus
  write-path load were assessed by design but **not instrumented** — recommended
  for a follow-up profiler pass.
- [ ] FAIL

**Summary:** At full stress scale (1,014 lots / 10,058 cells) every measured Cell
Receiving API resolves in single-digit milliseconds, 50 concurrent users drain
in < 300 ms with zero errors, all hot queries are index-backed (after the
`DEF-CW01-M05-001` fix), there is no N+1, transactions stay short, and the
frontend bundle is within budget with a clean runtime console. No High/Medium
defects, no regression. The remaining gaps are measurement-coverage gaps, not
observed problems — hence **Pass with notes** rather than a clean Pass.

**Open items for follow-up:** `DEF-CW01-M05-002` (route-level code-splitting);
profiler-instrumented frontend render/memory metrics; write-path load test.

**Signed:** Replit Agent (QA) · **Date:** 2026-06-27
