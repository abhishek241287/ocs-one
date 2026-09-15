# UI-IA-02a — Verification Trio and Feasibility Evidence

**Date:** 2026-09-15  
**Assignment:** Task: execute Batch UI-IA-02a — the verification trio (V1 authoritative stage definitions / V2 orders-list page coverage / V3 explicit Waiting-Blocked semantics) + My-Work feed mapping + product-chain feasibility. READ-ONLY evidence batch; MOBILE FREEZE applies; baseline a1c0ba4 untouched; git diff EMPTY at completion (evidence notes only). Output: GO/NO-GO per item + the stop-list that authorizes UI-IA-02b.

## Scope and freeze

This was a read-only evidence batch. No application source, route, API,
database, generated client, dashboard, or mobile file was changed. The only
workspace addition is this evidence note.

**MOBILE FREEZE:** Mobile-specific UI redesign is OUT OF SCOPE. Do not
introduce bottom navigation, mobile-specific information architecture, scanner
workflows, responsive layout redesign, mobile breakpoints, touch-target
redesign, or mobile-only components. Existing responsive behavior may not be
altered except where required to prevent regression from the authorized
desktop changes.

The live working tree was clean at the start and end:

```text
git diff --quiet -> exit 0
```

The baseline was not reset, rebased, or rewritten. All verification calls were
GET/read-only calls after authentication; no POST, PATCH, PUT, or DELETE
application operation was issued.

## Decision summary

| Item | Decision | Boundary |
|---|---|---|
| V1 — authoritative runtime stage definitions | **GO — bounded** | The nine-stage manufacturing runtime sequence is authoritative and passes the existing sequence-integrity contract. Product Workflow `stageSequence` is data only and is not a live stage engine. |
| V2 — production-orders list page coverage | **GO — bounded** | The existing page and API cover order number, battery number, manager, current stage, order status, priority, search, filters, pagination, and detail navigation. Product name/SKU is not covered by the current order projection. |
| V3 — explicit Waiting/Blocked semantics | **NO-GO** | `waiting` and `blocked` are response-level derivations from `pending` and `rejected`; they are not canonical workflow states. `paused` is canonical but is not represented in the pipeline derivation and is omitted from the generic UI badge map. |
| My-Work feed mapping | **NO-GO as an implementation contract** | Four source KPIs are identifiable, but the current destinations are not exact queue projections for all four feeds. QC and Production links are broader than their displayed counts. |
| Product-chain feasibility | **GO for Product-first; NO-GO for order-list SKU projection as-is** | Existing Product and traceability APIs support authoritative Product → Model/SKU + serial + source Production Order traversal. The order-list endpoint still exposes only `productId`. |

**UI-IA-02b authorization:** **NO-GO for the full Pipeline + Production
Order Intelligence batch.** A bounded desktop-only subset is supportable after
the stop-list below is accepted: use the existing nine-stage runtime sequence,
existing raw order/stage statuses, and existing Product-first APIs. Do not add
Waiting/Blocked semantics, order-list SKU labels, a unified twelve-node
pipeline, or broader My-Work destinations.

## V1 — authoritative stage definitions

### Evidence

The runtime authority is consistent across the database enum, server stage
metadata, and configuration-integrity check:

- `lib/db/src/schema/manufacturing.ts:22-32` defines the closed runtime stage
  enum:
  `cell_allocation → assembly → compression → bms_allocation →
  bms_programming → charging → testing → quality_control → packing`.
- `lib/db/src/schema/manufacturing.ts:48-55` defines canonical numeric
  `STAGE_ORDER` 1 through 9.
- `artifacts/api-server/src/routes/manufacturing/helpers.ts:29-49` defines
  `STAGE_META`, derives `STAGE_SEQUENCE`, and implements next-stage lookup.
- `artifacts/api-server/src/lib/manufacturing-config.ts:21-44` defines
  `EXPECTED_STAGE_SEQUENCE` and renders the live stage order.
- `artifacts/api-server/src/lib/config-integrity.ts:551-566` fails when the
  live sequence differs in length, name, or order from the expected sequence.
- `artifacts/api-server/src/routes/manufacturing/orders.ts:93-125` creates
  the complete ordered stage projection, and `:158-164` reads stages by the
  persisted `stageOrder`.
- `artifacts/api-server/src/routes/manufacturing/stages.ts:380-701` enforces
  pending → in progress → completed → approved, pause/resume, and rejection
  back to pending.

### Authority boundary

`product_workflows.stageSequence` is not an alternate live authority:

- `lib/db/src/schema/product-masters.ts:33-45` stores ordered workflow data.
- `artifacts/api-server/src/lib/seed.ts:162-190` explicitly labels it data
  that is not wired to an engine in the current implementation.

