# CW-07 — Reports & Analytics: Performance Test

| Field | Value |
|-------|-------|
| **Wave** | CW-07 |
| **Module** | Reports & Analytics |
| **Test Date** | — |
| **Tester** | — |
| **Dataset size** | — |

---

## API Performance

| Endpoint | Method | Date Range | p95 Response Time | Threshold | Status |
|----------|--------|------------|-------------------|-----------|--------|
| `/api/reports/production` | GET | 30 days | | < 800 ms | ⬜ |
| `/api/reports/production` | GET | 90 days | | < 1500 ms | ⬜ |
| `/api/reports/qc` | GET | 30 days | | < 800 ms | ⬜ |
| `/api/reports/cells` | GET | 30 days | | < 800 ms | ⬜ |
| `/api/reports/logistics` | GET | 30 days | | < 800 ms | ⬜ |

---

## Frontend Performance

| Page / Interaction | Metric | Measured | Threshold | Status |
|--------------------|--------|----------|-----------|--------|
| Production Report page load | FCP | | < 2.0 s | ⬜ |
| QC Report page load | FCP | | < 2.0 s | ⬜ |
| Filter change re-render | Response | | < 600 ms | ⬜ |

---

## Performance Decision

- [ ] **PASS**
- [ ] **PASS WITH NOTES**
- [ ] **FAIL**

**Defects filed:** **Signed:** _________________________ **Date:** _____________
