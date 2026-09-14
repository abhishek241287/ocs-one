# Batch 72-E — Phase 7 MIN-Replacement Final Gate

Date: 2026-09-14

Scope: development database only. No application behavior was changed beyond
the two invariant-pack queries. No commit or tag was created.

## Implementation delta

The Phase 6 invariant pack now includes the two global reconciliation checks
promised by the Batch 72-C negative-balance trace:

- **I-21** — no negative `available` or `in_transit` balance by
  `(material_id, warehouse_id, stock_state)`.
- **I-22** — no negative balance by `(material_id, lot_id, stock_state)`.

The pack is now **22/22**. Both checks are global and are not restricted to
the Phase 6 fixture.

## Verification battery

| Area | Result |
|---|---|
| Phase 7 bulk issue T01–T11 | **PASS** |
| 72-B MIN deprecation B-01–B-04 | **PASS** |
| Phase 6 C-01–C-07 | **PASS** |
| Phase 4 WIP | **17/17 PASS** |
| Receiving | **12/12 PASS** |
| Reservation | **15/15 PASS** |
| 70-G returns | **11/11 PASS** |
| 70-H scrap | **10/10 PASS; residue clean** |
| 70-I adjustments | **11/11 PASS; residue clean** |
| 70-J transfer lifecycle | **12/12 PASS; residue clean** |
| 70-K / Phase 5 FK gate | **15/15 PASS** |
| 71-C | **10/10 PASS** |
| 71-D | **9/9 PASS** |
| 71-F scenarios | **SF-01–SF-09 PASS** |
| Phase 6 final gate | **exit 0** |
| Invariant pack | **22/22 PASS**, including I-21/I-22 |
| SS-02 authorization | **777 + 12 PASS** |
| SS-03 audit | **13/13 PASS; immutable** |
| SS-04 configuration | **31 pass / 3 warnings / 0 fail** |
| FAT preflight | **67/67 PASS** |
| FAT read-only smoke, run 1 | **32/32 PASS** |
| FAT read-only smoke, run 2 | **32/32 PASS** |
| FAT drift coverage | **9/9 controlled mutations PASS** |
| Typecheck | **libs + API + frontend PASS** |
| `git diff --check` | **PASS** |

The final gate also completed its isolated regression wall, including the
current-code SS-02/SS-03/SS-04 runs and an embedded FAT smoke run.

## MIN smoke

The 72-B contract suite passed the required MIN lifecycle:

- MIN create returns HTTP **410** with the exact `MIN_DEPRECATED` payload.
- Historical MIN list and detail reads return **200**.
- Historical reversal succeeds on a fixture MIN.
- Active MIN blocks bulk issue with `409 ACTIVE_MIN_EXISTS`.
- No active MIN remains after teardown.

## Final residue and reconciliation

Read-only final queries returned zero rows for:

- negative available/in-transit balance by material, warehouse, and state;
- negative balance by material, lot, and state;
- P72 MIN issue rows;
- P71 certification users;
- FAT drift markers.

The Phase 6 final gate reported zero teardown residue.

## Verdict

**PHASE 7 PASS — MIN is history and the certified bulk issue path is the
replacement for new material issues.**

The certified movement through-line covers receiving, reservation, allocation,
issue, consumption, return, scrap, adjustment, transfer, and bulk issue, with
the global non-negative inventory reconciliation now enforced by I-21 and I-22.