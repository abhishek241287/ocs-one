# OCS One — Commercial Readiness Report (Phase 1 Verification)

**Date:** 2026-06-29
**Scope:** End-to-end verification of the commercial flow
`GRN → Incoming Inspection → Material Inventory → Production → Product Creation → Product Inventory → Packing → Dispatch → Dealer`
**Method:** READ-ONLY. Live database reconciliation (SQL) cross-checked against live API/report endpoints. **No business logic, schema, or data was changed.**
**Mandate verified:** inventory quantities reconcile · serial traceability · genealogy intact · inventory balances · dispatch quantities · dealer inventory · reports match transactional data · no duplicate/orphan records.

> **Data context:** the current database holds **cert/smoke test data**, not production volume (5 GRNs, 2 Products, 7 production orders, 1 dealer). Findings below describe **what the system currently permits**, which is the real signal for commercial readiness — even where the specific rows are test fixtures. A re-run against a production-like dataset is recommended before go-live sign-off.

> **🔒 REMEDIATION ADDENDUM (2026-06-29):** the three Critical findings (F1, F2, F3) have been **CLOSED** per CTO-approved scope (integrity guards only — no new lifecycle states, no scope expansion). Each finding below now carries a **Resolution** block with the fix and live re-verification evidence. See **§6 — Remediation closure** for the consolidated record. One historical-data item remains for a CTO data-remediation decision (does **not** block the code fixes).

---

## 1. Verdict summary

| Stage | Result | Basis |
|---|---|---|
| Material Receipt (GRN) | ✅ PASS | Every posted line generated correct ledger entries; no orphan/duplicate/draft-leak |
| Incoming Inspection | ✅ PASS | `accepted+rejected = received` on every line; ledger nets correct; reason rule honoured |
| Material Inventory (Stock on Hand) | ✅ PASS | On-hand reconciles to the penny; no negative balances; API matches ledger |
| Production → Product Creation | ✅ PASS *(was ⚠️)* | **F1 + F2 CLOSED** — genealogy now mandatory before a Product is minted; order completion now fail-closed through one shared gate on both paths |
| Product Inventory | ✅ PASS | Status distribution & summary API match raw data exactly |
| Packing → Dispatch | ✅ PASS | Status transitions, events, and dealer assignment all consistent |
| Dealer | ✅ PASS *(was ⚠️)* | **F3 CLOSED** — "Dealer Stock" now defined as products dispatched against a dealer (`dealer_id IS NOT NULL`), matching the Dealer Portal exactly |
| Reports vs transactional data | ✅ PASS | Every checked endpoint matches the underlying tables exactly |

**Bottom line:** the **material/inventory backbone is commercially sound** — quantities reconcile exactly and reports are accurate. The three product/dealer-lifecycle findings (F1, F2, F3) were **integrity guarantees the system did not previously enforce**; all three are now **enforced in code and re-verified live** (see §3 Resolution blocks and §6). No calculation bug existed; no new lifecycle state was added.

---

## 2. What passed (with evidence)

### Material ledger integrity — PASS
- 5 GRNs, all `posted`; 6 lines. Every posted line has exactly one `GRN_RECEIPT` for its full `quantity_received`. No posted line missing a receipt; no ledger row pointing at a non-existent line; **no draft GRN carries ledger transactions**.
- **Stock reconciles exactly:**
  - `MAT-409TEST`: received 112 (12 direct-to-inventory + 30 + 50 + 20 via inspection) = **available 87 + rejected 25 + pending 0**. ✓
  - `MAT-SMOKE-1`: received 12, uninspected = **pending 12**. ✓
  - No negative balances anywhere.

### Incoming Inspection — PASS
- All 3 inspection lines satisfy `accepted + rejected = quantity_received`; `rejection_reason` present wherever `rejected > 0`.
- Ledger nets are correct per line: `INSPECTION_RELEASE = −received`, and `INSPECTION_ACCEPT + INSPECTION_REJECT = received`, so `inspection_pending` nets to 0 once inspected.
- One inspection per GRN and one inspection per GRN line (no duplicates); no inspection references a non-posted/missing GRN. Inspection **never altered** GRN receipt quantities.

### Product identity, lifecycle & reports — PASS
- 2 Products, **2 distinct non-null serials**, both linked to **existing `completed` orders**; `source_production_order_id` unique (idempotent QC-pass emit holds).
- Every Product has a `product.created` event. The dispatched Product has matching `product.packed` + `product.dispatched` events and a valid `dealer_id`; the qc_passed Product correctly has neither. No dispatched-without-dealer and no non-dispatched-with-dealer rows. No orphan events or genealogy rows.
- **API == database** on every cross-check: `/inventory/stock`, `/products/inventory-summary` (`total 2, available 1, dispatched 1, dealer_stock 0`), `/dealers/{id}/inventory` (1), `/dealers/{id}/dispatch-history` (1).

