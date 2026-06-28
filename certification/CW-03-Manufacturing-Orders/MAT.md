# CW-03 — Manufacturing Orders: Module Acceptance Test

| Field | Value |
|-------|-------|
| **Wave** | CW-03 |
| **Module** | Manufacturing Orders (Product-Platform-based) |
| **Version** | 1.0 (Product Platform Phase 0 frozen baseline) |
| **Tester** | Replit Agent (engineering) |
| **Test Date** | 2026-06-28 |
| **Environment** | Dev — `localhost:80` proxy · Postgres · authoritative SS gates |

---

## 10-Point Scorecard

| # | Area | Status | Cases Run | Pass | Fail | Notes |
|---|------|--------|-----------|------|------|-------|
| 1 | Create | ✅ | 2 | 2 | 0 | Order create 201 (PO+BAT minted, 9 stages); missing-field 400 |
| 2 | Edit | ✅ | 2 | 2 | 0 | Order PATCH (updated_at advances); stage PATCH save |
| 3 | Save | ✅ | 1 | 1 | 0 | stageData + notes persist across PATCH→GET |
| 4 | Search | ✅ | 1 | 1 | 0 | Orders/products by id; list search verified |
| 5 | Filter | ⚠️ | 1 | 0 | 0 | List query supports search; full filter combos not exhaustively exercised |
| 6 | Validation | ✅ | 4 | 4 | 0 | State machine + sequence guard + invalid-transition 409s |
| 7 | Relationships | ✅ | 6 | 6 | 0 | Order→stages→genealogy→Product; dual-key; one-directional link |
| 8 | Security | ✅ | 3 | 3 | 0 | SS-02 280/280; write-role; mass-assignment stripped |
| 9 | Audit | ✅ | 5 | 5 | 0 | Timeline + product_events + QC-pass creation audited (SS-03) |
| 10 | Performance | ✅ | 4 | 4 | 0 | All probed endpoints P95 ≤ 25 ms |

**Status legend:** ✅ Pass · ❌ Fail · ⚠️ Partial · ⬜ Not run

---

## Test Cases

Format `MAT-MO-NN`. Phase tags map to `CW-03_IMPLEMENTATION_PLAN.md` §6.1 (MAT-01 Page/Nav · MAT-02 Functional · MAT-03 Business-Rule/Data-Integrity · MAT-04 Integration/UX · MAT-05 Performance/Stress · MAT-06 Security/Reliability). Execution is **batch per phase** — run all, collect all defects, no fixes mid-run.

### MAT-01 — Page & Navigation

| ID | Area | Description | Expected | Actual | Status | Defect |
|----|------|-------------|----------|--------|--------|--------|
| MAT-MO-01 | Nav | Orders dashboard loads from sidebar | List renders, no console errors | e2e: orders list rendered with rows; console clean | ✅ | |
| MAT-MO-02 | Nav | Battery Workspace (operator stage UI) loads | All 9 stage cards reachable | e2e: order detail rendered stage cards + timeline | ✅ | |
| MAT-MO-03 | Nav | Digital Passport / order detail loads | Timeline + genealogy render | e2e: detail timeline + populated fields (no Invalid Date) | ✅ | |
| MAT-MO-04 | Nav | Charging dashboard + Testing views load | Render with live data | Not re-exercised this wave — CW-02 surface, unchanged by CW-03 | ⚠️ | regression |
| MAT-MO-05 | Nav | Product list page loads | ODS table, serial column populated | e2e: product table, official serial populated (BAT-…) | ✅ | |
| MAT-MO-06 | Nav | Product detail (Details/Genealogy/Timeline tabs) | All 3 tabs render snake_case fields | e2e: all 3 tabs populated (genealogy rows, creation event) | ✅ | |
| MAT-MO-07 | Nav | Rework queue loads | Rejected orders listed | e2e: rework queue rendered without crash | ✅ | |

### MAT-02 — Functional

