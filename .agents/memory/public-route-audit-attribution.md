---
name: Public-route audit attribution
description: How to record audit events on routes that run without auth middleware (e.g. logout), where req.user is never populated.
---

# Auditing public routes (logout)

Public routes — those mounted before/outside `requireAuth` — never populate
`req.user`. Any audit call that reads `req.user` on such a route silently records
nothing (fire-and-forget `recordSecurityEvent` swallows the missing actor), so the
event class appears to "work" but is permanently empty.

**Rule:** to attribute an audit event on a public route, decode the auth cookie
best-effort instead of relying on `req.user`. `middleware/auth.ts` exports
`decodeAuthCookie(req)` for exactly this — it verifies the JWT and returns the
principal or `undefined`, never throwing. Logout uses `req.user ?? decodeAuthCookie(req)`.

**Why:** `POST /api/auth/logout` is intentionally public (you must be able to clear
a stale/expired cookie). The `auth.logout` audit event was silently never recorded
until the cookie was decoded directly. Found by architect review, not by tests —
SS-02 only checks authorization outcomes, not audit side-effects.

**How to apply:** any new public route that must emit an audit/security event should
attribute the actor via `decodeAuthCookie(req)`, and should still perform its primary
action (cookie clear, etc.) regardless of whether a principal was recoverable. Consider
a regression test asserting the event persists with the actor email, since route↔
middleware drift won't be caught by the authz suite.
