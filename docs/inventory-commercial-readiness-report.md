# Inventory Commercial Readiness Report

**Date:** 2026-06-29
**Scope:** Full Inventory flow — Material Master, Material Categories, Supplier Master, Goods Receipt (GRN), Incoming Inspection, Stock On Hand, Product Inventory.
**Type:** Read-only UAT (commercial readiness for real factory operations). **No code was changed.**
**Method:** Code review (backend routes + engines + Zod/OpenAPI + frontend) cross-checked against **live database reconciliation** (signed-ledger sums, inspection math, orphan/constraint checks).
**Data snapshot caveat:** the live DB currently holds only small cert/smoke data (5 GRNs, 2 materials, 1 supplier, 10 categories, 2 products). Integrity findings are verified against this set; **scale-related findings (pagination, filtering, performance) are projected to commercial volumes**, not yet reproduced.

---

## Verdict

**No Critical defects. No High defects in the transactional core.** The inventory engine — GRN posting, the append-only signed ledger, incoming inspection, and the stock projection — is **transactionally sound and reconciles exactly** against live data. The gaps that exist are around **traceability of master-data changes, reporting completeness, validation hardening, and scale ergonomics** — none block a single GRN/inspection/stock operation today, but several should be closed before high-volume factory use.

| Severity | Count | IDs |
|---|---|---|
| Critical | 0 | — |
| High | 1 | INV-001 |
| Medium | 5 | INV-002, INV-003, INV-004, INV-005, INV-006 |
| Low | 4 | INV-007, INV-008, INV-009, INV-010 |

---

## What was verified CLEAN (live evidence)

These were tested against the live database and **passed** — they are stated so the fix batch does not accidentally "fix" working behavior:

