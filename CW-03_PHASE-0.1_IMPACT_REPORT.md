# CW-03 — Phase 0.1 Implementation Impact Report

| Field | Value |
|-------|-------|
| **Wave / Phase** | CW-03 · **Phase 0.1 (pure planning gate — NO code, NO migrations)** |
| **Prepared** | 2026-06-28 |
| **Status** | **Draft for CTO review.** Per CTO directive, **no database migration or production code is written until this report is approved.** |
| **Parent plan** | `CW-03_IMPLEMENTATION_PLAN.md` (v2, approved in principle) |
| **Governing constraints** | The 7 CTO-locked Implementation Principles (plan §2.1) + the model-vs-unit `product_id` contract (plan §3.1) |
| **Open decisions this report assumes** | **D1** product link = `products.source_production_order_id` only (assumed APPROVED). **D2** `master_manufacturers` = **DEFERRED** (assumed). **D3** SS-03 = **Option B** (documented evidence + backlog) unless escalated. *All three confirmed at approval.* |

> This is the "look before you leap" artifact the CTO requested: it maps every change CW-03 will make —
> to the database, the API contract, the UI, and the test surface — plus effort, risk, and rollback,
> **before** a single migration runs. Nothing here is implemented yet.

---

## 1. Migration is dev-push based (no SQL migration files)

This repo applies schema changes with **`pnpm --filter @workspace/db run push`** (Drizzle push), not
hand-written SQL migration files — for **both** dev and prod (per `replit.md`). "Migration sequence"
below therefore means **the order in which schema objects are declared and pushed**, plus the
startup-seed/backfill steps. Every step is **additive**; no certified table is renamed or dropped.

---

## 2. Database Migration Sequence

Ordered by FK dependency (each step is safe to push independently; later steps depend on earlier ones).

| # | Object | Type | Depends on | Notes |
|---|--------|------|-----------|-------|
| M1 | `product_category`, `product_status`, `serial_source` (`OCS\|MANUFACTURER`) | **New enums** | — | Declared in a new `lib/db/src/schema/products.ts` |
| M2 | `product_categories` | **New table** | — | Category Master; seeded M11 |
| M3 | `product_workflows` | **New table** | — | Workflow Master (`code`,`name`,`stage_sequence` jsonb,`status`); seeded M11 |
| M4 | `products` | **New table** | M2, M3, `master_products`, `mfg_production_orders`, `logistics_dealers` | Serialized unit; `official_product_serial` UNIQUE NOT NULL; **`source_production_order_id` nullable FK → mfg_production_orders** (the ONLY order↔unit link); **no manufacturer column** |
| M5 | `product_genealogy` | **New table** | M4 | Category-aware lineage keyed by `product_id` |
| M6 | `product_events` | **New table** | M4 | Append-only Product audit timeline |
| M7 | `master_products.category_id` (nullable FK → `product_categories`) | **Additive column** | M2 | Existing free-text `category` **stays**; retired only post-cert |
| M8 | `logistics_dispatch_items.product_id` (nullable FK → `products`) | **Additive column** | M4 | **Dual-key**: existing UNIQUE `production_order_id` stays authoritative through CW-03 |
| M9 | Indexes | **New indexes** | M4–M8 | UNIQUE on `official_product_serial`; UNIQUE on `products.source_production_order_id` (idempotent QC emit); FK/query-column indexes per repo convention |
| M10 | `product_seq` (or reuse `mfg_battery_seq` pattern) | **Startup sequence** | — | `CREATE SEQUENCE IF NOT EXISTS` in `seed.ts`, same pattern as `mfg_order_seq`/`mfg_battery_seq` |
| M11 | Seed: 3 categories; `product_workflows` BATTERY **active**, INBUILT_LITHIUM/HYBRID **reserved (inactive)** | **Seed (idempotent)** | M2, M3 | Config data only |
| M12 | **Backfill**: one `products` row per existing **completed/dispatched** battery order | **Data backfill (idempotent)** | M4, M10, M11 | Guarded by unique `source_production_order_id`; emits reconciliation count + audit; re-runnable |

**Push checkpoints:** push after M1–M9 (structure), verify, then run M10–M12 (seed/backfill) on server
startup. **Gotcha to honor:** always `db run push` *before* starting the server, or routes using new
columns 500.

**D2 note:** if CTO chooses to **include** `master_manufacturers`, it inserts as **M2.5** (new table, no
deps) + a nullable `master_products.manufacturer_id` FK as **M7.5**; products would then *derive*
manufacturer via `model_id → manufacturer_id` (no column on `products`). Recommended: defer.

---

## 3. API Contract Changes

The contract is a **single source file** (`lib/api-spec/openapi.yaml`); changes are authored there, then
`pnpm --filter @workspace/api-spec run codegen` regenerates React Query hooks + Zod schemas (Orval split
mode). **No manual edits to generated files.**

### 3.1 New endpoints (authored spec-first)

