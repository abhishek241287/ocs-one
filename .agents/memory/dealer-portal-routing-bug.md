---
name: Dealer portal routing bug (C1 isolation guard unreachable)
description: Two bugs that made the C1 dealer isolation guard dead code; how they were found and fixed.
---

## Rule

Two separate bugs conspired to make the C1 dealer isolation guard in `routes/dealers/index.ts` completely unreachable and ineffective:

### Bug 1 — `denyDealerFactoryAccess` blocked the `/dealers` prefix globally

`denyDealerFactoryAccess` in `middleware/auth.ts` was applied at line 47 of `routes/index.ts`, before the dealers router mounted at line 79. It returned 403 for ALL dealer-role requests with no path exemption — including the `/dealers/*` portal routes the C1 patch was meant to serve.

**Fix:** Added a path check: if `req.path.startsWith("/dealers")`, call `next()` so the dealers router's own isolation guard can apply.

### Bug 2 — `req.params.id` is empty at `router.use()` middleware level

Inside the dealers sub-router, `router.use(handler)` fires **before** Express matches any route pattern. At that point, `req.params` only contains params from the parent router's matched path — not the `/:id` param defined on child route handlers. So `req.params.id` was always `undefined` at the middleware level.

**Fix:** Extract the dealer ID from `req.path.split("/")[1]` instead. Inside the dealers sub-router, `req.path` is relative to the `/dealers` mount point (e.g. `/<uuid>/inventory`), so the first segment IS the dealer ID.

**Why:** Express route params are only populated when a route pattern is matched (i.e., during route-handler dispatch), not during preliminary `router.use()` middleware execution. This is a common Express 4 footgun.

**How to apply:** Any router.use() middleware that needs to read a route param (`:id`, `:dealerId`, etc.) MUST use `req.path.split("/")` or `req.url` parsing — NOT `req.params.xyz`. Alternatively, move the check into each route handler directly where params ARE available.
