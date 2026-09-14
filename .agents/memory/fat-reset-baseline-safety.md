---
name: FAT reset baseline safety
description: FAT namespace teardown can erase pre-existing ledger exceptions when baseline rows share fixture material IDs.
---

FAT reset/seed cleanup must not treat every ledger row attached to a `FAT-E2E-*` material as disposable without first classifying pre-existing baseline rows.

**Why:** The BMS `-0.500` WIP exception used a FAT material ID, so the broad reset removed the row before its source-document trace was captured. The resulting zero balance was not a valid repair or acceptance.

**How to apply:** Before any FAT teardown, snapshot and classify existing ledger rows for controlled materials; preserve or explicitly disposition non-fixture rows, and fail closed if the reset would erase an unresolved baseline.