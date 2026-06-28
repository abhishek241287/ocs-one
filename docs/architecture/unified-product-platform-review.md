# Architecture Review — Unified Product Platform (v1.0)

> ## 🧊 ARCHITECTURE FROZEN — Version 1.0 (approved 2026-06-28)
> The Unified Product Platform architecture (this document: original report + Refinement v1.0
> four-concept foundation + Refinement v1.1 manufacturer/serial/QC-gate) is **APPROVED and
> FROZEN as Version 1.0.**
> - **No new architectural concepts** during **CW-02 → CW-08** unless required to resolve a
>   **Critical certification defect.**
> - Implementation follows the **approved phased migration plan** (§D4) — additive, no certified
>   table renamed/removed, sequenced **after CW-02 certification completes.**
> - Future ideas go to the **Product Platform Enhancement Backlog** (§ end of doc) and must **not**
>   modify the v1.0 architecture during certification.
> - Engineering focus is now **building manufacturing capability on top of this frozen
>   architecture**, not redesigning it.
>
> _The review history below is retained as the rationale of record._

> **Status: ARCHITECTURE REVIEW ONLY. No code implemented.** This document responds to the
> CTO Architecture Decision Request. It reviews the *current* architecture, assesses the
> impact of the proposed Unified Product Platform, and ends with a recommendation. No
> implementation begins until this review is approved.
>
> _Prepared: 2026-06-28 (during CW-02, Cell Grading)._

---

## 0. TL;DR

The proposal is **architecturally sound and well-aligned with how the system already works**:
downstream modules (Packing, Dispatch, Dealer, Inventory, Reports, Director) already key off a
*finished-unit handle* (`production_order_id`), not off battery-specific internals. Introducing
a serialized **Product** identity formalizes a concept the data model is already reaching for.

It reuses the frozen platforms (ODS, ECF, Security Standards, Certification, Audit) **by
adoption, not expansion** — consistent with the Platform Freeze Policy. The Product Platform is
*new manufacturing capability built on top of the frozen baseline*, which is exactly where
engineering effort is meant to go.

**Recommendation: APPROVED WITH CHANGES** (five required changes — see §9). The two changes that
matter most: (1) resolve the **naming collision** between the existing `master_products`
(a product *model / SKU blueprint*) and the proposed `Product` (a serialized *unit* identity);
(2) make the **manufacturing stage sequence configurable** via a Workflow Master before adding
the INBUILT_LITHIUM and HYBRID workflows — this is the single largest and riskiest refactor.

---

## 1. Architecture Impact Report

### 1.1 What the system is today
- A manufactured battery pack **is** a `mfg_production_orders` row (UUID `id`, business
  `order_number`, serialized `battery_number`, FK `product_id` → `master_products`, FK
  `cell_match_id`, `status`, `current_stage`).
- Manufacturing is a **single hardcoded 9-stage chain**: `cell_allocation → assembly →
  compression → bms_allocation → bms_programming → charging → testing → quality_control →
  packing`, enforced by a sequential guard in `routes/manufacturing/stages.ts` (a stage cannot
  start until the previous is `approved`).
- `master_products` is a **blueprint / SKU** (chemistry, voltage, capacity, configuration,
  references to `master_bms` / `master_cabinets` / `master_cells`) — **not** a per-unit identity.
- Downstream is **already unit-handle-oriented**: `logistics_dispatch_items.production_order_id`
  (UNIQUE) is the join key for Packing/Dispatch; Reports and the Director Dashboard aggregate
  production orders; the UI *labels* this "Battery" but the *key* is the production order.
- Serials come from **Postgres sequences** (`mfg_order_seq`, `mfg_battery_seq`).
- Inverters do not exist as masters yet — `INVERTER` is only a reserved value in the ECF
  `ecf_entity_type` enum. No `master_inverters` table.

### 1.2 What changes conceptually
"Everything leaving the factory becomes a **Product**." The change introduces a **serialized
finished-good identity** created at QC-pass, a **common product status lifecycle**, and **three
manufacturing workflows** (BATTERY / INBUILT_LITHIUM / HYBRID) feeding that one identity. Every
downstream module then speaks **Product**, not battery/inverter.

### 1.3 Why the impact is contained
Because downstream already keys off a single finished-unit handle, the migration is mostly
**(a) add a `products` identity, (b) link it to the existing production order, (c) repoint
downstream from `production_order_id` to `product_id` additively**. Manufacturing itself absorbs
the real complexity (multiple workflows, configurable stages).

---

## 2. Current vs Proposed Architecture

