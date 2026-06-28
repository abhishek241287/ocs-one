# Inventory Platform — Implementation Plan v1.0 (LEAN, factory-deployment scope)

> **Status:** PLAN ONLY (not yet implemented). Scope **approved & tightened by CTO 2026-06-28**.
> Objective: make OCS One **operational for real factory use as early as possible** — simple, reliable
> workflows over feature richness. Built on the **frozen** baseline (CW-01/02/03 + Unified Product
> Platform v1.0); consumes frozen platforms (ODS / ECF / Security SS-01…SS-04 / Certification / Product
> Platform) **unmodified**. No new architecture.
>
> **Cadence (every phase):** Implement → Test → Report Blockers → Fix Critical → Freeze.

## 1. Architectural principles (CTO-mandated — apply to every phase)

- **P1 — Movement-driven, always paired.** *Every physical movement of a material or product generates
  (a) an inventory transaction (one append-only ledger row) **and** (b) an audit event — automatically and
  atomically, in the same DB transaction as the state change.* No silent stock change anywhere.
- **P2 — Ledger-first & serial-first.** **Current Stock = the balance** (a derived/maintained snapshot);
  the **Stock Movement Ledger = the authoritative history.** Balances are always recomputable and
  auditable from the ledger. Every finished unit is tracked by its **Official Product Serial** end-to-end.
- **P3 — One source, no duplication.** Product Inventory is **filtered views over the ONE frozen
  `products` table** by category — never duplicate inventory tables or business logic. **Product** movement
  history reuses the frozen append-only **`product_events`** (each lifecycle event = one product movement +
  audit); **Materials** use the new `inventory_stock_movements`. Reuse existing logistics/dealer/dispatch
  and the manufacturing packing stage rather than rebuilding them.

## 2. Scope — Inventory Platform v1.0 (5 phases, in order)

| Phase | Capability | Build type |
|-------|-----------|-----------|
| **1** | **Material Receiving** — **Material Master** → GRN → Incoming Inspection → Material Inventory | **NEW** (material side) |
| **2** | **Product Inventory** — unified view by Product Category (Battery / Inbuilt Lithium Inverter / Hybrid Inverter) | **NEW views** over frozen `products` |
| **3** | **Packing** — by Product Serial | **REUSE** mfg packing stage + close status gap |
| **4** | **Dispatch** — Dispatch No · Date · Dealer · Invoice No · Product Serials (only) | **REUSE/EXTEND** logistics dispatch |
| **5** | **Dealer** — Dealer Master · Dealer Inventory · Dealer Dispatch History | **REUSE** logistics dealers + NEW views |

**Permanent rule reused:** *No Product before QC PASS.* Product Inventory never mints serials; it reflects
Products already created by the frozen Product Platform at the QC-pass gate.

## 3. What already exists — reuse map (confirmed by codebase review)

| Need | Already exists | v1.0 action |
|------|----------------|-------------|
| Dealer Master | `logistics_dealers` (+ CRUD API + `DealerMasterPage`) | **Reuse as-is.** |
| Dispatch | `logistics_dispatch_orders` / `logistics_dispatch_items` (**dual-keyed: `production_order_id` + `product_id`**) / `logistics_shipment_events` (+ pages) | **Reuse & extend** (serial-first; add `invoice_number`; surface only the 5 allowed fields). |
| Packing | Manufacturing **packing stage** (`mfg_order_stages` type `packing`) + `PackingDashboardPage` | **Reuse**; add the product-status transition. |
| Dealer Dispatch History | `logistics_dispatch_orders` filtered by `dealer_id` | **Reuse** (new filtered view/query). |
| Product finished-goods | frozen `products` (`product_status`, `category_id`, `official_product_serial`) + append-only `product_events` | **Reuse** (filtered views). |

**Critical gap to close in v1.0:** dispatch/packing today write only the legacy `mfg_battery_timeline`
and **do NOT transition `products.product_status`** to `packed` / `dispatched` / `delivered_to_dealer`,
nor emit the matching `product_events`. Per P1+P3, v1.0 wires these transitions so each product movement
updates status + emits one `product_event` + one audit event. This is the backbone that makes Product
Inventory, Packing, Dispatch, and Dealer Inventory all consistent from one source.

## 4. New data model (Phase 1 only) — `lib/db/src/schema/inventory.ts`

