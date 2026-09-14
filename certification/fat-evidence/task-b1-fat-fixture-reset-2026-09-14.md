# B1 — FAT Fixture Reset Determinism

Date: 2026-09-14
Environment: development database and working tree only
Scope: FAT certification harness only; no production data, commits, or direct ledger edits.

## Implementation

- Removed report-boundary order creation from the base FAT seed.
- Added idempotent report-boundary creation to the reports-only harness.
- Existing prefix-scoped `teardownFatDataset()` remains the only cleanup path.

## Before reset — captured pre-reset query output

Command:

```sql
SELECT transaction_type, stock_state, source_document_id, quantity, created_at
FROM inventory_transactions
WHERE material_id='fa130000-0000-4000-8000-000000000017'
ORDER BY created_at;
```

```text
       transaction_type       |    stock_state     |          source_document_id          | quantity |          created_at
------------------------------+--------------------+--------------------------------------+----------+-------------------------------
 GRN_RECEIPT                  | inspection_pending | fa150000-0000-4000-8000-000000000004 |    2.000 | 2026-09-13 11:42:56.698147+00
 GRN_RECEIPT                  | inspection_pending | fa150000-0000-4000-8000-000000000007 |    1.000 | 2026-09-13 11:42:56.698147+00
 INSPECTION_RELEASE            | inspection_pending | fa150000-0000-4000-8000-000000000009 |   -2.000 | 2026-09-13 11:42:56.698147+00
 INSPECTION_ACCEPT             | available          | fa150000-0000-4000-8000-000000000009 |    2.000 | 2026-09-13 11:42:56.698147+00
 INSPECTION_RELEASE            | inspection_pending | fa150000-0000-4000-8000-000000000009 |   -1.000 | 2026-09-13 11:42:56.698147+00
 INSPECTION_REJECT             | rejected           | fa150000-0000-4000-8000-000000000009 |    1.000 | 2026-09-13 11:42:56.698147+00
 PRODUCTION_ISSUE              | available          | fa1b0000-0000-4000-8000-000000000001 |   -1.000 | 2026-09-13 11:42:56.698147+00
 CONSUMPTION                   | wip                | 646257be-a9b2-442b-8ab3-79342d1692e2 |   -0.500 | 2026-09-13 11:44:24.166144+00
(8 rows)
```

## Reset command

```text
FAT_TEST_PASSWORD="$FAT_TEST_PASSWORD" pnpm --filter @workspace/api-server run cert:fat:seed
```

Result: certified teardown plus reseed completed. The seed manifest reported six orders and twelve controlled inventory transactions.

## After reset — BMS decomposition

```text
  transaction_type  |    stock_state     |          source_document_id          | quantity |          created_at          
--------------------+--------------------+--------------------------------------+----------+------------------------------
 GRN_RECEIPT        | inspection_pending | fa150000-0000-4000-8000-000000000004 |    2.000 | 2026-09-14 01:35:47.60361+00
 GRN_RECEIPT        | inspection_pending | fa150000-0000-4000-8000-000000000007 |    1.000 | 2026-09-14 01:35:47.60361+00
 INSPECTION_RELEASE | inspection_pending | fa150000-0000-4000-8000-000000000009 |   -2.000 | 2026-09-14 01:35:47.60361+00
 INSPECTION_ACCEPT  | available          | fa150000-0000-4000-8000-000000000009 |    2.000 | 2026-09-14 01:35:47.60361+00
 INSPECTION_RELEASE | inspection_pending | fa150000-0000-4000-8000-000000000009 |   -1.000 | 2026-09-14 01:35:47.60361+00
 INSPECTION_REJECT  | rejected           | fa150000-0000-4000-8000-000000000009 |    1.000 | 2026-09-14 01:35:47.60361+00
 PRODUCTION_ISSUE   | available          | fa1b0000-0000-4000-8000-000000000001 |   -1.000 | 2026-09-14 01:35:47.60361+00
(7 rows)

```

## After reset — FAT orders

```text
     order_number     |   status    |  current_stage  
----------------------+-------------+-----------------
 FAT-E2E-ORD-CLEAN    | completed   | packing
 FAT-E2E-ORD-COMPLETE | in_progress | quality_control
 FAT-E2E-ORD-PACKED   | completed   | packing
 FAT-E2E-ORD-RACE-ONE | in_progress | charging
 FAT-E2E-ORD-RACE-TWO | in_progress | charging
 FAT-E2E-ORD-REJECT   | in_progress | quality_control
(6 rows)

```

