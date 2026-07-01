---
name: Imported product serial-mode join
description: How the imported-product UI decides OCS-serial vs OEM-serial, and why it must key off category_id.
---

# Imported product serial-mode join

G1 imported-product creation decides serial provenance by product **category code**:
`INBUILT_LITHIUM_INVERTER` → OCS mints the serial (quantity input); `HYBRID_INVERTER` → capture the OEM serial per unit (`serial_source=MANUFACTURER`). Both created at `ready_for_packing`.

The frontend mirrors this to switch the form. It must resolve a model's category **by `category_id`** (immutable), joined against the product-categories list to get the `code`.

**Why not the display name:** `master_products.category` is legacy free-text and a category's `name` is director-editable with no unique constraint — a rename silently breaks a name-based join, leaving `mode=null` and the submit button permanently disabled for valid models.

**How to apply:** the `ProductMaster` response schema now includes `category_id`; use it. If you extend imported categories, add the code to the frontend's importable set AND the backend `IMPORT_CATEGORY_CONFIG`.
