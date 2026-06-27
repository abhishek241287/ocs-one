# CW-05 — Quality Control: Performance Test

| Field | Value |
|-------|-------|
| **Wave** | CW-05 |
| **Module** | Quality Control |
| **Test Date** | — |
| **Tester** | — |
| **Dataset size** | — |

---

## API Performance

| Endpoint | Method | Dataset | p95 Response Time | Threshold | Status |
|----------|--------|---------|-------------------|-----------|--------|
| `/api/manufacturing/stages` (QC pending) | GET | 50 orders | | < 400 ms | ⬜ |
| `/api/manufacturing/stages/:id/approve` | POST | — | | < 400 ms | ⬜ |
| `/api/manufacturing/stages/:id/reject` | POST | — | | < 400 ms | ⬜ |
| `/api/manufacturing/test-results` | POST | — | | < 400 ms | ⬜ |
| `/api/reports/qc` (30-day summary) | GET | 30 days | | < 600 ms | ⬜ |

---

## Frontend Performance

| Page / Interaction | Metric | Measured | Threshold | Status |
|--------------------|--------|----------|-----------|--------|
| QC stage card open | Time to interactive | | < 500 ms | ⬜ |
| QC report load | FCP | | < 2.0 s | ⬜ |

---

## Performance Decision

- [ ] **PASS**
- [ ] **PASS WITH NOTES**
- [ ] **FAIL**

**Defects filed:** **Signed:** _________________________ **Date:** _____________
