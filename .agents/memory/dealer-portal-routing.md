---
name: Dealer portal routing
description: How dealer-role access is structured — portal routes must be above the factory deny gate, and param guards need router.param not router.use.
---

## Rule
The `/dealers` portal router must be mounted BEFORE `denyDealerFactoryAccess` in `routes/index.ts`, and parameter-level access control must use `router.param('id', cb)`, not `router.use(cb)`.

**Why:**
- `denyDealerFactoryAccess` is a blanket "dealer role = 403" guard for all factory routes. The dealer portal is not a factory route, so it must be carved out above that gate.
- `router.use(middleware)` runs BEFORE Express resolves the child route, so `req.params.id` is always `undefined` in it — the isolation check silently becomes a no-op. `router.param('id', callback)` fires after the parameter is bound and always has the correct value.

**How to apply:**
- Any new dealer-portal sub-router should be mounted before `router.use(denyDealerFactoryAccess)` in `routes/index.ts`.
- Any per-resource access-control check that reads `req.params.<name>` must use `router.param('<name>', cb)`, not `router.use(cb)`.
