---
name: Verifying multi-field search (products/traceability)
description: How to prove a multi-field search filter works when the result list always renders one identifier column
---

`GET /products` (and the Traceability page on top of it) searches across SEVERAL fields in one OR — official serial, model code/name, dealer name, and production-order number — but the result table ALWAYS renders the product's **official serial** in the first column regardless of which field actually matched.

**Why this bites:** in a small dataset where every product matches both terms, searching by serial vs. by production-order number returns the *same rows displayed by the same serials*. A browser test (or human) watching "did the rows change?" wrongly concludes the new search field is broken/stale — it isn't.

**How to verify correctly:** use *discriminating* queries, not "do the rows change":
- a FULL specific value that matches exactly one record (e.g. a full `PO-YYYYMMDD-NNNNNN`) should NARROW the count (e.g. 2→1),
- a deliberately non-matching string should return 0 / empty state,
- confirm the unfiltered total is unchanged (a many-to-one `leftJoin` added for search must not inflate `count()` — product→order/model/dealer are all many-to-one, so no fan-out).
Prefer an API-level curl assertion on `meta.total` for multi-field search; the UI row display alone is ambiguous.
