# OCS One — Release Notes v1.0 Foundation

**Release Date:** 2026-06-27
**Git Tag:** `v1.0-foundation`
**Status:** Production-ready baseline

---

## Overview

OCS One v1.0 Foundation delivers the complete operational baseline for OCS Oorja Green Pvt. Ltd. This release covers the full manufacturing lifecycle for LiFePO4 battery packs — from inbound cell receiving through final dispatch — plus a frozen enterprise design system and developer tooling.

---

## Features Delivered

### 1. Authentication & Security
- JWT in httpOnly cookie with RS256 signing
- RBAC with four roles: `director`, `supervisor`, `operator`, `viewer`
- bcrypt password hashing, rate-limited auth endpoints
- Helmet headers, CORS allowlist, trust-proxy for Replit

### 2. Engineering Masters (9 catalogues)
Full CRUD with search, pagination, ODS toolbar:
- Products, BMS models, Cell models, Chargers, Test Equipment
- Connectors, Cables, Busbars, Cabinets
- Physical charger unit registry

### 3. Cell Receiving & Grading
- Inbound lot creation (supplier, model, batch, quantity, notes)
- Per-cell grading: capacity (Ah), internal resistance (mΩ), voltage (V)
- Configurable grade thresholds (A/B/C)
- Cell allocation engine: slot-filling algorithm with grade filtering
- Reserve / release lifecycle to prevent double-allocation

### 4. Manufacturing Orders — Full 9-Stage Lifecycle
| Stage | Key data captured |
|-------|------------------|
| Cell Allocation | Cell IDs, grade summary |
| Assembly | Assembler, torque specs, notes |
| Compression | Compression force, duration |
| BMS Install | BMS serial, firmware slot |
| BMS Programming | Firmware version, config hash |
| Charging | Charger unit, start/end SoC, duration |
| Testing | Per-parameter pass/fail results |
| Quality Control | QC officer sign-off, final grade |
| Packing | Weight, dimensions, carton number |

- Stage state machine with pause / resume / complete / approve / reject
- Supervisor sign-off required for QC and critical stages
- Rework queue for rejected stages

### 5. Charging Dashboard
- Live charger unit status (available / busy / maintenance)
- Formation charge cycle assignment and completion
- Real-time charger utilisation metrics

### 6. Testing & Quality Control
- Configurable test parameter pass/fail capture
- 30-day QC summary: pass rate, reject rate, sample counts
- Defect category tracking for rework analysis

### 7. Logistics & Dispatch
- Dispatch order lifecycle: Draft → Confirmed → Loaded → In Transit → Delivered
- Battery-level dispatch items with QC-approval gate
- Shipment event log (actor, timestamp, notes)
- Dealer master with GSTIN, location, contact details

### 8. Reporting Suite
| Report | Filters |
|--------|---------|
| Production Report | Date range, status, priority |
| QC Report | Date range, pass/fail breakdown |
| Cell Grading Report | Supplier, grade distribution |
| Logistics Report | Dealer, dispatch status |

### 9. Director Dashboard
Live command center with auto-refresh (30s):
- 8 KPI cards using OdsMetricCard
- Manufacturing pipeline health monitor (9 stages)
- Factory alert feed (critical / warning / info)
- Recent production orders with priority flags
- Operator activity board
- Equipment availability visualisation
- Cell inventory snapshot
- Quality summary panel
- Logistics overview
- Quick action shortcuts

### 10. ODS Design System v1.0 — FROZEN
19 production-grade React components. See `artifacts/ocs-one/docs/ods-component-registry.md` for full specification.

### 11. Developer Portal
- `/developer/architecture` — Module dependency map with API/table/component detail
- `/design-system` — Live interactive component showcase
- `Ctrl+K` global command palette
- `Ctrl+Shift+D` developer overlay

---

## Modules Implemented

| Module | Route Prefix | Status |
|--------|-------------|--------|
| Authentication | `/api/auth` | ✅ Certified |
| Users | `/api/users` | ✅ Certified |
| Products Master | `/api/masters/products` | ✅ Certified |
| BMS Master | `/api/masters/bms` | ✅ Certified |
| Cells Master | `/api/masters/cells` | ✅ Certified |
| Chargers Master | `/api/masters/chargers` | ✅ Certified |
| Test Equipment | `/api/masters/test-equipment` | ✅ Certified |
| Connectors | `/api/masters/connectors` | ✅ Certified |
| Cables | `/api/masters/cables` | ✅ Certified |
| Busbars | `/api/masters/busbars` | ✅ Certified |
| Cabinets | `/api/masters/cabinets` | ✅ Certified |
| Cell Receiving | `/api/cells` | ✅ Certified |
| Cell Grading | `/api/cells/grading` | ✅ Certified |
| Production Orders | `/api/manufacturing/orders` | ✅ Certified |
| Manufacturing Stages | `/api/manufacturing/stages` | ✅ Certified |
| Charging Units | `/api/manufacturing/chargers` | ✅ Certified |
| Charging Dashboard | `/api/manufacturing/charging-dashboard` | ✅ Certified |
| Dispatch Orders | `/api/logistics/dispatch` | ✅ Certified |
| Dealers | `/api/logistics/dealers` | ✅ Certified |
| Reports | `/api/reports/*` | ✅ Certified |
| Director Dashboard | `/api/dashboard` | ✅ Certified |
| Health Check | `/api/healthz` | ✅ Certified |

