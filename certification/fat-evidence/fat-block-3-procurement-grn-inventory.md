# FAT Block 3 — Procurement → GRN → Incoming Inspection → Inventory

- Frozen candidate: FAT-CANDIDATE-2026-09-08
- Frozen commit: 60564b1b49b76ce0b97e46d1de65a7325ef50ba7
- Scope only: INV-P01–INV-P06 and INV-N01–INV-N05; Blocks 4–12 not executed; Task #32 not executed.
- Application code modified: **no**; reseed/teardown: **no**.

## Results

| Case | Result set |
|---|---|
| INV-P01 | PASS |
| INV-P02 | PASS |
| INV-P03 | PASS |
| INV-P04 | FAIL |
| INV-P05 | PASS |
| INV-N01 | PASS |
| INV-N02 | PASS |
| INV-N03 | PASS, DATA SETUP REQUIRED |
| INV-N04 | PASS |
| INV-N05 | PASS |
| INV-P06 | PASS |

Evidence assertions: **66 PASS / 1 FAIL / 1 DATA SETUP REQUIRED**.

## Controlled identifiers

```json
{
  "grn_id": "56e17005-eecc-47bd-b996-a408d52e545d",
  "grn_line_ids": [
    "01139942-82aa-4fff-be93-7fcba3d505a3",
    "849805e9-07ea-4ace-b1f9-9c41dd073f69"
  ],
  "inspection_id": "7bab3a01-cf76-4cee-bb83-705edce5a679",
  "transfer_id": "2f8abd1a-8739-4bd1-84fe-bf3eb587c094",
  "cell_lot_id": "b60dea03-0067-41a3-beeb-fb4e097f1f70",
  "supplier_lot_numbers": [
    "FAT-E2E-B3-CELL-B3-1789056224422",
    "FAT-E2E-B3-BMS-B3-1789056224422"
  ]
}
```

## Integrity findings

- GRN receipt movements: exactly one per new GRN line; repost returned 409 with no new receipt.
- Inspection: both pending lines covered once; available, inspection_pending, and rejected remain distinct ledger states.
- Transfer: **FAIL** — one negative source movement was created and cell-lot/timeline traceability was preserved, but the required positive destination ledger movement was absent in the frozen candidate. No application fix was applied.
- Reconciliation mismatches: 0; duplicate groups: 0; orphan rows: 0.
- New cell line available balance: 5 (8 accepted − 3 transferred).

## Defect

- **INV-P04:** The frozen transfer implementation wrote only the `-3` available source movement. It did not write the required `+3` destination ledger movement. The affected case was stopped and no application code was changed during FAT.

## Evidence files

- `certification/fat-evidence/fat-block-3-procurement-grn-inventory.json` — sanitized requests/responses, IDs, ledger movements, state, audit, and timeline evidence.
- `certification/fat-evidence/fat-block-3-procurement-grn-inventory.md` — this summary.

## Fixture state

Approved FAT-E2E data was reused without reseeding or teardown. New Block 3 controlled rows remain in the database for traceability.
