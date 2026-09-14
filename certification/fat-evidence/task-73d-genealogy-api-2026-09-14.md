# Batch 73-D — Read-only Genealogy Query APIs

**Date:** 2026-09-14  
**Scope:** Authenticated read-only traversals over the Batch 73-C catalog.  
**Environment:** Development API/database only. No commit or deployment.

## Implemented surface

Mounted at `/api/genealogy`:

- `GET /upstream?production_order_id=`
- `GET /downstream?lot_id=`
- `GET /composition?product_id= | ?serial_number=`
- `GET /recall?template_id=&attribute_code=&min=&max=&date_from=&date_to=`

All four routes:

- require authentication;
- return flattened snake_case projections;
- attach `document_cited: { type, id }` to returned genealogy edges;
- perform reads only, apart from the existing append-only `security_events`
  request audit;
- reject write verbs with HTTP 405;
- do not read the legacy BOM-driven issue relations;
- omit `component_serials` until D-73C-01 adds a certified source-document edge.

The genealogy router is mounted before the factory-role denial so authenticated
viewer accounts can trace. No UI was changed.

## Contract decisions

- `/composition?serial_number=` resolves through `serial_units`; it does not
  fall back to text matching against Products.
- Composition returns consumed lots at lot level and cell provenance only through
  the certified production-order cell-match → cell → cell-lot → material-transfer
  chain.
- Recall requires `template_id`, which is the captured attribute template-version
  id. Missing or invalid template scope returns 422.
- Recall filters `attribute_capture_values.value_num` and validated
  `GRN_LINE` captures, with optional inclusive GRN receipt-date bounds.
- Recall downstream consumers are capped at 25 per lot and include
  `meta.truncated`.

## GQ evidence

The permanent suite is:

```text
pnpm --filter @workspace/api-server run test:phase8-genealogy
```

The suite uses a signed session from the existing active owner/viewer rows and
does not create or delete fixtures. It fails closed when the required isolated
P73-D fixture rows are absent.

Run on 2026-09-14:

| Check | Result | Evidence |
|---|---|---|
| GQ-01 upstream, single + bulk issue paths | BLOCKED | No WIP issue lines or bulk batches exist in the current development database. |
| GQ-02 downstream lot consumers | BLOCKED | No lot currently has the required reservation, WIP, consumption, and transfer fixture combination. |
| GQ-03 composition by product and serial | BLOCKED | No manufactured Product with consumed WIP and `serial_units` output identity exists. |
| GQ-04 typed recall and deterministic repeat | PASS | Existing validated numeric capture data returned equal results on two calls. |
| GQ-05 edge citations | PASS | Live recall response citation assertion passed. |
| GQ-06 missing template scope and cap metadata | PASS | Missing `template_id` returned 422; recall responses carried boolean `truncated` metadata. |
| GQ-07 RBAC/read-only verbs | PARTIAL | Anonymous GET returned 401; authenticated POST returned 405. Viewer 200 awaits the upstream fixture. |
| GQ-08 recall performance | PASS | Live recall completed under the 2-second bound. |
| GQ-09 regression wall | CARRIED FORWARD | 73-B serial suite, Phase 6/7 inventory evidence, reservation 15/15, and invariant evidence remain unchanged by this read-only route addition. |
| GQ-10 scope control | PASS | Only the genealogy router, route mount, permanent suite, package script, and this evidence file were added/changed for 73-D; no commit was made. |

The blocked states are fixture absence, not route failures. They remain visible so
the final certification cannot claim a full live traversal without P73-D data.