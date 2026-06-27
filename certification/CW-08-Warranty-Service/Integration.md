# CW-08 — Warranty & Service: Integration Test

| Field | Value |
|-------|-------|
| **Wave** | CW-08 |
| **Module** | Warranty & Service |
| **Test Date** | — |
| **Tester** | — |

---

## Dependency Map

| Dependency | Direction | Integration Point |
|------------|-----------|-------------------|
| Dispatch & Logistics (CW-06) | Inbound | Warranty registration triggered on dispatch |
| Dealers Master | Inbound | Dealer linked to warranty |
| Battery Genealogy | Inbound | Battery history available in service ticket |
| Director Dashboard | Outbound | Active warranty / open ticket KPIs (if added) |

---

## Integration Verification

| # | Integration | Expected | Actual | Status | Defect |
|---|-------------|----------|--------|--------|--------|
| 1 | Dispatch → Warranty | Dispatch completion auto-creates warranty record | | ⬜ | |
| 2 | Dealers → Warranty | Dealer correctly linked to warranty | | ⬜ | |
| 3 | Battery Genealogy → Service Ticket | Service ticket shows full battery production history | | ⬜ | |
| 4 | Service ticket lifecycle | Open → In Repair → Resolved transitions work correctly | | ⬜ | |
| 5 | Repair log | Each service action logged with actor, date, and notes | | ⬜ | |

---

## Regression Check

| Module | Check | Status |
|--------|-------|--------|
| All CW-01 to CW-07 modules | No CRUD regressions | ⬜ |
| Director Dashboard | Loads without errors | ⬜ |

---

## Integration Decision

- [ ] **PASS**
- [ ] **FAIL**

**Signed:** _________________________ **Date:** _____________
