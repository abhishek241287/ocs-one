---
name: Orval Zod compatibility
description: The security-fixed Orval 8.x line is incompatible with this repository’s Zod 3 generated contract.
---

Security remediation cannot upgrade Orval from the certified 8.18 line to 8.21 or later without a separately approved Zod/API-generation migration. Those Orval versions generate Zod 4-style calls such as `zod.uuid()` and `zod.int()`, causing codegen/typecheck failures and generated export collisions against the repository’s Zod 3 setup.

The controlled Zod 4 probe also showed that Orval 8.33 may default React Query generation to v4 when the config does not explicitly set the query version, and it can append a broad generated-types barrel export that collides with the existing namespaced export.

**Why:** The critical Orval advisories are fixed only in the newer 8.x releases, but changing Zod or generated contracts would alter a protected API/toolchain boundary.

**How to apply:** Treat the Orval finding as blocked until a dedicated compatibility migration is approved; do not bypass it with an application-logic change or silently upgrade Zod during dependency-only remediation.