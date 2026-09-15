# Phase 10 / 74-A — Receipt Valuation Evidence (§5)

**Run date:** 2026-09-15T16:29:55.128Z
**Fixture prefix:** `VAL74A-MU2W0QDR-783A3942`
**Scope:** GRN-line receipt-cost evidence only. No FIFO, WAVG, depletion, valuation report, UI, GL, or value-conservation work is included.

## Verdict and 74-B gate

| Gate | Verdict | Evidence |
|---|---|---|
| H1 — valuation observation writes zero inventory ledger rows | **PASS** | inventory_transactions count 500 before and 500 after the read-only cost + movement observation |
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

PO provenance: `purchase_orders.id=6a0ef08e-2b79-4505-bafa-c56f58f35af1`, `purchase_order_lines.id=b01711fa-1288-49ff-aaeb-88e038ac6a18`, PO line `unit_price=17.25`, PO `currency=INR`; the GRN line records `CAPTURED / PO_DEFAULT / 17.25 / INR` rather than relabeling the value as manual.

### Endpoint response excerpts

#### manual CAPTURED

`POST /api/inventory/grns` → HTTP 201
```json
{
  "id": "b7bc7005-45b2-477a-8ded-5ce31ee3b323",
  "grn_number": "GRN-20260915-0467",
  "status": "draft",
  "lines": [
    {
      "id": "147477e8-4468-4eb2-a165-c5087f249023",
      "material_id": "9f1aa89e-98df-4794-a3c0-45fa8c0a089e",
      "quantity_received": 2.5,
      "receipt_unit_cost": 12.3456,
      "receipt_currency": "INR",
      "receipt_cost_status": "CAPTURED",
      "receipt_cost_source": "MANUAL"
    }
  ]
}
```

`POST /api/inventory/grns/b7bc7005-45b2-477a-8ded-5ce31ee3b323/post` → HTTP 200; subsequent `GET /api/inventory/grns/b7bc7005-45b2-477a-8ded-5ce31ee3b323` → HTTP 200
```json
{
  "id": "b7bc7005-45b2-477a-8ded-5ce31ee3b323",
  "status": "posted",
  "lines": [
    {
      "id": "147477e8-4468-4eb2-a165-c5087f249023",
      "lot_id": "ebab7a95-54c0-40b0-8019-9576a82a9331",
      "quantity_received": 2.5,
      "receipt_unit_cost": 12.3456,
      "receipt_currency": "INR",
      "receipt_cost_status": "CAPTURED",
      "receipt_cost_source": "MANUAL"
    }
  ]
}
```

`GET /api/inventory/grns/b7bc7005-45b2-477a-8ded-5ce31ee3b323/transactions` → HTTP 200
```json
{
  "items": [
    {
      "id": "b3cc6d3b-95a7-435b-adce-7dfce18fa51c",
      "transaction_type": "GRN_RECEIPT",
      "material_id": "9f1aa89e-98df-4794-a3c0-45fa8c0a089e",
      "quantity": 2.5,
      "uom": "KG",
      "stock_state": "available",
      "source_document_type": "GRN",
      "source_document_id": "b7bc7005-45b2-477a-8ded-5ce31ee3b323",
      "source_line_id": "147477e8-4468-4eb2-a165-c5087f249023",
      "created_by": "17cf9e14-3be3-4eea-a73a-db6c9eeaf2ce",
      "created_at": "2026-09-15T16:29:54.906Z"
    }
  ]
}
```
#### PO_DEFAULT CAPTURED

`POST /api/inventory/grns` → HTTP 201
```json
{
  "id": "f71da3cb-c87b-4c5f-a61f-06f42b5d8ee4",
  "grn_number": "GRN-20260915-0468",
  "status": "draft",
  "lines": [
    {
      "id": "25100af7-3dcb-47bf-a8be-a62613f30a84",
      "material_id": "9f1aa89e-98df-4794-a3c0-45fa8c0a089e",
      "quantity_received": 1.25,
      "receipt_unit_cost": 17.25,
      "receipt_currency": "INR",
      "receipt_cost_status": "CAPTURED",
      "receipt_cost_source": "PO_DEFAULT"
    }
  ]
}
```

