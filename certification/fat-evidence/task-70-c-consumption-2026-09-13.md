# Task 70-C — Consumption Evidence Note

**Date:** 2026-09-13  
**Environment:** Development database, working tree only  
**Certification status:** Evidence submitted for architect certification; not self-certified

## Contract interpretation for 70-F

`confirmed_by` is effectively the consumption record's `recorded_by` field in the live
schema:

- The table has no `created_by` column.
- `confirmed_by` is `NOT NULL` and has no default, including while a row is a draft.
- Draft creation records the creating actor in `confirmed_by`.
- Confirmation overwrites `confirmed_by` with the confirming actor and sets `confirmed_at`.
- `confirmed_at` remains `NULL` while the row is a draft.

70-F should assert both states explicitly, preferably with distinct creator and confirmer
actors:

- Draft: `status = 'draft'`, `confirmed_by = creator`, `confirmed_at IS NULL`.
- Confirmed: `status = 'confirmed'`, `confirmed_by = confirmer`,
  `confirmed_at IS NOT NULL`.

Other live-schema adaptations verified during 70-C were:

- Confirmation UOM is copied from the material master.
- BOM snapshot lines use the live `planned_qty` column.
- The matching snapshot line ID is retained on the confirmation.
- `reason` is limited to 255 characters.

## Runtime evidence

- Draft creation returned `201` with `status = draft`.
- BOM snapshot default resolved `planned_qty = 50`, `actual_qty = 20`,
  `variance_qty = -30`, and retained the snapshot-line ID.
- Partial confirmation returned `200`; WIP remaining became `30`.
- No-snapshot fallback resolved `planned_qty = actual_qty = 30` and full confirmation
  returned `200`.
- Over-consumption returned `409 INSUFFICIENT_WIP`.
- Re-confirmation returned `409`.
- Parallel confirmation returned exactly one `200` and one `409`.
- Operator and viewer writes returned `403`; anonymous write returned `401`; viewer
  read returned `200`.
- MIN read smoke returned `200`.

## Database evidence

- Variance identity mismatches: `0`.
- WIP remaining matched the signed WIP ledger projection for every test order:
  `30/30`, `0/0`, and `5/5`.
- WIP states ended as expected: partially consumed, fully consumed, and partially
  consumed.
- Confirmed outbox events: `3`.
- Temporary confirmation, WIP, ledger, and outbox fixture residue after teardown:
  `0`.

## Standing regressions

- Task 69 reservation regression: `15 PASS / 0 FAIL / 0 MANUAL`.
- SS-02 authorization: `777` matrix assertions plus `12` dealer-assignment checks
  passed.
- SS-03 audit: all `13` audited operations and immutability checks passed.
- Configuration suite: `31 pass / 3 existing warnings / 0 fail`.
