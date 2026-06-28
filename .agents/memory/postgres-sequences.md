---
name: Postgres id-sequence integrity
description: Two distinct sequence hazards for human business ids — concurrent-insert races AND post-rollback desync that mints duplicate ids.
---

# Postgres id-sequence integrity

Human business ids (`PO-`/`BAT-`/`CORR-YYYYMMDD-NNNNNN`) embed the **raw padded
sequence value** into a UNIQUE column. Two independent hazards:

## Hazard 1 — concurrent-insert race
Mint ids with `nextval(seq)`, never `MAX(id)+1` (races under concurrency).

## Hazard 2 — post-rollback / post-restore desync (the 409 trap)
**Why:** a checkpoint rollback or DB restore brings back the *rows* but can reset
the *sequence counter* below the table's max. `nextval` then re-mints an existing
id → 23505 → surfaced as HTTP **409**, crashing the first insert in an id-minting
path (e.g. cell grading, which writes the ECF original baseline). A rolled-back tx
still advances the sequence (nextval is non-transactional), so a sequence whose
`last_value` exceeds its surviving row count is the tell.

**How to apply:** startup seeding must **forward-only resync** each sequence after
creating it — advance to the table's max only when the table is ahead, never
lower it (preserves id 1 on a fresh DB; the gap from rolled-back nextvals is
safely reclaimed because max+1 is provably unused). Guard the max scan with a
regex so a malformed legacy id can't crash the parse at startup. To diagnose a
live 409 in an id path, first compare the sequence's `last_value` against the
table's max numeric suffix before touching code.
