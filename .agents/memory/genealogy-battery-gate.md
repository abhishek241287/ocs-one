---
name: Genealogy battery gate
description: Why Phase 8 genealogy certification needs a complete isolated fixture chain instead of only live endpoint smoke checks
---

The genealogy certification gate must build one isolated chain that includes the
GRN lot, typed captures, reservation/allocation, both single and bulk WIP issue
paths, partial consumption, completed Product output, and serial index identity.
The API reads remain read-only; only the certification harness creates and
tears down the prefixed fixture.

**Why:** Endpoint smoke checks can pass while the database has no data proving
that bulk and single issue paths converge, that a recalled lot reaches the
finished serial, or that serial lookup round-trips into composition. The
fixture chain makes those claims testable and makes teardown residue visible.

**How to apply:** Keep GT traversal assertions and INV-GEN integrity checks in
one non-nested battery. Fail closed when the chain cannot be created, and never
replace missing fixture evidence with a query over unrelated historical rows.