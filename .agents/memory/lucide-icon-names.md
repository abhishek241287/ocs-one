---
name: Lucide icon naming v0.511+
description: PlayCircle was renamed to CirclePlay in lucide-react ≥0.5; using the old name causes a ReferenceError at runtime.
---

The rule: Use `CirclePlay` (not `PlayCircle`) in lucide-react ≥0.5.

**Why:** The icon was renamed as part of lucide's naming convention change (noun-first). The old name `PlayCircle` simply does not exist and TypeScript won't catch it if the import is a wildcard or re-export.

**How to apply:** Search for `PlayCircle` in any import — replace with `CirclePlay`. Other similarly renamed icons to watch for: `CheckCircle` → `CircleCheck`, `XCircle` → `CircleX` (but XCircle still exists in 0.511 — verify against the installed version).
