# Phase 10 / 74-A — Receipt Valuation Evidence (§5)

**Run date:** 2026-09-15T11:11:09.790Z  
**Fixture prefix:** `VAL74A-MU2KMT7Y-F2200772`  
**Scope:** GRN-line receipt-cost evidence only. No FIFO, WAVG, depletion, valuation report, UI, GL, or value-conservation work is included.

## Verdict and 74-B gate

| Gate | Verdict | Evidence |
|---|---|---|
| H1 — valuation observation writes zero inventory ledger rows | **PASS** | inventory_transactions count 16 before and 16 after the read-only cost + movement observation |
| H2 — quantity behavior is unchanged | **PASS** | every certified GRN line has signed movement quantity equal to quantity_received; one GRN_RECEIPT row per line |
| H3 — cost evidence is honest and explicit | **PASS** | manual, PO_DEFAULT, and MISSING examples; zero and partial cost inputs rejected with HTTP 400/400; posted cost unchanged |
| H4 — scope remains bounded | **PASS** | this batch adds only the GRN-line receipt-cost contract, generated contracts, and executable evidence/reporting; no valuation engine or downstream value behavior |

**74-B gate:** **OPEN only after evidence review.** The H1–H4 gate is currently PASS for this isolated run.

## §5.1 Receipt-cost contract

Receipt valuation evidence is stored on `grn_line_items`, not in `inventory_transactions`.

| Field | Contract |
|---|---|
| `receipt_unit_cost` | positive numeric unit cost, scale 4, nullable |
| `receipt_currency` | uppercase three-letter currency, nullable |
| `receipt_cost_status` | exactly `CAPTURED`, `MISSING`, or `LEGACY` |
| `receipt_cost_source` | `MANUAL`, `PO_DEFAULT`, `NONE`, or `LEGACY` |

Zero is rejected; it is not a missing-cost sentinel. Quantity remains the signed-ledger concern.

## §5.2 Three worked examples and endpoint evidence

The receipt document is the `POST /api/inventory/grns` response. Its `id` is the GRN header key; each returned line `id` is the GRN-line key. Posting creates the lot and the signed movement.

| Example | Create | Post | Cost status/source | Unit cost | Currency | Movement rows |
|---|---:|---:|---|---:|---|---:|
 | manual CAPTURED | HTTP 201 | HTTP 200 | CAPTURED / MANUAL | 12.3456 | INR | 1 | 
 | PO_DEFAULT CAPTURED | HTTP 201 | HTTP 200 | CAPTURED / PO_DEFAULT | 17.25 | INR | 1 | 
 | MISSING | HTTP 201 | HTTP 200 | MISSING / NONE | null | null | 1 | 

PO provenance: `purchase_orders.id=14178060-b2e5-4c14-b02f-56d5926d7abd`, `purchase_order_lines.id=3bbafb50-0ac9-42cb-b599-8c20a5dec3b3`, PO line `unit_price=17.25`, PO `currency=INR`; the GRN line records `CAPTURED / PO_DEFAULT / 17.25 / INR` rather than relabeling the value as manual.

### Endpoint response excerpts

#### manual CAPTURED

`POST /api/inventory/grns` → HTTP 201
```json
{
  "id": "aafbdc32-0bb5-4221-944e-73aea3308f64",
  "grn_number": "GRN-20260915-0314",
  "status": "draft",
  "lines": [
    {
      "id": "9641a4d9-e056-48a1-8a99-07609f278788",
      "material_id": "56e9ddaf-cdaa-4076-b06f-150fb58ba70d",
      "quantity_received": 2.5,
      "receipt_unit_cost": 12.3456,
      "receipt_currency": "INR",
      "receipt_cost_status": "CAPTURED",
      "receipt_cost_source": "MANUAL"
    }
  ]
}
```

`POST /api/inventory/grns/aafbdc32-0bb5-4221-944e-73aea3308f64/post` → HTTP 200; subsequent `GET /api/inventory/grns/aafbdc32-0bb5-4221-944e-73aea3308f64` → HTTP 200
```json
{
  "id": "aafbdc32-0bb5-4221-944e-73aea3308f64",
  "status": "posted",
  "lines": [
    {
      "id": "9641a4d9-e056-48a1-8a99-07609f278788",
      "lot_id": "a800c4e2-4b99-4b7f-97b4-2bddcfb68c4d",
      "quantity_received": 2.5,
      "receipt_unit_cost": 12.3456,
      "receipt_currency": "INR",
      "receipt_cost_status": "CAPTURED",
      "receipt_cost_source": "MANUAL"
    }
  ]
}
```

