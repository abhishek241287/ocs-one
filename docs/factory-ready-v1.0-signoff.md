# OCS One — Factory Ready v1.0 Sign-Off

| Field | Value |
|---|---|
| **Release Name** | Factory Ready v1.0 |
| **Release Date** | 01 July 2026 |
| **Architecture Version** | Platform v1.0 (Frozen) |
| **Document Version** | 1.0 |
| **Status** | Released |

**Document type:** Formal release & readiness sign-off (documentation only — no code, schema, or
API changes). **Product:** OCS One — Manufacturing ERP, OCS Oorja Green Pvt. Ltd.
**Prepared for:** CTO approval / Factory Ready v1.0 gate.

> **Supersedes** `docs/factory-readiness-report-v1.0.md` (the earlier point-in-time readiness
> report, ~57%). That report's blocking gaps — imported-product creation (G1), customer
> registration (G3), warranty (G4), and post-sale support (G5) — have since been built and
> frozen. This sign-off reflects the **current** verified implementation.

---

## 1. Architecture Principles

These principles explain **why** OCS One is designed the way it is; every module conforms to them.

- **Single Source of Truth** — the Product Platform is the only serialized-product repository.
- **Append-Only Ledger** — inventory quantities are never overwritten; state is a signed-sum
  projection of immutable transactions.
- **Configuration over Hard Coding** — business rules (workflows, creation triggers, posting
  actions, grade thresholds) are configuration-driven wherever possible.
- **Immutable Commercial Documents** — posted/approved business documents are never edited.
- **Product Traceability First** — every serialized product remains fully traceable across its
  entire lifecycle.

---

## 2. Module readiness

| # | Module | Status | Ready | Basis |
|---|---|:--:|:--:|---|
| 1 | Masters | ✅ | Yes | Shared config-driven master CRUD (products, BMS, cells, chargers, connectors, cables, busbars, cabinets, suppliers, dealers); 23505→409 / 23503→400 handled centrally; active-filter on pick lists |
| 2 | Procurement (Suppliers) | ✅ | Yes | Supplier master + supplier-driven GRN header (exactly one supplier per GRN) |
| 3 | GRN (Goods Receipt Note) | ✅ | Yes | Draft→post, workflow-driven posting engine (mandatory workflow assignment, 422 on unassigned), posted GRN read-only, append-only inventory ledger |
| 4 | Incoming Inspection | ✅ | Yes | Line-by-line accept/reject after post; never mutates GRN receipt data; signed ledger moves (release/accept/reject); one inspection per GRN (in-tx + UNIQUE) |
| 5 | Inventory | ✅ | Yes | Signed append-only `inventory_transactions`; on-hand = SUM projection by material × stock state; never overwritten |
| 6 | Material Issue Note (MIN) | ✅ | Yes | Issued qty must **exactly** equal approved BOM qty (422 on mismatch); consumption posting; TOCTOU-safe |
| 7 | Manufacturing | ✅ | Yes | Full stage lifecycle (cell alloc → assembly → compression → BMS install/program → charging → testing → QC → packing); stage cards; sequence-generated order/battery IDs |
| 8 | QC | ✅ | Yes | QC-approval stage (approve/reject); Product minted at QC PASS |
| 9 | Product Platform | ✅ | Yes | Serialized Product single source of truth; official serial + genealogy + append-only `product_events`; workflow-driven creation trigger; FROZEN v1.0 |
| 10 | Imported Product Registration | ✅ | Yes | Separate manual path for imported inverters; category-driven serial provenance (OCS `LIV-…` mint vs OEM serial capture, dup-guarded); FROZEN v1.0 / Factory Ready |
| 11 | Packing | ✅ | Yes | Atomic batch `ready_for_packing`→`packed`; FOR UPDATE lock; immutable `product.packed` event |
| 12 | Dispatch | ✅ | Yes | Immutable dispatch document (`DIS-YYYYMMDD-NNNNNN`), unique invoice, dealer validation, mandatory-reason reversal (one per dispatch); printable Dispatch Note |
| 13 | Customer Registration | ✅ | Yes | Customer/ownership registration keyed to the official serial (list/detail/create) |
| 14 | Warranty | ✅ | Yes | Per-serial warranty + warranty-service handling (list/detail/create) |
| 15 | Product Traceability | ✅ | Yes | Genealogy + event-timeline projection over the Product Platform |

**Also production-grade (supporting):** Director Dashboard, Security Dashboard, Configuration
Dashboard, Dealer Portal, Product Inventory (read-only reporting layer).

---

## 3. Quality & governance basis for sign-off

- **Authorization (SS-02)** — every protected endpoint × 5 principals verified by an automated
  regression suite driven by the single-source authz matrix (suite + dashboard cannot drift).
- **Audit trail (SS-03)** — critical operations verified to persist in the append-only stores
  with immutability proven both statically and at runtime (byte-identical).
- **Configuration integrity (SS-04)** — 34 checks across 12 categories; **GREEN** (0 FAIL;
  documented dev-only WARNs). FAIL = production defect.
- **Endpoint governance (SS-01)** — every endpoint declares auth/role/audit/rate-limit/
  validation/output rules; `docs/security-matrix.md` is authoritative.
- **Concurrency safety** — state transitions (GRN post, inspection, packing, dispatch, MIN,
  order finalize, grade correction) re-check status **inside** a `FOR UPDATE` transaction —
  TOCTOU-safe by design.
- **Immutable commercial documents** — GRN, Inspection, Dispatch Note snapshot referenced
  master data at creation; finalized records (posted GRN, approved BOM, posted MIN, completed/
  cancelled Production Order) are read-only.
