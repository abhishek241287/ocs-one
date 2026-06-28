# OCS One — Manufacturing ERP

Operations control system for OCS Oorja Green Pvt. Ltd. — end-to-end manufacturing execution for LiFePO4 battery packs, covering cell receiving, grading, matching, manufacturing stages, quality control, and logistics dispatch.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, proxied to `/api`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run lint` — ESLint with zero-warning enforcement
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string, `SESSION_SECRET` — JWT signing secret

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 + Pino logging
- DB: PostgreSQL + Drizzle ORM
- Auth: JWT in httpOnly cookie (`ocs_token`), bcryptjs password hashing
- Security: Helmet, CORS (ALLOWED_ORIGINS env), express-rate-limit (300/min global, 20/15min auth)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval split mode (from OpenAPI spec → `lib/api-client-react`, `lib/api-zod`)
- Build: esbuild (CJS bundle)
- Frontend: React 19 + Vite, Wouter v3, React Query, shadcn/ui, Tailwind

## Where things live

- `lib/api-spec/` — OpenAPI YAML (source of truth for all API contracts)
- `lib/api-client-react/src/generated/` — Orval-generated React Query hooks
- `lib/api-zod/src/generated/` — Orval-generated Zod schemas
- `lib/db/src/schema/` — Drizzle ORM table definitions (manufacturing.ts, cell-grading.ts, logistics.ts, users.ts)
- `artifacts/api-server/src/` — Express 5 API server
  - `middleware/auth.ts` — `requireAuth` / `requireRole` JWT middleware
  - `routes/auth/` — login, logout, me endpoints
  - `routes/manufacturing/stages.ts` + `helpers.ts` — stage lifecycle routes + utilities
  - `seed.ts` — admin user seed + Postgres sequence creation on startup
- `artifacts/ocs-one/src/` — React frontend
  - `hooks/use-auth.ts` — `useAuth`, `useLogin`, `useLogout` hooks
  - `layouts/AppLayout.tsx` — auth guard with redirect
  - `pages/DirectorDashboardPage.tsx` — director KPI + pipeline view
  - `components/ErrorBoundary.tsx` — top-level React error boundary

## Architecture decisions

- **JWT in httpOnly cookie** — eliminates XSS token theft; cookie named `ocs_token`, signed with `SESSION_SECRET`. Every non-public route is behind `requireAuth`. Public routes are only `/api/healthz` and `/api/auth/*`.
- **Postgres sequences for ID generation** — `mfg_order_seq` and `mfg_battery_seq` created on startup via `seed.ts`; helpers use `SELECT nextval(...)` inside transactions to avoid race conditions from `SELECT MAX(id)+1`.
- **RBAC role enum**: `director | supervisor | operator | viewer` stored in `users.roleEnum`; `requireRole(...roles)` enforces per-route role checks. `requireWriteRole(...roles)` (mounted at sub-router level) lets reads (GET/HEAD) pass for any authed user while gating writes (POST/PUT/PATCH/DELETE) to listed roles — makes viewer read-only everywhere. Director is included in every write list.
- **Security Standard SS-01** (permanent): every new endpoint must declare auth required? / minimum role / audit required? / rate limited? / input validation? / output sanitised? — before merge. `docs/security-matrix.md` is the authoritative per-endpoint reference.
- **Security Standard SS-02** (permanent): authorization is enforced by an automated regression test, not manual review. `lib/authz-matrix.ts` (every protected endpoint × 5 principals: director/supervisor/operator/viewer/anonymous) is the single source of truth shared by the SS-02 suite (`cert/authz-suite.ts`) AND the security dashboard, so they cannot drift. Run `pnpm --filter @workspace/api-server run test:authz` (validation command `authz`); any unexpected authz result fails certification. The suite retries on 429 with backoff so rate-limiting never misclassifies an outcome.
- **Security Standard SS-03** (permanent): the audit trail is verified by an automated regression test — the complement to SS-02 (SS-02 = *who may act*; SS-03 = *the act was recorded*). `artifacts/api-server/src/lib/audit-matrix.ts` (11 critical operations across BOTH append-only stores: `security_events` + the cell-receiving `cell_lot_events` timeline, with per-store field mapping) is the single source of truth for the SS-03 suite (`cert/audit-suite.ts`). It performs each real operation, then asserts the correct event persisted with all required fields (event type, actor, timestamp, entity id, details), and proves immutability two ways — static (no app route `.update()`/`.delete()`s an audit table) + runtime (a captured record is byte-identical after the run). Run `pnpm --filter @workspace/api-server run test:audit` (validation command `audit`); any audit mismatch or immutability violation fails certification. `ratelimit.exceeded` is shape-verified by default (set `CERT_AUDIT_RATELIMIT=1` to burst the auth limiter; restart api-server afterward to clear it). Mutating work runs on a throwaway cert lot + temp user torn down on exit.
- **Persistent security audit** — `security_events` table records auth (`auth.login.success`/`failed`, `auth.logout`), `user.created`, `authz.denied` (403s), and `ratelimit.exceeded` events via fire-and-forget `recordSecurityEvent()` (`lib/security-events.ts`). `lib/security-config.ts` is the single source for CSP / rate-limit / cookie / JWT config (`describeJwtConfig`/`describeCspStatus`).
- **No public registration** — `/auth/register` is director-only (`requireAuth` + `requireRole("director")`), rate-limited, audit-logged (`event: user.created`), and issues no session cookie for the created user. Factory software: users never self-register.
- **Orval split mode** — codegen generates one file per tag rather than one giant file; barrel re-exports from `lib/api-client-react/src/index.ts` and `lib/api-zod/src/index.ts`.
- **Trust proxy = 1** — Replit's reverse proxy sets `X-Forwarded-For`; without this express-rate-limit throws `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR`. Must always be set before rate limiter middleware.
- **ESLint flat config** — `eslint.config.mjs` uses `typescript-eslint` recommended rules; `no-explicit-any` is off (ORM/generic callbacks make it impractical), `no-unused-vars` is error with `^_` ignore pattern; `.local/**` excluded.

## Product

- **Cell receiving & grading** — inbound cell lot creation, individual cell grading (capacity, IR, voltage), grade configuration
- **Cell matching** — automated slot allocation for battery packs, reserve/release cells
- **Manufacturing orders** — full stage lifecycle (cell allocation → assembly → compression → BMS install → BMS programming → charging → testing → QC → packing)
- **Stage cards** — per-stage UI for operators: start/pause/resume/complete/approve/reject with data capture
- **Director dashboard** — real-time KPI metrics across all stages, pipeline health monitor, alert feed
- **Security dashboard** (`/developer/security`, director-only) — 12 sections: users-by-role, live authorization matrix, failed logins, rate-limit events, account creations, permission failures, audit feed, event histogram, SAST/privacy scan summary, dependency audit, CSP status, JWT/session + certification status
- **Logistics** — dispatch orders, dealer management, shipment events
- **Masters** — products, BMS, cells, chargers, test equipment, connectors, cables, busbars, cabinets

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- **Always run `pnpm --filter @workspace/db run push` after schema changes** before starting the server — otherwise routes using new columns will error.
- **After codegen, check `lib/api-zod/src/index.ts`** — Orval may regenerate it and duplicate exports; the barrel must use `export * as types from "./generated/types"` (not `export *`) to avoid re-export conflicts.
- **Admin seed**: `admin@ocs.local` / `OCS@Admin2026!` (director role) — created on first startup if missing.
- **`app.set("trust proxy", 1)`** must come before any `express-rate-limit` middleware or Replit's `X-Forwarded-For` header causes validation errors.
- **Postgres sequences** (`mfg_order_seq`, `mfg_battery_seq`) are created by `seed.ts` at startup using `CREATE SEQUENCE IF NOT EXISTS`.
- **Vite pre-transform errors** after codegen are stale HMR cache — restart the ocs-one workflow to clear.
- **`CirclePlay`** (not `PlayCircle`) is the correct lucide-react icon name in v0.511+.
- **All-optional Zod update bodies need an empty-body guard** — `UpdateCellGradeConfigBody` has all-optional fields, so `{}` passes `.parse()` but then `db.update().set({})` throws on an empty SQL SET clause → 500. Reject empty bodies with 400 (`Object.keys(body).length === 0`) per SS-01. Applies to any all-optional PATCH/PUT schema.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- DB indexes: all high-traffic query columns indexed in manufacturing, cell-grading, and logistics schemas
- ALLOWED_ORIGINS env var controls CORS — set to your deployment domain in production
