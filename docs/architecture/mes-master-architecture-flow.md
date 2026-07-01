# OCS One MES — Master Architecture Flow

**Status:** Reference blueprint (planning only — no code in this document). Companion to
the *MES Phase 1 — BOM & Material Consumption* design. This is the single stage-by-stage
map the manufacturing build follows: for every stage it names the exact table, API,
ledger effect, and status transition, flags every point where inventory changes, and
labels FROZEN vs ADDITIVE so no frozen module is touched.

It traces **one material** and **one battery** end-to-end:
**Purchase Order → GRN → Incoming Inspection → Inventory → Material Reservation →
Material Issue → Production → QC → Packing → Dispatch → Dealer.**

> Verified against the live schema (`lib/db/src/schema/`) and routes
> (`artifacts/api-server/src/routes/`): all frozen table names, enum values, and status
> transitions below match the code as built.

## Legend

- 🧊 **FROZEN** — exists today, must NOT be modified, renamed, or removed.
- 🟢 **ADDITIVE** — new MES work (new tables and/or additive enum values only).
- 💰 **INVENTORY CHANGE** — a signed row on the single `inventory_transactions` ledger
  (a balance/`stock_state` change).
- Ledger balance per state = `SUM(quantity) WHERE stock_state = …` on the single
  `inventory_transactions` table. **There is never a second inventory table.**

### Frozen enum values as built (do not repurpose)

- `inventory_transaction_type` 🧊 = `GRN_RECEIPT`, `INSPECTION_RELEASE`,
  `INSPECTION_ACCEPT`, `INSPECTION_REJECT`, `MATERIAL_TRANSFER_TO_CELL_PROCESSING`.
- `inventory_stock_state` 🧊 = `inspection_pending`, `available`, `rejected`.
- `product_status` 🧊 = `manufacturing`, `qc_passed`, `ready_for_packing`, `packed`,
  `dispatched`, `delivered_to_dealer`.
- `mfg_order_status` 🧊 = `draft`, `released`, `in_progress`, `completed`, `cancelled`.

Every 🟢 stock-state / transaction-type named below (`reserved`, `picked`, `issued`,
`consumed`, `scrapped`; `RESERVE`, `PICK`, `ISSUE_TO_PRODUCTION`, `CONSUME`,
`RETURN_FROM_PRODUCTION`, `SCRAP`) is an **additive enum value** on those two frozen
enums — added, never renamed — with **no new inventory table**.

---

## Stage 0 — Purchase Order (upstream) 🟢 *(GAP — not yet a module)*

- **Current reality:** OCS One has **no Purchase Order module**. The procurement chain
  today starts at Supplier → Material → **GRN**. A PO would be a future additive module
  (`purchase_orders` header + lines referencing `master_suppliers` + `master_materials`)
  feeding the GRN (`grn_headers.po_id`).
- **Decision (see "Purchase Order gap decision" below):** PO is an **optional later
  addition**; MES Phase 1 does **not** require it. The entry point for this blueprint is
  the GRN.
- **Tables:** *(future)* `purchase_orders`, `purchase_order_lines`. **APIs:** *(future).*
- **Inventory change:** none (a PO is a commitment, not stock).

## Stage 1 — GRN (Goods Receipt) 🧊

- **Tables:** `grn_headers` (status `draft → posted`), `grn_line_items`
  (per-line `inspection_status`).
- **APIs:** `POST /inventory/grns` (create draft), `POST /inventory/grns/:id/post` (post),
  `GET /inventory/grns`, `GET /inventory/grns/:id`, `DELETE /inventory/grns/:id` (draft only).
- **Status transitions:** header `draft → posted`; line `inspection_status` initialized
  from the material's Material Workflow (`INCOMING_INSPECTION` → `pending` /
  `DIRECT_TO_INVENTORY` → NULL). Workflow assignment is **mandatory** — a line whose
  material category has no assigned workflow makes `POST …/post` return 422 and write
  nothing.
