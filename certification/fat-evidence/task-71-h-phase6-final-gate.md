# Batch 71-H — Phase 6 Final Certification Gate

## Append-only evidence log

### 2026-09-14 — PH4-03 harness correction

The legacy Phase 4 forced-lot test now selects the lot by the second fixture GRN's detail response (`GET /api/inventory/grns/:id`), matching the exact fixture GRN line and its `lot_id`. It no longer relies on inventory-lot list ordering or positional selection. This is a certification-harness-only change; application routes and inventory behavior were not changed.

### 2026-09-14 — Regression-wall limiter isolation

The 71-H regression wall now restarts its isolated API process between every legacy child suite. This prevents cumulative in-memory authentication-limiter state from making later suites fail during concurrent login setup. This is a harness-only isolation change; application routes were not changed.

### 2026-09-14 — Temporary API process-group cleanup

The isolated regression API is now launched and terminated as a process group so restarting a suite removes the package-manager wrapper and its child server together. This prevents a stale child process from retaining limiter state or serving the next suite. This is a harness-only change.

### 2026-09-14 — Authoritative 71-H certification result

Batch 71-H passed from the full gate process. Manual, CSV, keyboard-wedge scan, transformer, and cable scenarios passed; C-01 through C-07 passed; I01 through I20 passed; the complete isolated regression wall passed, including FAT read-only smoke with 32/32 checks; and teardown reported zero users, suppliers, materials, categories, units, attributes, templates, imports, scans, or GRNs remaining.