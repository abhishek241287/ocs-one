# Task 70-J — Full Transfer Lifecycle

Date: 2026-09-13  
Environment: development working tree and development database only  
Scope: `transfer_requests` / `transfer_lines` lifecycle; existing Option A `/inventory/transfers` and `material_transfers` domain unchanged.

## Implementation

- Added `transfer_request_seq`.
- Added nullable unique `transfer_requests.idempotency_key`.
- Added the `transfer_lines_request_idx` index.
- Added hand-written transfer-request API schemas, including duplicate-line rejection for receive requests.
- Mounted the authenticated `/api/inventory/transfer-requests` router.
- Implemented:
  - draft creation with shared request-level dimensions,
  - director approval,
  - draft/approved cancellation,
  - physical issue (`available → in_transit`),
  - partial and full receive (`in_transit → destination available`),
  - in-transit rejection with signed reversal pairs,
  - received-to-reconciled transition,
  - authenticated list/detail projections,
  - phase-prefixed idempotency keys for issue and receive,
  - request/line/lot/GRN locking and outbox/security events.

The route preserves the Phase 0 header-dimension schema. When callers submit line dimensions, the route requires them to agree and stores the shared dimensions on the request header.

## Focused certification

Command:

```text
pnpm --filter @workspace/api-server run test:task70-j-transfer-lifecycle
```

Result: **12 PASS / 0 FAIL**

| Check | Coverage | Result |
|---|---|---|
| 70J-01 | Two-line issue, lot-scoped and unloted, source/in-transit ledger pairs, approval RBAC | PASS |
| 70J-02 | Partial receive and per-line projection | PASS |
| 70J-03 | Full receive, reconcile, and per-line conservation | PASS |
| 70J-04 | Draft and approved cancellation with no ledger writes | PASS |
| 70J-05 | In-transit rejection, reversal pairs, source restoration, invalid cancel | PASS |
| 70J-06 | Partial-receive rejection failure and over-receive zero mutation | PASS |
| 70J-07 | Insufficient source stock and zero mutation | PASS |
| 70J-08 | Parallel issue idempotency | PASS |
| 70J-09 | Parallel receive idempotency | PASS |
| 70J-10 | Transfer issue versus reservation allocation overlap and nonnegative stock | PASS |
| 70J-11 | Authentication and role checks | PASS |
| 70J-12 | INV-P5-04 conservation and nonnegative balances | PASS |

Fixture teardown: **PASS** — users, materials, transfer requests, and transfer ledger rows were zero after teardown.

## Regression certification

| Gate | Result |
|---|---|
| 70-G returns | PASS — 11/11 |
| 70-H scrap | PASS — 10/10, zero residue |
| 70-I adjustments | PASS — 11/11, zero residue |
| Phase 4 WIP consumption | PASS — 17/17; existing FAT BMS `-0.500` WIP baseline exception remains disclosed |
| Option A transfer domain | PASS |
| SS-02 authorization | PASS — 777 endpoint assertions plus 12 dealer-assignment checks |
| SS-03 audit | PASS — 13 audited operations; runtime/static immutability checks passed |
| SS-04 configuration | PASS — 31 pass, 3 documented development warnings, 0 fail |
| FAT read-only smoke | PASS — 32/32 |
| Library/API typecheck | PASS |
| `git diff --check` | PASS |

## FAT preflight disposition

The read-only FAT smoke is green, but FAT preflight remains **DRIFT**, unrelated to 70-J code:

- 65/67 preflight assertions passed.
- The existing controlled dataset contains three stale report-only orders:
  - `FAT-E2E-ORD-REPORT-BEFORE`
  - `FAT-E2E-ORD-REPORT-INSIDE`
  - `FAT-E2E-ORD-REPORT-AFTER`
- Preflight expected 6 controlled orders and found 9; the three report-only orders have zero stages.

This is tracked by the existing project task **Make FAT fixture reset cleanly after evidence runs**. No FAT fixture reset or production-data mutation was performed during 70-J.

## Schema verification

Development database verification confirmed:

- sequence `transfer_request_seq` exists;
- unique index `transfer_requests_idempotency_key_unique` exists;
- index `transfer_lines_request_idx` exists;
- `transfer_requests.idempotency_key` exists and is nullable.

## Final disposition

Task 70-J implementation and development certification are complete. Release sign-off remains subject to the pre-existing FAT fixture drift and the previously disclosed FAT BMS baseline exception.