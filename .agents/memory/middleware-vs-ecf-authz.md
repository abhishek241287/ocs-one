---
name: Middleware role short-circuit vs ECF allowedRoles
description: An "unrestricted" role short-circuit in auth middleware does NOT reach second-layer authz checks inside services (e.g. ECF).
---

The RBAC middleware (`requireRole`/`requireWriteRole`) can short-circuit to ALLOW for an unrestricted role (e.g. `owner`), so that role never needs listing in any route's role set. But some routes call a service that runs its OWN authorization independently — notably `EngineeringCorrectionService.correct({ allowedRoles })` in `lib/ecf`, which throws 403 when `actorRole ∉ allowedRoles`. The middleware short-circuit does NOT propagate into that service check.

**Rule:** any call site passing `allowedRoles` to a service-layer authz check MUST include the unrestricted role(s) explicitly. Adding a new privileged role means auditing every `allowedRoles` (and similar second-layer) call site, not just the middleware.

**Why:** a role that passes route middleware can still be rejected deep inside a service, producing a confusing 403 that route-level curl probes miss (they 404 on a fake id BEFORE reaching the service). Only exercising the real path (real graded cell → ECF correct) reveals it.

**How to apply:** when introducing/altering a global "allow" role, grep for `allowedRoles` and any inline `.role`/role-set checks across routes AND libs; add the role; verify by exercising the real end-to-end path, not a pre-service 404 probe.
