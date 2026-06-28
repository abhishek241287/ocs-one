# Cell Grading — Automatic Import Architecture

> **STATUS: DESIGN ONLY — NOT FOR IMPLEMENTATION.**
> Produced during CW-02 at CTO direction to define a stable architecture *before* any import
> method is built. Nothing in this document is to be implemented until a specific adapter is
> explicitly authorized in a future wave. It introduces **no** changes to the frozen OCS One
> Foundation v1.0 platform.

| Field | Value |
|-------|-------|
| Author | Replit Agent (architecture) |
| Date | 2026-06-28 |
| Wave | CW-02 — Cell Grading |
| Scope | Grading-data ingestion only (does not change grade math, RBAC, or audit contracts) |

---

## 1. Problem & Goals

Cells are graded today by **manual entry** (one cell at a time via the Grade dialog). The
factory's grading machines currently export **Word/PDF**; **Excel** import is wanted later, and
some machines may expose a **direct API** or **OPC-UA/Modbus** in future.

**Goal:** design grading around a single **common import interface** so that adding any new
input method later is a *new adapter*, not a redesign of the grading module. The existing
graded-cell write path (`POST /cells/:id/grade` → `calcGrade` → audit) stays the **one** place
where a measurement becomes a graded cell.

**Non-goals:** changing the grade formula, the status machine, RBAC, or the audit trail; those
are frozen and shared by every import path.

---

## 2. Design Principle — one interface, many adapters

```
 ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
 │   Manual     │   │ Excel upload │   │  PDF / Word  │   │ Machine API  │   │ OPC-UA/Modbus│
 │  (current)   │   │   (future)   │   │   (future)   │   │   (future)   │   │   (future)   │
 └──────┬───────┘   └──────┬───────┘   └──────┬───────┘   └──────┬───────┘   └──────┬───────┘
        │                  │                  │                  │                  │
        ▼                  ▼                  ▼                  ▼                  ▼
        └──────────────  GradingImportSource (common interface)  ────────────────┘
                                            │
                          parse → normalize → validate → STAGE
                                            │
                              operator review & confirm (UI)
                                            │
                         commit → existing graded-cell write path
                       (calcGrade + status machine + cell_lot_events audit)
```

Every adapter's only job is to turn its native input into a list of **canonical grading
measurements**. Everything after the interface boundary is shared and already certified.

---

## 3. Canonical Grading Measurement (the contract)

The single normalized record every adapter must produce. It mirrors today's `GradeCellBody`
plus the fields needed to match a reading back to a known cell.

```ts
interface CanonicalGradingMeasurement {
  // Identity — how this reading maps to a cell record
  cellId?: string;          // serial barcode if present
  lotNumber?: string;       // fallback grouping when only position is known
  position?: number;        // tray/slot index within a lot/run
  // Measurements (SI units, same as manual entry)
  voltageV: number;
  capacityAh: number;
  internalResistanceMohm: number;
  temperatureC?: number | null;
  // Provenance
  gradingMachineId?: string | null;
  measuredAt?: string | null;   // ISO; machine timestamp if available
  sourceRef?: string;           // file name / API page / register block (audit)
  raw?: Record<string, unknown>; // untransformed source row (audit/debug)
}
```

**Identity resolution** (shared, deterministic): `cellId` → else `(lotNumber, position)` →
else flag as `UNMATCHED` for manual reconciliation. No silent guessing.

---

## 4. Adapter interface

```ts
interface GradingImportSource {
  kind: "manual" | "excel" | "document" | "machine-api" | "opcua-modbus";
  // Pull/parse native input into canonical rows. Pure: no DB writes.
  extract(input: ImportInput): Promise<CanonicalGradingMeasurement[]>;
  // Optional per-source field mapping (e.g. machine column → canonical field)
  mapping?: SourceFieldMapping;
}
```

Adapters never call the DB and never compute grades — they only **extract + normalize**. This
keeps grade math and audit in exactly one certified place.

### 4.1 Manual (current)
The existing dialog is the reference adapter: it already produces one canonical record and
posts it to `POST /cells/:id/grade`. No change. It validates the interface by being the first
consumer of it.

### 4.2 Excel upload (future)
`.xlsx`/`.csv` → rows. A saved **column-mapping profile per machine model** maps spreadsheet
columns to canonical fields. Produces N canonical records → batch stage. Library: a spreadsheet
parser (e.g. SheetJS) behind the adapter only.

