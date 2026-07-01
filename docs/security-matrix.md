# OCS One — Security Matrix

Master security reference for every API endpoint. This document is authoritative
for authentication and authorization decisions and must be kept in sync with the
route definitions in `artifacts/api-server/src/routes/`.

---

## Security Standard SS-01 (permanent rule)

Every new API endpoint must explicitly declare, before it is merged, the answer to
all six questions below. No endpoint may be merged until all six are answered.

1. **Authentication required?** — Is a valid session (`requireAuth`) needed?
2. **Minimum role** — Which role(s) may invoke it? (`director | supervisor | operator | viewer`)
3. **Audit required?** — Must the action be recorded to the audit/event log?
4. **Rate limited?** — Is the endpoint throttled?
5. **Input validation?** — Are all inputs validated (Zod / explicit checks)?
6. **Output sanitised?** — Is the response free of sensitive fields (no password hashes, secrets, internal-only data)?

## Security Standard SS-02 (permanent automated test)

Authorization is enforced by a **permanent regression test**, not by manual review alone.
`pnpm --filter @workspace/api-server run test:authz` (validation command `authz`) drives
every endpoint in this matrix against all five principals
(director / supervisor / operator / viewer / anonymous) and asserts the exact expected
outcome (`pass` → not-403 / `forbidden` → 403 / `unauthorized` → 401). The matrix lives
in code at `lib/authz-matrix.ts` and is the single source of truth shared by both this
suite and the `/api/developer/security` dashboard — they cannot drift. **Any unexpected
authorization result fails certification.** Current: ✅ 225/225 assertions pass.

## Security Standard SS-03 (permanent automated test)

The audit trail is verified by a **permanent regression test**, the complement to SS-02:
SS-02 proves *who may act*; SS-03 proves *the act was recorded*.
`pnpm --filter @workspace/api-server run test:audit` (validation command `audit`) performs
every critical operation against the live server, then reads the audit store and asserts the
correct event was persisted with all required fields (event type, actor, timestamp, entity
id, details). It also proves the audit history is **immutable** — statically (no application
route `.update()`/`.delete()`s an audit table) and at runtime (a captured record is
byte-identical after the run). The matrix lives in code at
`artifacts/api-server/src/lib/audit-matrix.ts` — 11 audited operations across both
append-only stores (`security_events` + `cell_lot_events`). **Any audit mismatch or
immutability violation fails certification.** Current: ✅ 11/11 operations recorded
correctly; history immutable.

## Security Standard SS-04 (permanent automated test)

Production configuration integrity is verified by a **permanent regression test**.
`pnpm --filter @workspace/api-server run test:config` (validation command `config`) gathers
every production-affecting configuration value (security **and** manufacturing) and validates
each against an explicit rule — required value present, within range, no unsafe default, no
duplicates, no internal conflicts. **A FAIL means configuration drift, treated as a production
defect** (exits non-zero); a **WARN** is permitted only for a documented development-mode
exception. The snapshot + validators live in code at
`artifacts/api-server/src/lib/config-integrity.ts` (`gatherConfig()` + `validateConfig()`) —
the single source of truth shared by both this suite and the director-only
`GET /api/developer/configuration` dashboard, so they cannot drift. Coverage spans JWT/session,
cookie, CORS, CSP, trust-proxy, rate limits, environment variables, manufacturing stage
sequence, feature flags, battery-grading thresholds, charging thresholds, and version
consistency. Notably the CSP rule fails on any production `script-src 'unsafe-inline'`, and the
admin-credential rule is value-aware (fails even if `ADMIN_PASSWORD` is set to the known seed
default). **Any configuration drift fails certification.** Current: ✅ 31 pass · 3 warn · 0 fail
(34 checks); all warnings are documented dev-mode exceptions.

### RBAC model (CTO-approved — DEF-M06-001)

- **Director** — full access to every module.
- **Supervisor** — Masters, lot receiving/editing, QC approval, dispatch, dealers,
  production planning, reports. **Not**: user administration, system settings,
  certification administration.
- **Operator** — cell receiving, grading, matching, charging, testing, production
  stage execution. **Not**: Masters, QC approval, dispatch/dealer management, reports.
- **Viewer** — read-only everywhere. No POST / PATCH / PUT / DELETE; no state changes.

