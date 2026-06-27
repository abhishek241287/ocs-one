# MAT-06 — Security & Reliability Certification

**Module:** Cell Receiving (CW-01)
**Assessor:** Replit Agent (QA)
**Date opened:** 2026-06-27
**Authorization:** CTO, 2026-06-27
**Prerequisite:** MAT-05 ✅ PASS (closed, all 4 closure criteria met)
**Status:** 🟡 IN PROGRESS — first-pass systematic review complete; remediation pending

> **Honesty statement.** This wave is graded on what is *demonstrably true in the
> running system*, not on intent. Where a control is partial, missing, or
> un-instrumented it is recorded as a CONCERN or DEFECT — never softened to a
> PASS. Several real broken-access-control defects were found on the first pass
> (see DEF-CW01-M06-001). This document is the assessment of record; it does not
> claim the module is secure until the defects below are remediated and re-tested.

---

## Scope

Certify that the Cell Receiving module (and the shared API surface it runs on) is
secure against common abuse and resilient to failure. Fourteen areas, as
authorized by the CTO:

| # | Area | What "pass" means |
|---|------|-------------------|
| 1 | Authentication | Credentials are stored and verified safely; no enumeration / timing leak |
| 2 | Authorization (RBAC) | Every endpoint enforces the *least* role that should reach it |
| 3 | Session management | Tokens are scoped, expiring, and revocable; logout is meaningful |
| 4 | Input validation | All mutations validate body/params against a schema before use |
| 5 | Rate limiting | Auth and write paths are throttled against brute-force / flooding |
| 6 | CSRF / XSS | State-changing requests are protected; output/headers resist injection |
| 7 | Audit logging | Security-relevant actions (auth, privileged mutations) are recorded |
| 8 | Backup & recovery | Data loss has a documented RPO/RTO and a tested restore path |
| 9 | Failure recovery | The system degrades safely and recovers from dependency failure |
| 10 | Penetration testing | Manual probing of the above finds no unhandled exploit |
| 11 | Dependency review | No known-vulnerable packages ship in the build |
| 12 | Secret management | No hardcoded secrets; safe failure when a secret is absent |
| 13 | File upload | Any upload path validates type/size and stores safely (N/A if none) |
| 14 | API abuse | Enumeration, mass-assignment, and resource-exhaustion are mitigated |

---

## Method

- **Static review** of the auth middleware, app bootstrap, and every route file.
- **Automated scanners** (2026-06-27): dependency audit, SAST (semgrep), and a
  privacy/dataflow scan.
- **Authorization matrix extraction** — `requireAuth` / `requireRole` usage mapped
  across all routers.
- **Manual probes** through the shared proxy (`localhost:80`) as an authenticated
  low-privilege user.
- Findings filed as `DEF-CW01-M06-xxx`. Severity = exploitability × blast radius.

---

## Automated scan results (2026-06-27)

| Scanner | Result | Detail |
|---------|--------|--------|
| Dependency audit | ✅ PASS | 0 critical / 0 high / 0 moderate / 0 low |
| SAST (semgrep) | ✅ PASS (for the certified surface) | 2 MEDIUM, **both outside the API server** — `mockup-sandbox` dynamic import (dev tool) and an `ocs-one` `StageStepper` cosmetic `.replace("\n"," ")` (display-only label, not a sanitizer). Neither is a server vulnerability. |
| Privacy / dataflow | ✅ PASS | 0 findings |

The two SAST findings are recorded for transparency but are **not** OCS-One API
defects: the dynamic-import warning is in the canvas mockup sandbox (not shipped
with the product), and the `StageStepper` `replace` is whitespace tidying for a
label, not escaping of dangerous data. No action required for certification;
`StageStepper` label tidy may optionally use a global regex for correctness.

---

## Per-area assessment (first pass)

### ✅ 1. Authentication — PASS
- Passwords hashed with **bcrypt cost 12** (`routes/auth.ts`).
- **Constant-time rejection**: a dummy `bcrypt.compare` runs when the user is not
  found, so response timing does not reveal account existence.
- Failure responses are **generic** ("Invalid email or password") — no user
  enumeration via message differences.
- JWT signed with `SESSION_SECRET`, 8 h expiry (`middleware/auth.ts`).

### 🔴 2. Authorization (RBAC) — **FAIL → DEF-CW01-M06-001 (HIGH)**
- Global `requireAuth` is correctly applied to everything except `/healthz` and
  `/auth/*` (`routes/index.ts`).