The dashboard also contains adjacent operational queue nodes — Cell Receiving,
Cell Grading, Cell Matching, and Dispatch — in addition to the nine
manufacturing stages. Those nodes must not be presented as if they were part
of the same canonical manufacturing stage sequence.

### V1 decision

**GO, bounded to the nine-stage runtime sequence.** UI-IA-02b may use the
server/runtime stage sequence for current-stage and stage-progress display. It
may not use the Product Workflow master as a live transition source or merge
cell/dispatch queue nodes into the nine-stage manufacturing chain without a
separate authority decision.

## V2 — production-orders page coverage

### Existing page/API coverage

- `artifacts/ocs-one/src/App.tsx:158-167` registers
  `/manufacturing/orders` and `/manufacturing/orders/:id`.
- `artifacts/ocs-one/src/features/manufacturing/pages/OrdersListPage.tsx:34-96`
  renders Order #, Battery #, Factory Manager, Stage, Status, Priority, and
  Created columns, with Order # linking to the detail page.
- `OrdersListPage.tsx:104-177` supports search, order-status filtering,
  priority filtering, and the `stage` query filter.
- `OrdersListPage.tsx:198-237` renders the ODS data table with refresh,
  column visibility, density, and pagination.
- `artifacts/api-server/src/routes/manufacturing/orders.ts:27-90` provides
  search, status, priority, current-stage filtering, pagination, and the
  `{ items, meta }` response shape.
- `artifacts/api-server/src/routes/manufacturing/orders.ts:143-165` returns
  the order detail with stages ordered by `stageOrder`.
- `lib/api-zod/src/generated/types/productionOrder.ts:12-32` confirms the
  transport shape contains `productId` but no product name, SKU/code, or
  serialized Product identity.

### Live read-only probe

Authenticated Director GET requests returned:

```text
GET /api/manufacturing/orders?page=1&pageSize=5
  items=5, total=10, totalPages=2

GET /api/manufacturing/orders?stage=quality_control&page=1&pageSize=5
  items=2, total=2, totalPages=1

GET /api/manufacturing/orders?status=in_progress&page=1&pageSize=5
  items=5, total=7, totalPages=2

GET /manufacturing/orders
  HTTP 200, application shell present
```

### V2 decision

**GO for existing orders-list coverage, bounded to fields the current
projection actually owns.** UI-IA-02b may extend this page with current-stage
progress using V1 authority and raw order/stage fields.

**NO-GO for displaying Product name/SKU or serialized Product identity in this
list without a read-only projection change.** Never render `mfg_production_orders.product_id`
as a serialized Product or operator-facing SKU.

## V3 — explicit Waiting/Blocked semantics

### What currently exists

The canonical stage status enum is:

```text
pending, in_progress, paused, completed, approved, rejected
```

The canonical order status enum is:

```text
draft, released, in_progress, completed, cancelled
```

The dashboard aggregation currently derives:

- `waiting` from stage status `pending`
- `blocked` from stage status `rejected`
- `inProgress` from stage status `in_progress`
- completed from `completed` or `approved`

Evidence:

- `artifacts/api-server/src/routes/dashboard/director.ts:198-214`
- `artifacts/api-server/src/routes/dashboard/director.ts:259-269`
- `artifacts/ocs-one/src/features/dashboard/hooks/useDirectorDashboard.ts:3-11`

The generic stage card exposes Pending, In Progress, Completed, Approved, and
Rejected, but omits `paused` from its status badge map:

- `artifacts/ocs-one/src/features/manufacturing/components/StageCard.tsx:95-101`

### Live read-only probe

`GET /api/dashboard/director` returned a pipeline containing explicit
`waiting` and `blocked` response fields. Example live values included:

```text
cell_matching  waiting=44 blocked=0
quality_control waiting=5 blocked=1
packing        waiting=6 blocked=0
```

These values prove the response shape and current derivation, not a canonical
business definition of Waiting or Blocked. `paused` is not included in the
waiting/blocked derivation.

### V3 decision

**NO-GO.** UI-IA-02b must not present Waiting or Blocked as authoritative
workflow states, use those labels to create new filters, or infer health
semantics from them. A later authorization must define whether Waiting means
pending, paused, dependency-held, or another state, and whether Blocked means
rejected, dependency-blocked, material-gated, or another condition.

## My-Work feed mapping

The current dashboard has four explicit queue shortcuts:

| Feed | Count source | Current destination | Result |
|---|---|---|---|
| QC approvals | QC stage `completed` count | `/manufacturing/orders?stage=quality_control` | **Not exact** — destination filters current stage, not stage status `completed`. |
| Rework queue | Open rework-ticket count | `/manufacturing/rework` | **Grounded and exact** |
| Production in progress | Order status `in_progress` count | `/manufacturing/orders` | **Not exact** — destination is unfiltered. |
| Dispatch ready | Packing stage `approved` count | `/fulfillment/dispatch` | **Grounded source; destination contract requires confirmation** |