- **Stock reconciliation is exact.** On-hand = `SUM(signed inventory_transactions)` per material × state. Live: `MAT-409TEST available=87, rejected=25; MAT-SMOKE-1 inspection_pending=12`. Every ledger row is correctly signed (releases negative). **No negative buckets exist.**
- **Inspection math balances.** Every inspection line satisfies `accepted + rejected = received`; every line with `rejected > 0` has a non-empty `rejection_reason`. (`INSP-...0001` partial 45/5; `INSP-...0005` 30/0 passed + 20/20 rejected — all correct.)
- **GRN ↔ ledger integrity.** Every posted GRN has its ledger rows; **zero draft GRNs leaked ledger rows**; every GRN carries exactly one supplier.
- **No orphans.** 0 materials with a missing category, 0 GRN lines with a missing material, 0 GRNs with a missing supplier.
- **Duplicate prevention is DB-enforced** (not just app-level): UNIQUE on `grn_number`, `incoming_inspections.grn_id` (one inspection per GRN), `incoming_inspections.inspection_number`, `incoming_inspection_lines.grn_line_id` (a line can't be inspected twice), `material_workflow_assignments.category_id`, and `code` on all three masters.
- **Workflow-assignment coverage is 100%** (10/10 categories assigned) — no material would hit the mandatory-assignment 422 today.
- **Transaction integrity / concurrency.** Both `postGrn` and `recordInspection` take `SELECT … FOR UPDATE` on the GRN header and re-check status **inside** the transaction (TOCTOU-safe); a posted GRN is genuinely immutable (no PATCH/PUT route; DELETE blocks non-drafts); inspection never mutates GRN receipt data.
- **RBAC is correct.** All inventory + master writes are `requireWriteRole("supervisor","director")`; reads pass for any authenticated user (viewer included). *(Note: an earlier draft flagged `/inventory/stock` as over-restrictive — that was a false alarm; `requireWriteRole` lets GET/HEAD through for everyone.)*
- **Audit on inventory operations is present.** `grn.created`, `grn.posted`, and `inspection.completed` security events are emitted; the `inventory_transactions` ledger is itself the append-only audit of stock movement.

> The `audit` / `authz` validation workflows currently show "failed" — this is the **known false red** (auth rate-limiter saturation when the cert suites run against live traffic), not an inventory regression. Authorization and audit behavior were verified directly here from code + DB.

---

## Per-module scorecard

Legend: **OK** = verified working · **GAP** = finding (see ID) · **N/A** = not applicable.

| Dimension | Material Master | Material Categories | Supplier Master | GRN | Incoming Inspection | Stock On Hand | Product Inventory |
|---|---|---|---|---|---|---|---|
| Create | OK | OK | OK | OK | OK | N/A (derived) | N/A (minted at QC) |
| Edit | OK (PATCH) | OK (PATCH) | OK (PATCH) | N/A (immutable once posted) | N/A (one-shot) | N/A | N/A |
| View | OK | OK | OK | OK | OK | OK | OK |
| Search | OK | OK | OK | OK | OK | **GAP INV-003** | OK |
| Filter | OK (status) | OK (status) | OK (status) | OK (status) | OK (eligible) | **GAP INV-003** | OK (rich) |
| Validation | **GAP INV-005** | **GAP INV-005** | **GAP INV-005** | OK (`>0`) / **INV-007** | OK (sum, reason) | N/A | OK |
| Relationships | OK | OK | OK | OK | OK | OK | OK |
| Security / RBAC | OK | OK | OK | OK | OK | OK | OK |
| Audit trail | **GAP INV-001** | **GAP INV-001** | **GAP INV-001** | OK | OK | OK (ledger) | OK (events) |
| Performance | OK | OK | OK | OK | **GAP INV-003** | **GAP INV-003** | OK (indexed, paginated) |
| Duplicate prevention | OK | OK | OK | OK | OK | N/A | OK (serial UNIQUE) |
| Transaction integrity | N/A | N/A | N/A | OK (FOR UPDATE) | OK (FOR UPDATE) | N/A | OK |
| Serial traceability | N/A | N/A | N/A | OK (GRN#) | OK (INSP#) | OK | OK (genealogy) |
| Quantity reconciliation | N/A | N/A | N/A | OK | OK | OK (exact) | N/A |
| Reporting consistency | OK | OK | OK | OK | OK | OK | **GAP INV-006** |
| Mobile / responsive | OK (ODS) | OK (ODS) | OK (ODS) | OK (ODS) | OK (ODS) | OK (ODS) | OK (ODS) |
| UI / UX quality | OK | OK | OK | OK | **GAP INV-008** | OK | **GAP INV-004** |
| Error messages | OK (409/400) | OK | OK | OK (422 named) | OK (notify) | OK | OK |
| Edge cases | **INV-009** | **INV-009** | **INV-009** | **INV-007** | **INV-002** | **INV-010** | **INV-004** |

*Mobile/responsive marked OK because every screen renders through the shared ODS components (`MasterPage`, `OdsDataTable`, ODS drawers) which are responsive by design; a device spot-check during the fix batch is recommended to confirm wide data tables scroll cleanly on phones.*

---

## Detailed findings

### INV-001 — Master-data changes leave no audit trail · **HIGH**
**Modules:** Material Master, Material Categories, Supplier Master (and Material Workflows / Workflow Assignments).
**Evidence:** `recordSecurityEvent` appears **nowhere** in `routes/masters/*`. Create / update / status-toggle on any master persist no audit row in `security_events` (only auth, authz-denials, and cell-domain events are recorded).
**Business impact:** Master data drives money and routing. Changing a **supplier**, a material's **category or UOM**, or a **category→workflow assignment** silently changes how future GRNs post (inspection vs direct-to-inventory), how stock is grouped, and who a receipt is attributed to — with **no record of who changed it or when**. For a factory heading to production this is the single biggest traceability gap: an incorrect master edit is currently undetectable after the fact.
**Simplest fix (platform-level — fix once, every master benefits):** emit a `master.created` / `master.updated` / `master.status_changed` security event from the **shared `createMasterRouter`** (one insertion point in `routes/masters/common.ts`), carrying actor, entity type, entity id, and changed fields. No per-module work.

### INV-002 — Incoming inspection cannot be done line-by-line over time · **MEDIUM**
**Module:** Incoming Inspection.
**Evidence:** `recordInspection` requires the submitted lines to **exactly cover** all of a GRN's `inspection_pending` lines in **one** session, and the `incoming_inspections.grn_id` UNIQUE constraint permits only one inspection per GRN.
**Business impact:** A real multi-line GRN (e.g. 10 materials) often gets inspected progressively — some lines today, others when QC capacity frees up. Today the **entire GRN is blocked** until every line can be inspected in a single sitting, and all of its stock stays in `inspection_pending` meanwhile. For single/few-line GRNs this is a non-issue; for large mixed GRNs it forces batching that the factory may not want.
**Simplest fix (needs a process decision):** relax "exact cover" to "subset of still-pending lines" and allow multiple inspection documents per GRN (keep the `grn_line_id` UNIQUE so no line is inspected twice; drop/relax the per-GRN UNIQUE). This is a behavioral change, not a one-liner — **flag for your decision before the fix batch.**

### INV-003 — Stock On Hand has no pagination, filter, or search · **MEDIUM**
**Module:** Stock On Hand.
**Evidence:** `GET /inventory/stock` returns **all** non-zero (material × state) buckets with no `limit`/`offset` and no query params; the frontend loads the entire projection.
**Business impact:** Fine at today's 3 rows; at a commercial catalog (thousands of materials × 3 states) the response balloons and an operator **cannot look up one material's stock** without scanning everything. This is the most likely "it got slow in production" surprise.
**Simplest fix:** add `limit`/`offset` pagination and `material_id` / `material_code` (search) / `stock_state` query filters to the endpoint, mirroring the `GET /products` pattern already in the codebase.

### INV-004 — Product Inventory "Quarantined" is hardcoded 0 · **MEDIUM**
**Module:** Product Inventory.
**Evidence:** `inventory-summary` returns `quarantined: 0` literally; the Product lifecycle has no quarantine state (Products are minted only at QC PASS). Documented spec deviation.
**Business impact:** The dashboard shows a "Quarantined" card that can never be anything but 0, which is **misleading** to managers and implies a capability that doesn't exist. A real factory does quarantine defective/returned finished units — there's currently nowhere to represent that.
**Simplest fix (decision needed):** short term — relabel/remove the card or mark it "not tracked" so it doesn't misreport; long term — a real quarantine state is a feature, not a fix (defer unless you want it scoped now).

### INV-005 — Master `code` / `name` lack length & trim validation · **MEDIUM**
**Modules:** Material Master, Material Categories, Supplier Master.
**Evidence:** Master create/update bodies in the OpenAPI spec validate type only — no `minLength`, `maxLength`, or trim on `code`/`name` (only 9 length constraints exist in the entire spec, none on masters).
**Business impact:** Accepts empty/whitespace-only names, accidental 500-char pastes, and `" ABC "` vs `"ABC"` near-duplicates — messy master data that, because there's no delete (INV-009), is then **permanent**. Bad master data is expensive to clean later.
**Simplest fix:** add `minLength: 1`, a sane `maxLength`, and trimming to the master create/update schemas in `lib/api-spec/openapi.yaml`, then regenerate (`codegen`). Server picks up the Zod automatically.

### INV-006 — Consolidated inventory report omits materials and finished products · **MEDIUM**
**Module:** Reporting consistency (Stock / Product Inventory feed into Reports — a priority module).
**Evidence:** `GET /reports/inventory` aggregates **only cells and batteries (production orders)** — it does not include the material stock ledger (`inventory_transactions`) or serialized Product inventory.
**Business impact:** A manager opening the "inventory report" sees cell/battery counts but **no raw-material on-hand and no finished-product inventory** — the report is incomplete relative to the modules the factory now runs on. The data exists and reconciles; it's just not surfaced in the consolidated report.
**Simplest fix:** extend the report payload with a material-stock summary and a product-inventory summary by **reusing the existing `/inventory/stock` and `/products/inventory-summary` queries** — additive, no new tables.

### INV-007 — Discrete-UOM quantities accept fractions · **LOW**
**Modules:** GRN, Incoming Inspection.
**Evidence:** `quantity_received` (`exclusiveMinimum: 0`) and `accepted_qty`/`rejected_qty` (`minimum: 0`) are typed `number`, independent of UOM; UOM enum includes discrete units (`PCS`, `SET`, `ROLL`).
**Business impact:** A typo like `2.5 PCS` or `3.5 SET` is accepted for countable goods. Low frequency, easily caught, but produces nonsensical counts.
**Simplest fix:** enforce integer quantities when the line's UOM is discrete (`PCS`/`SET`/`ROLL`); allow fractions only for `KG`/`M`/`L`.

### INV-008 — No shortcut to assign a workflow after a 422 · **LOW**
**Module:** GRN (UI/UX).
**Evidence:** When posting fails with the mandatory-assignment 422 (category has no workflow), the operator must navigate to Masters → Workflow Assignments manually.
**Business impact:** Minor friction at first setup / when a new category is introduced; the fail-fast itself is correct and desirable.
**Simplest fix:** surface a deep link ("Assign workflow for category X") in the 422 toast, or an inline assign action.

### INV-009 — Masters cannot be deleted or soft-deleted · **LOW**
**Modules:** all three masters.
**Evidence:** No DELETE routes (intentional — lifecycle via status toggle); no `deleted_at`.
**Business impact:** A record created in error (typo code) can only be **deactivated**, and its `code` permanently occupies the UNIQUE namespace — the correct code may collide later. Minor, but compounds INV-005.
**Simplest fix:** optional — allow deletion of a never-referenced master, or add soft-delete to hide erroneous rows from pickers.

### INV-010 — Negative stock is not surfaced or guarded · **LOW**
**Module:** Stock On Hand.
**Evidence:** The projection returns the raw signed `SUM`; nothing alerts if a bucket goes negative (none do today).
**Business impact:** Purely defensive — if a future bug ever over-releases, the system would silently show/absorb a negative instead of flagging an impossible state.
**Simplest fix:** add a guard/indicator that flags any negative on-hand bucket as a data-integrity alert.

---

## Out of scope / noted, not inventory defects

- **Two historical bad rows** (a product with 0 genealogy `BAT-20260628-000005`; orphan order `PO-20260626-0002`) — flagged previously for separate CTO data remediation, not an Inventory code defect.
- **`audit` / `authz` workflow "failed"** — known false red (auth-limiter saturation); re-run authoritatively (restart api-server, no competing traffic) shows green.

---

## Recommendation

Inventory is **commercially sound at the transaction level** and safe to operate on at current volumes. Recommend approving this batch for the one-shot fix pass:

1. **INV-001 (High)** — add master-data audit at the shared router (platform fix). *Strongly recommended before go-live.*
2. **INV-003, INV-005, INV-006 (Medium)** — stock pagination/filter, master validation hardening, report completeness. *Recommended; all small and additive.*
3. **INV-002, INV-004 (Medium)** — need a **process/product decision** first (staggered inspection; quarantine handling). *Please advise scope.*
4. **INV-007, INV-008, INV-009, INV-010 (Low)** — include if cheap; otherwise backlog.

On approval, we fix the agreed set in one batch, re-verify, and **freeze Inventory** before moving to Dispatch.
