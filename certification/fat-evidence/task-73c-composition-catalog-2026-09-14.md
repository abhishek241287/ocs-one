# Batch 73-C — Composition Edge Catalog and Gap Closure

**Date:** 2026-09-14  
**Scope:** Read-only SQL/hop catalog for Phase 8 questions Q1–Q4.  
**Controls:** No genealogy API, UI, movement semantic, inferred edge, commit, or
deployment was added by this batch.

## Decision summary

The certified lot/order chain is already complete for the current reservation-driven
WIP flow:

```text
production order
  → WIP issue note
  → WIP issue line
  → reservation allocation
  → inventory lot
  → GRN line
  → GRN header / supplier
  → validated typed capture values
```

The single-material issue route and Batch 72-A bulk issue route both end at the same
`wip_issue_notes` / `wip_issue_lines` / `inventory_reservation_allocations` chain.
The bulk route adds `bulk_batches` / `bulk_batch_lines` as grouping evidence; it
does not create an alternate lot or consumption edge.

No additive schema or route change is justified in this batch. Two composition
limitations remain explicitly deferred:

1. `mfg_battery_genealogy.serial_number` and the copied
   `product_genealogy.serial_number` are component snapshots, not globally
   document-cited serial edges. There is no certified serial-to-allocation or
   serial-to-consumption link.
2. The current development database contains no bulk batch or WIP issue fixture,
   so the runtime portion of CC-03 cannot be marked PASS here. The read-only
   SQL and static shape checks are complete; a populated FAT fixture is required
   for the live traversal assertion.

These are deferrals, not inferred links. A future closure must add a minimal,
document-cited edge at the certified writer boundary before a genealogy query can
claim full actual-serial composition.

## Source documents and hop catalog

The table names below are the physical PostgreSQL relations. The source document
column identifies the immutable or append-only row that proves the edge; it is not
an inferred movement record.

### Q1 — Production order → WIP issue → allocation → lot/GRN → supplier/attributes

| Hop | Join key | Source document cited | Status |
|---|---|---|---|
| Order → WIP issue note | `wip_issue_notes.production_order_id = mfg_production_orders.id` | `wip_issue_notes.id` / `issue_number` | PASS |
| WIP issue note → issue line | `wip_issue_lines.wip_issue_note_id = wip_issue_notes.id` | `wip_issue_lines.id` | PASS |
| Issue line → exact allocation | `wip_issue_lines.reservation_allocation_id = inventory_reservation_allocations.id` and matching `lot_id` | `inventory_reservation_allocations.id` | PASS |
| Allocation → reservation/order | `inventory_reservation_allocations.reservation_id = inventory_reservations.id`; reservation order matches the note order | `inventory_reservations.id` / `reservation_number` | PASS |
| Allocation → receipt lot | `inventory_reservation_allocations.lot_id = inventory_lots.id` | `inventory_lots.id` / `lot_number` | PASS |
| Lot → GRN line | `inventory_lots.grn_line_id = grn_line_items.id` | `grn_line_items.id` / `grn_id` | PASS |
| GRN line → GRN/supplier | `grn_line_items.grn_id = grn_headers.id`; `grn_headers.supplier_id = master_suppliers.id` | `grn_headers.id` / `grn_number` | PASS |
| GRN line → typed attributes | `attribute_capture_instances.target_type = 'GRN_LINE'` and `target_id = grn_line_items.id`; values join by `capture_instance_id` | `attribute_capture_instances.id` and `attribute_capture_values.id` | PASS |
| Bulk grouping, when present | `bulk_batch_lines.wip_issue_note_id = wip_issue_notes.id` | `bulk_batches.id` / `bulk_batch_lines.id` | PASS by schema; live fixture absent |

**Authority:** reservation/allocation and WIP schemas; the reservation engine;
`executeBulkIssueInTx`; GRN capture adapter; Phase 6 receiving evidence.

