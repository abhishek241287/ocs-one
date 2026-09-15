# Phase 10 / 74-A — Receipt Valuation Evidence (§5)

**Run date:** 2026-09-15T12:36:00.115Z
**Fixture prefix:** `VAL74A-MU2NNWUL-47E8CA8E`
**Scope:** GRN-line receipt-cost evidence only. No FIFO, WAVG, depletion, valuation report, UI, GL, or value-conservation work is included.

## Verdict and 74-B gate

| Gate | Verdict | Evidence |
|---|---|---|
| H1 — valuation observation writes zero inventory ledger rows | **PASS** | inventory_transactions count 19 before and 19 after the read-only cost + movement observation |
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

PO provenance: `purchase_orders.id=700fcd3c-4633-444d-aec9-e0993a311920`, `purchase_order_lines.id=d980d0e5-0bb2-4611-b5f4-706e7805753a`, PO line `unit_price=17.25`, PO `currency=INR`; the GRN line records `CAPTURED / PO_DEFAULT / 17.25 / INR` rather than relabeling the value as manual.

### Endpoint response excerpts

#### manual CAPTURED

`POST /api/inventory/grns` → HTTP 201
```json
{
  "id": "64d1780f-fb7b-4181-b9e0-b98aa72dd3b9",
  "grn_number": "GRN-20260915-0311",
  "status": "draft",
  "lines": [
    {
      "id": "ebdc8737-f113-4a14-b254-c53c8ca1b9d0",
      "material_id": "94add8d9-aad4-4012-a09c-cd7db44cf4e7",
      "quantity_received": 2.5,
      "receipt_unit_cost": 12.3456,
      "receipt_currency": "INR",
      "receipt_cost_status": "CAPTURED",
      "receipt_cost_source": "MANUAL"
    }
  ]
}
```

`POST /api/inventory/grns/64d1780f-fb7b-4181-b9e0-b98aa72dd3b9/post` → HTTP 200; subsequent `GET /api/inventory/grns/64d1780f-fb7b-4181-b9e0-b98aa72dd3b9` → HTTP 200
```json
{
  "id": "64d1780f-fb7b-4181-b9e0-b98aa72dd3b9",
  "status": "posted",
  "lines": [
    {
      "id": "ebdc8737-f113-4a14-b254-c53c8ca1b9d0",
      "lot_id": "3fc9e302-3425-42e1-9c6a-309e4df8546c",
      "quantity_received": 2.5,
      "receipt_unit_cost": 12.3456,
      "receipt_currency": "INR",
      "receipt_cost_status": "CAPTURED",
      "receipt_cost_source": "MANUAL"
    }
  ]
}
```

`GET /api/inventory/grns/64d1780f-fb7b-4181-b9e0-b98aa72dd3b9/transactions` → HTTP 200
```json
{
  "items": [
    {
      "id": "c83c7abf-f443-4fee-b5a4-a5544c360828",
      "transaction_type": "GRN_RECEIPT",
      "material_id": "94add8d9-aad4-4012-a09c-cd7db44cf4e7",
      "quantity": 2.5,
      "uom": "KG",
      "stock_state": "available",
      "source_document_type": "GRN",
      "source_document_id": "64d1780f-fb7b-4181-b9e0-b98aa72dd3b9",
      "source_line_id": "ebdc8737-f113-4a14-b254-c53c8ca1b9d0",
      "created_by": "daf8728a-f5ce-483b-b2b3-9b27f0d94738",
      "created_at": "2026-09-15T12:35:59.881Z"
    }
  ]
}
```
#### PO_DEFAULT CAPTURED

`POST /api/inventory/grns` → HTTP 201
```json
{
  "id": "923818e4-213a-4153-9779-1234dcb67215",
  "grn_number": "GRN-20260915-0312",
  "status": "draft",
  "lines": [
    {
      "id": "ac14bf1e-0431-414c-b321-2570a6fae5bf",
      "material_id": "94add8d9-aad4-4012-a09c-cd7db44cf4e7",
      "quantity_received": 1.25,
      "receipt_unit_cost": 17.25,
      "receipt_currency": "INR",
      "receipt_cost_status": "CAPTURED",
      "receipt_cost_source": "PO_DEFAULT"
    }
  ]
}
```

`POST /api/inventory/grns/923818e4-213a-4153-9779-1234dcb67215/post` → HTTP 200; subsequent `GET /api/inventory/grns/923818e4-213a-4153-9779-1234dcb67215` → HTTP 200
```json
{
  "id": "923818e4-213a-4153-9779-1234dcb67215",
  "status": "posted",
  "lines": [
    {
      "id": "ac14bf1e-0431-414c-b321-2570a6fae5bf",
      "lot_id": "2b489d2b-a23b-435c-9ab5-98ee656cbacc",
      "quantity_received": 1.25,
      "receipt_unit_cost": 17.25,
      "receipt_currency": "INR",
      "receipt_cost_status": "CAPTURED",
      "receipt_cost_source": "PO_DEFAULT"
    }
  ]
}
```

