---
name: Phase 6 fixed-lot residue
description: Certification rerun behavior when the Phase 6 fixture setup is interrupted.
---

The Phase 6 final gate uses a fixed internal lot number (`LOT-R1`) for its setup fixture. If the process is interrupted after that lot is inserted but before the `finally` teardown runs, the next gate can fail at fixture creation with a unique-lot constraint before it reaches its own cleanup.

**Why:** A timed-out gate left its fixture lot and related capture data in the development database; the next run failed before producing a verdict.

**How to apply:** When a Phase 6 rerun fails on the lot uniqueness constraint, inspect and remove only the interrupted `P71H-*` fixture graph and `LOT-R1` in development, then rerun the gate. Prefer making the fixture lot number run-unique in a future fixture-hardening task.