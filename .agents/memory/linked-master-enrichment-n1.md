---
name: Linked-master read-time enrichment (N+1 note)
description: How GRN + stock rows derive their linked component master, and the deliberate non-batched resolver decision.
---

Procurement is the single source of truth via a GENERIC polymorphic material→component-master link (material carries `linked_master_type` + `linked_master_id`; NO Component Registry table). Downstream rows (GRN lines, inventory stock) show the component master by resolving it at READ TIME through the shared `resolveLinkedMaster(type, id)` — it is never denormalized into the ledger or the GRN line.

**Current shape (deliberate):**
- `inventory/stock.ts` — dedups by `(type,id)` per page then calls `resolveLinkedMaster` once per distinct key (one PK lookup each). Grouped projection GROUP BYs `usageType`/`linkedMasterType`/`linkedMasterId` so the keys line up with enrichment.
- `inventory/grns.ts` (`buildLineEnrichment`) — resolves per line, no cache.

**Decision:** left non-batched on purpose. Architect flagged it as the primary (non-blocking) scalability risk; it was NOT fixed because the CTO commercial-readiness directive says fix only what blocks real factory ops, and both paths run at safe scale (stock is paginated + cached; a GRN has bounded lines).

**Why / how to apply:** if a stock page or GRN ever shows enrichment latency at scale, batch by type — `WHERE id IN (...)` per master table, map in-memory — instead of the per-key loop. Add a perf regression around `listStockBalances` with many distinct linked masters at the same time. The signed inventory ledger stays FROZEN and unchanged either way.