`GET /api/inventory/grns/923818e4-213a-4153-9779-1234dcb67215/transactions` → HTTP 200
```json
{
  "items": [
    {
      "id": "4254c133-74db-4610-a21a-8b1c8cd97eda",
      "transaction_type": "GRN_RECEIPT",
      "material_id": "94add8d9-aad4-4012-a09c-cd7db44cf4e7",
      "quantity": 1.25,
      "uom": "KG",
      "stock_state": "available",
      "source_document_type": "GRN",
      "source_document_id": "923818e4-213a-4153-9779-1234dcb67215",
      "source_line_id": "ac14bf1e-0431-414c-b321-2570a6fae5bf",
      "created_by": "daf8728a-f5ce-483b-b2b3-9b27f0d94738",
      "created_at": "2026-09-15T12:35:59.946Z"
    }
  ]
}
```
#### MISSING

`POST /api/inventory/grns` → HTTP 201
```json
{
  "id": "50603271-1c87-44b9-901d-600cd105314e",
  "grn_number": "GRN-20260915-0313",
  "status": "draft",
  "lines": [
    {
      "id": "e50d1f72-1243-4959-8144-86e6fb7a1599",
      "material_id": "94add8d9-aad4-4012-a09c-cd7db44cf4e7",
      "quantity_received": 3.75,
      "receipt_unit_cost": null,
      "receipt_currency": null,
      "receipt_cost_status": "MISSING",
      "receipt_cost_source": "NONE"
    }
  ]
}
```

`POST /api/inventory/grns/50603271-1c87-44b9-901d-600cd105314e/post` → HTTP 200; subsequent `GET /api/inventory/grns/50603271-1c87-44b9-901d-600cd105314e` → HTTP 200
```json
{
  "id": "50603271-1c87-44b9-901d-600cd105314e",
  "status": "posted",
  "lines": [
    {
      "id": "e50d1f72-1243-4959-8144-86e6fb7a1599",
      "lot_id": "a8ef6721-d531-41b2-9f13-24cc334ffca3",
      "quantity_received": 3.75,
      "receipt_unit_cost": null,
      "receipt_currency": null,
      "receipt_cost_status": "MISSING",
      "receipt_cost_source": "NONE"
    }
  ]
}
```

`GET /api/inventory/grns/50603271-1c87-44b9-901d-600cd105314e/transactions` → HTTP 200
```json
{
  "items": [
    {
      "id": "9baa3387-e9eb-4de7-986e-fbf6ae028874",
      "transaction_type": "GRN_RECEIPT",
      "material_id": "94add8d9-aad4-4012-a09c-cd7db44cf4e7",
      "quantity": 3.75,
      "uom": "KG",
      "stock_state": "available",
      "source_document_type": "GRN",
      "source_document_id": "50603271-1c87-44b9-901d-600cd105314e",
      "source_line_id": "e50d1f72-1243-4959-8144-86e6fb7a1599",
      "created_by": "daf8728a-f5ce-483b-b2b3-9b27f0d94738",
      "created_at": "2026-09-15T12:36:00.008Z"
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
    "grn_number": "GRN-20260915-0311",
    "grn_header_id": "64d1780f-fb7b-4181-b9e0-b98aa72dd3b9",
    "grn_line_id": "ebdc8737-f113-4a14-b254-c53c8ca1b9d0",
    "quantity_received": "2.500",
    "receipt_unit_cost": "12.3456",
    "receipt_currency": "INR",
    "receipt_cost_status": "CAPTURED",
    "receipt_cost_source": "MANUAL",
    "inventory_lot_id": "3fc9e302-3425-42e1-9c6a-309e4df8546c",
    "lot_number": "LOT-20260915-0289",
    "movement_id": "c83c7abf-f443-4fee-b5a4-a5544c360828",
    "transaction_type": "GRN_RECEIPT",
    "movement_quantity": "2.500",
    "stock_state": "available",
    "source_document_type": "GRN",
    "source_document_id": "64d1780f-fb7b-4181-b9e0-b98aa72dd3b9",
    "source_line_id": "ebdc8737-f113-4a14-b254-c53c8ca1b9d0"
  },
  {
    "grn_number": "GRN-20260915-0312",
    "grn_header_id": "923818e4-213a-4153-9779-1234dcb67215",
    "grn_line_id": "ac14bf1e-0431-414c-b321-2570a6fae5bf",
    "quantity_received": "1.250",
    "receipt_unit_cost": "17.2500",
    "receipt_currency": "INR",
    "receipt_cost_status": "CAPTURED",
    "receipt_cost_source": "PO_DEFAULT",
    "inventory_lot_id": "2b489d2b-a23b-435c-9ab5-98ee656cbacc",
    "lot_number": "LOT-20260915-0290",
    "movement_id": "4254c133-74db-4610-a21a-8b1c8cd97eda",
    "transaction_type": "GRN_RECEIPT",
    "movement_quantity": "1.250",
    "stock_state": "available",
    "source_document_type": "GRN",
    "source_document_id": "923818e4-213a-4153-9779-1234dcb67215",
    "source_line_id": "ac14bf1e-0431-414c-b321-2570a6fae5bf"
  },
  {
    "grn_number": "GRN-20260915-0313",
    "grn_header_id": "50603271-1c87-44b9-901d-600cd105314e",
    "grn_line_id": "e50d1f72-1243-4959-8144-86e6fb7a1599",
    "quantity_received": "3.750",
    "receipt_unit_cost": null,
    "receipt_currency": null,
    "receipt_cost_status": "MISSING",
    "receipt_cost_source": "NONE",
    "inventory_lot_id": "a8ef6721-d531-41b2-9f13-24cc334ffca3",
    "lot_number": "LOT-20260915-0291",
    "movement_id": "9baa3387-e9eb-4de7-986e-fbf6ae028874",
    "transaction_type": "GRN_RECEIPT",
    "movement_quantity": "3.750",
    "stock_state": "available",
    "source_document_type": "GRN",
    "source_document_id": "50603271-1c87-44b9-901d-600cd105314e",
    "source_line_id": "e50d1f72-1243-4959-8144-86e6fb7a1599"
  }
]
```

