# OCS One FAT Test Cases

## 1. Execution conventions

Run against `FAT-CANDIDATE-2026-09-08` (`60564b1b49b76ce0b97e46d1de65a7325ef50ba7`).
`FAT_DATA_SETUP.md` defines the data references used below.

For every case capture:

- Case ID, date/time, environment, frozen commit/tag.
- Actor role, actor ID/email alias, and session correlation/request ID.
- Request method/path and sanitized request body.
- HTTP status and response body.
- Created/changed record IDs and before/after values.
- Relevant audit event, timeline event, ledger rows, genealogy rows, or
  product event.
- Screenshot or exported JSON for UI/API evidence.

Expected 400/404 from an authorized request is not a failure when the case
intentionally uses invalid input or a dummy ID to prove the role gate opened.

The frozen candidate exposes both QC contracts. Use
`POST /api/manufacturing/orders/:id/qc-approval` to record a QC decision and
exercise the QC/rework path. Use
`POST /api/manufacturing/orders/:id/stages/quality_control/approve` to exercise
generic stage sign-off. Both call the shared order-completion gate on approval.

## 2. Authentication and identity

| ID | Type | Role | Preconditions / data | Action | Expected result | Evidence |
|---|---|---|---|---|---|---|
| AUTH-P01 | Positive | Owner, Director, Supervisor, Operator, Viewer, Dealer | Active named account | `POST /api/auth/login` with valid credentials | 200; httpOnly `ocs_token` cookie; response contains correct user and `dealerId` (`null` for factory users, Dealer A for Dealer) | Sanitized response, cookie flags, login-success audit |
| AUTH-P02 | Positive | All six roles | Successful login | `GET /api/auth/me` | 200; role and identity match login; Dealer includes own `dealerId` | Response JSON and audit correlation |
| AUTH-P03 | Positive | Owner | Valid new-user payload for Director/Dealer | `POST /api/auth/register` | 201; new account is active and audit logged | New user ID, role, audit event |
| AUTH-P04 | Positive | Director | Valid payload for Supervisor/Operator/Viewer/Dealer | `POST /api/auth/register` within hierarchy | 201 for permitted target roles | New user ID and hierarchy evidence |
| AUTH-P05 | Positive | Supervisor | Valid Operator or Viewer payload | `POST /api/auth/register` | 201 | New user ID and audit event |
| AUTH-N01 | Negative | Any role | Bad password or unknown email | `POST /api/auth/login` | 401; no session cookie; failed-login event does not reveal account existence | Response and `auth.login.failed` event |
| AUTH-N02 | Negative | Anonymous | No cookie | `GET /api/auth/me` and one protected route | 401 | Status/body for both requests |
| AUTH-N03 | Negative | Supervisor | Attempt to create Director or Owner | `POST /api/auth/register` | 403; no user created | Status and user-count query |
| AUTH-N04 | Negative | Operator, Viewer, Dealer | Any registration payload | `POST /api/auth/register` | 403; no user created | Status and audit denial |
| AUTH-N05 | Negative | Authenticated user | Valid session then logout | `POST /api/auth/logout`, then call `/auth/me` | Logout clears cookie; subsequent session request is 401 | Set-Cookie and final status |

## 3. Masters, workflow routing, and BOM

| ID | Type | Role | Preconditions / data | Action | Expected result | Evidence |
|---|---|---|---|---|---|---|
| MAS-P01 | Positive | All factory roles | Active master rows exist | GET each applicable `/api/masters/*` list/detail | 200; active/inactive/status and linked-master data are accurate | Response export and master IDs |
| MAS-P02 | Positive | Owner/Director | Valid product/component master payload | POST a new master, then PATCH a mutable display field | 201 then 200; response is the canonical projection | IDs, before/after projection, audit |
| MAS-P03 | Positive | Director | Category/workflow data and assignment payload | Create/update product category, material category, product workflow, material workflow, and material-workflow assignment | 201/200; assignment drives GRN routing | IDs and assignment response |
| MAS-P04 | Positive | Owner/Director | Active model/category and component masters | Create BOM revision, add valid lines, approve it | Draft then approved; exact quantities/traceability flags retained | BOM detail before/after and approval event |
| MAS-N01 | Negative | Supervisor, Operator, Viewer | Existing master/BOM | Attempt governance master or BOM write | 403; no row/version/status mutation | Status and before/after query |
| MAS-N02 | Negative | Dealer | Any master/BOM endpoint | GET and POST factory master/BOM route | 403, including reads | Status/body and denial audit |
| MAS-N03 | Negative | Owner/Director | Duplicate code or invalid foreign key | Submit duplicate/invalid master or BOM | 409/400/422 as applicable; no partial row | Response and database count |
| MAS-N04 | Negative | Owner/Director | Approved/used BOM | Attempt illegal update/delete/obsolete transition | Guarded rejection; approved history remains intact | Status and immutable revision evidence |

