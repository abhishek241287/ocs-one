---
name: Inventory signed-ledger state model
description: How OCS One inventory stock state moves — append-only signed transactions, never overwrites. Applies to GRN, Incoming Inspection, and future inventory modules.
---

# Inventory signed-ledger state model

OCS One inventory NEVER stores a mutable "current quantity" per material. On-hand is
always a **projection**: `SUM(quantity)` of append-only `inventory_transactions` grouped
by material × `stock_state`. Every module that changes stock writes signed ledger rows;
nothing is updated in place.

**Why:** factory traceability + audit — every quantity change must be reconstructable from
an immutable history, and concurrent writers must net correctly without lost updates.

**How to apply (when building any inventory-affecting module):**
- To *move* quantity between states, emit two signed rows (negative out of the old state,
  positive into the new) — e.g. inspection: `RELEASE -received @inspection_pending`,
  `ACCEPT +accepted @available`, `REJECT +rejected @rejected`. Skip zero-qty rows.
- The stock projection uses a zero-net `HAVING` filter, so a fully-released state simply
  disappears from results (don't expect a literal `0` row).
- State guards (status checks, already-processed checks) must run inside the tx under
  `SELECT … FOR UPDATE` on the owning header row (TOCTOU); back them with a DB UNIQUE
  constraint for a hard second line of defense (e.g. one-inspection-per-GRN).
- Separation of records: a receipt record (GRN) is immutable once posted; a downstream
  decision (Inspection) records its own outcome and only *reflects* a status badge back —
  it never edits the receipt's quantities/material/supplier/uom.