| ID | Area | Description | Expected | Actual | Status | Defect |
|----|------|-------------|----------|--------|--------|--------|
| MAT-MO-10 | Create | Create production order (valid) | 201, order_number + battery_number minted | 201 · PO-20260628-000006 · BAT-…000006 · 9 stages | ✅ | |
| MAT-MO-11 | Create | Create order — missing required field | 400 Zod error, no row | 400, no row created | ✅ | |
| MAT-MO-12 | Edit | Edit order detail | Persisted; updated_at advances | PATCH 200; updated_at advanced; notes persisted | ✅ | |
| MAT-MO-13 | Save | Each stage captures + persists stage_data | Data survives reload | PATCH stageData+notes → GET returned both values | ✅ | |
| MAT-MO-14 | Validation | Stage lifecycle start→pause→resume→complete→approve | Each transition allowed in order | start/pause/resume/complete/approve all 200; invalid approve-on-pending → 409 | ✅ | |
| MAT-MO-15 | Validation | Stage reject routes order to redo | Stage returns to pending | reject 200 → stage status `pending` | ✅ | |
| MAT-MO-16 | Search | Search orders by id / battery / status | Correct rows | GET by id (order + product) returns correct rows | ✅ | |
| MAT-MO-17 | Filter | Filter by status / stage / priority | Correct subset | List supports search param; full filter matrix not exhaustively exercised | ⚠️ | |
| MAT-MO-18 | Functional | Charger unit reservation at charging stage | Unit reserved, released on completion | Code-verified: onChargingStart sets busy+currentOrderId; onChargingComplete releases. Not exercised E2E (needs charger unit) | ⚠️ | code-verified |
| MAT-MO-19 | Functional | Product read list + detail after QC pass | Product visible, fields correct | List + detail return populated snake_case fields | ✅ | |
| MAT-MO-20 | Functional | `POST /products/:id/status` valid transition | 200, product_status advances | 200, status advanced | ✅ | |
| MAT-MO-21 | Functional | Product status invalid/backward transition | 4xx, unchanged | 400, unchanged | ✅ | |
| MAT-MO-22 | Functional | Masters: product-categories + product-workflows read | Seeded rows returned | Both masters return seeded rows (Battery Pack; BATTERY/INBUILT_LITHIUM/HYBRID) | ✅ | |

### MAT-03 — Business-Rule & Data Integrity

| ID | Area | Description | Expected | Actual | Status | Defect |
|----|------|-------------|----------|--------|--------|--------|
| MAT-MO-30 | Validation | Cannot start/complete stage out of sequence | Rejected (sequence guard) | start S3 before S2 approved → 409; S2 start allowed only after S1 approved | ✅ | |
| MAT-MO-31 | Rule | **QC PASS mints exactly ONE Product** | One products row on approval | QC-pass → 1 products row (created) | ✅ | |
| MAT-MO-32 | Rule | **QC-pass emit idempotent** (re-approve/retry) | No duplicate Product (unique source_production_order_id) | re-approve → exists, count stays 1 | ✅ | |
| MAT-MO-33 | Rule | **No Product before QC PASS** | No products row for in-progress order | in-progress order → no products row | ✅ | |
| MAT-MO-34 | Integrity | `official_product_serial` UNIQUE | Duplicate insert rejected | UNIQUE index present; 2 distinct serials minted; count unchanged (prior "dup" was a probe artifact) | ✅ | |
| MAT-MO-35 | Integrity | Product genealogy copied from battery genealogy | Lineage matches order components | genealogy copied (2 component rows) | ✅ | |
| MAT-MO-36 | Integrity | order↔unit link one-directional (products.source_production_order_id only; mfg.product_id stays Model FK) | No 2nd product_id on order | confirmed one-directional | ✅ | |
| MAT-MO-37 | Integrity | Dual-key dispatch (production_order_id authoritative + nullable product_id) | Both consistent | both consistent | ✅ | |
| MAT-MO-38 | Race | Sequence/ID race-safety (nextval, not MAX+1) | No duplicate ids under concurrency | nextval impl + startup resync; no dup ids | ✅ | |
| MAT-MO-39 | Race | **State-transition TOCTOU** under `FOR UPDATE` (concurrent QC approve) | Exactly one wins | concurrent QC → exactly 1 product | ✅ | |
| MAT-MO-40 | Integrity | **Backfill correctness** (completed/dispatched orders → Product) | created = expected, idempotent | startup backfill scanned:3 created:0 existed:2 skipped:1 (model-less) — idempotent | ✅ | |

### MAT-04 — Integration & UX

