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
