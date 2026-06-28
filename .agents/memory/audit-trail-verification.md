---
name: SS-03 audit-trail verification
description: Durable design principles for certifying an append-only audit trail — what to prove and the traps to avoid.
---

# SS-03 — audit-trail verification (durable principles)

SS-03 is the audit-side complement to SS-02 (SS-02 = *who may act*; SS-03 = *the act
was recorded*). For each critical operation it performs the real operation against the
live server, then reads the audit store and asserts the event persisted correctly.

## Presence is not correctness
Asserting an event row merely *exists* with non-empty fields lets real regressions
through — a row with the right event type but wrong actor, wrong entity id, or malformed
details is still a regression. Every check must assert the **expected** actor identity,
the **expected** entity id, and the **expected** key content of the details/changes
payload — not just "non-empty".
**Why:** an architect review flagged the first cut as presence-only; mis-attribution and
malformed payloads would have certified green.
**Trap:** a generic "actor = colA ?? colB" fallback masks attribution bugs — if the
primary actor column is wrongly null but a secondary column is set, the fallback hides it.
Assert the specific column each event class is supposed to populate.

## More than one audit store
A system can have multiple independent append-only stores with different column names and
different "details" representations (free-text vs JSON), and some event classes
legitimately omit logical fields (pre-auth/structured-column events). Drive the suite from
a matrix that declares, per check, which logical fields are required — don't assume every
event populates all of them.

## Prove immutability, don't assume it — two ways
1. **Static:** scan app code for any mutation of an audit table — cover BOTH the ORM
   query-builder form AND raw SQL on the physical table name (UPDATE / DELETE FROM /
   TRUNCATE / upsert). Pattern scans are never exhaustive, so pair with (2).
2. **Runtime:** snapshot a real record mid-run, re-read by id at the end, assert
   byte-identical. The suite's own fixture teardown is exempt from the static scan but must
   never touch a record the runtime check is watching.

## Fixture hygiene ≠ mutating history
The suite provisions a uniquely-named throwaway fixture and tears it down on exit. That
deletion is test cleanup of *its own* rows, distinct from the immutability guarantee
(app code never mutating *existing* history, verified on a real re-read record).

## Keep the suite repeatable / CI-friendly
A permanent regression test runs alongside others (e.g. the authz suite). Avoid actions
that poison shared state for the next run — notably tripping a real rate limiter locks
auth for the window and breaks subsequent logins. Prefer: verify the limit-event shape
from history + a **static assertion that the logging call is still wired**, and gate the
real burst behind an opt-in env flag (restart the server afterward to clear the limiter).