Additive only; export from `schema/index.ts`; push with `pnpm --filter @workspace/db run push`. No
existing certified table renamed/altered. (Single-factory v1.0 → **no multi-warehouse**; stock is per
material + batch.)

- **`inventory_material_categories`** (Material Category master — keeps Material Master generic) — `id`,
  `category_code` (unique), `name`, `is_active`. Seeded with v1.0 categories (LiFePO₄ Cell, Empty Inbuilt
  Lithium Inverter, Hybrid Inverter, PCB, BMS, Charger, Connector, Cable, Packing Material, Accessories).
  **A reference table, NOT a pgEnum** — new material categories are added as data (no engine/code change),
  while still preventing free-text duplicates.
- **`inventory_materials`** (Material Master — **deliberately minimal, 6 fields**) — `id`,
  `material_code` (unique), `name`, `category_id` (→ `inventory_material_categories`), `uom` (enum
  `PCS`/`KG`/`M`/`L`/`SET`/`ROLL`), `manufacturer_id` (→ `master_manufacturers`, **optional**),
  `is_active`. No reorder/min-max, no spec blob in v1.0 (deferred). **Every GRN line references one
  `inventory_materials` row** — single source of material identity, no duplicate definitions.
- **`inventory_grn`** (GRN header) — `id`, `grn_no` (unique, Postgres-sequence id like mfg ids),
  `supplier_name`, `supplier_ref`, `received_at`, `received_by`, `status` (enum
  `draft`/`received`/`inspected`/`posted`/`cancelled`), `notes`.
- **`inventory_grn_items`** — `id`, `grn_id`, `material_id`, `batch_no`, `qty_received` (numeric > 0),
  `uom`, `unit_cost` (numeric ≥ 0, nullable).
- **`inventory_incoming_inspection`** — `id`, `grn_item_id` (unique), `inspected_by`, `inspected_at`,
  `result` (enum `pass`/`fail`/`partial`), `accepted_qty` (≥ 0), `rejected_qty` (≥ 0), `reason`
  (mandatory when any rejection). CHECK: `accepted_qty + rejected_qty = grn_item.qty_received`.
- **`inventory_material_stock`** (Material Inventory = the **balance**) — `id`, `material_id`, `batch_no`,
  `qty_on_hand` (≥ 0). Unique (`material_id`, `batch_no`). **Derived/maintained from the ledger; never
  edited directly.**
- **`inventory_stock_movements`** (material **ledger** = the **history**, immutable) — `id`, `movement_no`
  (unique sequence), `movement_type` (enum `RECEIPT`/`REJECTION`/`ADJUSTMENT`), `material_id`, `batch_no`,
  `qty` (typed by movement), `ref_type`, `ref_id`, `dedupe_key` (**unique**), `reason` (required for
  `ADJUSTMENT`/`REJECTION`), `performed_by`, `created_at`. **Append-only — joins the SS-03 immutability
  suite.**
  - **Idempotency (P1):** UNIQUE `dedupe_key` (e.g. `${movement_type}:${ref_type}:${ref_id}:${batch_no}`)
    → every posting is once-only; retries/re-submits never double-post. Engine upserts on `dedupe_key`
    inside the same tx as the snapshot update + audit event.
  - **No-bypass control:** a material `RECEIPT` may originate **only** from the inspection-posting path
    (`ref_type='incoming_inspection'`, referencing a passed/partial inspection). No ad-hoc receipt
    endpoint. Stock corrections are `ADJUSTMENT` movements (supervisor/director + mandatory reason),
    never a raw RECEIPT. → the inspection gate is structurally unbypassable.

> **Rejected material** is captured by the inspection row (`rejected_qty` + reason) **and** a `REJECTION`
> ledger movement — no separate rejected table (no duplication). "Rejected materials" is a filtered view
> over those.
>
> **Material consumption into manufacturing** is **out of v1.0 scope** (not among the 5 phases) — when
> added later it is simply a new `ISSUE`/`CONSUMPTION` movement type, fully covered by P1/P2.

## 5. Phase-by-phase

### Phase 1 — Material Receiving (NEW) — implement in this sub-sequence
**1. Material Master (foundation, build FIRST)** → **2. Goods Receipt (GRN)** → **3. Incoming Inspection**
→ **4. Material Inventory.** Material Master is the foundation for all material transactions; **every GRN
line must reference a Material Master record** (prevents duplicate definitions, keeps inventory consistent).
- Flow (after master exists): create GRN (each line → an `inventory_materials` row) → inspect each item →
  `accepted_qty` posts `RECEIPT` (updates balance) + audit; `rejected_qty` posts `REJECTION` + audit.
  **Nothing enters usable stock without passing inspection.**
