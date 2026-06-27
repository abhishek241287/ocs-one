---
name: Stale lib declarations cause Zod {} type
description: After codegen, run typecheck:libs before leaf artifact typechecks or Zod parse() returns {} instead of the real shape
---

When `pnpm --filter @workspace/api-spec run codegen` adds new Zod schemas to `lib/api-zod/src/generated/api.ts`, the compiled dist declarations (`lib/api-zod/dist/`) are NOT automatically updated. Leaf artifacts (`api-server`, `ocs-one`) import from the dist, so they see stale types.

**Symptom:** `SomeZodSchema.parse(...) → {}` type. TypeScript reports `Property 'id' does not exist on type '{}'` even though the runtime value is correct.

**Why:** The `lib/api-zod` package is a composite lib. Its `.d.ts` files are only rebuilt by `tsc --build`. The codegen only writes `.ts` source, not the compiled declarations.

**How to apply:** Always run this after codegen before typechecking leaf artifacts:
```bash
pnpm run typecheck:libs
```

Then re-run leaf checks. If both still fail, the issue is something else (e.g. the parent-router param typing problem documented separately).
