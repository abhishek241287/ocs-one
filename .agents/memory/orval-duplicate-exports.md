---
name: Orval duplicate exports
description: Inline requestBody schemas in OpenAPI cause TS2308 duplicate export errors in api-zod barrel.
---

## Rule
When an OpenAPI path has an **inline** (anonymous) requestBody schema, Orval generates:
1. A TypeScript type file in `lib/api-zod/src/generated/types/<name>.ts`
2. A Zod const `export const <Name> = zod.object(...)` in `lib/api-zod/src/generated/api.ts`

Both are re-exported by `lib/api-zod/src/index.ts` via `export * from` → TypeScript TS2308 "already exported" error.

## Why
Named `$ref` component schemas only generate a TypeScript type in `types/`, not a duplicate Zod const in `api.ts`. Inline schemas trigger both.

## How to apply
**Fix**: Delete the conflicting files from `lib/api-zod/src/generated/types/` and remove their entries from `lib/api-zod/src/generated/types/index.ts`. Then re-run `pnpm run typecheck:libs`.

**Prevention**: Prefer `$ref` references for request body schemas. Only inline anonymous schemas with zero reuse potential.

**Pattern to watch for**: After codegen, if `pnpm run typecheck:libs` fails with TS2308, grep the new endpoint operation IDs. Any with inline requestBody will have a matching `<OperationId>Body.ts` in `types/` that duplicates the Zod const in `api.ts`.
