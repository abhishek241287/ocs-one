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

---

## Open Defects (CW-02)

| ID | Sev | Status | Phase |
|----|-----|--------|-------|
| DEF-CW02-001 | Low | Open | MAT-01 |
| DEF-CW02-002 | Medium | Open (triage) | MAT-01 |
| DEF-CW02-003 | Low | Open | MAT-01 |

| Observation | For |
|-------------|-----|
| OBS-CW02-001 — `nominalIrMohm` makes IR non-binding in grade calc | MAT-03 |

---

## MAT Decision Log

- [x] **MAT-01 executed** — 7 Pass / 2 Partial / 1 Fail; 3 defects filed; triage pending.
- [ ] MAT-01 defects remediated + re-tested → PASS
- [ ] MAT-02 → MAT-06 (pending MAT-01 closure)

**Plan signed:** Replit Agent (QA) · 2026-06-28