---

## 3. Findings

### F1 — QC-passed Product minted with NO genealogy *(Class A — Data inconsistency / traceability)*
- **Evidence:** Product `BAT-20260628-000005` (status `qc_passed`) has **0 `product_genealogy` rows**. Its source order `PO-20260628-000005` also has **0 `mfg_battery_genealogy` rows**, yet it reached `completed`, received a QC approval, and minted a Product.
- **Root cause (not a copy bug):** the Product Platform copies genealogy faithfully — the dispatched Product copied **2/2** component rows (cell + BMS) correctly. The gap is **upstream**: manufacturing/QC allowed an order to pass QC and mint a serialized finished good **without a single component recorded**.
- **Impact:** a serialized, QC-passed battery with **zero component traceability** — directly violates "every serial traceable / genealogy intact." In production this means a unit that cannot be traced to its cells/BMS for warranty or recall.
- **✅ Resolution (2026-06-29):** `createProductFromOrder` now fetches `mfg_battery_genealogy` **before** inserting the Product and **refuses to mint** (`skipped: genealogy_incomplete`) when 0 component rows exist — "complete" = ≥1 component row (the only measurable rule; no BOM spec exists). The genealogy copy reuses that same already-fetched lineage, so a Product can never be created ahead of its genealogy. **Live re-verification:** throwaway order with a model + approved QC stage + **0 genealogy** → `POST …/qc-approval` returned **HTTP 422 `genealogy_incomplete`**, and the transaction rolled back cleanly (order stayed `draft`, **0 products, 0 QC approvals** persisted). Fail-closed.

### F2 — "Completed" order orphaned from the Product Platform *(Class A — Data inconsistency / orphan)*
- **Evidence:** Order `PO-20260626-0002` is `status = completed` (stage `packing`) but has **no model (`product_id` NULL), 0 QC approvals, 0 genealogy, 0 Product**.
- **Root cause:** product creation *correctly* skips orders with no model (documented "skip-and-report" rule). The real inconsistency is that the system let an order reach **`completed` with no model and no QC pass**, so it sits permanently outside Product Inventory / Dispatch / Reports.
- **Impact:** a "finished" manufacturing order that is invisible to the entire finished-goods chain. At scale this silently diverges manufacturing throughput from finished-goods inventory.
- **✅ Resolution (2026-06-29):** introduced one shared completion gate `completeOrderWithProduct(tx, orderId, actor)` that, inside the order-row `FOR UPDATE` transaction, enforces **all** completion preconditions — (1) model assigned, (2) QC stage approved with `approvedAt`, (3) genealogy ≥1 row — then marks the order `completed` and mints the Product (`created|exists` only). Any unmet condition throws `OrderCompletionBlockedError` → **full rollback** → route returns **HTTP 422** naming the missing requirement. **Both** completion entry points are wired to this single gate: `qc-approval.ts` (QC-approve branch) and `stages.ts` terminal `packing`-stage approval (the `getNextStage()===null` branch that previously just set `status:'completed'`). An order can no longer reach `completed` from either path while missing a model, QC pass, genealogy, or Product. **Live re-verification:** `POST …/qc-approval` on the orphan-style order with no model → **HTTP 422 `model_missing`**, rolled back (still 0 products, 0 QC approvals).

### F3 — "Dealer Stock" is structurally unreachable *(Class A — metric definition / Class B — missing function)*
- **Evidence:** the lifecycle ends at `delivered_to_dealer`, but **no route ever sets that status** (dispatch stops at `dispatched`). So the company-wide **"Dealer Stock" KPI = count(`delivered_to_dealer`) is always 0**, while the **Dealer Portal inventory = count by `dealer_id`** shows 1 (a still-in-transit `dispatched` unit). Both are internally correct, but they answer different questions and will read as contradictory.
- **Impact:** there is **no delivery-confirmation step**, so "delivered to dealer" can never be true and true dealer on-hand cannot be distinguished from in-transit. This is the candidate enhancement the CTO already flagged.
- **✅ Resolution (2026-06-29) — reporting-definition alignment only (no new lifecycle state):** per CTO direction, **"Dealer Inventory / Dealer Stock" is defined as products dispatched against a dealer** — i.e. `count(dealer_id IS NOT NULL)` — which is the **exact same definition** the Dealer Portal already uses (`GET /dealers/{id}/inventory` counts by `dealer_id`). `GET /products/inventory-summary` now computes `dealer_stock` that way, and the Product-Inventory dashboard cards ("Dealer Stock" + "Dealer Inventory") now link to `status=dispatched` with "Dispatched to dealers" wording. The two views can no longer disagree. **No `delivered_to_dealer` route was added** — a true delivery-confirmation step remains a future Logistics enhancement, explicitly out of this scope. **Live re-verification:** `/products/inventory-summary` now returns `dealer_stock = 1`, equal to `count(dealer_id IS NOT NULL) = 1` and to the Dealer Portal's `1`.

