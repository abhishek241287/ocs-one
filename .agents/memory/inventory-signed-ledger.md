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
- Store → Cell Processing transfers are the approved cross-domain exception: emit only the
  negative source `available` row; reconcile the destination through the immutable transfer,
  linked cell lot, and generated cells rather than adding a positive row to the source line.

**Why:** cells are a separate Cell Processing stock domain. A positive `available` row on the
original GRN line would restore transferred stock in Store projections and the transfer picker.

**How to apply:** expose/read a cross-domain audit of source movement, remaining source balance,
cell-lot quantity, and generated-cell count; do not treat the destination as raw-material stock.
- The stock projection uses a zero-net `HAVING` filter, so a fully-released state simply
  disappears from results (don't expect a literal `0` row).
- State guards (status checks, already-processed checks) must run inside the tx under
  `SELECT … FOR UPDATE` on the owning header row (TOCTOU); back them with a DB UNIQUE
  constraint for a hard second line of defense (e.g. one-inspection-per-GRN).
- Separation of records: a receipt record (GRN) is immutable once posted; a downstream
  decision (Inspection) records its own outcome and only *reflects* a status badge back —
  it never edits the receipt's quantities/material/supplier/uom.
- Per-receipt provenance (drill-down): reconstruct *remaining-available per GRN line* with a
  grouped `SUM(quantity)` over `inventory_transactions` filtered `stock_state='available'`
  keyed by `source_line_id` (the originating GRN line) — the same signed rows already carry
  `source_line_id` on every txn type, so this nets correctly and SUM-across-lines reconciles
  exactly to the material's aggregated `available` stock row. Build provenance as a pure
  read-only projection joining GRN→supplier→inspection→inspector; NEVER denormalize
  supplier/GRN/inspection into stock rows or add a table. Join fan-out is safe because
  `incoming_inspections.grn_id` and `incoming_inspection_lines.grn_line_id` are UNIQUE.

Certification preflights must project the ledger by `stock_state='available'`, not by summing
all signed rows for a material. Receipt, inspection-pending, rejected, and available states
are intentionally separate; an all-state sum can look wrong even when the route-facing stock
projection is correct.

**Why:** a controlled FAT fixture includes rejected and in-flight component rows alongside
available stock, so an all-state total falsely reported drift during preflight.

**How to apply:** when asserting fixture stock, constrain both the FAT source anchors and
`stock_state='available'`; count the full controlled transaction set separately to detect
missing ledger rows.
