# Batch 73-A — Phase 8 Manufacturing Genealogy Read-Only Survey

**Survey date:** 2026-09-14  
**Scope:** Read-only verification of the current production-output, completion,
serial, lot, cell-lot, and product-traceability model before any Phase 8
genealogy implementation.

## Survey controls

- Application source, schema, routes, frontend behavior, and database data were
  not modified.
- Existing certified document links were inspected only; no inferred
  genealogy edge or new movement semantic was introduced.
- Development database queries were read-only.
- The working tree was clean before this note was added. The note is
  intentionally untracked so `git diff` remains empty.

## 1. Actual production-output and order-completion model

### Manufactured output

The current system has no `production_outputs` table, finished-goods output
quantity table, or finished-goods inventory transaction. A manufactured
finished item is represented by one serialized row in `products`. The schema
documents the invariant that this row is created at the QC-PASS gate and is
the canonical finished-good unit identity:

- `lib/db/src/schema/products.ts:19-32` — Product is the serialized finished
  good and downstream modules use `official_product_serial`.
- `lib/db/src/schema/products.ts:50-114` — Product identity, status,
  location/dealer dimensions, and immutable manufacturing completion time.
- `lib/db/src/schema/inventory.ts` — Inventory transactions are the signed
  raw/material ledger; they do not create a serialized finished-good output.

`products.source_production_order_id` is unique, so one production order can
mint at most one manufactured Product. `products.official_product_serial` is
also globally unique. The Product stores optional finished-goods warehouse,
location, and bin dimensions, but no separate finished-goods ledger row is
created.

There is a separate imported-product path:

- `artifacts/api-server/src/routes/products/index.ts:392-395` — imported goods
  have no OCS production order, BOM, or inventory consumption.
- `artifacts/api-server/src/routes/products/imported-product-creation.ts:126-177`
  — imported Products are created directly in `ready_for_packing`, with an
  optional source GRN and minimal `IMPORTED_UNIT` genealogy.

### Production-order lifecycle and completion

Production orders are created with a generated order number and generated
battery number, in `draft`, with the first stage set to `cell_allocation`:

- `artifacts/api-server/src/routes/manufacturing/orders.ts:93-140`.

The current stage sequence is:

`cell_allocation → assembly → compression → bms_allocation → bms_programming
→ charging → testing → quality_control → packing`

Evidence:

- `lib/db/src/schema/manufacturing.ts:22-40,63-75`.
- `artifacts/api-server/src/routes/manufacturing/stages.ts:395-463` —
  previous-stage approval and material gates before start.
- `artifacts/api-server/src/routes/manufacturing/stages.ts:476-530` —
  completion records stage completion and runs stage-specific side effects,
  but does not itself complete the production order.
- `artifacts/api-server/src/routes/manufacturing/stages.ts:594-656` —
  supervisor approval advances the next stage; approval of terminal `packing`
  invokes the shared order-completion gate.

There are two current callers of the same completion gate:

1. Terminal packing-stage approval calls
   `completeOrderWithProduct(tx, id, supervisor)`:
   `artifacts/api-server/src/routes/manufacturing/stages.ts:623-635`.
2. QC approval on an approved decision calls the same gate:
   `artifacts/api-server/src/routes/manufacturing/qc-approval.ts:111-130`.

The shared gate is implemented in
`artifacts/api-server/src/lib/product-creation.ts:234-330`. Inside the same
transaction it:

1. Locks the order.
2. Requires a model.
3. Requires an approved QC stage with `approved_at`.
4. Requires at least one `mfg_battery_genealogy` row.
5. Sets the order to `completed` and clears `current_stage`.
6. Creates the Product, or returns the idempotent existing Product.

`createProductFromOrder` is the single Product creation boundary:

- `artifacts/api-server/src/lib/product-creation.ts:78-231`.
- It locks the order, checks the unique source-order link, resolves the
  workflow trigger, reuses `mfg_production_orders.battery_number` as
  `products.official_product_serial`, copies all manufacturing genealogy, and
  appends `product.created`.