```sql
-- Q1. Bind :production_order_id for one order. Read-only.
SELECT
  po.id                         AS production_order_id,
  po.order_number,
  po.battery_number,
  win.id                        AS wip_issue_note_id,
  win.issue_number,
  win.status                    AS wip_issue_status,
  wil.id                        AS wip_issue_line_id,
  wil.quantity                  AS issue_quantity,
  ira.id                        AS allocation_id,
  ira.quantity                  AS allocation_quantity,
  ira.status                    AS allocation_status,
  ir.id                         AS reservation_id,
  ir.reservation_number,
  il.id                         AS lot_id,
  il.lot_number,
  il.supplier_lot_number,
  gli.id                        AS grn_line_id,
  gh.id                         AS grn_id,
  gh.grn_number,
  gh.received_date,
  s.id                          AS supplier_id,
  s.name                        AS supplier_name,
  ac.id                         AS capture_instance_id,
  ad.code                       AS attribute_code,
  av.value_text,
  av.value_num,
  av.value_bool,
  av.value_date,
  av.unit,
  bb.id                         AS bulk_batch_id,
  bbl.id                        AS bulk_batch_line_id
FROM mfg_production_orders po
JOIN wip_issue_notes win
  ON win.production_order_id = po.id
JOIN wip_issue_lines wil
  ON wil.wip_issue_note_id = win.id
JOIN inventory_reservation_allocations ira
  ON ira.id = wil.reservation_allocation_id
 AND ira.lot_id = wil.lot_id
JOIN inventory_reservations ir
  ON ir.id = ira.reservation_id
 AND ir.production_order_id = win.production_order_id
JOIN inventory_lots il
  ON il.id = ira.lot_id
 AND il.grn_line_id IS NOT NULL
JOIN grn_line_items gli
  ON gli.id = il.grn_line_id
JOIN grn_headers gh
  ON gh.id = gli.grn_id
JOIN master_suppliers s
  ON s.id = gh.supplier_id
LEFT JOIN attribute_capture_instances ac
  ON ac.target_type = 'GRN_LINE'
 AND ac.target_id = gli.id
LEFT JOIN attribute_capture_values av
  ON av.capture_instance_id = ac.id
LEFT JOIN attribute_definitions ad
  ON ad.id = av.attribute_id
LEFT JOIN bulk_batch_lines bbl
  ON bbl.wip_issue_note_id = win.id
LEFT JOIN bulk_batches bb
  ON bb.id = bbl.batch_id
WHERE po.id = :production_order_id
ORDER BY win.created_at, wil.created_at, ac.created_at, av.id;
```

The following completeness assertion must be run with the same read-only
connection. It intentionally uses left joins so a broken edge is counted rather
than silently removed from the result:

```sql
SELECT
  count(*) AS total_issue_lines,
  count(*) FILTER (
    WHERE ira.id IS NOT NULL
      AND ira.reservation_id = win.reservation_id
      AND ira.lot_id = wil.lot_id
      AND il.id IS NOT NULL
      AND il.grn_line_id IS NOT NULL
  ) AS fully_linked_issue_lines,
  count(*) FILTER (WHERE bbl.id IS NOT NULL) AS bulk_issue_lines
FROM wip_issue_lines wil
JOIN wip_issue_notes win
  ON win.id = wil.wip_issue_note_id
LEFT JOIN inventory_reservation_allocations ira
  ON ira.id = wil.reservation_allocation_id
LEFT JOIN inventory_lots il
  ON il.id = wil.lot_id
LEFT JOIN bulk_batch_lines bbl
  ON bbl.wip_issue_note_id = win.id;
```

### Q2 — Lot → allocations/reservations/POs, WIP/consumption, and transfers

| Hop | Join key | Source document cited | Status |
|---|---|---|---|
| Lot → allocation | `inventory_reservation_allocations.lot_id = inventory_lots.id` | allocation row | PASS |
| Allocation → reservation/order | `allocation.reservation_id = inventory_reservations.id`; reservation has `production_order_id` | reservation row | PASS |
| Lot → WIP issue | `wip_issue_lines.lot_id = inventory_lots.id`; note provides order | WIP issue note and line | PASS |
| Lot → WIP balance | `wip_inventory.lot_id = inventory_lots.id`; row also carries order/material | WIP inventory row | PASS |
| WIP → consumption | `consumption_confirmations` matches `production_order_id`, `material_id`, and `lot_id` | consumption confirmation row and signed transaction `source_document_id` | PASS |
| Lot → generic transfer | `transfer_lines.lot_id = inventory_lots.id`; line joins its transfer request | transfer line/request | PASS where generic lot transfer is used |
| Cell lot → source material transfer | `cell_lots.transfer_id = material_transfers.id`; transfer has `grn_line_id`, `grn_id`, and `supplier_id` | material transfer row | PASS for cell-lot provenance |

The Q2 SQL contains only reservation/WIP/consumption/transfer relations. It does
not read the legacy BOM-driven issue relation, because that path has no certified
lot-to-composition edge and must not be used to infer genealogy.

