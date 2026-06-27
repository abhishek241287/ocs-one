# CW-01 — Cell Receiving: Integration Test

| Field | Value |
|-------|-------|
| **Wave** | CW-01 |
| **Module** | Cell Receiving |
| **Test Date** | — |
| **Tester** | — |

---

## Dependency Map

Cell Receiving has the following integration points:

| Dependency | Direction | Integration Point |
|------------|-----------|-------------------|
| Cells Master | Inbound | Cell model lookup when creating a lot |
| Cell Grading | Outbound | Lots feed into grading queue |
| Cell Inventory | Outbound | Received lots appear in inventory counts |
| Director Dashboard | Outbound | Cell inventory snapshot on dashboard |
| Reports — Cell Analytics | Outbound | Lot data feeds the cell grading report |

---

## Integration Verification

| # | Integration | Test | Expected | Actual | Status | Defect |
|---|-------------|------|----------|--------|--------|--------|
| 1 | Cells Master → Cell Receiving | Create a lot using a master cell model | Cell model name resolves in lot detail and list | | ⬜ | |
| 2 | Cells Master → Cell Receiving | Delete a master cell model used by an existing lot | Lot remains intact; model name shown as archived or retained | | ⬜ | |
| 3 | Cell Receiving → Cell Grading | Create a lot and navigate to Cell Grading | Lot appears in grading queue | | ⬜ | |
| 4 | Cell Receiving → Cell Inventory | Create a lot with quantity 50 | Cell Inventory shows +50 in "Received" count | | ⬜ | |
| 5 | Cell Receiving → Director Dashboard | Create a lot | Dashboard cell inventory card reflects updated count within one refresh cycle | | ⬜ | |
| 6 | Cell Receiving → Cell Analytics Report | Create lots across two suppliers | Report shows correct supplier breakdown | | ⬜ | |
| 7 | Auth integration | Operator creates a lot; supervisor views it | Both roles see consistent data | | ⬜ | |

---

## Regression Check

Verify that CW-01 changes did not break any previously passing module:

| Module | Regression Check | Status | Notes |
|--------|-----------------|--------|-------|
| Authentication | Login / logout still works | ⬜ | |
| All Masters | CRUD operations unaffected | ⬜ | |
| Director Dashboard | Dashboard loads without errors | ⬜ | |

---

## Integration Decision

- [ ] **PASS** — all integration points verified, no regressions
- [ ] **FAIL** — one or more integration failures; defects filed

**Defects filed:** (list IDs from Defects.md, or "None")

**Signed:** _________________________ **Date:** _____________
