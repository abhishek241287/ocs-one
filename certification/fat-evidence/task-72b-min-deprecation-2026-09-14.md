# Batch 72-B — MIN Deprecation Evidence Addendum

Date: 2026-09-14

## Contract break

`POST /api/manufacturing/orders/:id/material-issues` is retired. Every authenticated
write reaching the MIN handler returns HTTP 410 with this stable payload:

```json
{
  "error": "DEPRECATED",
  "code": "MIN_DEPRECATED",
  "replacement": "POST /api/manufacturing/orders/:id/issues/bulk",
  "message": "Material issue via MIN is retired. Use the certified bulk issue endpoint (reservation → allocation → WIP issue)."
}
```

The response is identical regardless of order state, including an order with a
completed bulk batch. The former `BULK_BATCH_EXISTS` response on MIN creation is
superseded because the retired endpoint cannot create mixed state.

## Preserved behavior

- `GET /material-issues` remains available for historical MIN list reads.
- `GET /material-issues/:minId` remains available for historical MIN detail reads.
- `POST /material-issues/:minId/reverse` remains operational for legacy MIN rows.
- The live direction remains enforced: bulk issue on an active MIN returns
  `409 ACTIVE_MIN_EXISTS`.
- No MIN table semantics or reversal inference rules were changed.
- The FAT MIN fixture is direct-inserted as fixture data; no MIN-create API call is
  used to establish the controlled historical row.

## Evidence

The permanent 72-B suite records:

- B-01 exact 410 deprecation payload
- B-02 historical list and detail reads
- B-03 historical reversal
- B-04 active-MIN rejection by the bulk endpoint

The authorization matrix and FAT MIN-create expectations were updated for the
contract break. The legacy MIN handler implementation remains below the stable
410 route for source-history reference only; it is unreachable at runtime.
