# UI-IA-02b — Production Order Intelligence Certification

**Date:** 2026-09-15  
**Product:** OCS One  
**Scope:** Desktop-only dashboard and Production Orders intelligence  
**Decision:** **CERTIFIED — bounded UI-IA-02b**

## Certification boundary

This certification covers the authorized bounded scope:

- the frozen nine-stage manufacturing runtime sequence;
- nullable-safe Model/SKU identity on Production Orders and dashboard order
  rows;
- ordinal current-stage progress against nine stages;
- client-side normalization of the dashboard pipeline to the frozen sequence;
- the existing raw stage/order statuses, without inventing canonical
  Waiting/Blocked workflow states;
- exactly four My Work destinations;
- desktop browser evidence only.

The MOBILE FREEZE remains unchanged. No bottom navigation, mobile IA, scanner
workflow, responsive redesign, mobile breakpoint, touch-target redesign, or
mobile-only component was added.

Waiting and Blocked remain response-level dashboard labels only. This batch
does not promote them to authoritative workflow states or add them as filters.
The nine manufacturing stages remain distinct from cell and dispatch queues.

## Authenticated visual evidence

The evidence was collected with the real login form in an authenticated FAT
Director browser session (`fat.director@fat.local`) using a desktop viewport.
The password was supplied out of band and is not recorded here.

Browser checks completed with:

```text
viewport: 1440x1100 for route captures
viewport: 2200x1200 for the wider pipeline capture
browser console errors: 0
page errors: 0
failed requests: 0
```

### Dashboard proof

| Requirement | Result | Evidence |
|---|---|---|
| Product name/SKU is visible and no raw `productId` is presented | **PASS** | [QC orders](qc-orders.png) shows `FAT E2E 16S 280Ah Battery Pack` and `FAT-E2E-MODEL-16S280`; the dashboard order surface uses the same nullable-safe projection |
| Current-stage progress is ordinal against nine stages | **PASS** | [QC orders](qc-orders.png) shows `8/9` and `89%`; [dashboard](director-dashboard.png) shows the Progress column |
| Frozen nine-stage sequence is rendered in order | **PASS** | [wide dashboard](director-dashboard-wide.png) and [pipeline right scroll](director-dashboard-pipeline-right.png) together show all nine labels: Cell allocation, Assembly, Compression, BMS installation, BMS programming, Charging, Testing, Quality Control, Packing |
| Pipeline grouping is client-side and stable | **PASS** | [wide dashboard](director-dashboard-wide.png) shows the ordered pipeline; [pipeline right scroll](director-dashboard-pipeline-right.png) shows the continuation after the horizontal strip scroll |
| My Work contains exactly four destinations | **PASS** | [dashboard](director-dashboard.png) shows QC approvals, Rework queue, Production in progress, and Dispatch ready; Details is collapsed and is not counted as My Work |

### My Work destination proof

| Card | Displayed count | Destination | Destination result | Match |
|---|---:|---|---:|---|
| QC approvals | 2 | `/manufacturing/orders?stage=quality_control&status=in_progress` | 2 orders | **PASS** |
| Rework queue | 1 | `/manufacturing/rework` | 1 open ticket | **PASS** |
| Production in progress | 7 | `/manufacturing/orders?status=in_progress` | 7 orders | **PASS** |
| Dispatch ready | 0 | `/fulfillment/dispatch` | `Packed (0)` | **PASS** |

Route captures:

- [QC approvals destination](qc-orders.png)
- [Rework queue destination](rework-queue.png)
- [Production in progress destination](in-progress-orders.png)
- [Dispatch ready destination](dispatch-ready.png)

The Dispatch ready source was corrected during this certification so it counts
the same authoritative `products.product_status = 'packed'` queue that
`/fulfillment/dispatch` renders. The response field and route are unchanged;
the card copy now states “packed products ready for dispatch.”

## Reservation sentinel

The current API passed the required reservation sentinel:

```text
CERT_BASE_URL=http://localhost:80
RES-01: PASS
RES-02: PASS
RES-03: PASS
RES-04: PASS
RES-05: PASS
RES-06: PASS
RES-07: PASS
RES-08: PASS
RES-09: PASS
RES-10: PASS
RES-11: PASS
RES-12: PASS
RES-13: PASS
RES-14: PASS
RES-15: PASS

TOTAL: 15 PASS / 0 FAIL / 0 MANUAL (15 verification points)
```

## Generated-contract evidence

The generated-contract diff was compared against the UI-IA-02b implementation
checkpoint (`d76b461`, whose parent is the preceding generated-contract
checkpoint). The change is **additive-only at the response shape level**:

- `ProductionOrder.productName` and `ProductionOrder.productSku` were added as
  nullable optional fields;
- the same two nullable fields were added to the OpenAPI response projection
  and regenerated TypeScript/Zod response contracts;
- `bms_programming` was added to the stage enum and generated stage types;
- `bms_allocation` was moved into its canonical position in the frozen
  sequence; this is an ordering correction, not removal of a stage;
- `productId` remains present and nullable;
- no generated endpoint, response field, or existing non-stage enum value was
  removed.

The generated changes were accepted by the API and UI typechecks and by the
production builds.

## Verification

```text
API typecheck: PASS
UI typecheck: PASS
API build: PASS
UI production build (PORT=21966 BASE_PATH=/): PASS
git diff --check: PASS
reservation sentinel: 15/15 PASS
authenticated visual evidence: PASS
```

The API and web workflows were restarted after the dispatch-source correction
and came back serving. The separate authz/audit workflow runs still contain
the previously observed transient HTTP 502 login crash; they are not used as
UI-IA-02b evidence and no UI-IA-02b assertion depends on them.

## Final result

```text
UI-IA-02b: CERTIFIED — bounded desktop scope
Nine-stage runtime sequence: PASS
Nullable-safe Product name/SKU projection: PASS
Ordinal progress against 9: PASS
Client-side pipeline grouping: PASS
Waiting/Blocked not promoted to canonical UI state: PASS
Exactly four My Work destinations: PASS
Destination count matching: 4/4 PASS
Reservation sentinel: 15/15 PASS
Generated contracts: additive-only response extension + canonical enum ordering
Mobile freeze: PASS / unchanged
```