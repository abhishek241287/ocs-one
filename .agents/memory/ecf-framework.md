---
name: Engineering Correction Framework (ECF)
description: The platform pattern for correcting certified engineering records — one generic immutable ledger, module owns current state.
---

# Engineering Correction Framework (ECF)

The single audited correction process for OCS One. Generalized from the Cell-Grading
correction engine so every module corrects certified engineering records the same way
instead of re-implementing append-only/immutability/authorization logic.

**Rule:** one generic `engineering_corrections` ledger = the immutable history across
ALL modules; the module's own table stays the source of truth for *current* state. ECF
never owns "what is the value now."

**Why:** platform-improvement over module-specific (per the user's cert-wave triage
preference) — fix the correction pattern once, every module benefits.

**How to apply (adding a module):**
- First capture → `EngineeringCorrectionService.recordOriginal(tx, …)` (sequence 1) in
  the same tx that writes the module row.
- Correction route → lock the entity row (`SELECT … FOR UPDATE`), recompute, call
  `correct(tx, …)`, update the module snapshot, emit the module's OWN audit event.
- History → `getHistory(...)`, map to the module's API response shape.
- UI → reusable ODS `OdsCorrectionHistory` (map ledger rows to `OdsCorrectionEntry[]`).
- Add route to SS-02 (authz) + SS-01 (security matrix). Ledger immutability already
  covered by SS-03 — no per-module audit-immutability work.

**Non-obvious constraints / decisions:**
- The lib is deliberately module-agnostic — NO module vocabulary in columns or types
  (only entityType/entityId/previousValue/newValue/reason/performedBy/approvedBy/
  auditEventType/metadata). `sequence` = engineering VERSION (1 = original).
- Every row (originals included) gets a unique Correction ID `CORR-YYYYMMDD-NNNNNN`
  from a global Postgres sequence `ecf_correction_seq` (created at startup, like the
  mfg sequences) — collision-free under concurrency. Do NOT derive it from MAX().
- `validateCorrection` fails CLOSED: if `allowedRoles` is supplied, a non-blank
  `actorRole` is REQUIRED — otherwise the authz check would silently no-op and leak a
  correction past authorization. recordOriginal/correct also require non-blank
  performedBy + auditEventType.
- All writes run in a CALLER-PROVIDED tx so the ledger write commits atomically with
  the module state change + module audit event.
- SS-03 immutability covers the ledger (static scan of app routes + runtime
  byte-identical). The cert suite's OWN teardown deletes its throwaway fixture rows
  (cells, cell_lot_events, ledger rows, temp user) — this is allowed because the
  static scan EXCLUDES the `cert/` dir; immutability is enforced against app routes,
  not test fixtures. This matches the pre-existing cell_lot_events teardown precedent.
- Only Cell Grading is migrated (reference consumer). `cell_grade_measurements` table
  was dropped; `GET /cells/{id}/measurements` now maps the ledger to the identical
  `CellMeasurement` shape (added `correctionId`, `lotId` nullable).
