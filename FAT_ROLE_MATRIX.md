# OCS One FAT Role Matrix

## 1. Role semantics

The matrix is derived from the frozen candidate's route guards and SS-02
authorization matrix. Owner is the explicit unrestricted role: it passes every
`requireRole` and `requireWriteRole` gate. A check marked **R** means an
authenticated read is allowed; **W** means the role is allowed to perform the
write; **—** means the role must receive 403 (or 401 if anonymous).

Dealer is not a factory role. It may log in, read `/api/auth/me`, and read only
its own `/api/dealers/:dealerId/inventory` and
`/api/dealers/:dealerId/dispatch-history`.

## 2. Major action matrix

| Action family | Owner | Director | Supervisor | Operator | Viewer | Dealer |
|---|---:|---:|---:|---:|---:|---:|
| Login, logout, `/auth/me` | R/W | R/W | R/W | R/W | R/W | R/W |
| Create users | W | W within hierarchy | W for Operator/Viewer only | — | — | — |
| Read factory dashboards/lists | R | R | R | R | R | — |
| Engineering master read | R | R | R | R | R | — |
| Product/cell/component master writes | W | W | — | — | — | — |
| Product/material category/workflow governance writes | W | W | — | — | — | — |
| Material and supplier writes | W | W | — | — | — | — |
| Material workflow assignment | W | W | — | — | — | — |
| BOM read | R | R | R | R | R | — |
| BOM create/update/approve/obsolete | W | W | — | — | — | — |
| GRN create/post/delete | W | W | W | — | — | — |
| GRN/inspection/stock/transfer read | R | R | R | R | R | — |
| Incoming inspection create | W | W | W | — | — | — |
| Inventory transfer create | W | W | W | — | — | — |
| Historical cell-lot import | W | W | — | — | — | — |
| Cell-lot edit | W | W | W | W | — | — |
| Cell grade | W | W | W | W | — | — |
| Cell correction | W | W | W | — | — | — |
| Grade configuration | W | W | W | — | — | — |
| Cell matching | W | W | W | W | — | — |
| Manufacturing order create/update | W | W | W | — | — | — |
| Manufacturing stage start/complete/approve/reject | W | W | W | W | — | — |
| Charger-unit create/update/status | W | W | — | — | — | — |
| Test-result execution | W | W | W | W | — | — |
| Material Issue Note create/reverse | W | W | W | — | — | — |
| QC approval/rejection | W | W | W | — | — | — |
| Rework update | W | W | W | — | — | — |
| Serialized product status/imported product create | W | W | W | — | — | — |
| Packing | W | W | W | — | — | — |
| Modern dispatch create/reverse | W | W | W | — | — | — |
| Legacy dispatch-order write | W | — | — | — | — | — |
| Dealer-master write | W | W | — | — | — | — |
| Dealer portal read, own dealer only | R | R | R | R | R | R |
| Dealer portal read, another dealer | R | R | R | R | R | — |
| Customer registration create | W | W | W | — | — | — |
| Warranty read | R | R | R | R | R | — |
| Warranty void | W | W | W | — | — | — |
| Operational reports | R | R | R | — | — | — |
| Developer security/config/performance | R | R | — | — | — | — |

For read routes inside a write-guarded router, the router's
`requireWriteRole` intentionally passes GET for all authenticated factory
roles. The matrix therefore distinguishes the read and write operation.

## 3. Required negative authorization checks

For each row with a `—`, capture the authenticated response as 403. Also
execute one anonymous request for each representative route and capture 401.

Minimum negative set:

| ID | Request | Expected denial |
|---|---|---|
| RBAC-N01 | Viewer `POST /api/masters/products` | 403 |
| RBAC-N02 | Supervisor `POST /api/boms` | 403 |
| RBAC-N03 | Operator `POST /api/inventory/grns` | 403 |
| RBAC-N04 | Viewer `POST /api/manufacturing/orders/:id/stages/assembly/start` | 403 |
| RBAC-N05 | Operator `POST /api/manufacturing/orders/:id/stages/quality_control/approve` | 403 |
| RBAC-N06 | Operator `POST /api/manufacturing/orders/:id/qc-approval` | 403 |
| RBAC-N07 | Viewer `POST /api/packing` | 403 |
| RBAC-N08 | Director `POST /api/logistics/dispatch-orders` | 403 |
| RBAC-N09 | Supervisor `POST /api/logistics/dispatch-orders` | 403 |
| RBAC-N10 | Dealer `GET /api/manufacturing/orders` | 403 |
| RBAC-N11 | Dealer `GET /api/dealers/{otherDealerId}/inventory` | 403 |
| RBAC-N12 | Dealer `GET /api/dealers/{ownDealerId}/inventory` | not 403 |
| RBAC-N13 | Anonymous `GET /api/auth/me` | 401 |

## 4. Cross-role evidence

The SS-02 suite provides the exhaustive 110-endpoint × 7-principal matrix.
Manual FAT evidence must still retain the business-record IDs used for the
positive path and the response status/body for each negative path. A 400/404
after a role gate is acceptable for an allowed role when the test intentionally
uses a nonexistent ID or invalid body; it proves the request passed
authorization without mutating data.

## 5. Preflight before manual FAT

Run the read-only fixture gate after seeding and immediately before starting a
manual FAT journey:

```sh
FAT_TEST_PASSWORD='provided out of band' pnpm cert:fat:preflight
FAT_TEST_PASSWORD='provided out of band' pnpm cert:fat:smoke
```

The database preflight and authenticated route smoke are limited to the
`FAT-E2E-*` fixture namespace. The preflight checks that all
six role accounts can accept the seeded password, the dealer linkage is intact,
the canonical nine-stage workflow is present, and the BOM/procurement/cell
ledger/manufacturing genealogy/dispatch/customer-registration/warranty records
still have the route-facing state required by FAT. It also verifies that both
charger-race orders and the pending cell match are ready for concurrency
coverage. The smoke then logs in each seeded role and performs only authenticated
read checks for `/api/auth/me`, dealer inventory/history, manufacturing
stages/genealogy, dispatch detail, customer registration, and warranty detail.
It asserts the returned records use the expected FAT IDs and does not seed,
update, delete, void, or reset fixture state.

Both commands print grouped pass/fail evidence and never print the password,
password hash, session cookie, or other credentials. A non-zero exit from either
command means the fixture or route contract has drifted and manual FAT should
not start. The smoke writes `fat-readonly-smoke-evidence.json` and
`fat-readonly-smoke-evidence.md` alongside the existing FAT evidence.
