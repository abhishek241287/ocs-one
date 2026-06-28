---
name: Documentation Refactoring Sprint (deferred to post-CW-02)
description: A CTO-approved doc-only cleanup to run immediately AFTER CW-02 closes — keep replit.md lightweight, move detail into docs/ subfolders. Not started yet.
---

# Documentation Refactoring Sprint — deferred to immediately after CW-02 closes

**Status:** PLANNED, not started. **Trigger:** the moment CW-02 certification closes. _Recorded 2026-06-28._

**During CW-02 (now):** keep updating the EXISTING documentation locations (replit.md, CHANGELOG,
docs/* as they already are). Do **not** restructure mid-wave — the user explicitly wants to avoid
churn and protect engineering momentum.

**After CW-02 closes — run the sprint. Objectives:**
- Keep `replit.md` as a **lightweight project index + development guide** (pointers, not full
  framework write-ups).
- Move detailed architecture → `docs/architecture/`.
- Move governance → `docs/governance/`.
- Move Product Platform docs → `docs/product/`.
- **Preserve all existing content; cross-reference, do not duplicate.**

**Hard constraint:** maintenance activity only — **no implementation changes, the certified codebase
must not be touched.** Pure docs move + cross-linking.

**Why:** as the project grows, the monolithic `replit.md` (large architecture-decisions section:
ECF, Security Standards, Unified Product Platform, etc.) is hard to navigate. The user agreed it
needs splitting but chose to defer until CW-02 is done so cert work isn't disturbed.
