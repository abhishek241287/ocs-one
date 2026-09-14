# B2 BMS Baseline Trace — 2026-09-14

## Step 1 — Baseline verification

```text
             material_id              |    stock_state     |  sum   
--------------------------------------+--------------------+--------
 fa130000-0000-4000-8000-000000000017 | inspection_pending |  0.000
 fa130000-0000-4000-8000-000000000017 | rejected           |  1.000
 fa130000-0000-4000-8000-000000000017 | available          |  1.000
 fa130000-0000-4000-8000-000000000017 | wip                | -0.500
(4 rows)

```

## Step 2a — WIP inventory rows

```text
 id | production_order_id | material_id | lot_id | issue_id | warehouse_id | location_id | issued_qty | consumed_qty | returned_qty | scrapped_qty | remaining_qty | uom | status | created_at | updated_at | wip_issue_note_id 
----+---------------------+-------------+--------+----------+--------------+-------------+------------+--------------+--------------+--------------+---------------+-----+--------+------------+------------+-------------------
(0 rows)

```

## Step 2b — Full inventory transaction trace

```text
  transaction_type  |    stock_state     | source_document_type |          source_document_id          |            source_line_id            |                lot_id                | quantity |       actor_name       |          created_at           
--------------------+--------------------+----------------------+--------------------------------------+--------------------------------------+--------------------------------------+----------+------------------------+-------------------------------
 GRN_RECEIPT        | inspection_pending | GRN                  | fa150000-0000-4000-8000-000000000004 | fa150000-0000-4000-8000-000000000006 |                                      |    2.000 |                        | 2026-09-13 11:42:56.698147+00
 GRN_RECEIPT        | inspection_pending | GRN                  | fa150000-0000-4000-8000-000000000007 | fa150000-0000-4000-8000-000000000008 |                                      |    1.000 |                        | 2026-09-13 11:42:56.698147+00
 INSPECTION_RELEASE | inspection_pending | INSPECTION           | fa150000-0000-4000-8000-000000000009 | fa150000-0000-4000-8000-000000000006 |                                      |   -2.000 |                        | 2026-09-13 11:42:56.698147+00
 INSPECTION_ACCEPT  | available          | INSPECTION           | fa150000-0000-4000-8000-000000000009 | fa150000-0000-4000-8000-000000000006 |                                      |    2.000 |                        | 2026-09-13 11:42:56.698147+00
 INSPECTION_RELEASE | inspection_pending | INSPECTION           | fa150000-0000-4000-8000-000000000009 | fa150000-0000-4000-8000-000000000008 |                                      |   -1.000 |                        | 2026-09-13 11:42:56.698147+00
 INSPECTION_REJECT  | rejected           | INSPECTION           | fa150000-0000-4000-8000-000000000009 | fa150000-0000-4000-8000-000000000008 |                                      |    1.000 |                        | 2026-09-13 11:42:56.698147+00
 PRODUCTION_ISSUE   | available          | MIN                  | fa1b0000-0000-4000-8000-000000000001 | fa1b0000-0000-4000-8000-000000000002 |                                      |   -1.000 |                        | 2026-09-13 11:42:56.698147+00
 CONSUMPTION        | wip                | CONSUMPTION          | 646257be-a9b2-442b-8ab3-79342d1692e2 | 70d00000-0000-4000-8000-000000000012 | 70d00000-0000-4000-8000-000000000013 |   -0.500 | fat.director@fat.local | 2026-09-13 11:44:24.166144+00
(8 rows)

```

## Step 2c — Distinct source documents

```text
 source_document_type |          source_document_id          
----------------------+--------------------------------------
 CONSUMPTION          | 646257be-a9b2-442b-8ab3-79342d1692e2
 GRN                  | fa150000-0000-4000-8000-000000000004
 GRN                  | fa150000-0000-4000-8000-000000000007
 INSPECTION           | fa150000-0000-4000-8000-000000000009
 MIN                  | fa1b0000-0000-4000-8000-000000000001
(5 rows)

```