- 💰 **INVENTORY CHANGE (on post):** one `GRN_RECEIPT` per line —
  `INCOMING_INSPECTION` → **+inspection_pending**; `DIRECT_TO_INVENTORY` → **+available**.

## Stage 2 — Incoming Inspection 🧊

- **Tables:** `incoming_inspections` (one per GRN — `grn_id` UNIQUE), plus per-line
  inspection detail (accepted + rejected == received).
- **APIs:** `GET /inventory/inspections`, `GET /inventory/inspections/eligible`,
  `POST /inventory/inspections` (create + finalize), `GET /inventory/inspections/:id`.
- **Status transitions:** each GRN line `inspection_status` → `passed` / `rejected` /
  `partial`. Inspection is once-only per GRN (UNIQUE `grn_id`; already-inspected → 409).
  Inspection **never** mutates GRN receipt data (quantity/material/supplier/uom stay
  immutable — only the line's `inspection_status` badge changes).
- 💰 **INVENTORY CHANGE (on finalize, up to 3 rows/line):** `INSPECTION_RELEASE`
  **−inspection_pending**, `INSPECTION_ACCEPT` **+available**, `INSPECTION_REJECT`
  **+rejected** (zero-qty rows skipped). Net effect: held stock moves
  `inspection_pending → available` (plus any `rejected`).

## Stage 3 — Inventory (Available) 🧊

- **Table:** `inventory_transactions` (append-only signed ledger — the single source).
  **Balance:** `GET /inventory/stock` = `SUM(quantity) GROUP BY material, stock_state`.
- **Status:** stock now sits in `available` (usable). There is no balances table —
  inventory is a *projection*, not a stored figure.
- 💰 This is the **Available pool** every downstream reservation/issue draws from.

> **Existing frozen draw from Available:** `MATERIAL_TRANSFER_TO_CELL_PROCESSING`
> (`POST /inventory/transfers`) already moves cell-category stock **−available** into
> Cell Processing (mints a Cell Lot + individual cell records). This is the one frozen
> production-facing consumer of `available` today; the MES reserve/issue/consume chain
> below is the generalized additive path for all other materials.

## Stage 4 — BOM (prerequisite master) 🟢 *(MES Phase 1 — built)*

- **Tables:** `bom_headers` (owned by a **Model** `master_products`; revision; status
  `draft → approved → obsolete`; effective dates; is_active), `bom_lines` (material_id,
  component_role, quantity_per, uom, scrap%, yield%, optional/alternate).
- **APIs:** `GET/POST /boms`, `GET /boms/:id`, `PUT /boms/:id`, `DELETE /boms/:id`,
  `POST /boms/:id/approve`, `POST /boms/:id/obsolete`.
- **Status transitions:** `draft → approved` (activates; obsoletes prior active revision)
  `→ obsolete`. Never overwritten; every revision persists.
- **Inventory change:** none (a BOM is a template).

## Stage 5 — Production Order + Requirement Snapshot 🟢 *(extends non-frozen manufacturing)*

- **Tables:** `mfg_production_orders` (**+ `bom_id`, + `order_quantity`**), new
  `mfg_production_order_materials` (immutable requirement snapshot at release:
  required_qty incl. scrap/yield, uom, role).
- **APIs:** existing order create/release; new `POST /manufacturing/orders/:id/release`
  computes + snapshots requirements.
- **Status transitions:** order `draft → released → in_progress → completed` (enum also
  carries `cancelled`); stages seeded (`mfg_order_stages`).
- **Inventory change:** none yet (planning). The order permanently references its BOM
  revision (`bom_id`) — old orders keep their revision.

## Stage 6 — Material Reservation 🟢

- **Tables:** `mfg_material_reservations` (+ lines); status
  `open → partially_issued → fulfilled → released`.
- **APIs:** `POST /manufacturing/orders/:id/reserve`, `GET …/reservations`, shortage/ATP read.
- **Rules:** ATP = `SUM(available)`; `SELECT … FOR UPDATE` lock; reject if
  `reserved_qty > ATP` (422 naming shortages); atomic. No double reservation, no negative.
- 💰 **INVENTORY CHANGE:** `RESERVE` → **−available, +reserved** (additive
  `stock_state=reserved`, `transaction_type=RESERVE`).

## Stage 7 — Material Issue 🟢

- **Tables:** `mfg_material_issues` (+ lines); `issue_type` = BOM / MANUAL / EXTRA.
- **APIs:** `POST /manufacturing/orders/:id/issue`, `GET …/issues`.
- **Rules:** issue ≤ reserved (BOM path) or from available (manual); a partial issue keeps
  the reservation open; extra/short is flagged for variance.
- 💰 **INVENTORY CHANGE:** `ISSUE_TO_PRODUCTION` → **−reserved, +issued** (BOM path) or
  **−available, +issued** (manual). Additive `stock_state=issued`.

> **Pick (refinement, additive):** a **Pick** state sits between Reserve and Issue for the
> full chain **available → reserved → picked → issued → consumed**. `PICK` = **−reserved,
> +picked**; Issue then becomes **−picked, +issued**. Additive enum values only — no
> architecture change.

## Stage 8 — Production / Consume + Genealogy 🟢 *(stages 🧊 exist)*

- **Stages (existing 🧊):** `cell_allocation → assembly → compression → bms_allocation →
  bms_programming → charging → testing`. Operator + **Shift** captured on
  `mfg_order_stages` (shift added to stage_data / issue metadata).
- **Tables:** on CONSUME, auto-write `mfg_battery_genealogy` (component_type, id, name,
  **serial or supplier batch/lot**, qty); timeline `mfg_battery_timeline`. Lineage is
  copied to `product_genealogy` when the Product is minted at QC pass (Stage 9).
- **APIs:** `POST …/consume`, existing stage start/pause/resume/complete/approve,
  `GET …/genealogy`.
- **Status transitions:** stage `pending → in_progress → paused → completed → approved`.
- 💰 **INVENTORY CHANGE:** `CONSUME` → **−issued, +consumed** (terminal — material now
  embodied in the battery). Additive `stock_state=consumed`.
- **Genealogy captured here:** cell serials, BMS serial, cable/busbar/connector/cabinet/
  charger batch, operator, shift. *(Refinement, additive: also machine, station, tool,
  firmware, charger/test fixture.)*

## Stage 9 — QC 🧊 *(Product minted)*

- **Tables:** `mfg_test_results`, `mfg_qc_approvals`, `mfg_rework_tickets`; on **QC PASS**
  the frozen **Product Platform** mints `products` (official serial) + finalizes
  `product_genealogy` + `product_events`.
- **APIs:** existing testing/QC routes; product creation at the QC-pass gate
  (`createProductFromOrder`, idempotent on `source_production_order_id`) — unchanged.
- **Status transitions:** stage `quality_control` approved; order `completed`;
  `product_status = qc_passed`.
- **Inventory change:** none (consumption already recorded at Stage 8). Genealogy now
  includes the **QC** actor.

## Stage 10 — Packing 🧊

- **Tables:** `products` (status), `product_events`.
- **APIs:** `POST /packing` (eligible queue = `GET /products?product_status=ready_for_packing`).
- **Status transitions:** product `ready_for_packing → packed`; immutable `product.packed`
  event.
- 💰 **INVENTORY CHANGE:** none on the material ledger. *(If packaging materials are BOM
  lines, they are consumed at Stage 8 like any other component.)*

## Stage 11 — Dispatch 🧊

- **Tables:** `dispatches` (+ `dispatch_items` serial snapshot, `dispatch_reversals`);
  number `DIS-YYYYMMDD-NNNNNN`.
- **APIs:** `POST /dispatch`, `POST /dispatch/:id/reverse`, `GET /dispatch`,
  `GET /dispatch/:id`.
- **Status transitions:** product `packed → dispatched` (+ `dealer_id`, invoice);
  reversal → back to `packed`.
- **Inventory change:** none on the material ledger (finished-goods movement, not
  component stock). Genealogy/timeline now includes **Dispatch**.

## Stage 12 — Dealer 🧊

- **Tables/APIs:** `GET /dealers/:id/inventory`, `GET /dealers/:id/dispatch-history`
  (read-only projections over `products.dealer_id` + `product.dispatched` events).
- **Status transitions:** product `dispatched → delivered_to_dealer`.
- **Inventory change:** none on the material ledger. Genealogy now includes **Dealer** —
  completing the end-to-end trace.

---

## Inventory-change summary (every 💰 point on the ONE ledger)

| Stage | Transaction type | Stock-state effect | Frozen/Additive |
|---|---|---|---|
| GRN post | `GRN_RECEIPT` | +inspection_pending **or** +available | 🧊 |
| Inspection | `INSPECTION_RELEASE` / `_ACCEPT` / `_REJECT` | −inspection_pending / +available / +rejected | 🧊 |
| Cell transfer | `MATERIAL_TRANSFER_TO_CELL_PROCESSING` | −available | 🧊 |
| Reserve | `RESERVE` | −available / +reserved | 🟢 additive |
| Pick | `PICK` | −reserved / +picked | 🟢 additive |
| Issue | `ISSUE_TO_PRODUCTION` | −reserved (or −picked / −available) / +issued | 🟢 additive |
| Consume | `CONSUME` | −issued / +consumed | 🟢 additive |
| Return | `RETURN_FROM_PRODUCTION` | −reserved / −issued / +available | 🟢 additive |
| Scrap | `SCRAP` (COMPONENT / PRODUCTION / QC) | −issued / −available / +scrapped | 🟢 additive |

All 🟢 rows are additive **enum values** on the frozen `inventory_transaction_type` +
`inventory_stock_state`; **no new inventory table**.

## Status-transition summary

- **GRN:** `draft → posted`. **Inspection line:** `pending → passed / rejected / partial`.
- **BOM:** `draft → approved → obsolete`.
- **Order:** `draft → released → in_progress → completed` (+ `cancelled`).
- **Stage:** `pending → in_progress → paused → completed → approved / rejected`.
- **Reservation:** `open → partially_issued → fulfilled → released`.
- **Product:** *(minted)* `qc_passed → ready_for_packing → packed → dispatched →
  delivered_to_dealer`.

## Frozen-compliance note

Stages 0–3 and 9–12 are FROZEN and consumed unmodified. New MES work (Stages 4–8) is
**additive tables + additive inventory enum values only**. No frozen module is modified,
renamed, or removed. This honors the Inventory Ledger, GRN, Inspection, Masters, Product
Platform, Dispatch, and Dealer freezes, and the SS-01/02/03/04 security standards (every
new endpoint declares auth/role/audit/rate-limit/validation/output and joins the
authz-matrix + `docs/security-matrix.md`).

## Purchase Order gap decision

**Recommendation (standing, pending CTO ratification):** treat the Purchase Order as an
**optional future additive module** and keep it **out of scope for MES Phase 1**. The
blueprint's entry point is the **GRN**. Rationale: no current factory operation is blocked
by the absence of a PO (a PO is a commitment, not stock, and creates no inventory change),
which is consistent with the commercial-readiness directive to build only what blocks a
real factory operation or external party. If added later, a PO is strictly additive
(`purchase_orders` + `purchase_order_lines` feeding `grn_headers.po_id`) and changes none
of the stages above.

## Adoption & next steps

1. **Adopt this blueprint as the MES reference** — the master architecture document the
   manufacturing build follows.
2. **Confirm the Purchase Order gap decision** — ratify PO as a future optional module
   (recommendation above); MES Phase 1 does not require it.
3. **Build MES Phase 1 against this flow** — implement per the companion *MES Phase 1 —
   BOM & Material Consumption* phased plan, honoring every frozen boundary and
   inventory-change point above.
