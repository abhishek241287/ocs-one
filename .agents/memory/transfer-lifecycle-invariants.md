---
name: Transfer lifecycle invariants
description: Durable rules for transfer-request idempotency and conservation certification.
---

Transfer issue and receive use the same database idempotency column, so persisted keys must be phase-prefixed (`issue:` or `receive:`); advisory-lock namespaces must remain phase-specific too.

**Why:** A single unscoped key lets an issue key collide with a receive key and can replay the wrong physical operation. Prefixing preserves the schema constraint while keeping issue and receive retries independent.

Rejected transfers retain their historical issued quantity for auditability, while reversal rows bring net in-transit stock back to zero. Conservation certification must therefore exclude terminal rejected/cancelled requests from the active issued/received/in-transit equation, while separately checking reversal pairs and source restoration.

**Why:** Treating a rejected request as an active transfer produces a false conservation failure even though the signed reversal ledger is correct.

**How to apply:** For future transfer certification, key in-transit balances by request plus lot/GRN source line, test idempotency races per phase, and evaluate active and terminal lifecycle states with their distinct invariants.