```sql
-- Q2. Bind :lot_id for one receipt lot. Read-only.
SELECT
  il.id                         AS lot_id,
  il.lot_number,
  il.supplier_lot_number,
  ira.id                        AS allocation_id,
  ira.quantity                  AS allocated_quantity,
  ira.status                    AS allocation_status,
  ir.id                         AS reservation_id,
  ir.reservation_number,
  ir.production_order_id,
  win.id                        AS wip_issue_note_id,
  win.issue_number,
  wil.id                        AS wip_issue_line_id,
  wil.quantity                  AS issued_quantity,
  wi.id                         AS wip_inventory_id,
  wi.issued_qty,
  wi.consumed_qty,
  wi.returned_qty,
  wi.scrapped_qty,
  wi.remaining_qty,
  cc.id                         AS consumption_confirmation_id,
  cc.confirmation_number,
  cc.planned_qty,
  cc.actual_qty,
  cc.variance_qty,
  tl.id                         AS transfer_line_id,
  tr.id                         AS transfer_request_id,
  tr.transfer_number,
  tr.status                     AS transfer_status
FROM inventory_lots il
LEFT JOIN inventory_reservation_allocations ira
  ON ira.lot_id = il.id
LEFT JOIN inventory_reservations ir
  ON ir.id = ira.reservation_id
LEFT JOIN wip_issue_lines wil
  ON wil.lot_id = il.id
 AND wil.reservation_allocation_id = ira.id
LEFT JOIN wip_issue_notes win
  ON win.id = wil.wip_issue_note_id
LEFT JOIN wip_inventory wi
  ON wi.lot_id = il.id
 AND wi.production_order_id = ir.production_order_id
LEFT JOIN consumption_confirmations cc
  ON cc.lot_id = il.id
 AND cc.production_order_id = COALESCE(wi.production_order_id, ir.production_order_id)
 AND cc.material_id = il.material_id
LEFT JOIN transfer_lines tl
  ON tl.lot_id = il.id
LEFT JOIN transfer_requests tr
  ON tr.id = tl.transfer_request_id
WHERE il.id = :lot_id
ORDER BY ir.created_at, win.created_at, wi.created_at, cc.created_at, tr.created_at;
```

Cell-lot provenance is a separate certified document path and is intentionally
cataloged explicitly:

```sql
SELECT
  cl.id                         AS cell_lot_id,
  cl.lot_number                 AS cell_lot_number,
  c.id                          AS cell_id,
  c.cell_id                    AS cell_serial,
  mt.id                         AS material_transfer_id,
  mt.transfer_number,
  mt.grn_line_id,
  mt.grn_id,
  mt.supplier_id,
  gli.material_id,
  gli.supplier_lot_number,
  gh.grn_number,
  s.name                        AS supplier_name
FROM cell_lots cl
JOIN cells c
  ON c.lot_id = cl.id
LEFT JOIN material_transfers mt
  ON mt.id = cl.transfer_id
LEFT JOIN grn_line_items gli
  ON gli.id = mt.grn_line_id
LEFT JOIN grn_headers gh
  ON gh.id = mt.grn_id
LEFT JOIN master_suppliers s
  ON s.id = mt.supplier_id
WHERE cl.id = :cell_lot_id
ORDER BY c.cell_id;
```

### Q3 — Finished serial → Product/order → consumed lots/serials and cell provenance

| Hop | Join key | Source document cited | Status |
|---|---|---|---|
| Finished serial → Product | `products.official_product_serial = :serial` | Product row | PASS |
| Product → production order | `products.source_production_order_id = mfg_production_orders.id` | Product row + order row | PASS |
| Product → copied component rows | `product_genealogy.product_id = products.id` | Product genealogy row; copied from manufacturing genealogy in the Product creation transaction | PASS as a projection |
| Order → consumed lots | order joins WIP notes/lines and WIP inventory by `production_order_id`; each row retains `lot_id` | WIP issue / WIP inventory / consumption documents | PASS |
| Component cell → cell lot | `mfg_battery_genealogy.component_id = cells.id`; `cells.lot_id = cell_lots.id` | manufacturing genealogy row + cell/cell-lot identity | PASS for component identity and lot provenance |
| Cell lot → GRN/supplier | `cell_lots.transfer_id = material_transfers.id` and transfer GRN keys | material transfer document | PASS where `transfer_id` is present |
| Component serial → consumed serial instance | no certified join from `serial_units` to allocation, WIP issue, or consumption | none | DEFERRED |
| Manufacturing genealogy row → source stage document | no source-document type/id columns on `mfg_battery_genealogy` | none for a document-cited edge | DEFERRED |

