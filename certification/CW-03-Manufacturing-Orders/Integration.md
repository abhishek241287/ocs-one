# CW-03 — Manufacturing Orders: Integration Test

| Field | Value |
|-------|-------|
| **Wave** | CW-03 |
| **Module** | Manufacturing Orders |
| **Test Date** | — |
| **Tester** | — |

---

## Dependency Map

| Dependency | Direction | Integration Point |
|------------|-----------|-------------------|
| Cell Matching | Inbound | Cell allocation slots assigned to orders |
| BMS Master | Inbound | BMS model assigned during BMS Install stage |
| Charging Units | Outbound | Charger assigned during Charging stage |
| QC Approvals | Outbound | QC result recorded against order |
| Rework Queue | Outbound | Rejected stages create rework tickets |
| Director Dashboard | Outbound | Pipeline health, recent orders |
| Production Report | Outbound | Order data feeds production report |
| Genealogy / Timeline | Outbound | Battery timeline populated per stage |

---

## Integration Verification

| # | Integration | Expected | Actual | Status | Defect |
|---|-------------|----------|--------|--------|--------|
| 1 | Cell Matching → Orders | Allocated cells linked to order | | ⬜ | |
| 2 | BMS Master → Orders | BMS serial resolved in BMS Install stage | | ⬜ | |
| 3 | Orders → Charging Units | Charger assignment created on Charging stage | | ⬜ | |
| 4 | Orders → QC Approvals | QC result recorded and reflects in order status | | ⬜ | |
| 5 | Orders → Rework Queue | Rejected stage creates rework ticket | | ⬜ | |
| 6 | Orders → Director Dashboard | Pipeline health and recent orders updated | | ⬜ | |
| 7 | Orders → Production Report | Completed orders appear in report | | ⬜ | |
| 8 | Orders → Battery Timeline | All stage events recorded in timeline | | ⬜ | |

---

## Regression Check

| Module | Check | Status |
|--------|-------|--------|
| Cell Receiving (CW-01) | CRUD unaffected | ⬜ |
| Cell Grading (CW-02) | CRUD unaffected | ⬜ |
| Director Dashboard | Loads without errors | ⬜ |

---

## Integration Decision

- [ ] **PASS**
- [ ] **FAIL**

**Signed:** _________________________ **Date:** _____________
