# FAT Defect Log

## FAT-2026-09-08-001 — Cell-match acceptance is not single-winner under concurrency

- **Status:** CLOSED for the application defect; the controlled evidence runner
  now proves the exact-one-winner and post-race allocation invariants.
- **Case:** `CONC-P02`
- **Severity:** High — integrity/control failure
- **Frozen candidate:** `FAT-CANDIDATE-2026-09-08`
- **Frozen commit:** `60564b1b49b76ce0b97e46d1de65a7325ef50ba7`
- **Actor:** Operator (`fat.operator@fat.local`)
- **Request:** Two simultaneous `POST /api/cells/matches/fa160000-0000-4000-8000-000000000003/accept` requests
- **Expected:** Exactly one request succeeds and the other returns `409`; no cell is allocated twice.
- **Observed before fix:** Both requests returned `200`.
- **Resolution:** Acceptance now locks the pending match and its target cells inside
  one transaction before reserving cells and changing the match status.
- **Verification:** The 2026-09-11 evidence run recorded one `200`, one `409`,
  and a passing post-race assertion for one `reserved` match owning all 16
  `reserved` cells.
- **Fixture limitation:** A fresh seed and post-run reset remain blocked by the
  existing `grn_line_items → master_materials` foreign-key teardown failure;
  the same run also reports unrelated ledger drift. The CONC-P02 records pass,
  but the full FAT run is not a clean sign-off until that fixture issue is fixed.
- **Password evidence:** Omitted.