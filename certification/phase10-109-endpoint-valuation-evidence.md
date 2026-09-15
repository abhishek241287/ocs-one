# Phase 10 / Task 109 — Endpoint Valuation Evidence

**Run:** 2026-09-15T13:01:00.108Z
**Fixture prefix:** `VAL109-MU2OK1XF-D34706D3`
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
    "requestId": "bd7375b8-2a14-4ea9-b2b6-6c8ec9a11072",
    "receiveBefore": [
      {
        "id": "e063d808-b26c-4be2-957b-6360af554287",
        "quantity": "-6.000",
        "value_status": "CAPTURED",
        "value_amount": "-60.0000000",
        "movement_id": "63750435-b7bb-4808-8b87-a325bd8e7900",
        "source_document_type": "transfer_request",
        "source_document_id": "bd7375b8-2a14-4ea9-b2b6-6c8ec9a11072",
        "source_line_id": "706e1068-061b-41d0-8182-aad6cce7142a"
      }
    ],
    "receiveAfter": [
      {
        "id": "e063d808-b26c-4be2-957b-6360af554287",
        "quantity": "-6.000",
        "value_status": "CAPTURED",
        "value_amount": "-60.0000000",
        "movement_id": "63750435-b7bb-4808-8b87-a325bd8e7900",
        "source_document_type": "transfer_request",
        "source_document_id": "bd7375b8-2a14-4ea9-b2b6-6c8ec9a11072",
        "source_line_id": "706e1068-061b-41d0-8182-aad6cce7142a"
      }
    ],
    "receiveMovements": [
      {
        "id": "2734b5b7-0ebf-497d-a8ba-8d7ef74c7669",
        "transaction_type": "TRANSFER_IN",
        "quantity": "6.000",
        "source_line_id": "706e1068-061b-41d0-8182-aad6cce7142a"
      },
      {
        "id": "3c2d44d7-b968-4165-9def-29294391ec73",
        "transaction_type": "TRANSFER_OUT",
        "quantity": "6.000",
        "source_line_id": "706e1068-061b-41d0-8182-aad6cce7142a"
      },
      {
        "id": "63750435-b7bb-4808-8b87-a325bd8e7900",
        "transaction_type": "TRANSFER_OUT",
        "quantity": "-6.000",
        "source_line_id": "706e1068-061b-41d0-8182-aad6cce7142a"
      },
      {
        "id": "fc348639-c50b-4781-9a22-7b556fa42e73",
        "transaction_type": "TRANSFER_IN",
        "quantity": "-6.000",
        "source_line_id": "706e1068-061b-41d0-8182-aad6cce7142a"
      }
    ]
  },
  "reject": {
    "requestId": "dfa2c2f9-fab5-4234-bd9c-5f1ca38d8fbd",
    "rejectDepletions": [
      {
        "quantity": "-5.000",
        "value_status": "CAPTURED",
        "value_amount": "-55.0000000",
        "movement_id": "15222a2b-a136-48f5-8193-930e618b2ecb",
        "source_document_type": "transfer_request",
        "source_document_id": "dfa2c2f9-fab5-4234-bd9c-5f1ca38d8fbd",
        "source_line_id": "44bdad63-d896-47b1-9a0e-838a9d08e511",
        "transaction_type": "TRANSFER_OUT",
        "movement_quantity": "-5.000"
      },
      {
        "quantity": "5.000",
        "value_status": "CAPTURED",
        "value_amount": "55.0000000",
        "movement_id": "5abc8c5f-8ff9-4431-9ed8-b8e81b753919",
        "source_document_type": "transfer_request",
        "source_document_id": "dfa2c2f9-fab5-4234-bd9c-5f1ca38d8fbd",
        "source_line_id": "44bdad63-d896-47b1-9a0e-838a9d08e511",
        "transaction_type": "TRANSFER_REVERSAL",
        "movement_quantity": "-5.000"
      }
    ],
    "rejectLayer": {
      "remaining_quantity": "7.000"
    }
  },
  "capturedReturn": {
    "issueId": "9949c4cf-8907-4ed6-900a-7406f3af262d",
    "returnId": "9136ba84-c8df-4779-bb2d-d40049e6b2f9",
    "capturedReturnDepletions": [
      {
        "quantity": "-10.000",
        "value_status": "CAPTURED",
        "value_amount": "-120.0000000",
        "movement_id": "3da39ed1-8208-4f8c-a720-9440dc72f94a",
        "source_document_type": "wip_issue_note",
        "source_document_id": "9949c4cf-8907-4ed6-900a-7406f3af262d",
        "source_line_id": "d3166b7a-3b4f-46ba-962e-51a0c2e91c92"
      },
      {
        "quantity": "4.000",
        "value_status": "CAPTURED",
        "value_amount": "48.0000000",
        "movement_id": "d1e8482a-4b88-4793-ab57-26eafe1ade6a",
        "source_document_type": "return_document",
        "source_document_id": "9136ba84-c8df-4779-bb2d-d40049e6b2f9",
        "source_line_id": "d3166b7a-3b4f-46ba-962e-51a0c2e91c92"
      }
    ],
    "capturedReturnLayer": {
      "remaining_quantity": "4.000"
    }
  },
  "unknownReturn": {
    "issueId": "cbe54ea7-d7bc-43be-b9ef-710f3f03a14e",
    "returnId": "df073c7b-a1ab-4b77-b7a8-639cad80598d",
    "unknownReturnDepletions": [
      {
        "quantity": "-8.000",
        "value_status": "UNKNOWN",
        "unit_cost": null,
        "value_amount": null,
        "currency": null,
        "movement_id": "bcf13548-b9a5-4e79-97c8-4e484ef2f619",
        "source_document_type": "wip_issue_note",
        "source_document_id": "cbe54ea7-d7bc-43be-b9ef-710f3f03a14e",
        "source_line_id": "956a31c1-4fc0-47b4-ba02-1a5e7541276c"
      },
      {
        "quantity": "3.000",
        "value_status": "UNKNOWN",
        "unit_cost": null,
        "value_amount": null,
        "currency": null,
        "movement_id": "a7810e34-8922-41cf-9978-c1a1812a31a4",
        "source_document_type": "return_document",
        "source_document_id": "df073c7b-a1ab-4b77-b7a8-639cad80598d",
        "source_line_id": "956a31c1-4fc0-47b4-ba02-1a5e7541276c"
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
