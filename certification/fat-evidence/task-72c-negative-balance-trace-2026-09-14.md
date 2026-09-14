# Batch 72-C — Negative Balance Trace and Disposition

Date: 2026-09-14

## Scope and classification

This trace was performed against the development database before any repair.
The result is:

**FIXTURE ARTIFACT — FAT seed provenance was incomplete.**

The certified bulk issue path correctly created a warehouse- and lot-scoped
`PRODUCTION_ISSUE` row. The pre-existing FAT BMS GRN and inspection anchor rows
were seeded without warehouse, location, or lot provenance. Material-level
aggregation therefore hid the mismatch while warehouse-level aggregation
reported a negative balance.

This was not an interrupted 70-I fixture, a leftover non-FAT document, a race,
or an application write-path defect. No application service code was changed.

## Q1 — Location and originating document

The offending pre-repair row was:

| Field | Value |
| --- | --- |
| Material | `FAT-E2E-MATERIAL-BMS` |
| Material ID | `fa130000-0000-4000-8000-000000000017` |
| Warehouse | `FAT-E2E-MAIN-W` |
| Warehouse ID | `fa1b0000-0000-4000-8000-000000000003` |
| Lot | `FAT-E2E-LOT-BMS-001` |
| Lot ID | `fa1b0000-0000-4000-8000-000000000005` |
| Balance | `-1 available` |
| Originating document | WIP issue note `d0de78a2-06ab-4ee1-9e96-232dbdf1f217` |
| Bulk batch | `8b0a13ae-9408-49a4-a5d4-88c210dfe57f` |
| Idempotency key | `FAT-E2E-BULK-BMS-001` |
| Production order | `FAT-E2E-ORD-CLEAN` |

The originating ledger row was:

```text
wip_issue_note,d0de78a2-06ab-4ee1-9e96-232dbdf1f217,
fa150000-0000-4000-8000-000000000006,
fa1b0000-0000-4000-8000-000000000005,
fa1b0000-0000-4000-8000-000000000003,
available,PRODUCTION_ISSUE,-1
```

It was paired with the expected `+1 WIP_RECEIPT` row from the same WIP issue
note.

## Q2 — Why the checks disagreed

### 70-I exact assertion

`artifacts/api-server/src/cert/task70-i-adjustments-suite.ts` asserted:

```sql
SELECT count(*) FROM (
  SELECT material_id, warehouse_id, sum(quantity) AS balance
    FROM inventory_transactions
   WHERE stock_state = 'available'
   GROUP BY material_id, warehouse_id
  HAVING sum(quantity) < 0
) x
```

This returned one row before repair:

```text
material_id                              warehouse_id                             balance
fa130000-0000-4000-8000-000000000017    fa1b0000-0000-4000-8000-000000000003    -1.000
```

### Nearest passing invariant-wall assertion

The nearest available/in-transit negative-balance assertion is 70-J-12:

```sql
SELECT count(*) FROM (
  SELECT material_id, warehouse_id, stock_state, sum(quantity) AS balance
    FROM inventory_transactions
   WHERE material_id = ANY($1::uuid[])
     AND stock_state IN ('available', 'in_transit')
   GROUP BY material_id, warehouse_id, stock_state
  HAVING sum(quantity) < 0
) x
```

That assertion is restricted to the 70-J fixture material IDs. It did not
inspect the FAT BMS material.

The Phase 6 20/20 pack itself does not contain a global negative-balance
assertion. Its I20 check is limited to transactions whose source document is an
import or scan session created by the Phase 6 director fixture. It passed
because the FAT bulk issue is outside that source-document scope.

The material/state query also hid the row:

```sql
SELECT material_id, stock_state, SUM(quantity)::numeric AS balance
  FROM inventory_transactions
 GROUP BY material_id, stock_state
HAVING SUM(quantity) < 0;
```

Before repair it returned no rows because the `+2 available` BMS inspection
anchor had `NULL` warehouse and `NULL` lot, while the `-1 available` bulk issue
had the controlled warehouse and lot.

### Per-lot query

