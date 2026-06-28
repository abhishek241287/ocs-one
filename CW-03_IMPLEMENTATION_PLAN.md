# CW-03 Implementation Plan — Manufacturing Orders (Product-Platform-based)

| Field | Value |
|-------|-------|
| **Wave** | CW-03 — Manufacturing Orders |
| **Type** | **Implementation + Certification** wave (Product Platform built first, then Manufacturing refactored to consume it, then certified) |
| **Revision** | **v2 — supersedes v1.** Revised per **CTO Decision — Revised CW-03 Implementation Plan (2026-06-28)** |
| **Prepared** | 2026-06-28 |
| **Status** | **Draft for CTO review — NO implementation begins until this revised plan is approved** |
| **Implements (frozen architecture)** | Unified Product Platform v1.0 (incl. Refinement v1.0 four-concept + v1.1 unified serial / QC-gate freeze) |
| **Consumes (frozen platforms, unmodified)** | ECF v1.0 · Security Standards SS-01…04 · ODS · Certification Framework v1.0 |
| **Mantra** | Do not assume. Measure. Verify. Document. |

> **What changed from v1.** v1 recommended certifying the *existing* battery-only module as-is and
> deferring the Product Platform. **The CTO overruled the sequencing:** because Manufacturing is the
> first workflow that creates a finished product, the **Product Platform must exist before Manufacturing
> certification**. The frozen Product Platform implementation therefore becomes **Phase 0 of CW-03**.
> This is **implementation of an already-approved, frozen architecture — not a redesign and not a scope
> extension.**

---

## 1. CTO-Directed Roadmap

```
CW-03
  Phase 0.1  Implementation Impact Report     (PLANNING ONLY — migration/API/UI/test/effort/risk/rollback)  ← CTO approval gate
     ↓                                          ░░ NO database migrations or production code before this is approved ░░
  Phase 0    Implement Product Platform        (frozen architecture v1.0 — build exactly as approved)
     ↓
  Phase 1    Manufacturing Orders              (refactor to CONSUME the Product Platform; workflow unchanged)
     ↓
  Phase 2    QC Integration                    (Product created ONLY at QC PASS — the single creation gate)
     ↓
  Phase 3    Manufacturing Certification       (MAT-01 → MAT-06 against the Product-based module)
     ↓
  Phase 4    Freeze CW-03                       (official baseline for Packing/Dispatch/Dealer/Inventory/Reports/Director)
```

Each phase is **strictly additive** (no certified table renamed/removed) and is gated. **Phase 0.1 is a
pure-planning gate (CTO directive, 2026-06-28): the detailed Implementation Impact Report
(`CW-03_PHASE-0.1_IMPACT_REPORT.md`) must be reviewed and approved before *any* database migration or
production code is written.** Implementation of each subsequent phase begins only after that approval;
certification (Phase 3) runs the standard Batch-MAT cycle with a CTO triage/approval gate per MAT phase.

---

## 2. The one distinction that governs this wave

**Implementing a frozen *architecture* is allowed and is the whole point of CW-03. Modifying a frozen
*platform framework* is not.**

| Allowed in CW-03 (build) | NOT allowed in CW-03 |
|--------------------------|----------------------|
| Create the new Product Platform tables/enums/routes/UI **exactly per the frozen UPP v1.0 design** | Changing the UPP architecture (new concepts, renamed tables, altered four-concept model) |
| **Additive** changes to certified modules per the frozen plan (nullable `product_id` on dispatch; QC-pass emit hook) | Any **breaking** change to certified Manufacturing/Logistics (drop columns, change the `production_order_id` key) |
| **Adopting** ODS / ECF / Security Standards / Cert Framework for the new surface (matrix rows, ODS components) | **Changing** ODS / ECF / Security / Cert framework code (those stay frozen v1.0) |

If any framework genuinely needs a change to support this, that is a **defect-driven** event (Critical /
High / security) handled under the freeze exception — not a routine part of the build.

---

## 2.1 Implementation Principles (CTO-locked, 2026-06-28)