## After reset — FAT preflight

```text

> @workspace/api-server@1.0.0 cert:fat:preflight /home/runner/workspace/artifacts/api-server
> tsx src/cert/fat-seed.ts --action=preflight

{
  "dataset": "OCS One full FAT controlled dataset",
  "namespace": "FAT-E2E-",
  "frozenTag": "FAT-CANDIDATE-2026-09-08",
  "frozenCommit": "60564b1b49b76ce0b97e46d1de65a7325ef50ba7",
  "state": "ready",
  "passwordEvidence": "omitted; supplied only through FAT_TEST_PASSWORD",
  "summary": {
    "passed": 67,
    "failed": 0,
    "total": 67
  },
  "groups": [
    {
      "group": "auth",
      "passed": 31,
      "failed": 0
    },
    {
      "group": "dealer",
      "passed": 3,
      "failed": 0
    },
    {
      "group": "masters",
      "passed": 4,
      "failed": 0
    },
    {
      "group": "bom",
      "passed": 2,
      "failed": 0
    },
    {
      "group": "procurement",
      "passed": 3,
      "failed": 0
    },
    {
      "group": "cells",
      "passed": 6,
      "failed": 0
    },
    {
      "group": "ledger",
      "passed": 3,
      "failed": 0
    },
    {
      "group": "stage",
      "passed": 5,
      "failed": 0
    },
    {
      "group": "genealogy",
      "passed": 3,
      "failed": 0
    },
    {
      "group": "concurrency",
      "passed": 3,
      "failed": 0
    },
    {
      "group": "dispatch",
      "passed": 2,
      "failed": 0
    },
    {
      "group": "registration",
      "passed": 1,
      "failed": 0
    },
    {
      "group": "warranty",
      "passed": 1,
      "failed": 0
    }
  ],
  "failures": []
}
```

## Disposition

The orphaned uppercase `CONSUMPTION` row is gone. The BMS seeded baseline is WIP `0` with exactly the seven deterministic seed rows. No compensating movement was created.

## Determinism cycle 1

### Reports evidence output

```text

> @workspace/api-server@1.0.0 test:fat:reports /home/runner/workspace/artifacts/api-server
> FAT_REPORTS_ONLY=1 tsx src/cert/fat-journey-evidence.ts

{
  "outputDir": "/tmp/b1-determinism-20260914/evidence-1",
  "total": 69,
  "passed": 69,
  "failed": 0,
  "passwordEvidence": "omitted"
}

```

### Orders after reports evidence

```text
       order_number        |   status    |  current_stage  
---------------------------+-------------+-----------------
 FAT-E2E-ORD-CLEAN         | completed   | packing
 FAT-E2E-ORD-COMPLETE      | in_progress | quality_control
 FAT-E2E-ORD-PACKED        | completed   | packing
 FAT-E2E-ORD-RACE-ONE      | in_progress | charging
 FAT-E2E-ORD-RACE-TWO      | in_progress | charging
 FAT-E2E-ORD-REJECT        | in_progress | quality_control
 FAT-E2E-ORD-REPORT-AFTER  | completed   | 
 FAT-E2E-ORD-REPORT-BEFORE | completed   | 
 FAT-E2E-ORD-REPORT-INSIDE | completed   | 
(9 rows)


```

### Certified reset output

