---
name: Drizzle date column
description: Drizzle date() columns expect string input; zod.coerce.date() returns Date objects — need conversion.
---

## Rule
Drizzle's `date("col")` column type accepts **strings** (ISO format "YYYY-MM-DD"), not JavaScript `Date` objects.

## Why
When an OpenAPI schema has `type: string, format: date`, Orval generates `zod.coerce.date()` which coerces the incoming string to a JS `Date` object. Writing this `Date` into a Drizzle `date()` column causes TS2322.

## How to apply
Always convert before writing to a `date` column:
```typescript
dispatchDate: body.dispatchDate ? body.dispatchDate.toISOString().split("T")[0] : null,
```

Note: `timestamp` columns DO accept `Date` objects — this issue is specific to `date()` only.