`GET /api/inventory/grns/aafbdc32-0bb5-4221-944e-73aea3308f64/transactions` → HTTP 200
```json
{
  "items": [
    {
      "id": "618ad594-e053-4220-948a-2b4f775e6aa8",
      "transaction_type": "GRN_RECEIPT",
      "material_id": "56e9ddaf-cdaa-4076-b06f-150fb58ba70d",
      "quantity": 2.5,
      "uom": "KG",
      "stock_state": "available",
      "source_document_type": "GRN",
      "source_document_id": "aafbdc32-0bb5-4221-944e-73aea3308f64",
      "source_line_id": "9641a4d9-e056-48a1-8a99-07609f278788",
      "created_by": "911facb4-8001-4d70-a49e-143865ee91d8",
      "created_at": "2026-09-15T11:11:09.590Z"
    }
  ]
}
```
#### PO_DEFAULT CAPTURED

`POST /api/inventory/grns` → HTTP 201
```json
{
  "id": "f1307262-a19e-4a14-aa6d-a7844c7d21ac",
  "grn_number": "GRN-20260915-0315",
  "status": "draft",
  "lines": [
    {
      "id": "c8498240-b2ae-430f-bfc8-423d4e279030",
      "material_id": "56e9ddaf-cdaa-4076-b06f-150fb58ba70d",
      "quantity_received": 1.25,
      "receipt_unit_cost": 17.25,
      "receipt_currency": "INR",
      "receipt_cost_status": "CAPTURED",
      "receipt_cost_source": "PO_DEFAULT"
    }
  ]
}
```

`POST /api/inventory/grns/f1307262-a19e-4a14-aa6d-a7844c7d21ac/post` → HTTP 200; subsequent `GET /api/inventory/grns/f1307262-a19e-4a14-aa6d-a7844c7d21ac` → HTTP 200
```json
{
  "id": "f1307262-a19e-4a14-aa6d-a7844c7d21ac",
  "status": "posted",
  "lines": [
    {
      "id": "c8498240-b2ae-430f-bfc8-423d4e279030",
      "lot_id": "bc66d958-a1fa-4653-a075-efe9ef08b1b1",
      "quantity_received": 1.25,
      "receipt_unit_cost": 17.25,
      "receipt_currency": "INR",
      "receipt_cost_status": "CAPTURED",
      "receipt_cost_source": "PO_DEFAULT"
    }
  ]
}
```

`GET /api/inventory/grns/f1307262-a19e-4a14-aa6d-a7844c7d21ac/transactions` → HTTP 200
```json
{
  "items": [
    {
      "id": "524473a7-2d95-4702-9f1e-e7d3bdec5beb",
      "transaction_type": "GRN_RECEIPT",
      "material_id": "56e9ddaf-cdaa-4076-b06f-150fb58ba70d",
      "quantity": 1.25,
      "uom": "KG",
      "stock_state": "available",
      "source_document_type": "GRN",
      "source_document_id": "f1307262-a19e-4a14-aa6d-a7844c7d21ac",
      "source_line_id": "c8498240-b2ae-430f-bfc8-423d4e279030",
      "created_by": "911facb4-8001-4d70-a49e-143865ee91d8",
      "created_at": "2026-09-15T11:11:09.643Z"
    }
  ]
}
```
#### MISSING

`POST /api/inventory/grns` → HTTP 201
```json
{
  "id": "0bc05827-5657-46c7-a970-5763e15d72e8",
  "grn_number": "GRN-20260915-0316",
  "status": "draft",
  "lines": [
    {
      "id": "accb3f93-2775-42a8-891d-3f30fdb386bd",
      "material_id": "56e9ddaf-cdaa-4076-b06f-150fb58ba70d",
      "quantity_received": 3.75,
      "receipt_unit_cost": null,
      "receipt_currency": null,
      "receipt_cost_status": "MISSING",
      "receipt_cost_source": "NONE"
    }
  ]
}
```