```text

> @workspace/api-server@1.0.0 cert:fat:seed /home/runner/workspace/artifacts/api-server
> tsx src/cert/fat-seed.ts --action=seed

{
  "dataset": "OCS One full FAT controlled dataset",
  "namespace": "FAT-E2E-",
  "frozenTag": "FAT-CANDIDATE-2026-09-08",
  "frozenCommit": "60564b1b49b76ce0b97e46d1de65a7325ef50ba7",
  "generatedAt": "2026-09-14T01:36:35.423Z",
  "passwordEvidence": "omitted; supplied only through FAT_TEST_PASSWORD",
  "manifestPath": "/home/runner/workspace/certification/fat-fixture-manifest.json",
  "ids": {
    "owner": "fa110000-0000-4000-8000-000000000001",
    "director": "fa110000-0000-4000-8000-000000000002",
    "supervisor": "fa110000-0000-4000-8000-000000000003",
    "operator": "fa110000-0000-4000-8000-000000000004",
    "viewer": "fa110000-0000-4000-8000-000000000005",
    "dealerUser": "fa110000-0000-4000-8000-000000000006",
    "dealer": "fa120000-0000-4000-8000-000000000001",
    "productCategory": "fa130000-0000-4000-8000-000000000001",
    "productWorkflow": "fa130000-0000-4000-8000-000000000002",
    "model": "fa130000-0000-4000-8000-000000000011",
    "cellMaster": "fa130000-0000-4000-8000-000000000003",
    "bmsMaster": "fa130000-0000-4000-8000-000000000004",
    "supplier": "fa130000-0000-4000-8000-000000000015",
    "cellMaterial": "fa130000-0000-4000-8000-000000000016",
    "bmsMaterial": "fa130000-0000-4000-8000-000000000017",
    "approvedBom": "fa140000-0000-4000-8000-000000000001",
    "postedGrn": "fa150000-0000-4000-8000-000000000004",
    "inspection": "fa150000-0000-4000-8000-000000000009",
    "cellTransfer": "fa150000-0000-4000-8000-000000000013",
    "cellLot": "fa160000-0000-4000-8000-000000000001",
    "allocatedMatch": "fa160000-0000-4000-8000-000000000002",
    "pendingMatch": "fa160000-0000-4000-8000-000000000003",
    "cleanOrder": "fa180000-0000-4000-8000-000000000001",
    "rejectOrder": "fa180000-0000-4000-8000-000000000003",
    "chargerRaceOne": "fa180000-0000-4000-8000-000000000004",
    "chargerRaceTwo": "fa180000-0000-4000-8000-000000000005",
    "completionBoundaryOrder": "fa180000-0000-4000-8000-000000000006",
    "reportBeforeOrder": "fa180000-0000-4000-8000-000000000007",
    "reportInsideOrder": "fa180000-0000-4000-8000-000000000008",
    "reportAfterOrder": "fa180000-0000-4000-8000-000000000009",
    "traceabilityProduct": "fa190000-0000-4000-8000-000000000001",
    "readyForPackingProduct": "fa190000-0000-4000-8000-000000000002",
    "nonPackableProduct": "fa190000-0000-4000-8000-000000000003",
    "dispatch": "fa1a0000-0000-4000-8000-000000000001",
    "registration": "fa1a0000-0000-4000-8000-000000000003",
    "warranty": "fa1a0000-0000-4000-8000-000000000004"
  },
  "recordCounts": {
    "users": 6,
    "masters": 1,
    "materials": 2,
    "bomLines": 2,
    "grnLines": 2,
    "inventoryTransactions": 12,
    "cells": 64,
    "stages": 54,
    "genealogyRows": 5,
    "traceEvents": 3
  },
  "residualCounts": {
    "users": 6,
    "dealers": 1,
    "masters": 1,
    "materials": 2,
    "boms": 1,
    "grns": 4,
    "inspections": 2,
    "transfers": 1,
    "lots": 1,
    "cells": 64,
    "matches": 2,
    "orders": 6,
    "chargers": 3,
    "products": 3,
    "dispatches": 1,
    "registrations": 1,
    "warranties": 1
  },
  "expectations": {
    "datasetDate": "2026-09-08",
    "warrantyEndDate": "2031-09-08",
    "roles": [
      "owner",
      "director",
      "supervisor",
      "operator",
      "viewer",
      "dealer"
    ],
    "roleNames": {
      "owner": "FAT E2E Owner",
      "director": "FAT E2E Director",
      "supervisor": "FAT E2E Supervisor",
      "operator": "FAT E2E Operator",
      "viewer": "FAT E2E Viewer",
      "dealer": "FAT E2E Dealer"
    },
    "stages": {
      "canonical": [
        "cell_allocation",
        "assembly",
        "compression",
        "bms_allocation",
        "bms_programming",
        "charging",
        "testing",
        "quality_control",
        "packing"
      ],
      "perOrder": 9,
      "orderCount": 6
    },
    "ledger": {
      "cellAvailableUnits": 64,
      "bmsReceivedUnits": 2,
      "bmsAvailableUnits": 1,
      "transactionCount": 12,
      "grnLines": 2,
      "inspectionCount": 1,
      "inspectionLines": 2,
      "transferCount": 1
    },
    "cells": {
      "total": 64,
      "acceptable": 60,
      "rejected": 4,
      "gradeACount": 48,
      "allocated": 16,
      "matchCount": 2,
      "matchItems": 16,
      "lotEventCount": 2,
      "correctionAnchorCount": 2
    },
    "genealogy": {
      "cleanOrderRows": 5,
      "completionOrderRows": 1,
      "productRows": 5,
      "productEventCount": 3
    },
    "fulfillment": {
      "dealerSnapshot": {
        "code": "FAT-E2E-DLR-A",
        "name": "FAT E2E Dealer Alpha",
        "address": "1 FAT E2E Industrial Estate, Bengaluru",
        "gst": "29FATE2E0001Z5",
        "contact": "FAT Dealer Desk",
        "mobile": "9000000001"
      },
      "customerName": "FAT E2E Customer",
      "dispatchItemCount": 1,
      "warrantyPeriodMonths": 60
    },
    "concurrency": {
      "chargerReadyCount": 1,
      "raceOrderCount": 2,
      "pendingMatchCount": 1,
      "pendingMatchItems": 16
    },
    "reports": {
      "productionDateWindow": {
        "from": "2026-09-08T00:00:00.000Z",
        "to": "2026-09-08T23:59:59.999Z",
        "boundaryOrders": {
          "before": {
            "id": "fa180000-0000-4000-8000-000000000007",
            "createdAt": "2026-09-07T23:59:59.999Z"
          },
          "inside": {
            "id": "fa180000-0000-4000-8000-000000000008",
            "createdAt": "2026-09-08T12:00:00.000Z"
          },
          "after": {
            "id": "fa180000-0000-4000-8000-000000000009",
            "createdAt": "2026-09-09T00:00:00.000Z"
          }
        }
      }
    },
    "states": {
      "bom": "approved",
      "grn": "posted",
      "allocatedMatch": "allocated",
      "pendingMatch": "draft",
      "cleanOrder": "completed",
      "raceOrder": "in_progress",
      "raceStage": "charging"
    },
    "verification": {
      "recordCounts": {
        "users": 6,
        "masters": 1,
        "materials": 2,
        "bomLines": 2,
        "grnLines": 2,
        "inventoryTransactions": 12,
        "cells": 64,
        "stages": 54,
        "genealogyRows": 5,
        "traceEvents": 3
      }
    }
  }
}

```

