# Inventory Platform — Implementation Plan (LEAN)

> **Status:** PLAN ONLY (not yet implemented). Authorized by CTO 2026-06-28 as the next major business
> capability required before deployment. Built on the **frozen** baseline (CW-01 Cell Receiving, CW-02
> Cell Grading + ECF v1.0, CW-03 Manufacturing Orders + Unified Product Platform v1.0). Consumes the
> frozen platforms (ODS / ECF / Security SS-01…SS-04 / Certification / Unified Product Platform)
> **unmodified** — no new architecture work.

## 1. Objective

Make OCS One **factory-operational** for inventory: track everything that comes **in** (raw materials,
components, packaging), gate it through **incoming inspection**, hold it as **stock by location**, issue
it into **manufacturing**, and track everything that goes **out** (finished Products) — with an
**immutable stock-movement ledger** as the single source of truth for every quantity change.

Priority is business + data-integrity correctness (audit, traceability, no silent overwrites). No
cosmetic work.

## 2. Scope — the 8 modules (CTO-listed) and how they fit

| # | Module | Role | Backed by |
|---|--------|------|-----------|
| 1 | **Material Master** | Defines *what* can be stocked (code, name, type, unit of measure, reorder level). | new `inventory_materials` |
| 2 | **Goods Receipt (GRN)** | Records inbound deliveries against a supplier (header + line items). | new `inventory_grn`, `inventory_grn_items` |
| 3 | **Incoming Inspection** | **Mandatory gate** — accept/reject received quantities before they can enter stock. | new `inventory_incoming_inspection` |
| 4 | **Material Inventory** | Current on-hand per material (and batch), derived from the ledger. | `inventory_material_stock` (snapshot) |
| 5 | **Warehouse Stock** | Same stock, **partitioned by location/warehouse**; reservations for orders. | `inventory_warehouses` + stock location keys |
| 6 | **Stock Movements** | **Append-only immutable ledger** — every receipt/issue/transfer/adjustment/rejection. | new `inventory_stock_movements` |
| 7 | **Rejected Inventory** | Quarantine for failed-inspection material + rejected/scrapped Products, with disposition. | new `inventory_rejected` |
| 8 | **Product Inventory** | Finished-goods stock = **projection over the frozen `products` table** (no new serial store). | existing `products` (+ movements keyed by `product_id`) |

**Permanent rule reused:** *No Product before QC PASS.* Product Inventory never mints serials; it only
reflects Products already created by the Unified Product Platform at the QC-pass gate.

## 3. Data model (new `lib/db/src/schema/inventory.ts`)

Additive only — no existing certified table is renamed or altered. Export from `schema/index.ts`; push
with `pnpm --filter @workspace/db run push`.