Source locations:

- `artifacts/ocs-one/src/pages/DirectorDashboardPage.tsx:512-550`
- `artifacts/api-server/src/routes/dashboard/director.ts:72-92`
- `artifacts/api-server/src/routes/dashboard/director.ts:355-375`

The live Director response returned `qcPending=0`, `inProgress=7`,
`reworkQueue=1`, and `dispatchReady=2`; the same read-only probe returned 2
orders for the `stage=quality_control` list and 10 orders for the unfiltered
orders list. This demonstrates why the displayed count and destination cannot
yet be treated as the same queue.

The active My Work surface is verified queues plus operator activity, not a
chronological activity-feed API. No fifth feed is authorized.

### My-Work decision

**NO-GO as the UI-IA-02b implementation contract until destination filters are
made exact.** The four source metrics are grounded and may be retained, but
02b must not add new feeds or ship labels whose destination returns a broader
set than the displayed count.

## Product-chain feasibility

### Authoritative identity chain

- `lib/db/src/schema/manufacturing.ts:94-123` defines order `productId` as the
  Model/SKU foreign key.
- `lib/db/src/schema/products.ts:50-77` defines serialized Product identity:
  required `modelId`, one-directional
  `sourceProductionOrderId`, and unique `officialProductSerial`.
- Product name/SKU authority is `master_products.name` and
  `master_products.code`.
- `artifacts/api-server/src/routes/products/index.ts:42-130` returns joined
  `model_code` and `model_name` in the product list.
- `artifacts/api-server/src/routes/products/index.ts:201-234` returns the
  same enriched identity on a single Product.
- `artifacts/api-server/src/routes/products/traceability.ts:26-36,60-129`
  provides Product-keyed traceability and joins the source manufacturing order
  for order number, battery number, status, stage, manager, and dates.

### Live read-only probe

```text
GET /api/products?page=1&pageSize=5
  items=3, total=3

GET /api/products/:id
  returned model_code, model_name, official_product_serial,
  source_production_order_id, and product identity fields

GET /api/products/:id/traceability
  returned product, manufacturing, fulfillment, customer, warranty, and
  timeline projections
```

### Product-chain decision

**GO for Product-first identity and traceability.** Existing APIs support
authoritative Product → Model/SKU + serial + source Production Order
navigation.

**NO-GO for order-first name/SKU display using the current orders endpoint.**
That requires a read-only order projection joining
`mfg_production_orders.product_id → master_products`, and serialized identity
must be resolved through
`products.source_production_order_id`, never by treating order `product_id` as
the serialized unit.

## Stop-list for UI-IA-02b

The following are hard stops. UI-IA-02b is not authorized to cross any of them:

1. **No Waiting/Blocked UI state or filter** until V3 defines canonical
   semantics and covers `paused`, dependency holds, rejection, and other
   blocking causes explicitly.
2. **No invented progress states.** Use only the V1 nine-stage runtime
   sequence and persisted stage/order statuses.
3. **No Product Workflow master as a live stage engine.** It remains data until
   a separate workflow-engine authority is approved.
4. **No single merged twelve-node chain.** Keep the nine manufacturing stages
   distinct from cell-receiving/grading/matching and dispatch queues.
5. **No order-list Product name/SKU or serialized identity** until a read-only
   order projection is available. Never label order `productId` as the unit.
6. **No broad My-Work links.** Each displayed count must navigate to an exact
   filtered destination. Retain only the four grounded feeds; do not add a
   chronological Activity Feed.
7. **No mutation workflow, schema migration, or generated-contract rewrite** as
   part of UI-IA-02b unless separately authorized.
8. **No mobile work.** The MOBILE FREEZE remains binding.

### Bounded work that the evidence supports

After explicit authorization, a constrained 02b may:

- use the existing OrdersListPage and its current filters/pagination;
- show current stage and raw stage/order status from V1;
- use existing Product APIs for Product-first identity and traceability;
- correct the four existing My-Work destinations only after exact filter
  contracts are defined;
- remain desktop/shell-only and preserve all existing responsive behavior.

## Final batch result

```text
V1 authoritative runtime stage definitions: GO (bounded)
V2 production-orders list page coverage: GO (bounded)
V3 explicit Waiting-Blocked semantics: NO-GO
My-Work feed mapping: NO-GO as current implementation contract
Product-chain feasibility: GO for Product-first; NO-GO for order-first SKU as-is
Full UI-IA-02b authorization: NO-GO pending stop-list clearance
Mobile freeze: PASS / unchanged
Git diff: EMPTY
```