- The current `QC_PASS` trigger uses the QC stage's immutable `approved_at` as
  `products.manufacturing_completed_at`:
  `artifacts/api-server/src/lib/product-creation.ts:374-406`.

The completion model is therefore **one Product per completed manufacturing
order**, with order genealogy copied into Product genealogy at the creation
boundary. It is not a quantity-based production-output model.

## 2. `mfg_production_orders` columns and completion fields

The exact production-order columns are defined in
`lib/db/src/schema/manufacturing.ts:94-123`:

| Column | Role |
|---|---|
| `id` | Production-order identity |
| `order_number` | Unique human/business order number |
| `battery_number` | Unique battery serial; later reused as the official Product serial |
| `product_id` | Model/SKU master FK; not the serialized unit identity |
| `cell_match_id` | Cell-match reference |
| `charger_unit_id` | Charger-unit reference |
| `bom_snapshot_id` | BOM snapshot reference |
| `factory_manager` | Order owner/creator field |
| `current_stage` | Current stage enum; cleared on completion |
| `status` | `draft`, `released`, `in_progress`, `completed`, or `cancelled` |
| `priority` | `low`, `medium`, or `high` |
| `planned_start_date` | Planned start |
| `planned_end_date` | Planned end |
| `notes` | Free-form order notes |
| `created_at` | Order creation timestamp |
| `updated_at` | Mutable update timestamp |

Completion evidence is distributed across the order, stage, QC, genealogy,
and Product records:

- `mfg_production_orders.status = 'completed'`
- `mfg_production_orders.current_stage IS NULL`
- `mfg_order_stages.stage_type = 'quality_control'`
- `mfg_order_stages.status = 'approved'`
- `mfg_order_stages.approved_at IS NOT NULL`
- At least one `mfg_battery_genealogy` row for the order
- One `products` row with the order in `source_production_order_id`
- `products.manufacturing_completed_at` sourced from QC
  `mfg_order_stages.approved_at`
- `products.product_status = 'qc_passed'` at manufactured Product creation

The stage table columns relevant to completion are listed in
`lib/db/src/schema/manufacturing.ts:125-153`, including `status`,
`completed_at`, `approved_at`, and `stage_data`. The manufacturing lineage
table is defined at `lib/db/src/schema/manufacturing.ts:155-184`.

## 3. Current serial-number writer paths

The survey distinguishes global durable identities from serial-like fields
that are only snapshots, component lineage, or scan-session data.

### Durable global identity writers

1. **Production-order battery serial**
   - `artifacts/api-server/src/routes/manufacturing/orders.ts:93-115`
     generates and writes `batteryNumber`.
   - Schema uniqueness:
     `lib/db/src/schema/manufacturing.ts:94-115`.

2. **Manufactured Product official serial**
   - `artifacts/api-server/src/lib/product-creation.ts:181-195`
     writes `officialProductSerial = order.batteryNumber`.
   - The Product unique constraint is in
     `lib/db/src/schema/products.ts:69-78`.

3. **Imported Product official serial**
   - `artifacts/api-server/src/routes/products/imported-product-creation.ts:126-149`
     either mints an OCS serial or stores the supplied manufacturer/OEM serial.
   - The same Product unique constraint provides the global Product serial
     namespace.

4. **Charger-unit serial**
   - `artifacts/api-server/src/routes/manufacturing/charger-units.ts:46-65`
     creates `mfg_charger_units.serial_number`; the update path is
     `:148-180`.
   - `lib/db/src/schema/manufacturing.ts:79-92` makes it unique.

5. **Cell identity**
   - Production transfer creation generates `CELL-YYYYMMDD-NNNNNN` identifiers
     and writes `cells.cell_id`:
     `artifacts/api-server/src/routes/inventory/transfers.ts:521-535`.
   - `lib/db/src/schema/cell-grading.ts:83-110` makes `cell_id` unique.