Enforcement: `requireAuth` (global, in `routes/index.ts`) gates every non-public
route. Write authorization uses `requireWriteRole(...roles)` mounted per sub-router
— read methods (GET/HEAD) pass for any authenticated user, write methods require a
listed role. Director is included in every write list.

---

## Matrix

Legend — **Auth**: ✅ requires session · ❌ public. **Rate**: global = 300/min;
auth = 20/15min on login; register = 20/15min. Reads = any authenticated user
unless a minimum role is stated.

### Public & Auth

| Endpoint | Method | Auth | Minimum Role | Rate Limited | Audit Logged | Cert Status |
|---|---|---|---|---|---|---|
| `/api/healthz` | GET | ❌ | — | global | no | ✅ |
| `/api/auth/login` | POST | ❌ | — | auth (20/15m) | **yes** (`auth.login.success`/`failed`) | ✅ |
| `/api/auth/logout` | POST | ❌ | — | global | **yes** (`auth.logout`) | ✅ |
| `/api/auth/me` | GET | ✅ | any | global | no | ✅ |
| `/api/auth/register` | POST | ✅ | **director** | register (20/15m) | **yes** (`user.created`) | ✅ (DEF-M06-002) |

### Masters (`/api/masters/{products,cells,bms,cabinets,connectors,cables,busbars,chargers,test-equipment}`)

| Endpoint | Method | Auth | Minimum Role | Rate Limited | Audit Logged | Cert Status |
|---|---|---|---|---|---|---|
| `/api/masters/*` | GET | ✅ | viewer (read) | global | no | ✅ |
| `/api/masters/*` | POST | ✅ | **supervisor, director** | global | no | ✅ (DEF-M06-001) |
| `/api/masters/*/:id` | PATCH | ✅ | **supervisor, director** | global | no | ✅ |
| `/api/masters/*/:id/status` | PATCH | ✅ | **supervisor, director** | global | no | ✅ |
| `/api/masters/product-categories*` | GET | ✅ | viewer (read) | global | no | ✅ (CW-03) |
| `/api/masters/product-categories*` | POST/PATCH | ✅ | **director** | global | no | ✅ (CW-03 — category master is a director-only governance concept) |
| `/api/masters/product-workflows*` | GET | ✅ | viewer (read) | global | no | ✅ (CW-03) |
| `/api/masters/product-workflows*` | POST/PATCH | ✅ | **director** | global | no | ✅ (CW-03 — workflow master is a director-only governance concept) |
| `/api/masters/material-categories*` | GET | ✅ | viewer (read) | global | no | ✅ (Inventory — Material Master) |
| `/api/masters/material-categories*` | POST/PATCH | ✅ | **director** | global | no | ✅ (Inventory — category lookup is a director-only governance concept) |
| `/api/masters/materials*` | GET | ✅ | viewer (read) | global | no | ✅ (Inventory — Material Master) |
| `/api/masters/materials*` | POST/PATCH | ✅ | **supervisor, director** | global | no | ✅ (Inventory — Material Master; invalid category_id → 400 via FK guard) |
| `/api/masters/suppliers*` | GET | ✅ | viewer (read) | global | no | ✅ (Inventory — Supplier Master) |
| `/api/masters/suppliers*` | POST/PATCH | ✅ | **supervisor, director** | global | no | ✅ (Inventory — Supplier Master; GRN supplier_id FK source) |
| `/api/masters/material-workflows*` | GET | ✅ | viewer (read) | global | no | ✅ (Inventory — Material Workflow master) |
| `/api/masters/material-workflows*` | POST/PATCH | ✅ | **director** | global | no | ✅ (Inventory — workflow master is a director-only governance concept; carries post_receipt_action) |

### Inventory (`/api/inventory`) — Inventory Platform v1.0 (GRN)

