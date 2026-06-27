# CW-07 — Reports & Analytics: Integration Test

| Field | Value |
|-------|-------|
| **Wave** | CW-07 |
| **Module** | Reports & Analytics |
| **Test Date** | — |
| **Tester** | — |

---

## Dependency Map

| Dependency | Direction | Integration Point |
|------------|-----------|-------------------|
| Manufacturing Orders (CW-03) | Inbound | Production report data |
| Quality Control (CW-05) | Inbound | QC report data |
| Cell Grading (CW-02) | Inbound | Cell analytics data |
| Dispatch & Logistics (CW-06) | Inbound | Logistics report data |
| Director Dashboard | Parallel | Dashboard KPIs must agree with report figures |

---

## Integration Verification

| # | Integration | Expected | Actual | Status | Defect |
|---|-------------|----------|--------|--------|--------|
| 1 | Orders → Production Report | Report counts match order table records | | ⬜ | |
| 2 | QC → QC Report | Pass/fail rates match QC approval records | | ⬜ | |
| 3 | Cell Grading → Cell Analytics | Grade distribution matches grading records | | ⬜ | |
| 4 | Dispatch → Logistics Report | Dispatch summary matches dispatch order records | | ⬜ | |
| 5 | Reports ↔ Director Dashboard | KPI figures on dashboard agree with report figures | | ⬜ | |

---

## Regression Check

| Module | Check | Status |
|--------|-------|--------|
| All CW-01 to CW-06 modules | No CRUD regressions | ⬜ |
| Director Dashboard | Loads without errors | ⬜ |

---

## Integration Decision

- [ ] **PASS**
- [ ] **FAIL**

**Signed:** _________________________ **Date:** _____________