## 4. Procurement, GRN, incoming inspection, and inventory

| ID | Type | Role | Preconditions / data | Action | Expected result | Evidence |
|---|---|---|---|---|---|---|
| INV-P01 | Positive | Supervisor/Director | Supplier, active material, workflow assignment | `POST /api/inventory/grns` with valid lines | 201 draft GRN with generated `GRN-*` number | GRN header/lines and audit |
| INV-P02 | Positive | Supervisor/Director | Draft GRN with valid lines | `POST /api/inventory/grns/:id/post` | 200 posted; inventory transaction rows created exactly once | GRN status, transaction list, stock summary |
| INV-P03 | Positive | Supervisor/Director | Posted GRN with pending lines | GET `/api/inventory/inspections/eligible`, then POST inspection covering all lines | 201 inspection; line inspection states update; inspection number generated | Inspection detail and line states |
| INV-P04 | Positive | Supervisor/Director | Inspected available stock and cell-linked material | `POST /api/inventory/transfers` for a positive whole-cell quantity | 201 transfer; one negative source movement; destination represented by the linked `material_transfer` + `cell_lot` + generated `cells` domain | Transfer, lot/cells, source ledger row, cross-domain reconciliation |
| INV-P05 | Positive | All factory roles | Existing GRN/inspection/stock/transfer records | GET lists, detail, transactions, stock/provenance | 200 and consistent read projections | Exported responses and ledger query |
| INV-N01 | Negative | Operator/Viewer | Any GRN/inspection/stock/transfer payload | Attempt write | 403; no mutation | Status/body and unchanged counts |
| INV-N02 | Negative | Supervisor/Director | Unknown material, empty GRN, invalid FK | Create GRN | 400/409; no draft or partial lines | Response and row count |
| INV-N03 | Negative | Supervisor/Director | Draft GRN with no lines or invalid workflow | Post GRN | 409/422; remains draft; no receipt transactions | GRN status and transaction count |
| INV-N04 | Negative | Supervisor/Director | Posted GRN or already-inspected GRN | Delete GRN or inspect twice | 409; posted history remains immutable | Status and before/after ledger |
| INV-N05 | Negative | Supervisor/Director | Transfer quantity greater than available or fractional | Create transfer | 400/422; no transfer, lot, or ledger rows | Response and counts |
| INV-P06 | Positive / integrity | Supervisor/Director | Controlled FAT fixture with opening balance and receipt/transfer/MIN/reversal records | Reconcile opening available quantity + receipts + valid transfers in − transfers out − material issues +/- valid reversals against application available stock | Every material/category total reconciles to the signed inventory ledger; no unexplained delta | Reconciliation worksheet, stock projection, and ledger export |

## 5. Cell receiving, grading, and matching

| ID | Type | Role | Preconditions / data | Action | Expected result | Evidence |
|---|---|---|---|---|---|---|
| CELL-P01 | Positive | Director | Valid historical/import lot payload and justification | `POST /api/cells/lots` | 201; cells created; `lot_received` event written | Lot, cell count, event |
| CELL-P02 | Positive | Operator/Supervisor/Director | Received lot with mutable fields | PATCH `/api/cells/lots/:id` | 200; permitted fields update; timeline records update | Before/after and event |
| CELL-P03 | Positive | Operator/Supervisor/Director | Cells with measurements and known thresholds | POST `/api/cells/:id/grade` per cell | Grade assigned; inventory/lot counts update; audit/timeline event | Cell grades and `cell_graded` events |
| CELL-P04 | Positive | Operator/Supervisor/Director | Enough graded cells and order | Create cell match, inspect score/slots, accept it | Match accepted; cells allocated once; genealogy/allocation evidence exists | Match detail, cell statuses, allocation rows |
| CELL-N01 | Negative | Supervisor/Director | Cell below threshold | Grade the cell | Reject grade; cell excluded from allocation | Grade/config evidence |
| CELL-N02 | Negative | Viewer | Received lot/cell | Attempt grade, correction, or match write | 403; no mutation | Status and unchanged cell |
| CELL-N03 | Negative | Operator | Existing graded cell | Attempt correction | 403; original grade and correction ledger unchanged | Status and audit |
| CELL-N04 | Negative | Any factory role | Lot already in grading/graded state | Attempt identity-locked lot edit | 422/409; immutable identity remains | Response and lot history |
| CELL-N05 | Negative | Operator/Supervisor/Director | Insufficient cells or stale match | Create/accept match | 400/404/409; no duplicate allocation | Match status and cell ownership |

## 6. Manufacturing order, materials, stages, and charging

