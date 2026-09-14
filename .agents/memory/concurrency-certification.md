---
name: Concurrency certification
description: How race-condition certification must distinguish a working atomic guard from unrelated request failures.
---

Concurrency certification must create isolated fixtures that are already at the exact workflow state needed to reach the contested operation. The assertion must require exactly one successful request and one loser with the expected contention response; “at most one success” is insufficient.

**Why:** Data-dependent races can skip indefinitely, and permissive success counts can pass when both requests fail before reaching the atomic operation.

**How to apply:** For reservation, allocation, and state-transition races, seed uniquely prefixed fixtures, fire requests concurrently, assert the winner and loser contracts explicitly, and clean fixtures in `finally`. Record a separate aggregate failure when both individually allowed responses are winners.

Selector-based race fixtures must isolate the selected master as well as the transaction rows. If a resolver falls back to another approved revision after the contested row changes state, a “no downstream record” assertion can describe the fixture incorrectly rather than prove the invariant.

**Why:** The BOM resolver selects the latest approved revision; obsoleting an isolated revision can legitimately expose an older approved revision unless the race fixture owns the model and has exactly one approved BOM.

**How to apply:** For lifecycle races involving “latest approved” or similar selectors, create a unique master with one candidate row, then assert both the contested row and all downstream references.

Legacy certification suites should be run as standalone gates, not nested after mutation-heavy fixture suites; shared database state and in-memory API limiters can create false failures in otherwise passing race cases.

**Why:** A combined Universal Capture run repeatedly made the existing forced-lot PH4 check fail while the same suite passed cleanly against a fresh API process and database state.

**How to apply:** Keep cross-suite regression coverage explicit, but execute each suite against a clean API state and report a nested-harness failure separately from the feature under test.