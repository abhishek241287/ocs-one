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

## 73-F final-gate evidence

The final-gate battery is:

```text
pnpm --filter @workspace/api-server run test:phase8-genealogy-battery
```

It creates one isolated `P73F-*` chain, runs the live API traversals, checks
INV-GEN-01 through INV-GEN-04, and tears down the fixture in `finally`.
The 2026-09-14 run passed:

| Check | Result |
|---|---|
| GT-01 upstream, single + bulk issue paths | PASS |
| GT-02 downstream LOT-S1 reservation/WIP/consumption/transfer consumers | PASS |
| GT-03 composition by product, lot-level consumption, no `component_serials` | PASS |
| GT-04 typed recall, second-template scoping, deterministic repeat | PASS |
| GT-05 citation completeness | PASS |
| GT-06 serial QR/index round-trip into composition | PASS |
| GT-07 reverse recall reaches the finished product serial and viewer read | PASS |
| INV-GEN-01 cited documents resolve | PASS |
| INV-GEN-02 serial identity foreign-key integrity | PASS |
| INV-GEN-03 Product output/completed-order integrity | PASS |
| INV-GEN-04 recall result hashes are deterministic | PASS |
| Fixture teardown / zero P73F residue | PASS |

The final-gate suite also covers authenticated write rejection with HTTP 405.

## GQ evidence

The permanent suite is:

```text
pnpm --filter @workspace/api-server run test:phase8-genealogy
```

The suite uses a signed session from the existing active owner/viewer rows.
The 73-F battery creates and deletes only its isolated `P73F-*` fixture chain;
genealogy API reads remain read-only apart from append-only security audit
events.

The earlier 73-D smoke run on 2026-09-14 recorded:

| Check | Result | Evidence |
|---|---|---|
| GQ-01 upstream, single + bulk issue paths | SUPERSEDED | The P73F battery now creates and passes the complete chain. |
| GQ-02 downstream lot consumers | SUPERSEDED | The P73F battery now creates and passes the complete chain. |
| GQ-03 composition by product and serial | SUPERSEDED | The P73F battery now creates and passes the complete chain. |
| GQ-04 typed recall and deterministic repeat | PASS | Existing validated numeric capture data returned equal results on two calls. |
| GQ-05 edge citations | PASS | Live recall response citation assertion passed. |
| GQ-06 missing template scope and cap metadata | PASS | Missing `template_id` returned 422; recall responses carried boolean `truncated` metadata. |
| GQ-07 RBAC/read-only verbs | PASS | The P73F battery verified viewer read access and authenticated POST 405; the earlier anonymous 401 smoke check also passed. |
| GQ-08 recall performance | PASS | Live recall completed under the 2-second bound. |
| GQ-09 regression wall | PARTIAL | Reservation 15/15, receiving 12/12, Phase 4 17/17, Phase 5 15/15, Phase 6 71-C 10/10, 71-D 9/9, 71-F 9/9, SS-03 13/13, and SS-04 31 pass / 3 warn / 0 fail passed. The long Phase 6 final-gate wall was interrupted by a workspace restart after the Phase 7 transfer segment passed. Batch 72-A/72-B could not run because the current DB has no FAT manifest director account; SS-02 stopped under the shared rate limiter. |
| GQ-10 scope control | PASS | 73-F added only the isolated battery suite, required genealogy projection fixes, package aliases, and this append-only evidence update; no commit was made. |

The Manufacturing Genealogy gate itself is PASS. The broader project release
wall remains PARTIAL until the FAT manifest is restored and the limiter-aware
SS-02/Phase 6 final-gate wall completes end-to-end.