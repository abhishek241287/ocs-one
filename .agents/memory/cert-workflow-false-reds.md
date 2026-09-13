---
name: Cert validation-workflow false reds
description: Causes and fixes for cert suite false failures unrelated to code regressions.
---

## Auth-limiter saturation (authz suite repeated restarts)

**Rule:** The auth rate limiter is 20 requests / 15-minute window, shared in-process. Each `WorkflowsRestart authz` run consumes ~7 login attempts (owner + 6 temp users). After 2–3 rapid restarts the limit exhausts and all login attempts return 429 (or even 401 from miscounted retries). This looks like "login failed" or "wrong credentials" but is the limiter.

**Why:** The Replit proxy channels all requests through the same Express instance; port 80 and port 8080 share the same in-memory rate limiter state.

**Fix:** `WorkflowsRestart artifacts/api-server` — this spawns a new process and resets the in-memory limiter. Then run each cert suite exactly once, in sequence, not in parallel.

## SS-03 ratelimit.exceeded path≠login (shape-mode)

**Rule:** In default (non-authoritative) mode, the audit suite looks for a historical `ratelimit.exceeded` security event with `path ≠ /auth/login`. If the only rate-limit events recorded are from the auth-specific limiter (path = `/api/auth/login`), the shape-mode check reports MISSING. This is a pre-existing known limitation — NOT a regression introduced by application changes.

**Why:** The auth limiter fires before the global limiter during burst-login scenarios; global-limiter 429s (for paths like `/api/products`) ARE logged correctly but the shape-mode query finds the auth-limiter event first by timestamp.

**How to apply:** Run with `CERT_AUDIT_RATELIMIT=1` to trigger an authoritative non-login rate limit event, or accept the shape-mode red as a known false positive when no code changes touch rate limiting or audit logging.

## Reservation certification harness

**Rule:** Reservation certification should provision temporary role accounts when explicit credentials are unavailable, and teardown must discover reservations by fixture order/material IDs in addition to IDs captured by helper functions.

**Why:** Seeded development passwords may differ from the documented defaults, and direct authorization cases can create reservations without passing through the normal fixture helper; either condition otherwise causes false setup failures or leaves foreign-key-blocking residue after a passing run.

**How to apply:** Keep temporary-account cleanup in the suite's `finally` path, run concurrent allocation cases only after creating valid reservations, and use a tracked signed ledger adjustment when the test must exercise allocation scarcity below the creation-time availability check.