### Orders after reset

```text
     order_number     |   status    |  current_stage  
----------------------+-------------+-----------------
 FAT-E2E-ORD-CLEAN    | completed   | packing
 FAT-E2E-ORD-COMPLETE | in_progress | quality_control
 FAT-E2E-ORD-PACKED   | completed   | packing
 FAT-E2E-ORD-RACE-ONE | in_progress | charging
 FAT-E2E-ORD-RACE-TWO | in_progress | charging
 FAT-E2E-ORD-REJECT   | in_progress | quality_control
(6 rows)


```

### Preflight output

```text

> @workspace/api-server@1.0.0 cert:fat:preflight /home/runner/workspace/artifacts/api-server
> tsx src/cert/fat-seed.ts --action=preflight

{
  "dataset": "OCS One full FAT controlled dataset",
  "namespace": "FAT-E2E-",
  "frozenTag": "FAT-CANDIDATE-2026-09-08",
  "frozenCommit": "60564b1b49b76ce0b97e46d1de65a7325ef50ba7",
  "state": "ready",
  "passwordEvidence": "omitted; supplied only through FAT_TEST_PASSWORD",
  "summary": {
    "passed": 67,
    "failed": 0,
    "total": 67
  },
  "groups": [
    {
      "group": "auth",
      "passed": 31,
      "failed": 0
    },
    {
      "group": "dealer",
      "passed": 3,
      "failed": 0
    },
    {
      "group": "masters",
      "passed": 4,
      "failed": 0
    },
    {
      "group": "bom",
      "passed": 2,
      "failed": 0
    },
    {
      "group": "procurement",
      "passed": 3,
      "failed": 0
    },
    {
      "group": "cells",
      "passed": 6,
      "failed": 0
    },
    {
      "group": "ledger",
      "passed": 3,
      "failed": 0
    },
    {
      "group": "stage",
      "passed": 5,
      "failed": 0
    },
    {
      "group": "genealogy",
      "passed": 3,
      "failed": 0
    },
    {
      "group": "concurrency",
      "passed": 3,
      "failed": 0
    },
    {
      "group": "dispatch",
      "passed": 2,
      "failed": 0
    },
    {
      "group": "registration",
      "passed": 1,
      "failed": 0
    },
    {
      "group": "warranty",
      "passed": 1,
      "failed": 0
    }
  ],
  "failures": []
}

```

