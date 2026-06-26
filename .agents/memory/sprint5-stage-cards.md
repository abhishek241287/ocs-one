---
name: Sprint 5 Stage Card Patterns
description: Conventions and gotchas for manufacturing stage card components in OCS One
---

## Stage card file layout
- `src/features/manufacturing/components/stage-cards/` — one file per stage type
- `StageCard.tsx` — pure dispatcher: switch on `stage.stageType`, render the matching card; generic fallback for future stages
- `StageApprovalSection.tsx` — shared approve/reject widget, reused by all Sprint 5 cards

## BMS Master API field names
Orval generates BmsMaster fields as **snake_case** (matching DB column names), NOT camelCase:
- `has_bluetooth`, `has_can`, `has_uart`, `has_rs485`
- `firmware_version`, `cell_support_count`, `current_rating_a`, `min_voltage_v`, `max_voltage_v`

**Why:** The OpenAPI spec for BMS Master was written with snake_case property names (matching the DB schema). Orval preserves these names verbatim.

**How to apply:** Always use snake_case when referencing BmsMaster fields in JSX/TypeScript.

## TypeScript unknown in JSX
`stageData` is typed as `Record<string, unknown>` (JSONB). Accessing a key gives `unknown`, which cannot be rendered in JSX or used in `&&` chains without casting.

Patterns:
- Conditional: `!!sd.myField && ...` (never just `sd.myField &&`)
- Render: `{String(sd.myField ?? "—")}` (never `{sd.myField as string}`)

## Stage sequence (Sprint 5)
`cell_allocation → assembly → compression → bms_allocation → bms_programming → charging → testing → quality_control → packing`

This is enforced in: DB enum, StageStepper.tsx STAGE_SEQUENCE, stages.ts helpers (getNextStage).

## Stage-specific side effects on complete
- `cell_allocation`: links match → sets order.cellMatchId, marks cells allocated, writes cell genealogy (1 row per cell)
- `assembly`: writes cabinet/busbar/connector genealogy rows
- `bms_allocation`: writes BMS genealogy row (looks up master for name)
- Other stages: no auto-genealogy

## Route fix
`/manufacturing` needs a redirect to `/manufacturing/orders` in App.tsx — the wouter router has no catch-all for `/manufacturing`.
