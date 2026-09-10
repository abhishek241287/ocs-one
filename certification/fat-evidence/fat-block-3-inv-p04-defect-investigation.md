# OCS ONE — INV-P04 Defect Investigation

**Investigation type:** Read-only root-cause analysis  
**FAT block:** Block 3 — Procurement → GRN → Incoming Inspection → Inventory  
**FAT status:** **Blocked / not accepted**  
**Frozen candidate:** `FAT-CANDIDATE-2026-09-08`  
**Application commit:** `60564b1b49b76ce0b97e46d1de65a7325ef50ba7`

## Scope controls

This investigation did not:

- modify application code, schema, routes, UI, or workflows;
- reseed or tear down data;
- rerun `INV-P04`;
- create another transfer; or
- alter the existing FAT-E2E rows or the original Block 3 evidence files.

## Finding

`INV-P04` failed exactly as reported: the transfer created the required `-3` available source movement but did not create a `+3` destination movement in `inventory_transactions`.

The transfer document, cell lot, three cell records, and two cell-lot timeline events were created successfully.

## Exact application path

The route is mounted as:

```text
POST /api/inventory/transfers
```

Relevant frozen-candidate files:

- `artifacts/api-server/src/routes/inventory/index.ts`
  - mounts the transfer router at `/transfers`.
- `artifacts/api-server/src/routes/inventory/transfers.ts`
  - `POST /` is the transfer creation handler.
  - The handler locks the GRN line with `FOR UPDATE`.
  - It calculates available quantity as the sum of `inventory_transactions.quantity` for the GRN line where `stock_state = 'available'`.
  - It inserts one `material_transfers` header.
  - It inserts exactly one inventory ledger row:
    `MATERIAL_TRANSFER_TO_CELL_PROCESSING`, quantity `-qty`, stock state `available`,
    source document type `TRANSFER`, source document ID equal to the new transfer ID,
    and source line ID equal to the GRN line ID.
  - It then inserts the `cell_lots` row, the individual `cells` rows, and the
    `cell_lot_events` rows.

The relevant implementation sequence is:

```text
transfers.ts:382–395  transfer header
transfers.ts:397–408  single negative source ledger row
transfers.ts:410–433  cell lot linked by transfer_id
transfers.ts:435–470  cell records and timeline events
```

There is no destination-ledger insert between the source movement and cell-lot creation.

The frozen schema comments describe the same model: the
`MATERIAL_TRANSFER_TO_CELL_PROCESSING` row is a signed negative movement out of
available inventory, while the transfer document and linked cell lot represent
the movement into Cell Processing.

## Database evidence

### Transfer header

| Field | Value |
|---|---|
| Transfer ID | `2f8abd1a-8739-4bd1-84fe-bf3eb587c094` |
| Transfer number | `TRF-20260910-000001` |
| From | `STORE` |
| To | `CELL_PROCESSING` |
| Material ID | `fa130000-0000-4000-8000-000000000016` |
| GRN ID | `56e17005-eecc-47bd-b996-a408d52e545d` |
| GRN line ID | `01139942-82aa-4fff-be93-7fcba3d505a3` |
| Quantity | `3.000 PCS` |

### Ledger rows for the transfer

Exactly one row is associated with `source_document_id =
2f8abd1a-8739-4bd1-84fe-bf3eb587c094`:

| Transaction ID | Type | Material ID | Quantity | Stock state | Source type | Source document ID | Source line ID |
|---|---|---|---:|---|---|---|---|
| `811596fe-415f-40f9-b863-d1db69be4c28` | `MATERIAL_TRANSFER_TO_CELL_PROCESSING` | `fa130000-0000-4000-8000-000000000016` | `-3.000 PCS` | `available` | `TRANSFER` | `2f8abd1a-8739-4bd1-84fe-bf3eb587c094` | `01139942-82aa-4fff-be93-7fcba3d505a3` |

No `+3` destination row exists for this transfer.

### Complete source-line ledger

The affected GRN line has these four ledger rows:

| Type | Quantity | Stock state | Source document |
|---|---:|---|---|
| `GRN_RECEIPT` | `+8.000` | `inspection_pending` | GRN `56e17005-eecc-47bd-b996-a408d52e545d` |
| `INSPECTION_RELEASE` | `-8.000` | `inspection_pending` | Inspection `7bab3a01-cf76-4cee-bb83-705edce5a679` |
| `INSPECTION_ACCEPT` | `+8.000` | `available` | Inspection `7bab3a01-cf76-4cee-bb83-705edce5a679` |
| `MATERIAL_TRANSFER_TO_CELL_PROCESSING` | `-3.000` | `available` | Transfer `2f8abd1a-8739-4bd1-84fe-bf3eb587c094` |

Therefore, the source GRN line's available balance is:

```text
8 accepted − 3 transferred = 5 available
```

The database projection returns `5.000 PCS` for the source line. The value of
`5` is not a destination available quantity; it is the remaining available
quantity at the source GRN line.

### Destination records

The destination-side records are in the cell domain:

