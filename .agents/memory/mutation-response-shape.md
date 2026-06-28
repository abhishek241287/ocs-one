---
name: Mutation responses must reuse the read projection
description: Write/mutation routes must return the same contract-shaped (snake_case) view as GET, never a raw Drizzle .returning()/.select() row.
---

# Mutation responses must return the contract shape, not raw DB rows

**Rule:** when a route's OpenAPI response is a snake_case entity, a POST/PATCH/PUT
handler must return that entity through the SAME projection the GET routes use —
not a raw `.returning()` / `db.select()` row.

**Why:** Drizzle rows are camelCase DB field names (`officialProductSerial`,
`productStatus`). GET routes hand-build a snake_case `.select({ official_product_serial: ... })`
projection to match the contract; mutation routes that return `.returning()` rows
(even after a `numify`-style helper that only coerces numeric strings and does NOT
rename keys) leak camelCase and break any client consuming the mutation payload.
This was a Critical architect finding on the CW-03 product status route.

**How to apply:** extract one shared `selectXView(id)` (the enriched snake_case
projection) and call it from BOTH `GET /:id` and the mutation route's success +
noop paths. Do the write inside the tx, then re-read via the shared view after the
tx for the response. `numify` (numeric-string→number) is NOT a case converter; the
generic masters layer uses a real `serializeRow` (camel→snake) — bespoke routes
must match the contract the same way.
