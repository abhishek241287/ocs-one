---
name: Isolated certification targets
description: Certification wall suites must honor the wall-provided base URL so each suite tests the fresh isolated API process.
---

Every HTTP certification suite included in an isolated wall must prefer the wall-provided base URL before legacy target/default values; otherwise it can silently hit the shared API, encounter unrelated rate limits, and produce a false wall failure.

**Why:** A BOM obsoletion suite ignored the wall URL and tested a shared port, so its login was rate-limited even though the isolated wall API was healthy.

**How to apply:** When adding a suite to an isolated wall, pass `CERT_BASE_URL` (or the wall’s equivalent) through the suite and verify its target in the evidence output.