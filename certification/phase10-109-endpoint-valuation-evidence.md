# Phase 10 / Task 109 — Endpoint Valuation Evidence

**Run:** 2026-09-15T16:30:21.085Z
**Fixture prefix:** `VAL109-MU2W1A1S-D043B048`
**Verdict:** PASS

## Scope

This batch certifies the HTTP transfer-request and WIP-return lifecycles against the
valuation value twin. Receipt fixtures were created and posted through
`POST /api/inventory/grns` and `POST /api/inventory/grns/:id/post`. Transfer,
reservation/WIP issue, and return state changes were performed through their existing
inventory endpoints. SQL was used only for isolated fixture setup, evidence queries,
and teardown.

## Gates

- **VAL-109-01 — receive does not double-deplete: PASS.**
  Transfer issue created one captured `-6 @ 10` depletion; full receive added four
  signed quantity movements but no second valuation depletion.
- **VAL-109-02 — rejected transfer restores only outstanding quantity: PASS.**
  A 5-unit issue from a 7-unit receipt restored exactly `+5 @ 11`, leaving 7
  available in the valuation layer and preserving the transfer document citation.
- **VAL-109-03 — captured partial WIP return: PASS.**
  A 10-unit `@ 12` WIP issue followed by a 4-unit return produced `-120` and
  `+48` captured value, leaving 4 units.
- **VAL-109-04 — UNKNOWN partial WIP return: PASS.**
  An 8-unit MISSING-cost issue followed by a 3-unit return preserved UNKNOWN status,
  null unit cost, null value amount, and null currency on both depletion rows.

## Evidence

