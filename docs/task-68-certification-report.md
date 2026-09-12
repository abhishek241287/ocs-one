# Task #68 — Receiving, Inspection & Put-Away Certification Report

**Certification date:** 2026-09-12  
**Phase:** 2  
**Environment:** Development database and live development API  
**API target:** `http://localhost:80`  
**Scope:** Partial PO receiving, GRN line-level inspection, internal lot creation, and put-away

## Final disposition

**PASS — 37/37 verification points passed.**

The certification used isolated, prefix-tagged fixtures and set-based teardown for the
receiving suite. The Option A preservation suite also tears down its own fixtures.

## Part A — REC-01 through REC-10

Command:

```bash
CERT_BASE_URL=http://localhost:80 \
pnpm --filter @workspace/api-server run test:receiving
```

| Check | Result | Evidence |
|---|---:|---|
| REC-01 Partial PO receipt | PASS | 201 GRN creation |
| REC-02 Internal lot creation | PASS | Lot matched `LOT-YYYYMMDD-NNNN` |
| REC-03 PO quantity/status projection | PASS | Received 60, open 40, status `partially_received` |
| REC-04 Independent line inspection | PASS | Accepted 50, rejected 10 |
| REC-05 Inspection over-quantity rejection | PASS | HTTP 422 |
| REC-06 Put-away | PASS | Location/bin projection updated |
| REC-07 Concurrent over-receipt protection | PASS | Parallel posts produced exactly one 200 winner and one 422 blocker |
| REC-08 Non-PO GRN compatibility | PASS | HTTP 201 |
| REC-09 Inspection ledger balances | PASS | Pending release, available, and rejected balances reconciled |
| REC-10 Full rejection lot status | PASS | Lot status became `rejected` |

## Part B — Invariant SQL checks

Ten read-only development-database invariants passed:

| Check | Result |
|---|---:|
| INV-01 Four Phase 2 GRN-line columns exist | PASS |
| INV-02 `lot_seq` exists | PASS |
| INV-03 Composite inspection-event uniqueness exists and old one-event constraints are absent | PASS |
| INV-04 Every posted GRN line has a lot | PASS — 0 violations |
| INV-05 No GRN line has duplicate lots | PASS — 0 violations |
| INV-06 GRN receipt ledger reconciles to received quantity | PASS — 0 violations |
| INV-07 Accepted plus rejected quantities never exceed received quantity | PASS — 0 violations |
| INV-08 Inspection ledger balances reconcile to GRN-line counters | PASS — 0 violations |
| INV-09 Put-away quantity never exceeds accepted quantity | PASS — 0 violations |
| INV-10 PO received/open projections reconcile to GRN lines | PASS — 0 violations |

Final schema snapshot:

- Required sequences: `lot_seq`, `material_transfer_seq`
- Composite inspection index: `incoming_inspection_lines_event_unique`
- Old GRN-level and single-line inspection uniqueness constraints: absent

## Part C — Concurrency and idempotency

| Check | Result | Evidence |
|---|---:|---|
| Concurrent GRN posting | PASS | REC-07 parallel race: one winner, one over-receipt rejection |
| Repeated inspection | PASS | Two cumulative events accepted; completed-line retry returned 422 without a third event |
| Duplicate lot prevention | PASS | Repeated GRN post returned 409 and left exactly one lot |

## Part D — Command checks

| Check | Result | Evidence |
|---|---:|---|
| `pnpm typecheck` | PASS | All workspace TypeScript projects passed |
| `git diff --check` | PASS | No whitespace errors |
| `GET /api/healthz` | PASS | HTTP 200, `{"status":"ok"}` |
| Development schema push | PASS | `pnpm --filter @workspace/db run push` applied cleanly |
| Orval regeneration | PASS | React and Zod clients regenerated; library typecheck passed |

## Part E — Option A preservation

| Check | Result | Evidence |
|---|---:|---|
| Cell-lot creation and reconciliation | PASS | 3 transferred cells generated; destination quantity 3 |
| Existing material transfer path | PASS | Task #35 transfer-domain suite passed |
| Non-PO GRN behavior | PASS | REC-08 passed |

During the first Option A run, the development database was missing the existing
`material_transfer_seq` referenced by the preserved transfer route. The sequence was
restored to the Drizzle schema and applied through the development schema push. The
transfer suite then passed, including stock, provenance, picker, cell-lot, and cell
report reconciliation.

## Part F — Excluded-scope integrity

Static route inspection found no mounted routes for:

| Excluded surface | Result |
|---|---:|
| Reservations | PASS — absent |
| Allocations | PASS — absent |
| WIP | PASS — absent |
| Scrap | PASS — absent |
| Adjustments | PASS — absent |
| General transfers | PASS — absent |

The existing `/api/inventory/transfers` route is intentionally preserved as the
specialized Option A Store-to-Cell Processing path and was certified separately in
Part E. Unauthenticated HTTP probes return 401 because the inventory router applies
authentication before route resolution; static route inspection was therefore used for
absence checks.

## Part G — Sign-off

**Task #68 status:** CERTIFIED  
**Verification points:** 37 passed, 0 failed  
**Production schema changed directly:** No  
**Development schema verified:** Yes  
**Receiving certification:** PASS  
**Option A preservation certification:** PASS  
**Excluded-scope integrity:** PASS  

The implementation is ready for the normal Publish flow, which will handle any
development-to-production schema diff.