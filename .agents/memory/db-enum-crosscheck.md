---
name: DB enum cross-check
description: Enum values in Postgres queries must match schema exactly — wrong values cause runtime 500s, not TypeScript errors.
---

## Rule
Before writing any SQL `filter (where column = 'value')` query, grep the schema file for the pgEnum definition and read every value. TypeScript will not catch invalid enum string literals in `sql<T>\`...\`` template expressions.

## Why
Drizzle's `sql<T>` tagged template is opaque to the type system — it accepts any string. Runtime 500s are the only signal. Discovered during Sprint 9.1 director dashboard: used `'in_grading'`, `'graded'`, `'matched'`, `'available'` for cells (actual enum: `received | grading | approved | rejected | quarantine | reserved | allocated`) and `'rework'` for QC decisions (actual enum: `approved | rejected` only).

## How to apply
When writing aggregation queries with conditional `filter (where ...)` clauses:
1. `grep -A10 "pgEnum.*status\|pgEnum.*decision\|pgEnum.*type" lib/db/src/schema/<table>.ts`
2. Copy every value literally into the SQL filter
3. Pay attention to tables with similar-sounding statuses that have different conventions (e.g. cell_status vs cell_match_status)

## Known enums (as of Sprint 9.1)
- `cell_status`: received | grading | approved | rejected | quarantine | reserved | allocated
- `cell_match_status`: draft | reserved | allocated | cancelled
- `mfg_qc_decision`: approved | rejected  (NO rework — rework is a separate tickets table)
- `mfg_rework_status`: open | in_progress | resolved | closed
- `mfg_order_status`: draft | in_progress | completed | on_hold | cancelled
- `mfg_stage_status`: pending | in_progress | completed | approved | rejected
- `mfg_charger_status`: available | busy | maintenance
- `test_equipment_floor_status`: available | busy | maintenance
