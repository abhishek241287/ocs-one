---
name: CSP enforcement & static-frontend caveat
description: Why helmet CSP here protects the API, not the rendered HTML, and how the env-aware script-src/style-src split is enforced.
---

# CSP enforcement & the static-frontend caveat

**Rule:** In this project the helmet CSP set on the API server governs **API JSON
responses only** — NOT the rendered HTML document. The `ocs-one` frontend is served
as STATIC files in production (`serve="static"` in its `artifact.toml`), a separate
service from the API. So tightening the API's CSP is defense-in-depth for the API
surface; it does not add a document-level CSP to the SPA.

**Why:** During CW-01/MAT-06 we hardened CSP to resolve DEF-004. It would be
dishonest to claim "the UI now blocks inline scripts" — the API CSP header never
reaches the static HTML. A document/edge CSP for the SPA is a separate follow-up
(recommended for CW-02), enforced at the static-serving/edge layer, not in Express.

**How to apply:**
- `CSP_DIRECTIVES` in `lib/security-config.ts` is env-aware (`NODE_ENV==="production"`):
  `script-src` drops `'unsafe-inline'` in production (kept in dev only for the Vite HMR
  client); `style-src` keeps `'unsafe-inline'` as a *documented temporary exception*
  (Radix/shadcn/Recharts inject inline `style=` at runtime), pending nonce/hash work.
- SS-04 (`config-integrity.ts`) enforces this: `script-src` unsafe-inline = FAIL in
  prod / WARN in dev; `style-src` may be weakened ONLY by `'unsafe-inline'` (any
  broader value like `'unsafe-eval'` FAILs); any other directive carrying unsafe FAILs.
- When asked to "make the UI enforce CSP / block inline scripts", remember the API
  header won't do it — you must add CSP at the static/edge layer for the SPA.
