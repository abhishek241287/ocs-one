---
name: SS-03 rate-limit event selector limitation
description: Why the default-mode `audit` workflow can show a false FAIL, and the authoritative-mode rule
---

# SS-03 `ratelimit.exceeded` verification — recency selector is fragile

The SS-03 audit suite verifies `ratelimit.exceeded` in two modes:

- **Default (shape) mode** — selects the single **most-recent** `ratelimit.exceeded` row and asserts its
  path resembles `/auth/login`. All three limiters (login / API / global) emit identical
  `ratelimit.exceeded` records, so if any prior run tripped the **global** limiter (e.g. a MAT-05 flood),
  the newest row is a global event and the check **false-FAILs**. This is the usual cause of the red
  `audit` workflow — NOT an audit or security defect.
- **Authoritative mode** (`CERT_AUDIT_RATELIMIT=1`) — deterministically generates and verifies a
  login-limiter event; **passes 12/12**. This is the real SS-03 gate.

**Operating rule (CTO directive):** whenever a certification run intentionally floods/stress-tests before
audit verification, run SS-03 in **authoritative mode**. Treat a red default-mode `audit` workflow as
expected residue unless authoritative mode also fails.

**Why:** the selector is recency-based, not class-based; unrelated prior traffic poisons it.

**How to apply:** backlogged as **SEC-001** (Security Framework v2.0) — make the selector class-aware
(filter login/API/global by limiter or path family, optionally add a `limiterClass` discriminator to the
audit detail). FROZEN — no platform code change during CW-02→CW-08 unless a Critical/High/security gate.