### 2.1 Current (battery-only)
```
 cell_lots → cells → cell_matches ─┐
                                   ▼
master_products (blueprint) ──> mfg_production_orders (THE battery unit)
                                   │   9 hardcoded stages
                                   │   battery_number = identity
                                   ▼
                          mfg_battery_genealogy (BOM)
                                   │
                                   ▼
        logistics_dispatch_items.production_order_id (UNIQUE)  ──> dealer
                                   │
                Reports · Director · Inventory  (key off production order, labelled "Battery")
```

### 2.2 Proposed (unified product)
```
 Workflow Master (BATTERY | INBUILT_LITHIUM | HYBRID)  ── drives stage sequence
        │
        ▼
 ┌──────────────┬───────────────────────┬────────────────────┐
 │   BATTERY    │   INBUILT_LITHIUM     │      HYBRID         │   (3 manufacturing workflows)
 │ cells→…→QC   │ PCB→Batt Install→…→QC │ Inspect→Func→QC     │
 └──────┬───────┴───────────┬───────────┴─────────┬──────────┘
        └──────────── at QC-PASS each emits ───────┘
                                   ▼
                    products  (serialized UNIT identity)
                    ├ product_category (battery_pack | inbuilt_lithium | hybrid)
                    ├ ocs_product_serial (per-category rule)
                    ├ manufacturer_serial (Techfine reuse for HYBRID)
                    ├ workflow_code, qc_status, product_status, current_location, dealer
                    ▼
              product_genealogy (category-aware: battery genealogy only when applicable)
                                   ▼
   Packing · Dispatch · Dealer · Inventory · Reports · Director   (ALL key off product_id)
```

`master_products` stays as the **blueprint/SKU** consulted by manufacturing; the new `products`
table is the **per-unit identity** consulted by everything downstream.

---

## 3. Database Impact Analysis

### 3.1 New tables / enums (additive)
| Object | Purpose |
|--------|---------|
| `products` | Serialized finished-good **unit** identity (the CTO "Product Master"). |
| `product_category` enum | `battery_pack`, `inbuilt_lithium_inverter`, `hybrid_inverter` (no more in v1.0). |
| `product_status` enum | `manufacturing`, `qc_passed`, `ready_for_packing`, `packed`, `dispatched`, `delivered_to_dealer` (future states NOT added). |
| `product_workflows` (Workflow Master) | Configurable workflow codes + ordered stage definitions; codes `BATTERY`/`INBUILT_LITHIUM`/`HYBRID` (future codes reserved, not seeded). |
| `product_genealogy` | Category-aware genealogy keyed by `product_id` (generalization of `mfg_battery_genealogy`). |
| `master_inverters` | Inverter models (Techfine hybrid + imported PCB specs) — follows the `createMasterCommonColumns` pattern. |

### 3.2 `products` columns (maps the CTO field list)
`id` (uuid) · `product_category` · `model_id` (FK → `master_products`/inverter master) · `brand`
· `manufacturer` · `manufacturer_serial` (nullable; **required for HYBRID**) · `ocs_product_serial`
(UNIQUE) · `workflow_code` (FK → `product_workflows`) · `source_production_order_id` (nullable FK
→ `mfg_production_orders`, for BATTERY/INBUILT_LITHIUM) · `qc_status` · `product_status` ·
`current_location` · `dealer_id` (FK → `logistics_dealers`) · timestamps.

### 3.3 Serial-number rules (per category)
- **Battery Pack** — OCS generates (existing `mfg_battery_seq` pattern; reuse, do not re-invent).
- **Inbuilt Lithium Inverter** — OCS generates **only if** the imported unit has no manufacturer
  serial; otherwise reuse the manufacturer serial.
- **Hybrid Inverter** — **reuse the Techfine manufacturer serial** as `ocs_product_serial`
  (externally supplied; validate presence + uniqueness; never auto-generate).
- **Caveat:** OCS-generated and externally-supplied serials share one `ocs_product_serial`
  uniqueness space → adopt a non-colliding format/namespace and a presence check for HYBRID.

### 3.4 Backward compatibility
- `mfg_production_orders` is **untouched**; add nullable `product_id` link (order → product).
- `logistics_dispatch_items` gains a **nullable** `product_id` and runs **dual-key** (keep the
  UNIQUE `production_order_id`) during migration so certified logistics never breaks.
- Indexes: `ocs_product_serial` (unique), `product_category`, `product_status`, `dealer_id`,
  `current_location`, `workflow_code`.

