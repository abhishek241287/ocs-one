---
name: Physical adjustment ledger boundary
description: D8 rules for count-style inventory adjustments and nullable source lines.
---

Warehouse-level positive adjustments are the only ledger writers allowed to have a null lot and null source line; negative adjustments must be lot-scoped so the lot and GRN line can be locked before revalidating available stock.

**Why:** A warehouse-level negative cannot lock every line-keyed consumer safely, while additive positive stock has no oversell direction. Existing source-line readers must therefore skip null buckets without weakening lot-line accounting.

**How to apply:** Keep adjustment posting separate from consumption annotation updates. Use `inventory_adjustment` as the bounded source-document label, one signed ledger row per posted document, and verify the INV-P5-03 wall queries after changes.