## Step 2c — Source document records

### GRN fa150000-0000-4000-8000-000000000004 and fa150000-0000-4000-8000-000000000007

```text
 document_type |                  id                  |     document_number      | status 
---------------+--------------------------------------+--------------------------+--------
 GRN           | fa150000-0000-4000-8000-000000000004 | FAT-E2E-GRN-POSTED-001   | posted
 GRN           | fa150000-0000-4000-8000-000000000007 | FAT-E2E-GRN-REJECTED-001 | posted
(2 rows)

```

### Inspection fa150000-0000-4000-8000-000000000009

```text
 document_type |                  id                  | document_number  |  status  
---------------+--------------------------------------+------------------+----------
 INSPECTION    | fa150000-0000-4000-8000-000000000009 | FAT-E2E-INSP-001 | recorded
(1 row)

```

### MIN fa1b0000-0000-4000-8000-000000000001

```text
 document_type |                  id                  | document_number | status 
---------------+--------------------------------------+-----------------+--------
 MIN           | fa1b0000-0000-4000-8000-000000000001 | FAT-E2E-MIN-001 | posted
(1 row)

```

### Consumption 646257be-a9b2-442b-8ab3-79342d1692e2

```text
 document_type | id | document_number | status 
---------------+----+-----------------+--------
(0 rows)

```

## Step 2d — Evidence grep

```text
```

### Consumption source-ID cross-table lookup (read-only)

The source type is CONSUMPTION, but the direct document lookup returned zero rows. The permitted candidate tables were checked below.

#### wip_issue_notes

```text
 table_name | id | document_number | status 
------------+----+-----------------+--------
(0 rows)

```

#### material_issue_notes

```text
 table_name | id | document_number | status 
------------+----+-----------------+--------
(0 rows)

```

#### consumption_confirmations

```text
 table_name | id | document_number | status 
------------+----+-----------------+--------
(0 rows)

```

#### transfer_requests

```text
 table_name | id | document_number | status 
------------+----+-----------------+--------
(0 rows)

```

#### return_documents

```text
 table_name | id | document_number | status 
------------+----+-----------------+--------
(0 rows)

```

#### scrap_documents

```text
 table_name | id | document_number | status 
------------+----+-----------------+--------
(0 rows)

```

#### inventory_adjustments

```text
 table_name | id | document_number | status 
------------+----+-----------------+--------
(0 rows)

```

## Step 2d — Evidence grep (recursive)

