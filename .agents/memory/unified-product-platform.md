---
name: Unified Product Platform architecture review
description: Key durable findings/decisions from the CTO architecture review for unifying all factory output under one "Product" identity (3 categories). Full report in docs/architecture/.
---

# Unified Product Platform (architecture FROZEN v1.0 — approved 2026-06-28, NOT yet implemented)

**FROZEN v1.0.** Architecture approved + frozen; no new architectural concepts during CW-02→CW-08
except to resolve a Critical cert defect. Implementation begins AFTER CW-02 closes, per the phased
additive plan. Future ideas → Product Platform Enhancement Backlog (PP-001..PP-006) in the review
doc; they must not modify v1.0 during certification. Focus is now building manufacturing capability
on top of this frozen architecture, not redesigning it.

Full deliverable: `docs/architecture/unified-product-platform-review.md` (original report + a
"Refinement v1.0 — Four-Concept Foundation" section). Recommendation progressed from **APPROVED
WITH CHANGES** → **APPROVED FOR IMPLEMENTATION** after the CTO refinement. Architecture only — no
code written.

## Four-concept model (CTO refinement — the permanent foundation)

The naming-collision risk is **resolved** by separating four distinct concepts, each its own
master, all orthogonal:
- **A. Product Category** — NEW `product_categories` master (Battery Pack / Inbuilt Lithium
  Inverter / Hybrid Inverter; configurable).
- **B. Product Model (SKU)** — EXISTING `master_products`, **permanently the Model master; never
  becomes the serialized table**.
- **C. Manufacturing Workflow** — NEW `product_workflows` master; **independent of Category**
  (codes BATTERY/INBUILT_LITHIUM/HYBRID; future ESS/EV_*/BMS reserved).
- **D. Product** — NEW `products` serialized-unit table; the single identity every downstream
  module references after QC.
A `products` row carries `category_id` AND `workflow_code` as TWO orthogonal FKs — never hardcode
a category→workflow mapping (risk R10).

## Final refinements v1.1 (APPROVED WITH MINOR CHANGES)

- **Manufacturer master** — NEW `master_manufacturers` (OCS/Techfine/Deye/Growatt/Voltronic/MUST),
  replacing free-text `manufacturer` on master_bms/chargers. `master_products` gets nullable
  `manufacturer_id`. **Product DERIVES manufacturer via `model_id → manufacturer_id` — never store
  manufacturer/brand on the serialized `products` row.**
- **Unified serial** — `products` carries ONE `official_product_serial` (unique) + `serial_source`
  enum (OCS|MANUFACTURER), NOT two parallel serial columns. OCS source = sequence-generated;
  MANUFACTURER source = external value validated present+unique (Hybrid reuses Techfine serial).
  Downstream uses ONLY `official_product_serial`, never inspects source. Component serials (PCB
  etc.) go in `product_genealogy`, not as product fields.
- **Frozen rule: No Product before QC PASS.** `products` row created at exactly one gate (QC-pass).
  WIP lives in mfg_production_orders; downstream references only post-QC Products.
- All additive; no certified table renamed/removed; `products` is new so the serial design costs
  zero migration. Workflow Master + four-concept model untouched.

## The durable facts that shaped the recommendation

- **`master_products` is a MODEL/SKU blueprint, NOT a unit identity.** It holds chemistry/
  voltage/capacity/configuration and FKs to master_bms/cabinets/cells. The proposed "Product"
  is a *serialized finished-good unit*. These two are different concepts — the #1 risk is the
  naming collision. Decision: keep `master_products` as the model/SKU; new unit table should be
  unambiguous (`products` with documented semantic, or `product_units`).
- **Downstream is already unit-handle-oriented.** `logistics_dispatch_items.production_order_id`
  (UNIQUE) is the join key; Reports/Director/Inventory aggregate production orders; UI only
  *labels* it "Battery". So unifying onto a Product id is mostly additive repointing, not a
  rewrite. Migration keeps `production_order_id` working (dual-key, nullable `product_id`).
- **The real refactor is the stage engine.** Today the 9 battery stages and the sequential
  "previous stage must be approved" guard are HARDCODED in `routes/manufacturing/stages.ts`
  (fixed `current_stage` enum). Supporting 3 workflows (BATTERY / INBUILT_LITHIUM / HYBRID)
  requires a **workflow-driven** sequence (Workflow Master = data, not enum). This touches the
  CERTIFIED manufacturing module → must be feature-flagged, BATTERY path unchanged, re-certified.

## Scope guardrails (CTO)

- v1.0 = exactly 3 product categories: Battery Pack (OCS serial), Inbuilt Lithium Inverter (OCS
  serial only if no mfr serial), Hybrid Inverter (reuse Techfine mfr serial — never auto-gen).
- Manufacturing v1.0 **ends at Dealer**. Install/Service/Warranty/AMC/Monitoring are future —
  do NOT design them.
- Inbuilt Lithium = imported PCB + OCS battery pack (4S1P/8S1P) + BMS; battery is permanent,
  genealogy includes it. Hybrid = NO battery genealogy.
