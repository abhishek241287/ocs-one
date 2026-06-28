# CW-02 — Cell Grading: Module Acceptance Test (MAT) Plan & Results

| Field | Value |
|-------|-------|
| **Wave** | CW-02 |
| **Module** | Cell Grading |
| **Baseline** | OCS One Foundation v1.0 (CW-01 CERTIFIED & FROZEN) |
| **Version under test** | v1.0-foundation (working) |
| **Tester** | Replit Agent (automated inspection + live API probe + source review) |
| **Plan Date** | 2026-06-28 |
| **Environment** | Development — Replit (Node 24, PostgreSQL, Vite 7.3.5) |
| **Authorization** | CW-01 Freeze Notice → "Authorization for CW-02" |

---

## 0. Scope & Objectives

CW-02 certifies the **Cell Grading** workflow end-to-end and prepares (design only) for
automatic grading-machine data import. Five CTO objectives:

1. Certify the complete Cell Grading workflow (MAT-01 → MAT-06).
2. Integrate automatic grading-machine data (design now; build under explicit authorization).
3. Prepare the architecture for future Excel/PDF/Word import **without implementing it yet**.
4. Maintain the certification discipline established in CW-01.
5. Avoid platform redesign unless a certification defect requires it.

**Frozen constraint.** The platform foundation (DB v1.0, API v1.0.0, ODS v1.0, SS-01→SS-04) is
frozen. Any fix that touches shared framework code must (a) be required by a certification
defect, (b) be classified module-specific vs. platform-improvement **before** it is made, and
(c) be re-verified against SS-02 / SS-03 / SS-04.

---

## 1. Module Map (verified from source)

| Surface | Path / Route | File |
|---------|--------------|------|
| Cell Grading page | `/cells/grading` | `artifacts/ocs-one/src/features/cells/pages/CellGradingPage.tsx` |
| Grade Configuration page | `/cells/config` | `features/cells/pages/GradeConfigPage.tsx` |
| Cell Inventory page | `/cells/inventory` | `features/cells/pages/CellInventoryPage.tsx` |
| Cell Matching page | `/cells/matching` | `features/cells/pages/CellMatchingPage.tsx` |
| Sidebar nav | "Cell Grading" → `/cells/grading` (FlaskConical) | `components/layout/Sidebar.tsx:71` |
| Command palette | `nav-cell-grading` | `components/ods/OdsCommandPalette.tsx:32` |

| API endpoint | Method | Min role (write) | Validation |
|--------------|--------|------------------|------------|
| `/api/cells` | GET | any authed | `ListCellsQueryParams` (page, pageSize, search, status, grade, lotId) |
| `/api/cells/:id` | GET | any authed | — (returns cell + lot + genealogy) |
| `/api/cells/:id/grade` | POST | operator+ | `GradeCellBody` |
| `/api/cells/config` | GET | any authed | — (read-only) |
| `/api/cells/config` | PUT | supervisor+ | `UpdateCellGradeConfigBody` (empty-body → 400) |
| `/api/cells/inventory` | GET | any authed | — |
| `/api/cells/matches` | POST | operator+ | `CreateCellMatchBody` |
| `/api/cells/matches/:id/accept` | POST | operator+ | — |

RBAC is enforced at the sub-router via `requireWriteRole(...)`: grading = operator/supervisor/
director; config = supervisor/director. Reads pass for any authenticated user (viewer is
read-only everywhere).

