---
name: FAT fixture code case convention
description: Case-sensitive fixture-code cleanup rules for certification data.
---

FAT certification uses uppercase business codes for the primary fixture graph,
while Phase 6 attribute and unit fixtures may use lowercase codes. Cleanup and
residual checks must preserve that distinction and target each namespace
explicitly.

**Why:** PostgreSQL comparisons are case-sensitive, so a broad case-insensitive
cleanup can remove an unrelated fixture or leave an interrupted lower-case
graph behind.

**How to apply:** When adding a fixture family, document its code case and use
an exact prefix predicate in teardown and residual checks; do not normalize
case in the SQL predicate.