`POST /api/inventory/grns/f71da3cb-c87b-4c5f-a61f-06f42b5d8ee4/post` → HTTP 200; subsequent `GET /api/inventory/grns/f71da3cb-c87b-4c5f-a61f-06f42b5d8ee4` → HTTP 200
```json
{
  "id": "f71da3cb-c87b-4c5f-a61f-06f42b5d8ee4",
  "status": "posted",
  "lines": [
    {
      "id": "25100af7-3dcb-47bf-a8be-a62613f30a84",
      "lot_id": "995356e7-ba63-40ee-80a1-a234c4c7a6c1",
      "quantity_received": 1.25,
      "receipt_unit_cost": 17.25,
      "receipt_currency": "INR",
      "receipt_cost_status": "CAPTURED",
      "receipt_cost_source": "PO_DEFAULT"
    }
  ]
}
```

`GET /api/inventory/grns/f71da3cb-c87b-4c5f-a61f-06f42b5d8ee4/transactions` → HTTP 200
```json
{
  "items": [
    {
      "id": "9838334b-f93a-484b-887e-42ef2b920958",
      "transaction_type": "GRN_RECEIPT",
      "material_id": "9f1aa89e-98df-4794-a3c0-45fa8c0a089e",
      "quantity": 1.25,
      "uom": "KG",
      "stock_state": "available",
      "source_document_type": "GRN",
      "source_document_id": "f71da3cb-c87b-4c5f-a61f-06f42b5d8ee4",
      "source_line_id": "25100af7-3dcb-47bf-a8be-a62613f30a84",
      "created_by": "17cf9e14-3be3-4eea-a73a-db6c9eeaf2ce",
      "created_at": "2026-09-15T16:29:54.964Z"
    }
  ]
}
```
#### MISSING

`POST /api/inventory/grns` → HTTP 201
```json
{
  "id": "2e9fd81d-b615-47cf-8624-0879fda9a1a6",
  "grn_number": "GRN-20260915-0469",
  "status": "draft",
  "lines": [
    {
      "id": "029524b7-4116-46e1-a3db-aad5f814e4f6",
      "material_id": "9f1aa89e-98df-4794-a3c0-45fa8c0a089e",
      "quantity_received": 3.75,
      "receipt_unit_cost": null,
      "receipt_currency": null,
      "receipt_cost_status": "MISSING",
      "receipt_cost_source": "NONE"
    }
  ]
}
```

`POST /api/inventory/grns/2e9fd81d-b615-47cf-8624-0879fda9a1a6/post` → HTTP 200; subsequent `GET /api/inventory/grns/2e9fd81d-b615-47cf-8624-0879fda9a1a6` → HTTP 200
```json
{
  "id": "2e9fd81d-b615-47cf-8624-0879fda9a1a6",
  "status": "posted",
  "lines": [
    {
      "id": "029524b7-4116-46e1-a3db-aad5f814e4f6",
      "lot_id": "01edd0b1-230c-4e6c-bc25-19626738e291",
      "quantity_received": 3.75,
      "receipt_unit_cost": null,
      "receipt_currency": null,
      "receipt_cost_status": "MISSING",
      "receipt_cost_source": "NONE"
    }
  ]
}
```

