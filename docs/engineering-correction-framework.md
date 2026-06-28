# Engineering Correction Framework (ECF)

> **Status:** Platform framework — **FROZEN at v1.0** (CTO-approved, pre-MAT-03).
> Reference consumer: **Cell Grading**. No other module is migrated yet (by direction).

## v1.0 Freeze (CTO directive — binding)

ECF v1.0 is **frozen**. The framework is a core platform service, not a Cell-Grading
feature. The following are now stable platform contracts and **must not change during
CW-02**:

- **Frozen interfaces** (stable — do not alter signatures or semantics):
  `recordOriginal()`, `correct()`, `getHistory()`, `validateCorrection()`.
- **Single immutable history.** The generic `engineering_corrections` ledger is the
  one correction history for every manufacturing module. **No module may implement its
  own correction history.**
- **Mandatory-integration rule.** Every manufacturing module that allows correction
  *must* integrate with ECF — Cell Grading, Charging, Testing, Quality Control,
  Battery Assembly, Packing, Dispatch, Warranty, and all future modules. Module tables
  remain the source of truth for current values; ECF remains the immutable engineering
  history. (Integration of additional modules is **future work — not during CW-02**.)
- **Engineering Version is a platform concept.** `sequence` = Engineering Version:
  `1` = original measurement, `2+` = engineering corrections. It **must always travel
  with the correction history and must never be reset or renumbered.**
- **Correction ID is the official engineering reference number.** `CORR-YYYYMMDD-NNNNNN`
  is the human-readable reference that operators, supervisors, auditors, service
  engineers, and customers all use when discussing a correction.

**No further ECF expansion during CW-02.** Continue Cell Grading certification on the
frozen framework. Any improvement from this point is an **ECF v1.1 enhancement request**
(see backlog below), to be considered only after all certification waves complete.

### ECF scorecard (adoption + health)

Platforms are measured by **adoption** *and* **platform health** (full operational
dashboard for all frozen platforms: `docs/platform-scorecard.md`).

| Field | Value |
|-------|-------|
| Version | v1.0 |
| Freeze Status | FROZEN |
| Modules Using It | 1 — Cell Grading (reference consumer) |
| Last Platform Change | v1.0 extraction + freeze (CW-02, 2026-06-28) |
| Open Critical Defects | 0 |
| Open High Defects | 0 |
| Breaking Changes Since Freeze | 0 |
| Certification Status | ✅ Standing gates green (SS-02/SS-03/SS-04); ledger in SS-03 immutability suite |
| Next Planned Version | v1.1 (post-certification roadmap) |
| Enhancement Backlog Count | 5 (ECF-001…ECF-005) |

Grow **Modules Using It** across correction-allowing modules (future work, not during cert
waves) while v1.0 stays put and the health metrics (open Critical/High defects, breaking
changes) stay at 0.

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

> Adding a module reuses the **frozen** v1.0 interfaces unchanged. If a module genuinely
> needs new framework capability, that is an ECF v1.1 enhancement request — not a v1.0
> change.

## ECF Compatibility Rule (CTO directive — binding)

ECF is a platform service. **Once a module begins using ECF, its integration contract
must remain backward compatible.** Future ECF versions (v1.1, v1.2, …) may *add*
capabilities, but they must not require changes to existing certified modules:

- Existing APIs must continue to work.
- Existing correction records must remain readable.
- Existing Correction IDs must never change.
- Existing Engineering Versions must remain valid.
- New capabilities must be **additive, never breaking**.

If a future enhancement genuinely requires a breaking change, it must be released as
**ECF v2.0** — only after an explicit migration plan and a compatibility review. No
breaking change ships under a v1.x label.

## ECF Enhancement Backlog (do NOT implement during certification waves)

Maintained per CTO directive. Items are **not** built during certification waves; they
are considered only after all cert waves complete — unless a certification defect
requires a platform fix. Every item is designed to be additive under the Compatibility
Rule (the `metadata` JSONB column is the natural extension point, so the frozen
correction API stays unchanged).

| ID | Description | Business Value | Impacted Modules | Complexity | Target Version |
|----|-------------|----------------|------------------|------------|----------------|
| **ECF-001** | Correction Attachments (PDF, Excel, images — e.g. machine PDF, grading Excel, oscilloscope image, QC photo, signed NCR, calibration certificate) | Evidentiary traceability; auditors/customers can inspect source artifacts behind a correction | All correction-enabled modules (Cell Grading first) | Medium | v1.1 |
| **ECF-002** | Digital Approval Signatures | Non-repudiable sign-off on corrections; stronger audit & compliance posture | All correction-enabled modules | Medium | v1.1 |
| **ECF-003** | Multi-level Engineering Approval Workflow | Routes high-impact corrections through tiered approvals before they take effect | All correction-enabled modules | High | v1.2 |
| **ECF-004** | Electronic NCR / CAPA Integration | Links corrections to non-conformance / corrective-action records for closed-loop quality | QC, Testing, Cell Grading, Warranty | High | v1.2 |
| **ECF-005** | External ERP / MES Synchronization | Propagates correction history to external ERP/MES for plant-wide consistency | All correction-enabled modules | High | v2.0 (likely breaking — migration plan required) |

> **No further ECF development is authorized during CW-02.** Continue Cell Grading
> certification on the frozen ECF v1.0 platform. New ECF work is considered only after all
> certification waves complete, unless a certification defect requires a platform fix.
