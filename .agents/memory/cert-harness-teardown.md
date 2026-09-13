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

# Generated document numbers do not prove namespace ownership

Certification API journeys can create globally generated GRN, transfer, inspection, or
workflow-assignment IDs that do not carry the harness prefix while still referencing
prefix-owned masters. Teardown must remove dependent rows through those controlled-master
relationships before deleting the master, while leaving unrelated document headers intact
unless the header itself is tied to a controlled supplier/model.

**Why:** prefix-only cleanup left generated rows holding foreign keys to FAT masters, so a
subsequent seed could fail before any certification case ran.

**How to apply:** for every controlled master, inspect its inbound FKs and include the
controlled-master relationship in child cleanup; do not rely only on generated document
number prefixes or captured IDs.

# WIP issue teardown ordering and baseline hygiene

For WIP certification fixtures, delete `wip_inventory` rows before deleting their referenced
`wip_issue_notes`; issue-note deletion otherwise fails on the WIP foreign key. Create warehouse
and location fixtures with the same stable prefix as lots/GRNs and include them in the final
residual-count assertion.

**Why:** a failed run can leave otherwise unreferenced warehouse/location rows, and the first
70-F run exposed that note-first cleanup leaves the whole transaction rolled back.

**How to apply:** use leaf-to-root cleanup (`wip_inventory` → issue lines/notes → reservations
and documents → masters → locations → warehouses), then assert zero fixture rows. For global
ledger hygiene checks, distinguish pre-existing baseline rows from rows involving the current
fixture IDs and disclose the baseline instead of silently filtering it.
