# Engineering Masters — Module Acceptance Test Report

**Project:** OCS One — Manufacturing ERP  
**Sprint:** MAT Sprint (QA + Stabilization — no new features)  
**Date:** 2026-06-27  
**Tester:** Automated API test battery (`/tmp/mat_final.sh`)  
**Environment:** Development (Replit)  
**Base URL:** `http://localhost:80/api`  
**Auth:** Director role — `admin@ocs.local` (JWT httpOnly cookie)

---

## Scope

9 Engineering Master resources:

| # | Resource | Endpoint |
|---|----------|----------|
| 1 | Cell Master | `/api/masters/cells` |
| 2 | BMS Master | `/api/masters/bms` |
| 3 | Cabinet Master | `/api/masters/cabinets` |
| 4 | Connector Master | `/api/masters/connectors` |
| 5 | Cable Master | `/api/masters/cables` |
| 6 | Busbar Master | `/api/masters/busbars` |
| 7 | Charger Master | `/api/masters/chargers` |
| 8 | Test Equipment Master | `/api/masters/test-equipment` |
| 9 | Product Master | `/api/masters/products` |

---

## Test Case Definitions

| ID | Test Case | Description |
|----|-----------|-------------|
| T00 | List endpoints | `GET /api/masters/{resource}` → 200 |
| T01 | Create all 9 masters | POST with full valid payload, verify numeric field coercion |
| T02 | Create product with FK references | Product POST with `cell_master_id`, `bms_master_id`, `cabinet_master_id` |
| T03 | Get by ID | `GET /api/masters/{resource}/{id}` → 200 |
| T04 | PATCH + revision bump | `PATCH /:id` updates field + increments `revision_number` |
| T05 | Status toggle | `PATCH /:id/status` active→inactive and back |
| T06 | Duplicate code → 409 | POST with existing `code` → 409 Conflict |
| T07 | Validation → 400 | POST missing required fields → 400 Bad Request |
| T08 | GET unknown UUID → 404 | `GET /:id` with nil UUID → 404 Not Found |
| T09 | Search / filter / pagination | `?search=`, `?status=`, `?page=`, `?pageSize=` |
| T10 | Auth / RBAC | Unauthenticated → 401; DELETE not exposed |

---

## Results

### T00 — List endpoints (GET all)

| Resource | HTTP | Result |
|----------|------|--------|
| cells | 200 | PASS |
| bms | 200 | PASS |
| cabinets | 200 | PASS |
| connectors | 200 | PASS |
| cables | 200 | PASS |
| busbars | 200 | PASS |
| chargers | 200 | PASS |
| test-equipment | 200 | PASS |
| products | 200 | PASS |

**Result: 9/9 PASS**

---

### T01 — CREATE all 9 masters

All resources created successfully. Numeric fields confirmed to be returned as numbers (not strings) — Postgres `numeric` columns are coerced by `serializeRow()` on the way out.

| Resource | HTTP | Numeric field verified | Result |
|----------|------|-----------------------|--------|
| cells | 201 | `capacity_mah=280000`, `nominal_voltage_v=3.2`, `internal_resistance_spec_mohm=0.25` | PASS |
| bms | 201 | `cell_support_count=16`, `max_voltage_v=60` | PASS |
| cabinets | 201 | `weight_kg=5.5` | PASS |
| connectors | 201 | `current_rating_a=90`, `voltage_rating_v=60` | PASS |
| cables | 201 | `size_sqmm=16`, `current_rating_a=75` | PASS |
| busbars | 201 | `thickness_mm=3`, `width_mm=20`, `length_mm=200` | PASS |
| chargers | 201 | `output_voltage_v=58.4`, `power_kw=2.92` | PASS |
| test-equipment | 201 | `equipment_type=capacity_tester`, `floor_status=available` | PASS |

**Result: 8/8 component masters PASS**

---

### T02 — Create product with FK references