These seven principles are **binding** for the entire wave and resolve every identity ambiguity. They are
not goals to interpret — they are constraints to obey.

1. **Product Model is permanent.** `master_products` is **always** the Product **Model (SKU)** master. It
   **never** becomes the serialized Product table.
2. **Manufacturing Order is the Work Order.** `mfg_production_orders` **always** remains the
   manufacturing/work-order record. It **never** becomes the Product record.
3. **Product is created exactly once,** and its **only** creation trigger is **QC PASS**. Never before.
4. **Product owns the link.** The Product carries the reference to its work order
   (`products.source_production_order_id`). **Do not** add any serialized-Product reference back inside
   `mfg_production_orders` (its existing `product_id` is the Model FK and stays that way).
5. **Manufacturing workflow is unchanged** — Receiving → Matching → Assembly → Testing → QC →
   *Product Creation*. The stages themselves do not change in CW-03; **only the final output changes**
   from "finished manufacturing order" to "finished **Product**."
6. **Downstream → Product identity, additively.** Packing/Dispatch/Dealer/Inventory/Reports/Director will
   ultimately consume the **Product** identity. During CW-03 an **additive** migration is acceptable and
   **dual references may temporarily co-exist internally**; the final public architecture after CW-03
   certification exposes **Product as the primary downstream identity**.

   > **Reconciliation (needs CTO confirmation — decision D4).** Principle 6 and "downstream repoint is out
   > of CW-03" are reconciled by separating two layers: **(a) the Product identity layer** — the
   > serialized Product is created, canonical, and **exposed as the primary identity at the API boundary**
   > by the CW-03 freeze; and **(b) per-module internal authoritative-key repoint** — each downstream
   > module (Packing/Dispatch/Dealer/Inventory/Reports/Director) switches its *internal* authoritative FK
   > from `production_order_id` to `product_id` **in its own subsequent certification wave** (UPP Phase 4).
   > Thus at CW-03 freeze Product is the canonical/primary **exposed** identity while internal dual-refs
   > persist until each downstream module is re-certified. **D4 confirms this interpretation** (vs. pulling
   > the full internal repoint into CW-03, which would enlarge scope and touch certified modules
   > non-additively).
7. **Phase 0.1 gate.** Before any implementation code, produce and get approval on the Implementation
   Impact Report (§ below / `CW-03_PHASE-0.1_IMPACT_REPORT.md`).

---

## 2.2 Business Identity vs Migration Strategy (CTO clarification, 2026-06-28 — CONFIRMS D4)

This is the single rule that prevents confusion between **business architecture** (what an entity *is*)
and **migration strategy** (how we get there in code). They are not the same and must never be conflated.

| | **Business Architecture** (durable, canonical) | **Migration Strategy** (temporary, implementation detail) |
|---|---|---|
| **Finished-item identity** | **The `Product`** is the official **business identity** of every finished item, effective from the end of CW-03 certification. | — |
| **`production_order_id`** | **NOT a business identity.** | An internal reference that **may temporarily remain** where technically necessary during the additive migration. |
| **`mfg_production_orders`** | The **manufacturing / work-order record only** — never the finished-item identity. | — |
| **Downstream** (Packing · Dispatch · Dealer · Inventory · Reports · Director) | **Designed around the `Product` identity.** | May read `production_order_id` internally during transition; this is plumbing, not architecture. |

**Rules that follow:**
- From the close of CW-03, **the `Product` is the canonical identity**; every downstream module is
  *architecturally* designed around it.
- `production_order_id` (and any other internal cross-reference that lingers) is an **implementation
  detail**, not a business concept. Its temporary presence does **not** make the Manufacturing Order a
  business identity, and does not weaken the Product-as-identity rule.
- The **per-module internal FK repoint** to `product_id` is sequenced **per downstream module in its own
  later certification wave** (UPP Phase 4) — but the *business* decision (Product = identity) is **fixed
  now**, not deferred. Migration timing ≠ architecture.