```sql
SELECT material_id, lot_id, stock_state, SUM(quantity)::numeric
  FROM inventory_transactions
 GROUP BY 1, 2, 3
HAVING SUM(quantity) < 0;
```

Before repair it returned:

```text
material_id                              lot_id                                   stock_state          sum
fa130000-0000-4000-8000-000000000017    fa1b0000-0000-4000-8000-000000000005    available            -1.000
fa130000-0000-4000-8000-000000000017    NULL                                     inspection_pending   -3.000
```

The second row was the same provenance defect across the BMS receipt and
inspection-release anchors: the positive and negative inspection-pending rows
were not attached to the controlled lot.

## Full pre-repair BMS decomposition

The BMS ledger contained these relevant source-document groups:

| Source type | Source ID | State | Quantity | Lot / warehouse provenance |
| --- | --- | --- | ---: | --- |
| `GRN` | `fa150000-0000-4000-8000-000000000004` | `inspection_pending` | `+2` | NULL |
| `GRN` | `fa150000-0000-4000-8000-000000000007` | `inspection_pending` | `+1` | NULL |
| `INSPECTION` | `fa150000-0000-4000-8000-000000000009` | `inspection_pending` | `-2` | NULL |
| `INSPECTION` | `fa150000-0000-4000-8000-000000000009` | `available` | `+2` | NULL |
| `INSPECTION` | `fa150000-0000-4000-8000-000000000009` | `inspection_pending` | `-1` | NULL |
| `INSPECTION` | `fa150000-0000-4000-8000-000000000009` | `rejected` | `+1` | NULL |
| `wip_issue_note` | `d0de78a2-06ab-4ee1-9e96-232dbdf1f217` | `available` | `-1` | controlled lot/warehouse |
| `wip_issue_note` | `d0de78a2-06ab-4ee1-9e96-232dbdf1f217` | `wip` | `+1` | controlled lot/warehouse |

The source IDs and transaction quantities prove that the row came from the
72-C bulk issue, while the missing provenance was confined to the manually
seeded FAT ledger anchors.

## Repair

After creating the controlled BMS warehouse, location, and lot, the FAT seed
now attaches those IDs to all BMS GRN and inspection ledger anchors. The
repair is in the FAT certification fixture only:

```text
artifacts/api-server/src/cert/fat-seed.ts
```

The HTTP bulk issue route, bulk issue engine, reservation engine, and inventory
production path were not changed.

## Post-repair reconciliation

All requested scopes were rerun after reseeding:

```sql
SELECT material_id, warehouse_id, SUM(quantity)::numeric AS balance
  FROM inventory_transactions
 WHERE stock_state = 'available'
 GROUP BY material_id, warehouse_id
HAVING SUM(quantity) < 0;
```

Result: zero rows.

```sql
SELECT material_id, warehouse_id, stock_state, SUM(quantity)::numeric AS balance
  FROM inventory_transactions
 WHERE stock_state IN ('available', 'in_transit')
 GROUP BY material_id, warehouse_id, stock_state
HAVING SUM(quantity) < 0;
```

Result: zero rows.

```sql
SELECT material_id, lot_id, stock_state, SUM(quantity)::numeric
  FROM inventory_transactions
 GROUP BY 1, 2, 3
HAVING SUM(quantity) < 0;
```

Result: zero rows.

The repaired BMS projection remains:

| Projection | Result |
| --- | ---: |
| Available | 1 |
| WIP | 1 |
| Rejected | 1 |
| Inspection-pending | 0 |
| Inventory transactions | 13 |
| FAT MIN rows | 0 |

## Closure verification

- 70-I adjustments: **11/11**, residue clean.
- Phase 6 constitutional checks: **7/7**.
- Phase 6 invariant pack: **20/20**.
- Phase 6 regression wall: **PASS**.
- Regression FAT smoke: **32/32**.
- Full Phase 6 gate process: **exit 0**.
- Final FAT preflight after the gate: **67/67**.
- No Phase 7-specific gate script exists in the project certification scripts.

Historical smoke evidence files were restored after the regression wall so this
addendum remains the only new evidence for this trace. No commit, tag,
deployment, or UI change was made.