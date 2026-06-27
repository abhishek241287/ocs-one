# CW-08 — Warranty & Service: Performance Test

| Field | Value |
|-------|-------|
| **Wave** | CW-08 |
| **Module** | Warranty & Service |
| **Test Date** | — |
| **Tester** | — |
| **Dataset size** | — |

---

## API Performance

| Endpoint | Method | Dataset | p95 Response Time | Threshold | Status |
|----------|--------|---------|-------------------|-----------|--------|
| `/api/warranty` | GET | 200 warranties | | < 400 ms | ⬜ |
| `/api/warranty` | POST | — | | < 500 ms | ⬜ |
| `/api/service-tickets` | GET | 100 tickets | | < 400 ms | ⬜ |
| `/api/service-tickets` | POST | — | | < 500 ms | ⬜ |
| `/api/service-tickets/:id` | PATCH | — | | < 400 ms | ⬜ |

---

## Frontend Performance

| Page / Interaction | Metric | Measured | Threshold | Status |
|--------------------|--------|----------|-----------|--------|
| Warranty list initial load | FCP | | < 1.5 s | ⬜ |
| Service ticket detail | FCP | | < 1.5 s | ⬜ |
| Ticket status transition | Round-trip | | < 700 ms | ⬜ |

---

## Performance Decision

- [ ] **PASS**
- [ ] **PASS WITH NOTES**
- [ ] **FAIL**

**Defects filed:** **Signed:** _________________________ **Date:** _____________