- **`inventory_warehouses`** — `id`, `code` (unique), `name`, `type` (enum: `RAW`/`FINISHED_GOODS`/`QUARANTINE`/`GENERAL`), `is_active`.
- **`inventory_materials`** (Material Master) — `id`, `material_code` (unique), `name`, `material_type` (enum: `RAW`/`COMPONENT`/`CONSUMABLE`/`PACKAGING`), `uom` (enum: `PCS`/`KG`/`M`/`L`/`SET`/`ROLL`), `reorder_level` (numeric ≥ 0, SS-01 bounded), `manufacturer_id` (→ `master_manufacturers`, nullable), `spec` (jsonb), `is_active`.
- **`inventory_grn`** (GRN header) — `id`, `grn_no` (unique, Postgres-sequence generated like mfg ids), `supplier_name`, `supplier_ref`, `received_at`, `received_by`, `status` (enum: `draft`/`received`/`inspected`/`posted`/`cancelled`), `notes`.
- **`inventory_grn_items`** — `id`, `grn_id`, `material_id`, `batch_no`, `qty_received` (numeric > 0), `uom`, `unit_cost` (numeric ≥ 0, nullable).
- **`inventory_incoming_inspection`** — `id`, `grn_item_id` (unique), `inspected_by`, `inspected_at`, `result` (enum: `pass`/`fail`/`partial`), `accepted_qty` (≥ 0), `rejected_qty` (≥ 0), `reason` (mandatory when any rejection). Constraint: `accepted_qty + rejected_qty = grn_item.qty_received`.
- **`inventory_material_stock`** (Material Inventory / Warehouse Stock snapshot) — `id`, `material_id`, `warehouse_id`, `batch_no`, `qty_on_hand` (≥ 0), `qty_reserved` (≥ 0). Unique on (`material_id`, `warehouse_id`, `batch_no`). **Derived/maintained from the ledger; never edited directly by users.**
- **`inventory_stock_movements`** (immutable ledger) — `id`, `movement_no` (unique sequence), `movement_type` (enum: `RECEIPT`/`ISSUE`/`TRANSFER`/`ADJUSTMENT`/`REJECTION`/`CONSUMPTION`), `item_kind` (enum: `MATERIAL`/`PRODUCT`), `material_id` (nullable), `product_id` (nullable, → `products`), `batch_no`, `from_warehouse_id` (nullable), `to_warehouse_id` (nullable), `qty` (signed/typed by movement), `ref_type`, `ref_id`, `dedupe_key` (unique), `performed_by`, `created_at`. **Append-only — no app route ever `.update()`/`.delete()`s it (joins SS-03 immutability suite).**
  - **Idempotency (mandatory):** a **UNIQUE `dedupe_key`** (e.g. `${movement_type}:${ref_type}:${ref_id}:${item_kind}:${batch_no}`) makes every posting **once-only** — a retry, double-submit, or QC re-approval can never double-post a RECEIPT/ISSUE even though Product creation is itself idempotent. The posting engine upserts on `dedupe_key` (insert-or-no-op) inside the same transaction as the snapshot update.
  - **Cardinality (DB CHECK):** exactly one target per row — `item_kind='MATERIAL'` ⇒ `material_id` NOT NULL AND `product_id` NULL; `item_kind='PRODUCT'` ⇒ `product_id` NOT NULL AND `material_id` NULL. Invalid ledger rows are impossible, so reconciliation + immutability audit stay sound.
- **`inventory_rejected`** (Rejected Inventory) — `id`, `source` (enum: `INCOMING_INSPECTION`/`PRODUCT_QC`/`ADJUSTMENT`), `material_id`/`product_id` (one of), `batch_no`, `qty`, `reason`, `disposition` (enum: `pending`/`return_to_supplier`/`scrap`/`rework`), `recorded_by`, `recorded_at`.

**Correction policy (data-integrity):** posted quantities are **never silently overwritten**. A
correction is a new **`ADJUSTMENT`** movement (append-only) with an actor + reason — same principle as
the certified Cell-Grading correction model. ECF integration for inventory corrections is a **future**
enhancement (platform frozen); the adjustment-movement pattern covers correctness now.

## 4. Flows (the operating loop)

1. **Receive:** create GRN (header) + items → status `received`. No stock yet.
2. **Inspect (mandatory gate):** Incoming Inspection per item → `accepted_qty` posts a **RECEIPT**
   movement into a RAW/GENERAL warehouse (updates `inventory_material_stock`); `rejected_qty` posts a
   **REJECTION** movement into QUARANTINE + an `inventory_rejected` row. GRN → `inspected`/`posted`.
   **Nothing enters sellable/usable stock without passing inspection.**
   **Control invariant (no bypass):** a `RECEIPT` of `item_kind='MATERIAL'` may be posted **only** by the
   inspection-posting path (`ref_type='incoming_inspection'`, referencing a passed/partial inspection
   row) — there is **no ad-hoc material-receipt endpoint**, and the movement engine rejects a MATERIAL
   RECEIPT whose `ref_type` is anything else. Stock corrections use **`ADJUSTMENT`** movements
   (supervisor/director + mandatory reason), never a raw RECEIPT. This makes the inspection gate
   structurally unbypassable, not merely procedural.
3. **Consume:** when a manufacturing order allocates materials, post **ISSUE/CONSUMPTION** movements
   (decrement stock, link `ref_type=production_order`). (Wiring into the *existing frozen* manufacturing
   allocation is integration-only — read its allocations; do not modify certified manufacturing code.)
4. **Finished goods:** at QC-pass the Product Platform mints the Product (unchanged). Inventory posts a
   **RECEIPT** movement keyed by `product_id` into the FINISHED_GOODS warehouse → **Product Inventory**.
5. **Dispatch out:** when a Product is dispatched, post an **ISSUE** movement (`ref_type=dispatch`).
   Product Inventory availability follows `products.product_status` + finished-goods stock.
