---
name: Drizzle bare-select key casing vs API contract
description: Why product sub-resource read routes must explicitly alias columns to snake_case in the select
---

Bare `db.select().from(table)` returns rows keyed by the **Drizzle JS property names** (camelCase here: `productId`, `eventType`, `createdAt`), NOT the DB column names. `numify()` only converts numeric strings — it does **not** rename keys.

The OCS One products API contract is **snake_case** end-to-end: OpenAPI component schemas (`ProductEvent`, `ProductGenealogyRecord`), the generated client/zod, and the React UI all read `product_id` / `event_type` / `component_type` / `created_at`. The products list/detail handlers get this right by listing an **explicit snake_case `.select({ ... })`**.

**Rule:** every products read route (and any route whose response is a documented snake_case schema) must use an explicit `.select({ snake_case: table.camelProp, ... })` projection. A bare `.select()` + `numify` silently emits camelCase, so the client receives `undefined` for every field and the UI renders blanks / `Invalid Date` — and it passes typecheck/lint/authz because authz only checks status codes and the response is typed as a generic record.

**Why:** discovered when the new `GET /products/:id/events` (and the pre-existing `GET /products/:id/genealogy`, identical latent bug) returned camelCase against a snake_case contract. Architect review + a real-data curl caught it; gates do not.

**How to apply:** when adding/reviewing any products sub-resource read route, diff the select keys against the OpenAPI schema's `required`/`properties` names. Never trust `.select()` + `numify` to match a snake_case contract.