| Endpoint | Method | Auth | Minimum Role | Rate Limited | Audit Logged | Cert Status |
|---|---|---|---|---|---|---|
| `/material-workflow-assignments` | GET | ✅ | viewer (read) | global | no | ✅ (category→workflow routing config) |
| `/material-workflow-assignments` | PUT | ✅ | **director** | global | no | ✅ (upsert by category UNIQUE; bad category/workflow id → 400 via FK guard) |
| `/grns` | GET | ✅ | viewer (read) | global | no | ✅ |
| `/grns/:id` | GET | ✅ | viewer (read) | global | no | ✅ |
| `/grns/:id/transactions` | GET | ✅ | viewer (read) | global | no | ✅ (immutable inventory transactions a GRN generated) |
| `/grns` | POST | ✅ | **supervisor, director** | global | ✅ (`grn.created`) | ✅ (qty>0 via zod gt(0); unknown material_id / FK → 400; uom snapshot from Material) |
| `/grns/:id/post` | POST | ✅ | **supervisor, director** | global | ✅ (`grn.posted`) | ✅ (draft→posted guarded FOR UPDATE inside tx (TOCTOU); per-line workflow routing; atomic txn gen; non-draft → 409) |
| `/grns/:id` | DELETE | ✅ | **supervisor, director** | global | no | ✅ (only draft deletable, guarded FOR UPDATE; posted → 409) |
| `/inspections` | GET | ✅ | viewer (read) | global | no | ✅ |
| `/inspections/eligible` | GET | ✅ | viewer (read) | global | no | ✅ (posted GRNs with pending lines, not yet inspected; literal path registered before `/:id`) |
| `/inspections/:id` | GET | ✅ | viewer (read) | global | no | ✅ |
| `/inspections` | POST | ✅ | **supervisor, director** | global | ✅ (`inspection.completed`) | ✅ (GRN must be posted+uninspected guarded FOR UPDATE inside tx (TOCTOU); grn_id UNIQUE → already-inspected 409; submitted lines must exactly cover pending lines → 400; per-line accepted+rejected==received & both≥0 → 400; rejection_reason required if rejected>0 → 400; atomic ledger writes; NEVER mutates GRN receipt qty/material/uom) |
| `/stock` | GET | ✅ | viewer (read) | global | no | ✅ (read-only SUM(quantity) projection of the immutable ledger by material+stock_state) |
| `/stock/:materialId/provenance` | GET | ✅ | viewer (read) | global | no | ✅ (read-only drill-down: contributing posted-GRN receipt lines + supplier + inspection; `remaining_available_qty` DERIVED from signed ledger by source_line_id; no denormalization, no new tables; 404 if material missing) |

> **Incoming Inspection (Inventory Platform v1.0):** a SEPARATE document from the GRN — it records what OCS
> ACCEPTED vs REJECTED and NEVER modifies the GRN's receipt data (quantity_received/material/supplier/uom stay
> immutable; only each line's `inspection_status` badge reflects the outcome). Line-by-line: each pending GRN line
> gets its own accept/reject. Inventory moves via signed ledger entries: `INSPECTION_RELEASE` −received @inspection_pending,
> `INSPECTION_ACCEPT` +accepted @available, `INSPECTION_REJECT` +rejected @rejected (zero-qty rows skipped) — netting
> the inspection_pending hold to 0. One inspection per GRN (grn_id UNIQUE).

> **Workflow-driven receipt routing:** posting reads each line's Material → Category →
> assigned Material Workflow → `post_receipt_action` (exhaustive switch, `never` default).
> `INCOMING_INSPECTION` → line `inspection_status=pending`, transaction `stock_state=inspection_pending`;
> `DIRECT_TO_INVENTORY` → `inspection_status=NULL`, `stock_state=available`. A category with no
> assignment defaults to `DIRECT_TO_INVENTORY`. The engine never assumes one inspection process per GRN.

### Manufacturing (`/api/manufacturing`)

