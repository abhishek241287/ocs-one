---
name: Serial index boundaries
description: Durable rules for serial identity indexing, audit atomicity, teardown ordering, and output-material resolution.
---

The serial index is an identity observation layer, not a movement or genealogy engine. Writers must use a transaction-bound advisory lock, preserve global serial uniqueness, reject material/lot conflicts, treat same-source replays as no-ops, and append SERIAL_INDEXED plus security evidence in the same transaction.

**Why:** The index is referenced by capture and product records, while certification fixtures delete those source rows. Historical serial identity must be removed from fixture data before its referenced capture rows are deleted, or teardown fails on the FK.

**How to apply:** When changing a writer or certification teardown, delete serial-index outbox rows and serial units before deleting capture/source fixtures. Never infer movement, genealogy, or a material from a model/SKU.

Finished-product serials currently have no canonical material FK in the Product/order model. W3 may resolve a material only from an order BOM snapshot containing exactly one distinct material; absent or multi-material snapshots must defer rather than guess.

**Why:** `serial_units.material_id` is required, but production output is modeled as a Product/model identity and BOMs commonly contain multiple component materials.

**How to apply:** Keep W3 fail-closed until an explicit finished-product material mapping exists. Do not use a component genealogy ID or model/SKU ID as a material ID.