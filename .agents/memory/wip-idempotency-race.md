---
name: WIP issue idempotency race
description: Concurrency rule for idempotent WIP issue creation.
---

An idempotency lookup outside the transaction is only an optimization. The
transaction must serialize on the key and recheck the existing issue before
inserting the note, lines, ledger rows, WIP row, or outbox event.

**Why:** Two requests with the same new key can both miss an external lookup;
the unique constraint then turns the loser into a conflict or 500 instead of a
successful replay.

**How to apply:** Take a transaction-scoped advisory lock derived from the
idempotency key, re-read the issue note inside the transaction, and return the
existing note with replay status when found.