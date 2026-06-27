# CW-02 — Cell Grading: Performance Test

| Field | Value |
|-------|-------|
| **Wave** | CW-02 |
| **Module** | Cell Grading |
| **Test Date** | — |
| **Tester** | — |
| **Environment** | — |
| **Dataset size** | — |

---

## API Performance

| Endpoint | Method | Dataset | p95 Response Time | Threshold | Status |
|----------|--------|---------|-------------------|-----------|--------|
| `/api/cells` (grading list) | GET | 500 cells | | < 400 ms | ⬜ |
| `/api/cells/:id/grade` | POST | — | | < 400 ms | ⬜ |
| `/api/cells/grade-config` | GET | — | | < 200 ms | ⬜ |

---

## Frontend Performance

| Page / Interaction | Metric | Measured | Threshold | Status |
|--------------------|--------|----------|-----------|--------|
| Cell Grading page — initial load | FCP | | < 1.5 s | ⬜ |
| Grade 50 cells in sequence | Throughput | | < 1 s per cell | ⬜ |

---

## Performance Decision

- [ ] **PASS**
- [ ] **PASS WITH NOTES**
- [ ] **FAIL** — defect filed

**Defects filed:** **Signed:** _________________________ **Date:** _____________
