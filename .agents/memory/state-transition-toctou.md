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

**Generic master PATCH (createMasterRouter):** when a `beforeWrite` hook enforces
immutability/identity rules, the handler wraps the whole PATCH in `db.transaction`,
locks the target row `.for("update")`, and threads that tx into the hook ctx so the
hook's integrity reads run on the same locked snapshot. Plain masters (no hook) skip
the tx. **Caveat — a FOR UPDATE row lock only serialises writers that lock the SAME
row.** A check-on-table-A-then-write race (e.g. material immutability checks
grn_line_items/inventory_transactions, but a concurrent GRN/inventory writer inserts
into those tables without touching the material row) is NOT closed by locking the
material row alone. To fully close such cross-writer races the OTHER writer must also
`SELECT … FOR UPDATE` the material row before inserting. The duplicate-active-link
rule is independently hard-guarded by a partial UNIQUE index (23505 → 409 via
`handlePgWriteError`), including on the `/:id/status` re-activate path.
