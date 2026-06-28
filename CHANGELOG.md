# OCS One — Changelog

All notable changes to this project are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased] — CW-01 MAT-06 Security & Reliability (ready for CTO sign-off)

> **Security & Reliability hardening.** Four permanent certification standards added on top of
> the foundation release, plus the CSP production hardening that resolves DEF-CW01-M06-004.
> All four standards run as automated regression suites; any failure fails certification.

### 🔐 Permanent certification standards

- **SS-01 — Security matrix** (permanent rule): every new endpoint must declare auth required? /
  minimum role / audit required? / rate limited? / input validation? / output sanitised? before
  merge. `docs/security-matrix.md` is authoritative per-endpoint.
- **SS-02 — Authorization regression** (validation command `authz`): `lib/authz-matrix.ts`
  (45 endpoints × 5 principals = 225 assertions) drives `cert/authz-suite.ts` and the security
  dashboard from one source. ✅ 225/225.
- **SS-03 — Audit-trail verification** (validation command `audit`): `lib/audit-matrix.ts`
  (11 operations across `security_events` + `cell_lot_events`) drives `cert/audit-suite.ts`;
  performs each real operation, asserts the event persisted with all fields, and proves
  immutability (static + runtime). ✅ 11/11 + immutable.
- **SS-04 — Configuration integrity** (validation command `config`): `lib/config-integrity.ts`
  (`gatherConfig()` + `validateConfig()`, 34 checks across 12 categories) drives
  `cert/config-suite.ts` and the new configuration dashboard from one source. FAIL = drift =
  production defect; WARN only for documented dev-mode exceptions. ✅ 31 pass / 3 warn / 0 fail.
  A production-mode run correctly FAILS on the default admin password — enforcement is real.

### 🛡️ Security hardening

- **CSP environment-aware (DEF-CW01-M06-004 RESOLVED)** — `script-src` drops `'unsafe-inline'`
  in production (kept in dev only for the Vite HMR client); `style-src` retains `'unsafe-inline'`
  as a documented temporary exception (Radix/shadcn/Recharts inject inline styles). SS-04
  enforces both rules. Caveat: the frontend is served as static files separate from the API, so
  this helmet CSP governs API responses (defense-in-depth); a static/edge-layer document CSP is a
  CW-02 recommendation.
- **Persistent security audit** — `security_events` table records `auth.login.success`/`failed`,
  `auth.logout`, `user.created`, `authz.denied` (403s), and `ratelimit.exceeded` via
  fire-and-forget `recordSecurityEvent()`.
- **RBAC enforcement** — `requireWriteRole(...)` makes viewer read-only everywhere; writes gated
  to listed roles (director always included). Public self-registration removed (`/auth/register`
  director-only, rate-limited, audit-logged).
- **Input validation** — all-optional PATCH/PUT bodies reject `{}` with 400 (DEF-EMPTY-BODY).

### 🧭 Developer dashboards (director-only)

- **`/developer/security`** — 12 sections (users-by-role, live authorization matrix, failed
  logins, rate-limit events, account creations, permission failures, audit feed, event
  histogram, SAST/privacy summary, dependency audit, CSP status, JWT/session + cert status).
- **`/developer/configuration`** — live configuration-integrity report driven by the same
  `gatherConfig()`/`validateConfig()` SS-04 uses (never exposes secret values).

### 🏷️ Versioning

- `@workspace/api-server` bumped `0.0.0` → `1.0.0` (SS-04 version-consistency check now passes).

---

## [1.0.0-foundation] — 2026-06-27

> **Foundation Release.** The complete operational baseline for OCS Oorja Green Pvt. Ltd.
> manufacturing ERP. All core infrastructure, business modules, and the ODS design system are frozen at v1.0.

---

### 🗄️ Database Architecture

- **PostgreSQL + Drizzle ORM** — 15 schema modules, fully typed
- `users` — RBAC user accounts (`director | supervisor | operator | viewer`)
- `manufacturing` — production orders, stage lifecycle, cell allocation, BMS allocation
- `cell_grading` — cell lots, individual cell grades, grade configuration
- `logistics` — dispatch orders, dispatch items, shipment events, dealers
- **Masters**: products, BMS, cells, chargers, test equipment, connectors, cables, busbars, cabinets
- Postgres sequences `mfg_order_seq` / `mfg_battery_seq` for race-free ID generation
- DB indexes on all high-traffic query columns
- Admin seed on startup: `admin@ocs.local` (director)

---

### 🔌 API Framework

- **Express 5** + Pino structured logging
- **JWT in httpOnly cookie** (`ocs_token`, signed with `SESSION_SECRET`) — eliminates XSS token theft
- **RBAC middleware** — `requireAuth` / `requireRole(...roles)` on every protected route
- **Helmet** security headers
- **CORS** controlled via `ALLOWED_ORIGINS` env var
- **Rate limiting** — 300 req/min global, 20/15min on auth routes
- **Trust proxy = 1** — required for Replit reverse proxy compatibility
- **OpenAPI spec** (`lib/api-spec/`) as the single contract source
- **Orval codegen** — React Query hooks (`lib/api-client-react`) + Zod schemas (`lib/api-zod`) generated from OpenAPI

---

### 🏗️ Engineering Masters

Fully CRUD, paginated, searchable, with ODS toolbar + data table.

