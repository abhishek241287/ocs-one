---
name: Unified Product Platform architecture review
description: Key durable findings/decisions from the CTO architecture review for unifying all factory output under one "Product" identity (3 categories). Full report in docs/architecture/.
---

# Unified Product Platform (architecture review — pending CTO approval)

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

## Consistency with platform freeze

This is **new capability on top of frozen platforms** (ODS/ECF/Security/Cert/Audit reused by
adoption, not expansion) — allowed under the freeze. Product corrections must go through ECF.
Sequence implementation **after CW-02 closes** so Cell Grading cert isn't disturbed.
