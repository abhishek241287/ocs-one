---
name: Valuation verification boundary
description: Receipt-cost valuation starts with evidence and legacy-gap measurement before any layer engine or value conservation work.
---

# Valuation verification boundary

The first valuation batch is verification-only. It must prove the receipt-document → GRN → GRN line → inventory lot → signed quantity movement chain, introduce only nullable GRN-line receipt-cost evidence with explicit CAPTURED/MISSING/LEGACY status, and prove valuation writes zero quantity-ledger rows.

**Why:** the quantity ledger is certified and must remain quantity-only; the legacy cost census determines how much of the later layer-engine test surface can exercise captured-cost paths versus explicit missing-cost paths.

**How to apply:** do not start FIFO, WAVG, depletion, value reports, UI, GL, or value-conservation work until the evidence report passes the four hard stops and is reviewed.

Receipt-cost scale validation must account for binary floating-point residue when checking a positive four-decimal unit cost; compare the scaled value to its rounded integer with a small bounded epsilon (or validate the original decimal text), never with exact equality.

**Why:** a valid API value such as `12.3456` can produce a fractional residue after multiplying by 10,000 in JavaScript and would otherwise be rejected as over-precision.

**How to apply:** use epsilon-safe scale checks at GRN-line boundaries, while keeping the database numeric scale as the final storage constraint.