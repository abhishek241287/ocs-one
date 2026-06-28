# MAT-06 — Security & Reliability Certification

**Module:** Cell Grading (CW-02)
**Assessor:** Replit Agent (QA)
**Date executed:** 2026-06-28
**Prerequisite:** MAT-05 ✅ APPROVED & gate CLOSED (2026-06-28)
**Status:** 🟦 EXECUTED — all 14 areas assessed; 3 permanent platform suites run; 11 grading-specific
probes run; scanners re-run. **1 finding (Low, platform, false-positive).** Awaiting CTO sign-off.

> **Honesty statement.** Graded on what is *demonstrably true in the running system*. Cell Grading's
> security is governed almost entirely by the **frozen platform standards** (SS-01 matrix, SS-02 authz,
> SS-03 audit, SS-04 config) certified in CW-01; MAT-06 here re-runs those suites against the live
> system, confirms the grading endpoints are inside each one's source-of-truth matrix, and adds
> grading-specific probes for what the suites do not cover. No production code or config was changed.

---

## Cert-wave triage (per standing CTO preference — classify FIRST)

**Approach is platform-consumption, not platform-development.** Cell Grading's security controls are
the shared frozen platforms (auth middleware, `requireWriteRole`/`requireRole`, SS-01..04, ECF
immutability). MAT-06 therefore *measures* those platforms against the grading surface rather than
building anything. Any finding is classified module-specific vs platform before remediation; per the
Platform Freeze Policy a platform finding is fixed only under the Critical / High / security-vuln gate,
else it is backlogged.

---

## Scope — 14 security areas (CTO-authorized template, mirrors CW-01)

| # | Area | Result (Cell Grading) | Evidence |
|---|------|----------------------|----------|
| 1 | Authentication | ✅ PASS (platform) | All grading routes behind global `requireAuth`; bcrypt-12, constant-time reject, generic failure — certified CW-01, unchanged |
| 2 | Authorization (RBAC) | ✅ PASS | **SS-02 235/235.** `cells.grade` operator+ (viewer 403), `cells.correct` supervisor+ (operator 403), `cells.config.update` supervisor+ (operator 403), `cells.measurements`/`config.read` any-authed; anon 401 everywhere |
| 3 | Session management | ✅ PASS (platform) | JWT in httpOnly `ocs_token`, sameSite=lax, 8 h TTL; stateless-revocation gap is platform-wide `DEF-CW01-M06-005` (OPEN, accepted-risk), not grading-specific |
| 4 | Input validation | ✅ PASS | Zod bounds (DEF-CW02-004: voltageV>0, capacityAh>0, IR≥0 → 400); `gradedBy`/`correctedBy` blank-guard (DEF-CW02-005 → 400); mandatory `correctionReason` (→ 400 blank/missing); empty-body guard on `PUT /cells/config` (→ 400). Probes P1, P2a–c, P3, P6a–b |
| 5 | Rate limiting | ✅ PASS (platform) | Global 300/min covers grading; auth 20/15min; register 20/15min. SS-04 bounds verified |
| 6 | CSRF / XSS | ✅ PASS (platform) | sameSite=lax + CORS locked (no token by design, documented); helmet CSP env-aware; static-frontend caveat documented (CW-01 DEF-004) |
| 7 | Audit logging | ✅ PASS | **SS-03 authoritative 12/12** incl. `cell_graded`, `grading_started`, `lot_fully_graded`, `cell_grade_corrected` — all recorded with full fields; immutability proven static + runtime (byte-identical across security_events, cell_lot_events, engineering_corrections). ⚠ default shape-mode produced 1 false-positive → **OBS-CW02-M06-001** |
| 8 | Backup & recovery | ✅ PASS (platform) | Replit-managed PostgreSQL point-in-time checkpoints; no separate grading RPO/RTO |
| 9 | Failure recovery | ✅ PASS (platform) | Global error handler Zod→400 / 23505→409 / 23503→400 / else 500 no-leak; stateless JWT survives restart; **correction route re-checks state inside tx under `SELECT … FOR UPDATE`** (TOCTOU-safe) |
| 10 | Penetration testing | ✅ PASS | Mass-assignment probe P4: injected `grade:"A"` + `status` + `id`/`lotId` ignored — server **computed** `grade=reject`; SS-02 anon/forged-token → 401; cell IDs are UUIDs (no enumeration) |
| 11 | Dependency review | ✅ PASS | `runDependencyAudit` 0 critical/0 high/0 moderate/0 low |
| 12 | Secret management | ✅ PASS (platform) | `getSecret()` throws if `SESSION_SECRET` absent; no hardcoded secrets; HoundDog 0 findings |
| 13 | File upload | ✅ N/A | Grading API is JSON-only; no upload path |
| 14 | API abuse | ✅ PASS | No public registration; rate-limited; mass-assignment mitigated (P4); Zod strips unknown keys |

---

## Permanent platform suites — live results (2026-06-28)