6. **Ledger:** every step above writes exactly one (or a paired) `inventory_stock_movements` row —
   current stock is always reconcilable to the ledger.

## 5. API + Security (per frozen Security Standards)

- OpenAPI-first: add an `inventory` tag + paths to `lib/api-spec/openapi.yaml`, then
  `pnpm --filter @workspace/api-spec run codegen` (hooks + Zod). No hand-written contracts.
- Routes under `artifacts/api-server/src/routes/inventory/`, registered in `app.ts`; reuse
  `createMasterRouter` for the simple masters (warehouses, materials).
- **SS-01** matrix entry for **every** endpoint before merge (`docs/security-matrix.md`): auth required? /
  min role / audit required? / rate limited? / input validation? / output sanitised?
- **RBAC** (writes via `requireWriteRole`, reads open to any authed user → viewer read-only):
  - Receipt / inspection / movements: **operator+** (operator/supervisor/director).
  - Stock adjustments, rejected-disposition, warehouse/material master writes: **supervisor/director**.
  - Director included in every write list.
- **Audit (SS-03):** material receipt, inspection pass/fail, stock issue/adjustment, rejection, and
  product finished-goods receipt emit `security_events` and/or are inherently captured by the append-only
  movement ledger. The ledger + rejected table join the SS-03 immutability suite (static + runtime).
- **Validation (SS-01):** all numeric quantities bounded (no bare `number`); all-optional PATCH bodies
  rejected when empty (the documented gotcha); enum cross-checks against schema.
- **Config (SS-04):** add new RBAC entries to `lib/authz-matrix.ts` so SS-02 covers every new endpoint;
  add any new feature flags/thresholds to `config-integrity.ts`.

## 6. Frontend (ODS only)

- Feature folder `artifacts/ocs-one/src/features/inventory/` (`components/`, `hooks/`, `pages/`,
  `types/`); routes in `config/routes.ts`. All UI uses **frozen ODS v1.0** components — no one-off styling.
- Pages: Material Master, Warehouses, Goods Receipt (create + inspect), Material Inventory / Warehouse
  Stock, Stock Movements ledger (read-only timeline), Rejected Inventory, Product Inventory.

## 7. Build phases — simplified cadence (Implement → Test → Report blockers → Fix critical → Freeze)

Per CTO: run the simple cadence per phase; priority = correctness, not ceremony.

- **Phase A — Foundations:** schema (`inventory.ts`) + sequences + Warehouses & Material masters + the
  Stock-Movement ledger engine (the function every other phase calls to post a movement + update snapshot
  atomically in a transaction). Test ledger atomicity. Freeze.
- **Phase B — Inbound:** GRN (header/items) → Incoming Inspection gate → RECEIPT/REJECTION posting →
  Material Inventory + Rejected Inventory. Test the gate (no stock without inspection). Freeze.
- **Phase C — Consumption:** integrate material ISSUE/CONSUMPTION with the existing frozen manufacturing
  allocation (read-only integration). Test stock decrements + reconciliation. Freeze.
- **Phase D — Finished goods:** Product Inventory projection over `products` + finished-goods RECEIPT at
  QC-pass and ISSUE at dispatch. Test idempotency (one product = one finished-goods receipt). Freeze.
- **Phase E — Visibility:** Warehouse Stock views, Stock Movements ledger UI, low-stock/reorder
  indicators, director inventory KPIs. Test + Freeze.

Each phase ends with: typecheck + lint clean, SS-02/SS-03/SS-04 green, blockers reported, **only**
critical/high fixed, then frozen.

## 8. Integration points (consume, do not modify, frozen modules)

- **Unified Product Platform** — read `products` (status, serial, `manufacturing_completed_at`) for
  Product Inventory; never mint serials here.
- **Manufacturing Orders** — read material allocations to drive consumption movements.
- **Dispatch & Logistics** — finished-goods ISSUE on dispatch.
- **Masters** — `master_manufacturers` for material origin.

## 9. Out of scope (backlog, not now)

- ECF integration for inventory corrections (adjustment-movement pattern used instead) → future.
- Costing/valuation (FIFO/weighted-average), supplier master/PO module, barcode scanning, multi-UOM
  conversion, e-Way Bill → post-deployment enhancement backlog.

---

*Plan authored 2026-06-28 · LEAN per CTO direction · consumes frozen platforms unmodified · no new architecture · implementation begins on CTO go-ahead.*
