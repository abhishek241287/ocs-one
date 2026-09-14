# Batch 72-C — FAT Migration Evidence Addendum

Date: 2026-09-14

## Scope

The controlled FAT BMS fixture no longer creates a historical MIN or inserts a
material-level-only production issue. After the ordinary FAT masters, BOM,
procurement, and manufacturing fixtures are committed, the seed invokes the
same in-process bulk issue engine used by the HTTP endpoint.

The migration creates the certified production path:

1. controlled warehouse and storage location;
2. posted BMS GRN line linked to a controlled inventory lot;
3. bulk batch and idempotency key;
4. reservation;
5. FIFO allocation;
6. WIP issue note and WIP inventory row;
7. signed available-to-WIP ledger pair.

The HTTP route and FAT seed now share the orchestration in
`artifacts/api-server/src/lib/bulk-issue-engine.ts`. The 72-B MIN deprecation
contract, historical MIN reads/reversal, active-MIN rejection, and UI scope are
unchanged.

## Before / after BMS evidence

The historical B2 baseline remains append-only at
`task-b2-bms-baseline-2026-09-14.md`. It records the former controlled
`FAT-E2E-MIN-001` row and its single material-level production-issue ledger
entry.

The migrated controlled dataset now proves:

| Projection | Result |
| --- | ---: |
| BMS available | 1 |
| BMS WIP | 1 |
| BMS rejected | 1 |
| BMS inspection-pending | 0 |
| FAT inventory transactions | 13 |
| FAT bulk batches | 1 |
| FAT WIP issue notes | 1 |
| FAT-created MIN notes | 0 |

The BMS production issue is represented by a `-1` available
`PRODUCTION_ISSUE` row paired with a `+1` `WIP_RECEIPT` row, both sourced from
the generated WIP issue note. The controlled BMS source lot retains the
remaining quantity needed to make the available projection deterministic.

## Verification

- FAT reset/seed completed twice with identical controlled counts and no
  prefix residuals left by teardown.
- FAT preflight: 67/67.
- FAT read-only smoke: 32/32 twice.
- FAT preflight drift coverage: 9/9 controlled anchor mutations.
- Batch 72-A bulk issue suite: all cases passed.
- Batch 72-B MIN deprecation suite: all cases passed.
- Reservation: 15/15.
- Receiving: 12/12.
- Phase 4 WIP: 17/17 plus invariants.
- Phase 5 final gate: 15/15.
- Phase 6 71-C: 10/10; 71-D: 9/9; 71-F: 9/9; final gate scenarios passed.
- Authz, audit, and configuration workflows completed successfully.
- 70-G: 11/11; 70-H: 10/10; 70-J: 12/12.

The separate 70-I run still reports its pre-existing negative-balance
invariant (`negativeBalances: 1`) while its own fixture teardown is clean; it
is unrelated to the 72-C migration.

Historical FAT evidence files were not rewritten after smoke verification.
No UI changes, deployment, commit, or tag were made.