This proves the receipt document/header, line, internal lot, and movement history remain linked without deriving cost from lot number, material master values, quantity, or movement rows.

## §5.4 Posted immutability

- Re-posting the first posted GRN returned HTTP 409.
- A mutation attempt against `PATCH /api/inventory/grns/64d1780f-fb7b-4181-b9e0-b98aa72dd3b9` returned HTTP 404; no PATCH handler exists.
- The posted line projection before and after the rejected attempts was unchanged:

Before:
```json
{
  "id": "64d1780f-fb7b-4181-b9e0-b98aa72dd3b9",
  "status": "posted",
  "lines": [
    {
      "id": "ebdc8737-f113-4a14-b254-c53c8ca1b9d0",
      "lot_id": "3fc9e302-3425-42e1-9c6a-309e4df8546c",
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
  "id": "64d1780f-fb7b-4181-b9e0-b98aa72dd3b9",
  "status": "posted",
  "lines": [
    {
      "id": "ebdc8737-f113-4a14-b254-c53c8ca1b9d0",
      "lot_id": "3fc9e302-3425-42e1-9c6a-309e4df8546c",
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
| Lines | 5 | 9 | 55.56% |
| Received quantity | 74.5 | 82 | 90.85% |
| Lot quantity (`inventory_lots.total_received_qty`, falling back to line quantity when no lot exists) | 74.5 | 82 | 90.85% |

The three bases are reported separately so a small number of high-quantity or high-lot receipts cannot be hidden by line-count coverage.

## §5.6 H1 zero-write proof and unchanged quantity invariant

The valuation observation selected only GRN-line receipt-cost fields and the signed movement sum, then reread the three GRN detail and transaction endpoints. The `inventory_transactions` row count stayed at **19 → 19**.

```json
[
  {
    "grn_line_id": "ac14bf1e-0431-414c-b321-2570a6fae5bf",
    "quantity_received": "1.250",
    "signed_movement_quantity": "1.250",
    "movement_count": 1
  },
  {
    "grn_line_id": "e50d1f72-1243-4959-8144-86e6fb7a1599",
    "quantity_received": "3.750",
    "signed_movement_quantity": "3.750",
    "movement_count": 1
  },
  {
    "grn_line_id": "ebdc8737-f113-4a14-b254-c53c8ca1b9d0",
    "quantity_received": "2.500",
    "signed_movement_quantity": "2.500",
    "movement_count": 1
  }
]
```

For every certified line, `SUM(inventory_transactions.quantity WHERE source_line_id = grn_line_id AND source_document_type='GRN') = quantity_received`. No valuation-path inventory transaction was written.

## Reproduction

```sh
CERT_BASE_URL=http://localhost:80 pnpm --filter @workspace/api-server run test:phase10-74a
```
