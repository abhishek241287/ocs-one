---
name: Grading Import Framework
description: Adapter pattern that lets future Excel/CSV/machine grading imports reuse the ONE grading engine; manual entry is the one-row reference source.
---

# Grading Import Framework (Cell Grading)

**Rule:** there is exactly ONE grading engine — `calcGrade()` (private fn in
`artifacts/api-server/src/routes/cells/cells.ts`), shared by `POST /:id/grade` and
`POST /:id/correct`. Never introduce a second grading engine. Every import source must
funnel into this one engine.

**Pipeline (every source, manual + bulk):**
Source → `GradingImportSource.read()` → normalized `GradingMeasurementRecord[]`
→ Validation → Preview → Operator Approval → `calcGrade()` engine → ECF → Audit.

**Phase 1 (v1.0) — extension points only, ADDITIVE:** lives in
`artifacts/api-server/src/routes/cells/import/` (`types.ts`, `manual-source.ts`,
`validate.ts`, `index.ts`). The certified manual route is **left untouched** — manual
entry stays the certified reference. `ManualGradingSource` = the trivial one-row source.
Excel/CSV are RESERVED enum values with NO parsers; PDF/Word/Machine API/OPC-UA/Modbus
are out of scope (no code, no enum values).

**Why:** prevents the classic "automatic machine grading drifts from manual grading"
defect — both paths provably share one engine, one validation contract, one ECF/audit.

**Validation must mirror `GradeCellBody` or it is not real parity** (architect caught
this): import `validateRecord`/`validateContext` must enforce the SAME rules as the Zod
contract — measurement bounds (voltageV>0, capacityAh>0, IR≥0), `overrideStatus` ∈
{approved,rejected,quarantine,"null"} (keep `GRADING_OVERRIDE_STATUSES` const in lockstep
with the generated enum), and non-blank trimmed operator attribution (DEF-CW02-005).
External adapters hand raw strings, so domain-check `overrideStatus` at RUNTIME (cast to
`readonly string[]`) — the compile-time union alone is not enough.

**Deferred (needs re-cert, NOT Phase 1):** extracting `calcGrade` + the duplicated
status-derivation + config-default into a single `grading-engine.ts` module, and wiring
the live manual route through `ManualGradingSource`.

Full review: `docs/architecture/grading-import-framework-review.md`.
