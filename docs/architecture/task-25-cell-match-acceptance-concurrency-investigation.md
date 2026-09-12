# Cell-Match Acceptance Concurrency Investigation

**Investigation date:** 2026-09-12  
**Inspected revision:** `83942d08848a77452a8f8f4780751e60a4779ac4`  
**Scope:** Cell-match acceptance only. No Block 4 execution, no Blocks 5–12
execution, no broader FAT-suite rerun, and no modification to the frozen FAT
candidate or existing FAT evidence.

## Finding

The reported two-success race was a real defect in the implementation before
Task #25. The pre-fix endpoint performed its `draft`/`approved` reads outside
the transaction that performed the reservation updates. Two concurrent
requests could both pass those checks and both return HTTP 200.

Task #25 is merged in the inspected revision. The merged implementation puts
the state check, cell validation, row locking, and state changes in one
transaction. The isolated regression against the merged revision produced
exactly one HTTP 200 and one HTTP 409. Both requests did not successfully claim
the same pending match on the inspected revision.

**Current classification:** historical release-blocking concurrency defect
confirmed in the pre-Task #25 implementation; not reproduced on the current
merged revision. The current controlled result is not a new FAT
nonconformance.

## Endpoint and code path

The route is mounted under the cells router:

```text
POST /api/cells/matches/:id/accept
```

The handler is:

```text
artifacts/api-server/src/routes/cells/matches.ts
router.post("/:id/accept", ...)
```

The route is protected by the cell-matching write-role middleware for
operators, supervisors, and directors.

The acceptance path:

1. Loads the `cell_matches` row.
2. Requires status `draft`.
3. Loads `cell_match_items`.
4. Validates unique referenced cells and requires each cell to be `approved`.
5. Changes the cells to `reserved` with `match_id`.
6. Changes the match to `reserved`.
7. Returns the match detail.

## Pre-Task #25 transaction and locking behavior

The pre-fix implementation had this boundary:

1. `SELECT cell_matches` without `FOR UPDATE`, outside a transaction.
2. Check `match.status === "draft"`.
3. `SELECT cell_match_items` and `SELECT cells` without row locks.
4. Check all cells are approved.
5. Start a transaction.
6. Unconditionally update the cells to `reserved`.
7. Unconditionally update the match to `reserved`.
8. Return HTTP 200.

There was no conditional update predicate and no lock held across the
validation and mutation. The two requests could interleave as follows:

```text
Request A: read match=draft, cells=approved
Request B: read match=draft, cells=approved
Request A: reserve cells and match; commit
Request B: reserve the same cells and match; commit
Request A: return 200
Request B: return 200
```

This did not create duplicate physical rows because both requests updated the
same rows. It was nevertheless a duplicate acceptance: both callers received
success for the same one-time state transition, and the second request was not
reported as a contention loser.

## Current transaction and locking behavior

The merged handler uses one `db.transaction` for the complete operation:

1. `SELECT cell_matches ... FOR UPDATE`.
2. Check the locked row is still `draft`.
3. Read the match items through the transaction.
4. Lock every referenced cell through the transaction in stable ID order with
   `FOR UPDATE`.
5. Validate that all locked cells still exist and are approved.
6. Update cells to `reserved` and set `match_id`.
7. Update the match to `reserved`.
8. Commit.
9. Only after the transaction returns, build the winner detail or return the
   conflict response.

The match-row lock serializes simultaneous accepts for the same match. The
stable cell-lock order also prevents lock-order inversion when two different
pending matches overlap on cells.

## Controlled concurrent requests

The investigation created a uniquely prefixed development fixture containing:

- One active operator account.
- One graded cell lot.
- Two approved cells.
- One `draft` cell match containing those two cells.
- Two identical requests sent with `Promise.all`.

The exact request shape was:

```http
POST /api/cells/matches/35a0ad9c-d23f-4aa1-a439-ba9fdc7bc461/accept
Content-Type: application/json
Cookie: ocs_token=<isolated operator session>

{}
```

The request was issued twice concurrently against the same match ID.

## Responses on the inspected revision

The two responses were:

```text
Request 1: HTTP 200
  body.status: "reserved"

Request 2: HTTP 409
  {"error":"Match is already reserved"}
```

The order of the two network responses is not semantically important. The
required invariant is exactly one 200 and exactly one 409.

## Resulting database state

After both requests completed, before fixture cleanup:

| Record | Result |
|---|---|
| `cell_matches.status` | `reserved` |
| `cell_match_items` | exactly 2 rows |
| Cell 1 | `reserved`, `match_id` = the fixture match |
| Cell 2 | `reserved`, `match_id` = the fixture match |
| `cells.allocation_order_id` | `NULL` for both cells |
| `cell_lot_events` | 0 acceptance events |
| Manufacturing orders referencing the match | 0 |
| Manufacturing genealogy rows for the fixture cells | 0 |

The acceptance operation reserves cells and the match; downstream
manufacturing allocation occurs later through the cell-allocation stage. The
race did not create or alter a manufacturing allocation.

The isolated fixture was removed after inspection. No frozen FAT rows or FAT
evidence were used.

## Audit evidence

The post-race audit query for the isolated operator found one record:

```text
auth.login.success
POST /api/auth/login
HTTP 200
```

There was no cell-match acceptance security event, no cell-lot acceptance
event, and no manufacturing genealogy event. This matches the current route:
the acceptance handler does not call the security-event recorder. The
authoritative evidence for the acceptance is therefore the match/cell state
transition and the HTTP contention result, not a dedicated audit row.

## Severity

### Historical pre-Task #25 defect: Release-blocking / High

The pre-fix behavior violated the exact-one-winner invariant for a one-time
resource reservation. Even though it did not duplicate database rows, it could
tell two callers that the same match was accepted successfully and could
allow downstream workflows to proceed under contradictory acceptance results.

### Current inspected revision: No active nonconformance reproduced

The merged revision passed the isolated exact-one-winner check. The database
did not confirm two successful claims on the current revision, so the rule to
classify the current database result as a new FAT nonconformance was not
triggered.

## Recommended remediation

The remediation already present in Task #25 is the appropriate narrow fix:

- Lock the match row with `FOR UPDATE` before checking its status.
- Keep validation and mutation in the same transaction.
- Lock referenced cells in stable order.
- Return HTTP 409 for the losing request after it observes the committed
  non-`draft` match.
- Keep a regression assertion that requires exactly one 200 and one 409.
- Verify the post-race state contains one reserved match owning all expected
  cells.

No additional patch was made during this investigation.

## Controlled regression design

The required regression must:

1. Create isolated, uniquely prefixed fixture data already in the exact
   `draft` + `approved cells` state needed by the endpoint.
2. Authenticate one authorized operator or supervisor.
3. Send two identical `POST /api/cells/matches/:id/accept` requests
   concurrently.
4. Require the response multiset to be exactly `{200, 409}`.
5. Reject `{200, 200}`, `{409, 409}`, authentication failures, and unrelated
   request failures.
6. Query the database after both responses and require:
   - one `reserved` match;
   - the expected number of match items;
   - every referenced cell `reserved`;
   - every referenced cell points to the one winning match;
   - no unexpected `allocation_order_id`;
   - no duplicate match-item rows;
   - no unintended manufacturing allocation or genealogy rows.
7. Inspect audit records and report whether acceptance is represented by a
   dedicated event or only by the state transition.
8. Remove the isolated fixture in `finally`.

This design is intentionally stricter than “at most one request succeeded.”
Both requests failing would not prove that the transaction boundary is safe.