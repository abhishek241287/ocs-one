---
name: Masters factory centralizes PG write-error → HTTP mapping
description: The shared master router maps Postgres constraint violations to client errors for every master — adding a new master with unique/FK columns gets correct 409/400 for free.
---

# Masters factory — centralized PG write-error mapping

`createMasterRouter` (the shared master factory) wraps create + update in try/catch and
routes Postgres constraint violations through one helper for EVERY master:

- `23505` (unique violation) → **409**, message names the violated field when PG reports
  it (`detail: "Key (col)=(val)…"`), else a constraint-agnostic fallback.
- `23503` (FK violation) → **400** (`Invalid <resource>: a referenced record does not exist`).

**How to apply:** when adding a new master, do NOT write per-route duplicate/FK handlers —
declare the unique/FK constraints in the schema and the factory returns the right status +
message automatically. The first master with an FK (Material Master, `category_id`) is why
the FK branch exists.

**Why:** platform-improvement principle — fix once in the shared framework so every master
benefits, not just the one under development. The 409 message was made constraint-aware
(not hardcoded to `code`) so masters with non-`code` unique columns (e.g. test-equipment
`serial_number`) report the correct field.

**Trap:** Drizzle wraps the pg error, so the code/detail live on `err.cause.code` /
`err.cause.detail` as well as `err.code` / `err.detail` — check both.
