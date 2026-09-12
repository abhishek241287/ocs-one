# OCS One FAT Master Test Plan

## 1. Purpose and frozen scope

This is a documentation-only Factory Acceptance Test package for the existing
OCS One system. It does not change application code, database schema, API
routes, UI, workflows, configuration, or seed logic.

**System under test**

- Frozen tag: `FAT-CANDIDATE-2026-09-08`
- Frozen tag object: `bca056ad1edcdce24b6466e9c857ba4ace3fe51e`
- Peeled application commit: `60564b1b49b76ce0b97e46d1de65a7325ef50ba7`
- Pre-remediation parent: `44894ec2c081ec9011f0683c010f207c66840fa5`

The tag is the baseline. Do not execute FAT against a later branch commit.

## 2. FAT objectives

Verify the complete operational chain:

```text
Login/session
  → engineering and inventory masters
  → BOM and workflow setup
  → procurement receipt / GRN
  → incoming inspection
  → inventory and cell processing
  → manufacturing order and stage execution
  → charging and QC
  → serialized product creation and packing
  → dispatch to dealer
  → dealer inventory / customer registration
  → warranty and 360° traceability
```

Every test must prove both:

1. The business result is correct.
2. The authorization, audit, transaction, and traceability side effects are
   correct.

## 3. Readiness status legend

- **READY — existing fixture:** the frozen candidate already contains a
  controlled fixture for the test.
- **DATA SETUP REQUIRED:** the route and behavior exist, but the current
  seeded/test data does not contain the records needed for an end-to-end
  business journey. This is a test-data gap, not a defect.
- **NOT COVERED:** the frozen candidate does not expose the required workflow
  surface, so FAT cannot execute it without a product change. Do not convert
  this into a feature request during FAT.

## 4. Entry and execution controls

1. Confirm the target is `FAT-CANDIDATE-2026-09-08`.
2. Start the API and web application from the frozen checkout.
3. Use non-default named accounts for manual FAT; never put passwords in the
   test evidence or this package.
4. Apply the data setup in `FAT_DATA_SETUP.md`.
5. Record the database snapshot or fixture version before each destructive or
   concurrency test.
6. Run positive cases before their paired negative cases where the positive
   case creates the required record.
7. Re-seed or restore the fixture before repeating H11, H14, H17, cell
   matching, or completion-concurrency cases.
8. Capture request, response, actor, timestamp, record IDs, and database
   evidence for every case.
9. A missing prerequisite is recorded as **DATA SETUP REQUIRED**, not FAIL.
10. A behavior mismatch with all prerequisites present is recorded in
    `FAT_DEFECT_LOG_TEMPLATE.md`.

## 5. Workflow coverage map

