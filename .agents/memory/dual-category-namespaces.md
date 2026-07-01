---
name: Two category namespaces (Material vs Product)
description: Why "Hybrid Inverter" exists twice as a category — Material Category vs Product Category — and which flow keys off which.
---

OCS One has TWO independent "category" masters that can share the same human-readable NAME but are different tables, different codes, and drive different flows. Confusing them wastes debugging time.

- **Material Category** (`master_material_categories`, e.g. code `HYBRID_INVERTER`, `EMPTY_INBUILT_LITHIUM_INVERTER`) — inventory/procurement side. Carries `engineering_master_required` and the material-workflow assignment. Drives Material Master → GRN → Incoming Inspection → Inventory.
- **Product Category** (`product_categories`, e.g. code `HYBRID_INVERTER`, `INBUILT_LITHIUM_INVERTER`) — Product Platform side. Referenced by `master_products.category_id`. Drives serialized-Product identity and the imported-product serial rule.

**How to apply:** when a flow "can't find" a category or routes wrong, first confirm WHICH namespace you're in. Imported Product creation resolves serial source by the *Product* Category code (`model_id → master_products.category_id → product_categories.code`), NOT the Material Category. GRN/inspection/inventory key off the *Material* Category. The two are linked only by convention (same name), never by FK — a Material Category and a Product Category with identical names are still separate rows.

**Serial provenance (imported goods):** Product Category `INBUILT_LITHIUM_INVERTER` → OCS mints `LIV-YYYYMMDD-NNNNNN` (`serial_source=OCS`, needs `quantity`); `HYBRID_INVERTER` → OEM serial becomes official (`serial_source=MANUFACTURER`, needs `oem_serials`). Category codes are immutable keys; category display names are director-editable, so always resolve by code, never by name.
