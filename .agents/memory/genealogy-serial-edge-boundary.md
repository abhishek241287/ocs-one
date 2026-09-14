---
name: Genealogy serial-edge boundary
description: Phase 8 rule separating component serial snapshots and identity observations from certified consumption genealogy.
---

Component serial fields on manufacturing/Product genealogy rows and the global serial identity index are not, by themselves, document-cited consumption edges. A full actual-serial composition result requires an explicit edge to the certified allocation, WIP issue, or consumption document.

**Why:** The manufacturing genealogy writer stores component snapshots and Product creation copies them, while serial indexing records identity observations without movement semantics. Matching serial text, model, BOM line, or component name would infer genealogy and violate the document-citation rule.

**How to apply:** Keep genealogy queries read-only and fail closed for serial-to-consumption claims. Close this gap only at a certified transactional writer that records source document type/id; do not add a query-time inference or treat `serial_units` as a stock ledger.