| Endpoint | Method | Auth | Minimum Role | Rate Limited | Audit Logged | Cert Status |
|---|---|---|---|---|---|---|
| `/orders` | GET | ✅ | viewer (read) | global | no | ✅ |
| `/orders`, `/orders/:id` | POST/PATCH | ✅ | **supervisor, director** | global | no | ✅ |
| `/orders/:id/stages/*` | GET | ✅ | viewer (read) | global | no | ✅ |
| `/orders/:id/stages/*` (start/pause/resume/complete/update) | POST/PATCH | ✅ | **operator, supervisor, director** | global | no | ✅ |
| `/orders/:id/stages/:stage/approve` · `/reject` | POST | ✅ | **supervisor, director** | global | no | ✅ (sign-off is supervisory) |
| `/orders/:id/qc-approval` | POST | ✅ | **supervisor, director** | global | no | ✅ |
| `/orders/:id/genealogy` | GET | ✅ | viewer (read) | global | no | ✅ |
| `/orders/:id/genealogy` | POST | ✅ | **operator, supervisor, director** | global | no | ✅ |
| `/orders/:id/test-results` | GET | ✅ | viewer (read) | global | no | ✅ |
| `/orders/:id/test-results` | POST/PUT | ✅ | **operator, supervisor, director** | global | no | ✅ |
| `/orders/:id/material-issues/preview` | GET | ✅ | viewer (read) | global | no | ✅ (BOM requirement preview + stock availability; suggested GRN/lot) |
| `/orders/:id/material-issues` | GET | ✅ | viewer (read) | global | no | ✅ (list MINs for the order) |
| `/orders/:id/material-issues/:minId` | GET | ✅ | viewer (read) | global | no | ✅ (MIN document detail incl. lines + reversal info) |
| `/orders/:id/material-issues` | POST | ✅ | **supervisor, director** | global | **yes** (`materials_issued` on `mfg_battery_timeline`) | ✅ (BOM-driven MIN; atomic, order locked FOR UPDATE double-issue guard; signed `PRODUCTION_ISSUE` ledger rows; system-generated MIN no.) |
| `/orders/:id/material-issues/:minId/reverse` | POST | ✅ | **supervisor, director** | global | **yes** (`materials_issue_reversed` on `mfg_battery_timeline`) | ✅ (append-only reversal; one per MIN; mandatory reason; restores stock via `PRODUCTION_ISSUE_REVERSAL` rows; MIN header never mutated) |
| `/rework` | GET | ✅ | viewer (read) | global | no | ✅ |
| `/rework/:id` | PATCH | ✅ | **operator, supervisor, director** | global | no | ✅ |
| `/charger-units` | GET | ✅ | viewer (read) | global | no | ✅ |
| `/charger-units*` | POST/PATCH | ✅ | **supervisor, director** | global | no | ✅ |
| dashboards (charging/testing/formation) | GET | ✅ | viewer (read) | global | no | ✅ |

> **Note (rework, genealogy, charger-units):** rework ticket updates and manual
> genealogy entries are classified as production execution (operator+); charger-unit
> management is equipment administration (supervisor+). Flagged for CTO confirmation.

### Cells (`/api/cells`)

| Endpoint | Method | Auth | Minimum Role | Rate Limited | Audit Logged | Cert Status |
|---|---|---|---|---|---|---|
| `/lots` | GET | ✅ | viewer (read) | global | no | ✅ |
| `/lots`, `/lots/:id` | POST/PATCH | ✅ | **operator, supervisor, director** | global | no | ✅ |
| `/cells` (grading) | GET | ✅ | viewer (read) | global | no | ✅ |
| `/cells` (grade) | POST | ✅ | **operator, supervisor, director** | global | no | ✅ (numeric bounds: capacityAh>0, voltageV>0, IR≥0, gradedBy non-blank → 400, DEF-CW02-004/005) |
| `/cells/:id/correct` (controlled re-grade) | POST | ✅ | **supervisor, director** | global | ✅ (`cell_grade_corrected`) | ✅ (mandatory reason; original immutable; appended correction = active; DEF-CW02-006) |
| `/cells/:id/measurements` (grade history/genealogy) | GET | ✅ | viewer (read) | global | no | ✅ |
| `/matches` | GET | ✅ | viewer (read) | global | no | ✅ |
| `/matches*` (match/reserve/release) | POST | ✅ | **operator, supervisor, director** | global | no | ✅ |
| `/config` | GET | ✅ | viewer (read) | global | no | ✅ |
| `/config` | PUT/PATCH | ✅ | **supervisor, director** | global | no | ✅ (empty-body → 400, DEF-M06-EMPTY-BODY) |
| `/inventory`, reports | GET | ✅ | viewer (read) | global | no | ✅ |

### Logistics (`/api/logistics`)

| Endpoint | Method | Auth | Minimum Role | Rate Limited | Audit Logged | Cert Status |
|---|---|---|---|---|---|---|
| `/dispatch-orders*` | GET | ✅ | viewer (read) | global | no | ✅ |
| `/dispatch-orders*` (create/advance) | POST/PATCH | ✅ | **supervisor, director** | global | no | ✅ |
| `/dealers*` | GET | ✅ | viewer (read) | global | no | ✅ |
| `/dealers*` | POST/PATCH/DELETE | ✅ | **supervisor, director** | global | no | ✅ |
| `/packing-dashboard` | GET | ✅ | viewer (read) | global | no | ✅ |

