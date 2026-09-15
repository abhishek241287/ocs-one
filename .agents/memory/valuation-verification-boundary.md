---
name: Valuation verification boundary
description: Receipt-cost valuation starts with evidence and legacy-gap measurement before any layer engine or value conservation work.
---

# Valuation verification boundary

The first valuation batch is verification-only. It must prove the receipt-document → GRN → GRN line → inventory lot → signed quantity movement chain, introduce only nullable GRN-line receipt-cost evidence with explicit CAPTURED/MISSING/LEGACY status, and prove valuation writes zero quantity-ledger rows.

**Why:** the quantity ledger is certified and must remain quantity-only; the legacy cost census determines how much of the later layer-engine test surface can exercise captured-cost paths versus explicit missing-cost paths.

**How to apply:** do not start FIFO, WAVG, depletion, value reports, UI, GL, or value-conservation work until the evidence report passes the four hard stops and is reviewed.