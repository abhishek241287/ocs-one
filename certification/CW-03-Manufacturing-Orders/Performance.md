# CW-03 — Manufacturing Orders: Performance Test

| Field | Value |
|-------|-------|
| **Wave** | CW-03 |
| **Module** | Manufacturing Orders |
| **Test Date** | — |
| **Tester** | — |
| **Dataset size** | — |

---

## API Performance

| Endpoint | Method | Dataset | p95 Response Time | Threshold | Status |
|----------|--------|---------|-------------------|-----------|--------|
| `/api/manufacturing/orders` | GET | 200 orders | | < 400 ms | ⬜ |
| `/api/manufacturing/orders` | POST | — | | < 500 ms | ⬜ |
| `/api/manufacturing/orders/:id` | GET | — | | < 200 ms | ⬜ |
| `/api/manufacturing/stages/:id/complete` | POST | — | | < 500 ms | ⬜ |
| `/api/manufacturing/stages/:id/approve` | POST | — | | < 400 ms | ⬜ |

---

## Frontend Performance

| Page / Interaction | Metric | Measured | Threshold | Status |
|--------------------|--------|----------|-----------|--------|
| Orders list (200 orders) | FCP | | < 1.5 s | ⬜ |
| Stage card open | Time to interactive | | < 500 ms | ⬜ |
| Stage transition (complete → approved) | Round-trip | | < 800 ms | ⬜ |

---

## Performance Decision

- [ ] **PASS**
- [ ] **PASS WITH NOTES**
- [ ] **FAIL**

**Defects filed:** **Signed:** _________________________ **Date:** _____________