### Products (`/api/products`) — CW-03 Unified Product Platform

| Endpoint | Method | Auth | Minimum Role | Rate Limited | Audit Logged | Cert Status |
|---|---|---|---|---|---|---|
| `/api/products` | GET | ✅ | viewer (read) | global | no | ✅ (CW-03) |
| `/api/products/inventory-summary` | GET | ✅ | viewer (read) | global | no | ✅ (Product Inventory — read-only aggregate projection, no writes) |
| `/api/products/:id` | GET | ✅ | viewer (read) | global | no | ✅ (CW-03) |
| `/api/products/:id/genealogy` | GET | ✅ | viewer (read) | global | no | ✅ (CW-03 — lineage copied from order at QC pass) |
| `/api/products/:id/events` | GET | ✅ | viewer (read) | global | no | ✅ (CW-03 — read-only view of the append-only `product_events` timeline) |
| `/api/products/:id/traceability` | GET | ✅ | viewer (read) | global | no | ✅ (Product 360° — read-only cross-module lineage aggregation, zero writes) |
| `/api/products/:id/status` | POST | ✅ | **supervisor, director** | global | **yes** (`product.*` on `product_events`) | ✅ (CW-03 — forward-only lifecycle, FOR UPDATE re-check) |

> **Note (Products):** Products are never created via a public endpoint — a serialized
> Product is minted only inside the QC-approval transaction at QC PASS (`createProductFromOrder`,
> idempotent on `source_production_order_id`) and by the idempotent startup backfill. There is no
> `POST /api/products`. Status transitions are forward-only along the approved lifecycle
> (`manufacturing → qc_passed → ready_for_packing → packed → dispatched → delivered_to_dealer`),
> validated inside the transaction under a row lock (TOCTOU-safe). Per DP-3, product creation
> writes no ECF baseline; `product_events` is the product timeline.

### Imported Product Creation (`/api/products/imported`) — Factory Ready Sprint 1 (G1)

| Endpoint | Method | Auth | Minimum Role | Rate Limited | Audit Logged | Cert Status |
|---|---|---|---|---|---|---|
| `/api/products/imported` | POST | ✅ | **supervisor, director** | global | **yes** (`product.imported` on `product_events`) | ✅ (batch, atomic; Lithium Inverter → auto OCS serial `LIV-YYYYMMDD-NNNNNN` via `product_import_seq`; Hybrid Inverter → captured OEM serial `serial_source=MANUFACTURER`; products minted at `ready_for_packing`) |

> **Note (Imported Product Creation):** Additive Sprint-1 module. Imported finished goods
> (Inbuilt Lithium Inverter, Hybrid Inverter) enter the Product Platform directly as serialized
> Products at `ready_for_packing` — NO production order, NO BOM, NO inventory consumption. The
> model's Product Category decides serialization: OCS-serialized categories mint `quantity` units
> with `LIV-YYYYMMDD-NNNNNN` (from `product_import_seq`, `serial_source=OCS`); OEM-serialized
> categories capture one unit per supplied `oem_serials[]` (`serial_source=MANUFACTURER`). A model
> whose category is not import-eligible is rejected (422). Input validation is Zod
> (`CreateImportedProductBody`); write is gated `requireRole(supervisor, director)`. Each unit
> appends an immutable `product.imported` event.

### Customer Registration (`/api/customers/registrations`) — Factory Ready Sprint 1 (G3)

| Endpoint | Method | Auth | Minimum Role | Rate Limited | Audit Logged | Cert Status |
|---|---|---|---|---|---|---|
| `/api/customers/registrations` | GET | ✅ | any authed (read) | global | n/a (read) | ✅ (list; search + pagination) |
| `/api/customers/registrations/{id}` | GET | ✅ | any authed (read) | global | n/a (read) | ✅ (registration + warranty detail) |
| `/api/customers/registrations` | POST | ✅ | **supervisor, director** | global | **yes** (`customer.registered` on `product_events`) | ✅ (atomic; product must be dispatched/delivered else 422; one registration per product serial else 409; auto-creates warranty) |