| Workflow | Main frozen-candidate surface | Primary role(s) | Status with current QA seed |
|---|---|---|---|
| Login, logout, current session | `/api/auth/login`, `/api/auth/logout`, `/api/auth/me` | All named users; Dealer only has session access outside portal | READY — existing users plus authz-created test users |
| User creation and role hierarchy | `/api/auth/register` | Owner, Director, Supervisor | DATA SETUP REQUIRED — named hierarchy accounts |
| Engineering masters | `/api/masters/*` | Read: all authenticated factory roles; writes vary by master | DATA SETUP REQUIRED — active masters and valid payloads |
| Material category/workflow routing | `/api/masters/material-categories`, `/api/masters/material-workflows`, `/api/inventory/material-workflow-assignments` | Director for governance writes | DATA SETUP REQUIRED |
| Product BOM | `/api/boms` | Owner, Director writes; all factory roles read | DATA SETUP REQUIRED — model, components, approved BOM |
| Procurement receipt / GRN | `/api/inventory/grns` | Supervisor, Director writes; all factory roles read | DATA SETUP REQUIRED — supplier, material, workflow assignment |
| Incoming inspection | `/api/inventory/inspections` | Supervisor, Director writes; all factory roles read | DATA SETUP REQUIRED — posted GRN with pending lines |
| Inventory ledger and transfers | `/api/inventory/stock`, `/api/inventory/transfers` | Supervisor, Director writes; all factory roles read | DATA SETUP REQUIRED — available inspected stock and cell bridge |
| Cell receiving / lots | `/api/cells/lots`, `/api/cells/inventory` | Director historical import; Operator/Supervisor/Director edits | DATA SETUP REQUIRED — cell lot and measurements |
| Cell grading and correction | `/api/cells/:id/grade`, `/api/cells/:id/correct`, `/api/cells/config` | Grade: Operator/Supervisor/Director; correction: Supervisor/Director; config: Supervisor/Director | DATA SETUP REQUIRED |
| Cell matching and allocation | `/api/cells/matches`, `/api/manufacturing/orders/:id/allocated-cells` | Operator, Supervisor, Director | DATA SETUP REQUIRED — enough graded cells and order |
| Manufacturing order | `/api/manufacturing/orders` | Supervisor, Director writes; factory roles read | DATA SETUP REQUIRED — product model and approved BOM |
| Manufacturing stage lifecycle | `/api/manufacturing/orders/:id/stages/:stage/*` | Operator, Supervisor, Director | DATA SETUP REQUIRED — order with valid preceding stages |
| Charger management and charging | `/api/manufacturing/charger-units`, charging stage | Supervisor, Director for charger master; Operator/Supervisor/Director for stage execution | READY for H17 race only; DATA SETUP REQUIRED for full charge lifecycle |
| Material Issue Note | `/api/manufacturing/orders/:id/material-issues` | Supervisor, Director writes; factory roles read | DATA SETUP REQUIRED — approved BOM, posted/available stock, traceability lots |
| Test results and QC | `/api/manufacturing/orders/:id/test-results`, `/qc-approval`, `/stages/quality_control/approve` | Test execution: Operator/Supervisor/Director; QC/stage approval: Supervisor/Director | DATA SETUP REQUIRED — order through testing with test equipment |
| Rework | `/api/manufacturing/rework` | Supervisor, Director | DATA SETUP REQUIRED — rejected QC order/rework ticket |
| Serialized product and packing | `/api/products`, `/api/products/imported`, `/api/packing` | Product creation/packing: Supervisor, Director | DATA SETUP REQUIRED — model/category and completed QC order |
| Dispatch document | `/api/dispatch` | Supervisor, Director | DATA SETUP REQUIRED — packed product and active dealer |
| Legacy dispatch freeze | `/api/logistics/dispatch-orders` | Owner write only; factory roles read | READY for authorization negative/positive gate tests |
| Dealer portal | `/api/dealers/:id/inventory`, `/dispatch-history` | Factory roles read any; Dealer read own dealer only | READY for isolation; DATA SETUP REQUIRED for non-empty portal projections |
| Customer registration | `/api/customers/registrations` | Supervisor, Director create; factory roles read | DATA SETUP REQUIRED — dispatched/delivered product |
| Warranty | `/api/warranties` | Factory roles read; Supervisor/Director void | DATA SETUP REQUIRED — warranty-bearing product/registration |
| 360° product traceability | `/api/products/:id/traceability`, genealogy, events | All authenticated factory roles read | DATA SETUP REQUIRED — complete serialized lifecycle |
| Reports and dashboards | `/api/dashboard`, `/api/reports/*` | Read: Director/Supervisor for reports; dashboard varies by route | DATA SETUP REQUIRED — representative transactions |
| Service-ticket lifecycle | No service-ticket route is mounted in the frozen candidate | None | NOT COVERED — existing UAT text describes a workflow not exposed by this baseline |

## 6. Role execution plan

Execute every applicable business case at least once with the required role,
then execute the paired unauthorized role cases:

- **Owner:** governance, all role-gated writes, legacy dispatch write, and
  unrestricted read baseline.
- **Director:** master/BOM governance, inventory, manufacturing approval,
  dispatch, customer registration, warranty void, and reports.
- **Supervisor:** operational inventory, GRN, inspection, manufacturing,
  QC, packing, dispatch, customer registration, and warranty void.
- **Operator:** cell grading/matching and manufacturing stage/test execution;
  must be denied governance, inventory, QC approval, packing, dispatch, and
  customer-registration writes.
