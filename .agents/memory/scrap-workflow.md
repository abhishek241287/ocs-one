---
name: Scrap workflow guard
description: Durable workflow and accounting rule for WIP scrap drafts and posting.
---

Scrap creation may preserve a draft for an exhausted WIP scope, but posting must re-read and lock the current WIP rows, reject zero/insufficient remaining quantity with no ledger or WIP mutation, and only then write the `−wip/+scrapped` ledger pair.

**Why:** A draft is workflow evidence and can outlive a competing consumption; making creation fail early hides the requested operation, while posting-time validation preserves race safety and zero-mutation losers.

**How to apply:** Keep source derivation and user-facing draft creation separate from authoritative posting checks. Any future scrap race or idempotency test should assert both the response and absence of all mutation rows on the loser path.