6. **Master test-equipment serial**
   - `lib/db/src/schema/master-test-equipment.ts:20-31` defines a unique
     `master_test_equipment.serial_number` identity. This is equipment
     identity, not finished-product genealogy.

### Serial-like fields and lineage/history writers

7. **Manufacturing component genealogy**
   - `artifacts/api-server/src/routes/manufacturing/stages.ts:140-181`
     writes cell, cabinet, busbar, and connector identifiers to
     `mfg_battery_genealogy.serial_number`.
   - `artifacts/api-server/src/routes/manufacturing/stages.ts:273-324`
     writes charger and BMS serials to the same lineage table.
   - `artifacts/api-server/src/routes/manufacturing/genealogy.ts:27-56`
     accepts a manually supplied component `serialNumber`.
   - These are per-order component lineage fields; they are not a global
     serial registry.

8. **Phase 6 receiving scans and attribute captures**
   - `artifacts/api-server/src/routes/inventory/scan-sessions.ts:414-485`
     writes a resolved or supplied `serial_number` into `scan_items` and its
     canonical scan payload.
   - Confirmed scans persist GRN-line capture values, but do not create a
     global serial table.
   - `lib/db/src/schema/attribute-engine.ts:308-370,482-515` confirms these
     are capture/session records with local indexes.

9. **Scrap serial**
   - `artifacts/api-server/src/routes/inventory/scrap.ts:132-150`
     writes the optional request serial to `scrap_documents.serial_number`.
   - It is a document field; the unique identity is the scrap document number.

10. **Dispatch serial snapshot**
    - `artifacts/api-server/src/routes/dispatch/index.ts:263-327`
      reads the Product serial and writes it to
      `dispatch_items.product_serial`.
    - `lib/db/src/schema/dispatch.ts:61-80` treats this as a printable/history
      snapshot; it is not globally unique by serial.

11. **Copied Product genealogy**
    - `artifacts/api-server/src/lib/product-creation.ts:199-211` copies each
      manufacturing component serial into `product_genealogy.serial_number`.
    - This is a Product-owned projection, not a new serial identity registry.

No serial writer currently creates `serial_units`; the live database also has
no `serial_units` table.

## 4. Lot types, cell-lot creation, and composition links

### `inventory_lots`

`inventory_lots` has no `lot_type`, `parent_lot_id`, or `child_lot_id`:

- `lib/db/src/schema/inventory-platform.ts:206-249` defines only the
  `lot_status` enum (`active`, `consumed`, `expired`, `quarantined`,
  `rejected`) and the raw-material lot columns.
- The only direct source relationship is
  `inventory_lots.grn_line_id → grn_line_items.id`.
- `inventory_lots` is a raw/material stock lot projection. The signed
  inventory transaction ledger remains authoritative for balances.

The development database query confirmed:

```text
inventory_lots_has_lot_type      = false
inventory_lots_has_parent_lot_id = false
inventory_lots_has_child_lot_id  = false
has_production_outputs           = false
has_serial_units                 = false
has_product_genealogy            = true
```

The development database currently has two `inventory_lots` rows, both with
`status = active`; there are no lot-type values to enumerate.

### Cell lots and Option A transfer behavior

`cell_lots` is a separate cell-processing domain:

- `lib/db/src/schema/cell-grading.ts:47-81` — cell-lot fields include
  `lot_number`, supplier lot, quantity, status, cell master, and nullable
  `transfer_id`; there is no lot type or parent/child self-link.
- `lib/db/src/schema/cell-grading.ts:83-110` — each `cells.lot_id` points to
  its containing `cell_lots` row.
- `artifacts/api-server/src/routes/inventory/transfers.ts:468-519` —
  production intake creates a material transfer, a signed negative available
  ledger row, and a cell lot linked by `cell_lots.transfer_id`.
- `artifacts/api-server/src/routes/inventory/transfers.ts:521-549` —
  the transfer then creates individual `cells` rows and lot timeline events.

The certified Option A relationship is:

`cell_lots.transfer_id → material_transfers.id →
material_transfers.grn_line_id`

