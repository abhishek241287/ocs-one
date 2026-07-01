# OCS One — Factory Readiness Report v1.0

**Mode:** Factory Readiness validation (no architecture, no new features). **No code / DB /
API changes made.** This report compares the **actual current implementation** (verified in
code, not docs) against the real factory process for the three commercial products. Awaiting
CTO approval before any fix.

> **Verification note / doc drift:** `replit.md` in places calls the Product Platform "NOT yet
> implemented." **That is stale.** The Product Platform (products, genealogy, events, serial
> minting at QC pass, lifecycle) **and** the BOM Master (full CRUD + approve/obsolete + UI) are
> **implemented and working** in code. The real gaps are material-consumption posting, imported-
> product creation, and the entire post-sale chain (customer/warranty/service).

---

## Readiness scores

| Scope | Readiness | One-line reason |
|---|---:|---|
| **Overall (weighted by steps)** | **~57%** | manufactured build→dispatch works; imported intake + post-sale do not |
| **OCS Lithium Battery** (manufactured) | **~75%** | full build→dispatch→dealer works; gaps = material consumption posting + post-sale |
| **OCS Lithium Inverter** (imported, OCS serial) | **~41%** | receiving works; **cannot be turned into a serialized finished good** |
| **Hybrid Inverter** (imported, OEM serial) | **~41%** | receiving works; **cannot capture OEM serial → no finished good** |

Scoring: ✅ COMPLETE = 1.0, 🟡 PARTIAL = 0.5, ❌ NOT IMPLEMENTED = 0, averaged over each
product's listed steps.

---

## Product 1 — OCS Lithium Battery (Manufactured)

| # | Step | Status | Evidence / gap |
|---|---|:--:|---|
| 1 | Supplier | ✅ | `master_suppliers` + CRUD |
| 2 | GRN | ✅ | `grn_headers/lines`, create+post, immutable |
| 3 | Incoming Inspection | ✅ | line-by-line accept/reject, signed ledger moves |
| 4 | Inventory | ✅ | `inventory_transactions` signed ledger, stock projection |
| 5 | BOM | ✅ | `boms` CRUD + approve/obsolete + revisioning + UI |
| 6 | **Material Reservation** | ❌ | no `RESERVE` txn type / `reserved` state / route |
| 7 | **Material Issue** | 🟡 | cells move via `material_transfers` (store→cell processing); **no generic BOM issue** for BMS/busbar/cable/connector/cabinet |
| 8 | **Material Consumption** | 🟡 | component **genealogy is captured** at stages → `product_genealogy`; **but no inventory consumption posting** (stock is not decremented by BOM consumption) |
| 9 | Production Order | ✅ | `POST /manufacturing/orders` + stage engine |
| 10 | Assembly | ✅ | `assembly` stage (start/pause/resume/complete/approve) |
| 11 | Testing | ✅ | `testing` stage + `test-results` capture |
| 12 | QC | ✅ | `qc-approval` (approve/reject) |
| 13 | Generate OCS Battery Serial | ✅ | minted at QC pass via `mfg_battery_seq` |
| 14 | Finished Goods | ✅ | product `qc_passed` + product-inventory summary |
| 15 | Packing | ✅ | `POST /packing` (`ready_for_packing`→`packed`) |
| 16 | Dispatch | ✅ | `POST /dispatch` + dispatch note + reversal |
| 17 | Dealer | ✅ | dealer master + dealer inventory + dispatch history |
| 18 | **Customer Registration** | ❌ | no customer master / ownership record (only a `customer_name` text field on legacy logistics) |
| 19 | **Warranty** | ❌ | only `warranty_period_months` config on the Model; no per-serial warranty record/activation/claim |
| 20 | **Service** | ❌ | frontend stub types only; no tables/routes (`mfg_rework_tickets` is internal rework, not field service) |

**Battery verdict:** the physical lifecycle — build, track, serialize, QC, pack, dispatch to
dealer — **works end to end today.** The gaps are (a) material-consumption *inventory accuracy*
and (b) the *post-sale* chain.

---

## Product 2 — OCS Lithium Inverter (Imported, OCS serial)

| # | Step | Status | Evidence / gap |
|---|---|:--:|---|
| 1 | Supplier | ✅ | supplier master |
| 2 | GRN | ✅ | receiving works |
| 3 | Incoming Inspection | ✅ | accept/reject works |
| 4 | **Generate OCS Serial Number** | ❌ | **core blocker** — no path mints a Product from an inspected imported item; `INCOMING_INSPECTION_PASS` handler is a guarded skip (`trigger_not_implemented`); `classifyOrderProduct` is a stub that always returns OCS/BATTERY; no inverter serial sequence/format |
| 5 | Finished Goods Inventory | ❌ | unreachable — depends on step 4 |
| 6 | Packing | 🟡 | generic `POST /packing` exists but **no imported product can reach it** |
| 7 | Dispatch | 🟡 | dispatch engine exists but unreachable for imported units |
| 8 | Dealer | 🟡 | dealer portal exists but no imported units to show |
| 9 | Customer Registration | ❌ | not implemented (shared) |
| 10 | Warranty | ❌ | not implemented (shared) |
| 11 | Service | ❌ | not implemented (shared) |

**Lithium Inverter verdict:** you can receive and inspect it, but **it can never become a
serialized finished good**, so nothing downstream is reachable. *(Note: the `INBUILT_LITHIUM`
workflow is seeded with a `QC_PASS` trigger, which does not match an imported no-production
product — the correct path is an inspection-pass mint that does not yet exist.)*

---

## Product 3 — Hybrid Inverter (Imported, OEM serial)