- **But role enforcement is the exception, not the rule.** Only these enforce a
  role:

  | Surface | Roles required |
  |---------|----------------|
  | `/developer/performance` (incl. snapshots) | `director` |
  | `/reports/*` | `director`, `supervisor` |
  | `/cells/lots` create + update | `operator`, `supervisor`, `director` |

- **Every other mutating endpoint requires only a valid session** — any
  authenticated user, **including a self-registered `viewer`**, can call them.
  Affected (non-exhaustive): manufacturing **stage lifecycle** (start/complete/
  approve/reject), **QC approval/rejection**, **rework**, **test results**,
  **production orders**, **all Masters CRUD**, **logistics dispatch orders**,
  **dealers**, **cell matching**, **cell grading**, **grade config**.
- **Impact:** broken access control (OWASP A01). A viewer — or, via the public
  registration path (DEF-002), an outside party — can approve QC, dispatch
  shipments, and rewrite master data.

### 🟠 3. Session management — CONCERN → DEF-CW01-M06-005 (LOW)
- JWT is **stateless**: logout (`POST /auth/logout`) only clears the cookie
  client-side. A token that has been copied remains valid until its 8 h expiry —
  there is **no server-side revocation / blocklist / token-version check**.
- Cookie hardening is otherwise correct: `httpOnly`, `secure` in production,
  `sameSite=lax`, scoped `path=/`, 8 h `maxAge`.

### ✅ 4. Input validation — PASS (with minor note)
- ~90% of mutations validate the body with **Zod** schemas from `@workspace/api-zod`
  (Masters via a shared factory; cells/grade, manufacturing/orders, etc.).
- Ad-hoc (non-Zod) but **bounded** validation remains on `/auth/login`,
  `/auth/register` (manual `typeof`/length checks) and `/developer/performance/
  snapshots` (label capped 160, note capped 2000). Acceptable; converting auth to
  Zod is a tidy-up, not a hole.
- **No SQL injection vector:** all queries use Drizzle; every `sql` tagged-template
  interpolates *column references or bound parameters* (e.g. `${productId}::uuid`),
  never concatenated user strings. Verified across `routes/reports/*` and
  `developer/performance.ts`.

### 🟠 5. Rate limiting — CONCERN (folded into DEF-CW01-M06-002)
- Global limiter **300 req/min** on `/api`; **login** limiter **20 / 15 min** on
  `/api/auth/login` (`app.ts`).
- **Gap:** `/api/auth/register` is **not** under the auth limiter — only the global
  300/min — so it can be used for account-creation flooding.

### 🟠 6. CSRF / XSS — CONCERN → DEF-CW01-M06-004 (LOW)
- **CSRF residual risk is low**: cookie is `sameSite=lax` and CORS `origin` is
  locked (`false` unless `ALLOWED_ORIGINS` is set), so cross-site credentialed
  writes are blocked. There is **no CSRF token**, which is acceptable given those
  two controls but should be documented as an accepted design.
- **XSS / headers**: Helmet is enabled, but CSP allows **`'unsafe-inline'`** in
  `scriptSrc`/`styleSrc` (needed for Vite dev). This **must be tightened for the
  production build** or it weakens the primary XSS defense.

### 🟠 7. Audit logging — CONCERN → DEF-CW01-M06-003 (LOW)
- Rich **domain** event trails exist: `cell_lot_events`, `mfg_battery_timeline`
  (incl. QC decisions), `logistics_shipment_events`.
- **Gaps:** no persistent **authentication** audit (logins, failures, logouts) and
  no audit on **Masters** mutations beyond `updatedAt`. For a security cert, auth
  events and privileged-mutation actors should be recorded.

### ⏳ 8. Backup & recovery — DEFERRED (assessment pending)
- DB is Replit-managed PostgreSQL with platform checkpoints. **No documented
  RPO/RTO and no tested restore drill yet.** To be assessed before MAT-06 closes.

### ⏳ 9. Failure recovery — PARTIAL
- A correct global error handler maps Zod → 400, PG `23505` → 409, `23503` → 400,
  else 500 with no internal leakage (`app.ts`). **Not yet tested:** DB-down
  behavior, pool exhaustion, and recovery after dependency failure.

