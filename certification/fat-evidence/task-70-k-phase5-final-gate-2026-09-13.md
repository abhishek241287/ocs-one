# Task 70-K — Phase 5 Final Gate

Date: 2026-09-13  
Environment: development working tree and development database only  
Scope: cross-domain WIP/inventory certification, concurrency checks, invariant SQL pack, regression gate, and final evidence.

## Implementation

- Added `artifacts/api-server/src/cert/phase5-final-gate-suite.ts`.
- Added the package command:

  ```text
  pnpm --filter @workspace/api-server run test:phase5-gate
  ```

- Added `certification/fat-evidence/sql/phase5-invariants.sql`.
- The adjustment boundary now treats `inventory_lots.warehouse_id` as receipt provenance after a transfer. A lot-scoped adjustment validates availability against the signed ledger at the requested warehouse/location instead of rejecting a valid transferred balance because the immutable lot header still names the receipt warehouse.
- The gate uses isolated temporary users, warehouses, lots, production orders, reservations, WIP issue notes, documents, and transfer requests. Teardown removes all fixture rows in a `finally` path.

## Focused Phase 5 certification

Command:

```text
pnpm --filter @workspace/api-server run test:phase5-gate
```

Result: **15 PASS / 0 FAIL**

| Check | Coverage | Result |
|---|---|---|
| FK-01 | WIP issue → consumption → return → scrap balance and ledger conservation | PASS |
| FK-02 | Returned stock can enter the transfer lifecycle | PASS |
| FK-03 | Transferred lot can be physically adjusted at the destination | PASS |
| FK-04 | Scrap does not mutate reservation accounting | PASS |
| FK-05 | WIP read projection returns the issued fixture | PASS |
| FK-06 | Return versus consumption race: exactly one mutation wins | PASS |
| FK-07 | Return versus scrap race: exactly one mutation wins | PASS |
| FK-08 | Scrap versus consumption race: exactly one mutation wins | PASS |
| FK-09 | Same-lot adjustment race: exactly one oversubscribed post wins | PASS |
| FK-10 | Full transfer issue versus same-lot adjustment race: exactly one wins | PASS |
| FK-11 | Transfer issue versus reservation allocation overlap remains nonnegative | PASS |
| FK-12 | Parallel same-key return posting is idempotent | PASS |
| FK-13 | Posted return has exactly two ledger rows and one outbox event | PASS |
| FK-14 | Annotation-only consumption adjustment adds zero ledger rows | PASS |
| FK-LEDGER | Focused fixture stock balances are nonnegative | PASS |

Fixture residue after the run: **0 P5 users, 0 P5 materials, 0 P5 warehouses, 0 P5 transfer requests**.

## Invariant SQL pack

Command:

```text
psql "$DATABASE_URL" -f certification/fat-evidence/sql/phase5-invariants.sql
```

Result: **20/20 checks returned zero violations**.

Covered groups:

- reservation quantity, identity, status, orphan, and source-ledger invariants;
- WIP row formula and WIP-to-ledger projection;
- consumption variance/status and confirmation outbox coverage;
- transfer line conservation, nonnegative in-transit balances, and issue outbox coverage;
- return, scrap, and adjustment ledger cardinality;
- canonical document orphan detection;
- global ledger nonnegative balances.

The global ledger check excludes only the documented pre-existing `FAT-E2E-MATERIAL-BMS` WIP balance of `-0.500`. No Phase 5 fixture contributed a negative balance.

## Regression gate

All requested regression areas passed when run sequentially, with API workflow resets between high-volume authentication suites to avoid the shared development limiter:

| Gate | Result |
|---|---|
| Reservation | PASS — 15/15 |
| Procurement purchase orders | PASS — 15/15 |
| Receiving | PASS — 12/12 |
| Phase 4 WIP consumption | PASS — 17/17; known FAT BMS baseline exception disclosed |
| 70-G WIP returns | PASS — 11/11 |
| 70-H WIP scrap | PASS — 10/10 plus residue PASS |
| 70-I physical adjustments | PASS — 11/11 plus residue PASS |
| 70-J transfer lifecycle | PASS — 12/12 plus residue PASS |
| Option A transfer domain | PASS |
| SS-02 authorization | PASS — 777 endpoint assertions plus 12 dealer checks |
| SS-03 audit | PASS — 13 audited operations; immutability checks passed |
| SS-04 configuration | PASS — 31 pass, 3 documented development warnings, 0 fail |
| Reports response-shape contract | PASS |
| BOM obsoletion regression | PASS |
| BOM use/obsoletion concurrency | PASS |
| FAT read-only/MIN smoke | PASS — 32/32 |
| API typecheck | PASS |
| `git diff --check` | PASS |

## Route scope and schema checks

- Consumption and material-issue routers are write-scoped to supervisor/director.
- Returns, scrap, adjustments, and transfer requests require authentication at router scope and apply explicit role guards to each mutation.
- Transfer schema tables exist: `transfer_requests`, `transfer_lines`, and `inventory_transactions`.
- Transfer sequence, idempotency unique index, and transfer-line request index are present.
- `/api/healthz` returned `{"status":"ok"}`.

## Known blockers

FAT preflight remains **DRIFT**, unrelated to the Phase 5 implementation:

- 65/67 preflight assertions pass.
- Three stale report-only orders remain:
  - `FAT-E2E-ORD-REPORT-BEFORE`
  - `FAT-E2E-ORD-REPORT-INSIDE`
  - `FAT-E2E-ORD-REPORT-AFTER`
- The controlled dataset therefore has 9 orders where preflight expects 6; the three report-only orders have zero stages.
- The global development ledger still has the pre-existing FAT BMS WIP balance of `-0.500`.

These are documented existing release blockers. No FAT reset or production-data mutation was performed during this gate.

## Final disposition

**PARTIAL / RELEASE SIGN-OFF BLOCKED.**

The Phase 5 implementation, focused certification, invariant pack, regression suites, MIN smoke, schema checks, typecheck, health check, and fixture teardown are green. Final release sign-off remains blocked by the pre-existing FAT fixture drift and the pre-existing FAT BMS `-0.500` WIP baseline. Existing project tasks track the fixture reset and release-blocker cleanup.