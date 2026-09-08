# OCS One FAT Data Setup

This document describes data prerequisites only. It is not an instruction to
modify application code or schema. All setup must be performed through the
existing routes or approved test-database tooling, with a before/after
snapshot.

## 1. Frozen baseline and current fixture

Test only:

- Tag: `FAT-CANDIDATE-2026-09-08`
- Peeled commit: `60564b1b49b76ce0b97e46d1de65a7325ef50ba7`

The existing `src/cert/qa-seed.ts` is intentionally limited to the blocker
fixtures below. It is safe to re-run and uses the `QA-FAT-` prefix.

| Fixture | Current seeded data | Intended use |
|---|---|---|
| `QA-FAT-DLR-A` | Dealer A | Dealer isolation own-access |
| `QA-FAT-DLR-B` | Dealer B | Dealer isolation cross-access |
| `QA-CHG-H17-001` | One available charger | H17 concurrent reservation |
| `QA-ORD-H11-001` | In-progress order without product | H11 invalid-lot validation |
| `QA-ORD-H14-001` | Completed order without product | H14 completed-order read/idempotency fixture |
| `QA-ORD-H17-001` / `002` | Two in-progress orders; stages 1–5 approved, charging pending | H17 charger race |
| `qa.dealer.a@qa.local` | Active dealer-role user linked to Dealer A | C1 dealer portal isolation |

Do not copy the QA password into test evidence. Obtain it through the
controlled test-runner secret mechanism.

## 2. Common setup

1. Check out the frozen tag, not the current branch tip.
2. Start the API and web services without changing configuration.
3. Create or verify six named test accounts: Owner, Director, Supervisor,
   Operator, Viewer, Dealer. The existing authorization suite can create its
   temporary certification users through the Owner account.
4. Ensure the Dealer account has a valid `dealer_id` for Dealer A.
5. Ensure all test timestamps and actor names are recorded.
6. Use unique `FAT-YYYYMMDD-*` business numbers where the route generates
   numbers automatically; never reuse production identifiers.

All full-journey fixtures must be grouped and isolated as follows:

| Group | Scope | Starting-state requirement |
|---|---|---|
| FAT-01 | Masters | No FAT-prefixed masters exist, or the known manifest IDs are reset to their documented active state |
| FAT-02 | Procurement / GRN / Inspection / Inventory | Draft GRN and empty FAT ledger baseline are present; inspection-pending stock is distinct from available stock |
| FAT-03 | Cells / Grading / Matching | Received lot exists, cells are unallocated and ungraded, and grade configuration is known |
| FAT-04 | Manufacturing | Orders are at their documented pre-stage states; chargers are available |
| FAT-05 | Finished Product / Packing / Dispatch | No consumed FAT product/dispatch remains, or the group is restored to its ready-for-packing baseline |
| FAT-06 | Customer / Warranty / Traceability | Product/customer/warranty chain is either absent or restored to the manifest's exact baseline |

Each group must record its created records, stable IDs/business numbers,
dependencies, reset/cleanup method, and expected starting state. Groups may be
reset independently where dependencies permit. No production-like row may be
created outside the `FAT-` namespace.

## 3. Required master/reference data

The current QA seed does **not** create these records. Their absence is
**DATA SETUP REQUIRED**, not a defect.

### 3.1 Engineering and product masters

Create or identify active records for:

- One product category with the intended serial mode.
- One product master/model linked to that product category.
- One product workflow with the stage sequence used by the order.
- One cell master with chemistry, capacity, voltage, and cell count.
- One BMS, cabinet, connector, cable, busbar, charger, and test-equipment
  master as required by the chosen product.
- One active dealer master beyond the two QA dealers if a non-QA dispatch is
  required.

### 3.2 Inventory masters

Create or identify:

- One supplier.
- One material category.
- One material workflow with its post-receipt action.
- One material linked to a component master where cell processing is required.
- A valid material-to-workflow assignment.

Capture master IDs and active/status values in the execution evidence.

### 3.3 BOM

Create one revisioned BOM for the product model:

- At least one cell requirement.
- At least one non-cell traceable component requirement.
- Exact quantities and units.
- Approved status.

Also prepare one intentionally invalid or incomplete BOM only if the negative
case requires it; do not alter the approved BOM after it is used by a positive
case.

## 4. Procurement, GRN, inspection, and inventory fixtures

Prepare:

1. A draft GRN with one or more valid material lines and supplier.
2. A second draft GRN with an invalid material or no lines for negative tests.
3. A posted GRN with inspection-pending lines.
4. An incoming inspection payload that exactly covers every pending line.
5. A rejected inspection variant if the route/data contract supports the
   selected result.
6. Available stock after inspection.
7. A cell material line linked to a cell master for transfer testing.
8. Enough available quantity for one successful transfer and one insufficient
   quantity negative test.

Expected ledger setup:

- GRN posting creates receipt transactions.
- Inspection changes the relevant state without deleting history.
- Transfer creates one negative source movement and one positive
  cell-processing movement plus the cell lot/cell rows.

## 5. Cell processing fixtures

Prepare one received cell lot with:

- At least `quantity × cellsPerBattery` cells.
- Capacity and internal-resistance measurements for every cell.
- Enough cells in acceptable and rejectable ranges to exercise grading.
- A lot that can be fully graded.
- A second lot or extra cells for matching-concurrency isolation.

Prepare:

- One grade configuration with known A/B/C/reject boundaries.
- One cell below the minimum threshold.
- One correctable grading record.
- One order requiring one or more batteries for matching.

## 6. Manufacturing fixtures