### Observations *(Class C — informational, no action required for readiness)*
- **Export Center** is a UI stub with no backend — already deprioritised by the CTO (accuracy > export).
- **"Quarantined" KPI is hardcoded 0** — no quarantine state exists in the lifecycle (documented spec deviation).
- **Dataset is small cert/smoke data** — re-run this verification after a production-like load.

---

## 4. Issue classification (Phase 2)

| ID | Issue | A: Data inconsistency | B: Missing functionality | C: UI/usability |
|---|---|:--:|:--:|:--:|
| F1 | QC-passed product with empty genealogy | ● (allowed by missing guard) | ● (enforce genealogy at QC-pass) | |
| F2 | `completed` order with no model/QC → no Product | ● | ● (guard "completed" preconditions / backfill policy) | |
| F3 | `delivered_to_dealer` unreachable; dealer-stock metrics diverge | ● (metric definition) | ● (delivery confirmation step) | ● (label clarity) |
| O1 | Export Center stub | | ● (deprioritised) | |
| O2 | Quarantine KPI hardcoded 0 | | | ● |

---

## 5. Recommendation — verify before expand *(original Phase-1 guidance, now actioned)*

The inventory backbone is ready. **Do not add lifecycle states yet.** The three findings were about **integrity guarantees**; per CTO classification sign-off all three were closed as guards only (see §6):

1. **F1 (highest priority):** ✅ QC-pass / Product creation now **fail-closed** when genealogy is empty — a unit cannot be serialized without ≥1 component. Guard, not new architecture.
2. **F2:** ✅ an order can no longer reach `completed` without model + QC-pass + genealogy + Product, enforced on **both** completion paths by one shared gate. Legacy completed orders were **not** auto-mutated — see the historical-data item in §6.
3. **F3:** ✅ resolved as a **reporting-definition alignment** (Dealer Stock = dispatched-against-dealer), matching the Dealer Portal. A true `delivered_to_dealer` delivery-confirmation step remains the **one candidate future enhancement** — deliberately **not** built here.

No new architecture and no speculative features were introduced — only the integrity guards above.

---

## 6. Remediation closure (2026-06-29)

**Scope honoured:** F1, F2, and the F3 reporting-definition alignment **only**. No new lifecycle state, no scope expansion, no schema/migration change (response shapes unchanged → no codegen/DB push needed).

| ID | Status | Fix (one line) | Live re-verification |
|---|---|---|---|
| F1 | ✅ CLOSED | `createProductFromOrder` refuses to mint when genealogy has 0 rows (pre-insert guard) | 422 `genealogy_incomplete`, clean rollback (0 products / 0 QC approvals) |
| F2 | ✅ CLOSED | shared `completeOrderWithProduct` gate (model + QC + genealogy + Product) on **both** completion paths; throw → rollback → 422 | 422 `model_missing`, clean rollback |
| F3 | ✅ CLOSED | `dealer_stock = count(dealer_id IS NOT NULL)` (= Dealer Portal definition); dashboard cards aligned | `inventory-summary.dealer_stock = 1` == `dealer_id` count == portal `1` |

**Files changed:** `artifacts/api-server/src/lib/product-creation.ts` (F1+F2), `routes/manufacturing/qc-approval.ts` (F2), `routes/manufacturing/stages.ts` (F2), `routes/products/index.ts` (F3), `artifacts/ocs-one/src/features/product-inventory/pages/ProductInventoryDashboardPage.tsx` (F3).

**Quality gates:** `pnpm run typecheck` green across all packages; independent architect code review → **Pass**, no severe issues, no scope creep, transaction/rollback semantics correct, both completion paths confirmed closed. (The `audit`/`authz` validation workflows showing red are the known cert-suite false reds from auth-rate-limiter saturation under concurrent traffic — unrelated to this diff, which touches no auth/audit/config-integrity logic; SS-04 `config` finished green.)

**⚠️ Open item — historical data remediation (needs a CTO decision; does NOT block the code fixes):** the pre-existing bad rows that motivated F1/F2 are still present, because correcting live records is a destructive action outside the approved code-fix scope:
- Product `BAT-20260628-000005` (`qc_passed`) with **0 genealogy** — minted under the old code path.
- Order `PO-20260626-0002` — `completed` with no model / QC / genealogy / Product (orphan).

The code now **prevents any new occurrence**. Recommend a separate, explicitly-approved data-remediation task to either backfill genealogy / void-and-reissue the affected serial, or quarantine these two legacy rows. Awaiting CTO direction.