- **Platform discipline** — ODS design system, Engineering Correction Framework (ECF), Security
  Standards, and Certification Framework are FROZEN v1.0 and consumed, not extended.

---

## 4. Deferred items (intentional, out of v1.0 scope)

- **Auto-create imported Products on inspection pass** — deliberately manual; the
  `INCOMING_INSPECTION_PASS` trigger is a guarded no-op by CTO decision. An optional
  "auto-create" setting is a future enhancement.
- **Service / RMA expansion** — warranty-service handling exists; a full field-service / RMA
  workflow is post-v1.0.
- **Export Center / report exports** — deferred until after deployment.
- **ECF enhancement backlog** — ECF-001 Attachments, ECF-002 Digital Approval Signatures,
  ECF-003 Multi-level Approval Workflow, ECF-004 NCR/CAPA Integration, ECF-005 External
  ERP/MES Sync (none built during cert waves).
- **Product Platform enhancement backlog** — PP-001…PP-006 (post-certification roadmap).
- **Documentation cleanup** — trimming/reorganizing `replit.md` into `docs/` (deferred to a
  natural pause after the cert cadence).

---

## 5. Out of Scope for Factory Ready v1.0

The following business domains are **explicitly out of scope** for this baseline (they are not
defects or gaps — they are outside the Factory Ready v1.0 charter):

- **Financials** — Finance, GST, Accounting, Payroll
- **Sales/CRM** — CRM
- **Planning** — Production Planning, MRP, APS, AI Scheduling
- **Shop-floor telemetry** — IoT, OEE, Machine Monitoring
- **Analytics** — BI Dashboards

---

## 6. Technical debt (tracked, non-blocking)

- **CSP `style-src 'unsafe-inline'`** — documented temporary exception (Radix/shadcn/Recharts
  inject inline styles at runtime); pending a nonce/hash migration.
- **Static-frontend document CSP** — the API helmet CSP governs API JSON responses only; the
  ocs-one SPA is served as static files, so a static-serving/edge document CSP is a
  recommendation, not yet applied.
- **Product-model spec snapshotting** — `master_products` voltage/capacity are edited through
  the generic master router without a snapshot, so an edit reflects retroactively in older
  Production Orders' read-time views. Legally-binding surfaces (warranty term) are already
  snapshotted, so history is protected. **Backlog observation — intentionally not fixed**
  (per CTO: snapshotting every model field now adds unnecessary complexity).
- **SS-01 numeric-bound sweep** — a repo-wide pass for unconstrained numeric engineering-value
  schemas (bare `number` without `minimum`) remains a follow-up.

---

## 7. Known Operational Constraints

These are **intentional design choices**, not defects.

- **Product Inventory "Quarantined" = 0 (hardcoded)** — no quarantine lifecycle state exists
  (Products are minted only at QC PASS); surfaced for spec completeness. The one reported spec
  deviation.
- **Cert automation harness constraint** — the SS-02 (authz) and SS-03 (audit) suites share the
  application auth rate limiter (20 logins / 15 min). Running them together saturates the limiter
  and produces a **false-red** (back-off / 502 at login), not a product defect. The authoritative
  run restarts the API server and runs each suite **solo**. SS-04 (config) runs clean regardless.
- **Legacy logistics module** (production-order-based vehicle/driver/transporter) is retained
  untouched alongside the Product-Platform dispatch chain; the two coexist by design.
- **Imported product creation is a manual operator action** by design (see §4), keeping
  serialization timing under factory supervision.

---

## 8. Factory Ready Success Criteria

| Criterion | Met |
|---|:--:|
| Manufacturing workflow complete | ✓ |
| Imported product workflow complete | ✓ |
| Inventory fully auditable | ✓ |
| Product genealogy available | ✓ |
| Warranty operational | ✓ |
| No blocking defects | ✓ |
| All critical business documents immutable | ✓ |
| Product traceability verified | ✓ |
| Commercial deployment approved | ✓ (pending this sign-off) |

---

## 9. Future roadmap (post-v1.0)

1. Optional auto-create of imported Products after inspection pass (configurable).
2. Service / RMA workflow over the customer + warranty + serial records.
3. Export Center (documents/reports export).
4. ECF enhancements (ECF-001…ECF-005) and Product Platform backlog (PP-001…PP-006).
5. Security hardening: CSP nonce/hash migration + static/edge document CSP.
6. Inventory depth: material reservation/return/scrap ledger completeness beyond MIN.
7. Documentation refactor (thin `replit.md`; move detail into `docs/`).

---

## 10. Recommendation

The Engineering Team recommends **approval of OCS One Factory Ready v1.0 for controlled
commercial deployment**.

Future development will continue under subsequent versioned releases without modifying the
Factory Ready v1.0 baseline except through approved maintenance releases.

The fifteen core modules are implemented, frozen, and factory-ready. The deferred items,
technical debt, and known operational constraints listed here are **tracked and non-blocking**
for Factory Ready v1.0.

---

## 11. Sign-off

| Role | Name | Decision | Date |
|---|---|---|---|
| CTO | | ☐ Approved  ☐ Rejected | |
| Engineering | | Recommended for approval | 01 July 2026 |

---

> **Governance statement.** This document establishes the **Factory Ready v1.0 baseline**. All
> future enhancements, modules, and architectural changes shall be versioned separately and must
> preserve backward compatibility with this baseline unless explicitly approved as a major
> platform revision.

*No code, schema, or architecture was changed to produce this document.*
