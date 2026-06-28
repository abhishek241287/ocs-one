---
name: Cert-harness teardown design
description: How to write fixture teardown for live cert batches so it actually reaches 0 residual
---

# Cert-harness teardown must be set-based and prefix-scoped, never captured-ID

When a live certification harness creates throwaway fixtures, tear them down by a **stable
prefix tag** (e.g. `MAT04-CERT-`) using set-based DELETEs with subqueries — NOT by IDs captured
in JS variables during the run.

**Why:** a prior failed/partial run leaves orphan fixtures the current run never captured. A
leftover row can hold an FK that blocks deletion of the current run's data too (e.g. a leftover
`mfg_production_orders.cell_match_id` pinning an `allocated` `cell_matches` row). Captured-ID
teardown only ever cleans the current run, so residual silently accumulates and doubles each run.

**How to apply:**
- Tag every fixture with one searchable prefix; teardown deletes `WHERE … LIKE 'PREFIX-%'` /
  `created_by LIKE 'PREFIX%'` / `factory_manager='PREFIX'` regardless of which run made it.
- Break FKs before deleting parents: null child FK columns first (`cells.match_id`,
  `cells.allocation_order_id`, `mfg_production_orders.cell_match_id`), then delete leaf→root.
- Always end with an explicit residual-count SELECT across every table touched and assert 0.

# `executeSql` returns DB errors as text, it does NOT throw

A failing statement (FK violation, type-cast error) comes back as an error STRING in
`r.output`; the JS `await` resolves normally, so a `try/catch` around teardown catches nothing
and the failure is invisible. **Print every teardown statement's `.output`** (per-statement
label) so silent FK/cast failures surface, and verify residual independently — do not trust
"no exception thrown" as success.

# Grading writes ECF ledger rows — teardown must clear engineering_corrections

Because Cell Grading is migrated onto the ECF, the FIRST grade of a cell appends an
`engineering_corrections` *original* row (`sequence=1`, `performed_by` = the grader name). A
cert harness that grades cells therefore creates ledger rows that must be torn down too — delete
by `performed_by='<harness tag>'` (entity_id is `text`, so `entity_id IN (SELECT id FROM cells…)`
fails with `text = uuid`; either cast `id::text` or just key off `performed_by`).
