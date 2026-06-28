# CW-03 — Manufacturing Orders: Defect Log

| Field | Value |
|-------|-------|
| **Wave** | CW-03 |
| **Module** | Manufacturing Orders (Product-Platform-based) |
| **Batch-MAT run date** | 2026-06-28 |
| **Total defects** | 1 |
| **Open Critical / High / Medium** | 0 / 0 / 0 |
| **Open Low** | 1 |

---

## Triage Summary (CTO gate — before any fix)

| ID | Severity | Module vs Platform | Area | One-line | Decision |
|----|----------|--------------------|------|----------|----------|
| DEF-CW03-001 | Low | Platform (shared master UI, **not** a frozen framework) | MAT-04 UX | React "key prop spread into JSX" console warning on master Add/Edit drawer | _pending CTO_ |

---

## DEF-CW03-001 — React key-spread warning on shared master Add/Edit drawer

| Field | Value |
|-------|-------|
| **Severity** | **Low** — dev-only console warning; zero functional, data, security, or audit impact. React 19 strictness on `key` passed via spread. |
| **Classification** | **Platform / shared** — originates in the shared master-form field rendering (`MasterEditDrawer`), so the same warning appears on the Add/Edit drawer of **every** master page (products, cells, bms, cabinets, connectors, cables, busbars, chargers, test-equipment, product-categories, product-workflows), not only Product Workflows. Fixing once benefits all. **Note:** `MasterEditDrawer` is app-level feature code, **not** one of the frozen platforms (ODS / ECF / SS-01..04 / Cert), so a fix does not touch a frozen framework. |
| **Surfaced by** | MAT-MO-53 (e2e). Verbatim console: *"A props object containing a 'key' prop is being spread into JSX … React keys must be passed directly to JSX without using spread"* — observed for `TextField`, `TextareaField`, `DateField`. |
| **Root cause** | The drawer builds a `common` props object that includes `key` and spreads it into the field components (`<TextField {...common} />`), instead of passing `key` directly as a JSX attribute. |
| **Impact** | None at runtime — fields render and submit correctly; warning is console-only in dev. |
| **Proposed fix** | Pass `key` directly to each field element rather than via the spread object (one shared change in `MasterEditDrawer`). |
| **Status** | OPEN — awaiting CTO triage approval before remediation. |

---

## Verified NON-defects (investigated, dismissed)

| Observation | Verdict |
|-------------|---------|
| `401` console line on authenticated master page | Expected pre-auth `/api/auth/me` 401 → login-redirect (captured from the /login phase); by design, not a defect. |
| `authz` / `audit` validation workflows showing "failed" intermittently | Rate-limit artifact — concurrent test-login traffic saturated the 20/15min auth limiter and the auto-re-running suites tripped on it. Authoritative clean re-runs (API server restarted, no competing traffic) passed: SS-02 280/280, SS-03 12/12 + immutability. Not a regression. |
| MAT-MO-34 "duplicate serial" during probe | Probe artifact — `official_product_serial` UNIQUE index is present; two distinct serials minted, product count unchanged. PASS. |