## Determinism cycle 2

### Reports evidence output

```text

> @workspace/api-server@1.0.0 test:fat:reports /home/runner/workspace/artifacts/api-server
> FAT_REPORTS_ONLY=1 tsx src/cert/fat-journey-evidence.ts

{
  "outputDir": "/tmp/b1-determinism-20260914/evidence-2",
  "total": 69,
  "passed": 69,
  "failed": 0,
  "passwordEvidence": "omitted"
}

```

### Orders after reports evidence

```text
       order_number        |   status    |  current_stage  
---------------------------+-------------+-----------------
 FAT-E2E-ORD-CLEAN         | completed   | packing
 FAT-E2E-ORD-COMPLETE      | in_progress | quality_control
 FAT-E2E-ORD-PACKED        | completed   | packing
 FAT-E2E-ORD-RACE-ONE      | in_progress | charging
 FAT-E2E-ORD-RACE-TWO      | in_progress | charging
 FAT-E2E-ORD-REJECT        | in_progress | quality_control
 FAT-E2E-ORD-REPORT-AFTER  | completed   | 
 FAT-E2E-ORD-REPORT-BEFORE | completed   | 
 FAT-E2E-ORD-REPORT-INSIDE | completed   | 
(9 rows)


```

### Certified reset output

```text

> @workspace/api-server@1.0.0 cert:fat:seed /home/runner/workspace/artifacts/api-server
> tsx src/cert/fat-seed.ts --action=seed

{
  "dataset": "OCS One full FAT controlled dataset",
  "namespace": "FAT-E2E-",
  "frozenTag": "FAT-CANDIDATE-2026-09-08",
  "frozenCommit": "60564b1b49b76ce0b97e46d1de65a7325ef50ba7",
  "generatedAt": "2026-09-14T01:36:42.549Z",
  "passwordEvidence": "omitted; supplied only through FAT_TEST_PASSWORD",
  "manifestPath": "/home/runner/workspace/certification/fat-fixture-manifest.json",
  "ids": {
    "owner": "fa110000-0000-4000-8000-000000000001",
    "director": "fa110000-0000-4000-8000-000000000002",
    "supervisor": "fa110000-0000-4000-8000-000000000003",
    "operator": "fa110000-0000-4000-8000-000000000004",
    "viewer": "fa110000-0000-4000-8000-000000000005",
    "dealerUser": "fa110000-0000-4000-8000-000000000006",
    "dealer": "fa120000-0000-4000-8000-000000000001",
    "productCategory": "fa130000-0000-4000-8000-000000000001",
    "productWorkflow": "fa130000-0000-4000-8000-000000000002",
    "model": "fa130000-0000-4000-8000-000000000011",
    "cellMaster": "fa130000-0000-4000-8000-000000000003",
    "bmsMaster": "fa130000-0000-4000-8000-000000000004",
    "supplier": "fa130000-0000-4000-8000-000000000015",
    "cellMaterial": "fa130000-0000-4000-8000-000000000016",
    "bmsMaterial": "fa130000-0000-4000-8000-000000000017",
    "approvedBom": "fa140000-0000-4000-8000-000000000001",
    "postedGrn": "fa150000-0000-4000-8000-000000000004",
    "inspection": "fa150000-0000-4000-8000-000000000009",
    "cellTransfer": "fa150000-0000-4000-8000-000000000013",
    "cellLot": "fa160000-0000-4000-8000-000000000001",
    "allocatedMatch": "fa160000-0000-4000-8000-000000000002",
    "pendingMatch": "fa160000-0000-4000-8000-000000000003",
    "cleanOrder": "fa180000-0000-4000-8000-000000000001",
    "rejectOrder": "fa180000-0000-4000-8000-000000000003",
    "chargerRaceOne": "fa180000-0000-4000-8000-000000000004",
    "chargerRaceTwo": "fa180000-0000-4000-8000-000000000005",
    "completionBoundaryOrder": "fa180000-0000-4000-8000-000000000006",
    "reportBeforeOrder": "fa180000-0000-4000-8000-000000000007",
    "reportInsideOrder": "fa180000-0000-4000-8000-000000000008",
    "reportAfterOrder": "fa180000-0000-4000-8000-000000000009",
    "traceabilityProduct": "fa190000-0000-4000-8000-000000000001",
    "readyForPackingProduct": "fa190000-0000-4000-8000-000000000002",
    "nonPackableProduct": "fa190000-0000-4000-8000-000000000003",
    "dispatch": "fa1a0000-0000-4000-8000-000000000001",
    "registration": "fa1a0000-0000-4000-8000-000000000003",
    "warranty": "fa1a0000-0000-4000-8000-000000000004"
  },
  "recordCounts": {
    "users": 6,
    "masters": 1,
    "materials": 2,
    "bomLines": 2,
    "grnLines": 2,
    "inventoryTransactions": 12,
    "cells": 64,
    "stages": 54,
    "genealogyRows": 5,
    "traceEvents": 3
  },
  "residualCounts": {
    "users": 6,
    "dealers": 1,
    "masters": 1,
    "materials": 2,
    "boms": 1,
    "grns": 4,
    "inspections": 2,
    "transfers": 1,
    "lots": 1,
    "cells": 64,
    "matches": 2,
    "orders": 6,
    "chargers": 3,
    "products": 3,
    "dispatches": 1,
    "registrations": 1,
    "warranties": 1
  },
  "expectations": {
    "datasetDate": "2026-09-08",
    "warrantyEndDate": "2031-09-08",
    "roles": [
      "owner",
      "director",
      "supervisor",
      "operator",
      "viewer",
      "dealer"
    ],
    "roleNames": {
      "owner": "FAT E2E Owner",
      "director": "FAT E2E Director",
      "supervisor": "FAT E2E Supervisor",
      "operator": "FAT E2E Operator",
      "viewer": "FAT E2E Viewer",
      "dealer": "FAT E2E Dealer"
    },
    "stages": {
      "canonical": [
        "cell_allocation",
        "assembly",
        "compression",
        "bms_allocation",
        "bms_programming",
        "charging",
        "testing",
        "quality_control",
        "packing"
      ],
      "perOrder": 9,
      "orderCount": 6
    },
    "ledger": {
      "cellAvailableUnits": 64,
      "bmsReceivedUnits": 2,
      "bmsAvailableUnits": 1,
      "transactionCount": 12,
      "grnLines": 2,
      "inspectionCount": 1,
      "inspectionLines": 2,
      "transferCount": 1
    },
    "cells": {
      "total": 64,
      "acceptable": 60,
      "rejected": 4,
      "gradeACount": 48,
      "allocated": 16,
      "matchCount": 2,
      "matchItems": 16,
      "lotEventCount": 2,
      "correctionAnchorCount": 2
    },
    "genealogy": {
      "cleanOrderRows": 5,
      "completionOrderRows": 1,
      "productRows": 5,
      "productEventCount": 3
    },
    "fulfillment": {
      "dealerSnapshot": {
        "code": "FAT-E2E-DLR-A",
        "name": "FAT E2E Dealer Alpha",
        "address": "1 FAT E2E Industrial Estate, Bengaluru",
        "gst": "29FATE2E0001Z5",
        "contact": "FAT Dealer Desk",
        "mobile": "9000000001"
      },
      "customerName": "FAT E2E Customer",
      "dispatchItemCount": 1,
      "warrantyPeriodMonths": 60
    },
    "concurrency": {
      "chargerReadyCount": 1,
      "raceOrderCount": 2,
      "pendingMatchCount": 1,
      "pendingMatchItems": 16
    },
    "reports": {
      "productionDateWindow": {
        "from": "2026-09-08T00:00:00.000Z",
        "to": "2026-09-08T23:59:59.999Z",
        "boundaryOrders": {
          "before": {
            "id": "fa180000-0000-4000-8000-000000000007",
            "createdAt": "2026-09-07T23:59:59.999Z"
          },
          "inside": {
            "id": "fa180000-0000-4000-8000-000000000008",
            "createdAt": "2026-09-08T12:00:00.000Z"
          },
          "after": {
            "id": "fa180000-0000-4000-8000-000000000009",
            "createdAt": "2026-09-09T00:00:00.000Z"
          }
        }
      }
    },
    "states": {
      "bom": "approved",
      "grn": "posted",
      "allocatedMatch": "allocated",
      "pendingMatch": "draft",
      "cleanOrder": "completed",
      "raceOrder": "in_progress",
      "raceStage": "charging"
    },
    "verification": {
      "recordCounts": {
        "users": 6,
        "masters": 1,
        "materials": 2,
        "bomLines": 2,
        "grnLines": 2,
        "inventoryTransactions": 12,
        "cells": 64,
        "stages": 54,
        "genealogyRows": 5,
        "traceEvents": 3
      }
    }
  }
}

```