```text
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:63:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:112:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:114:            "material_code": "FAT-E2E-MATERIAL-BMS",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:171:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:238:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:309:              "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:346:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:348:            "material_code": "FAT-E2E-MATERIAL-BMS",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:380:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:393:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:426:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:617:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:619:            "material_code": "FAT-E2E-MATERIAL-BMS",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:670:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:724:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:752:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:753:            "material_code": "FAT-E2E-MATERIAL-BMS",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:768:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:769:            "material_code": "FAT-E2E-MATERIAL-BMS",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:1054:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:1056:            "material_code": "FAT-E2E-MATERIAL-BMS",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:1107:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:1161:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:1189:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:1190:            "material_code": "FAT-E2E-MATERIAL-BMS",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:1205:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:1206:            "material_code": "FAT-E2E-MATERIAL-BMS",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:1491:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:1493:            "material_code": "FAT-E2E-MATERIAL-BMS",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:1544:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:1598:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:1626:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:1627:            "material_code": "FAT-E2E-MATERIAL-BMS",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:1642:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:1643:            "material_code": "FAT-E2E-MATERIAL-BMS",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:1928:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:1930:            "material_code": "FAT-E2E-MATERIAL-BMS",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:1981:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:2035:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:2063:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:2064:            "material_code": "FAT-E2E-MATERIAL-BMS",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:2079:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:2080:            "material_code": "FAT-E2E-MATERIAL-BMS",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:2365:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:2367:            "material_code": "FAT-E2E-MATERIAL-BMS",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:2418:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:2472:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:2500:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:2501:            "material_code": "FAT-E2E-MATERIAL-BMS",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:2516:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:2517:            "material_code": "FAT-E2E-MATERIAL-BMS",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:2773:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:2858:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:3038:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:3271:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:3276:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:3293:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:3298:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:3351:        "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:3372:        "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:3408:        "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:3414:        "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-3-procurement-grn-inventory.json:3420:        "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-journey-evidence.json:1895:            "id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-journey-evidence.json:1896:            "code": "FAT-E2E-MATERIAL-BMS",
certification/fat-evidence/fat-journey-evidence.json:2193:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-journey-evidence.json:2194:            "material_code": "FAT-E2E-MATERIAL-BMS",
certification/fat-evidence/fat-journey-evidence.json:2370:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-journey-evidence.json:2372:            "material_code": "FAT-E2E-MATERIAL-BMS",
certification/fat-evidence/fat-journey-evidence.json:2476:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-journey-evidence.json:2500:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-journey-evidence.json:2501:            "material_code": "FAT-E2E-MATERIAL-BMS",
certification/fat-evidence/fat-journey-evidence.json:2516:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-journey-evidence.json:2517:            "material_code": "FAT-E2E-MATERIAL-BMS",
certification/fat-evidence/fat-journey-evidence.json:11935:                  "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-journey-evidence.json:11936:                  "material_code": "FAT-E2E-MATERIAL-BMS",
certification/fat-evidence/fat-block-2-mas-n04-used-bom.json:47:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-2-mas-n04-used-bom.json:48:            "material_code": "FAT-E2E-MATERIAL-BMS",
certification/fat-evidence/fat-block-2-mas-n04-used-bom.json:90:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-2-mas-n04-used-bom.json:91:            "material_code": "FAT-E2E-MATERIAL-BMS",
certification/fat-evidence/fat-block-2-mas-n04-used-bom.json:318:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-2-mas-n04-used-bom.json:319:            "material_code": "FAT-E2E-MATERIAL-BMS",
certification/fat-evidence/fat-block-2-mas-n04-used-bom.json:360:            "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-2-mas-n04-used-bom.json:361:            "material_code": "FAT-E2E-MATERIAL-BMS",
certification/fat-evidence/fat-block-2-masters-bom.json:483:              "id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-2-masters-bom.json:484:              "code": "FAT-E2E-MATERIAL-BMS",
certification/fat-evidence/fat-block-2-masters-bom.json:1235:              "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-2-masters-bom.json:1236:              "material_code": "FAT-E2E-MATERIAL-BMS",
certification/fat-evidence/fat-block-2-masters-bom.json:1690:              "id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-2-masters-bom.json:1691:              "code": "FAT-E2E-MATERIAL-BMS",
certification/fat-evidence/fat-block-2-masters-bom.json:2442:              "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-2-masters-bom.json:2443:              "material_code": "FAT-E2E-MATERIAL-BMS",
certification/fat-evidence/fat-block-2-masters-bom.json:2897:              "id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-2-masters-bom.json:2898:              "code": "FAT-E2E-MATERIAL-BMS",
certification/fat-evidence/fat-block-2-masters-bom.json:3649:              "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-2-masters-bom.json:3650:              "material_code": "FAT-E2E-MATERIAL-BMS",
certification/fat-evidence/fat-block-2-masters-bom.json:4104:              "id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-2-masters-bom.json:4105:              "code": "FAT-E2E-MATERIAL-BMS",
certification/fat-evidence/fat-block-2-masters-bom.json:4856:              "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-2-masters-bom.json:4857:              "material_code": "FAT-E2E-MATERIAL-BMS",
certification/fat-evidence/fat-block-2-masters-bom.json:5311:              "id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-2-masters-bom.json:5312:              "code": "FAT-E2E-MATERIAL-BMS",
certification/fat-evidence/fat-block-2-masters-bom.json:6063:              "material_id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-2-masters-bom.json:6064:              "material_code": "FAT-E2E-MATERIAL-BMS",
certification/fat-evidence/fat-block-2-masters-bom.json:8076:          "id": "fa130000-0000-4000-8000-000000000017",
certification/fat-evidence/fat-block-2-masters-bom.json:8077:          "code": "FAT-E2E-MATERIAL-BMS",
certification/fat-evidence/task-70-e-read-projections-2026-09-13.md:22:  `material_code = FAT-E2E-MATERIAL-BMS`, `quantity = 51`,
certification/fat-evidence/task-70-f-phase4-gate-2026-09-13.md:23:material_id = fa130000-0000-4000-8000-000000000017
certification/fat-evidence/task-70-h-scrap-2026-09-13.md:77:material_id=fa130000-0000-4000-8000-000000000017
certification/fat-evidence/task-70-i-adjustments-2026-09-13.md:93:material_id=fa130000-0000-4000-8000-000000000017
certification/fat-evidence/sql/phase5-invariants.sql:5:-- The sole global ledger exception is the pre-existing FAT-E2E-MATERIAL-BMS
certification/fat-evidence/sql/phase5-invariants.sql:213:    m.code = 'FAT-E2E-MATERIAL-BMS'
certification/fat-evidence/task-70-k-phase5-final-gate-2026-09-13.md:70:The global ledger check excludes only the documented pre-existing `FAT-E2E-MATERIAL-BMS` WIP balance of `-0.500`. No Phase 5 fixture contributed a negative balance.
```

