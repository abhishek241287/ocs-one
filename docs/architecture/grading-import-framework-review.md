# Architecture Review — Grading Import Framework (CW-02, Phase 1)

> **Status: ARCHITECTURE REVIEW + Phase 1 extension points.** Prepares Cell Grading for future
> machine/file imports while keeping the **manual workflow as the certified reference
> implementation**. **No machine integration. No behavioural change to manual entry.**
> _Prepared: 2026-06-28 (during CW-02, Cell Grading)._

## 0. TL;DR

- There is **exactly one grading engine** today — `calcGrade()` — shared by both the grade and
  correct routes. ✔ (Deliverable 2)
- **No grading-logic duplication.** Two *non-engine* blocks are duplicated verbatim between the two
  routes (status-derivation + config-default fallback) — minor, noted for a future consolidation, not
  a second engine. (Deliverable 3)
- Recommended architecture: a thin **`GradingImportSource`** adapter that normalizes every source
  into one `GradingMeasurementRecord[]`, funnelled through **Validation → Preview → Operator Approval
  → the existing engine → ECF → Audit**. (Deliverables 4–5)
- **Phase 1 implemented (additive only):** the adapter interface + normalized record type + a
  `ManualGradingSource` reference + the Validation/Preview stage helpers. The certified
  `POST /:id/grade` route is **untouched**. Excel/CSV are *reserved* (no parsers); PDF/Word/API/
  OPC-UA/Modbus are out of scope entirely. (Deliverable 7)
- **Recommendation: ✅ APPROVED — Phase 1 extension points only.** (Deliverable 6)

## 1. Current Cell Grading architecture (reviewed)

All grading lives in `artifacts/api-server/src/routes/cells/cells.ts`:

| Route | Purpose | Engine | History |
|-------|---------|--------|---------|
| `POST /:id/grade` | Operator grades a `received`/`grading` cell | `calcGrade()` | ECF `recordOriginal` (entityType `CELL`, v1) |
| `POST /:id/correct` (supervisor/director) | Re-grade a graded cell, mandatory reason | `calcGrade()` | ECF `correct` (append next version) |
| `GET /:id/measurements` | Full append-only genealogy | — | ECF `getHistory` → mapped to `CellMeasurement` shape |

- **Inputs** (Zod `GradeCellBody` / `CorrectCellBody`): `voltageV` (>0), `capacityAh` (>0),
  `internalResistanceMohm` (≥0), `temperatureC?`, `gradingMachineId?`, `gradingNotes?`,
  `overrideStatus?`, plus attribution (`gradedBy` / `correctedBy`) and mandatory `correctionReason`
  on correct.
- **Engine** `calcGrade(capacityAh, irMohm, nominalCapAh, cfg) → "A"|"B"|"C"|"reject"`: pure
  function of capacity-% and IR-multiple vs the `cell_grade_config` thresholds.
- **State**: `cells` table holds the active snapshot; ECF `engineering_corrections` is the immutable
  ledger. The correct route re-reads the row `FOR UPDATE` inside the tx (TOCTOU-safe) and ECF assigns
  the version + Correction ID atomically.

## 2. Verification — only one grading engine exists ✔

`calcGrade()` is the single grade-derivation function and is the **only** place capacity/IR map to a
grade. Both `POST /:id/grade` and `POST /:id/correct` call it with identical arguments. **Confirmed:
one engine, no parallel implementation.**

## 3. Duplication review

| Item | Duplicated? | Verdict |
|------|-------------|---------|
| Grade derivation (`calcGrade`) | **No** — single shared function | The engine is clean. |
| Status derivation (`overrideStatus` → `reject`→`rejected` → else `approved`) | **Yes** — verbatim in both routes | *Non-engine* orchestration; candidate to fold into the engine as `deriveStatus()`. Minor. |
| `cfg` default-threshold fallback object | **Yes** — verbatim in both routes | Candidate to hoist to one constant. Minor. |

Neither duplicated block is a grading engine. **Recommendation (future, not Phase 1):** when the
import pipeline is wired, consolidate `calcGrade` + status-derivation + the config default into a
single `grading-engine.ts` module so manual and import paths provably share one engine end-to-end.
Deferred because it edits the certified route and would require re-certification — out of scope for a
non-behavioural Phase 1.

## 4. Recommended adapter architecture

```
 Manual Entry   Excel Import   CSV Import   (PDF/Word/API/OPC-UA/Modbus — NOT in scope)
      │              │             │
      └──────────────┴─────────────┘
                     ▼
         GradingImportSource.read()          ← adapters ONLY normalize; never grade
                     ▼
        GradingMeasurementRecord[]           ← one canonical, source-agnostic row shape
                     ▼
              Validation (validateRecord)     ← mirrors the GradeCellBody Zod contract
                     ▼
              Preview  (buildPreview)         ← operator sees valid/invalid rows
                     ▼
            Operator Approval                 ← human gate, manual + bulk alike
                     ▼
     Existing Grading Engine (calcGrade)      ← the ONE engine, unchanged
                     ▼
                    ECF                        ← recordOriginal / correct (unchanged)
                     ▼
                   Audit                       ← cell_lot_events / security_events (unchanged)
```

Key properties:
- Adapters depend on **nothing** but the normalized record type — no engine, ECF, or DB coupling.
- Manual entry is simply the **one-row** case of the same contract (`ManualGradingSource`).
- The engine, ECF, and audit layers are **consumed unmodified** — full alignment with the frozen
  platforms (ODS/ECF/Security/Cert).

## 5. `GradingImportSource` interface — beneficial? **Yes.**

It is the smallest abstraction that guarantees the one-engine rule: any number of future sources
implement a single `read(): GradingMeasurementRecord[]` method and inherit Validation/Preview/Approval/
Engine/ECF/Audit for free. It adds no runtime cost to manual entry and zero coupling to parsers.

## 6. Final recommendation

### ✅ APPROVED — implement Phase 1 extension points only

**Conditions (all met by this change):**
1. **Additive only** — new files under `artifacts/api-server/src/routes/cells/import/`; no certified
   route, schema, engine, or generated contract modified.
2. **Manual entry remains the certified reference** — `POST /:id/grade` is byte-identical; the
   adapter is not wired into the live path.
3. **No machine integration; Excel/CSV reserved (no parsers); PDF/Word/API/OPC-UA/Modbus excluded.**
4. Engine consolidation (§3) and live-route wiring are **future, re-certified phases**, not Phase 1.

## 7. Phase 1 — what was implemented

New, additive module `artifacts/api-server/src/routes/cells/import/`:

| File | Role |
|------|------|
| `types.ts` | `GradingImportSourceType` (`manual` active; `excel`/`csv` reserved), `GradingMeasurementRecord` (normalized row), `GradingImportSource` adapter contract, context/validation/preview types |
| `manual-source.ts` | `ManualGradingSource` — reference adapter proving manual entry is the one-row import case |
| `validate.ts` | `validateRecord()` + `validateContext()` + `buildPreview()` — the Validation/Preview pipeline stages. Faithfully mirrors the certified `GradeCellBody` contract: measurement bounds, `overrideStatus` ∈ {approved,rejected,quarantine,"null"}, and non-blank operator attribution (DEF-CW02-005) |
| `index.ts` | Barrel |

**Not implemented (by design):** Excel/CSV parsers, any machine/protocol client, live-route rewiring,
engine extraction. These are reserved for post-approval phases and must not change manual behaviour or
the certified codebase without re-certification.
