# Task 70-F — Phase 4 WIP Certification Gate

- Run date: 2026-09-13
- Environment: development API and development database only
- Scope: Tasks 70-C, 70-D, and 70-E consumption, reversal, and WIP read projections
- Fixture policy: isolated certification fixtures; no production database or frontend changes

## PH4 gate

`pnpm --filter @workspace/api-server run test:phase4-wip`

- Result: **PASS**
- PH4 assertions: **17/17 PASS**
- Invariant and hygiene assertions: **15/15 PASS for the isolated run**
- Fixture correction: the suite now creates an isolated production warehouse and location and attaches both to generated GRN lines and lots. This is required by the WIP issue route.
- Teardown: generated WIP, reservations, issues, ledger rows, GRNs, masters, users, warehouse, and location were removed. Final fixture residue check: `0|0|0|0|0|0`.

### Invariant disclosure

The global development ledger still contains one pre-existing negative balance:

```text
material_id = fa130000-0000-4000-8000-000000000017
stock_state = wip
balance = -0.500
```

This is the FAT BMS baseline already identified during Task 70-E. It is outside the 70-F fixture set; the 70-F suite reports it as a baseline exception and fails the gate only if a new negative balance is introduced. It was not introduced or changed by this run.

## Required regression gate

| Check | Result |
|---|---|
| API healthz | **PASS** — `{"status":"ok"}` |
| Workspace typecheck | **PASS** |
| `git diff --check` | **PASS** |
| Reservation certification | **PASS** — 15/15 |
| Procurement PO certification | **PASS** — 15/15 |
| Receiving certification | **PASS** — 12/12 |
| SS-02 authorization | **PASS** — 777 endpoint assertions + 12 dealer-assignment checks |
| SS-03 audit | **PASS** — 13 audited operations; immutability checks passed |
| SS-04 configuration | **PASS** — 31 pass, 3 documented development warnings, 0 fail |
| Option A transfer-domain certification | **PASS** |
| FAT read-only smoke | **PASS** — 32/32 after resetting transient auth rate-limit state |
| MIN list smoke | **PASS** — `GET /api/manufacturing/orders/fa180000-0000-4000-8000-000000000001/material-issues` returned HTTP 200 with `{items, meta}` |

The first FAT smoke attempt was `12/32` because prior certification traffic had saturated the development auth limiter; after one API workflow restart, the unchanged smoke run passed `32/32`. No application assertion failed.

## Scope and disposition

- Changed implementation scope: 70-F certification fixture and runner only, plus its package script.
- No frontend, generated API, production database, manual commit, or unrelated accounting changes were made.
- 70-C, 70-D, and 70-E evidence remains in their separate records.
- **Disposition:** Phase 4 behavior and isolated certification pass. Release sign-off should retain the documented pre-existing FAT BMS `-0.500` WIP ledger exception until the development baseline is repaired or formally accepted.