## B2 CLASSIFICATION — FAT BMS -0.500 = CASE B (stale fixture artifact)

OCS One · 2026-09-14 · Architect classification on the captured trace.

**VERDICT: CASE B — leaked non-seed artifact. The correct baseline is 0.**

The seeded FAT baseline contains no WIP for the BMS material.

### Evidence

1. The seven rows timestamped `2026-09-13 11:42:56` are the deterministic seed: two GRN receipts, the inspection release/accept/reject movements, and the legacy MIN issue. Their FAT-prefixed document IDs are internally consistent: `inspection_pending = 0`, `rejected = 1`, `available = 1`, and `wip = 0`.
2. The eighth row, timestamped `11:44:24`, is the anomaly: `CONSUMPTION | wip | -0.500`, with uppercase `source_document_type = 'CONSUMPTION'`, a random orphaned source document ID, actor `fat.director@fat.local`, and FAT fixture source-line/lot IDs. The source ID is absent from every permitted document table.
3. The certified Phase 4 consumption endpoint could not have produced this row because confirmation requires an active WIP row with sufficient remaining quantity, while `wip_inventory` has zero rows for this material. The row is a direct fixture-harness ledger artifact whose parent document was later cleaned up.
4. The row violates INV-P4-03 by construction: `sum(remaining) = 0` but the WIP ledger balance is `-0.500`.
5. The discriminator is unnecessary. The seven seed rows are one timestamped FAT-prefixed batch; the anomaly is later, orphaned, and convention-breaking. The seed baseline is WIP `0`.

### Disposition — Case B

The orphaned row belongs to the FAT fixture namespace and must be removed by the certified fixture teardown/reseed path, not by a hand delete. No compensating ledger movement is required because the correct baseline is `0`.

The B1 teardown already demonstrated the removal; this classification supplies the missing evidence. No invariant allowance is required after reseed.

### Required next steps

- Reapply the deterministic B1 FAT reset so report-boundary orders are transient report-harness fixtures only and the base seed contains exactly six core FAT orders.
- Execute the reset/teardown path and verify the BMS decomposition contains exactly the seven seed rows, WIP `0`, and no orphan.
- Verify exactly six core `FAT-E2E-ORD-` orders and FAT preflight `67/67`.
- Run the report-order determinism cycle twice: evidence suites, certified reset, six orders, and preflight `67/67`.
- Run the full release gate: invariant pack, Phase 4, Phase 5 suites, 70-K, SS-02, SS-03, SS-04, FAT read-only/MIN smoke, and residue checks.

Boundaries: development database only, no commits, append-only evidence, and no direct edits to ledger rows.
