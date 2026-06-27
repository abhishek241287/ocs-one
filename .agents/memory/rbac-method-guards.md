---
name: Method-based RBAC guard pitfalls
description: Two non-obvious failure modes when using requireWriteRole (method-based read/write RBAC) mounted per sub-router in the Express API.
---

# Method-based RBAC guard pitfalls

`requireWriteRole(...roles)` lets GET/HEAD pass for any authed user and gates
POST/PUT/PATCH/DELETE to the listed roles. Two traps surfaced during MAT-06 and
were caught by architect review, not by typecheck/lint:

## 1. A router-level write guard on a parent URL prefix shadows sibling routers

**The bug:** `ordersRouter` was mounted at `/orders` with
`router.use(requireWriteRole("supervisor","director"))`. Sibling routers were mounted
at `/orders/:id/stages`, `/orders/:id/genealogy`, `/orders/:id/test-results` (operator+).
Because Express `use("/orders", ...)` matches every path starting with `/orders` and is
registered first, the supervisor+ guard fired for all those nested paths too — silently
blocking operators from legitimate stage execution. RBAC tests for `/orders` alone looked
fine; the regression only shows when you test the nested operator paths.

**Rule:** never put a router-level write guard on a router whose mount prefix is a parent
of other mounted routers. Apply the guard per-route on that router's own write routes
instead. A catch-all router mounted at `/` is safe **only** if it is registered LAST
(specific routers match first) — that is how `/cells` (`router.use("/", cellsRouter)`)
avoids the problem.

**Why:** Express runs prefix-matched middleware in registration order; a broad parent
guard runs before the more specific sibling ever gets a chance.

## 2. GET handlers must never write (get-or-create on read)

**The bug:** `GET /cells/config` called a get-or-create helper that INSERTed the singleton
row on first access. Under method-based RBAC, GET passes for any authed user, so a viewer's
read could trigger a DB write — breaking the "viewer is read-only everywhere" guarantee.

**Rule:** if RBAC relies on the HTTP method, GET/HEAD must be strictly side-effect free.
Seed singleton/config rows at startup (`lib/seed.ts`, insert + `onConflictDoNothing`) and
keep GET a pure select. Confine any create-on-missing fallback to the write path (PUT), which
is already role-gated.

**How to apply:** when reviewing any new endpoint, check (a) does this GET write? and
(b) is any write guard mounted on a prefix that overlaps a sibling router? Both are
invisible to typecheck/lint and to single-path curl checks — test the nested/role matrix.