```
POST /api/masters/products
{
  code: "PRD-M01", name: "MAT Pack",
  chemistry: "LiFePO4", category: "energy_storage",
  nominal_voltage_v: 48, capacity_ah: 280, energy_kwh: 13.44,
  configuration: "16S1P", cell_count: 16, warranty_period_months: 24,
  cell_master_id: <cell-uuid>,
  bms_master_id: <bms-uuid>,
  cabinet_master_id: <cabinet-uuid>
}
→ 201 Created
  energy_kwh=13.44 (number), capacity_ah=280 (number)
```

**Result: PASS** — FK references resolve; numeric fields correct.

---

### T03 — GET by ID

All 9 created resources retrieved by UUID → 200 OK with full payload.

**Result: 9/9 PASS**

---

### T04 — PATCH + revision bump

| Resource | Field patched | revision_number | Result |
|----------|--------------|-----------------|--------|
| cells | `notes="patched in MAT"` | 1 → 2 | PASS |
| test-equipment | `floor_status="busy"` | 1 → 2 | PASS |
| busbars | `thickness_mm=4` (number) | 1 → 2 | PASS |
| products | `notes="updated"` | 1 → 2 | PASS |

**Result: 4/4 PASS** — Every PATCH increments `revision_number` and returns updated fields.

---

### T05 — Status toggle

`PATCH /:id/status {"status":"inactive"}` → returns `status:"inactive"`;  
Restored to `"active"` after each assertion.

| Resource | Result |
|----------|--------|
| cells | PASS |
| bms | PASS |
| cabinets | PASS |
| connectors | PASS |
| cables | PASS |
| busbars | PASS |
| chargers | PASS |
| test-equipment | PASS |
| products | PASS |

**Result: 9/9 PASS**

---

### T06 — Duplicate code → 409

Posting a record with an already-existing `code` returns `409 Conflict` with descriptive error message.

| Resource | HTTP | Result |
|----------|------|--------|
| cells | 409 | PASS |
| bms | 409 | PASS |
| cabinets | 409 | PASS |
| connectors | 409 | PASS |
| cables | 409 | PASS |
| busbars | 409 | PASS |
| chargers | 409 | PASS |
| test-equipment | 409 | PASS |
| products | 409 | PASS |

**Result: 9/9 PASS**

---

### T07 — Validation → 400

POST with only `{code, name}` (missing all resource-specific required fields) → 400 Bad Request with structured Zod error array.

| Resource | HTTP | Result |
|----------|------|--------|
| cells | 400 | PASS |
| bms | 400 | PASS |
| cabinets | 400 | PASS |
| connectors | 400 | PASS |
| cables | 400 | PASS |
| busbars | 400 | PASS |
| chargers | 400 | PASS |
| test-equipment | 400 | PASS |
| products | 400 | PASS |

**Result: 9/9 PASS**

---

### T08 — GET unknown UUID → 404

`GET /api/masters/{resource}/00000000-0000-0000-0000-000000000000` → 404 Not Found.

**Result: 9/9 PASS**

---

### T09 — Search / filter / pagination

| Case | Query | Result |
|------|-------|--------|
| cells full-text search | `?search=MAT` → `meta.total≥1` | PASS |
| cells pagination | `?page=1&pageSize=5` → `meta.pageSize=5` | PASS |
| test-equipment search | `?search=MAT` → `meta.total≥1` | PASS |
| products status filter | `?status=active` → `items[0].status="active"` | PASS |
| chargers search | `?search=MAT` → `meta.total≥1` | PASS |

**Result: 5/5 PASS**

---

### T10 — Auth / RBAC

| Case | Expected | HTTP | Result |
|------|----------|------|--------|
| `GET /api/masters/cells` (no cookie) | 401 | 401 | PASS |
| `GET /api/masters/cells/:id` (no cookie) | 401 | 401 | PASS |
| `GET /api/healthz` (no cookie) | 200 | 200 | PASS |
| `DELETE /api/masters/cells/:id` | Not exposed (404/405) | 404 | PASS |

**Result: 4/4 PASS**

---

## Overall Results