### ⏳ 10. Penetration testing — IN PROGRESS
- First-pass manual probing surfaced DEF-001/002. Formal scripted abuse tests
  (privilege escalation, enumeration, mass-assignment) to follow.

### ✅ 11. Dependency review — PASS
- Audit clean (0 vulnerabilities across all severities), 2026-06-27.

### ✅ 12. Secret management — PASS
- No hardcoded secrets. `getSecret()` **throws** if `SESSION_SECRET` is unset —
  no insecure fallback default. `SESSION_SECRET` is the only required secret.

### ✅ 13. File upload — N/A (PASS by absence)
- No upload endpoints exist (no `multer`/`busboy`/multipart handling). The API is
  JSON-only. Re-assess if any upload feature is added.

### 🟠 14. API abuse — CONCERN
- Rate limiting (area 5) provides baseline protection.
- **Public self-registration** (`/auth/register`, no auth, assigns `viewer`) is the
  primary abuse surface → DEF-CW01-M06-002. For an internal ERP, open registration
  should be disabled or gated behind an invite/admin flow.
- Mass-assignment is mitigated where Zod schemas pick allowed fields; un-validated
  endpoints (area 4 note) should be confirmed not to spread `req.body`.

---

## Defects filed

| ID | Sev | Area | Summary | Status |
|----|-----|------|---------|--------|
| DEF-CW01-M06-001 | **HIGH** | Authz | Most mutating endpoints (mfg stages, QC approval, rework, test results, orders, all Masters, logistics dispatch, dealers, cell matching/grading) enforce `requireAuth` only — **no role check**; a `viewer` can mutate production/logistics/master data | OPEN |
| DEF-CW01-M06-002 | **MEDIUM** | Authz / abuse | `/auth/register` is public and **not** under the auth rate limiter; enables unauthenticated account creation (→ viewer → DEF-001 blast radius) and registration flooding | OPEN |
| DEF-CW01-M06-003 | LOW | Audit | No persistent audit log for authentication events (login/logout/failure) or Masters mutations | OPEN |
| DEF-CW01-M06-004 | LOW | XSS | Production CSP still allows `'unsafe-inline'` scripts (Vite dev need); must be tightened for the production build | OPEN |
| DEF-CW01-M06-005 | LOW | Session | Stateless JWT has no server-side revocation; logout clears cookie only — a copied token stays valid until 8 h expiry | OPEN |

---

## Recommended remediation (proposed — pending CTO direction on RBAC matrix)

**DEF-001 (the headline).** Apply `requireRole(...)` per surface. Proposed matrix
(directors retain full access, so existing director e2e flows are unaffected):

| Surface | Proposed minimum role |
|---------|-----------------------|
| Masters CRUD (all) | `supervisor`, `director` |
| Manufacturing stage lifecycle (start/pause/resume/complete) | `operator`, `supervisor`, `director` |
| QC approve / reject, rework | `supervisor`, `director` |
| Production orders create | `supervisor`, `director` |
| Cell matching / grading / grade config | `operator`, `supervisor`, `director` |
| Logistics dispatch orders, dealers | `supervisor`, `director` |

**DEF-002.** Put `/auth/register` behind the auth limiter and, preferably, behind
`requireAuth + requireRole("director")` (admin-created accounts) or disable it
for the internal ERP. Confirm intended onboarding model with the CTO.

**DEF-003.** Add an `auth_audit` (or generic `audit_log`) table; record login
success/failure, logout, and privileged mutations with actor + timestamp + IP.

**DEF-004.** Gate `'unsafe-inline'` on `NODE_ENV !== "production"`; use a nonce or
hashed scripts in the production CSP.

**DEF-005.** Add a `tokenVersion` claim checked against the user row (bump on
logout-all / password change) for server-side revocation, or document the 8 h
window as an accepted risk.

---

## Closure criteria (MAT-06 → PASS)

1. DEF-CW01-M06-001 remediated and re-tested (low-privilege user is denied on all
   privileged mutations). **← gating**
2. DEF-002 resolved (registration gated and/or rate-limited).
3. DEF-003/004/005 resolved or formally accepted as documented residual risk.
4. Areas 8–10 (backup/recovery, failure recovery, penetration testing) assessed
   with evidence.
5. Re-run automated scanners clean.

**Current decision: NOT YET PASSED.** First-pass review complete; 1 HIGH + 1
MEDIUM + 3 LOW defects open.
