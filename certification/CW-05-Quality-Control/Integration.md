# CW-05 — Quality Control: Integration Test

| Field | Value |
|-------|-------|
| **Wave** | CW-05 |
| **Module** | Quality Control |
| **Test Date** | — |
| **Tester** | — |

---

## Dependency Map

| Dependency | Direction | Integration Point |
|------------|-----------|-------------------|
| Manufacturing Orders (CW-03) | Inbound | QC stage links to production order |
| Rework Queue | Outbound | Rejected QC creates rework ticket |
| Dispatch Orders (CW-06) | Outbound | QC-passed orders eligible for dispatch |
| QC Report | Outbound | Pass/fail rates in QC analytics |
| Director Dashboard | Outbound | QC Pending KPI card |

---

## Integration Verification

| # | Integration | Expected | Actual | Status | Defect |
|---|-------------|----------|--------|--------|--------|
| 1 | Orders → QC | QC stage card shows order details correctly | | ⬜ | |
| 2 | QC → Rework Queue | Failed QC creates a rework ticket automatically | | ⬜ | |
| 3 | QC pass → Dispatch eligibility | QC-passed order marked as dispatch-ready | | ⬜ | |
| 4 | QC → QC Report | Pass/fail counts appear in 30-day report | | ⬜ | |
| 5 | QC → Director Dashboard | QC Pending count updated | | ⬜ | |

---

## Regression Check

| Module | Check | Status |
|--------|-------|--------|
| Cell Receiving (CW-01) | CRUD unaffected | ⬜ |
| Cell Grading (CW-02) | CRUD unaffected | ⬜ |
| Manufacturing Orders (CW-03) | Stage lifecycle unaffected | ⬜ |
| Charging (CW-04) | Charger dashboard unaffected | ⬜ |

---

## Integration Decision

- [ ] **PASS**
- [ ] **FAIL**

**Signed:** _________________________ **Date:** _____________