`POST /api/inventory/grns/0bc05827-5657-46c7-a970-5763e15d72e8/post` → HTTP 200; subsequent `GET /api/inventory/grns/0bc05827-5657-46c7-a970-5763e15d72e8` → HTTP 200
```json
{
  "id": "0bc05827-5657-46c7-a970-5763e15d72e8",
  "status": "posted",
  "lines": [
    {
      "id": "accb3f93-2775-42a8-891d-3f30fdb386bd",
      "lot_id": "f612b9f2-19ca-43a8-85af-d196cca428e3",
      "quantity_received": 3.75,
      "receipt_unit_cost": null,
      "receipt_currency": null,
      "receipt_cost_status": "MISSING",
      "receipt_cost_source": "NONE"
    }
  ]
}
```

`GET /api/inventory/grns/0bc05827-5657-46c7-a970-5763e15d72e8/transactions` → HTTP 200
```json
{
  "items": [
    {
      "id": "eeb20542-2659-4f0b-8023-29f6ed740cda",
      "transaction_type": "GRN_RECEIPT",
      "material_id": "56e9ddaf-cdaa-4076-b06f-150fb58ba70d",
      "quantity": 3.75,
      "uom": "KG",
      "stock_state": "available",
      "source_document_type": "GRN",
      "source_document_id": "0bc05827-5657-46c7-a970-5763e15d72e8",
      "source_line_id": "accb3f93-2775-42a8-891d-3f30fdb386bd",
      "created_by": "911facb4-8001-4d70-a49e-143865ee91d8",
      "created_at": "2026-09-15T11:11:09.698Z"
    }
  ]
}
```

## §5.3 Receipt-document → signed movement-history chain

The cited columns are:

`grn_headers.id → grn_line_items.grn_id → inventory_lots.grn_line_id → inventory_transactions.source_line_id`, with `inventory_transactions.source_document_id = grn_headers.id` and `source_document_type = 'GRN'`.

```json
[
  {
    "grn_number": "GRN-20260915-0314",
    "grn_header_id": "aafbdc32-0bb5-4221-944e-73aea3308f64",
    "grn_line_id": "9641a4d9-e056-48a1-8a99-07609f278788",
    "quantity_received": "2.500",
    "receipt_unit_cost": "12.3456",
    "receipt_currency": "INR",
    "receipt_cost_status": "CAPTURED",
    "receipt_cost_source": "MANUAL",
    "inventory_lot_id": "a800c4e2-4b99-4b7f-97b4-2bddcfb68c4d",
    "lot_number": "LOT-20260915-0250",
    "movement_id": "618ad594-e053-4220-948a-2b4f775e6aa8",
    "transaction_type": "GRN_RECEIPT",
    "movement_quantity": "2.500",
    "stock_state": "available",
    "source_document_type": "GRN",
    "source_document_id": "aafbdc32-0bb5-4221-944e-73aea3308f64",
    "source_line_id": "9641a4d9-e056-48a1-8a99-07609f278788"
  },
  {
    "grn_number": "GRN-20260915-0315",
    "grn_header_id": "f1307262-a19e-4a14-aa6d-a7844c7d21ac",
    "grn_line_id": "c8498240-b2ae-430f-bfc8-423d4e279030",
    "quantity_received": "1.250",
    "receipt_unit_cost": "17.2500",
    "receipt_currency": "INR",
    "receipt_cost_status": "CAPTURED",
    "receipt_cost_source": "PO_DEFAULT",
    "inventory_lot_id": "bc66d958-a1fa-4653-a075-efe9ef08b1b1",
    "lot_number": "LOT-20260915-0251",
    "movement_id": "524473a7-2d95-4702-9f1e-e7d3bdec5beb",
    "transaction_type": "GRN_RECEIPT",
    "movement_quantity": "1.250",
    "stock_state": "available",
    "source_document_type": "GRN",
    "source_document_id": "f1307262-a19e-4a14-aa6d-a7844c7d21ac",
    "source_line_id": "c8498240-b2ae-430f-bfc8-423d4e279030"
  },
  {
    "grn_number": "GRN-20260915-0316",
    "grn_header_id": "0bc05827-5657-46c7-a970-5763e15d72e8",
    "grn_line_id": "accb3f93-2775-42a8-891d-3f30fdb386bd",
    "quantity_received": "3.750",
    "receipt_unit_cost": null,
    "receipt_currency": null,
    "receipt_cost_status": "MISSING",
    "receipt_cost_source": "NONE",
    "inventory_lot_id": "f612b9f2-19ca-43a8-85af-d196cca428e3",
    "lot_number": "LOT-20260915-0252",
    "movement_id": "eeb20542-2659-4f0b-8023-29f6ed740cda",
    "transaction_type": "GRN_RECEIPT",
    "movement_quantity": "3.750",
    "stock_state": "available",
    "source_document_type": "GRN",
    "source_document_id": "0bc05827-5657-46c7-a970-5763e15d72e8",
    "source_line_id": "accb3f93-2775-42a8-891d-3f30fdb386bd"
  }
]
```

