# B2 — FAT BMS `-0.500` Baseline Investigation

Date: 2026-09-14  
Environment: development database and working tree only  
Material: `fa130000-0000-4000-8000-000000000017` (`FAT-E2E-MATERIAL-BMS`)  
Scope: read-only trace and disposition investigation. No application-code or certification-record mutation was performed for B2.

## Required rule

The `-0.500` row was not intentionally deleted, edited, or adjusted by B2. No acceptance record or compensating repair is claimed in this file.

## Trace timing and hygiene incident

B1 was required to run first. The existing FAT reset implementation contained this broad cleanup predicate:

```sql
DELETE FROM inventory_transactions
WHERE ... OR material_id IN (
  SELECT id FROM master_materials WHERE code LIKE 'FAT-E2E-%'
);
```

The known BMS material is inside that controlled namespace. After the B1 reset/reseed, the previously documented global WIP balance could no longer be found. This is a reset-harness hygiene defect: the reset removed the baseline ledger history while rebuilding the FAT material namespace.

The current database therefore cannot provide a truthful post-reset row-level trace of the original `-0.500` transaction. The historical evidence below is retained without inventing an ID, source document, timestamp, or actor.

## Read-only queries and results

### WIP rows

Query:

```sql
SELECT *
FROM wip_inventory
WHERE material_id = 'fa130000-0000-4000-8000-000000000017';
```

Result after B1 reset: **0 rows**.

Historical evidence from Task 70-F recorded the global exception as:

```text
material_id = fa130000-0000-4000-8000-000000000017
stock_state = wip
balance = -0.500
```

### Ledger decomposition

Query:

```sql
SELECT transaction_type, stock_state, source_document_type,
       source_document_id, source_line_id, lot_id, quantity,
       actor_name, created_at
FROM inventory_transactions
WHERE material_id = 'fa130000-0000-4000-8000-000000000017'
ORDER BY created_at;
```

Current post-reset result:

| Transaction type | Stock state | Source type | Quantity |
|---|---|---|---:|
| `GRN_RECEIPT` | `inspection_pending` | `GRN` | `+2.000` |
| `INSPECTION_RELEASE` | `inspection_pending` | `INSPECTION` | `-2.000` |
| `INSPECTION_ACCEPT` | `available` | `INSPECTION` | `+2.000` |
| `GRN_RECEIPT` | `inspection_pending` | `GRN` | `+1.000` |
| `INSPECTION_RELEASE` | `inspection_pending` | `INSPECTION` | `-1.000` |
| `INSPECTION_REJECT` | `rejected` | `INSPECTION` | `+1.000` |
| `PRODUCTION_ISSUE` | `available` | `MIN` | `-1.000` |

Current source-type totals:

```text
GRN         2 rows   +3.000
INSPECTION  4 rows    0.000
MIN         1 row    -1.000
```

There is no current `stock_state = 'wip'` row for this material.

### Source-document walk

The current source IDs resolve to:

- `GRN fa150000-0000-4000-8000-000000000004`
  - `FAT-E2E-GRN-POSTED-001`
  - posted BMS receipt, quantity `2.000`
  - BMS line `fa150000-0000-4000-8000-000000000006`
  - supplier lot `FAT-E2E-SUP-LOT-BMS-001`
- `GRN fa150000-0000-4000-8000-000000000007`
  - `FAT-E2E-GRN-REJECTED-001`
  - posted rejected receipt, quantity `1.000`
  - BMS line `fa150000-0000-4000-8000-000000000008`
- `INSPECTION fa150000-0000-4000-8000-000000000009`
  - `FAT-E2E-INSP-001`
  - current seeded inspection document; its BMS inspection events net to zero in `inspection_pending` and add one rejected unit.
- `MIN fa1b0000-0000-4000-8000-000000000001`
  - `FAT-E2E-MIN-001`
  - posted production-order material issue
  - line `fa1b0000-0000-4000-8000-000000000002`
  - current seeded line issues `1.000` BMS unit from `available`.

These are the current reseeded documents, not a row-level reconstruction of the deleted historical `-0.500` WIP movement.

### WIP linkage and dependent rows

The post-reset WIP query returned no BMS `wip_inventory` rows. No current BMS WIP issue note, WIP issue line, consumption confirmation, return document, scrap document, adjustment document, or transfer line was found during the dependency walk.

Historical Task 70-E evidence described the `-0.500` as a pre-existing ledger contribution to the BMS stock projection and separately described the isolated WIP row as `issued_qty = 50`, `consumed_qty = 20`, `remaining_qty = 30`. It did not provide the baseline transaction ID or a source-document trace sufficient to reconstruct the original row.

### Historical evidence

The following records explicitly document the pre-reset exception:

- `certification/fat-evidence/task-70-e-read-projections-2026-09-13.md`
  - BMS WIP projection was `29.5` instead of the isolated fixture’s `30`.
- `certification/fat-evidence/task-70-f-phase4-gate-2026-09-13.md`
  - global `stock_state = wip` balance `-0.500`.
- `certification/fat-evidence/task-70-g-returns-2026-09-13.md`
- `certification/fat-evidence/task-70-h-scrap-2026-09-13.md`
- `certification/fat-evidence/task-70-i-adjustments-2026-09-13.md`
- `certification/fat-evidence/task-70-k-phase5-final-gate-2026-09-13.md`

Those records consistently say the baseline predated the Phase 4 fixture runs and was not changed by those runs. None contains enough row-level information to safely recreate it.

## Classification

**STALE / INCORRECT FIXTURE — investigation classification only; disposition incomplete.**

The documented exception was an orphaned or otherwise stale global ledger contribution: it had no matching current `wip_inventory` row in the trace, and its exact source document was not recoverable from the retained evidence. However, the B1 reset removed the original row before this investigation could capture its source identity.

## Disposition

No compensating movement was created. No formal acceptance record is issued. The current zero-balance result is not treated as a valid repair because the row disappeared through broad fixture teardown rather than through a documented ledger-first correction.

## Updated invariant disposition

- The current global nonnegative ledger query has no BMS `-0.500` exception because the original row is absent.
- This is **not** accepted as a clean B2 result.
- The final release gate is blocked until the baseline history is restored from a database checkpoint/auditable source or an owner-approved, documented compensating disposition is performed.

## B2 disposition

**BLOCKED — no legal acceptance or repair can be claimed from the post-reset database state.**