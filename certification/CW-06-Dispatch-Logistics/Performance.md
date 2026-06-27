# CW-06 — Dispatch & Logistics: Performance Test

| Field | Value |
|-------|-------|
| **Wave** | CW-06 |
| **Module** | Dispatch & Logistics |
| **Test Date** | — |
| **Tester** | — |
| **Dataset size** | — |

---

## API Performance

| Endpoint | Method | Dataset | p95 Response Time | Threshold | Status |
|----------|--------|---------|-------------------|-----------|--------|
| `/api/logistics/dispatch` | GET | 100 orders | | < 400 ms | ⬜ |
| `/api/logistics/dispatch` | POST | — | | < 500 ms | ⬜ |
| `/api/logistics/dispatch/:id` | GET | — | | < 200 ms | ⬜ |
| `/api/logistics/dispatch/:id/status` | PATCH | — | | < 400 ms | ⬜ |
| `/api/logistics/dealers` | GET | 50 dealers | | < 300 ms | ⬜ |

---

## Frontend Performance

| Page / Interaction | Metric | Measured | Threshold | Status |
|--------------------|--------|----------|-----------|--------|
| Dispatch orders list | FCP | | < 1.5 s | ⬜ |
| Dispatch order detail | FCP | | < 1.5 s | ⬜ |
| Status transition | Round-trip | | < 700 ms | ⬜ |

---

## Performance Decision

- [ ] **PASS**
- [ ] **PASS WITH NOTES**
- [ ] **FAIL**

**Defects filed:** **Signed:** _________________________ **Date:** _____________