This is a transfer/document link, not an `inventory_lots` parent-child
conversion. The regression evidence is
`artifacts/api-server/src/cert/task35-transfer-domain-suite.ts:333-417`.

### Existing manufacturing composition links

Manufacturing allocation joins matched items to `cells` and `cell_lots`, then
writes `mfg_battery_genealogy` rows:

- `artifacts/api-server/src/routes/manufacturing/stages.ts:123-180`.
- Cell genealogy stores the cell UUID, cell code, and cell-lot number in
  lineage notes.
- `mfg_battery_genealogy` and `product_genealogy` have component fields, but
  neither defines a lot-family parent/child relationship:
  `lib/db/src/schema/manufacturing.ts:155-184` and
  `lib/db/src/schema/products.ts:117-146`.

Material traceability is currently GRN/MIN based:

- `artifacts/api-server/src/routes/products/traceability.ts:131-201` reads
  material issue notes, issue lines, GRN number, supplier lot, and
  traceability-required attributes.
- It does not join `inventory_lots`, `cell_lots`, `cells`, or
  `material_transfers`.

## 5. Existing `TraceabilityPage` and backend query surface

The frontend route is registered at `/traceability`:

- `artifacts/ocs-one/src/App.tsx:112`.

The page is a serialized-Product search/list:

- `artifacts/ocs-one/src/features/products/pages/TraceabilityPage.tsx:74-96`
  calls generated `useListProducts` with page, page size, and debounced search.
- `artifacts/ocs-one/src/features/products/pages/TraceabilityPage.tsx:19-70`
  links each row to `/products/:id`.
- The UI describes the search as serial or production-order lookup, but the
  actual list query is the Product list query.

The Product detail 360° view calls `useGetProductTraceability(productId)`:

- `artifacts/ocs-one/src/features/products/components/ProductTraceabilityView.tsx:67-69`.
- `artifacts/api-server/src/routes/products/index.ts:308-320` exposes the
  read-only `GET /products/:id/traceability` endpoint.

The current backend traceability aggregation reads:

- Product row and append-only Product events:
  `artifacts/api-server/src/routes/products/traceability.ts:60-89`.
- Manufacturing order, material issues, BOM references, QC approval, test
  results, and order timeline:
  `:111-279`.
- Imported-product GRN/OEM provenance:
  `:280-320`.
- Packing events, dispatch documents/items, customer registration, and
  warranty:
  `:322-421`.
- A merged chronological timeline:
  `:423-439`.

It does **not** directly query:

- `inventory_lots`
- `cell_lots`
- `cells`
- `material_transfers`
- `cell_lot_events`
- `mfg_battery_genealogy` as a separate read projection (the component
  projection is copied to `product_genealogy` during Product creation)

## Phase 8 readiness findings

1. The current production-output identity is clear: completed manufacturing
   order → one serialized Product, linked by
   `products.source_production_order_id`.
2. Completion is protected by one shared transactional gate used by both QC
   approval and terminal packing approval.
3. The current serial namespace is split by identity purpose. Product serial,
   production-order battery serial, charger serial, and cell ID are durable
   identities; scan, scrap, dispatch, and component serials are local fields
   or snapshots.
4. There is no `inventory_lots` lot-family model. Cell-lot provenance is
   transfer-based and cell genealogy currently reaches the lot through
   `mfg_battery_genealogy.notes`, not a parent/child lot edge.
5. The existing TraceabilityPage is a Product search and the existing
   traceability endpoint covers Product/order/material/QC/fulfillment/customer/
   warranty history, but not direct cell-lot or transfer traversal.
6. Any Phase 8 genealogy design must use the existing Product/order,
   `mfg_battery_genealogy`/`product_genealogy`, GRN/MIN, and transfer links as
   they exist. It must not infer an `inventory_lots` parent-child model or
   invent serial-unit records from current fields.

## Read-only verification result

**Batch 73-A survey: PASS — findings recorded; no application or database
changes made.**