- **Material Inventory is always derived from the ledger** (P2), never maintained independently.
- Test per sub-step: master CRUD + code uniqueness; gate enforcement; idempotent posting; balance ==
  sum(ledger); SS-01..04. Freeze Phase 1 only after all four sub-steps are green.

### Phase 2 — Product Inventory (NEW views over frozen `products`)
- One unified Product Inventory = `products` joined to `product_categories`, filtered by category for the
  three V1.0 views: **Battery / Inbuilt Lithium Inverter / Hybrid Inverter**. Availability driven by
  `product_status` (`qc_passed` → in stock; `dispatched`/`delivered_to_dealer` → left stock). No new table.
- Test: counts per category/status reconcile to `products`; serial search. Freeze.

### Phase 3 — Packing (REUSE mfg packing stage + close gap)
- Reuse the manufacturing `packing` stage. On packing completion/approval for a unit, transition that
  Product's `product_status` → `packed` (by **Official Product Serial**) and emit one `product_event`
  (`product.packed`) + one audit event (P1). No new packing table.
- Test: serial-level packed status + event/audit pairing; idempotent. Freeze.

### Phase 4 — Dispatch (REUSE/EXTEND logistics dispatch — minimal fields only)
- Reuse `logistics_dispatch_orders`/`items`. v1.0 dispatch surfaces **only**: Dispatch Number, Dispatch
  Date, Dealer, **Invoice Number** (additive column), and **Product Serials**. **Do NOT surface** LR
  Number, Vehicle Number, Transporter, Driver details (legacy columns remain in schema, unused — additive,
  backward-compatible).
- Make dispatch **serial-first** (select Products by `official_product_serial`; keep the
  `production_order_id` link for genealogy). On dispatch confirm/deliver, transition `product_status` →
  `dispatched` then `delivered_to_dealer`, each emitting a `product_event` + audit (closes the gap).
- Test: serial-based dispatch, status/event/audit pairing, dealer linkage. Freeze.

### Phase 5 — Dealer (REUSE master + NEW views)
- **Dealer Master:** reuse `logistics_dealers` as-is.
- **Dealer Inventory (NEW view):** Products currently with a dealer (status `delivered_to_dealer`),
  dealer resolved via the dispatch linkage (`dispatch_items → dispatch_order.dealer_id`) — **no new
  `dealer_id` column on `products`** (derive, don't duplicate).
- **Dealer Dispatch History (NEW view):** `logistics_dispatch_orders` filtered by `dealer_id` with their
  product serials.
- Test: dealer inventory == delivered products; history completeness. Freeze.

## 6. Security / cert (frozen Security Standards)
- OpenAPI-first: add `inventory` tag + paths to `lib/api-spec/openapi.yaml`, then
  `pnpm --filter @workspace/api-spec run codegen`. Extend logistics paths for the dispatch/invoice change.
- **SS-01** matrix row for **every** new/changed endpoint (`docs/security-matrix.md`).
- **RBAC** (`requireWriteRole`; reads open to any authed → viewer read-only): receipt/inspection/packing/
  dispatch writes = **operator+**; stock adjustments, material/dealer master writes, dispatch
  cancellation = **supervisor/director**; director in every write list. Add new endpoints to
  `lib/authz-matrix.ts` so **SS-02** covers them.
- **SS-03 audit:** material ledger + every product-status transition (packed/dispatched/delivered) emit
  audit events; `inventory_stock_movements` joins the immutability suite (static + runtime).
- **SS-04 config:** register any new RBAC/flags in `config-integrity.ts`.
- All UI uses **frozen ODS v1.0** components only.

## 7. Out of scope for v1.0 (deferred)
Warranty · Service · Installation History · Logistics Management (LR/vehicle/transport/driver) ·
multi-warehouse · material consumption-to-manufacturing · returns · costing/valuation · supplier/PO
master · barcode/scanning · multi-UOM conversion. (Each, when added later, is additive and covered by P1/P2.)

---

*Plan v1.0 authored 2026-06-28 · CTO-tightened 5-phase factory-deployment scope · ledger-first + serial-first + movement-always-audited · maximal reuse of frozen platforms & existing logistics · no new architecture · implementation begins on CTO go-ahead.*
