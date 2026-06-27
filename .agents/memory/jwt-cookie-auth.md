---
name: JWT httpOnly cookie auth (OCS One)
description: Auth architecture for OCS One — JWT in httpOnly cookie, public routes, seeded admin.
---

Cookie name: `ocs_token`. HttpOnly, SameSite=Lax, Secure in production. Signed with `SESSION_SECRET` env var.

Public routes (no auth required):
- `GET /api/healthz`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

All other routes are guarded by `requireAuth` middleware in `artifacts/api-server/src/middleware/auth.ts`.

Admin seed: `admin@ocs.local` / `OCS@Admin2026!` — role: director. Created on startup in `seed.ts` if not present.

RBAC roles: `director | supervisor | operator | viewer` (pgEnum). Use `requireRole("director", "supervisor")` for route-level role enforcement.

**Why httpOnly cookie:** Eliminates XSS-based token theft. The frontend never accesses the token — all auth state comes from `GET /api/auth/me`.

**RBAC guardrail (MAT-06 finding):** `requireAuth` is NOT authorization. It only proves *a* valid session — the default `viewer` role passes it. Every mutating route (POST/PUT/PATCH/DELETE) needs its OWN explicit `requireRole(...)`; the global guard in `routes/index.ts` does not add one. **Why:** the security cert found most mutations (mfg stages, QC approval, masters CRUD, logistics, cell matching/grading) were behind `requireAuth` only, letting a viewer mutate production data. **How to apply:** when adding any write route, add `requireRole(...)` with the least sufficient role; directors should always be included so existing director e2e flows keep working.

**Public registration caveat:** `/auth/register` is public and assigns `viewer`; for this internal ERP it should be admin-gated and/or rate-limited (it is NOT under the login auth limiter — only the global 300/min). Confirm onboarding model before relying on it.
