# Task 70-D — Issue Reversal & Consumption Adjustment Evidence Note

**Date:** 2026-09-13  
**Environment:** Development database, working tree only  
**Certification status:** Focused runtime evidence complete; not self-certified

## Contract interpretation

- Reversal is full-note only and is allowed only while every owned WIP row is
  unconsumed.
- Reversal writes compensating `-wip / +available` ledger rows with the bounded
  source-document label `ISSUE_REVERSAL`.
- `allocated_qty` is cumulative in the live schema, so reversal decrements only
  `issued_qty`; it does not increase `allocated_qty`. This preserves
  `reserved_qty >= allocated_qty >= issued_qty`.
- `INV-P4-05` requires, per reservation,
  `SUM(active allocation quantities) = allocated_qty - issued_qty` and
  `SUM(issued allocation quantities) = issued_qty`.
- Reversed WIP rows set `status = reversed`, `issued_qty = 0`, and
  `remaining_qty = 0`, while the immutable ledger retains the original issue and
  compensating history.
- Consumption adjustment is annotation-only: confirmed → adjusted, with no
  physical ledger mutation.

## Runtime evidence

- Full issue → reverse returned `200`; the response showed `reversed`,
  reservation `fully_allocated`, `allocated_qty = 1`, and `issued_qty = 0`.
- Double reverse returned `409`.
- Re-issuing the same restored reservation returned `201`.
- Reverse after a confirmed partial consumption returned
  `409 WIP_PARTIALLY_CONSUMED`.
- Parallel reverse returned exactly `1 × 200 / 1 × 409`.
- Confirmed consumption → adjustment returned `200` with appended reason,
  `adjusted_by`, and `adjusted_at`.
- Repeated adjustment returned `409`; adjustment of a draft returned `409`.
- Operator and viewer writes returned `403`; anonymous write returned `401`;
  viewer read returned `200`.
- MIN read smoke returned `200`.

## Database evidence

- Successful reversal ledger pairs were exactly:
  `PRODUCTION_ISSUE_REVERSAL -1 wip` and `PRODUCTION_ISSUE_REVERSAL +1 available`.
- Reversed WIP rows ended with `issued_qty = 0` and `remaining_qty = 0`.
- Reversed allocations returned to `active`.
- `INV-P4-05` spot check on the successful parallel-reversal winner:
  active allocation sum `1` = `allocated_qty 1 - issued_qty 0`, and issued
  allocation sum `0` = `issued_qty 0`.
- The adjustment confirmation had one physical ledger row before and after
  adjustment; adjustment added no ledger row.
- Outbox contained one `WIP_ISSUE_REVERSED` per successful reversal and one
  `CONSUMPTION_ADJUSTED`.
- Temporary reservations, WIP rows, confirmations, lots, GRNs, ledger rows,
  outbox rows, warehouse, and location were removed after verification.

## Standing regressions

- Task 69 reservation regression: `15 PASS / 0 FAIL / 0 MANUAL`.
- Library and API TypeScript checks passed.
- `git diff --check` passed.
- SS-02/SS-03 results were carried forward from the certified 70-C run; 70-D
  changes do not modify those authz/audit paths.

## Complete focused rerun

The focused journey was rerun with a fresh isolated warehouse, GRN lines, lots,
and available-ledger fixtures. The following direct outcomes were captured:

- Happy reversal: `200`; the immediate response returned reservation
  `fully_allocated`, `allocated_qty = 1`, `issued_qty = 0`; allocations were
  `active`; the WIP row was `reversed` with `remaining_qty = 0`.
- Reversal ledger counts: exactly one `-1 wip` row and one `+1 available` row,
  both `PRODUCTION_ISSUE_REVERSAL` with `ISSUE_REVERSAL`; exactly one
  `WIP_ISSUE_REVERSED` outbox event.
- `INV-P4-01/03`: post-reversal WIP remaining `0.000`, signed WIP ledger
  projection `0.000`, and the issue document's available movement net `0.000`.
- `INV-P4-05`: active allocation sum `1.000`, `allocated_qty - issued_qty =
  1.000`, issued allocation sum `0`, and `issued_qty = 0`.
- Reverse-after-consumption: `409 WIP_PARTIALLY_CONSUMED`; second reversal:
  `409`; parallel reversal: exactly `1 × 200 / 1 × 409`.
- Parallel reversal mutation counts: exactly two compensating ledger rows, one
  reversed outbox event, and one reversed WIP row with zero remaining.
- Same-reservation loop closure: re-issue after reversal returned `201`.
- Confirmed adjustment: `200`, status `adjusted`; total physical ledger rows
  remained `1` (no row added by adjustment); `CONSUMPTION_ADJUSTED` count `1`.
- Draft adjustment and second adjustment: both `409`.
- Authorization: operator write `403`, viewer write `403`, anonymous write
  `401`, viewer read `200`.
- Adjustment authorization: operator adjust `403`, viewer adjust `403`, and
  anonymous adjust `401`.
- MIN smoke: `200`.
- Residue after teardown: notes `0`, reservations `0`, confirmations `0`, lots
  `0`.

The rerun made no application edits. Library and API typechecks passed again.
The enum push and API restart had already completed successfully before the
focused journey; no generated API, frontend, 70-B, MIN, GRN, transfer, or stock
files were changed.

The one reporting-SQL alias error encountered during verification was in the
temporary harness (`transaction_type` needed the `inventory_transactions`
alias); it was corrected in the harness and was not an application defect.