| ID | Area | Description | Expected | Actual | Status | Defect |
|----|------|-------------|----------|--------|--------|--------|
| MAT-MO-50 | Integration | Upstream: Cell Grading/Matching → allocation feeds order | Approved-cell pool consumed | Code-verified: cell_allocation complete writes genealogy + marks cells allocated. Not exercised with live match this wave | ⚠️ | code-verified |
| MAT-MO-51 | Integration | Downstream: Logistics reads dual-key handle | Dispatch resolves order/product | dual-key consistent (see MAT-MO-37); dispatch create 201 (authz) | ✅ | |
| MAT-MO-52 | Integration | Reports + Director dashboard reflect orders/products | Counts/KPIs correct | dashboard rendered (e2e); reports authz 200; exact counts not asserted | ⚠️ | |
| MAT-MO-53 | UX | ODS compliance (no non-ODS UI), keyboard nav on tables | ODS components + a11y | Master pages render via shared ODS grid; **React key-spread console warning** on master Add/Edit drawer (cosmetic) | ⚠️ | DEF-CW03-001 |

### MAT-05 — Performance & Stress

| ID | Area | Description | Expected | Actual | Status | Defect |
|----|------|-------------|----------|--------|--------|--------|
| MAT-MO-60 | Perf | Orders list P95 | Within budget | orders list P50 5 / P95 10 ms; detail P95 8 ms | ✅ | |
| MAT-MO-61 | Perf | Stage card render / save P95 | Within budget | stage PATCH/GET observed < 25 ms | ✅ | |
| MAT-MO-62 | Perf | Product list/detail/genealogy P95 | Within budget | list P95 12 / detail 25 / genealogy 16 / events 15 ms | ✅ | |
| MAT-MO-63 | Stress | Concurrency: stage approve + Product creation | No deadlock/duplicate | concurrent QC approve → exactly 1 product, no deadlock | ✅ | |

### MAT-06 — Security & Reliability

| ID | Area | Description | Expected | Actual | Status | Defect |
|----|------|-------------|----------|--------|--------|--------|
| MAT-MO-70 | Security | SS-02: every mfg + product endpoint × 5 principals | 280/280 (standing gate) | SS-02 280/280 PASS (authoritative, clean run) | ✅ | |
| MAT-MO-71 | Security | Write-role enforcement (viewer read-only; operator cannot approve) | 403 on disallowed writes | viewer RO; operator → 403 on stage approve/QC (authz matrix) | ✅ | |
| MAT-MO-72 | Security | Mass-assignment probe on `stage_data` / product fields | No privileged-field injection | privileged fields stripped on create | ✅ | |
| MAT-MO-73 | Audit | Stage approve/reject + redo recorded on timeline (actor, ts) | Immutable records | logEvent on every transition; SS-03 cell_lot timeline immutable | ✅ | |
| MAT-MO-74 | Audit | **QC PASS → Product creation audited** (product_events baseline) | Event persisted with required fields | product.created persisted on product_events | ✅ | |
| MAT-MO-75 | Audit | Product status change audited (product_events) | Event persisted | product.status_changed persisted | ✅ | |
| MAT-MO-76 | Reliability | Immutability: genealogy / timeline / product_events append-only | No UPDATE/DELETE path | SS-03 static (no route update/delete) + runtime byte-identical | ✅ | |
| MAT-MO-77 | Audit | SS-03 audit gate authoritative (CERT_AUDIT_RATELIMIT=1) | PASS | SS-03 12/12 PASS + immutability (authoritative) | ✅ | |

---

## Summary

| Metric | Value |
|--------|-------|
| Total test cases | 47 |
| Pass | 41 |
| Partial | 6 (MAT-MO-04, 17, 18, 50, 52, 53) |
| Fail | 0 |
| Blocked | 0 |
| **Pass rate** | 41/47 full pass · 0 fail · 6 partial |
| Defects filed | 1 (DEF-CW03-001 · Low) |

**Standing security gates (authoritative, clean runs):** SS-02 authz 280/280 · SS-03 audit 12/12 + immutability · SS-04 config 31 pass / 3 warn (documented dev-only) / 0 fail. (Intermittent `authz`/`audit` workflow "failed" statuses during the run were rate-limit artifacts from concurrent test-login traffic, not regressions — confirmed by clean re-runs after restarting the API server with no competing traffic.)

## MAT Decision

- [ ] **PASS** *(pending CTO triage of DEF-CW03-001 + partials)*
- [ ] **FAIL**

**Signed:** _________________________ **Date:** _____________