- **Viewer:** authenticated read-only checks; every write must be denied.
- **Dealer:** `/auth/me` plus own dealer inventory/dispatch history only;
  factory routes and another dealer's portal data must be denied.

The full action-by-action matrix is in `FAT_ROLE_MATRIX.md`.

## 7. Transaction and integrity gates

The following are release-blocking FAT gates:

1. Inventory is an append-only signed ledger. GRN posting creates the expected
   transaction rows exactly once; a Store → Cell Processing transfer creates one
   negative source movement and an immutable `material_transfer` linked to one
   `cell_lot` and its generated `cells`. The destination is reconciled across
   those domains; it is not represented by a second `available` row on the
   original GRN line. Transfer create/detail responses expose the same
   cross-domain reconciliation, and stock, provenance, picker, and cell-report
   projections must retain the source balance and destination count.
2. Inspection cannot be repeated for the same GRN and cannot partially cover
   pending lines.
3. Cell grading and correction preserve the cell-lot timeline and do not
   silently alter immutable lot identity.
4. Cell matching cannot allocate the same cell to two accepted matches.
5. Genealogy is idempotent under stage retries and completion retries.
6. Charger reservation is atomic: two concurrent starts against one charger
   yield at most one success.
7. Completion has one shared gate for QC approval and terminal stage approval;
   concurrent completion cannot mint two products or orphan a completed order.
8. Packing and dispatch transition only eligible product states and preserve
   serial identity.
9. Dispatch documents snapshot dealer code, name, address, GST, contact, and
   mobile into the dispatch header; later dealer-master edits must not rewrite
   an issued document.
10. Customer registration is rejected before dispatch and is unique per product.
11. Product traceability resolves the same serial through manufacturing,
    genealogy, product events, dispatch, customer, and warranty records.

## 8. Frozen-tag preparation verification

### C1 dealer isolation

The frozen tag contains both required C1 fixes:

- `artifacts/api-server/src/middleware/auth.ts` exempts only the `/dealers`
  portal prefix from the global dealer factory-route denial. Dealer users can
  reach the portal surface but remain denied manufacturing, inventory, masters,
  and other factory routes.
- `artifacts/api-server/src/routes/dealers/index.ts` extracts the target
  dealership from `req.path.split("/")[1]`. This is required because
  `req.params` is empty when the router-level middleware runs.

The tag's peeled commit remains `60564b1b49b76ce0b97e46d1de65a7325ef50ba7`.
The C1 changes are part of that commit; no later C1 commit is the system under
test.

### DISP-3

The frozen dispatch implementation does not reproduce a live-master lookup
problem for issued dispatch documents. `POST /api/dispatch` copies dealer code,
name, address, GST, contact, and mobile into the dispatch header, and
`GET /api/dispatch/:id` renders those header snapshot fields. Product event
metadata also records the dealer identity/name at dispatch time.

Record DISP-3 as:

> **Medium — business acceptance decision required; no software patch in this
> preparation task.**

This is a document-policy acceptance item rather than a Critical/High FAT
blocker. Business acceptance must confirm that the frozen snapshot fields meet
the required historical-commercial-document policy. If an operational
workaround is used, label it as an operational workaround, not a software fix.

### QC route contract

The frozen candidate mounts both QC surfaces:

- `POST /api/manufacturing/orders/:id/qc-approval` records the QC decision,
  updates the quality-control stage, opens rework on rejection, and calls the
  shared completion gate on approval.
- `POST /api/manufacturing/orders/:id/stages/quality_control/approve` performs
  generic stage sign-off and calls the same shared completion gate when the
  quality-control stage is approved.

The FAT package must not describe `qc-approval.ts` as nonexistent. Use the
route appropriate to the assertion: QC decision/rework for the first route,
generic stage sign-off for the second. Both are guarded for
Supervisor/Director writes.

## 9. Exit criteria

FAT is ready for sign-off only when:

- All cases marked READY have PASS evidence.
- Every DATA SETUP REQUIRED case either has its setup completed and passes, or
  remains explicitly listed in the readiness report.
- All six named roles have authorization evidence.
- No open Critical or High defect remains without an approved disposition.
- Transaction-integrity and concurrency gates pass.
- The exact frozen tag and peeled commit are recorded in the sign-off.
