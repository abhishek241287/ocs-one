# OCS One — Commercial Readiness Report (Phase 1 Verification)

**Date:** 2026-06-29
**Scope:** End-to-end verification of the commercial flow
`GRN → Incoming Inspection → Material Inventory → Production → Product Creation → Product Inventory → Packing → Dispatch → Dealer`
**Method:** READ-ONLY. Live database reconciliation (SQL) cross-checked against live API/report endpoints. **No business logic, schema, or data was changed.**
**Mandate verified:** inventory quantities reconcile · serial traceability · genealogy intact · inventory balances · dispatch quantities · dealer inventory · reports match transactional data · no duplicate/orphan records.

> **Data context:** the current database holds **cert/smoke test data**, not production volume (5 GRNs, 2 Products, 7 production orders, 1 dealer). Findings below describe **what the system currently permits**, which is the real signal for commercial readiness — even where the specific rows are test fixtures. A re-run against a production-like dataset is recommended before go-live sign-off.

---

## 1. Verdict summary

| Stage | Result | Basis |
|---|---|---|
| Material Receipt (GRN) | ✅ PASS | Every posted line generated correct ledger entries; no orphan/duplicate/draft-leak |
| Incoming Inspection | ✅ PASS | `accepted+rejected = received` on every line; ledger nets correct; reason rule honoured |
| Material Inventory (Stock on Hand) | ✅ PASS | On-hand reconciles to the penny; no negative balances; API matches ledger |
| Production → Product Creation | ⚠️ FINDINGS | Identity & QC linkage clean, but **genealogy not guaranteed** (F1) and **completed orders can orphan** (F2) |
| Product Inventory | ✅ PASS | Status distribution & summary API match raw data exactly |
| Packing → Dispatch | ✅ PASS | Status transitions, events, and dealer assignment all consistent |
| Dealer | ⚠️ FINDING | Counts correct, but **"Dealer Stock" is structurally unreachable** (F3) |
| Reports vs transactional data | ✅ PASS | Every checked endpoint matches the underlying tables exactly |

**Bottom line:** the **material/inventory backbone is commercially sound** — quantities reconcile exactly and reports are accurate. Three findings, all in the **product/dealer lifecycle**, need a decision before go-live. None is a calculation bug; all three are **integrity guarantees the system does not currently enforce**.

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

### F2 — "Completed" order orphaned from the Product Platform *(Class A — Data inconsistency / orphan)*
- **Evidence:** Order `PO-20260626-0002` is `status = completed` (stage `packing`) but has **no model (`product_id` NULL), 0 QC approvals, 0 genealogy, 0 Product**.
- **Root cause:** product creation *correctly* skips orders with no model (documented "skip-and-report" rule). The real inconsistency is that the system let an order reach **`completed` with no model and no QC pass**, so it sits permanently outside Product Inventory / Dispatch / Reports.
- **Impact:** a "finished" manufacturing order that is invisible to the entire finished-goods chain. At scale this silently diverges manufacturing throughput from finished-goods inventory.

### F3 — "Dealer Stock" is structurally unreachable *(Class A — metric definition / Class B — missing function)*
- **Evidence:** the lifecycle ends at `delivered_to_dealer`, but **no route ever sets that status** (dispatch stops at `dispatched`). So the company-wide **"Dealer Stock" KPI = count(`delivered_to_dealer`) is always 0**, while the **Dealer Portal inventory = count by `dealer_id`** shows 1 (a still-in-transit `dispatched` unit). Both are internally correct, but they answer different questions and will read as contradictory.
- **Impact:** there is **no delivery-confirmation step**, so "delivered to dealer" can never be true and true dealer on-hand cannot be distinguished from in-transit. This is the candidate enhancement the CTO already flagged.

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

## 5. Recommendation — verify before expand

The inventory backbone is ready. **Do not add lifecycle states yet.** The three findings are about **integrity guarantees**, and each needs a CTO decision before Phase 3:

1. **F1 (highest priority):** should QC-pass / Product creation **fail-closed** if genealogy is empty — i.e. a unit cannot be serialized without its components? This is a guard, not new architecture.
2. **F2:** define the rule — can an order be `completed` without a model and without QC pass? Recommend blocking `completed` unless model + QC-pass preconditions are met, and decide whether legacy completed orders are backfilled or explicitly excluded.
3. **F3:** confirm whether `delivered_to_dealer` is genuinely required. If yes, it becomes the **one approved enhancement** (delivery confirmation), which also resolves the dealer-stock metric divergence.

No new architecture and no speculative features are required to reach commercial readiness — only these integrity guards, in priority order, after CTO classification sign-off.