| ID | Type | Role | Preconditions / data | Action | Expected result | Evidence |
|---|---|---|---|---|---|---|
| MFG-P01 | Positive / configuration | Supervisor/Director | Product model and approved BOM | Create production order, then read its stage list | 201; exactly these nine stages exist in this order: `cell_allocation`, `assembly`, `compression`, `bms_allocation`, `bms_programming`, `charging`, `testing`, `quality_control`, `packing`; no duplicate or extra stage | Order stage list, plus comparison to the frozen candidate's `STAGE_ORDER` |
| MFG-P02 | Positive | Operator/Supervisor/Director | Order with preceding stage approved | Start and complete a normal stage with valid operator/stage data; Supervisor/Director approves via `POST /api/manufacturing/orders/:id/stages/:stage/approve` | Correct state transitions; stage timeline event; next stage unlocks | Stage row, request/response, and timeline |
| MFG-P03 | Positive | Supervisor/Director | Approved BOM, available lots, exact quantities | Preview and issue MIN | 201; exact BOM quantity consumed; traceability references stored | MIN, lines, negative ledger, source lots |
| MFG-P04 | Positive | Operator/Supervisor/Director | H17 or clean order with available charger | Start and complete charging with valid stage data | Charger reserved/released only for owning order; formation report written | Charger state, stage, formation report, genealogy |
| MFG-P05 | Positive | Operator/Supervisor/Director | Allocated cells and valid stage data | Complete BMS allocation/programming | Genealogy entries created idempotently; stage advances | Genealogy count and timeline |
| MFG-N01 | Negative | Operator/Viewer | Any order | Create/update order or charger master | 403; no record change | Status and counts |
| MFG-N02 | Negative | Viewer | Order ready for stage | Start/complete/approve/reject stage | 403 | Status/body |
| MFG-N03 | Negative | Supervisor/Director | Order without approved BOM or missing stock | Create/issue MIN | 404/409/422; no partial consumption | Response, MIN count, ledger |
| MFG-N04 | Negative | Operator/Supervisor/Director | Stage not eligible or invalid predecessor | Start/complete/approve out of order | 409/422; stage state unchanged | Stage history |
| MFG-N05 | Negative | Any caller | Charger already busy or maintenance | Start charging with that charger | Rejected; second order does not own charger | Both order stages and charger row |

## 7. Concurrency and idempotency

| ID | Type | Role | Preconditions / data | Concurrent action | Expected result | Evidence |
|---|---|---|---|---|---|---|
| CONC-P01 | Positive | Operator/Supervisor | Two orders at charging-ready; one available charger | Send two simultaneous `POST /api/manufacturing/orders/:id/stages/charging/start` requests with the same charger | At most one 2xx; other request rejects; charger has one `current_order_id` | Both responses, charger row, stage rows, transaction log |
| CONC-P02 | Positive | Operator/Supervisor | Two callers have same pending cell match and adequate cells | Send two simultaneous match-accept requests | At most one acceptance; no cell appears in two accepted matches | Both responses, match rows, cell allocation query |
| CONC-P03 | Positive | Supervisor/Director | One order at the terminal/QC completion boundary with valid model, QC, genealogy | Send terminal-stage approval and QC approval concurrently | One logical completion; one product; one completion event; no orphan completed order | Responses, order, product, genealogy, event counts |
| CONC-N01 | Negative | Operator/Supervisor | Charger race fixture | Repeat after one success without reset | Previously reserved charger remains unavailable to another order | Charger owner and rejection |
| CONC-N02 | Negative | Supervisor/Director | Completed order/product | Repeat completion request sequentially | Idempotent rejection or stable already-completed response; no second product | Product count and order state |

## 8. QC, product, packing, and dispatch