The first six rows are queryable without guessing. The last two are deliberately
not bridged by matching text, material, model, BOM line, or component name.

```sql
-- Q3. Product/order and certified lot/cell paths. Bind :official_serial.
WITH target AS (
  SELECT
    p.id AS product_id,
    p.official_product_serial,
    p.source_production_order_id AS production_order_id
  FROM products p
  WHERE p.official_product_serial = :official_serial
)
SELECT
  t.product_id,
  t.official_product_serial,
  t.production_order_id,
  po.order_number,
  po.battery_number,
  pg.id                         AS product_genealogy_id,
  pg.component_type,
  pg.component_id,
  pg.component_name,
  pg.serial_number              AS component_serial_snapshot,
  wi.id                         AS wip_inventory_id,
  wi.material_id,
  wi.lot_id,
  wi.issued_qty,
  wi.consumed_qty,
  wi.remaining_qty,
  cc.id                         AS consumption_confirmation_id,
  cc.actual_qty                 AS consumed_quantity,
  c.id                          AS cell_id,
  c.cell_id                     AS cell_serial,
  cl.id                         AS cell_lot_id,
  cl.lot_number                 AS cell_lot_number,
  mt.id                         AS cell_material_transfer_id,
  mt.grn_line_id                AS cell_grn_line_id
FROM target t
JOIN mfg_production_orders po
  ON po.id = t.production_order_id
LEFT JOIN product_genealogy pg
  ON pg.product_id = t.product_id
LEFT JOIN wip_inventory wi
  ON wi.production_order_id = t.production_order_id
LEFT JOIN consumption_confirmations cc
  ON cc.production_order_id = wi.production_order_id
 AND cc.material_id = wi.material_id
 AND cc.lot_id = wi.lot_id
LEFT JOIN cells c
  ON c.id = pg.component_id
 AND pg.component_type = 'cell'
LEFT JOIN cell_lots cl
  ON cl.id = c.lot_id
LEFT JOIN material_transfers mt
  ON mt.id = cl.transfer_id
ORDER BY pg.created_at, wi.created_at, cc.created_at;
```

The `serial_units` index is still useful for identity resolution and direct QR
lookup. It is not treated as a movement ledger and is not joined to a WIP
consumption row unless a future certified writer records that edge.

### Q4 — Typed attribute range → GRN lines/lots → downstream consumers

`attribute_capture_values.value_num` is the authoritative numeric value for a
range query. The `(attribute_id, value_num)` index supports the first filter.
The capture instance is restricted to `GRN_LINE`, and the lot is reached through
the immutable GRN-line link on `inventory_lots`.

| Hop | Join key | Source document cited | Status |
|---|---|---|---|
| Typed range → capture value | `attribute_capture_values.attribute_id = :attribute_id` and `value_num` range | typed capture value row | PASS |
| Capture value → GRN line | value → capture instance; `target_type = 'GRN_LINE'`, `target_id = grn_line_items.id` | capture instance row | PASS |
| GRN line → receipt lot | `inventory_lots.grn_line_id = grn_line_items.id` | GRN line / lot rows | PASS |
| Lot → downstream WIP/consumption | Q2 lot joins | WIP and consumption documents | PASS |
| Lot/order → finished Product | order joins `products.source_production_order_id` | Product/order rows | PASS when manufactured Product exists |

```sql
-- Q4. Bind :attribute_id, :minimum_value, and :maximum_value. Read-only.
WITH affected_lines AS (
  SELECT
    av.id                         AS capture_value_id,
    av.capture_instance_id,
    av.value_num,
    av.unit,
    ac.target_id                  AS grn_line_id,
    ad.code                       AS attribute_code
  FROM attribute_capture_values av
  JOIN attribute_capture_instances ac
    ON ac.id = av.capture_instance_id
   AND ac.target_type = 'GRN_LINE'
   AND ac.status = 'VALIDATED'
  JOIN attribute_definitions ad
    ON ad.id = av.attribute_id
  WHERE av.attribute_id = :attribute_id
    AND av.value_num >= :minimum_value
    AND av.value_num < :maximum_value
)
SELECT
  al.attribute_code,
  al.value_num,
  al.unit,
  al.capture_value_id,
  gli.id                        AS grn_line_id,
  gli.grn_id,
  gh.grn_number,
  il.id                         AS lot_id,
  il.lot_number,
  il.supplier_lot_number,
  win.production_order_id,
  wi.id                         AS wip_inventory_id,
  wi.consumed_qty,
  cc.id                         AS consumption_confirmation_id,
  p.id                          AS product_id,
  p.official_product_serial
FROM affected_lines al
JOIN grn_line_items gli
  ON gli.id = al.grn_line_id
JOIN grn_headers gh
  ON gh.id = gli.grn_id
JOIN inventory_lots il
  ON il.grn_line_id = gli.id
LEFT JOIN wip_inventory wi
  ON wi.lot_id = il.id
LEFT JOIN wip_issue_notes win
  ON win.production_order_id = wi.production_order_id
LEFT JOIN consumption_confirmations cc
  ON cc.production_order_id = wi.production_order_id
 AND cc.material_id = wi.material_id
 AND cc.lot_id = wi.lot_id
LEFT JOIN products p
  ON p.source_production_order_id = wi.production_order_id
ORDER BY al.value_num, il.lot_number, win.production_order_id;
```

