---
name: Receiving inspection events
description: Cumulative line-level inspection and put-away behavior for the full-inventory receiving workflow.
---

Inspection is cumulative per GRN line, not a one-time GRN action: each event records only the newly accepted/rejected quantity, releases that quantity from `inspection_pending`, and the GRN line remains pending until its totals equal the receipt. Stock provenance must aggregate inspection events before joining them to a receipt line.

**Why:** Reinspection and partial inspection are required for receiving, and joining event rows directly duplicates one receipt in stock/provenance views.

**How to apply:** Keep event uniqueness scoped to `(grn_line_id, inspection_event_number)`, derive line totals from the GRN projection, and keep put-away as a location-only update with no ledger movement.