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