Prepare a clean production order linked to:

- Product model.
- Approved BOM.
- Cell match/allocation.
- Required component masters.
- Required material stock and lots.

The order must be able to progress through all nine configured stages:

1. `cell_allocation`
2. `assembly`
3. `compression`
4. `bms_allocation`
5. `bms_programming`
6. `charging`
7. `testing`
8. `quality_control`
9. `packing`

Prepare separate orders for concurrency cases so one test does not consume the
only valid state of another:

- Two orders sharing one charger for the charger race.
- Two callers attempting the same cell match acceptance.
- One order at the completion boundary for concurrent completion.
- One order with valid model/QC/genealogy and one with a missing completion
  prerequisite.

## 7. QC, product, packing, dispatch, dealer, and customer fixtures

Prepare:

- Test equipment master and test-result payloads for the clean order.
- A QC-pass path and a QC-reject path that creates a rework ticket.
- A product created only by the valid completion gate.
- A product in `ready_for_packing`.
- The same product assigned to an active dealer for dispatch.
- A separate product in a non-packable state for packing rejection.
- A draft dispatch with eligible packed product.
- A dispatch lifecycle record with the dealer master snapshot.
- A dispatched or delivered product for customer registration.
- Customer identity/address/mobile and installation date.
- Warranty record or a route-generated warranty state for warranty read/void.

## 8. Traceability fixture

At least one product must have all of these linked records:

- Production order and stage timeline.
- Cell and component genealogy.
- Test results.
- QC decision.
- Product serial and product events.
- Packing event.
- Dispatch document and dispatch event.
- Dealer assignment.
- Customer registration.
- Warranty record.

Record the product ID and official serial as the traceability anchor.

## 9. Data that cannot be exercised from the current seed

These are explicitly **DATA SETUP REQUIRED**:

- Any successful GRN, inspection, stock transfer, or material issue.
- Any full cell grading or matching journey.
- A clean manufacturing order through all nine stages.
- Full charging formation report and release.
- Test-result and QC-pass completion that mints a product.
- QC-reject/rework/retest lifecycle.
- Packing, modern dispatch, customer registration, warranty, and full
  traceability with non-empty records.
- Dealer portal inventory/dispatch history containing a product.
- Report KPI validation against meaningful transactions.

The existing QA seed is sufficient only for C1 isolation, H11 invalid-lot
validation, H14 completed-order readability, and H17 charger reservation
competition.


## 10. Repeatable controlled fixture runner

The full FAT dataset is provided by the approved test-database tooling under
`artifacts/api-server/src/cert/`. It is deliberately separate from application
startup seed logic and uses the `FAT-E2E-` namespace; it does not modify the
existing `QA-FAT-*` blocker fixture.

Before running the commands, check out
`FAT-CANDIDATE-2026-09-08` (`60564b1b49b76ce0b97e46d1de65a7325ef50ba7`) and
provide `FAT_TEST_PASSWORD` through the secret runner. The password is used to
hash the six named accounts and is never written to the manifest or evidence.

```sh
FAT_TEST_PASSWORD='provided out of band' pnpm cert:fat:seed
pnpm cert:fat:verify
pnpm cert:fat:teardown
pnpm cert:fat:verify
```

For a fresh FAT run, `FAT_TEST_PASSWORD='provided out of band' pnpm test:fat`
is the shorthand for seed followed by verification; it intentionally leaves
the controlled records in place for the manual route journey.

The seed resets only rows in the `FAT-E2E-` namespace, then creates:

- six named accounts (Owner, Director, Supervisor, Operator, Viewer, Dealer)
  with the Dealer account linked to the controlled Dealer A record;
- active product, workflow, cell, BMS, cabinet, connector, cable, busbar,
  charger, test-equipment, supplier, material, and routing masters;
- an approved revisioned BOM with cell and traceable non-cell lines;
- valid and negative GRNs, complete incoming inspections, signed inventory
  movements, a cell-processing transfer, and available stock;
- a 64-cell received lot with full measurements, accepted/rejected grading,
  an ECF correction candidate, an allocated match, and a pending match;
- six independent manufacturing orders with all nine canonical stages,
  charger-race orders, a completion-boundary order, test results, QC pass and
  reject/rework records, formation data, genealogy, and a MIN;
- ready-for-packing, non-packable, packed/dispatched product states plus dealer
  snapshot, dealer portal history, customer registration, warranty, and a
  complete traceability anchor.

`certification/fat-fixture-manifest.json` is generated without passwords and
records the frozen baseline, resolved IDs, counts, and expected concurrency
fixtures. Teardown is prefix-scoped and FK-ordered, includes downstream
events/ledgers/ECF rows, and fails unless the residual count is zero. A failed
seed transaction rolls back; a standalone teardown can recover from an
interrupted run.
## 10. Reset and concurrency integrity requirements

The controlled FAT setup must be deterministic and resettable. Do not create
one giant fixture that one positive test consumes for every other case.

Maintain isolated resettable fixtures for:

- One available charger shared by two charging-ready orders.
- Two callers competing for the same cell-match acceptance.
- One order at the concurrent completion boundary.

After each destructive or concurrency case, verify:

- Charger availability and ownership.
- Cell allocation and match state.
- Production-order and stage state.
- Product count and serial uniqueness.
- Inventory ledger counts and signed totals.
- Genealogy and product-event counts.
- No orphan rows in the FAT namespace.

The reset mechanism must not delete rows outside its stable FAT prefix or
manifest IDs. It must report before/after counts and fail closed if a
non-FAT record is selected.
