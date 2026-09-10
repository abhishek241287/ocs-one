---
name: FAT Block 2 fixture validation
description: Controlled masters/BOM FAT runs must validate negative-input fixtures before counting the application response.
---

Negative FAT inputs must use an explicitly nonexistent foreign-key UUID, and any accidental controlled row created by a harness mistake must be removed and disclosed before final totals.

**Why:** A Block 2 harness initially reused the newly created valid category for an invalid-FK case, producing a correct 201 that looked like an application defect and left an unintended controlled row.

**How to apply:** Build invalid-FK bodies separately from valid fixture builders; verify the target row is absent after cleanup; keep the corrected request/response and harness correction in the evidence.