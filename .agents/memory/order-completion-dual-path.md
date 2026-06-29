---
name: Order completion has two paths
description: Manufacturing order completion can happen via TWO routes — both must go through the single completion gate or one orphans the order.
---

# Order completion is reachable from two distinct routes

A manufacturing production order can transition to `status='completed'` from **two** places, and it is easy to fix one and miss the other:

1. **QC approval** — `routes/manufacturing/qc-approval.ts`, the `decision==='approved'` branch.
2. **Terminal stage approval** — `routes/manufacturing/stages.ts`, the stage-approve handler's `else` branch where `getNextStage(stage)===null` (the last stage in `STAGE_SEQUENCE`, i.e. `packing` after `quality_control`).

**Why this matters:** the orphan defect (a `completed` order with no model / QC / genealogy / Product) was created through the terminal-stage path while the QC path looked correct. Any integrity guard on order completion (model assigned, QC pass, genealogy present, Product minted) MUST be enforced in a **single shared gate** that BOTH paths call — never inline in just one handler.

**How to apply:** completion preconditions live in one function (`completeOrderWithProduct(tx, orderId, actor)` in `lib/product-creation.ts`) that throws `OrderCompletionBlockedError` (→ tx rollback → HTTP 422) when any condition fails. Both routes wrap their `db.transaction` in try/catch mapping that error to 422. If you add a third way to complete an order, route it through the same gate.
