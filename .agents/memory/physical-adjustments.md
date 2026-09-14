---
name: Physical adjustment ledger boundary
description: D8 rules for count-style inventory adjustments and nullable source lines.
---

Warehouse-level positive adjustments are the only ledger writers allowed to have a null lot and null source line; negative adjustments must be lot-scoped so the lot and GRN line can be locked before revalidating available stock.

**Why:** A warehouse-level negative cannot lock every line-keyed consumer safely, while additive positive stock has no oversell direction. Existing source-line readers must therefore skip null buckets without weakening lot-line accounting.

**How to apply:** Keep adjustment posting separate from consumption annotation updates. Use `inventory_adjustment` as the bounded source-document label, one signed ledger row per posted document, and verify the INV-P5-03 wall queries after changes. After a transfer, treat `inventory_lots.warehouse_id` as receipt provenance; validate a lot-scoped adjustment against the signed available ledger at the target warehouse.

Transferred lots retain their original receipt warehouse on the lot header while current stock location is represented by signed ledger rows.

**Why:** The Phase 5 cross-domain gate must allow a physical adjustment at a transfer destination without rewriting immutable receipt provenance or accepting stock that is not actually available there.

**How to apply:** For post-transfer adjustments, lock the lot/GRN source for traceability, then use the document warehouse/location ledger balance as the authoritative availability check. Keep read projections explicit about provenance versus current location.

Lot-scoped negative adjustments and transfer issue must share a transaction-scoped lot lock, and transfer availability must include broader-scope ledger rows (such as warehouse-level rows with null location) when evaluating a location-specific request.

**Why:** A serialized adjustment can still be ignored by a transfer balance query if the two writers use different dimensional scopes; the combined movement can then produce a negative signed-ledger balance.

**How to apply:** Lock the common lot before checking or posting either movement. When a request has a location or bin, match exact rows plus rows whose corresponding dimension is null, because null represents a broader warehouse/location scope.