> **Plain English:** after CW-03, when the business asks "what is this finished item?", the answer is its
> **Product** (serial). "Which work order built it?" is answered by the Manufacturing Order. The fact that
> some tables still join on `production_order_id` for a while is a migration convenience, nothing more.

---

## 3. Phase 0 — Product Platform Foundation

Build the frozen Product Platform v1.0 **exactly as approved**. Deliver only the approved concepts:
**Product Categories · Product Workflows · Product table · Unified Product Serial · Product creation at
QC PASS · Product genealogy.** No additional concepts, no architecture change, no scope extension.

### 3.1 Database (additive only — verified against current schema)

New tables / enums:
- `product_categories` (Category Master) — seed **Battery Pack · Inbuilt Lithium Inverter · Hybrid Inverter** (data; only Battery Pack is *exercised* in CW-03).
- `product_workflows` (Workflow Master) — `code`, `name`, `stage_sequence` (jsonb), `status`. Seed **BATTERY** (active). `INBUILT_LITHIUM`/`HYBRID` rows are **reserved data, not wired to any engine** (the workflow-driven engine is UPP Phase 3 — out of CW-03; see §3.5).
- `products` (serialized **unit** identity) — `id`, `category_id` → `product_categories`, `model_id` → `master_products`, `workflow_code` → `product_workflows`, **`source_production_order_id` → `mfg_production_orders` (nullable)**, `official_product_serial` (UNIQUE, NOT NULL), `serial_source` enum (`OCS|MANUFACTURER`), `qc_status`, `product_status`, `current_location`, `dealer_id` → `logistics_dealers`, timestamps. **No manufacturer/brand column** (derived per frozen design).
- `product_genealogy` (category-aware lineage keyed by `product_id`) — generalization of `mfg_battery_genealogy`.
- `product_events` (append-only Product audit timeline).
- `product_category` / `product_status` enums per the frozen field list (lifecycle ends at `delivered_to_dealer`; future states reserved, not added).

Additive nullable columns on certified tables (none renamed/removed):
- `master_products.category_id` → `product_categories` (the existing free-text `category` stays; backfilled, retired only post-cert).
- `logistics_dispatch_items.product_id` → `products` (**dual-key**: existing UNIQUE `production_order_id` stays authoritative through CW-03).

> **⚠ Naming-collision caveat (verified).** `mfg_production_orders` **already has** a `product_id` column
> that points to `master_products` (the **Model/SKU**). The order→serialized-unit link must therefore
> **NOT** add another `product_id` to the order — it lives as **`products.source_production_order_id`**
> (order ← product), exactly per the frozen D1 diagram. This is the §6.1 model-vs-unit resolution made
> concrete; document the semantic in the schema so no one confuses the two.

### 3.2 Unified serial (frozen v1.1)

One authoritative `official_product_serial` (UNIQUE) + `serial_source` provenance. **BATTERY → OCS**
(reuse the existing `mfg_battery_seq` pattern; `serial_source=OCS`). `MANUFACTURER` source is reserved
for future inverter workflows (validate present+unique) — **not exercised in CW-03**. Downstream uses
only `official_product_serial`, never `serial_source`. Component serials live in `product_genealogy`.

### 3.3 API + codegen + UI

- New `/api/products` (list/get, `GET /products/{id}/genealogy`, guarded `POST /products/{id}/status`),
  authored in the **OpenAPI spec first**, then `pnpm --filter @workspace/api-spec run codegen`
  regenerates hooks + Zod (no manual client edits).
- New `/api/masters/product-categories` and `/api/masters/product-workflows` (read + director-managed).
- ODS Product views (list, detail, genealogy) — reuse ODS components; **no new UI pattern outside ODS**.
- **Idempotent backfill**: create a `products` row for every existing **completed/dispatched** battery
  order so downstream has a Product to point at (reconciliation count + audit trail).

### 3.4 Security adoption (no framework change)

Every new endpoint files an **SS-01** row (`docs/security-matrix.md`), joins the **SS-02** authz matrix
(`lib/authz-matrix.ts`) × 5 principals, registers any audited op in the **SS-03** audit matrix, and is
covered by **SS-04** config checks. This is *adoption* of the frozen Security Standards. The new
`product_events` append-only store interacts with the **SS-03 audit decision** in §6.4.