| Master | Route | Description |
|--------|-------|-------------|
| Products | `/masters/products` | Battery pack product catalogue |
| BMS | `/masters/bms` | BMS model registry |
| Cells | `/masters/cells` | Cell model specifications |
| Chargers | `/masters/chargers` | Charger unit registry |
| Test Equipment | `/masters/test-equipment` | Testing instrument registry |
| Connectors | `/masters/connectors` | Connector type catalogue |
| Cables | `/masters/cables` | Cable type catalogue |
| Busbars | `/masters/busbars` | Busbar specification registry |
| Cabinets | `/masters/cabinets` | Cabinet/enclosure catalogue |
| Charger Units | `/manufacturing/chargers` | Physical charger unit management |
| Dealers | `/logistics/dealers` | Dealer master with GST/location |

---

### ⚙️ Manufacturing Engine

**Cell Receiving & Grading**
- Inbound cell lot creation with supplier, model, batch, quantity
- Per-cell grading (capacity, internal resistance, voltage)
- Grade configuration (A/B/C thresholds)
- Grade-based cell allocation for battery packs
- Cell reservation / release lifecycle

**Production Orders**
- Full 9-stage lifecycle: Cell Allocation → Assembly → Compression → BMS Install → BMS Programming → Charging → Testing → Quality Control → Packing
- Stage state machine: `pending → in_progress → completed → approved / rejected`
- Per-stage data capture with supervisor sign-off
- Priority levels: low / medium / high / urgent
- Rework queue for rejected stages

**Charging**
- Charger unit assignment to production orders
- Live charging dashboard (available / busy / maintenance)
- Formation charge completion reports

**Testing & QC**
- Test result capture (pass/fail per parameter)
- QC approval / rejection with notes
- 30-day quality summary metrics

**Packing**
- Packing completion with final weight / dimensions
- Dispatch readiness flag

---

### 🚚 Logistics

- Dispatch orders with dealer assignment
- 5-step status workflow: Draft → Confirmed → Loaded → In Transit → Delivered
- Battery item addition / removal (draft stage only)
- Shipment event logging (actor, notes, timestamp)
- Dealer master with GSTIN, location, contact

---

### 📊 Reporting

| Report | Route | Description |
|--------|-------|-------------|
| Production Report | `/reports/production` | Orders, throughput, efficiency by date range |
| QC Report | `/reports/qc` | Pass rates, reject reasons, sample counts |
| Cell Grading Report | `/reports/cell-grading` | Grade distribution, supplier analysis |
| Logistics Report | `/reports/logistics` | Dispatch summary, dealer performance |

---

### 📈 Director Dashboard

Live command center at `/` (director role):

- **8 KPI cards** — Today's Target, Completed, Efficiency, In Progress, QC Pending, Dispatch Ready, Rework Queue, Charger Utilisation
- **Manufacturing pipeline** — Live stage-by-stage health (green / yellow / red)
- **Factory alerts** — Critical / Warning / Info feed
- **Recent production orders** — Last 10 with status + priority
- **Operator activity** — Per-operator battery completions today
- **Equipment status** — Charger + test equipment availability bars
- **Cell inventory** — Received / Grading / Approved / Allocated / Rejected / Quarantine
- **Quality summary** — 30-day pass rate, reject rate, sample count
- **Logistics summary** — Ready for dispatch, in transit, delivered today
- **Quick actions** — 6 one-click navigation shortcuts
- **Auto-refresh** — 30-second countdown with manual override

---

### 🎨 ODS Design System v1.0 — FROZEN

**19 certified components:**

| Component | Category |
|-----------|----------|
| ModuleHeader | Foundation |
| OdsCertBadge | Foundation |
| OdsStatusBadge | Foundation |
| OdsEmptyState | Foundation |
| OdsTableSkeleton | Foundation |
| OdsSearchBar | Interaction |
| OdsToolbar | Interaction |
| OdsDrawer | Overlay |
| OdsDialog | Overlay |
| OdsDataTable | Data |
| OdsCommandPalette | Navigation |
| useOdsNotify | Feedback |
| OdsDevMode | Developer |
| OdsMetricCard | KPI |
| OdsMetricGrid | KPI |
| OdsChartCard | Chart |
| OdsTimeline | History |
| OdsStepper | Workflow |
| OdsPageLayout | Layout |

Design tokens in `src/ods/theme/`. Registry at `artifacts/ocs-one/docs/ods-component-registry.md`.

---

### 🛠️ Developer Portal

- **`/developer/architecture`** — Interactive module dependency map (13 nodes, detail panel with APIs / tables / components / ODS usage)
- **`/design-system`** — Live component showcase with interactive examples for all 19 ODS components
- **`Ctrl+K`** — Global command palette with module navigation and developer shortcuts
- **`Ctrl+Shift+D`** — Developer mode overlay showing page info, environment, shortcuts

---

### 🔐 Security & Auth

- JWT httpOnly cookie — no localStorage token exposure
- bcryptjs password hashing (10 rounds)
- Role-based access control on all routes
- Helmet security headers
- CORS allowlist
- Rate limiting (auth routes: 20 req/15min)
- Input validation via Zod on all API endpoints
- SQL injection protection via Drizzle ORM parameterised queries

---

### 🏗️ Infrastructure

- pnpm workspaces monorepo (Node.js 24, TypeScript 5.9)
- Shared libs: `@workspace/db`, `@workspace/api-spec`, `@workspace/api-client-react`, `@workspace/api-zod`
- esbuild CJS bundle for API server
- Vite + React 19 frontend
- ESLint flat config (zero warnings enforced)
- Replit workflow-based process management