| # | Step | Status | Evidence / gap |
|---|---|:--:|---|
| 1 | Supplier | ✅ | supplier master |
| 2 | GRN | ✅ | receiving works |
| 3 | Incoming Inspection | ✅ | accept/reject works |
| 4 | **Capture OEM Serial Number** | ❌ | **core blocker** — `serial_source='MANUFACTURER'` exists in schema, but **no capture logic**; `INCOMING_INSPECTION_PASS` handler is a guarded skip; `classifyOrderProduct` stub always returns OCS |
| 5 | Finished Goods Inventory | ❌ | unreachable — depends on step 4 |
| 6 | Packing | 🟡 | engine exists, unreachable |
| 7 | Dispatch | 🟡 | engine exists, unreachable |
| 8 | Dealer | 🟡 | engine exists, unreachable |
| 9 | Customer Registration | ❌ | not implemented (shared) |
| 10 | Warranty | ❌ | not implemented (shared) — Hybrid also needs OEM-warranty + OCS-dealer-support handling |
| 11 | Service | ❌ | not implemented (shared) |

**Hybrid verdict:** same as Lithium Inverter — receiving works, but **no OEM-serial capture →
no finished good → nothing downstream.**

---

## Complete gap list

| # | Gap | Module | Root cause | Business impact | Effort | Blocks factory op? |
|---|---|---|---|---|:--:|---|
| **G1** | Imported-product creation (OCS serial gen + OEM serial capture) | Product Platform / Incoming Inspection | `INCOMING_INSPECTION_PASS` handler is a guarded stub; `classifyOrderProduct` hardcoded to OCS/BATTERY; no serial sequence/format for inverters | **2 of 3 products cannot enter finished-goods stock at all** — Lithium & Hybrid inverters are dead on arrival after inspection | **M (2–4 d)** | **YES — hard block** for both inverters |
| **G2** | Material Reservation / Issue / Consumption / Return / Scrap | Inventory / MES | enums + engine absent (`RESERVE`/`ISSUE`/`CONSUME`/`reserved`/`issued`/`consumed`); only cell transfer + BOM `scrap_percent` exist | battery **inventory does not deplete** as materials are used (except cells) → stock counts drift; no shortage check before build | **L (5–8 d)** | **Commercial: yes** (stock integrity). Pilot: no (battery can still be built/shipped) |
| **G3** | Customer Registration | (new, minimal) | no customer master / product-ownership record; only a `customer_name` text field on legacy logistics | cannot record who owns a unit → warranty/service cannot be activated or looked up | **M (2–3 d)** | Post-sale: yes. Manufacturing/dispatch: no |
| **G4** | Warranty (per-serial) | (new, minimal) | only `warranty_period_months` config on Model; no warranty record/activation/status/claim per serial | cannot honor or track warranty for any sold unit (all three products) | **M (3–5 d)** | Post-sale support: yes. Build/dispatch: no |
| **G5** | Service / RMA | (new, minimal) | absent (frontend stub types only) | no after-sales service, repair, or RMA for any product | **M–L (4–6 d)** | Post-sale support: yes. Build/dispatch: no |

No new ERP/roadmap features are recommended — every gap above is a step **explicitly listed in
the three product flows**.

---

## Prioritized implementation plan (highest first)

1. **G1 — Imported-product creation** *(unblocks 2 of 3 products end-to-end)*
   Implement the `INCOMING_INSPECTION_PASS` mint: real `classifyOrderProduct` (Lithium → OCS
   serial generated at inspection; Hybrid → capture & retain OEM serial, uniqueness-checked),
   an inverter serial sequence/format, and the inspection→Product wiring + minimal UI to
   trigger it. **After this, both inverters flow receiving→inspection→finished goods→packing→
   dispatch→dealer using the already-working downstream engines.**
2. **G2 — Material reservation/issue/consumption/return/scrap** *(battery inventory integrity)*
   The MES Phase-1 engine (additive ledger types + per-order BOM snapshot + shortage check).
   Required before commercial battery volume so stock stays accurate; not required for a build-
   and-dispatch pilot.
3. **G3 — Customer Registration** *(prerequisite for warranty/service)*
   Minimal customer master + product-ownership record keyed to the official serial.
4. **G4 — Warranty (per-serial)**
   Warranty activation/status/claim per serial, term = Model `warranty_period_months` anchored
   on `manufacturing_completed_at` (available-since); Hybrid distinguishes OEM obligation vs OCS
   dealer support.
5. **G5 — Service / RMA**
   Service ticket + RMA over the serial, reusing the customer + warranty records.

**Sequencing logic:** G1 gives you the widest coverage fastest (turns two 41% products into
near-battery parity). G2 makes battery commercially clean. G3→G4→G5 are the post-sale chain and
build on each other (service needs warranty needs customer).

---

## Final recommendation

**NOT READY for commercial deployment.**

- **Battery** is close to a **factory pilot** for the *manufacture→dispatch→dealer* portion —
  that path is fully implemented today. It is **not** commercially clean until **G2** (material
  consumption/inventory accuracy) and the post-sale chain (**G3–G5**) exist.
- **Both inverters are NOT pilot-ready**: **G1** is a hard block — without imported-product
  creation they cannot even reach finished-goods stock, so the working downstream (packing/
  dispatch/dealer) is unreachable for them.
- **All three products** lack **customer registration, warranty, and service** (G3–G5), so
  after-sales support cannot operate for any product yet.

**Path to "READY FOR FACTORY PILOT" (all three products):** complete **G1** (both inverters
become end-to-end to dispatch) and stand up minimal **G3–G4** (register owner + activate
warranty). **Path to "READY FOR COMMERCIAL DEPLOYMENT":** add **G2** (battery inventory
integrity) and **G5** (service/RMA).

*No code, schema, or architecture changed. Awaiting approval before implementing any fix.*
