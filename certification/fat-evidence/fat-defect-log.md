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

## Task 70-F Gap-Closure Note — WIP issue idempotency TOCTOU

- **Status:** Issue discovered and fixed during certification; 70-B remains
  uncertified pending formal sign-off.
- **Affected path:** `POST /api/inventory/reservations/:id/issue`
- **Finding:** The idempotency-key lookup ran before the transaction. Two
  concurrent requests carrying the same new key could both miss the lookup,
  then race to insert. The unique constraint preserved the data invariant, but
  the losing request returned a raw `409` instead of a successful replay.
- **Resolution:** Removed the pre-transaction lookup. The transaction now takes
  `pg_advisory_xact_lock(hashtext(\`wip-issue-idem:${idempotencyKey}\`))` for
  keyed requests, rechecks the existing note under the lock, and returns the
  existing note as a replay. A residual PostgreSQL `23505` fallback handles both
  direct `err.code` and Drizzle-wrapped `err.cause.code` forms.
- **Verification:** Same-key concurrency returned one `201` and one `200` for
  the same issue ID, with exactly one issue note, one issue line, one
  `-available`/`+wip` ledger pair, and one `WIP_ISSUE_CREATED` outbox event.
  Different-key concurrency returned two independent `201` responses.
- **Regression:** Partial issue, sequential replay, `409` over-issue,
  WIP/ledger/allocation/outbox projections, and `409` cancel-after-issue all
  passed. Task 69 remained `15/15` passing.
- **Scope:** No MIN, Task 69 reservation logic, GRN, transfer, stock,
  generated API, frontend, or package files changed. No 70-C work started.