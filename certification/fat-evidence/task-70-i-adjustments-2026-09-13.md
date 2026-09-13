# Task 70-I — Physical Inventory Adjustments

**Date:** 2026-09-13  
**Environment:** development database and local API workflow only  
**Scope:** Separate count-style physical adjustment domain. No frontend, generated API edits, production changes, commits, or changes to consumption `/adjust`, Phase 4, returns, scrap, reservations, Option A transfers, MIN, or the FAT BMS exception.

## Implementation

The 70-I implementation adds:

- `inventory_adjustments.idempotency_key` with a unique constraint.
- `adjustment_seq` for adjustment numbering.
- `idx_adjustments_status` and `idx_adjustments_mat_wh`.
- Handwritten adjustment request schemas.
- Authenticated `/api/inventory/adjustments` routes:
  - `POST /` creates a draft and samples system quantity.
  - `POST /:id/submit` moves draft → submitted.
  - `POST /:id/approve` is director-only.
  - `POST /:id/reject` is supervisor/director.
  - `POST /:id/post` is supervisor/director.
  - `GET /` and `GET /:id` require authentication.
- Positive postings as `ADJUSTMENT_IN` with positive available quantity.
- Negative postings as `ADJUSTMENT_OUT` with negative available quantity.
- Genuine submitted → approved approval gate.
- Lot-required negative adjustments.
- Post-time negative-stock revalidation under the lot and GRN-line locks.
- `adjust-idem:` transaction advisory locks and duplicate-key replay fallback.
- Warehouse-level positive adjustments using `NULL` lot and `NULL` source line.
- Outbox and security audit events.

The existing ledger schema was updated only as required by D8:

- `source_line_id` is nullable for the documented warehouse-level positive case.
- `source_document_type` capacity supports the canonical `inventory_adjustment` label.
- Existing source-line consumers ignore null warehouse-level rows while preserving lot-line accounting.

## Focused 70-I certification

Command:

```text
pnpm --filter @workspace/api-server run test:task70-i-adjustments
```

Result: **11/11 PASS; zero residue**.

| Check | Result |
|---|---|
| Positive lot-scoped draft → submit → approve → post | PASS |
| Negative lot-scoped `ADJUSTMENT_OUT` posting | PASS |
| Negative without lot rejected at create with 422 | PASS |
| Over-available negative rejected at post with zero mutation | PASS |
| Warehouse-level positive with null lot/source line | PASS |
| Same-key idempotency: one ledger row and one outbox event | PASS |
| Same-lot negative adjustment race: one winner, one 409, zero loser mutation | PASS |
| Adjustment-versus-issue overlap preserves nonnegative available stock | PASS |
| Consumption `/adjust` remains annotation-only with no ledger delta | PASS |
| Read/write authentication and role guards | PASS |
| INV-P5-03 wall queries | PASS |
| Prefix residue cleanup | PASS |

The runner used isolated development fixtures for materials, GRNs, lots, warehouses, reservations, WIP issues, adjustments, consumptions, and users. No 70-I fixture rows remained.

## Regression evidence

The following checks passed after the 70-I changes:

- 70-I focused suite: **11/11**
- Reservation regression: **15/15**
- Procurement PO regression: **15/15**
- Receiving regression: **12/12**
- Phase 4 WIP suite: **17/17**
- Phase 4 invariants: **PASS**
- Option A transfer regression: **PASS**
- 70-H scrap suite: **10/10**
- SS-02 authorization: **777 assertions plus 12 dealer-assignment checks PASS**
- SS-03 audit verification: **13/13 PASS; immutable audit records PASS**
- SS-04 configuration integrity: **31 pass, 3 development-only warnings, 0 fail**
- FAT read-only smoke: **32/32**
- Existing 70-G return evidence remains recorded in `task-70-g-returns-2026-09-13.md`; 70-I does not modify return arithmetic.

INV-P5-03 returned zero mismatches:

- Every posted adjustment has exactly one matching signed ledger row.
- No adjustment ledger row exists without a posted adjustment.
- No negative available balance was introduced.

INV-P5-06 passed in the focused suite: consumption `/adjust` changed annotation state only and produced no additional ledger rows.

The Phase 4 invariant output again disclosed the pre-existing FAT BMS WIP balance:

```text
material_id=fa130000-0000-4000-8000-000000000017
stock_state=wip
balance=-0.500
```

This baseline remains visible and was not repaired or suppressed.

## Verification notes

- Development schema push completed through the pseudo-TTY sequence selector with **create sequence** chosen for `adjustment_seq`.
- Library and API TypeScript checks passed.
- `git diff --check` passed.
- API health remained available after rebuild/restart.
- No commit was created.

This is execution evidence for review; the agent does not self-certify the release.