### 3.5 Phase 0 scope guards (explicit OUT)

- **No workflow-driven stage engine** (UPP Phase 3) — the manufacturing stage engine stays the hardcoded
  9-stage BATTERY chain. `products.workflow_code` simply references the seeded BATTERY row.
- **No INBUILT_LITHIUM / HYBRID** manufacturing; **no `master_inverters`** behavior.
- **No downstream repoint** (UPP Phase 4) and **no legacy removal** (UPP Phase 5).
- **No ECF expansion**; product *correction* routes are not built in CW-03 (see §7 ECF row).

> **Scope clarifications for CTO at the approval gate** (small, flagged rather than silently chosen):
> (a) `master_manufacturers` (frozen v1.1 manufacturer master) is **not** in the CTO Phase 0 list and is
> not needed for BATTERY (all OCS) — **recommend deferring** it to the future inverter/normalization wave
> (PP-005). (b) Confirm `INBUILT_LITHIUM`/`HYBRID` are seeded as **reserved data only** (not active).

---

## 4. Phase 1 — Manufacturing Orders consume the Product Platform

- The manufacturing **workflow is unchanged** — same 9 stages, same guards, same operator UX.
- The **only** architectural change: Manufacturing **no longer owns a finished-product identity**.
  Where the system previously treated the `mfg_production_orders` row (`battery_number`) as the finished
  unit, the finished identity is now the **Product** created at QC PASS (Phase 2).
- `logistics_dispatch_items` begins carrying the additive nullable `product_id` (dual-key); the existing
  `production_order_id` UNIQUE key remains authoritative for CW-03 (downstream repoint is future).
- BATTERY manufacturing behaviour stays **byte-identical** except for the new QC-pass emit hook.

---

## 5. Phase 2 — QC Integration (the single creation gate)

- A `products` row is created at **exactly one point: the `quality_control` stage `approved` (QC PASS)**.
- **Permanent rule enforced: No Product before QC PASS.** Work-in-progress stays in
  `mfg_production_orders`/`mfg_order_stages`; downstream sees only post-QC Products.
- The QC-pass hook runs **inside the existing approval transaction** so the Product row, the
  **order↔unit link (`products.source_production_order_id` only)**, the `product_events` baseline, and
  the module audit event all commit atomically. **`mfg_production_orders.product_id` is NOT touched — it
  remains the Model/SKU FK (§3.1 naming-collision contract). The serialized link is one-directional:
  product → order.**
- **Idempotent**: re-approval / retry must not create duplicate Products (unique on
  `source_production_order_id` for OCS-emitted battery products).

---

## 6. Phase 3 — Manufacturing Certification (MAT-01 → MAT-06)

Certify the **Product-based** Manufacturing module using the frozen 6-phase taxonomy and the Batch-MAT
cycle (run the whole phase → collect all findings → classify severity × module/platform → CTO approval
→ fix Crit/High/Med together → re-run full phase → close gate). No per-defect loops.

### 6.1 Phase focus

| Phase | Focus (now includes the Product surface) |
|-------|------------------------------------------|
| MAT-01 Page & Navigation | Orders list, Battery Workspace, Charging/Testing dashboards, Digital Passport, **+ Product list/detail/genealogy** |
| MAT-02 Functional | Order/stage lifecycle, charger, rework, QC; **+ Product CRUD-read, status transitions, masters**; 10-point scorecard; RBAC |
| MAT-03 Business-Rule & Data Integrity | Stage-sequence guard, **QC-gate → exactly one Product (idempotent)**, serial uniqueness, dual-key dispatch integrity, genealogy correctness, sequence/ID race-safety, **state-transition TOCTOU under `FOR UPDATE`**, **backfill correctness** |
| MAT-04 Integration & UX | Upstream (Cell Grading/Matching) + downstream (Logistics dual-key, Reports, Director) agreement on the Product handle; ODS UX/keyboard |
| MAT-05 Performance & Stress | P95 budgets incl. Product list/detail/genealogy and the QC-pass emit; concurrency on stage approve + Product creation + charger reservation |
| MAT-06 Security & Reliability | SS-02 (every mfg **and** product endpoint × 5 principals) / SS-03 / SS-04 standing gates; module probes (mass-assignment on `stage_data`/product fields, immutable genealogy/timeline/`product_events`) |

