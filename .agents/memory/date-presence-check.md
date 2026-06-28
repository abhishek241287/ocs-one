---
name: Date presence/empty check gotcha
description: A JS Date is typeof "object" with zero enumerable keys — naive presence/empty checks treat it as empty.
---

# Date fails naive "is this value present/non-empty?" checks

`typeof new Date() === "object"`, but `Object.keys(new Date()).length === 0`. So a
presence/emptiness helper that does `typeof v === "object" ? Object.keys(v).length > 0`
will wrongly report a valid Date column (e.g. `created_at`, `performed_at`) as **empty**.

**Why:** bit me in the SS-03 audit suite — every check failed `MISSING timestamp` even
though the timestamps were populated, because the Date hit the object branch and reported 0
keys.

**How to apply:** in any "is this field populated?" / deep-empty / serialization-presence
helper, special-case `v instanceof Date` (return `!Number.isNaN(v.getTime())`) BEFORE the
generic `typeof === "object"` branch. Applies to Drizzle rows where timestamp columns come
back as Date objects.
