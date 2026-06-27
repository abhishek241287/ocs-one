# CW-01 — Cell Receiving: Performance Test

| Field | Value |
|-------|-------|
| **Wave** | CW-01 |
| **Module** | Cell Receiving |
| **Test Date** | — |
| **Tester** | — |
| **Environment** | — |
| **Dataset size** | — |

---

## API Performance

Measured via browser DevTools Network tab or `curl` with timing. All times are p95 (95th percentile).

| Endpoint | Method | Dataset | p95 Response Time | Threshold | Status |
|----------|--------|---------|-------------------|-----------|--------|
| `/api/cells/lots` | GET | 100 lots | | < 300 ms | ⬜ |
| `/api/cells/lots` | GET | 500 lots | | < 500 ms | ⬜ |
| `/api/cells/lots` | POST | — | | < 400 ms | ⬜ |
| `/api/cells/lots/:id` | GET | — | | < 200 ms | ⬜ |
| `/api/cells/lots/:id` | PATCH | — | | < 400 ms | ⬜ |
| `/api/cells` (cells in lot) | GET | 500 cells | | < 400 ms | ⬜ |
| `/api/cells/lots?search=` | GET | Full dataset | | < 500 ms | ⬜ |

---

## Frontend Performance

Measured via Chrome DevTools Lighthouse or Performance tab.

| Page / Interaction | Metric | Measured | Threshold | Status |
|--------------------|--------|----------|-----------|--------|
| Cell Receiving page — initial load | FCP | | < 1.5 s | ⬜ |
| Cell Receiving page — initial load | LCP | | < 2.5 s | ⬜ |
| Cell Receiving page — initial load | TTI | | < 3.0 s | ⬜ |
| Lot list render (100 rows) | Render time | | < 500 ms | ⬜ |
| Search results appear | Response | | < 500 ms | ⬜ |
| Create form open | Time to interactive | | < 300 ms | ⬜ |
| Save → success toast | Round-trip | | < 600 ms | ⬜ |

---

## Observations

_Record any notable observations, bottlenecks, or unexpected behaviour here._

---

## Performance Decision

- [ ] **PASS** — all thresholds met
- [ ] **PASS WITH NOTES** — minor exceedances noted, not blocking
- [ ] **FAIL** — one or more thresholds exceeded; defect filed

**Defects filed:** (list IDs from Defects.md, or "None")

**Signed:** _________________________ **Date:** _____________