### 6.2 Fixtures & teardown (standard)

Prefix every fixture `CW03-CERT-…`; set-based teardown by prefix; break FKs before parents; assert **0
residual** across **every** written table — now including the new `products`, `product_genealogy`,
`product_events` (and seeded `product_categories`/`product_workflows` left intact as config) alongside
the full `mfg_*` set, touched `cells`/`cell_matches`, `logistics_dispatch_items.product_id`, and any
`engineering_corrections` rows.

### 6.3 Evidence

Fill `certification/CW-03-Manufacturing-Orders/` (`MAT.md`, `Defects.md`, `Performance.md`,
`Integration.md`, `UAT.md`, `Certification.md`) + `PROJECT_STATUS.md`, using the canonical CW-02 templates.

### 6.4 SS-03 audit decision (CTO branch — resolve before MAT-06)

Manufacturing audits via `mfg_battery_timeline`; the new Product surface audits via `product_events`.
**Neither is in `audit-matrix.ts` today.** Decide per SS-01 which critical operations are "audit
required" (stage approve/reject, **QC PASS → Product creation**, rework open, product status change),
then choose:
- **Option A — extend SS-03** (`audit-matrix.ts` + teach `audit-suite.ts` about `mfg_battery_timeline`
  and `product_events` as additional append-only stores). This changes the SS-03 harness, permitted
  **only** under the **High / security-defect** freeze exception. **Requires explicit CTO authorisation.**
- **Option B — scope-limited audit evidence (no framework change)** — certify audit by **direct MAT-06
  evidence** (assert each critical op writes the correct immutable record), document the matrix gap, and
  **backlog** the SS-03 extension (CF / SEC).
- **Recommendation:** Option B unless the gap is classified High/security. Note: because **Product
  creation at QC PASS** is a brand-new critical operation, MAT-06 must verify it is audited regardless of
  Option chosen.

---

## 7. Phase 4 — Freeze CW-03

Freeze the Product-based Manufacturing module as the **official baseline** that Packing, Dispatch,
Dealer, Inventory, Reports, and the Director Dashboard will consume (in their own future waves) via a
single Product identity. Deliver the standard freeze package: `CW-03_CERTIFICATION_REPORT.md`,
`CW-03_FREEZE_NOTICE.md`, CTO Approval Record `CW-03-APR-001`; update `certification/README.md`
(CW-03 → 🔵 Certified, 3/8 = 37.5%), `docs/platform-scorecard.md` (**Product Platform earns its first
scorecard row** — adoption: 1 module = Manufacturing; PP-006), `CHANGELOG.md`.

---

## 8. Frozen-platform consumption (no framework modification)

| Platform | How CW-03 uses it | Framework modified? |
|----------|-------------------|---------------------|
| **Unified Product Platform v1.0** | **IMPLEMENTED** exactly as frozen (Phases 0–2 = UPP Phases 1–2; UPP Phases 3–5 remain future). Architecture itself unchanged. | No (architecture is built, not redesigned) |
| **ECF v1.0** | **Factual today: Cell Grading is the only ECF consumer; manufacturing has no ECF integration.** CW-03 builds Product *creation*, not *correction* — no product-correction route, so ECF integration is **not triggered** in CW-03 (reserved future per the mandatory-integration rule). Whether Product creation writes an ECF `recordOriginal` baseline is a Phase 0 design point per the frozen products↔ECF design; flagged, not assumed. | None |
| **Security Standards SS-01..04** | New product + masters endpoints adopt SS-01..04 (matrix rows × 5 principals). SS-03 per §6.4. | None |
| **ODS** | All new Product UI uses ODS; MAT-04 verifies compliance. | None |
| **Certification Framework v1.0** | Standard taxonomy, canonical templates, harness, scorecards, freeze package. | None |