| Suite | Standard | Command | Result |
|-------|----------|---------|--------|
| Config integrity | SS-04 | `test:config` | ✅ **PASS — 31 pass · 3 warn · 0 fail** (warns = documented dev-only: admin default pw, cookie secure off, script-src unsafe-inline). Battery-grading thresholds (capacity A>B>C, IR mult) validated. RBAC matrix = 47 endpoints |
| Authorization | SS-02 | `test:authz` | ✅ **PASS — 235/235** (47 endpoints × 5 principals). All grading rows correct |
| Audit trail | SS-03 | `test:audit` (`CERT_AUDIT_RATELIMIT=1`) | ✅ **PASS — 12/12** audited ops recorded; immutability static + runtime green |
| Audit trail | SS-03 | `test:audit` (default shape-mode) | ⚠ **1 false FAIL** — `ratelimit.exceeded` shape-check picked MAT-05 flood residue → **OBS-CW02-M06-001** |

## Scanners — live results (2026-06-28)

| Scanner | Result |
|---------|--------|
| Dependency audit | ✅ 0 critical / 0 high / 0 moderate / 0 low / 0 info |
| SAST (semgrep) | ✅ for certified surface — 1 MEDIUM in `mockup-sandbox/src/App.tsx` (dev canvas tool, **not** the API/grading surface; same as CW-01) |
| HoundDog privacy | ✅ 0 findings |

---

## Grading-specific probes (live, throwaway prefixed fixtures, set-based teardown)

| # | Probe | Expected | Actual | Status |
|---|-------|----------|--------|--------|
| P1 | `PUT /cells/config` empty body `{}` | 400 | 400 | ✅ |
| P2a | `POST grade` negative capacityAh | 400 | 400 | ✅ |
| P2b | `POST grade` negative voltageV | 400 | 400 | ✅ |
| P2c | `POST grade` negative IR | 400 | 400 | ✅ |
| P3 | `POST grade` blank `gradedBy` | 400 | 400 | ✅ |
| P4 | `POST grade` mass-assign `grade:"A"`/`status`/`id`/`lotId` | ignored, grade computed | 200, grade=**reject** (computed) | ✅ |
| P5 | `POST grade` valid | 200 | 200 | ✅ |
| P6a | `POST correct` blank `correctionReason` | 400 | 400 | ✅ |
| P6b | `POST correct` missing `correctionReason` | 400 | 400 | ✅ |
| P7 | `POST correct` valid | 200 | 200 | ✅ |
| P8 | `GET measurements` — immutable original | seq1 original + seq2 correction | `1:original 2:correction` | ✅ |

**Teardown:** all `CERTM06-*` fixtures removed set-based; baseline restored exactly
(58 cells / 14 lots / 1 ECF / 23 events; 0 residual).

---

## Findings

| ID | Sev | Module/Platform | Summary | Recommendation |
|----|-----|-----------------|---------|----------------|
| OBS-CW02-M06-001 | **Low** | **Platform** (SS-03 suite) | SS-03 *default shape-mode* `ratelimit.exceeded` check selects the single **most-recent** `ratelimit.exceeded` row and asserts its path includes `/auth/login`. A prior **global-limiter** flood (MAT-05 stress, or normal production global throttling) leaves global rows (path `/api/cells`) newest → default-mode emits a **false FAIL**. **The audit logging itself is correct and fully wired** (all 3 limiters emit identical records; authoritative mode `CERT_AUDIT_RATELIMIT=1` PASSES 12/12). No grading audit gap; no security/data defect. | Make shape-mode select the newest **login-limiter** row (filter by `path LIKE '%/auth/login%'` or limiter name) instead of the global newest. Frozen-platform → **CTO decision**: authorize the small SS-03 selector fix now, or backlog and rely on authoritative mode. Caveat: default-mode `audit` validation workflow stays red until resolved. |

**0 Critical / 0 High / 0 Medium.** 1 Low (platform suite false-positive).

---

## Security scorecard (10-pt)

| # | Criterion | Result |
|---|-----------|--------|
| 1 | Authn enforced on all grading routes | ✅ requireAuth global |
| 2 | RBAC least-role per grading endpoint | ✅ SS-02 235/235 |
| 3 | Input validation + bounds | ✅ P1/P2/P3/P6 |
| 4 | Mass-assignment mitigated | ✅ P4 (computed grade) |
| 5 | Audit completeness (grade/correct) | ✅ SS-03 authoritative 12/12 |
| 6 | Audit immutability | ✅ static + runtime byte-identical |
| 7 | Config integrity (SS-04) | ✅ 0 fail |
| 8 | Dependency / SAST / privacy clean | ✅ 0 high+ ; 1 MEDIUM off-surface |
| 9 | Failure recovery / TOCTOU-safe correction | ✅ FOR UPDATE in tx |
| 10 | Teardown 0 residual / honesty | ✅ baseline restored exactly |

**Score: 10/10.**

---

## Security Decision

**PASS WITH NOTE** — Cell Grading satisfies all 14 security areas: SS-02 235/235, SS-03 authoritative
12/12 (immutability proven), SS-04 0-fail, all 11 grading probes pass, scanners clean for the certified
surface. **0 Critical / High / Medium.** One **Low platform** finding (`OBS-CW02-M06-001`) — an SS-03
*default shape-mode* false-positive caused by MAT-05 flood residue, with the authoritative mode green —
recommended for a small selector fix or backlog per CTO ruling under the freeze policy. Awaiting CTO
sign-off to close the MAT-06 gate.

**Signed:** Replit Agent (QA) · 2026-06-28
