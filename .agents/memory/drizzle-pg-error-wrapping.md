---
name: Drizzle wraps PG errors in _DrizzleQueryError
description: PostgreSQL error codes (e.g. 23505 unique violation) are not directly on the error object thrown by Drizzle — they are on err.cause. Global Express error handlers must check both.
---

## The Rule

When catching PostgreSQL errors thrown by Drizzle ORM, always check `err.cause?.code` in addition to `err.code`. Drizzle wraps the original `pg.DatabaseError` inside a `_DrizzleQueryError`, so the real PG error code (`23505`, `23503`, etc.) lives on the `.cause` property, not directly on the thrown error.

**Why:** A global Express error handler that only checks `(err as any).code === "23505"` will silently miss Drizzle-thrown unique constraint violations and fall through to a 500. The bug is invisible at the call site because Drizzle does not document this wrapping behavior.

**How to apply:** In any Express global error handler that needs to distinguish PG error codes:

```typescript
const pgCode = (err as any)?.code ?? (err as any)?.cause?.code;
if (pgCode === "23505") {
  const detail = String((err as any)?.detail ?? (err as any)?.cause?.detail ?? "");
  // parse detail for field/value, return 409
}
```

Also applies to FK violations (`23503`), not-null violations (`23502`), etc. — always check both `err` and `err.cause`.
