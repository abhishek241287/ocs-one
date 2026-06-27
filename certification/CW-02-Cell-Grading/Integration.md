# CW-02 — Cell Grading: Integration Test

| Field | Value |
|-------|-------|
| **Wave** | CW-02 |
| **Module** | Cell Grading |
| **Test Date** | — |
| **Tester** | — |

---

## Dependency Map

| Dependency | Direction | Integration Point |
|------------|-----------|-------------------|
| Cell Receiving | Inbound | Lots and cells feed into grading queue |
| Grade Configuration | Inbound | Grade thresholds applied during grading |
| Cell Matching | Outbound | Graded cells available for slot allocation |
| Cell Inventory | Outbound | Graded counts update inventory snapshot |
| Cell Analytics Report | Outbound | Grade distribution feeds report |
| Director Dashboard | Outbound | Cell inventory card reflects graded counts |

---

## Integration Verification

| # | Integration | Expected | Actual | Status | Defect |
|---|-------------|----------|--------|--------|--------|
| 1 | Cell Receiving → Cell Grading | Received lots appear in grading queue | | ⬜ | |
| 2 | Grade Config → Cell Grading | Grade A/B/C assigned per configured thresholds | | ⬜ | |
| 3 | Cell Grading → Cell Matching | Grade-A cells available in matching pool | | ⬜ | |
| 4 | Cell Grading → Cell Inventory | Graded counts appear in inventory snapshot | | ⬜ | |
| 5 | Cell Grading → Cell Analytics Report | Grade distribution reflects graded cells | | ⬜ | |
| 6 | Cell Grading → Director Dashboard | Dashboard cell inventory updated | | ⬜ | |

---

## Regression Check

| Module | Check | Status |
|--------|-------|--------|
| Cell Receiving (CW-01 Certified) | CRUD unaffected | ⬜ |
| Director Dashboard | Loads without errors | ⬜ |

---

## Integration Decision

- [ ] **PASS**
- [ ] **FAIL** — defects filed

**Signed:** _________________________ **Date:** _____________
