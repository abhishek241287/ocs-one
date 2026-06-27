# OCS One — Project Status

> **This file reflects the current state of the project.**
> Update it after every Certification Wave. Do not confuse it with `CHANGELOG.md` (history) or `RELEASE_NOTES_v1.0_FOUNDATION.md` (launch notes).

---

## Current Version

| Field | Value |
|-------|-------|
| **Version** | `1.0-foundation` |
| **Release Date** | 2026-06-27 |
| **Git Tag** | `v1.0-foundation` |
| **Branch** | `main` |
| **Overall Progress** | **35%** — Foundation complete; Certification Waves not yet started |

Progress scale: Foundation (0–35%) → Certification Waves CW-01 to CW-08 (35–100%)

---

## Module Status

| Module | Area | Status | Notes |
|--------|------|--------|-------|
| Authentication & RBAC | Auth | ✅ Built | JWT httpOnly cookie, 4 roles |
| Users | Auth | ✅ Built | CRUD, role assignment |
| Products Master | Masters | ✅ Built | Battery pack catalogue |
| BMS Master | Masters | ✅ Built | BMS model registry |
| Cells Master | Masters | ✅ Built | Cell model specifications |
| Chargers Master | Masters | ✅ Built | Charger model registry |
| Test Equipment | Masters | ✅ Built | Instrument registry |
| Connectors | Masters | ✅ Built | Connector type catalogue |
| Cables | Masters | ✅ Built | Cable type catalogue |
| Busbars | Masters | ✅ Built | Busbar specification registry |
| Cabinets | Masters | ✅ Built | Enclosure catalogue |
| Cell Receiving | Cell Lifecycle | ✅ Built | Lot creation, intake workflow |
| Cell Grading | Cell Lifecycle | ✅ Built | Per-cell capacity / IR / voltage |
| Cell Inventory | Cell Lifecycle | ✅ Built | Grade snapshot, allocation view |
| Cell Matching | Cell Lifecycle | ✅ Built | Slot-filling algorithm |
| Grade Configuration | Cell Lifecycle | ✅ Built | A/B/C threshold management |
| Production Orders | Manufacturing | ✅ Built | Full 9-stage lifecycle |
| Manufacturing Stages | Manufacturing | ✅ Built | State machine with sign-off |
| Charging Units | Manufacturing | ✅ Built | Charger assignment + dashboard |
| Testing & QC | Manufacturing | ✅ Built | Pass/fail capture, approvals |
| Rework Queue | Manufacturing | ✅ Built | Rejection handling |
| Dispatch Orders | Logistics | ✅ Built | 5-step lifecycle |
| Dealers | Logistics | ✅ Built | Dealer master with GSTIN |
| Shipment Events | Logistics | ✅ Built | Audit log per dispatch |
| Reports (4 types) | Reporting | ✅ Built | Production / QC / Cells / Logistics |
| Director Dashboard | Dashboard | ✅ Built | 8 KPI cards, live pipeline |
| Architecture Map | Developer | ✅ Built | Module dependency visualiser |
| Design System Showcase | Developer | ✅ Built | All 19 ODS components live |
| Warranty & Service | Post-sales | ⬜ Planned | CW-08 |
| Multi-factory | Platform | ⬜ Planned | Post CW-08 |
| Push Notifications | Platform | ⬜ Planned | Post CW-05 |
| File Attachments | Platform | ⬜ Planned | CW-03 |
| Barcode Scanner | Platform | ⬜ Planned | CW-02 |
| Shift Management | Operations | ⬜ Planned | Post CW-04 |
| Report Delivery | Reporting | ⬜ Planned | CW-07 |

**Status legend:** ✅ Built · 🟡 In Progress · 🔵 Certified · ⬜ Planned

---

## Database Statistics

| Metric | Count |
|--------|-------|
| **Total tables** | 29 |
| **Total enums** | 19 |
| **Total indexes** | 31 |
| **Schema files** | 15 |
| **ORM** | Drizzle ORM |
| **Database** | PostgreSQL |

### Tables by domain

| Domain | Tables |
|--------|--------|
| Auth / Users | `users` |
| Cell Lifecycle | `cell_lots`, `cells`, `cell_grade_config`, `cell_matches`, `cell_match_items` |
| Manufacturing | `mfg_production_orders`, `mfg_order_stages`, `mfg_charger_units`, `mfg_formation_reports`, `mfg_test_results`, `mfg_qc_approvals`, `mfg_rework_tickets`, `mfg_battery_genealogy`, `mfg_battery_timeline` |
| Logistics | `logistics_dispatch_orders`, `logistics_dispatch_items`, `logistics_shipment_events`, `logistics_dealers` |
| Masters | `master_products`, `master_bms`, `master_cells`, `master_chargers`, `master_test_equipment`, `master_connectors`, `master_cables`, `master_busbars`, `master_cabinets` |

### Schema source

```
lib/db/src/schema/
  users.ts · manufacturing.ts · cell-grading.ts · logistics.ts
  master-products.ts · master-bms.ts · master-cells.ts · master-chargers.ts
  master-test-equipment.ts · master-connectors.ts · master-cables.ts
  master-busbars.ts · master-cabinets.ts · master-common.ts · index.ts
```

