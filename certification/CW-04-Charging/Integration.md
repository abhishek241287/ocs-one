# CW-04 — Charging: Integration Test

| Field | Value |
|-------|-------|
| **Wave** | CW-04 |
| **Module** | Charging |
| **Test Date** | — |
| **Tester** | — |

---

## Dependency Map

| Dependency | Direction | Integration Point |
|------------|-----------|-------------------|
| Manufacturing Orders (CW-03) | Inbound | Charging stage links to production order |
| Chargers Master | Inbound | Charger unit references charger model |
| Director Dashboard | Outbound | Charger utilisation metric |

---

## Integration Verification

| # | Integration | Expected | Actual | Status | Defect |
|---|-------------|----------|--------|--------|--------|
| 1 | Orders → Charging | Charging stage activates correct charger assignment | | ⬜ | |
| 2 | Chargers Master → Charging | Charger unit resolves model name correctly | | ⬜ | |
| 3 | Charging → Director Dashboard | Charger utilisation percentage correct | | ⬜ | |
| 4 | Double-assignment prevention | Cannot assign a busy charger to a second order | | ⬜ | |

---

## Regression Check

| Module | Check | Status |
|--------|-------|--------|
| Cell Receiving (CW-01) | CRUD unaffected | ⬜ |
| Cell Grading (CW-02) | CRUD unaffected | ⬜ |
| Manufacturing Orders (CW-03) | Stage lifecycle unaffected | ⬜ |

---

## Integration Decision

- [ ] **PASS**
- [ ] **FAIL**

**Signed:** _________________________ **Date:** _____________
