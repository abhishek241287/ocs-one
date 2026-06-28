# Architecture Review — Unified Product Platform (v1.0)

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
