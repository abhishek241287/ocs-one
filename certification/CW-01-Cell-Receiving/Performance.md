# CW-01 — Cell Receiving: Performance Test

> **Full certification:** see [`MAT-05.md`](./MAT-05.md) for complete methodology,
> query plans, stress results, and defect detail. This sheet records the headline actuals.

| Field | Value |
|-------|-------|
| **Wave** | CW-01 |
| **Module** | Cell Receiving |
| **Test Date** | 2026-06-27 |
| **Tester** | Replit Agent (QA) |
| **Environment** | Replit dev container · Express 5 · PostgreSQL · all traffic via `localhost:80` proxy |
| **Dataset size** | 1,014 lots · 10,058 cells |

---

## API Performance

Measured via Node `fetch` timing loop (40–100 samples/endpoint), full dataset.

| Endpoint | Method | Dataset | P95 Response Time | Threshold | Status |
|----------|--------|---------|-------------------|-----------|--------|
| `/api/cells/lots` | GET | 1,014 lots | 8 ms | < 300 ms | ✅ |
| `/api/cells/lots` (deep page 40) | GET | 1,014 lots | 7 ms | < 300 ms | ✅ |
| `/api/cells/lots?status=` | GET | 1,014 lots | 6 ms | < 300 ms | ✅ |
| `/api/cells/lots/:id` | GET | — | indexed (Bitmap Index Scan) | < 200 ms | ✅ |
| `/api/cells/lots/:id/history` | GET | — | indexed | < 300 ms | ✅ |
| `/api/cells/lots?search=` | GET | full dataset | 6 ms | < 500 ms | ✅ |
| `/api/cells/lots?pageSize=100` | GET | full dataset | 6 ms | < 500 ms | ✅ |
| `/api/dashboard/director` | GET | full dataset | ~63 ms | < 500 ms | ✅ |

---

## Frontend Performance

Production `vite build` + dev-server observation.

| Page / Interaction | Metric | Measured | Threshold | Status |
|--------------------|--------|----------|-----------|--------|
| JS bundle (gzip) | transfer size | 364.68 kB | < 400 kB | ⚠️ within budget, single chunk |
| CSS bundle (gzip) | transfer size | 20.67 kB | < 50 kB | ✅ |
| Lot list render | DOM rows (server-paginated) | ≤ pageSize (O(pageSize)) | < 500 ms | ✅ |
| Search results appear | API round-trip | 6 ms | < 500 ms | ✅ |
| Create drawer open | Radix transform, no fetch | instant | < 300 ms | ✅ |
| Save → success toast | POST round-trip | well under | < 600 ms | ✅ |
| Runtime console | errors/warnings | 0 (clean) | 0 | ✅ |

---

## Stress

| Scenario | Result | Status |
|----------|--------|--------|
| 1,000 lots / 10,000 cells volume | no read degradation | ✅ |
| 25 concurrent users | 25/25 OK, wall 134 ms | ✅ |
| 50 concurrent users | 50/50 OK, wall 259 ms, ~193 req/s | ✅ |
| Rapid 100-request loop | 2–8 ms each, no leak | ✅ |
| Rate limiter under flood | sheds load with 429 (as designed) | ✅ |

---

## Observations

- **Missing index found & fixed** (`DEF-CW01-M05-001`): `cell_lots` lacked indexes on `created_at` (sort) and `status` (filter) → Seq Scan + top-N sort on every list page. Added `idx_cell_lots_created_at` + `idx_cell_lots_status`; list path now Index Scan Backward (sort eliminated, O(pageSize)).
- No N+1 anywhere in the Cell Receiving routes; bulk cell insert keeps POST transaction short.
- Server-side pagination caps DOM rows regardless of dataset size — render cost is independent of total volume.
- **Code-splitting recommendation** (`DEF-CW01-M05-002`, Low, open): single 365 kB-gzip JS chunk, no route-level lazy loading.

---

## Performance Decision

- [ ] PASS
- [x] **PASS WITH NOTES** — all *measured* thresholds met by a wide margin; missing index found & fixed. Frontend render-count / re-render / memory-growth micro-metrics and write-path load were design-assessed but **not instrumented** — recommended for a follow-up profiler pass (see `MAT-05.md` → Scope coverage & gaps).
- [ ] FAIL

**Defects filed:** `DEF-CW01-M05-001` (fixed), `DEF-CW01-M05-002` (deferred Low)

**Signed:** Replit Agent (QA) **Date:** 2026-06-27
