# FAT Defect Log

## FAT-2026-09-08-001 — Cell-match acceptance is not single-winner under concurrency

- **Case:** `CONC-P02`
- **Severity:** High — integrity/control failure
- **Frozen candidate:** `FAT-CANDIDATE-2026-09-08`
- **Frozen commit:** `60564b1b49b76ce0b97e46d1de65a7325ef50ba7`
- **Actor:** Operator (`fat.operator@fat.local`)
- **Request:** Two simultaneous `POST /api/cells/matches/fa160000-0000-4000-8000-000000000003/accept` requests
- **Expected:** Exactly one request succeeds and the other returns `409`; no cell is allocated twice.
- **Observed:** Both requests returned `200`.
- **Evidence:** `fat-journey-evidence.json`, two `CONC-P02` request records plus the composite failure record.
- **Fixture state:** The isolated `FAT-E2E-` namespace was reset and verified clean after the run.
- **Password evidence:** Omitted.

This failure is recorded as evidence only. It is not silently reclassified as a pass or changed in the current FAT evidence task.