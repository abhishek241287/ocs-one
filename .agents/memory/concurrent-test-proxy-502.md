---
name: Concurrent test/load 502s on shared proxy
description: Parallel runTest journeys + load tests against localhost:80 can produce transient 502s that are not app defects.
---

Running multiple browser UAT journeys (runTest) in parallel — or alongside a load test —
against the shared proxy (localhost:80) can surface transient `502` gateway errors and a
blank page in ONE of the runs, while the backend APIs are actually healthy (curl returns 200).

**Why:** the 502 is a proxy/upstream-contention artifact, not a 500 from the app. The app
never rendered an error boundary; the gateway just couldn't reach the upstream momentarily
under concurrent pressure.

**How to apply:** before logging a blank-page/502 from a parallel test run as a defect,
re-run that single journey **solo** with no competing traffic and curl the underlying
endpoints. If solo passes and curl is 200, it is transient contention — not a defect.