---

## 9. Dependencies & Integration

| Direction | Module | Integration point |
|-----------|--------|-------------------|
| Upstream | Cell Grading / Matching (CW-02 certified) | `cell_match_id`, approved-cell pool, allocation |
| Internal | QC gate | QC PASS → Product creation (single gate) |
| Downstream | Logistics / Dispatch (certified) | dual-key `production_order_id` (authoritative) + nullable `product_id` |
| Downstream | Reports & Director Dashboard | aggregate production orders / stages; Product-aware reads land in future waves |
| Platform | ECF | reserved for future Product corrections |

---

## 10. Risks

| # | Risk | Sev | Mitigation |
|---|------|-----|------------|
| C3-R1 | **Model-vs-unit `product_id` collision** on `mfg_production_orders` (existing → model) | **High** | Link lives on `products.source_production_order_id`; never add a 2nd `product_id` to the order; document semantic (§3.1) |
| C3-R2 | **QC-pass emit not atomic / not idempotent** → orphan or duplicate Products | **High** | Emit inside the approval tx; unique on `source_production_order_id`; MAT-03 idempotency + concurrency probes |
| C3-R3 | **Regression on certified Manufacturing/Logistics** from additive changes | **High** | Additive-only; BATTERY byte-identical except emit hook; dual-key dispatch; full SS-02/03/04 + MAT re-run |
| C3-R4 | **SS-03 coverage gap** (mfg + new `product_events` absent from audit-matrix) | **High** | §6.4 decision before MAT-06; QC-pass-creation audit verified regardless |
| C3-R5 | **Backfill correctness** for existing battery orders | Med | Idempotent script + reconciliation count + audit trail; MAT-03 assertion |
| C3-R6 | **Serial uniqueness** across OCS-generated space | Med | UNIQUE `official_product_serial`; reuse `mfg_battery_seq` pattern; MAT-03 probe |
| C3-R7 | **Scope creep into UPP Phase 3+** (workflow engine, INBUILT/HYBRID, downstream repoint) | Med | Hard guards §3.5; ideas → PP backlog |
| C3-R8 | **Stateful multi-stage TOCTOU** (stage approve / charger reservation) | Med | MAT-03 concurrency; re-check inside tx under `FOR UPDATE` |
| C3-R9 | Default-mode SS-03 false-negative from prior flood | Low | Authoritative mode (`CERT_AUDIT_RATELIMIT=1`) is the gate (SEC-001) |

Any framework improvement discovered → appropriate backlog (CF / SEC / ECF / PP / MEB), not built.

---

## 11. Metrics (standard per-wave set)

Defects by severity · defects by class (module vs platform) · open Crit/High/Med at cert (must be 0) ·
carried-forward · certification duration · regression suite results (SS-02/03/04) · automated assertions
· **platform adoption (Product Platform: 0 → 1 module)** · documentation completeness · **residual
fixture count (must be 0)** · backfill reconciliation (created = expected) · automation %.

---

## 12. Deliverables & Exit Criteria

**Build deliverables (Phases 0–2):** new schema (pushed) + codegen output; `/api/products` + masters
routes; QC-pass emit hook; ODS Product UI; seeds (categories + BATTERY workflow); idempotent backfill;
SS-01/02 matrix rows for new endpoints.

**Certification deliverables (Phases 3–4):** filled CW-03 evidence set + `PROJECT_STATUS.md`;
`CW-03_CERTIFICATION_REPORT.md`; `CW-03_FREEZE_NOTICE.md`; `CW-03-APR-001`; updated README index,
scorecard (Product Platform row), changelog.

**Exit criteria (standard 11):** Product Platform built per frozen design; Manufacturing consumes it;
Product created only at QC PASS; MAT-01→06 all PASS; 0 open Crit/High/Med; typecheck 0; lint 0;
SS-02/03/04 green (authoritative); integration verified; performance within budget; fixtures torn down
to 0 residual; backfill reconciled; UAT signed; CTO certification decision recorded.

