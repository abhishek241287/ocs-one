---
name: Child router param typing
description: Express mergeParams:true works at runtime but TypeScript doesn't see parent path params in child router handlers
---

When a child Express router is mounted at a path with params (e.g. `/orders/:id`), the child router gets those params at runtime via `mergeParams: true`. However, TypeScript types `req.params` as only the params declared in the child router's own route strings — the parent `:id` is invisible to the type system.

**Why:** TypeScript infers `req.params` from the route string literal at compile time. Parent params aren't part of the child router's type context even with `mergeParams: true`.

**How to apply:** In any child router that inherits params from its parent mount path, access inherited params with an explicit cast:

```typescript
const id = (req.params as Record<string, string>).id;
```

Do NOT destructure from a Zod `.parse({ id: req.params.id })` call — `req.params.id` itself will be a type error (Property 'id' does not exist on type '{}').

This affects: `test-results.ts`, `qc-approval.ts`, and any future route files mounted under `/orders/:id/`.