> **Note (Customer Registration):** Registers an end customer (name, mobile, address, dealer,
> product serial, installation date) against a serialized Product that has already been dispatched
> (`dispatched` or `delivered_to_dealer`, else 422). One registration per product serial (unique,
> 409 on duplicate). On success it atomically mints the product's warranty (see G4) from the
> installation date. Input validation is Zod (`CreateCustomerRegistrationBody`); write gated
> `requireRole(supervisor, director)`; reads open to any authed user. Applies to all three product
> types (battery pack, inbuilt lithium inverter, hybrid inverter).

### Warranty (`/api/warranties`) — Factory Ready Sprint 1 (G4)

| Endpoint | Method | Auth | Minimum Role | Rate Limited | Audit Logged | Cert Status |
|---|---|---|---|---|---|---|
| `/api/warranties` | GET | ✅ | any authed (read) | global | n/a (read) | ✅ (list; computed status filter; search + pagination) |
| `/api/warranties/{id}` | GET | ✅ | any authed (read) | global | n/a (read) | ✅ (warranty detail; computed status) |
| `/api/warranties/{id}/void` | POST | ✅ | **supervisor, director** | global | **yes** (`warranty.voided` on `product_events`) | ✅ (mandatory reason else 400; one void per warranty else 409; FOR UPDATE re-check) |

> **Note (Warranty):** Common warranty engine across all three product types. Status is **computed**,
> never stored as the source of truth: `void` if voided, else `expired` if today > end date, else
> `active`. End date = installation date + the model's warranty period (months). Voiding persists
> `voided_at` / `void_reason` / `voided_by` (mandatory reason, 400 if empty) and is one-per-warranty
> (409 if already void), re-checked under `SELECT … FOR UPDATE` (TOCTOU-safe). Reads open to any
> authed user; void gated `requireRole(supervisor, director)`.

### Fulfillment (`/api/packing`, `/api/dispatch`) — Product-Platform-driven