---

## 13. Sequencing & Approval Gate

1. **CTO reviews & approves this revised plan AND records the three decisions below.** **No
   implementation — no schema, no code, no platform change — begins before this approval.**

   **Explicit CTO decision gate — RESOLVED 2026-06-28 (Phase 0.1 approved; implementation may begin):**
   - [x] **D1 — `product_id` linkage contract:** **CONFIRMED.** `mfg_production_orders.product_id` stays
         the **Model/SKU FK**; the serialized order↔unit link is **only** `products.source_production_order_id`
         (one-directional product → order). (Plan §2.1 Principle 4.)
   - [x] **D2 — `master_manufacturers` in Phase 0:** **DEFERRED** to the inverter/normalization wave
         (PP-005) — not needed for BATTERY (all OCS); additive to add later. Proceeding on the approved
         recommendation.
   - [x] **D3 — SS-03 audit path:** **Option B** (documented MAT-06 audit evidence + backlog the matrix
         extension). **Owner:** implementing engineer (main agent). **Target:** CW-03 MAT-06. QC-PASS
         Product-creation audit is verified in MAT-06 regardless. (Re-classify to Option A only if MAT-06
         finds a High/security gap.)
   - [x] **D4 — Business identity vs migration strategy:** **CONFIRMED by CTO** — see §2.2. Product is the
         canonical business identity from CW-03 close; `production_order_id` is a temporary implementation
         detail; per-module internal repoint is sequenced in later downstream waves (UPP Phase 4).
2. **On plan approval → Phase 0.1: produce `CW-03_PHASE-0.1_IMPACT_REPORT.md`** (migration sequence, API
   contract changes, UI impact map, test impact map, effort estimate, risk assessment, rollback strategy).
   **This is planning only — still no migrations, no production code.**
3. **On Phase 0.1 approval → implementation begins:** Phase 0 build → Phase 1 → Phase 2 → pre-wave
   checklist → Phase 3 (Batch-MAT, per-phase CTO gate) → Phase 4 freeze.
4. UPP Phases 3–5 (workflow engine, INBUILT/HYBRID, downstream repoint, legacy removal) remain **future**
   manufacturing-capability waves.

> CW-03 **implements the frozen Unified Product Platform architecture** and **consumes ECF / ODS /
> Security Standards / Certification Framework without modifying them**. All changes to certified modules
> are **additive** per the frozen phased plan. No production code or schema change begins until this
> revised plan is approved.

---

## 14. Assumption Ledger (true today → after CW-03)

| # | Topic | Today (before CW-03) | After CW-03 (built/certified) | Still future (NOT CW-03) |
|---|-------|----------------------|-------------------------------|--------------------------|
| A1 | Product identity | Finished unit = `mfg_production_orders` row (`battery_number`) | **Serialized `products` identity emitted at QC PASS (BATTERY)** | Inverter products |
| A2 | Categories/Workflows | None | `product_categories` + `product_workflows` built; BATTERY active | INBUILT/HYBRID active, ESS/EV/BMS |
| A3 | Stage engine | Hardcoded 9-stage BATTERY chain | **Unchanged** (still hardcoded) | Workflow-driven engine (UPP P3) |
| A4 | Serial | `PO-…`/`BAT-…` sequences | `official_product_serial` + `serial_source` (OCS for BATTERY) | MANUFACTURER serials (inverters) |
| A5 | Downstream key | `production_order_id` (UNIQUE) | dual-key: + nullable `products.product_id` on dispatch | Repoint downstream to `product_id` (UPP P4); legacy removal (P5) |
| A6 | ECF | Cell Grading only | Unchanged (product *correction* not built) | Manufacturing/Product ECF adoption |
| A7 | SS-03 audit | mfg via `mfg_battery_timeline`; no matrix entries | + `product_events`; §6.4 decision (A or B) | Full SS-03 matrix coverage if Option B |
| A8 | Manufacturer | Free-text on masters | Unchanged (recommend defer master) | `master_manufacturers` normalization (PP-005) |
