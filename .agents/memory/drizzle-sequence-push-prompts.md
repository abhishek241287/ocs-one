---
name: Drizzle sequence push prompts
description: How to safely apply a new pgSequence when drizzle-kit push runs without a terminal.
---

New `pgSequence` declarations can trigger Drizzle's create-versus-rename selector during
`drizzle-kit push`. In drizzle-kit 0.31, `--force` does not bypass this selector. Confirm
that the new sequence is absent and the listed existing sequences must remain, then run
the push through a pseudo-terminal and select **create sequence**.

**Why:** Non-interactive `push` and `push --force` both stop with “Interactive prompts
require a TTY,” even for a purely additive sequence. Blindly choosing a rename would
damage an existing sequence.

**How to apply:** Query `information_schema.sequences` first, capture the exact Drizzle
prompt through a temporary pseudo-terminal, and automate only the confirmed
create-sequence selection. In this workspace, `script` plus piped newline/carriage-return
input did not drive the raw-key selector; if PTY automation still blocks, use equivalent
idempotent development DDL rather than choosing a rename. Verify the resulting table,
enum, sequence, indexes, constraints, and foreign keys afterward.