Full SQL export: `docs/schema_v1.0_foundation.sql` (generated 2026-06-27)

---

## API Statistics

| Metric | Count |
|--------|-------|
| **Total endpoints** | 81 |
| **Public endpoints** | ~5 (`/healthz`, `/auth/*`) |
| **Secured endpoints** | ~76 (all behind `requireAuth`) |
| **GET** | 45 |
| **POST** | 23 |
| **PATCH** | 7 |
| **PUT** | 4 |
| **DELETE** | 2 |
| **Framework** | Express 5 |
| **Contract source** | `lib/api-spec/openapi.yaml` |
| **Codegen** | Orval split mode → React Query hooks + Zod schemas |

### Auth model

- JWT in httpOnly cookie (`ocs_token`, signed with `SESSION_SECRET`)
- `router.use(requireAuth)` gates the entire route tree except `/healthz` and `/auth/*`
- Per-route role enforcement via `requireRole(...roles)`

---

## Frontend Statistics

| Metric | Count |
|--------|-------|
| **App routes (pages)** | 35 |
| **Public routes** | 2 (`/login`, `/register`) |
| **Protected routes** | 33 |
| **ODS components (v1.0, frozen)** | 19 |
| **Layouts** | 5 |
| **Feature modules** | 13 |
| **Custom hooks** | 7 |
| **Total React components** | 152 |
| **Framework** | React 19 + Vite |
| **Router** | Wouter v3 |
| **State / data fetching** | TanStack Query v5 |
| **UI primitives** | shadcn/ui + Tailwind CSS |

### Layouts

| Layout | Used by |
|--------|---------|
| `AppLayout` | Auth guard wrapper, all protected pages |
| `DashboardLayout` | Director dashboard |
| `MasterLayout` | All 9 engineering master pages |
| `ReportLayout` | All 4 report pages |
| `WorkflowLayout` | Manufacturing stage cards |

### ODS v1.0 components (FROZEN)

Foundation: `ModuleHeader` · `OdsCertBadge` · `OdsStatusBadge` · `OdsEmptyState` · `OdsTableSkeleton`
Interaction: `OdsSearchBar` · `OdsToolbar`
Overlay: `OdsDrawer` · `OdsDialog`
Data: `OdsDataTable`
Navigation: `OdsCommandPalette`
Feedback: `useOdsNotify`
Developer: `OdsDevMode`
KPI: `OdsMetricCard` · `OdsMetricGrid`
Chart: `OdsChartCard`
History: `OdsTimeline`
Workflow: `OdsStepper`
Layout: `OdsPageLayout`

Full registry: `artifacts/ocs-one/docs/ods-component-registry.md`

---

## Certification Status

| Wave | Scope | Status | Target |
|------|-------|--------|--------|
| **CW-01** | Cell Receiving | ⬜ Not started | TBD |
| **CW-02** | Cell Grading | ⬜ Not started | TBD |
| **CW-03** | Manufacturing Orders | ⬜ Not started | TBD |
| **CW-04** | Charging | ⬜ Not started | TBD |
| **CW-05** | Quality Control | ⬜ Not started | TBD |
| **CW-06** | Dispatch & Logistics | ⬜ Not started | TBD |
| **CW-07** | Reports & Analytics | ⬜ Not started | TBD |
| **CW-08** | Warranty & Service | ⬜ Not started | TBD |

Certification criteria per wave (10-point scorecard):
Create · Edit · Save · Search · Filter · Validation · Relationships · Security · Audit · Performance

---

## Known Issues

| # | Severity | Area | Description |
|---|----------|------|-------------|
| KI-01 | Medium | Database | No versioned migration files — schema changes use `drizzle-kit push` (dev only) |
| KI-02 | Medium | Testing | No automated test suite (unit, integration, or e2e) |
| KI-03 | Low | API | No audit log table — user actions not persisted (only shipment events + stage history) |
| KI-04 | Low | Frontend | No code-splitting per route — full bundle loaded on first visit |
| KI-05 | Low | API | Single-process Express — no horizontal scaling or connection pooling configured |
| KI-06 | Low | Logistics | No e-Way Bill / GST compliance integration |
| KI-07 | Low | Platform | No push notifications — dashboard uses 30s polling |

---

## Next Milestone

**CW-01 — Cell Receiving Certification**

Scope:
- Write Playwright end-to-end tests for all Cell Receiving flows
- Complete 10-point QA scorecard: Create / Edit / Save / Search / Filter / Validation / Relationships / Security / Audit / Performance
- Formalise DB migration workflow (drizzle-kit generate → versioned migration files)
- API contract enforcement (response envelopes, error codes)

Outcome: Cell Receiving module stamped **Certified** and scorecard added to this file.

---

## How to Update This File

After every Certification Wave:

1. Change the module row from `✅ Built` → `🔵 Certified` in the Module Status table.
2. Update the Certification Status table with the completion date.
3. Increment **Overall Progress (%)** by ~8% per wave completed.
4. Resolve any Known Issues resolved in the wave.
5. Update **Next Milestone** to the following wave.
6. Commit with message: `cert(CW-NN): certify <module> — update PROJECT_STATUS.md`

---

*Last updated: 2026-06-27 · Version 1.0-foundation*