| Method | Path | Auth / min role | Audit? | Notes |
|--------|------|-----------------|--------|-------|
| GET | `/products` | authed (any) | no | List + filters (category, status, dealer, serial) |
| GET | `/products/{id}` | authed (any) | no | Detail incl derived manufacturer (future) |
| GET | `/products/{id}/genealogy` | authed (any) | no | Lineage from `product_genealogy` |
| POST | `/products/{id}/status` | **write role** (director/supervisor) | **yes** (`product_events`) | Guarded status transition; empty-body 400 guard (all-optional pitfall) |
| GET | `/masters/product-categories` | authed (any) | no | Category Master read |
| GET | `/masters/product-workflows` | authed (any) | no | Workflow Master read |
| POST/PATCH | `/masters/product-categories` (+ workflows) | **director** | yes | Director-managed config (optional in CW-03; read-only acceptable) |

> **No public `POST /products`.** Product creation is **not** an API action — it happens **only** inside
> the QC-PASS transaction (Principle 3). The spec documents Product creation as a side effect of QC
> approval, not as a callable endpoint.

### 3.2 Generated-output impact

- `lib/api-client-react/src/generated/` — new hook file per tag (`products`, `masters`).
- `lib/api-zod/src/generated/` — new Zod schema file(s).
- **Barrel gotcha:** after codegen, verify `lib/api-zod/src/index.ts` still uses `export * as types`
  (not `export *`) and delete any duplicate inline-requestBody `types/` files (TS2308).

### 3.3 Existing contracts touched

- **QC approval** response (mfg `qc-approval`) gains the emitted Product reference (additive field).
- **Dispatch item** schema gains optional `product_id` (additive, dual-key).
- No existing field removed or retyped.

---

## 4. UI Impact Map (frontend pages affected)

Frontend = `artifacts/ocs-one` (React 19 + Wouter + React Query + ODS). All new UI uses **ODS only**.

### 4.1 New pages / routes

| Route | Page | Scope |
|-------|------|-------|
| `/products` | `ProductListPage` | ODS table: serial, category, model, status, dealer, source order |
| `/products/:id` | `ProductDetailPage` | Identity, status timeline (`product_events`), links to source order |
| `/products/:id/genealogy` (or tab) | Product genealogy view | Generalizes the existing battery genealogy view |
| nav | sidebar entry "Products" | Added to existing nav (ODS nav component) |

### 4.2 Existing pages changed (additive, low-risk)

| Page | Change |
|------|--------|
| `OrderDetailPage` (`/manufacturing/orders/:id`) | After QC PASS, show the emitted Product (serial + link). Read-only addition. |
| QC stage card (within Battery Workspace) | On approve, surface "Product created: <serial>" confirmation. |
| `DispatchOrderDetailPage` (`/logistics/dispatch-orders/:id`) | Show Product reference alongside production order (dual-ref display). |
| Reports / Director (`/reports/*`, `/dashboard`) | **No change in CW-03.** Product becomes the canonical *exposed* identity at freeze, but each downstream module repoints its *internal* reads to `product_id` in its **own later certification wave** (plan Principle 6 / decision **D4**); dual-ref keeps current reads working meanwhile. |

### 4.3 Not touched

Cells (receiving/grading/inventory/matching/config), other masters, security/config/performance/
architecture dashboards, charging/testing dashboards, rework queue — **unchanged**.

---

## 5. Test Impact Map

| Surface | Change | Why |
|---------|--------|-----|
| **SS-02 `lib/authz-matrix.ts`** | **Add** every new product + masters endpoint × 5 principals; **verify/extend** existing mfg endpoints | Single source for authz suite + security dashboard; must not drift |
| **SS-03 `audit-matrix.ts`** | **D3 decision.** Option A: add QC-PASS-creation + product status-change ops and register `product_events` (+ `mfg_battery_timeline`) as append-only stores [framework change — freeze exception]. Option B: cover by direct MAT-06 evidence + backlog. **Either way, QC-PASS Product creation MUST be audit-verified** (new critical op) | New critical operation introduced |
| **SS-04 `config-integrity.ts`** | Update **RBAC-matrix count** + any **version-consistency** check to include the new endpoints; re-baseline expected counts | SS-04 fails on drift; counts must match reality |
| **SS-01 `docs/security-matrix.md`** | One row per new endpoint (auth/role/audit/ratelimit/validation/sanitisation) | SS-01 standard |
| **Cert suites** (`authz`/`audit`/`config` workflows) | Re-run as pre-wave baseline; capture green (authoritative audit mode `CERT_AUDIT_RATELIMIT=1`) | Standing gates |
| **MAT-01…06** | Execute against the Product-based module (see plan §6) | Phase 3 |
| **Fixtures/teardown** | Add `products`, `product_genealogy`, `product_events` to the prefixed-teardown enumeration; assert 0 residual | Standard hygiene |
| **Backfill test** | Reconciliation assertion (created = expected completed/dispatched battery orders) | MAT-03 |

---

## 6. Estimated Implementation Effort

Relative sizing (T-shirt + indicative engineering-days; sequential, single implementer; excludes review/CTO gates). **Estimates, not commitments.**