| ID | Type | Role | Preconditions / data | Action | Expected result | Evidence |
|---|---|---|---|---|---|---|
| FUL-P01 | Positive | Operator/Supervisor/Director | Testing-ready order and test equipment | Create/complete test results | Results persist with operator/equipment/timestamps | Test-result detail |
| FUL-P02 | Positive | Supervisor/Director | QC-ready order with passing tests and complete genealogy | `POST /api/manufacturing/orders/:id/qc-approval` with `decision=approved` | QC decision recorded; quality-control stage approved; shared completion gate mints exactly one serialized product | QC row, stage row, order, product, genealogy |
| FUL-P03 | Positive | Supervisor/Director | QC-ready order | POST QC rejection with failure data | QC rejected; rework ticket open; stage rejected | QC, rework, timeline |
| FUL-P04 | Positive | Supervisor/Director | QC-ready order with passing tests and complete genealogy | Complete the quality-control stage and call `POST /api/manufacturing/orders/:id/stages/quality_control/approve` | Generic stage sign-off uses the same completion gate; one product only and no orphan completed order | Stage, order, product, genealogy, and event counts |
| FUL-P05 | Positive | Supervisor/Director | Product in `ready_for_packing` | POST `/api/packing` with packing date/operator | Product becomes packed; immutable `product.packed` event | Product status and event |
| FUL-P06 | Positive | Supervisor/Director | Packed product and active dealer | POST `/api/dispatch` | Dispatch document created; product becomes dispatched; dealer snapshot stored in the dispatch header | Dispatch header/detail, item, product event |
| FUL-P07 | Positive | Supervisor/Director | Dispatched product | POST customer registration | Registration created only after dispatch; customer fields and serial resolve | Registration and product/dealer evidence |
| FUL-N01 | Negative | Operator/Viewer | Any QC/packing/dispatch payload | Attempt write | 403 | Status/body |
| FUL-N02 | Negative | Supervisor/Director | Failed/non-ready product | Pack it | 422; no products in batch change state | Response and product statuses |
| FUL-N03 | Negative | Supervisor/Director | Unpacked or non-eligible product | Dispatch it | 400/422; no dispatch document | Response and counts |
| FUL-N04 | Negative | Supervisor/Director | Product not dispatched or already registered | Register customer | 400/409; no duplicate registration | Response and registration count |
| FUL-N05 | Negative | Supervisor/Director | Existing dispatch | Reverse dispatch twice or invalid reason | First valid reversal only; duplicate rejected; append-only reversal evidence | Dispatch/reversal rows |

## 9. Dealer, warranty, and traceability

| ID | Type | Role | Preconditions / data | Action | Expected result | Evidence |
|---|---|---|---|---|---|---|
| PORTAL-P01 | Positive | Dealer | QA Dealer A user and Dealer A ID | GET own inventory and dispatch history | Not 403; only Dealer A rows returned | Response and row ownership |
| PORTAL-P02 | Positive | Factory roles | Dealer A/B exist | GET either dealer portal projection | Factory role can read requested dealer projection | Response and role |
| PORTAL-N01 | Negative | Dealer | Dealer A session and Dealer B ID | GET Dealer B inventory/history | 403; no Dealer B data | Status/body and denial audit |
| PORTAL-N02 | Negative | Dealer | Dealer session | GET any factory route | 403 | Status/body |
| WAR-P01 | Positive | All factory roles | Warranty-bearing product | GET `/api/warranties` and `/api/warranties/:id` | Warranty and computed status resolve to product/dealer/customer | Warranty JSON |
| WAR-P02 | Positive | Supervisor/Director | Open warranty | POST `/api/warranties/:id/void` with valid reason | Warranty voided once and event/audit recorded | Before/after warranty |
| WAR-N01 | Negative | Operator/Viewer/Dealer | Warranty ID | Attempt void or factory warranty read as Dealer | 403 | Status/body |
| TRACE-P01 | Positive | All factory roles | Fully linked serialized product from FUL-P06 | GET product, genealogy, events, traceability | One serial resolves across manufacturing, fulfillment, customer, warranty timeline | Four response exports and serial cross-check |
| TRACE-N01 | Negative | Any factory role | Unknown product UUID | GET traceability/genealogy/events | 404; no fabricated partial trace | Response |
| TRACE-N02 | Negative / integrity | Supervisor/Director | Existing product with an official serial | Attempt to create/import a second product using the existing serial | Request rejected; original product unchanged; no second product, duplicate genealogy, or duplicate traceability chain | Response, product count, serial uniqueness query, genealogy/event counts |

## 10. Reports and dashboards

| ID | Type | Role | Preconditions / data | Action | Expected result | Evidence |
|---|---|---|---|---|---|---|
| RPT-P01 | Positive | Director/Supervisor | Representative GRN, production, QC, dispatch records | GET operational report endpoints | Counts reconcile to source tables | Report export and reconciliation sheet |
| RPT-P02 | Positive | Director | Any data | GET developer security/configuration/performance views | 200 and values agree with frozen config/cert suites | Screenshots/JSON |
| RPT-N01 | Negative | Operator/Viewer/Dealer | Authenticated session | GET restricted reports/developer views | 403 | Status/body |

## 11. Fixture reset integrity

| ID | Type | Role | Preconditions / data | Action | Expected result | Evidence |
|---|---|---|---|---|---|---|
| DATA-P01 | Positive / integrity | FAT operator with approved reset access | A completed destructive or concurrency case and its isolated fixture group | Reset the group, then verify charger availability, cell allocation state, production-order state, product count, ledger counts, genealogy counts, and absence of fixture orphans | Fixture returns to its documented starting state; no records outside the FAT namespace are changed | Before/after counts, namespace query, and reset log |
