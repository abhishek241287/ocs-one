---
name: Concurrency certification
description: How race-condition certification must distinguish a working atomic guard from unrelated request failures.
---

Concurrency certification must create isolated fixtures that are already at the exact workflow state needed to reach the contested operation. The assertion must require exactly one successful request and one loser with the expected contention response; “at most one success” is insufficient.

**Why:** Data-dependent races can skip indefinitely, and permissive success counts can pass when both requests fail before reaching the atomic operation.

**How to apply:** For reservation, allocation, and state-transition races, seed uniquely prefixed fixtures, fire requests concurrently, assert the winner and loser contracts explicitly, and clean fixtures in `finally`.