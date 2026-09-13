# Task 70-E — Read Projections Evidence Note

**Date:** 2026-09-13  
**Environment:** Development database, working tree only  
**Certification status:** Focused runtime evidence complete; not self-certified

## Implemented read surfaces

- `GET /api/inventory/stock` now exposes additive `wip_qty`.
- `GET /api/inventory/wip-inventory` exposes authenticated WIP rows with
  material and lot display fields, filters, and `{ items, meta }` pagination.
- Reservation detail was not modified; its existing `issued_qty` and
  `allocations[]` status payload remains available for `INV-P4-05`.

Physical WIP is derived from signed `inventory_transactions` rows with
`stock_state = 'wip'`. `available_for_use` continues to net reservation holds
only; WIP is not treated as a reservation overlay.

## Runtime evidence

- Stock available read returned `200` and included:
  `material_code = FAT-E2E-MATERIAL-BMS`, `quantity = 51`,
  `wip_qty = 29.5`, `reserved_qty = 0`, and `available_for_use = 51`.
- The stock projection also exposed a WIP state row with `quantity = 29.5`
  and `wip_qty = 29.5`.
- The isolated WIP row itself returned through
  `GET /inventory/wip-inventory?production_order_id=...` with:
  `issued_qty = 50`, `consumed_qty = 20`, `remaining_qty = 30`,
  `status = partially_consumed`, resolved material code, and resolved lot
  number.
- WIP response shape was exactly `{ items, meta }` with `total = 1`,
  `page = 1`, `pageSize = 25`, and `totalPages = 1`.
- Combined `material_id` + `status=partially_consumed` filtering returned
  `200`, `total = 1`, and only the requested material/status.
- Invalid WIP status returned `400`.
- Viewer read returned `200`; anonymous WIP read returned `401`.
- A material with no WIP balance returned `wip_qty = 0`.

The BMS stock aggregate includes a pre-existing development FAT ledger
contribution, so its stock projection was `29.5` rather than the isolated
fixture's `30`. The WIP detail row and signed-ledger calculation both remained
consistent; this was not caused by the read route.

## Read-only and regression evidence

- Inventory transaction, outbox, and WIP row counts were unchanged across all
  read requests: `17|41|1` before and after.
- Temporary warehouse, location, GRN, lot, ledger, and WIP fixture residue:
  `0`.
- Task 69 reservation regression: `15 PASS / 0 FAIL / 0 MANUAL`.
- MIN smoke: `200`.
- Library typecheck: passed.
- API typecheck: passed.
- `git diff --check`: passed.

## Scope

Only these three application files were changed for 70-E:

- `artifacts/api-server/src/routes/inventory/stock.ts`
- `artifacts/api-server/src/routes/inventory/wip-inventory.ts`
- `artifacts/api-server/src/routes/inventory/index.ts`

No accounting or mutation routes, generated API, frontend, Task #69,
MIN, GRN, transfer, or stock mutation logic was changed. No commit was created
for this batch.