### 4.3 PDF / Word parser (future — matches today's machine export)
Machine exports Word/PDF tables. Adapter extracts tabular text (PDF text layer / `.docx` XML),
then applies a **template profile** (table location + column order) per machine model. Scanned
/ image-only PDFs are explicitly out of scope unless OCR is later authorized. Low-confidence
extractions are staged as `NEEDS_REVIEW`, never auto-committed.

### 4.4 Direct machine API (future)
Adapter is an HTTP/poll client to the machine's vendor API; credentials via the
environment-secrets mechanism (never hard-coded). Polls completed runs, maps the vendor payload
to canonical records. Same staging + confirm path.

### 4.5 OPC-UA / Modbus connector (future, if machines support it)
A connector service subscribes to OPC-UA nodes / reads Modbus registers, debounces a completed
measurement, and emits canonical records. This is a **separate long-running service** (its own
artifact), not in the API request path; it feeds the same staging queue. Most complex — lowest
priority — but the interface makes it additive.

---

## 5. Import pipeline (shared by every adapter)

1. **Ingest** — receive input (upload / poll / subscription).
2. **Extract** — adapter → `CanonicalGradingMeasurement[]` (pure).
3. **Normalize** — units, trimming, timestamp ISO.
4. **Resolve identity** — map each record to a cell (cellId → lot+position → UNMATCHED).
5. **Validate** — ranges + required fields, identical rules to manual entry; reject row-level.
6. **Stage** — write to a `grading_import_batches` / `_rows` staging area with status
   `PENDING | NEEDS_REVIEW | UNMATCHED | READY | COMMITTED | FAILED`. **Nothing touches the
   `cells` table yet.**
7. **Review & confirm** — operator sees a preview (matched count, exceptions, computed grade
   preview), fixes mappings, confirms.
8. **Commit** — for each READY row, call the **existing** graded-cell write path so
   `calcGrade`, the status machine, and `cell_lot_events` audit all run unchanged — per row, in
   a transaction.

**Cross-cutting:** idempotency key per (machine, run, cellId) to prevent double-commit;
row-level partial failure (one bad row never blocks the batch); every commit audited exactly as
manual grading is; batch + actor + sourceRef recorded for traceability.

---

## 6. Security & certification implications (when a phase is built)

- **SS-01** — each new endpoint (upload, batch list, confirm/commit) needs a security-matrix
  entry: auth required / min role (operator+ to import, supervisor+ to change mappings) / audit
  / rate-limited / input-validated / output-sanitised.
- **SS-02** — new endpoints added to `authz-matrix` × 5 principals.
- **SS-03** — staging is auditable, but the **authoritative grade audit stays the existing
  `cell_lot_events` `cell_graded` event** emitted at commit — no new audit store.
- **SS-04** — any new config (mapping profiles, machine endpoints) added to config-integrity.
- File uploads: size/type limits, parse in a sandbox, never execute embedded content.
- Machine-API / OPC-UA credentials: environment-secrets only.

---

## 7. Phasing roadmap (proposed; each phase separately authorized)

| Phase | Adapter | Effort | Notes |
|-------|---------|--------|-------|
| 0 (now) | Manual | — | Already live; reference consumer of the interface. |
| 1 | Excel upload | S–M | Highest near-term value; column-mapping profiles. |
| 2 | PDF/Word parser | M | Matches current machine export; template profiles. |
| 3 | Direct machine API | M–L | Vendor-specific; secrets + polling. |
| 4 | OPC-UA / Modbus | L | Separate connector service; only if machines support it. |

**Build order rule:** introduce the staging tables + commit pipeline **with Phase 1**; do not
build them speculatively now. Phase 0 already proves the canonical contract.

---

## 8. What stays frozen vs. what changes per phase

- **Frozen / reused unchanged:** grade math (`calcGrade`), status machine, RBAC model,
  `cell_lot_events` audit, the per-cell commit path.
- **Added per phase (additive only):** one adapter, optional mapping profile, staging tables
  (once, in Phase 1), and the review/confirm UI.

The design's payoff: **the grading module never gets redesigned** — new input methods are new
adapters behind a stable interface.

---

## 9. Open questions for the CTO (before Phase 1)

1. Confirm the exact machine model(s) and a sample Word/PDF and Excel export to anchor template
   profiles.
2. Identity: do machine exports carry the cell serial (`cellId`), or only tray position?
3. Is an operator confirm-before-commit step required (recommended), or is trusted
   auto-commit acceptable for a calibrated machine?
4. Expected batch size (cells per run) — drives performance budget for the commit loop.