This proves the receipt document/header, line, internal lot, and movement history remain linked without deriving cost from lot number, material master values, quantity, or movement rows.

## §5.4 Posted immutability

- Re-posting the first posted GRN returned HTTP 409.
- A mutation attempt against `PATCH /api/inventory/grns/aafbdc32-0bb5-4221-944e-73aea3308f64` returned HTTP 404; no PATCH handler exists.
- The posted line projection before and after the rejected attempts was unchanged:

Before:
```json
{
  "id": "aafbdc32-0bb5-4221-944e-73aea3308f64",
  "status": "posted",
  "lines": [
    {
      "id": "9641a4d9-e056-48a1-8a99-07609f278788",
      "lot_id": "a800c4e2-4b99-4b7f-97b4-2bddcfb68c4d",
      "quantity_received": 2.5,
      "receipt_unit_cost": 12.3456,
      "receipt_currency": "INR",
      "receipt_cost_status": "CAPTURED",
      "receipt_cost_source": "MANUAL"
    }
  ]
}
```

After:
```json
{
  "id": "aafbdc32-0bb5-4221-944e-73aea3308f64",
  "status": "posted",
  "lines": [
    {
      "id": "9641a4d9-e056-48a1-8a99-07609f278788",
      "lot_id": "a800c4e2-4b99-4b7f-97b4-2bddcfb68c4d",
      "quantity_received": 2.5,
      "receipt_unit_cost": 12.3456,
      "receipt_currency": "INR",
      "receipt_cost_status": "CAPTURED",
      "receipt_cost_source": "MANUAL"
    }
  ]
}
```

Posted receipt cost is historical evidence, not an editable current price.

## §5.5 Legacy-gap census

Denominator: all posted GRN lines in the development database at certification time. Gap numerator: posted lines whose status is `MISSING` or `LEGACY`.

| Basis | Gap | Total | Gap percentage |
|---|---:|---:|---:|
| Lines | 4 | 6 | 66.67% |
| Received quantity | 70.75 | 74.5 | 94.97% |
| Lot quantity (`inventory_lots.total_received_qty`, falling back to line quantity when no lot exists) | 70.75 | 74.5 | 94.97% |

The three bases are reported separately so a small number of high-quantity or high-lot receipts cannot be hidden by line-count coverage.

## §5.6 H1 zero-write proof and unchanged quantity invariant

The valuation observation selected only GRN-line receipt-cost fields and the signed movement sum, then reread the three GRN detail and transaction endpoints. The `inventory_transactions` row count stayed at **16 → 16**.

```json
[
  {
    "grn_line_id": "9641a4d9-e056-48a1-8a99-07609f278788",
    "quantity_received": "2.500",
    "signed_movement_quantity": "2.500",
    "movement_count": 1
  },
  {
    "grn_line_id": "accb3f93-2775-42a8-891d-3f30fdb386bd",
    "quantity_received": "3.750",
    "signed_movement_quantity": "3.750",
    "movement_count": 1
  },
  {
    "grn_line_id": "c8498240-b2ae-430f-bfc8-423d4e279030",
    "quantity_received": "1.250",
    "signed_movement_quantity": "1.250",
    "movement_count": 1
  }
]
```

For every certified line, `SUM(inventory_transactions.quantity WHERE source_line_id = grn_line_id AND source_document_type='GRN') = quantity_received`. No valuation-path inventory transaction was written.

## Reproduction

```sh
CERT_BASE_URL=http://localhost:80 pnpm --filter @workspace/api-server run test:phase10-74a
```