### 3.5 INBUILT_LITHIUM special case
The OCS Battery Pack (4S1P/8S1P) is a **permanent component** → its genealogy is linked into the
inverter product's genealogy (product→product/sub-assembly link). HYBRID attaches **no** battery
genealogy.

---

## 4. API Impact Analysis (all additive → backward compatible)

- **New `/api/products`** — list/get, `GET /products/{id}/genealogy`, `POST
  /products/{id}/status` (lifecycle transitions, guarded). OpenAPI spec is the source of truth →
  `pnpm --filter @workspace/api-spec run codegen` regenerates hooks + Zod (no manual client edits).
- **Manufacturing** — orders carry a `workflow_code`; the stage state machine reads its sequence
  from the Workflow Master instead of the hardcoded enum (see §5). A **QC-pass hook** creates the
  Product (one place: `quality_control` approved).
- **Masters** — new `/api/masters/inverters`.
- **Downstream** — dispatch/packing accept `product_id` (keep `productionOrderId` as alias);
  Reports/Director aggregate by product. No breaking response changes — fields are added, not
  removed.
- **Per-endpoint governance (no framework changes):** every new endpoint files an **SS-01** row
  in `docs/security-matrix.md`, joins the **SS-02** authz matrix (`lib/authz-matrix.ts`),
  registers any audited op in the **SS-03** audit matrix, and is covered by **SS-04** config
  checks. This is *adoption* of the frozen Security Standards, not modification.

---

## 5. Manufacturing Workflow Impact (the heart of the change)

| Workflow | Stage chain | Notes |
|----------|-------------|-------|
| **BATTERY** | (existing detailed chain) cell_allocation → assembly → compression → bms_allocation → bms_programming → charging → testing → quality_control → packing | The CTO's abstract `Cell Receiving→Grading→Matching→Assembly→Testing→QC` is the *summary*; keep the existing certified detailed stages as the BATTERY definition. |
| **INBUILT_LITHIUM** | PCB Receiving → Battery Installation → Assembly → Testing → QC → Product | Battery Installation **consumes an OCS Battery Pack** (genealogy link). |
| **HYBRID** | Incoming Inspection → Functional Testing → QC → Product | No battery. Techfine serial reused. |

**The critical refactor:** today the stage sequence and the sequential guard are **hardcoded**
(fixed `current_stage` enum + guard in `stages.ts`). To support three chains, the engine must
become **workflow-driven** (sequence read from the Workflow Master). This touches the
**certified** manufacturing module, so it must be: additive, behind a feature flag, with the
BATTERY path byte-for-byte unchanged, and re-certified before INBUILT_LITHIUM/HYBRID go live.

---

## 6. Product Master Design Recommendation

1. **Resolve the naming collision explicitly.** `master_products` = **Product Model / SKU
   blueprint** (keep the table name to avoid breakage; document the semantic). The new `products`
   table = **serialized finished-good unit** (the CTO "Product Master"). If clearer, name the new
   table `product_units` — but pick one and make the model-vs-unit distinction unambiguous.
2. **One Product identity, category-specialized genealogy.** A single `products` table for all
   three categories; genealogy content varies by category (battery genealogy only for
   battery_pack / inbuilt_lithium).
3. **Reuse, don't rebuild:** ECF for product corrections (`ecf_entity_type` already has
   BATTERY/PACK/INVERTER); the existing append-only **audit** timeline pattern for a
   `product_events` history; **ODS** for all Product UI; **Certification Framework** for the new
   module. Product corrections must go through **ECF** (per the ECF directive that every
   correction-allowing module integrates ECF).
4. **Workflow Master is real config**, not an enum — so future codes (ESS, EV_AC_CHARGER,
   EV_DC_CHARGER, BMS) are added as **data**, not schema changes.

---

## 7. Migration Strategy (minimal refactoring, phased, reversible)

- **Phase 0 — this review + approval.** No code.
- **Phase 1 — identity, no behavior change.** Add `products`, enums, Workflow Master,
  `master_inverters`. Seed BATTERY/INBUILT_LITHIUM/HYBRID workflow rows. One-time **idempotent
  backfill**: create a Product row for every existing completed/dispatched battery order so
  downstream has a Product to point at.
- **Phase 2 — emit Product at QC-pass (BATTERY only).** Add the QC-pass hook; add nullable
  `product_id` to dispatch items (dual-key, `production_order_id` still authoritative). Re-run
  full certification.
- **Phase 3 — workflow-driven stage engine + new workflows.** Generalize `stages.ts` behind a
  flag (BATTERY unchanged), then add INBUILT_LITHIUM and HYBRID + `/masters/inverters`. Re-certify.