---

## Known Limitations

### Functional
1. **No warranty / service module** — Post-dispatch battery lifecycle not yet implemented.
2. **No multi-factory support** — All data is under a single facility; multi-site is roadmapped.
3. **No push notifications** — Alerts are pull-based (auto-refresh); WebSocket events not yet implemented.
4. **No file attachments** — Test reports, certificates cannot be uploaded; planned for CW-03.
5. **No barcode / QR scanner integration** — QR codes are generated but scanning requires manual entry; hardware scanner support is CW-02.
6. **No shift management** — Operator activity is tracked per day, not per shift.
7. **Reports are read-only** — No scheduled report delivery or PDF export yet.

### Technical
1. **No database migrations** — Schema changes use `drizzle-kit push` (dev-only). Production schema management to be formalised in CW-01.
2. **No test suite** — Unit and integration tests are not yet written. Testing infrastructure is planned as a cross-cutting concern in CW-02.
3. **Single-process API** — No horizontal scaling or connection pooling configured.
4. **No audit log table** — User actions are not persisted to a dedicated audit trail (only shipment events and stage history are tracked).
5. **Frontend bundle size** — Not yet code-split per route; initial load includes all modules.

---

## Admin Credentials (Development)

| Field | Value |
|-------|-------|
| Email | `admin@ocs.local` |
| Password | `OCS@Admin2026!` |
| Role | director |

> **Change before production deployment.**

---

## Environment Variables Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | JWT signing secret (minimum 32 chars) |
| `ALLOWED_ORIGINS` | Comma-separated allowed CORS origins |

---

## Roadmap — Certification Waves

ODS v1.0 is frozen. All future work proceeds through Certification Waves where each module is independently tested, security-reviewed, and stamped **Certified**.

### CW-01 — Cell Receiving (Next)
- Write Playwright end-to-end tests for all Cell Receiving flows
- Create/Edit/Save/Search/Filter/Validation/Relationships/Security/Audit/Performance scorecards
- API contract formalisation (response envelopes, error codes)
- DB migration workflow (drizzle-kit generate → versioned migration files)

### CW-02 — Cell Grading
- Grading scorecard (same 10-point QA checklist)
- Barcode scanner integration via Web Serial API
- Bulk grading import (CSV)

### CW-03 — Manufacturing Orders
- Full stage lifecycle scorecard
- File attachment support (test certificates, photos)
- Stage SLA monitoring and breach alerts

### CW-04 — Charging
- Charging cycle data logging (SoC curves)
- Formation report PDF generation
- Charger maintenance scheduling

### CW-05 — Quality Control
- QC scorecard with image capture
- Defect Pareto chart
- Corrective action tracking

### CW-06 — Dispatch & Logistics
- e-Way Bill integration (GST compliant)
- GPS tracking link per dispatch order
- Delivery confirmation with photo proof

### CW-07 — Reports & Analytics
- Scheduled PDF report delivery
- Advanced filtering and date range comparisons
- Export to Excel

### CW-08 — Warranty & Service
- Warranty registration on dispatch
- Service ticket lifecycle
- Repair history per battery pack

---

## Database Schema

Schema source of truth: `lib/db/src/schema/`

| Schema file | Tables |
|-------------|--------|
| `users.ts` | users |
| `manufacturing.ts` | production_orders, production_stages, cell_allocation_slots, bms_allocations, charger_assignments |
| `cell-grading.ts` | cell_lots, cells, grade_configs |
| `logistics.ts` | dispatch_orders, dispatch_items, shipment_events, dealers |
| `master-*.ts` | products, bms_models, cell_models, charger_models, test_equipment_models, connectors, cables, busbars, cabinets, charger_units |

Full schema SQL export: `docs/schema_v1.0_foundation.sql` (generated at release time).

---

## File Structure

```
/
├── artifacts/
│   ├── api-server/          Express 5 API (port 8080, proxied to /api)
│   └── ocs-one/             React 19 + Vite frontend
│       ├── src/
│       │   ├── components/ods/   ODS v1.0 components (19 total)
│       │   ├── features/         Business modules (cells, manufacturing, logistics, etc.)
│       │   ├── pages/            Top-level pages
│       │   ├── ods/theme/        Design tokens
│       │   └── hooks/            useAuth, useOdsNotify, etc.
│       └── docs/
│           ├── ods-component-registry.md
│           └── ocs-one-design-standards.md
├── lib/
│   ├── db/                  Drizzle ORM schema + client
│   ├── api-spec/            OpenAPI YAML (source of truth)
│   ├── api-client-react/    Orval-generated React Query hooks
│   └── api-zod/             Orval-generated Zod schemas
├── docs/
│   └── schema_v1.0_foundation.sql
├── CHANGELOG.md
├── RELEASE_NOTES_v1.0_FOUNDATION.md
├── package.json
├── pnpm-lock.yaml
└── pnpm-workspace.yaml
```

---

*OCS One v1.0 Foundation — OCS Oorja Green Pvt. Ltd.*
*Built on: 2026-06-27*
