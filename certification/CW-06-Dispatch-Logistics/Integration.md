# CW-06 — Dispatch & Logistics: Integration Test

| Field | Value |
|-------|-------|
| **Wave** | CW-06 |
| **Module** | Dispatch & Logistics |
| **Test Date** | — |
| **Tester** | — |

---

## Dependency Map

| Dependency | Direction | Integration Point |
|------------|-----------|-------------------|
| Quality Control (CW-05) | Inbound | Only QC-passed batteries can be dispatched |
| Dealers Master | Inbound | Dealer assigned to dispatch order |
| Logistics Report | Outbound | Dispatch data feeds logistics report |
| Director Dashboard | Outbound | Dispatch Ready, In Transit, Delivered Today KPIs |

---

## Integration Verification

| # | Integration | Expected | Actual | Status | Defect |
|---|-------------|----------|--------|--------|--------|
| 1 | QC gate → Dispatch | Non-QC-passed battery cannot be added to dispatch order | | ⬜ | |
| 2 | Dealers Master → Dispatch | Dealer resolves correctly in dispatch order | | ⬜ | |
| 3 | Dispatch → Logistics Report | Dispatch summary reflects completed orders | | ⬜ | |
| 4 | Dispatch → Director Dashboard | Dispatch Ready / In Transit / Delivered counts correct | | ⬜ | |
| 5 | Shipment events | Each status transition creates a shipment event | | ⬜ | |

---

## Regression Check

| Module | Check | Status |
|--------|-------|--------|
| Cell Receiving (CW-01) | CRUD unaffected | ⬜ |
| Cell Grading (CW-02) | CRUD unaffected | ⬜ |
| Manufacturing Orders (CW-03) | Stage lifecycle unaffected | ⬜ |
| Charging (CW-04) | Dashboard unaffected | ⬜ |
| Quality Control (CW-05) | QC flow unaffected | ⬜ |

---

## Integration Decision

- [ ] **PASS**
- [ ] **FAIL**

**Signed:** _________________________ **Date:** _____________
