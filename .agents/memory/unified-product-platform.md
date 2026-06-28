---
name: Unified Product Platform architecture review
description: Key durable findings/decisions from the CTO architecture review for unifying all factory output under one "Product" identity (3 categories). Full report in docs/architecture/.
---

# Unified Product Platform (architecture review — pending CTO approval)

Full deliverable: `docs/architecture/unified-product-platform-review.md`. Recommendation issued:
**APPROVED WITH CHANGES**. This is architecture only — no code was written.

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