| Phase | Work | Size | Indicative |
|-------|------|------|-----------|
| 0 | Schema (M1–M9) + seed/backfill (M10–M12) + db push | **M** | 1.5–2.5 d |
| 0 | OpenAPI spec + codegen + barrel verification | **S–M** | 1–1.5 d |
| 0 | `/products` + masters routes (incl SS-01/02 rows) | **M** | 2–3 d |
| 0 | ODS Product UI (list/detail/genealogy + nav) | **M–L** | 2.5–3.5 d |
| 1 | Manufacturing consumes Product (wiring, dual-ref display) | **S–M** | 1–2 d |
| 2 | QC-PASS emit hook (atomic + idempotent) + audit + tests | **M** | 1.5–2.5 d |
| 3 | MAT-01→06 batch certification + evidence | **L** | 4–6 d |
| 4 | Freeze package + scorecard/README/changelog | **S** | 0.5–1 d |
| | **Total (build + certify)** | | **≈ 15–22 engineering-days** |

Biggest single line is Phase 3 certification, consistent with prior waves.

---

## 7. Risk Assessment (Phase-0.1 view)

Inherits plan §10 (C3-R1…R9). Migration/build-specific additions:

| # | Risk | Sev | Mitigation |
|---|------|-----|------------|
| P01-R1 | `db push` on additive cols against existing data is safe, but **backfill** could double-create Products | High | Unique `source_production_order_id`; idempotent re-runnable backfill; reconciliation count |
| P01-R2 | **Codegen drift / barrel duplication** breaks build after spec edit | Med | Post-codegen barrel check; delete duplicate `types/`; typecheck gate |
| P01-R3 | **SS-04 count re-baseline** mismatch fails `config` suite | Med | Update expected RBAC/endpoint counts in the same change that adds endpoints |
| P01-R4 | **QC-PASS emit not atomic** → order approved but no Product (or vice-versa) | High | Single transaction; FOR UPDATE on the order row; emit + link + event + audit commit together |
| P01-R5 | **Dual-ref confusion** downstream during the transition | Med | `production_order_id` stays authoritative in CW-03; Product-primary repoint is a later wave; documented in §2.1 Principle 6 |
| P01-R6 | **Model-vs-unit `product_id` confusion** in code review | Med | Principle 4 + schema-comment contract; never write order.product_id for units |

---

## 8. Rollback Strategy

Because every change is **additive** and creation is **gated + idempotent**, rollback is clean:

| Layer | Rollback |
|-------|----------|
| **QC-PASS emit** | **Feature-flag the emit hook** (e.g. `PRODUCT_EMIT_ENABLED`). Disabling it returns manufacturing to pre-CW-03 behaviour instantly; existing Products remain valid, no orphan orders. |
| **Backfill data** | Reversible, but **referentially**: child tables first. (1) null/clear `logistics_dispatch_items.product_id`; (2) `DELETE FROM product_events` and `DELETE FROM product_genealogy` for the affected products; (3) `DELETE FROM products WHERE source_production_order_id IS NOT NULL` (OCS battery backfill). Safe because nothing **authoritative** points to Products yet (downstream still keyed on `production_order_id`). **Define `ON DELETE` policy on `product_genealogy`/`product_events`/`dispatch_items.product_id` FKs up front** (RESTRICT + explicit child-first delete, or CASCADE) so rollback order is unambiguous. |
| **Additive columns** | `master_products.category_id` and `logistics_dispatch_items.product_id` are nullable and unused by authoritative reads; can be left in place (no-op) or dropped via push. |
| **New tables** | `products`/`product_genealogy`/`product_events`/`product_categories`/`product_workflows` can be dropped (nothing certified depends on them) — or simply left dormant. |
| **API/UI** | New endpoints/pages are additive; removing the nav entry + routes hides the surface. Generated hooks regenerate from the reverted spec. |
| **Net** | Rollback restores the **certified CW-02 baseline behaviour** with zero data loss to existing modules, because the Product layer is a *superset* that nothing authoritative yet depends on. |

**Point of no easy return:** only **UPP Phase 4 (downstream repoint to `product_id`)** makes Product the
authoritative key — and that is **explicitly out of CW-03**. Within CW-03, rollback stays cheap.

---

## 9. Phase 0.1 Exit Criteria (approval gate)

- [ ] CTO confirms decisions **D1 / D2 / D3 / D4** (plan §13).
- [ ] **D3 SS-03 path is selected (Option A or B) with a named owner + target date recorded** before any Phase 0 code.
- [ ] FK `ON DELETE` policy for `product_genealogy` / `product_events` / `logistics_dispatch_items.product_id` is decided (enables the §8 rollback order).
- [ ] CTO approves this report's migration sequence, API contract, UI impact, test impact, effort, risk, rollback.
- [ ] Only then does Phase 0 implementation (schema declaration + `db push` + code) begin.

> Nothing in this report has been implemented. Awaiting CTO approval to proceed to Phase 0.