- Cell lot: `b60dea03-0067-41a3-beeb-fb4e097f1f70`
- Lot number: `TRF-20260910-000001`
- `transfer_id`: `2f8abd1a-8739-4bd1-84fe-bf3eb587c094`
- Quantity received: `3`
- Supplier lot: `FAT-E2E-B3-CELL-B3-1789056224422`
- Cells:
  - `CELL-20260910-000001`
  - `CELL-20260910-000002`
  - `CELL-20260910-000003`
- Cell status: `received`
- Timeline events:
  - `lot_received`
  - `cell_records_generated`

## Why the application reports 5

The transfer picker and inventory provenance code calculate available quantity by
grouping signed ledger rows by the original `source_line_id` and
`stock_state = 'available'`. The relevant logic is documented in:

- `artifacts/api-server/src/routes/inventory/transfers.ts`
  - `GET /inventory/cell-stock`
- `artifacts/api-server/src/routes/inventory/stock.ts`
  - stock projection and provenance balance

Neither path expects a destination inventory row. They calculate the remaining
source balance from the accepted receipt and the negative transfer movement.

The destination quantity of `3` is represented by the cell lot and cell records,
not by a destination `inventory_transactions` row.

## Classification

### Root-cause classification

The frozen implementation uses an **intentional alternate ledger model** at the
application level:

1. inventory ledger: one negative source movement;
2. transfer document: the immutable movement document;
3. cell lot and cells: the destination-side Cell Processing records.

This is supported by the frozen schema comments and by the actual route sequence.
Adding a positive `+3` row to the same `available` source-line projection without
defining a separate destination state or domain would incorrectly restore the
source balance from `5` to `8` and make the transfer picker overstate store stock.

### FAT disposition

The approved FAT contract independently requires **one negative source and one
positive destination movement** for `INV-P04`, and the FAT master plan identifies
that requirement as release-blocking. Therefore:

- the implementation behavior is explainable as an intentional alternate model;
- it is still a **nonconformance against the approved FAT acceptance criteria**;
- `INV-P04` remains **FAIL**; and
- Block 3 remains blocked and must not be accepted under the current contract.

This investigation does not invalidate the recorded FAT failure.

## Impact assessment

| Area | Assessment |
|---|---|
| Inventory auditability | The transfer is traceable through the transfer ID, negative ledger row, linked cell lot, supplier lot, cells, and timeline. However, the inventory ledger alone does not show a destination leg. |
| Store-stock reconciliation | The source balance is correct: `8 − 3 = 5`. No unexplained application-vs-ledger delta was observed. |
| Material issue calculations | No immediate double-count was observed. The frozen schema explicitly excludes cells from `PRODUCTION_ISSUE`; cell consumption follows the cell/cell-matching domain. |
| Lot traceability | Preserved. The transfer links to the cell lot, and the cell lot retains the supplier lot number. |
| Future transfers | The remaining source balance of `5` is used for subsequent transfer validation. Future transfers can proceed against that source balance, while each destination lot is represented separately. |
| Manufacturing consumption | The destination cells exist and are available to downstream cell processing. A consumer that reads only `inventory_transactions` will not see destination cell quantity; a consumer using the cell domain will. |
| Reports and KPIs | Inventory reports based only on the raw-material ledger do not include destination cell quantities. Cell reports and dashboards count cell records separately. A unified double-entry report would need an explicit cross-domain rule. |

No evidence was found in this investigation of an immediate incorrect source
stock balance, duplicate movement, orphan transaction, or lost lot traceability.
The material risk is inconsistent interpretation of the ledger boundary and the
absence of a single ledger view containing both legs of the movement.

## Provisional severity

**High release severity; not Critical operational severity.**

The issue blocks the approved FAT gate and leaves the destination leg absent from
the inventory ledger, which is a significant audit-contract and reporting risk.
It is not classified as Critical because the observed source balance, transfer
document, destination cell records, supplier-lot traceability, and reconciliation
were all internally consistent, with no observed stock overstatement or duplicate
movement.

## Recommended remediation

Do not patch the frozen candidate or the FAT fixture.

Before implementation work begins, choose and document one canonical model:

1. **Keep the single-negative-ledger model.** Amend the FAT contract to define the
   Cell Processing destination as the linked transfer/cell-lot/cell domain, and
   add an explicit cross-domain reconciliation assertion:
   `transfer.quantity = cell_lot.quantity_received = generated cell count`.
   The FAT expectation would then no longer require a positive inventory-ledger
   row.

2. **Adopt a two-leg ledger model.** Define a destination ledger state/domain and
   its source-line semantics first. Do not simply add `+3` as another
   `available` row against the original GRN line, because that would make the
   source stock projection report `8` instead of `5`. Update stock, provenance,
   transfer-picker, reconciliation, reporting, and downstream consumption rules
   together.

After the chosen model is approved, update the implementation and the FAT
contract as one change. A controlled retest of `INV-P04` and the affected
inventory reconciliation/report checks will then be required. The current
controlled transfer must not be rerun or altered.