| Endpoint | Method | Auth | Minimum Role | Rate Limited | Audit Logged | Cert Status |
|---|---|---|---|---|---|---|
| `/api/packing` | POST | ✅ | **supervisor, director** | global | **yes** (`product.packed` on `product_events`) | ✅ (batch, atomic, FOR UPDATE re-check; ready_for_packing → packed) |
| `/api/dispatch` | GET | ✅ | any authed (read) | global | n/a (read) | ✅ (list dispatch documents; search + pagination) |
| `/api/dispatch` | POST | ✅ | **supervisor, director** | global | **yes** (`product.dispatched` on `product_events`) | ✅ (batch, atomic, FOR UPDATE re-check; packed → dispatched + dealer assignment; system-generated unique dispatch no.; D1 inactive-dealer reject 422; D2 unique invoice 409) |
| `/api/dispatch/{id}` | GET | ✅ | any authed (read) | global | n/a (read) | ✅ (dispatch document detail; powers printable Dispatch Note) |
| `/api/dispatch/{id}/reverse` | POST | ✅ | **supervisor, director** | global | **yes** (`product.dispatch_reversed` on `product_events`) | ✅ (D4 append-only reversal; restores products → packed + clears dealer; one reversal per dispatch) |
| `/api/dealers/{id}/inventory` | GET | ✅ | any authed (read) | global | n/a (read) | ✅ (read-only projection; products where `dealer_id={id}`) |
| `/api/dealers/{id}/dispatch-history` | GET | ✅ | any authed (read) | global | n/a (read) | ✅ (read-only projection; `product.dispatched` events for the dealer's products) |

> **Note (Fulfillment):** Packing and Dispatch are pure Product-Platform operations — no new table,
> no ledger, no duplicated Product data. The eligible queues reuse
> `GET /api/products?product_status=ready_for_packing` and `…=packed` respectively.
> A **pack** transitions each product `ready_for_packing → packed` and appends an immutable `product.packed`
> event (packing date + packed-by). A **dispatch** validates the dealer exists, transitions each product
> `packed → dispatched`, assigns the dealer on the existing `products.dealer_id` column, and appends an
> immutable `product.dispatched` event (dispatch number, date, invoice number, dealer) — NO LR/vehicle/driver/
> transporter (that is the separate legacy logistics module). Both are fail-fast & atomic: if any product is
> not in the required status (or the dealer is missing) the whole request is rejected (422/404) and nothing
> is written. All event writes go to the append-only `product_events` timeline.
> The **Dealer** endpoints are pure read-only projections — `inventory` lists the products currently
> assigned to a dealer (`products.dealer_id`), `dispatch-history` replays that dealer's `product.dispatched`
> events. No writes, no new tables; both 404 when the dealer does not exist.

### MES — Bill of Materials (`/api/boms`) — MES Phase 1

| Endpoint | Method | Auth | Minimum Role | Rate Limited | Audit Logged | Cert Status |
|---|---|---|---|---|---|---|
| `/api/boms` | GET | ✅ | any authed (read) | global | n/a (read) | ✅ (list BOMs; search + model/status filters + pagination) |
| `/api/boms` | POST | ✅ | **supervisor, director** | global | no (master data) | ✅ (create draft; server-assigned revision + `BOM-YYYYMMDD-NNNNNN`; model + materials must exist 404; 409 on revision collision) |
| `/api/boms/{id}` | GET | ✅ | any authed (read) | global | n/a (read) | ✅ (BOM detail — header + enriched lines) |
| `/api/boms/{id}` | PUT | ✅ | **supervisor, director** | global | no (master data) | ✅ (update draft only, else 422; FOR UPDATE; replaces header + lines) |
| `/api/boms/{id}` | DELETE | ✅ | **supervisor, director** | global | no (master data) | ✅ (delete draft only, else 422; FOR UPDATE; lines cascade) |
| `/api/boms/{id}/approve` | POST | ✅ | **supervisor, director** | global | no (master data) | ✅ (draft → approved, else 422; records approver + timestamp; FOR UPDATE) |
| `/api/boms/{id}/obsolete` | POST | ✅ | **supervisor, director** | global | no (master data) | ✅ (approved → obsolete, else 422; FOR UPDATE) |

> **Note (BOM):** Additive MES Phase 1 module. A BOM is a **versioned master** owned by a Model
> (`master_products`): each revision persists (`draft → approved → obsolete`) and is never overwritten —
> an approved BOM is corrected by creating a new revision. Input validation is Zod (`CreateBomBody` /
> `UpdateBomBody`); write routes are gated `requireRole(supervisor, director)`; reads are open to any
> authed user. All state transitions re-check status inside the transaction under `SELECT … FOR UPDATE`
> (TOCTOU-safe). Not audit-logged — BOM is master data, consistent with the other Masters (no
> `security_events` / timeline entry), NOT a serialized engineering record. Every write returns the
> canonical `GET` projection (snake_case).

### Dashboard / Reports / Developer

| Endpoint | Method | Auth | Minimum Role | Rate Limited | Audit Logged | Cert Status |
|---|---|---|---|---|---|---|
| `/api/dashboard/*` | GET | ✅ | viewer (read) | global | no | ✅ |
| `/api/reports/*` | GET | ✅ | **director, supervisor** | global | no | ✅ |
| `/api/developer/*` (incl. performance snapshots) | GET/POST | ✅ | **director** | global | no | ✅ |
| `/api/developer/security` (security dashboard) | GET | ✅ | **director** | global | no | ✅ (SS-02 verified) |
| `/api/developer/configuration` (config-integrity dashboard) | GET | ✅ | **director** | global | no | ✅ (SS-02 verified; SS-04 source) |

> **Reports interpretation:** reporting is a management capability (CTO matrix lists
> Reports under supervisor; operators excluded). It is intentionally restricted to
> director + supervisor even for reads, rather than exposed to viewer.

---

## Open follow-ups (filed, not yet remediated)

- ✅ **DEF-M06-003 (LOW) — RESOLVED 2026-06-28.** Persistent `security_events` table now
  records auth (`auth.login.success`/`failed`, `auth.logout`), `user.created`,
  `authz.denied` (403s), and `ratelimit.exceeded` events with actor + IP + metadata.
- ✅ **DEF-M06-EMPTY-BODY (LOW) — FIXED 2026-06-28.** `PUT /api/cells/config` with an
  empty body returned 500 (all-optional schema passed, empty SQL SET clause threw); now
  returns 400 per SS-01.
- ✅ **DEF-M06-004 (LOW) — RESOLVED 2026-06-28.** Production `script-src` no longer allows
  `'unsafe-inline'` (env-gated in `lib/security-config.ts`); enforced by SS-04. `style-src`
  keeps `'unsafe-inline'` as a documented temporary exception pending a nonce/hash migration.
- **DEF-M06-005 (LOW)** — stateless JWT has no server-side revocation list (8 h window
  accepted residual risk).
