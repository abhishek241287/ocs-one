# Engineering Correction Framework (ECF)

> **Status:** Platform framework — CTO-approved (pre-MAT-03). Reference consumer:
> **Cell Grading**. No other module is migrated yet (by direction).

The ECF is OCS One's **single, audited correction process**. Any module that holds
a *certified engineering record* (a graded cell, a charge profile, a QC result, a
test report, …) corrects that record through the ECF instead of re-implementing its
own append-only/immutability/authorization logic. This is the platform-improvement
generalization of the Cell-Grading correction engine (DEF-CW02-006).

## Core principle

- **One generic ledger = the immutable history.** `engineering_corrections` stores
  every version of every corrected record across all modules.
- **The module table stays the source of truth for *current* state.** ECF never owns
  "what is the value now" — the module's own row (e.g. `cells`) holds the active
  snapshot. ECF owns "how did it get here, who changed it, and why" — forever.

## What the framework owns vs. what the module owns

| Framework (ECF lib) | Module (e.g. Cell Grading) |
|---------------------|----------------------------|
| Append-only storage | The entity row + its `SELECT … FOR UPDATE` row lock |
| Engineering-version (`sequence`) generation | Business rules & state transitions |
| Unique Correction ID generation | Value recalculation (e.g. recompute grade) |
| Reason + actor validation | The active-state snapshot update |
| Authorization (`actorRole ∈ allowedRoles`) | Its own module audit event (e.g. `cell_lot_events`) |
| Immutability (no update/delete, ever) | Mapping the ledger back to its API response shape |

## Data model (`engineering_corrections`)

Deliberately module-agnostic — the columns carry no module vocabulary:

| Column | Meaning |
|--------|---------|
| `correctionId` | Globally-unique human ID `CORR-YYYYMMDD-NNNNNN` (every row, originals included) |
| `entityType` | ECF enum — `CELL`, `BATTERY`, `PACK`, `SHIPMENT`, `QC_RECORD`, `CHARGING_SESSION`, `TEST_RESULT`, `WARRANTY_CASE`, `INVERTER`, `SOLAR_SYSTEM`, `EV_CHARGER`, `RAW_MATERIAL`, `BMS`, `CABINET` |
| `entityId` | The module entity's id |
| `sequence` | **Engineering version.** `1` = original; each correction increments |
| `correctionType` | `original` \| `correction` |
| `previousValue` / `newValue` | JSONB value snapshots (module-shaped; ECF does not interpret them) |
| `reason` | Mandatory non-blank for `correction`; `null` for `original` |
| `performedBy` / `approvedBy` / `approvedAt` | Actor attribution |
| `auditEventType` | The module audit event this correction corresponds to |
| `metadata` | Free-form JSONB for module context |

`correctionId`'s numeric part comes from a global Postgres sequence
(`ecf_correction_seq`, created at startup) so it is collision-free under concurrency.

## Service API (`@workspace/ecf`)

`EngineeringCorrectionService` — every write runs inside a **caller-provided
transaction** so the ledger write commits atomically with the module's state change
and its module audit event.

```ts
import { EngineeringCorrectionService as ECF } from "@workspace/ecf";

// 1. Original baseline (version 1) — at first capture of the record.
await ECF.recordOriginal(tx, {
  entityType: "CELL",
  entityId: cell.id,
  newValue: { voltageV, capacityAh, internalResistanceMohm, grade, status },
  performedBy: gradedBy,
  auditEventType: "cell_graded",
  metadata: { lotId },
});

// 2. Correction (next version) — module MUST hold a row lock on the entity first.
await ECF.correct(tx, {
  entityType: "CELL",
  entityId: cell.id,
  previousValue: prevSnapshot,
  newValue: nextSnapshot,
  correctionReason,            // mandatory, non-blank — else EcfValidationError
  performedBy: correctedBy,
  actorRole,                   // e.g. "supervisor"
  allowedRoles: ["supervisor", "director"],  // else EcfAuthorizationError
  auditEventType: "cell_grade_corrected",
});

// 3. History (genealogy, oldest version first).
const history = await ECF.getHistory(db, "CELL", cell.id);
```

`validateCorrection()` is exposed separately for callers that want to validate before
opening a transaction. Errors are typed: `EcfValidationError` (→ 400) and
`EcfAuthorizationError` (→ 403).

## UI — `OdsCorrectionHistory`

The reusable ODS component (`@/components/ods`) renders an ECF genealogy for **any**
entity. A module maps its ledger rows to `OdsCorrectionEntry[]` (version, type,
correctionId, performedBy, reason, timestamp, status, and the changed `fields[]` with
a previous→new diff). Cell Grading's grading page is the reference consumer (the
**History** action on any graded cell).

## Immutability guarantee (SS-03)

`engineering_corrections` is part of the SS-03 audit-immutability suite:
- **Static:** no application route issues `.update()`/`.delete()` against the ledger.
- **Runtime:** a captured ledger row is byte-identical after a full cert run.

## Adding a new module to the ECF (future work — not done yet)

1. On first capture → `recordOriginal(tx, …)` inside the same tx that writes the
   module row.
2. Add a module correction route that locks the entity row (`FOR UPDATE`),
   recomputes, calls `correct(tx, …)`, updates the module snapshot, and emits the
   module's own audit event.
3. Expose history via `getHistory(...)`, map to the module's response shape.
4. Render with `OdsCorrectionHistory`.
5. Add the route to SS-02 (authz) and SS-01 (security matrix). The ledger is already
   covered by SS-03 — no per-module audit-immutability work needed.
