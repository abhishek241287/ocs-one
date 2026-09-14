# B1 — FAT Fixture Reset Determinism

Date: 2026-09-14  
Environment: development database and working tree only  
Scope: FAT certification harness only; no application routes, schemas, frontend, production data, or commits changed.

## Inspection

The existing project task list contains **Make FAT fixture reset cleanly after evidence runs**.

Relevant harness entry points:

- `artifacts/api-server/src/cert/fat-seed.ts`
  - `cert:fat:seed` runs teardown, then seeds the controlled dataset.
  - `cert:fat:teardown` runs the prefix-scoped teardown.
  - `cert:fat:preflight` runs the 67-assertion readiness check.
- `artifacts/api-server/src/cert/fat-fixture-manifest.ts`
  - `teardownFatDataset()` owns the ordered FAT cleanup.
- `artifacts/api-server/src/cert/fat-journey-evidence.ts`
  - `test:fat:reports` runs reporting evidence.

Pre-fix inspection showed nine `FAT-E2E-ORD-*` rows. The three report-only rows had no dependent stages, reservations, WIP rows, transactions, timeline rows, or genealogy rows.

The root-cause hypothesis was only partly correct. The report-boundary rows were originally inserted by `seedManufacturing()` in `fat-seed.ts`; the reports-only runner did not create or delete them. This meant every normal seed carried the three zero-stage rows and preflight counted nine instead of its six-order contract.

## Fix

The minimal harness fix:

1. Removed report-boundary order creation from the base FAT seed.
2. Added idempotent report-boundary creation to `runReportsAndDashboard()` in `fat-journey-evidence.ts`.
3. Left prefix-scoped teardown responsible for deleting all FAT-E2E rows, including report-only rows.

Normal reset/reseed now creates exactly the six core orders. Reporting evidence temporarily creates the three boundary orders needed for date-window assertions.

## Determinism proof

### Initial pre-check

Command:

```text
psql "$DATABASE_URL" -c "SELECT order_number, status, current_stage FROM mfg_production_orders WHERE order_number LIKE 'FAT-E2E-ORD%';"
```

Observed: **9 rows**:

- 6 core orders
- `FAT-E2E-ORD-REPORT-BEFORE`
- `FAT-E2E-ORD-REPORT-INSIDE`
- `FAT-E2E-ORD-REPORT-AFTER`

### Reset/reseed before the cycles

Command:

```text
FAT_TEST_PASSWORD="$FAT_TEST_PASSWORD" pnpm --filter @workspace/api-server run cert:fat:seed
```

Observed: **6 rows**, exactly:

```text
FAT-E2E-ORD-CLEAN
FAT-E2E-ORD-COMPLETE
FAT-E2E-ORD-PACKED
FAT-E2E-ORD-RACE-ONE
FAT-E2E-ORD-RACE-TWO
FAT-E2E-ORD-REJECT
```

### Reporting cycle 1

Command:

```text
FAT_TEST_PASSWORD="$FAT_TEST_PASSWORD" pnpm --filter @workspace/api-server run test:fat:reports
```

Result: **69/69 PASS**.  
Observed after the reporting suite: **9 rows**, including all three report-boundary orders.

Reset:

```text
FAT_TEST_PASSWORD="$FAT_TEST_PASSWORD" pnpm --filter @workspace/api-server run cert:fat:seed
```

Observed after reset: **6 rows**, exactly the six core orders above.

Preflight:

```text
pnpm --filter @workspace/api-server run cert:fat:preflight
```

Result: **67/67 PASS**.

### Reporting cycle 2

Command:

```text
FAT_TEST_PASSWORD="$FAT_TEST_PASSWORD" pnpm --filter @workspace/api-server run test:fat:reports
```

Result: **69/69 PASS**.  
Observed after the reporting suite: **9 rows**, including all three report-boundary orders.

Reset:

```text
FAT_TEST_PASSWORD="$FAT_TEST_PASSWORD" pnpm --filter @workspace/api-server run cert:fat:seed
```

Observed after reset: **6 rows**, exactly the six core orders above.

Preflight:

```text
pnpm --filter @workspace/api-server run cert:fat:preflight
```

Result: **67/67 PASS**.

## Scope and residue

- The code diff is limited to the FAT seed and FAT evidence harness.
- Report-only orders are removed by the existing prefix-scoped teardown before each reseed.
- The final controlled order count is six.
- No non-FAT-E2E application rows were intentionally created or deleted by the B1 change.

## B1 disposition

**PASS — deterministic reset proven twice; FAT preflight is 67/67.**