### Orders after reset

```text
     order_number     |   status    |  current_stage  
----------------------+-------------+-----------------
 FAT-E2E-ORD-CLEAN    | completed   | packing
 FAT-E2E-ORD-COMPLETE | in_progress | quality_control
 FAT-E2E-ORD-PACKED   | completed   | packing
 FAT-E2E-ORD-RACE-ONE | in_progress | charging
 FAT-E2E-ORD-RACE-TWO | in_progress | charging
 FAT-E2E-ORD-REJECT   | in_progress | quality_control
(6 rows)


```

### Preflight output

```text

> @workspace/api-server@1.0.0 cert:fat:preflight /home/runner/workspace/artifacts/api-server
> tsx src/cert/fat-seed.ts --action=preflight

{
  "dataset": "OCS One full FAT controlled dataset",
  "namespace": "FAT-E2E-",
  "frozenTag": "FAT-CANDIDATE-2026-09-08",
  "frozenCommit": "60564b1b49b76ce0b97e46d1de65a7325ef50ba7",
  "state": "ready",
  "passwordEvidence": "omitted; supplied only through FAT_TEST_PASSWORD",
  "summary": {
    "passed": 67,
    "failed": 0,
    "total": 67
  },
  "groups": [
    {
      "group": "auth",
      "passed": 31,
      "failed": 0
    },
    {
      "group": "dealer",
      "passed": 3,
      "failed": 0
    },
    {
      "group": "masters",
      "passed": 4,
      "failed": 0
    },
    {
      "group": "bom",
      "passed": 2,
      "failed": 0
    },
    {
      "group": "procurement",
      "passed": 3,
      "failed": 0
    },
    {
      "group": "cells",
      "passed": 6,
      "failed": 0
    },
    {
      "group": "ledger",
      "passed": 3,
      "failed": 0
    },
    {
      "group": "stage",
      "passed": 5,
      "failed": 0
    },
    {
      "group": "genealogy",
      "passed": 3,
      "failed": 0
    },
    {
      "group": "concurrency",
      "passed": 3,
      "failed": 0
    },
    {
      "group": "dispatch",
      "passed": 2,
      "failed": 0
    },
    {
      "group": "registration",
      "passed": 1,
      "failed": 0
    },
    {
      "group": "warranty",
      "passed": 1,
      "failed": 0
    }
  ],
  "failures": []
}

```

## Final release-gate verification after B1 reseed

Date: 2026-09-14

- Report-boundary determinism: two isolated reports-only runs passed **69/69** each. Each run created the three transient boundary orders; each certified reset returned to six core orders and preflight **67/67**.
- Final FAT read-only/MIN smoke: **32/32**.
- Final invariant SQL pack after removing the obsolete BMS exception: **20/20**, zero violations.
- Final BMS decomposition: **7** deterministic rows, **0** WIP balance, **0** orphaned `CONSUMPTION` rows.
- Final FAT order state: **6** core orders, **0** report-boundary orders.
- Final residue: **0** P5 materials, **0** 70G materials, **0** 70H materials, **0** 70I materials, **0** 70J materials, **0** 70J categories.

The BMS `-0.500` baseline exception is superseded by the clean certified reseed. No compensating ledger movement was created.