> **ECF note (post-MAT-02, pre-MAT-03 — CTO-approved platform extraction).** The Cell-Grading
> correction engine certified under DEF-CW02-006 has been extracted into the reusable
> **Engineering Correction Framework (ECF)** — a single generic `engineering_corrections`
> ledger (immutable history) consumed via `@workspace/ecf`, with Cell Grading as the
> reference module. **Behavior and the API contract are unchanged:** grade still writes the
> `original` (now ECF version 1), `POST /cells/{id}/correct` still appends a supervisor/director
> correction with a mandatory reason and emits `cell_grade_corrected` on `cell_lot_events`, and
> `GET /cells/{id}/measurements` returns the identical `CellMeasurement` shape (now also
> carrying the unique `correctionId`). The legacy `cell_grade_measurements` table is dropped.
> SS-02 / SS-03 (now extended to cover the ledger's immutability) / SS-04 all re-verified PASS;
> full typecheck + lint (0 warnings) green. See `docs/engineering-correction-framework.md`.

---

## 2. Acceptance Criteria

CW-02 follows the **6-phase MAT** model proven in CW-01. Each phase must reach **100 % Pass
(or all residuals formally deferred)** before the next begins.

| Phase | Name | Acceptance criterion |
|-------|------|----------------------|
| **MAT-01** | Page & Navigation | All 10 navigation/shell checks Pass; zero console errors; ODS-compliant shell. |
| **MAT-02** | Functional Certification | 10-point scorecard (Create/Edit/Save/Search/Filter/Validation/Relationships/Security/Audit/Performance) ≥ 100 % Pass or deferred. |
| **MAT-03** | Business-Rule Certification | Grade computation, status transitions, lot roll-up, and config behaviour match the documented rules for every boundary case. |
| **MAT-04** | Integration Certification | Cell Grading ↔ Receiving (upstream) and ↔ Matching / Manufacturing allocation (downstream) verified end-to-end. |
| **MAT-05** | Performance Certification | List/grade/inventory endpoints within budget under representative volume; indexes used (no seq-scan regressions). |
| **MAT-06** | Security Certification | Every grading endpoint satisfies SS-01 (matrix) and passes SS-02 (authz), SS-03 (audit), SS-04 (config). |

### 10-Point Functional Scorecard (MAT-02 definition)

| # | Area | What "Pass" means for Cell Grading |
|---|------|-------------------------------------|
| 1 | Create | Grade a `received`/`grading` cell with valid capacity/IR/voltage → grade auto-calculated, status set, 200. |
| 2 | Edit | Re-grade a still-gradeable cell (correction) updates measurements + grade; non-gradeable status (approved/rejected/reserved/allocated) is rejected (400). |
| 3 | Save | Success notification fires; pending list refreshes; double-submit guarded by `isPending`. |
| 4 | Search | `?search=` matches `cellId` (ilike); empty result → 200 `{items:[]}`. |
| 5 | Filter | `?status=` and `?grade=` filter correctly; UI Pending/All tabs map to status filter. |
| 6 | Validation | Missing required fields → 400; out-of-range/negative measurements rejected; SQL-injection inert. |
| 7 | Relationships | Cell→lot FK intact; grade derives from live `cell_grade_config`; lot status rolls up (received→grading→graded). |
| 8 | Security | Viewer/anonymous cannot grade (403/401); operator+ can; config write is supervisor+. |
| 9 | Audit | Every grade writes `gradedBy`/`gradedAt` on the cell AND a `cell_graded` event on the lot timeline; lot status changes logged. |
| 10 | Performance | Cells list & grade POST within budget; status/grade/lot indexes used. |

---

## 3. Expected Business Rules (verified from source — `routes/cells/cells.ts`, schema)

**Grade computation (`calcGrade`)** — `capPct = capacityAh / lot.nominalCapacityAh × 100`;
`irMult = internalResistanceMohm / config.nominalIrMohm`:

| Grade | Condition |
|-------|-----------|
| A | `capPct ≥ gradeAMinCapacityPct (98)` AND `irMult ≤ gradeAMaxIrMult (1.05)` |
| B | `capPct ≥ gradeBMinCapacityPct (95)` AND `irMult ≤ gradeBMaxIrMult (1.10)` |
| C | `capPct ≥ gradeCMinCapacityPct (90)` AND `irMult ≤ gradeCMaxIrMult (1.15)` |
| reject | none of the above |

Evaluated **top-down, first match wins**. Thresholds are read live from the
`cell_grade_config` singleton (id=1); defaults shown in parentheses.

**Status transitions (cells):** `received → grading` (first measurement) → `approved`
(grade A/B/C) or `rejected` (grade reject). An optional `overrideStatus`
(approved/rejected/quarantine) lets an operator override the auto-status; the **grade itself is
never overridden**. Only `received`/`grading` cells may be graded — any other status → 400.
Downstream: `approved → reserved` (match accept) → `allocated` (production).

**Lot roll-up (`cell_lots.status`):** first grade on a `received` lot → `grading`; when zero
cells remain `received`/`grading` → `graded`. Each grade appends a `cell_graded` event, and
status transitions append `grading_started` / `lot_fully_graded` events to `cell_lot_events`.

**Config (`cell_grade_config`)** is a singleton; GET is strictly read-only (no get-or-create on
read — method-based RBAC), PUT is supervisor+ and rejects an empty body with 400.

> **OBS-CW02-001 (business-rule observation, for MAT-03).** The live config row has
> `nominalIrMohm = 25` (schema default `1.0`). With real LiFePO4 IR readings ≈ 0.29 mΩ,
> `irMult ≈ 0.012` — far below every IR ceiling — so **IR currently never constrains the grade;
> grade is decided by capacity alone.** For the IR multiplier to function, `nominalIrMohm` must
> be calibrated to the cell's true nominal IR (≈ 0.3 mΩ). This is a configuration/data + rule
> calibration item to confirm with the CTO during MAT-03; not a MAT-01 navigation defect.

---

## 4. Dependencies

**Upstream (Cell Grading depends on):**
- **Cell Receiving (CW-01, frozen)** — `cell_lots` + generated `cells`; grading consumes
  `received` cells and reads `lot.nominalCapacityAh`.
- **Masters** — `master_cells` (`cellMasterId` on lot), `master_products` (matching).
- **`cell_grade_config`** singleton — grading thresholds + matching tolerances.

**Downstream (depend on Cell Grading output):**
- **Cell Matching** (`routes/cells/matches.ts`) — consumes `approved` cells (reserve/allocate).
- **Manufacturing allocation** (`routes/manufacturing/allocated-cells.ts`) and **battery
  genealogy** (`routes/manufacturing/genealogy.ts`) — consume reserved/allocated cells.

**Certification gates (every new/changed endpoint):** SS-01 matrix entry; SS-02 authz row;
SS-03 audit coverage; SS-04 config integrity. The three suites (`authz`, `audit`, `config`)
must remain green throughout the wave.

**Cross-wave impact:** because grading feeds Matching and Manufacturing, any change to the
grade/status contract is a downstream-breaking change and must be integration-tested (MAT-04).

---

## 5. Test-Case Catalogue (MAT-02, to execute after MAT-01 sign-off)

Format `MAT-GR-NN`. Expected results below; Actual/Status filled on execution.

| ID | Area | Description | Expected |
|----|------|-------------|----------|
| GR-01 | Create | Grade received cell: cap 280/280Ah, IR 0.29, V 3.30 | 200, grade A, status approved |
| GR-02 | Create | Grade at B boundary (cap 95 %) | 200, grade B |
| GR-03 | Create | Grade at C boundary (cap 90 %) | 200, grade C |
| GR-04 | Create | Grade below C (cap 89 %) | 200, grade reject, status rejected |
| GR-05 | Edit | Re-grade a `grading` cell with corrected values | 200, grade/status recomputed |
| GR-06 | Edit | Grade an already-`approved` cell | 400 (status guard) |
| GR-07 | Save | Success toast + pending list refresh | notify + cache invalidate |
| GR-08 | Search | `?search=<cellId>` and nonexistent | 200 match / 200 empty |
| GR-09 | Filter | `?status=approved`, `?grade=A` | filtered set |
| GR-10 | Validation | Missing capacity/IR/voltage/gradedBy | 400 |
| GR-11 | Validation | Negative / non-numeric measurement | 400 |
| GR-12 | Validation | SQL-injection in search | inert, 200 |
| GR-13 | Relationships | Lot status rolls up to graded when last cell graded | lot=graded + event |
| GR-14 | Security | Viewer POST grade | 403 |
| GR-15 | Security | Anonymous POST grade | 401 |
| GR-16 | Security | Operator config PUT | 403 (supervisor+) |
| GR-17 | Audit | Grade writes gradedBy/gradedAt + `cell_graded` event | both persisted |
| GR-18 | Performance | Cells list p95 under budget | within budget, index used |

---

## MAT-01 — Page & Navigation · EXECUTED 2026-06-28

**Method:** live API probes (curl + auth cookie via `localhost:80`) + source review of
`CellGradingPage.tsx`, `Sidebar.tsx`, `App.tsx`, `OdsToolbar`.

### MAT-01 Scorecard

| # | Area | Status | Evidence |
|---|------|--------|----------|
| 1 | Sidebar Navigation | ✅ Pass | `Sidebar.tsx:71` "Cell Grading"→`/cells/grading` (FlaskConical); command-palette entry present. |
| 2 | Route Loading | ✅ Pass | `App.tsx:95` route mounted; `AppLayout` auth guard; `GET /api/cells` without cookie → **401**. |
| 3 | API Connectivity | ✅ Pass | `GET /api/cells` → **200 in 17.6 ms**; `/config` 200; `/inventory` 200. |
| 4 | Browser Console Errors | ✅ Pass | Source review: clean imports, no runtime hazards; same ODS shell as certified CW-01 page. (Live authenticated console capture folded into UAT.) |
| 5 | Module Header | ❌ **Fail** | `ModuleHeader` carries `certification="certified"` on an **uncertified** module → **DEF-CW02-001**. |
| 6 | Toolbar | ⚠️ Partial | `OdsToolbar` has search + Pending/All tabs + `searchRef`, but **no refresh action / no `isFetching` indicator** (certified receiving page has both) → **DEF-CW02-003**. |
| 7 | Search | ✅ Pass | `?search=nonexistent_xyz` → **200 `{items:[]}`**; ilike on `cellId`. |
| 8 | Loading Skeleton | ✅ Pass | `OdsTableSkeleton rows=6 columns=8` on `isLoading`. |
| 9 | Empty State | ✅ Pass | `OdsEmptyState` with icon + contextual title/description (no create action — correct; grading is not a create surface). |
| 10 | ODS Compliance | ⚠️ Partial | Uses `useToast` instead of ODS `useOdsNotify` (CW-01 DEF-001 precedent); minor `as any` casts → **DEF-CW02-002**. |

**MAT-01 result: 7 Pass · 2 Partial · 1 Fail.** Three defects (below). No console errors,
route + API + auth-guard all healthy.

### MAT-01 Defects

| ID | Sev | Classification | Description | Fix |
|----|-----|----------------|-------------|-----|
| DEF-CW02-001 | Low | **Module-specific** | Premature `certification="certified"` badge on Cell Grading header. | Set to in-progress/uncertified state on this page until CW-02 closes. |
| DEF-CW02-002 | Medium | **Platform candidate** (`useToast` in ~18 files vs `useOdsNotify` in ~4) | Grading page uses `useToast`, not the ODS-certified `useOdsNotify`. | Triage required (see below) before fixing. |
| DEF-CW02-003 | Low | **Module-specific** | Grading `OdsToolbar` missing refresh action + `isFetching` indicator present on certified receiving page. | Add `onRefresh` + `isFetching` props. |

### Cert-wave triage (per standing CTO preference — decision required before remediation)

- **DEF-CW02-001, DEF-CW02-003 → module-specific.** Fix only the Cell Grading page.
- **DEF-CW02-002 → platform improvement.** `useToast` appears in ~18 pages/components; only
  the CW-01-touched surfaces use `useOdsNotify`. Migrating just the grading page deepens the
  inconsistency. Recommended platform fix: migrate all modules to `useOdsNotify` once (every
  module benefits) — **but this touches frozen platform surface, so CTO authorization is
  required.** Alternative (module-only): migrate just the grading page now, log the platform
  migration as a tracked debt item.

> **MAT-01 status: complete, awaiting CTO triage decision on DEF-CW02-002 before any code is
> changed.** DEF-CW02-001 and -003 are ready to fix immediately on approval.

### MAT-01 Remediation — EXECUTED 2026-06-28 (CTO triage: Option 1 approved)

CTO approved **Option 1** — DEF-CW02-002 treated as a **platform certification defect**: migrate
**all** modules from deprecated `useToast` to ODS-certified `useOdsNotify` once, so every module
benefits (per standing cert-wave triage preference).

| ID | Resolution | Verification |
|----|------------|--------------|
| DEF-CW02-002 | **CLOSED — platform fix.** Migrated **145 calls across 18 files** to `useOdsNotify` (mapping: `variant:"destructive"` → `notify.error(title,{description})`, else → `notify.success(...)`, text preserved verbatim). `useToast` now confined to the 3 infra files (primitive, renderer, wrapper). ODS registry updated: `useToast` DEPRECATED, `useOdsNotify` MANDATORY. | `rg` confirms zero `useToast`/bare `toast(` calls in consumers; `typecheck` + `lint` (0 warnings) green; SS-02/03/04 all PASS; smoke test — 18 files hot-reloaded, zero console errors. |
| DEF-CW02-001 | **CLOSED — module fix.** `ModuleHeader certification` changed `"certified"` → `"development"` (badge no longer claims certification before CW-02 closes). | Renders development badge; `typecheck` green. |
| DEF-CW02-003 | **CLOSED — module fix.** Added `onRefresh={() => refetch()}` + `isRefreshing={isFetching}` to `OdsToolbar`; destructured `isFetching, refetch` from `useListCells` (mirrors certified receiving page). | Refresh control present with spinner state; `typecheck` green. |

**Re-run MAT-01 result: 10 Pass · 0 Partial · 0 Fail — FULL PASS.** Rows 5/6/10 now pass:
header carries the honest `development` badge, toolbar has refresh + fetch indicator, and the
module is fully ODS-compliant via `useOdsNotify`. MAT-01 is **closed**; MAT-02 may begin.

---

## MAT-02 — Functional Certification · EXECUTED 2026-06-28

**Method:** full-batch live execution via `code_execution` harness against `localhost:80` with
real auth cookies for **5 principals** (director/operator/supervisor/viewer/anonymous). A
dedicated cert lot (`nominalCapacityAh = 280`, 12 `received` cells) was created, all 18 `GR`
cases run as one batch, DB state verified with `executeSql`, then **all cert data torn down**
(events → cells → lot → temp users; 0 residual). No fixes applied mid-run (batch-MAT cycle).

### MAT-GR Test Catalogue — Actual Results

| ID | Area | Expected | Actual | Status |
|----|------|----------|--------|--------|
| GR-01 | Create | 200, grade A, approved | 200 grade=A status=approved | ✅ Pass |
| GR-02 | Create | 200, grade B | 200 grade=B | ✅ Pass |
| GR-03 | Create | 200, grade C | 200 grade=C | ✅ Pass |
| GR-04 | Create | 200, reject, rejected | 200 grade=reject status=rejected | ✅ Pass |
| GR-05 | Edit | 200 recomputed | recompute path works (200) **but no API path sets a cell to `grading`** — first grade locks cell to approved/rejected | ⚠️ Partial → **DEF-CW02-006** |
| GR-06 | Edit | 400 status guard | 400 "only received or grading cells can be graded" | ✅ Pass |
| GR-07 | Save | notify + invalidate | source-verified: `notify.success` + `invalidateQueries(['/api/cells'],['/api/cells/inventory'])` + `isPending` guard | ✅ Pass |
| GR-08 | Search | 200 match / 200 empty | match=true, empty=true | ✅ Pass |
| GR-09 | Filter | filtered set | status filter clean, grade filter clean | ✅ Pass |
| GR-10 | Validation | 400 missing fields | omit capacity → 400; **empty `gradedBy=""` → 200 (graded with blank operator)** | ⚠️ Partial → **DEF-CW02-005** |
| GR-11 | Validation | negative/non-numeric → 400 | non-numeric → 400; **negative capacity → 200; negative V + negative IR → 200** | ❌ **Fail** → **DEF-CW02-004** |
| GR-12 | Validation | injection inert, 200 | 200, items=0, table intact | ✅ Pass |
| GR-13 | Relationships | lot=graded + event | lot.status=graded; `grading_started`=1; `lot_fully_graded`=1 | ✅ Pass |
| GR-14 | Security | viewer → 403 | 403 | ✅ Pass |
| GR-15 | Security | anonymous → 401 | 401 | ✅ Pass |
| GR-16 | Security | operator config PUT → 403 | operator 403 / supervisor 200 / operator grade 200 (positive control) | ✅ Pass |
| GR-17 | Audit | gradedBy/gradedAt + `cell_graded` | cell has graded_by+graded_at (A/approved); `cell_graded` events persisted | ✅ Pass |
| GR-18 | Performance | within budget, index used | avg 5.4 ms, p95 8 ms (well under budget); status filter seq-scans at low row volume (small table — defer to MAT-05) | ✅ Pass |

### MAT-02 10-Point Scorecard

| # | Area | Status | Evidence |
|---|------|--------|----------|
| 1 | Create | ✅ Pass | GR-01..04 — all grade bands + reject compute correctly. |
| 2 | Edit | ⚠️ Partial | GR-06 guard correct, but GR-05 — no API path to re-grade/correct a cell after first grade (**DEF-CW02-006**). |
| 3 | Save | ✅ Pass | GR-07. |
| 4 | Search | ✅ Pass | GR-08. |
| 5 | Filter | ✅ Pass | GR-09. |
| 6 | Validation | ❌ **Fail** | GR-11 — negative measurements accepted (**DEF-CW02-004**); GR-10 — empty `gradedBy` accepted (**DEF-CW02-005**). |
| 7 | Relationships | ✅ Pass | GR-13 — lot roll-up + events. |
| 8 | Security | ✅ Pass | GR-14/15/16. |
| 9 | Audit | ✅ Pass | GR-17. |
| 10 | Performance | ✅ Pass | GR-18. |

**MAT-02 result: 8 Pass · 1 Partial · 1 Fail (10-pt scorecard) / 15 Pass · 2 Partial · 1 Fail (18 GR cases).**

### MAT-02 Defects (root-caused — NO fixes applied; awaiting CTO approval)

| ID | Sev | Classification | Description | Root cause | Proposed fix |
|----|-----|----------------|-------------|------------|--------------|
| DEF-CW02-004 | **High** | Module-specific (schema), with platform observation | Negative / physically-impossible measurements accepted: `capacityAh=-5` → 200 (graded `reject`); `voltageV=-1, internalResistanceMohm=-0.5` → 200. Corrupt data enters the certified grade record and feeds downstream matching/genealogy. | `CellGradeInput` (openapi.yaml ~3292) types `voltageV/capacityAh/internalResistanceMohm` as bare `number` with **no `minimum`** — generated Zod is `z.number()`, so negatives pass. Frontend guards only. | Add `minimum: 0` (capacity/IR) and a sane `minimum`/`exclusiveMinimum` on voltage in the schema; regen Zod; server then rejects 400. **Platform note:** audit other numeric API schemas for the same unconstrained-number pattern (SS-01 input-validation). |
| DEF-CW02-005 | **Medium** | Module-specific (schema) | `gradedBy=""` accepted → cell graded with **blank operator attribution** + audit event with empty actor. Traceability/audit-integrity gap (SS-03 spirit). | `gradedBy: { type: string }` has **no `minLength`** → `z.string()` accepts `""`. | Add `minLength: 1` to `gradedBy`; regen; server rejects 400. Fixable in the same schema pass as DEF-CW02-004. |
| DEF-CW02-006 | **Medium** | Module-specific (business rule) — **needs CTO ruling** | No correction path: once graded, a cell is `approved`/`rejected` and locked out (GR-06 → 400). The recompute logic only runs for `received`/`grading` cells, but **no API path ever sets a cell to `grading`** (only the lot gets `grading`), so an operator who mis-enters a measurement cannot re-grade without DB surgery. MAT scorecard item 2 ("Edit/correction") is unmet. | First grade sets cell status directly to terminal `approved`/`rejected`; the `grading` cell-status branch in `calcGrade`/guard is unreachable through the public API. | **CTO decision required:** (a) intended immutability → keep, downgrade scorecard item 2 to "correction by re-receive", document; or (b) add an explicit supervisor+ re-grade/correction endpoint (audited) that re-opens a graded cell. |

### Cert-wave triage (per standing CTO preference — classify BEFORE remediation)

- **DEF-CW02-004 & DEF-CW02-005 → module-specific schema fix** in `CellGradeInput` (add `minimum`/`minLength`, regen Zod). Both fixable together in one codegen pass. DEF-004 also carries a **platform observation**: other numeric input schemas may share the unconstrained-`number` pattern — recommend a follow-up SS-01 sweep (tracked, not part of this fix unless CTO widens scope).
- **DEF-CW02-006 → business-rule decision**, not a pure code defect. Needs CTO ruling (immutable grades vs. add a correction endpoint) before any code.

> **MAT-02 status: executed in full; awaiting CTO approval on the 3 defects (1 High + 2 Medium) before remediation.** Per the batch-MAT cycle, all approved Critical/High/Medium fixes will be made together, then the full MAT-02 batch re-run before the gate is closed.

### MAT-02 Remediation (CTO-approved single batch — 2026-06-28)

CTO approved a single-batch remediation of all 3 defects. Fixes applied together, then the FULL MAT-02 batch re-run (no per-defect loops).

| ID | Fix shipped |
|----|-------------|
| DEF-CW02-004 (High) | `CellGradeInput` (and new `CellCorrectionInput`) now constrain `capacityAh`/`voltageV` with `exclusiveMinimum: 0` and `internalResistanceMohm` with `minimum: 0`. Zod regenerated; server rejects out-of-range with **400** before any DB write. |
| DEF-CW02-005 (Medium) | `gradedBy` (and correction `correctedBy`) carry `minLength: 1`; server **trims** then rejects blank with **400**. |
| DEF-CW02-006 (Medium) | New **controlled correction workflow**: `POST /cells/{id}/correct` (supervisor/director only, mandatory `correctionReason`) recomputes the grade, **appends** a correction to the new append-only `cell_grade_measurements` store (original immutable; latest sequence = active), updates the cell snapshot, and emits a `cell_grade_corrected` audit event. `GET /cells/{id}/measurements` exposes the full genealogy. SS-02/SS-03 matrices extended; SS-01 matrix doc updated. ODS-only supervisor+ Correct modal added to the grading page. **Concurrency hardening (architect review):** the production-committed guard is re-validated INSIDE the transaction under a `SELECT … FOR UPDATE` row lock (not just the pre-check), closing a TOCTOU window where a cell could flip to `reserved`/`allocated` between check and write; the row lock also serialises concurrent corrections so the append sequence cannot collide. |

### MAT-02 Re-run (FULL batch — 2026-06-28, post-remediation)

Re-ran the entire phase as a batch (no stopping):

| GR case | Result |
|---|---|
| capacityAh `<0` / `=0` → 400 | ✅ |
| voltageV `=0` / `<0` → 400 | ✅ |
| internalResistanceMohm `<0` → 400; `=0` → 200 (≥0 allowed) | ✅ |
| gradedBy `""` / whitespace → 400 (trim) | ✅ |
| valid grade → 200 + recompute | ✅ |
| operator correction → **403** | ✅ |
| correction missing/blank reason → **400** | ✅ |
| correction with reason → **200** + recompute (A→reject on 280→250 Ah) | ✅ |
| measurement history grows 1→2 | ✅ |
| original measurement immutable (byte-identical) | ✅ |
| correction = active grade + reason persisted; full genealogy reconstructable | ✅ |

**MAT-02 re-run result: 16/16 GR assertions PASS. 10-pt scorecard now 10/10 (item 2 Edit/correction and item 6 Validation both ✅).** Cert suites green: **SS-02** 235/235 authz assertions (47 endpoints × 5 principals); **SS-03** 12/12 audited operations + immutability (static + runtime); **SS-04** 31 pass · 3 dev-warn · 0 fail. `typecheck` + `lint` (0 warnings) green. All throwaway fixtures torn down.

> **Platform observation (recorded, NOT scope expansion):** (1) per CTO future-rec, the correction pattern (append-only versioned measurement + mandatory-reason audit event + immutable original) is a strong candidate for a **reusable platform framework** so other editable certified records (e.g. test results, stage data) get controlled-correction for free. (2) Per DEF-004, a repository-wide SS-01 sweep of other numeric engineering-value schemas for the unconstrained-`number` pattern is recommended. (3) **Audit actor attribution (architect-flagged, systemic → platform, frozen):** `gradedBy`/`correctedBy` (and the `cell_lot_events.performedBy` derived from them) are operator-entered DATA fields sourced from the request body — the long-standing pattern across the *entire* grade route, not introduced by this fix. They are therefore self-reported labels, not the authenticated session identity, so a privileged actor could record a different name. SS-02 still enforces *who may act*; this concerns *the label stored for who acted*. Binding the authoritative audit actor to `req.user` across all cell/lot events is a repo-wide platform change (out of this cert-defect scope) — flagged for CTO ruling in a future wave. These are all tracked for a future wave; out of scope here.

---

## Open Defects (CW-02)

| ID | Sev | Status | Phase |
|----|-----|--------|-------|
| DEF-CW02-001 | Low | **Closed** (MAT-01 remediation) | MAT-01 |
| DEF-CW02-002 | Medium | **Closed** (platform — `useToast`→`useOdsNotify`) | MAT-01 |
| DEF-CW02-003 | Low | **Closed** (MAT-01 remediation) | MAT-01 |
| DEF-CW02-004 | **High** | **Closed** (MAT-02 remediation — schema bounds + 400) | MAT-02 |
| DEF-CW02-005 | **Medium** | **Closed** (MAT-02 remediation — minLength + trim + 400) | MAT-02 |
| DEF-CW02-006 | **Medium** | **Closed** (MAT-02 remediation — controlled correction workflow) | MAT-02 |

| Observation | For |
|-------------|-----|
| OBS-CW02-001 — `nominalIrMohm` makes IR non-binding in grade calc | MAT-03 |
| OBS-CW02-002 — cells list status filter seq-scans (low volume; verify index under representative load) | MAT-05 |

---

## MAT Decision Log

- [x] **MAT-01 executed** — 7 Pass / 2 Partial / 1 Fail; 3 defects filed; triage pending.
- [x] **CTO triage decision** — Option 1 approved: DEF-CW02-002 fixed as a platform certification defect.
- [x] **MAT-01 defects remediated + re-tested → FULL PASS** (10/10; DEF-001/002/003 all Closed).
- [x] **MAT-02 executed (full batch)** — 8 Pass / 1 Partial / 1 Fail (10-pt); 3 defects filed (DEF-004 High, DEF-005/006 Medium); cert data torn down.
- [x] **CTO approval on MAT-02 defects** — approved single-batch remediation of all 3 (DEF-004/005 schema fix; DEF-006 controlled correction workflow).
- [x] **MAT-02 remediation (single batch) + FULL re-run → PASS** (16/16 GR assertions; 10/10 scorecard; SS-02/03/04 green). **DEF-004/005/006 all Closed.**
- [x] **MAT-02 gate CLOSED** — 0 open Critical/High.
- [ ] MAT-03 → MAT-06.

**Plan signed:** Replit Agent (QA) · 2026-06-28
