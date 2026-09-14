---
name: Phase 6 fixed-lot residue
description: Certification rerun behavior when the Phase 6 fixture setup is interrupted.
---

The Phase 6 final gate now uses a run-unique internal lot number derived from its fixture prefix. An older interrupted run can still leave a `LOT-R1`/`P71H-*` graph behind, so the first clean rerun may require scoped development cleanup.

**Why:** A timed-out gate left its fixture lot, capture data, GRNs, and users in the development database; the next run failed before producing a verdict. Cleanup must respect child-before-parent foreign keys and the attribute-definition/unit dependency.

**How to apply:** If stale residue is found, inspect and remove only the interrupted `P71H-*` fixture graph and `LOT-R1` in development, deleting capture values, GRN/capture evidence, master dependents, lowercase attribute definitions/templates, uppercase units/masters, audit actors, and users in dependency order. Then rerun the gate.