- No `master_inverters` table exists yet (INVERTER is only an `ecf_entity_type` enum value).

## Implementation lessons (Phase 0 schema, learned in build)

- **`products.model_id` MUST be `NOT NULL`.** Identity contract = manufacturer is DERIVED via
  model (`model_id → manufacturer_id`), so a model-less Product cannot satisfy it. Consequence:
  backfill AND the QC-pass emit must **skip-and-report** any order with no model, never create an
  invalid Product. `category_id`, `workflow_code`, `official_product_serial` are also NOT NULL;
  only `source_production_order_id` is nullable (UNIQUE) — it is the SOLE order↔unit link
  (`mfg_production_orders.product_id` stays the Model/SKU FK, never repurposed).
- **`products`↔`logistics` is a deliberate circular import** (`products`→`logistics_dealers`;
  `logistics_dispatch_items`→`products`). Safe via Drizzle lazy `() =>` reference callbacks + ESM
  live bindings; api-server boots clean. Don't try to "fix" it by merging files.
- **No product-delete route, ever.** `product_genealogy`/`product_events` cascade-delete from
  `products`; `dispatch_items.product_id` is `set null`. Cascades exist only for referentially-safe
  rollback/teardown — a real delete route would wipe append-only event history.
- **"No Product before QC PASS" is enforced INSIDE `createProductFromOrder`, not just by callers.**
  The helper itself skips (`order_not_qc_passed`) unless the order is `completed`. The order status
  enum has NO separate qc state — `completed` IS the post-QC signal: qc-approval sets it on approval
  *before* calling the helper (same tx), and the sequential stage flow can only complete an order
  after the QC stage is approved. Don't look for a "qc_passed" order status; it doesn't exist.
- **Generic over category stays in `classifyOrderProduct` only.** Future Inbuilt-Lithium/Hybrid add
  cases there (category/workflow/serial_source derivation); `createProductFromOrder` itself never
  changes. Keep that separation — it's the whole point of the generic creation engine.

## Workflow-driven Product Creation Trigger (CW-03 Phase 0 — implemented)

The WORKFLOW decides WHEN a Product is minted, not a hardcoded QC-PASS condition. The Workflow
Master carries `product_creation_trigger` (pgEnum `QC_PASS | INCOMING_INSPECTION_PASS`). Seed:
BATTERY/INBUILT_LITHIUM → `QC_PASS`, HYBRID → `INCOMING_INSPECTION_PASS`.
- **Why an enum, not free-form data like `stage_sequence`:** each trigger maps to BEHAVIORAL
  dispatch in the creation engine (a distinct completion gate + manufacturing-completion timestamp
  source), so the closed enum + exhaustive `switch` (with a `never` default) keeps dispatch honest;
  adding a trigger is intentionally code (a new handler) + migration together.
- **Engine:** `createProductFromOrder` looks up the workflow's trigger and dispatches
  `resolveCreationTrigger`. `QC_PASS` = the prior behavior verbatim (gate `order.status==='completed'`
  + QC-stage `approvedAt` NULLS LAST, fallback `updatedAt`). `INCOMING_INSPECTION_PASS` = guarded
  skip (`trigger_not_implemented`) — Hybrid incoming-inspection flow doesn't exist in CW-03; the
  handler lands later with NO change to the engine's structure. Category genericity still lives only
  in `classifyOrderProduct`.
- **Seed is authoritative for the trigger** via `onConflictDoUpdate(set excluded.product_creation_trigger)`
  so existing rows get corrected on restart WITHOUT clobbering director-editable name/status/stageSequence.
  Trigger is NOT exposed via the master write API/UI in CW-03 (platform config, not day-to-day editable).
- **Follow-up (deferred to CW-03 MAT certification, not built now):** a focused regression test for
  trigger dispatch (QC_PASS creates / INCOMING_INSPECTION_PASS skips). Architect rated high-impact but
  it's certification-phase scope.
- **FROZEN trigger model (CTO-approved 2026-06-28).** The ONLY approved triggers for Product Platform
  v1.0 are `QC_PASS` and `INCOMING_INSPECTION_PASS`. Do NOT add triggers during CW-03; new triggers
  require a formal architecture review AFTER CW-08, and a future workflow defines its OWN trigger
  rather than modifying Product Platform code. **Permanent separation rule:** Workflow decides WHEN a
  Product is created (stages + creation trigger + timing); Product Platform decides WHAT is created
  (identity, official serial, lifecycle, genealogy, events) and never decides when. Platform stays
  generic — no workflow-specific business logic. This is a permanent architectural rule, not a
  CW-03-only constraint.

## Consistency with platform freeze

This is **new capability on top of frozen platforms** (ODS/ECF/Security/Cert/Audit reused by
adoption, not expansion) — allowed under the freeze. Product corrections must go through ECF.
The workflow-driven trigger is **additive and v1.0-compatible** (CTO-directed, explicitly "not a
scope change"): a new column + enum, no certified table touched, downstream contract unchanged.
