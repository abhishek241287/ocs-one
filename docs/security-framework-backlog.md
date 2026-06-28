# Security Framework (SS-01 … SS-04) — Enhancement Backlog

> **Purpose.** The parking lot for Security Framework improvements that are **not** built during
> the certification waves (CW-02 → CW-08). Per the Platform Freeze Policy, the Security Standards
> are FROZEN at v1.0; an item lands here unless it meets the **Critical / High / security-vuln**
> gate, in which case it is fixed once in the shared framework and re-verified against SS-02/03/04.
> These are candidates for **Security Framework v2.0** on the post-certification roadmap.

| ID | Title | Severity | Value | Affects | Target |
|----|-------|----------|-------|---------|--------|
| SEC-001 | SS-03 rate-limit event classification | Low | Removes a certification-harness false negative; makes audit verification deterministic regardless of prior traffic | SS-03 audit suite (`cert/audit-suite.ts` + `lib/audit-matrix.ts`) | Security Framework v2.0 (post-CW-08) |

---

## SEC-001 — SS-03 rate-limit event classification

**Source:** OBS-CW02-M06-001 (CW-02 / MAT-06, 2026-06-28). CTO-classified **Low-priority platform
observation — not a Cell Grading defect, and not an audit or security defect.**

**Root cause.** The SS-03 *default* shape-mode verification of `ratelimit.exceeded` selects the single
**most-recent** `ratelimit.exceeded` audit event and asserts its path resembles `/auth/login`. All three
limiters (login / API / global) legitimately emit identical `ratelimit.exceeded` records, so when a prior
run has tripped the **global** limiter (e.g. MAT-05's intentional flood), the newest row is a global event
and the default check produces a **false FAIL**. The audit logging itself is correct and fully wired; the
**authoritative mode** (`CERT_AUDIT_RATELIMIT=1`) deterministically generates and verifies a login-limiter
event and **passes 12/12**.

**Enhancement (v2.0).** Future SS-03 versions should explicitly distinguish the three rate-limit event
classes rather than relying on recency:

- **Login rate-limit events** — auth limiter (`/auth/login`, `/auth/register`)
- **API rate-limit events** — per-route / sub-router limiters
- **Global rate-limit events** — the global 300/min limiter

The shape-mode check should select the newest event **of the class under test** (e.g. filter by limiter
name or path family), making verification deterministic regardless of unrelated prior traffic. Optionally
record a `limiterClass` discriminator on the `ratelimit.exceeded` audit detail so the suite (and the
security dashboard) can filter precisely.

**Interim operating rule (in force now, CTO directive).** **Use authoritative mode
(`CERT_AUDIT_RATELIMIT=1`) whenever a certification run intentionally performs flood or stress testing
before audit verification.** Authoritative mode is the source of truth for the SS-03 gate; the default
shape-mode `audit` workflow may show red purely from prior global-limiter residue and does not by itself
indicate an audit defect.

**Freeze status.** **No platform code change authorized during CW-02 → CW-08.** Backlogged for Security
Framework v2.0.
