---
name: State-transition TOCTOU in correction/mutation routes
description: Why status guards in correction/state-change routes must be re-checked inside the transaction under a row lock, not only pre-transaction.
---

When a route validates an entity's status and then mutates it (e.g. the cell grade
correction route: only `approved`/`rejected` cells may be corrected, never
`reserved`/`allocated` production-committed ones), the status check MUST be repeated
INSIDE the DB transaction under a `SELECT … FOR UPDATE` row lock. A pre-transaction
read is only a fast-fail for UX.

**Why:** a status read outside the transaction is a TOCTOU window — the row can flip
between the check and the write (another request reserves/allocates the cell), letting
an invalid mutation through and corrupting genealogy/snapshot consistency.

**How to apply:** inside the tx, re-select the row `.for("update")`, re-validate the
status, and throw a small typed error (e.g. `CorrectionStateError(status, message)`)
to roll back; catch it outside the tx and map to the HTTP status. The same row lock
serialises concurrent mutations of that row, which also makes append-only `sequence =
max(sequence)+1` assignment collision-free (no duplicate-sequence 23505 races).
