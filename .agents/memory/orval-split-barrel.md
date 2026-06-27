---
name: Orval split mode barrel exports
description: After codegen in split mode, the api-zod barrel must use `export * as types` not `export *` to avoid duplicate identifier errors.
---

The rule: In `lib/api-zod/src/index.ts`, the types barrel export must be namespaced:
```ts
export * as types from "./generated/types";
// NOT: export * from "./generated/types";
```

**Why:** Orval split mode generates both Zod schemas (in `api.ts`, `api.schemas.ts`) and TypeScript types (in `types/`). Running `export *` from both causes duplicate identifier TS2308 errors since the same names appear in both outputs.

**How to apply:** After every `pnpm --filter @workspace/api-spec run codegen` run, verify the barrel file is using the namespaced form. If codegen overwrites it, fix manually before the next typecheck.
