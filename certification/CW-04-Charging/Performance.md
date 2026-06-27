# CW-04 — Charging: Performance Test

| Field | Value |
|-------|-------|
| **Wave** | CW-04 |
| **Module** | Charging |
| **Test Date** | — |
| **Tester** | — |
| **Dataset size** | — |

---

## API Performance

| Endpoint | Method | Dataset | p95 Response Time | Threshold | Status |
|----------|--------|---------|-------------------|-----------|--------|
| `/api/manufacturing/chargers` | GET | 50 units | | < 300 ms | ⬜ |
| `/api/manufacturing/charging-dashboard` | GET | — | | < 400 ms | ⬜ |
| `/api/manufacturing/chargers/:id/assign` | POST | — | | < 400 ms | ⬜ |
| `/api/manufacturing/formation-reports` | POST | — | | < 500 ms | ⬜ |

---

## Frontend Performance

| Page / Interaction | Metric | Measured | Threshold | Status |
|--------------------|--------|----------|-----------|--------|
| Charging dashboard initial load | FCP | | < 1.5 s | ⬜ |
| Charger status update (poll) | Response | | < 300 ms | ⬜ |

---

## Performance Decision

- [ ] **PASS**
- [ ] **PASS WITH NOTES**
- [ ] **FAIL**

**Defects filed:** **Signed:** _________________________ **Date:** _____________