`GET /api/inventory/grns/2e9fd81d-b615-47cf-8624-0879fda9a1a6/transactions` → HTTP 200
```json
{
  "items": [
    {
      "id": "1d938747-1e82-4085-8c5e-629a3fd67a2a",
      "transaction_type": "GRN_RECEIPT",
      "material_id": "9f1aa89e-98df-4794-a3c0-45fa8c0a089e",
      "quantity": 3.75,
      "uom": "KG",
      "stock_state": "available",
      "source_document_type": "GRN",
      "source_document_id": "2e9fd81d-b615-47cf-8624-0879fda9a1a6",
      "source_line_id": "029524b7-4116-46e1-a3db-aad5f814e4f6",
      "created_by": "17cf9e14-3be3-4eea-a73a-db6c9eeaf2ce",
      "created_at": "2026-09-15T16:29:55.022Z"
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
    "grn_number": "GRN-20260915-0467",
    "grn_header_id": "b7bc7005-45b2-477a-8ded-5ce31ee3b323",
    "grn_line_id": "147477e8-4468-4eb2-a165-c5087f249023",
    "quantity_received": "2.500",
    "receipt_unit_cost": "12.3456",
    "receipt_currency": "INR",
    "receipt_cost_status": "CAPTURED",
    "receipt_cost_source": "MANUAL",
    "inventory_lot_id": "ebab7a95-54c0-40b0-8019-9576a82a9331",
    "lot_number": "LOT-20260915-0474",
    "movement_id": "b3cc6d3b-95a7-435b-adce-7dfce18fa51c",
    "transaction_type": "GRN_RECEIPT",
    "movement_quantity": "2.500",
    "stock_state": "available",
    "source_document_type": "GRN",
    "source_document_id": "b7bc7005-45b2-477a-8ded-5ce31ee3b323",
    "source_line_id": "147477e8-4468-4eb2-a165-c5087f249023"
  },
  {
    "grn_number": "GRN-20260915-0468",
    "grn_header_id": "f71da3cb-c87b-4c5f-a61f-06f42b5d8ee4",
    "grn_line_id": "25100af7-3dcb-47bf-a8be-a62613f30a84",
    "quantity_received": "1.250",
    "receipt_unit_cost": "17.2500",
    "receipt_currency": "INR",
    "receipt_cost_status": "CAPTURED",
    "receipt_cost_source": "PO_DEFAULT",
    "inventory_lot_id": "995356e7-ba63-40ee-80a1-a234c4c7a6c1",
    "lot_number": "LOT-20260915-0475",
    "movement_id": "9838334b-f93a-484b-887e-42ef2b920958",
    "transaction_type": "GRN_RECEIPT",
    "movement_quantity": "1.250",
    "stock_state": "available",
    "source_document_type": "GRN",
    "source_document_id": "f71da3cb-c87b-4c5f-a61f-06f42b5d8ee4",
    "source_line_id": "25100af7-3dcb-47bf-a8be-a62613f30a84"
  },
  {
    "grn_number": "GRN-20260915-0469",
    "grn_header_id": "2e9fd81d-b615-47cf-8624-0879fda9a1a6",
    "grn_line_id": "029524b7-4116-46e1-a3db-aad5f814e4f6",
    "quantity_received": "3.750",
    "receipt_unit_cost": null,
    "receipt_currency": null,
    "receipt_cost_status": "MISSING",
    "receipt_cost_source": "NONE",
    "inventory_lot_id": "01edd0b1-230c-4e6c-bc25-19626738e291",
    "lot_number": "LOT-20260915-0476",
    "movement_id": "1d938747-1e82-4085-8c5e-629a3fd67a2a",
    "transaction_type": "GRN_RECEIPT",
    "movement_quantity": "3.750",
    "stock_state": "available",
    "source_document_type": "GRN",
    "source_document_id": "2e9fd81d-b615-47cf-8624-0879fda9a1a6",
    "source_line_id": "029524b7-4116-46e1-a3db-aad5f814e4f6"
  }
]
```

This proves the receipt document/header, line, internal lot, and movement history remain linked without deriving cost from lot number, material master values, quantity, or movement rows.

## §5.4 Posted immutability

- Re-posting the first posted GRN returned HTTP 409.
- A mutation attempt against `PATCH /api/inventory/grns/b7bc7005-45b2-477a-8ded-5ce31ee3b323` returned HTTP 404; no PATCH handler exists.
- The posted line projection before and after the rejected attempts was unchanged:

Before:
```json
{
  "id": "b7bc7005-45b2-477a-8ded-5ce31ee3b323",
  "status": "posted",
  "lines": [
    {
      "id": "147477e8-4468-4eb2-a165-c5087f249023",
      "lot_id": "ebab7a95-54c0-40b0-8019-9576a82a9331",
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
  "id": "b7bc7005-45b2-477a-8ded-5ce31ee3b323",
  "status": "posted",
  "lines": [
    {
      "id": "147477e8-4468-4eb2-a165-c5087f249023",
      "lot_id": "ebab7a95-54c0-40b0-8019-9576a82a9331",
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
| Lines | 102 | 128 | 79.69% |
| Received quantity | 2109.5 | 2327 | 90.65% |
| Lot quantity (`inventory_lots.total_received_qty`, falling back to line quantity when no lot exists) | 2109.5 | 2327 | 90.65% |

The three bases are reported separately so a small number of high-quantity or high-lot receipts cannot be hidden by line-count coverage.

## §5.6 H1 zero-write proof and unchanged quantity invariant

The valuation observation selected only GRN-line receipt-cost fields and the signed movement sum, then reread the three GRN detail and transaction endpoints. The `inventory_transactions` row count stayed at **500 → 500**.

```json
[
  {
    "grn_line_id": "029524b7-4116-46e1-a3db-aad5f814e4f6",
    "quantity_received": "3.750",
    "signed_movement_quantity": "3.750",
    "movement_count": 1
  },
  {
    "grn_line_id": "147477e8-4468-4eb2-a165-c5087f249023",
    "quantity_received": "2.500",
    "signed_movement_quantity": "2.500",
    "movement_count": 1
  },
  {
    "grn_line_id": "25100af7-3dcb-47bf-a8be-a62613f30a84",
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