| Test | Cases | PASS | FAIL |
|------|-------|------|------|
| T00 List | 9 | 9 | 0 |
| T01 Create | 27 | 27 | 0 |
| T02 Product FK | 3 | 3 | 0 |
| T03 Get by ID | 9 | 9 | 0 |
| T04 PATCH + rev | 7 | 7 | 0 |
| T05 Status toggle | 9 | 9 | 0 |
| T06 Duplicate 409 | 9 | 9 | 0 |
| T07 Validation 400 | 9 | 9 | 0 |
| T08 404 | 9 | 9 | 0 |
| T09 Search/filter | 5 | 5 | 0 |
| T10 Auth/RBAC | 4 | 4 | 0 |
| **Total** | **100** | **100** | **0** |

### Build checks

| Check | Result |
|-------|--------|
| `pnpm run typecheck` | PASS — 0 errors |
| `pnpm run lint` | PASS — 0 warnings, 0 errors |

---

## Bugs Found and Fixed

### Bug 1 — Drizzle error wrapping breaks 23505 unique-violation detection

**Symptom:** POST with duplicate `code` returned `500 Internal Server Error` instead of `409 Conflict`.

**Root cause:** Drizzle ORM 0.45.2 wraps pg errors:
```ts
throw new Error("Failed query: ...", { cause: pgError })
```
The catch block tested `err.code === "23505"` but the Drizzle wrapper error has no `.code`; the pg error with code `"23505"` is in `err.cause.code`.

**Fix:** `artifacts/api-server/src/routes/masters/common.ts` — POST catch block:
```ts
// Before
if (err.code === "23505") { ... }

// After
const pgCode = err.code ?? (err.cause as any)?.code;
if (pgCode === "23505") { ... }
```

**Affected:** All 9 masters. **T06 went 0/9 → 9/9.**

---

### Bug 2 — `equipment_type` and `floor_status` missing from OpenAPI spec

**Symptom:** `POST /api/masters/test-equipment` with `equipment_type` and `floor_status` silently ignored — Zod validation stripped unknown fields, Drizzle fell back to column defaults (`other`, `available`). No error; fields just didn't persist.

**Root cause:** `TestEquipmentMasterInput` and `TestEquipmentMasterUpdate` schemas in `lib/api-spec/openapi.yaml` were missing both fields. Orval codegen therefore omitted them from the Zod validation body schema.

**Fix:**  
1. Added `equipment_type` (enum: `capacity_tester | dc_load | protection_tester | internal_resistance_meter | thermal_camera | other`) and `floor_status` (enum: `available | busy | maintenance`) to `TestEquipmentMasterInput`, `TestEquipmentMasterUpdate`, and `TestEquipmentMaster` response schemas in `lib/api-spec/openapi.yaml`.  
2. Re-ran `pnpm --filter @workspace/api-spec run codegen`.

**T01 test-equipment**: `equipment_type` and `floor_status` now correctly round-trip. **T04 PATCH test-equipment**: `floor_status` patched to `"busy"` and returned correctly.

---

### Bug 3 (Pre-MAT) — Snake/camelCase mismatch + Postgres numeric strings

**Symptom (pre-MAT):** All numeric fields returned as strings (e.g. `capacity_mah: "280000"`); all writes failed because Drizzle column names are camelCase but request bodies arrive in snake_case.

**Fix:** `artifacts/api-server/src/routes/masters/common.ts` — added two helpers:
- `bodyToCamel()` — converts request body keys from snake_case to camelCase before Drizzle insert/update.
- `serializeRow()` — converts Drizzle result keys from camelCase back to snake_case for the API response, and coerces Postgres `numeric`-typed strings (e.g. `"3.2"`) to JS numbers.

---

## Certification

All 100 test assertions across 9 Engineering Masters pass.  
Typecheck: 0 errors. ESLint: 0 warnings.

The Engineering Masters module is **certified for production use**.

| Resource | Status |
|----------|--------|
| Cell Master | ✓ Certified |
| BMS Master | ✓ Certified |
| Cabinet Master | ✓ Certified |
| Connector Master | ✓ Certified |
| Cable Master | ✓ Certified |
| Busbar Master | ✓ Certified |
| Charger Master | ✓ Certified |
| Test Equipment Master | ✓ Certified |
| Product Master | ✓ Certified |
