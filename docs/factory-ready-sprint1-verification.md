# Factory Ready Sprint 1 — Verification Report

**Scope (CTO-approved):** three commercial blockers only — **G1** Imported Product Creation, **G3** Customer Registration, **G4** common Warranty engine. No MES/MRP/Costing/Service; no production orders/BOM/inventory consumption.

**Date:** 2026-07-01
**Result:** ✅ All three gates implemented, wired end-to-end (backend + frontend), and verified.

---

## G1 — Imported Product Creation

Imported finished goods become first-class serialized Products on the FROZEN Product Platform via a **separate** creation path (`createImportedProducts`) that never touches the order-based QC-PASS engine. Serial provenance is **category-driven**; both types are created directly at `ready_for_packing`.

| Category | Serial source | Input | Official serial |
|---|---|---|---|
| Inbuilt Lithium Inverter | OCS-minted | `quantity` | `LIV-YYYYMMDD-NNNNNN` (from `product_import_seq`) |
| Hybrid Inverter | Manufacturer | `oem_serials[]` | the OEM serial (`serial_source = MANUFACTURER`) |

**API:** `POST /products/imported` (supervisor/director).
**Frontend:** `/products/imported` — model picker limited to importable categories; UI switches between a quantity input (Lithium) and per-unit OEM serial rows (Hybrid) based on the selected model's category.

**Verified (curl):**
- Lithium qty=2 → `201`, serials `LIV-20260701-000003/000004` (sequence continues correctly).
- Hybrid oem_serials=[…] → `201`, official serial = OEM serial, `serial_source=MANUFACTURER`.
- Both units created at `ready_for_packing` and flow through the existing Pack → Dispatch chain.
- Non-importable model / missing quantity / missing OEM serials / in-request duplicate OEM → `422` (validated in earlier backend pass).

---

## G3 — Customer Registration

Registers the end customer for a **dispatched** product and mints the warranty in the same transaction. Works for all three product types.

**Fields:** Customer Name, Mobile, Address, Dealer, Product Serial, Installation Date.
**API:** `POST /customers/registrations` (supervisor/director), `GET /customers/registrations`, `GET /customers/registrations/:id`.
**Frontend:** `/after-sales/registrations` — registration form + searchable registrations list; dealer picker from the dealer master.

**Verified (curl):**
- Register dispatched product → `201`, `CUST-20260701-000003`, auto-warranty `WRN-20260701-000002` (`active`, end 2028-07-01 from 24-month model period).
- Duplicate registration for the same product → `409`.
- Registering a non-dispatched product → `422` (validated in earlier backend pass).

---

## G4 — Warranty Engine

One common warranty engine. Status is **computed** from Installation Date + the model's warranty period (months): **Active** until end date, then **Expired**; may be **Voided** with a mandatory reason.

**API:** `GET /warranties` (status filter), `GET /warranties/:id`, `POST /warranties/:id/void` (supervisor/director, mandatory `reason`).
**Frontend:** `/after-sales/warranties` — status-filterable, searchable list with computed status badges (Active/Expired/Void) and a void dialog requiring a reason.

**Verified (curl):**
- List / status filter → `200`.
- Void with reason → `200`; warranty becomes `void`.
- Double-void → `409`.
- Void with empty reason → `400`.

---

## Cross-cutting

- **Security (SS-02):** 7 new endpoints added to `lib/authz-matrix.ts` and `docs/security-matrix.md`; the authz regression suite passes — **485 authorization assertions hold** (director/supervisor/operator/viewer/anonymous per endpoint).
- **Typecheck:** `pnpm --filter @workspace/ocs-one run typecheck` clean; full backend typecheck clean.
- **Navigation:** Sidebar — "Imported Products" under Inventory → Finished Goods; new **After-Sales** section with Customer Registration + Warranty. Routes registered in `App.tsx` and `config/routes.ts`.

## Out of scope (not built, per directive)

MES/MRP/Costing/Service modules; production orders, BOM, or inventory consumption for imported goods.

## Next

Awaiting CTO approval before Sprint 2.