- **Phase 4 — repoint downstream to `product_id`.** Packing/Dispatch/Dealer/Inventory/Reports/
  Director read Product; relabel UI "Battery" → "Product" (keep battery detail views).
- **Phase 5 (post-cert) — deprecate direct `production_order_id` references** once `product_id`
  is fully adopted.

Each phase is additive and independently certifiable; each closes through the standard
**Batch MAT cycle** + cert gate.

---

## 8. Risk Assessment

| # | Risk | Sev | Mitigation |
|---|------|-----|------------|
| R1 | **Naming collision** `master_products` (model) vs `products` (unit) → developer/data confusion | **High** | Explicit model-vs-unit semantic (§6.1); consider `product_units`. |
| R2 | **Stage-engine generalization** touches the certified manufacturing module | **High** | Workflow-driven sequence behind a flag; BATTERY path unchanged; full re-cert before new workflows. |
| R3 | Breaking certified logistics (`production_order_id` UNIQUE) | Med | Nullable `product_id` + dual-key migration; never drop the old key during cert waves. |
| R4 | HYBRID external serial reuse — collision with OCS serial space / missing serial | Med | Non-colliding serial format; mandatory manufacturer-serial validation for HYBRID. |
| R5 | INBUILT_LITHIUM battery-as-component genealogy spanning two records | Med | Product→product genealogy link; model in Phase 3 with explicit tests. |
| R6 | Scope creep into Install/Service/Warranty/AMC | Med | Hard v1.0 boundary "ends at Dealer"; future states reserved, not implemented. |
| R7 | Backfill correctness for existing units | Med | Idempotent one-time script + reconciliation count + audit trail. |
| R8 | Certification regression on frozen modules | Med | Additive-only; full SS-02/03/04 + wave cert re-run each phase. |
| R9 | Timing vs CW-02 (don't disrupt Cell Grading cert in flight) | Low | Start after CW-02 closes (or schedule as the next manufacturing capability wave). |

---

## 9. Recommendation

### ✅ APPROVED WITH CHANGES

The Unified Product Platform is the right next architecture for OCS One: it matches the existing
unit-handle data flow, formalizes the "everything leaving the factory is a Product" principle,
and is built **on top of** the frozen platforms (adoption, not expansion) — squarely in line
with the directive to focus engineering on manufacturing capability.

**Required changes before/within implementation:**
1. **Resolve the `master_products` (model/SKU) vs `products` (serialized unit) naming collision**
   — non-negotiable; document the semantic or rename the new table `product_units`.
2. **Make the stage sequence configurable via the Workflow Master before adding INBUILT_LITHIUM /
   HYBRID** — additive, feature-flagged, BATTERY path unchanged, re-certified. This is the
   highest-risk item; treat it as its own phase.
3. **Additive, dual-key, phased migration** — keep `mfg_production_orders` and the
   `production_order_id` logistics key working throughout; no breaking changes during cert waves.
4. **Hold the v1.0 boundary at Dealer** — reserve (do not build) Install/Service/Warranty/AMC and
   the future product/workflow codes and lifecycle states.
5. **Reuse the frozen frameworks unchanged** — ECF for corrections, ODS for UI, Security Standards
   per-endpoint, Certification per phase, Audit for the product timeline. The new module follows
   SS-01..04; once it stabilizes it earns its own row on the Platform Scorecard.

**Sequencing:** schedule implementation as the **next manufacturing-capability wave after CW-02
closes**, so Cell Grading certification is not disturbed.

> No implementation begins until this review is approved.

---
---

# Refinement v1.0 — Four-Concept Foundation (supersedes §6 where they differ)

> The Architecture Impact Report above is **approved in principle**. This refinement makes the
> Product Platform the permanent foundation for all future manufacturing modules. It **resolves
> the §8 R1 naming collision** by separating four concepts explicitly. Still **architecture only —
> no code.** _Added: 2026-06-28._

## R1. Four concepts, explicitly separated

| # | Concept | Backing table | Role | Status in v1.0 |
|---|---------|---------------|------|----------------|
| **A** | **Product Category** | **NEW** `product_categories` (Product Category Master) | Business category | Configurable; seeded: Battery Pack · Inbuilt Lithium Inverter · Hybrid Inverter |
| **B** | **Product Model (SKU)** | **EXISTING** `master_products` — **unchanged role** | Engineering definition / SKU | Stays the Model master; **never** becomes serialized |
| **C** | **Manufacturing Workflow** | **NEW** `product_workflows` (Workflow Master) | Manufacturing process | Codes BATTERY/INBUILT_LITHIUM/HYBRID; **independent of Category**; future ESS/EV_AC_CHARGER/EV_DC_CHARGER/BMS reserved |
| **D** | **Product** | **NEW** `products` | One serialized unit leaving QC | The single identity every downstream module references |

**Key invariants this locks in:**
- `master_products` is **permanently the Product Model master** — it is *not* the serialized
  table. (Closes R1.)
- **Workflow Master is independent of Product Category.** A `products` row carries `category_id`
  **and** `workflow_code` as two orthogonal references — the category→workflow mapping is never
  hardcoded into the category.
- **Product** is the only handle downstream modules use after QC.

## D1. Updated Entity Relationship Diagram

```
 product_categories (A: Category Master)          product_workflows (C: Workflow Master)
 ┌───────────────────────────┐                    ┌──────────────────────────────────────┐
 │ id (uuid)                 │                    │ id (uuid)                             │
 │ code  (unique)            │                    │ code (BATTERY|INBUILT_LITHIUM|HYBRID) │
 │ name, status              │                    │ name, stage_sequence (jsonb), status  │
 └────────────┬──────────────┘                    └──────────────────┬───────────────────┘
              │ 1                                                     │ 1
              │                                                       │
              │ *            ┌──────────────────────────────┐        │
              └─────────────▶│ master_products (B: MODEL/SKU)│        │   (orthogonal —
       category_id (add,null)│ id, code, voltage, capacity,  │        │    Category does NOT
                             │ config, FKs bms/cabinet/cell  │        │    own Workflow)
                             └───────────────┬──────────────┘        │
                                             │ 1                      │
                                             │                        │
                                             │ *                      │
                            ┌────────────────▼────────────────────────▼─────────────┐
                            │ products (D: serialized UNIT identity)                 │
                            │  id (uuid)                                             │
                            │  category_id   → product_categories   (A)             │
                            │  model_id      → master_products      (B)             │
                            │  workflow_code → product_workflows    (C)             │
                            │  source_production_order_id → mfg_production_orders    │
                            │       (nullable; BATTERY/INBUILT_LITHIUM only)        │
                            │  ocs_product_serial (unique) · manufacturer_serial    │
                            │  qc_status · product_status · current_location        │
                            │  dealer_id → logistics_dealers                        │
                            └───┬───────────────┬───────────────┬──────────────┬────┘
                            1 │             1 │             *   │           (polymorphic)
                              │               │                 │                │
                ┌─────────────▼──┐  ┌──────────▼─────────┐  ┌────▼──────────┐  ┌──▼───────────────────┐
                │ product_       │  │ product_events     │  │ QC result     │  │ engineering_         │
                │ genealogy      │  │ (append-only audit │  │ (gate → emits │  │ corrections (ECF)    │
                │ (category-     │  │  timeline)         │  │  Product)     │  │ entity_type=PRODUCT/ │
                │  aware lineage)│  └────────────────────┘  └───────────────┘  │ BATTERY/INVERTER     │
                └────────────────┘                                             │ entity_id=products.id│
                                                                              └──────────────────────┘
                            products ──> Packing ──> Dispatch ──> Dealer
                                                                    │
            reserved extension points (RESERVED, NOT implemented): Installation · Warranty · Service · AMC
                            (these will hang off products.id in a future phase)
```

Cardinality summary: Category **1—*** Model; Model **1—*** Product; Category **1—*** Product;
Workflow **1—*** Product; Product **1—1** source production order (nullable); Product **1—***
genealogy; Product **1—*** events; Product **1—*** ECF corrections (polymorphic); Product **\*—1**
Dealer.

## D2. Updated Manufacturing Architecture Diagram (workflow-driven)

```
                    product_workflows (Workflow Master) — stage_sequence is DATA, not an enum
                                          │ drives
                                          ▼
        ┌──────────────────────┬────────────────────────────┬───────────────────────────┐
        │  workflow=BATTERY    │  workflow=INBUILT_LITHIUM   │  workflow=HYBRID          │
        │  cell_allocation     │  pcb_receiving             │  incoming_inspection      │
        │  assembly            │  battery_installation*     │  functional_testing       │
        │  compression         │  assembly                  │  quality_control          │
        │  bms_allocation      │  testing                   │                           │
        │  bms_programming     │  quality_control           │  (no battery stages)      │
        │  charging            │                            │                           │
        │  testing             │  *consumes an OCS Battery   │                           │
        │  quality_control     │   Pack (4S1P/8S1P) as a    │                           │
        │  packing             │   permanent component       │                           │
        └──────────┬───────────┴─────────────┬──────────────┴────────────┬──────────────┘
                   └──────────── QC-PASS gate (single creation point) ─────┘
                                          ▼
                              products row created (serial per category rule)
                                          ▼
            Product status lifecycle:  manufacturing → qc_passed → ready_for_packing
                                       → packed → dispatched → delivered_to_dealer
                                       (future states RESERVED: installed/in_service/returned/scrapped)

  Stage engine note: today the sequence + "previous stage approved" guard are HARDCODED in
  routes/manufacturing/stages.ts. The refactor reads stage_sequence from the Workflow Master.
  BATTERY path stays byte-identical & feature-flagged; re-certified before new workflows go live.
```

## D3. Product Genealogy Diagram (per category — Product owns its lineage)

```
 BATTERY PACK                  INBUILT LITHIUM INVERTER          HYBRID INVERTER
 ───────────                   ────────────────────────          ───────────────
   Cells                          Imported PCB                     Incoming Inspection
     ↓                               ↓                                ↓
   Matching                       OCS Battery (permanent)          Functional Testing
     ↓                               ↓                                ↓
   Assembly                       Assembly                         QC
     ↓                               ↓                                ↓
   Testing                        Testing                          PRODUCT
     ↓                               ↓
   QC                             QC                               (NO battery genealogy —
     ↓                               ↓                              external batteries belong
   PRODUCT                        PRODUCT                           to future Install/Service)
```

All three lineages persist in **one** `product_genealogy` table keyed by `product_id`; the
content set is category-aware (battery lineage present only for Battery Pack and Inbuilt Lithium).

## D4. Updated Database Migration Strategy (strictly additive)

**Hard rule (CTO): do not rename or remove any certified table.** Legacy references are removed
**only after every module has migrated.**

New tables (all additive): `product_categories`, `product_workflows`, `products`,
`product_genealogy`, `product_events`, `master_inverters`. Additive nullable columns only:
`master_products.category_id` (→ product_categories), `mfg_production_orders.product_id`
(→ products), `logistics_dispatch_items.product_id` (→ products, dual-key with the existing UNIQUE
`production_order_id`).

| Phase | Action | Certified tables touched |
|-------|--------|--------------------------|
| 1 | Create new tables + enums; seed 3 categories + 3 workflows; add nullable FKs; **idempotent backfill** of `products` for existing completed/dispatched battery orders | None renamed/removed (additive columns only) |
| 2 | Emit Product at the QC-pass gate (BATTERY first); dispatch items dual-key on `product_id` | None |
| 3 | Generalize stage engine to workflow-driven (flagged, BATTERY unchanged); add INBUILT_LITHIUM + HYBRID + `master_inverters` | None |
| 4 | Repoint downstream (Packing/Dispatch/Dealer/Inventory/Reports/Director) to `product_id`; relabel UI "Battery"→"Product" | None |
| 5 | **Post-cert only:** retire direct `production_order_id` downstream references once every module reads `product_id` | Legacy refs removed only here |

Each phase is independently certifiable through the standard Batch MAT cycle + cert gate.

## D5. Risk Review (delta from §8)

| # | Risk | Sev | Change |
|---|------|-----|--------|
| R1 | Model-vs-unit naming collision | ~~High~~ → **Closed** | **Resolved** by the four-concept separation: `master_products` stays the Model master; `products` is the new serialized unit. |
| R2 | Workflow-driven stage-engine refactor on the certified module | **High** | Unchanged — still the highest-risk phase; flagged + BATTERY-unchanged + re-cert. |
| R3 | Breaking certified logistics (`production_order_id` UNIQUE) | Med | Unchanged — nullable `product_id`, dual-key, legacy removed only in Phase 5. |
| R4 | HYBRID external-serial reuse / collision | Med | Unchanged — validate presence, non-colliding serial space. |
| R5 | INBUILT_LITHIUM battery-as-component genealogy | Med | Unchanged. |
| R6 | Scope creep past Dealer | Med | **Reduced** — Installation/Warranty/Service/AMC are now explicit *reserved extension points* hanging off `products.id`, not designed now. |
| R7 | Backfill correctness | Med | Unchanged — idempotent + reconciliation count. |
| R8 | Certification regression on frozen modules | Med | Unchanged — additive-only + full re-cert each phase. |
| R9 | Timing vs CW-02 | Low | Unchanged — start after CW-02 closes. |
| **R10** | **Category↔Workflow coupling** (someone hardcodes category→workflow, breaking orthogonality) | Low | **New** — enforce two independent FKs on `products`; no derived mapping. |

## D6. Final Recommendation

### ✅ APPROVED FOR IMPLEMENTATION

The refinement resolves the single blocking concern (R1) by permanently fixing `master_products`
as the **Product Model** master and introducing a separate serialized **Product** identity, with
**Product Category** and **Manufacturing Workflow** as independent masters. The design is additive
(no certified table renamed/removed), consumes the frozen platforms (ODS, ECF, Security Standards,
Certification) **without modification**, and is delivered as manufacturing capability on the frozen
baseline.

**Conditions carried into implementation:**
1. Implement in the **phased, additive** order of §D4; legacy references retired only in Phase 5
   (post-cert).
2. The **workflow-driven stage-engine** generalization (R2) is the highest-risk phase — feature-
   flagged, BATTERY path byte-identical, re-certified before INBUILT_LITHIUM/HYBRID go live.
3. Preserve **Category↔Workflow orthogonality** (R10): two independent FKs, no hardcoded mapping.
4. Keep the v1.0 boundary at **Dealer**; Installation/Warranty/Service/AMC remain *reserved
   extension points* off `products.id`.
5. The Product Platform follows **SS-01..04** per endpoint and earns a **Platform Scorecard** row
   once it stabilizes.
6. **Sequence after CW-02 closes** so Cell Grading certification is undisturbed.

> No code until this architecture review is approved. On approval, implementation proceeds per
> the phased plan above.

---
---

# Refinement v1.1 — Manufacturer Master · Unified Serial · QC-Gate Freeze (final principles)

> The Unified Product Platform (incl. Refinement v1.0) is **approved**. This final refinement
> freezes three principles before implementation. **Architecture only — no code.** _Added:
> 2026-06-28._

## 1. Architecture review of the three refinements

### 1A. Manufacturer as a permanent independent master — **YES, recommended**
Today `manufacturer` is a **free-text `varchar`** repeated on `master_bms`, `master_chargers`,
etc. — no single list, prone to drift ("Techfine" vs "techfine"). Introduce **`master_manufacturers`**
(NEW master, follows `createMasterCommonColumns`), seeded OCS · Techfine · Deye · Growatt ·
Voltronic · MUST. **Product Model (`master_products`) gains a nullable `manufacturer_id` FK**;
**Product (`products`) inherits manufacturer by derivation through `model_id → manufacturer_id`** —
**do NOT store manufacturer/brand on the serialized unit** (not technically required in v1.0; a
unit's manufacturer cannot differ from its model's). This is the fifth *supporting* master; it
does **not** alter the four-concept model — it sits behind concept **B (Product Model)**.

### 1B. Unified serial model — **YES, recommended (supersedes §3.2/§3.3 two-serial design)**
Replace the two parallel nullable fields (`manufacturer_serial` + `ocs_product_serial`) on
`products` with **one** authoritative field plus provenance:
- **`official_product_serial`** (UNIQUE, NOT NULL) — the single serial every downstream module uses.
- **`serial_source`** enum — `OCS | MANUFACTURER` (provenance metadata only).

Generation rule keyed by source: **OCS** → generated from the Postgres sequence pattern;
**MANUFACTURER** → external value, validated **present + unique** (e.g. Hybrid reuses the Techfine
serial `TF-AB123456`). One global uniqueness namespace on `official_product_serial`. **Downstream
never inspects `serial_source`** — it works only with `official_product_serial`. Component-level
serials (imported PCB, etc.) live in **`product_genealogy`** for traceability, **not** as product
serial fields.

Worked examples (CTO):

| Category | official_product_serial | serial_source |
|----------|------------------------|---------------|
| Battery Pack | `OCS250700001` | OCS |
| Inbuilt Lithium Inverter | `OCS250800001` | OCS |
| Hybrid Inverter | `TF-AB123456` | MANUFACTURER |

### 1C. Product Creation Rule — **FREEZE as a permanent manufacturing rule**
**No Product exists before QC PASS.** `Manufacturing → Testing → QC → Product Creation → Packing →
Dispatch → Dealer`. A `products` row is created at exactly one point: the **QC-pass gate**.
Work-in-progress lives in `mfg_production_orders`/`mfg_order_stages`; downstream modules reference
**only** Products created after QC approval — so they never see in-progress units. (This formalizes
the single creation gate already in §D2.)

## 2. Advantages / disadvantages

| Refinement | Advantages | Disadvantages / cost |
|------------|-----------|----------------------|
| Manufacturer master | Normalized list, no drift, dropdowns, manufacturer-level reporting, future-proof for ESS/EV/BMS; one place to manage | One extra join for manufacturer lookups; existing free-text columns must be backfilled (additive, later phase) |
| Unified serial | One field downstream, no null/"which serial" logic, single uniqueness constraint, simpler ODS form & API | `serial_source` adds a small provenance enum; generation logic branches by source (already needed) |
| QC-gate freeze | Eliminates ambiguous "is it a product yet?" states; clean downstream contract; matches the single creation point | None — it constrains, it does not add surface |

## 3. Should Manufacturer become an independent master? **Yes.**
It removes denormalized free-text, aligns with the existing master pattern, and is purely additive.
Model references it; Product inherits it (derived, not duplicated).

## 4. Is "Official Product Serial + Serial Source" preferable? **Yes.**
It is strictly simpler than two equal serial concepts: downstream depends on one field, uniqueness
is enforced once, and provenance is preserved without leaking into consumers. It **reduces** system
complexity.

## 5. Migration impact (all additive — no certified table renamed/removed)
- **NEW** `master_manufacturers`; seed the six manufacturers.
- **`master_products`** gains nullable `manufacturer_id` FK (additive); backfill from existing
  free-text manufacturer values where present.
- **`products`** (NOT yet built) adopts `official_product_serial` + `serial_source` from the start —
  **zero migration cost**, no two-serial columns ever ship.
- Free-text `manufacturer` columns on other masters are normalized to `manufacturer_id` in a later
  **additive** phase and removed **only post-cert** (Phase 5) — never during cert waves.
- Workflow Master and the four-concept model are **untouched**.

## 6. Compatibility verification
- **No conflict** with the approved Unified Product Platform — refines concept **B/D** internals only.
- **No Product Model redesign** — `master_products` keeps its role; gains one nullable FK.
- **No Workflow Master redesign** — serial/manufacturer are Product/Model concerns, orthogonal to workflow.
- **Frozen platforms consumed unmodified** — ODS (simpler form: Manufacturer dropdown + single
  Serial field), ECF (unchanged; corrections still polymorphic on `products.id`), Security Standards
  (per-endpoint SS-01..04), Certification Framework (per-phase). No platform change required.

## Final recommendation

### ✅ APPROVED WITH MINOR CHANGES

All three refinements are compatible, additive, and reduce complexity. The two minor clarifications
(confirmations, not redesigns):
1. **Manufacturer is derived on the Product, not duplicated** — `products` has no manufacturer/brand
   column; it resolves through `model_id → manufacturer_id`.
2. **Component serials (PCB, etc.) live in `product_genealogy`**, not as product serial fields; the
   `products` table carries exactly one serial (`official_product_serial`) plus `serial_source`.

With those locked, the Manufacturer master, the unified serial model, and the **frozen "No Product
before QC PASS" rule** are approved and fold cleanly into the phased, additive implementation plan
(sequenced after CW-02 closes). No code until this final review is approved.

---
---

# Product Platform Enhancement Backlog

> Frozen-architecture rule: ideas here are **parked**, not built. They **must not** modify the
> v1.0 architecture during CW-02 → CW-08. They are considered for a future **Product Platform
> v2.0** on the post-certification roadmap. The only mid-certification exception is a change
> required to resolve a **Critical certification defect**.

| ID | Idea | Notes |
|----|------|-------|
| PP-001 | Future product categories (ESS, EV AC Charger, EV DC Charger, BMS) | Added via Product Category Master + Workflow Master as **data**, no schema redesign. |
| PP-002 | Future workflow codes (`ESS`, `EV_AC_CHARGER`, `EV_DC_CHARGER`, `BMS`) | Reserved in Workflow Master; not seeded in v1.0. |
| PP-003 | Future product lifecycle states (`installed`, `in_service`, `returned`, `scrapped`) | Reserved; v1.0 lifecycle ends at `delivered_to_dealer`. |
| PP-004 | Post-Dealer modules — Installation, Warranty, Service, AMC, Remote Monitoring | Reserved extension points off `products.id`; out of Manufacturing v1.0 scope. |
| PP-005 | Normalize free-text `manufacturer` on remaining masters to `manufacturer_id` | Additive; backfill, remove legacy columns only post-cert (Phase 5). |
| PP-006 | Product Platform Scorecard row | Earned once the platform stabilizes (adoption > 0 modules built). |

_New ideas during certification are appended here, not implemented._
