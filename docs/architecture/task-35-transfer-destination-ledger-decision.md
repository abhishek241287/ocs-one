# Task #35 — Transfer Destination Ledger Decision

**Status:** Proposed decision, pending approval  
**Scope:** Development architecture only  
**FAT status:** Unchanged. Block 3 remains stopped; `INV-P04` remains a confirmed
nonconformance under the current approved contract.

## Decision required

The current transfer flow records:

```text
Store inventory ledger: -3 available
Cell Processing destination: transfer document + cell lot + 3 cell records
```

The approved FAT contract currently expects an additional positive destination
inventory-ledger movement. A positive `available` row against the original GRN
line is not safe because it would restore the source projection from `5` to
`8`.

## Downstream consumer review

The current development code has two distinct inventory domains:

| Consumer | Current source of truth | Consequence |
|---|---|---|
| Store/material stock projection | `inventory_transactions`, grouped by material and `stock_state` | A transfer-out row must reduce source available stock. |
| GRN-line provenance | Signed ledger rows grouped by original `source_line_id` | The transferred source line correctly becomes `8 − 3 = 5`. |
| Cell-stock transfer picker | Signed available rows by GRN line | It must not see a destination row that restores source availability. |
| Transfer detail | `material_transfers` joined to `cell_lots` | The transfer and cell lot already form the movement-to-Cell-Processing record. |
| Cell receiving and matching | `cell_lots` and `cells` | Destination quantity and status are represented as cell-domain records. |
| Manufacturing cell allocation/stages | `cells`, matches, lots, and allocation links | Cell consumption is not represented as `PRODUCTION_ISSUE`. |
| Non-cell material issue | Signed `PRODUCTION_ISSUE` / reversal rows | This is a separate raw-material consumption path. |
| Raw-material reports/KPIs | Signed inventory projection | They intentionally report Store/material stock. |
| Cell reports/KPIs | `cells` and `cell_lots` | They independently report cell quantity, grade, supplier, and lot. |
| Product traceability | Manufacturing order, BOM/MIN, GRN, transfer, cell-lot, and product links | Transfer-to-cell traceability is already a cross-domain join. |
| Certification/reconciliation | Signed ledger plus transfer/cell-lot relationships | The contract must define whether destination reconciliation is ledger-only or cross-domain. |

Relevant current implementation areas:

- `artifacts/api-server/src/routes/inventory/transfers.ts`
- `artifacts/api-server/src/routes/inventory/stock.ts`
- `artifacts/api-server/src/lib/material-issue.ts`
- `artifacts/api-server/src/routes/cells/matches.ts`
- `artifacts/api-server/src/routes/manufacturing/allocated-cells.ts`
- `artifacts/api-server/src/routes/reports/inventory.ts`
- `artifacts/ocs-one/src/features/cells/pages/CellReceivingPage.tsx`
- `artifacts/ocs-one/src/features/cells/pages/MaterialTransferDetailPage.tsx`
- `lib/db/src/schema/inventory.ts`
- `lib/db/src/schema/cell-grading.ts`

## Options

### Option A — Preserve the existing model

Keep one signed `-3` source inventory movement. Treat the destination as:

- the immutable material transfer;
- the linked cell lot;
- the generated cells; and
- their timeline, supplier-lot, matching, and manufacturing links.

Update the approved FAT acceptance and reconciliation contract to require:

```text
transfer.quantity
= cell_lot.quantity_received
= generated cell count
```

The inventory ledger remains the Store/material stock authority. The cell domain
remains the Cell Processing destination authority.

### Option B — Add a canonical destination inventory representation

Preserve the `-3` source movement, but introduce a separately defined
destination representation. This must not be a second `available` row keyed to the
original GRN line. It would require explicit semantics for:

- destination stock state and ownership;
- source-line and destination-line genealogy;
- stock and provenance projections;
- the transfer picker;
- cell-lot and cell reconciliation;
- manufacturing consumption;
- reports and KPIs; and
- duplicate/orphan detection.

## Recommendation

**Recommend Option A for the current product architecture.**

Option A is safer because the existing consumers already separate Store/material
stock from Cell Processing stock. The transfer picker, source-line provenance,
raw-material stock projection, cell-lot creation, cell matching, manufacturing
allocation, and reports are all consistent with that boundary.

Option B would create a second quantity authority or require a broad redesign.
Adding a naive positive `available` row would be incorrect and would make the
source picker report stock that has already been transferred. A carefully
designed Option B could be valid later, but it is not a safe narrow fix for
`INV-P04`.

This is a recommendation for approval, not an authorization to change the FAT
contract or application.

## Required implementation and regression gate after approval

If Option A is approved:

1. Update the development contract and acceptance language; do not modify the
   frozen candidate or existing FAT evidence.
2. Preserve atomic transfer creation, source GRN-line locking, the `-3` source
   movement, transfer-to-cell-lot linkage, cell generation, and supplier-lot
   traceability.
3. Add a development regression test proving:
   - source movement is exactly `-3`;
   - destination representation is exactly one transfer, one cell lot, and three
     cells;
   - source available balance is `5`;
   - destination quantity is `3`;
   - supplier-lot traceability is preserved;
   - no duplicate or orphan transactions exist; and
   - cross-domain reconciliation is consistent.
4. Run the regression test on the corrected development candidate.
5. Only after that, create a new controlled FAT retest against the corrected
   candidate.

No implementation, FAT retest, or Block 4 execution is authorized by this
document.