```json
{
  "receive": {
    "requestId": "d8dc597d-a080-4017-93b1-e37515cb21a2",
    "receiveBefore": [
      {
        "id": "c31395a6-cd3f-4110-8080-e71fe897adb0",
        "quantity": "-6.000",
        "value_status": "CAPTURED",
        "value_amount": "-60.0000000",
        "movement_id": "5286adb4-1bb2-4970-9938-f33adff9325d",
        "source_document_type": "transfer_request",
        "source_document_id": "d8dc597d-a080-4017-93b1-e37515cb21a2",
        "source_line_id": "8653de2e-bf26-4e40-ab47-bd6c5154ddd8"
      }
    ],
    "receiveAfter": [
      {
        "id": "c31395a6-cd3f-4110-8080-e71fe897adb0",
        "quantity": "-6.000",
        "value_status": "CAPTURED",
        "value_amount": "-60.0000000",
        "movement_id": "5286adb4-1bb2-4970-9938-f33adff9325d",
        "source_document_type": "transfer_request",
        "source_document_id": "d8dc597d-a080-4017-93b1-e37515cb21a2",
        "source_line_id": "8653de2e-bf26-4e40-ab47-bd6c5154ddd8"
      }
    ],
    "receiveMovements": [
      {
        "id": "2810cde2-508c-407e-85ba-855ad3f277d9",
        "transaction_type": "TRANSFER_IN",
        "quantity": "-6.000",
        "source_line_id": "8653de2e-bf26-4e40-ab47-bd6c5154ddd8"
      },
      {
        "id": "5286adb4-1bb2-4970-9938-f33adff9325d",
        "transaction_type": "TRANSFER_OUT",
        "quantity": "-6.000",
        "source_line_id": "8653de2e-bf26-4e40-ab47-bd6c5154ddd8"
      },
      {
        "id": "bb025ad5-df39-4249-b452-b55cf093bdf4",
        "transaction_type": "TRANSFER_OUT",
        "quantity": "6.000",
        "source_line_id": "8653de2e-bf26-4e40-ab47-bd6c5154ddd8"
      },
      {
        "id": "eec23389-350a-4999-b83d-0fb9122d7189",
        "transaction_type": "TRANSFER_IN",
        "quantity": "6.000",
        "source_line_id": "8653de2e-bf26-4e40-ab47-bd6c5154ddd8"
      }
    ]
  },
  "reject": {
    "requestId": "af2bf0c4-7d0c-42d6-9be9-2b0de185d822",
    "rejectDepletions": [
      {
        "quantity": "-5.000",
        "value_status": "CAPTURED",
        "value_amount": "-55.0000000",
        "movement_id": "3bd24c65-3ba8-4b79-aa76-c0aed04305c6",
        "source_document_type": "transfer_request",
        "source_document_id": "af2bf0c4-7d0c-42d6-9be9-2b0de185d822",
        "source_line_id": "7660580d-353a-42cf-aedc-fe9f89203ed8",
        "transaction_type": "TRANSFER_OUT",
        "movement_quantity": "-5.000"
      },
      {
        "quantity": "5.000",
        "value_status": "CAPTURED",
        "value_amount": "55.0000000",
        "movement_id": "1bda9788-680f-4c03-ae19-63893d9caa6b",
        "source_document_type": "transfer_request",
        "source_document_id": "af2bf0c4-7d0c-42d6-9be9-2b0de185d822",
        "source_line_id": "7660580d-353a-42cf-aedc-fe9f89203ed8",
        "transaction_type": "TRANSFER_REVERSAL",
        "movement_quantity": "-5.000"
      }
    ],
    "rejectLayer": {
      "remaining_quantity": "7.000"
    }
  },
  "capturedReturn": {
    "issueId": "dcc7c4b2-c3a5-4c48-bfa6-bffc3f42767c",
    "returnId": "3ea6096f-f942-46ab-88f1-67010bb48b29",
    "capturedReturnDepletions": [
      {
        "quantity": "-10.000",
        "value_status": "CAPTURED",
        "value_amount": "-120.0000000",
        "movement_id": "4a3532bc-15bd-4b5f-a456-961494fc5684",
        "source_document_type": "wip_issue_note",
        "source_document_id": "dcc7c4b2-c3a5-4c48-bfa6-bffc3f42767c",
        "source_line_id": "a0c7e16d-e6bc-4aaf-9dc2-6baa9be5ad53"
      },
      {
        "quantity": "4.000",
        "value_status": "CAPTURED",
        "value_amount": "48.0000000",
        "movement_id": "e7740860-0e0c-4525-b677-824f41939cca",
        "source_document_type": "return_document",
        "source_document_id": "3ea6096f-f942-46ab-88f1-67010bb48b29",
        "source_line_id": "a0c7e16d-e6bc-4aaf-9dc2-6baa9be5ad53"
      }
    ],
    "capturedReturnLayer": {
      "remaining_quantity": "4.000"
    }
  },
  "unknownReturn": {
    "issueId": "939a16b6-0635-488d-8240-1aa328ed74fe",
    "returnId": "47767988-def4-4bcf-ba32-3fd9c10bbfcf",
    "unknownReturnDepletions": [
      {
        "quantity": "-8.000",
        "value_status": "UNKNOWN",
        "unit_cost": null,
        "value_amount": null,
        "currency": null,
        "movement_id": "9a81a1df-e35e-4c71-b620-05cad779c8cc",
        "source_document_type": "wip_issue_note",
        "source_document_id": "939a16b6-0635-488d-8240-1aa328ed74fe",
        "source_line_id": "d69c2439-b820-4e4d-b066-d9c960353039"
      },
      {
        "quantity": "3.000",
        "value_status": "UNKNOWN",
        "unit_cost": null,
        "value_amount": null,
        "currency": null,
        "movement_id": "00101044-bce6-4a7d-9243-cbeffa2133f0",
        "source_document_type": "return_document",
        "source_document_id": "47767988-def4-4bcf-ba32-3fd9c10bbfcf",
        "source_line_id": "d69c2439-b820-4e4d-b066-d9c960353039"
      }
    ],
    "unknownReturnLayer": {
      "remaining_quantity": "3.000",
      "receipt_cost_status": "MISSING"
    }
  }
}
```

Checks: **4 passed, 0 failed**.