## Gap closure decision

### Closed in this catalog

- The order-to-lot-to-receipt path is cataloged with exact keys.
- Allocation provenance is preserved for both single and bulk issue orchestration.
- WIP and consumption retain the lot and production-order keys needed for Q2.
- Cell-lot provenance is cataloged through the material-transfer document.
- Typed numeric recall is cataloged through `value_num`, not string parsing.
- Product output identity is cataloged as the one Product row linked by
  `source_production_order_id`; no output-lot concept is invented.

### Deferred with owner-visible consequences

**D-73C-01 — Component serial source citation and serial consumption edge.**  
The stage writers in `manufacturing/stages.ts` append component rows directly to
`mfg_battery_genealogy`. The manual genealogy route can append the same shape.
The row has `production_order_id`, component fields, and an optional
`serial_number`, but no `source_document_type` or `source_document_id`.
`product-creation.ts` copies those fields into `product_genealogy`; the copy is
not a new source document. `serial_units` records identity observations from
GRN capture, scan confirmation, and Product completion, but does not record an
allocation, WIP issue, or consumption document id.

**Consequence:** Q3 can prove Product/order, lot/WIP/consumption, and cell-lot
provenance. It cannot claim a full actual-serial BOM explosion or assert that a
component serial was physically consumed by a particular issue without a new
certified, document-cited edge. No text matching or model/BOM inference is
allowed as a substitute.

**Required future owner:** manufacturing genealogy/product-completion owner,
with the inventory traceability owner reviewing the serial-to-document contract.
The future additive must be written in the existing certified transaction and
must carry the source document type/id; it must not alter movement semantics.

## CC-01 through CC-07 evidence

| Check | Result | Evidence |
|---|---|---|
| CC-01: Q1–Q4 read-only SQL and hop catalog | PASS | This document; every query is `SELECT`/`WITH` only and each claimed hop has a table/key/source-document row. |
| CC-02: no legacy BOM-issue relation in Q2 SQL | PASS | Static review of the Q2 code blocks; Q2 uses allocation, reservation, WIP, consumption, and transfer relations only. |
| CC-03: bulk issue composes through the same Q1 chain | BLOCKED — fixture absent | Development read-only check on 2026-09-14 returned `bulk_batches = 0`, `bulk_orders = 0`, and `wip_issue_lines = 0`. Schema and `executeBulkIssueInTx` prove the shared writer path; a live end-to-end row needs a FAT fixture. |
| CC-04: component serials have a document-cited edge | DEFERRED | Direct stage writers and the Product copy were located; the source-document columns and serial-to-consumption edge do not exist. See D-73C-01. |
| CC-05: D-gen-3 serial index / QR behavior remains intact | PASS carried forward | Batch 73-B `test:phase8-serials` passed; no 73-C code changed the index or QR path. |
| CC-06: prior inventory certification wall | PASS carried forward | Phase 6/71-F and Phase 6-71-F evidence passed before this documentation-only batch; reservation 15/15 and invariant evidence remain the governing checks. |
| CC-07: 73-C fixture residue | PASS | No 73-C fixture writes were performed; no 73-C cleanup was required. Existing development capture rows are pre-existing and were not deleted. |

The blocked and deferred statuses are intentional. Marking either as PASS would
claim evidence that is not present in the current development database or would
turn a snapshot field into an inferred genealogy edge.

## Verification record

The following read-only database checks were run on 2026-09-14:

```text
bulk_batches = 0
bulk production orders = 0
wip_issue_lines = 0
products = 0
mfg_battery_genealogy rows = 0
serial_units = 0
attribute_capture_values = 868
attribute_capture_values with value_num = 424
capture_values_attr_num_idx exists = true
```

No commit or deployment was made.