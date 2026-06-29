# OCS One — Deployment Checklist

**Status: READY** — pending one secret (`ADMIN_PASSWORD`) and the user-initiated Publish.

Verified 2026-06-29 as part of the commercial deployment-readiness pass. No feature or
architecture changes were made; this is validation + go-live preparation only.

---

## 1. Build — ✓ verified
- Both production deployables build clean:
  - **api-server** → esbuild bundle (`dist/index.mjs`), run via `node` in production.
  - **ocs-one** → Vite static build (`dist/public`), served as static files with SPA rewrite.
- Full workspace typecheck passes.
- `mockup-sandbox` is the dev-only Canvas/design tool — **not deployed** (its build needs a dev `PORT`; expected).

## 2. Production security config — ✓ verified (SS-04: 31 pass / 3 warn / 0 fail)
- `NODE_ENV=production` is set on the api-server production run, which automatically:
  - turns the auth cookie `Secure` flag **on**, and
  - drops `script-src 'unsafe-inline'` from the CSP.
- The 3 SS-04 warnings are dev-only and resolve in production automatically (cookie-secure, CSP)
  or via action item #4 below (admin password).

## 3. Database — ✓ verified
- Production uses a **separate managed PostgreSQL**. Replit applies the dev→prod schema diff at
  Publish time (confirm any rename prompts in the Publish UI). **No migration scripts are run by hand.**
- The production DB **starts empty** of all development/test/simulation data. On first startup the app
  self-seeds: the admin user + the ID sequences (`mfg_*_seq`, `ecf_correction_seq`, `dispatch_seq`).
- **Backup/restore verified:** `pg_dump` → restore into a throwaway DB round-trips with an exact
  total row-count match. For ongoing backups: Replit checkpoints + periodic `pg_dump "$DATABASE_URL"`.

## 4. Required secret before first publish — ⚠ ACTION
- **`ADMIN_PASSWORD`** (and optionally `ADMIN_EMAIL`): set this in Secrets **before** publishing so the
  production admin is not the known default. Without it the first prod admin uses the seed default.
- `SESSION_SECRET` — ✓ already set. `DATABASE_URL` — ✓ managed.
- `ALLOWED_ORIGINS` — **not needed**: the frontend and API are same-origin via path routing, so CORS
  stays same-origin-only by design.

## 5. Performance & load — ✓ verified
- 200 requests @ concurrency 10 across dashboard, reports, products, dispatch, and stock:
  **0 errors, 0 rate-limit hits, p50 ≈ 44ms, p95 ≈ 226ms, max ≈ 296ms.**
- Rate limits in production: 300/min global, 20/15min auth (per-instance under autoscale).

## 6. End-user UAT — ✓ verified (real browser)
- Passing journeys: login → dashboard KPIs → executive & inventory reports → product inventory;
  GRN list → GRN detail (read-only inspection summary) → dispatch list → dispatch note → dealer portal.
- One transient `502` appeared only while three test/load runs hit the proxy at once; re-running the
  dealer portal solo passed — **not a defect**.

## 7. Deploy target (select at Publish)
- Recommended: **api-server = Autoscale** (stateless: JWT + Postgres); **ocs-one = Static** (already
  `serve = "static"`). Startup health check `/api/healthz` is configured.
- **Geography** is chosen in Publish → Advanced and is **permanent at first publish** (Core/Pro/Enterprise;
  Free plan publishes to North America).

## 8. Known seed data — dev only, NOT in production
- Orphan product **`BAT-20260628-000003` = Legacy Seed Data (Pre-Dispatch V1)**: a `dispatched`-state
  product carrying a legacy `DSP-2026-001` event with no dispatch document. Left **untouched** per CTO
  direction. It will **not** exist in the fresh production database.
- The dev DB also holds verification/simulation data (smoke dealer, simulation GRNs, etc.) — likewise
  absent from production.

## 9. Go-live steps
1. Set the `ADMIN_PASSWORD` (and optional `ADMIN_EMAIL`) secret.
2. Click **Publish**; choose deploy target + geography under **Advanced**.
3. Let Replit apply the schema diff to the production DB (resolve any rename prompts).
4. Post-deploy smoke check on the live URL: log in as admin, confirm `/api/healthz`, the dashboard,
   and at least one report; change the admin password if needed.
