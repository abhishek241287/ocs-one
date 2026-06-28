# OCS One — Security Matrix

Master security reference for every API endpoint. This document is authoritative
for authentication and authorization decisions and must be kept in sync with the
route definitions in `artifacts/api-server/src/routes/`.

---

## Security Standard SS-01 (permanent rule)

Every new API endpoint must explicitly declare, before it is merged, the answer to
all six questions below. No endpoint may be merged until all six are answered.

1. **Authentication required?** — Is a valid session (`requireAuth`) needed?
2. **Minimum role** — Which role(s) may invoke it? (`director | supervisor | operator | viewer`)
3. **Audit required?** — Must the action be recorded to the audit/event log?
4. **Rate limited?** — Is the endpoint throttled?
5. **Input validation?** — Are all inputs validated (Zod / explicit checks)?
6. **Output sanitised?** — Is the response free of sensitive fields (no password hashes, secrets, internal-only data)?

## Security Standard SS-02 (permanent automated test)

Authorization is enforced by a **permanent regression test**, not by manual review alone.
`pnpm --filter @workspace/api-server run test:authz` (validation command `authz`) drives
every endpoint in this matrix against all five principals
(director / supervisor / operator / viewer / anonymous) and asserts the exact expected
outcome (`pass` → not-403 / `forbidden` → 403 / `unauthorized` → 401). The matrix lives
in code at `lib/authz-matrix.ts` and is the single source of truth shared by both this
suite and the `/api/developer/security` dashboard — they cannot drift. **Any unexpected
authorization result fails certification.** Current: ✅ 225/225 assertions pass.

## Security Standard SS-03 (permanent automated test)

The audit trail is verified by a **permanent regression test**, the complement to SS-02:
SS-02 proves *who may act*; SS-03 proves *the act was recorded*.
`pnpm --filter @workspace/api-server run test:audit` (validation command `audit`) performs
every critical operation against the live server, then reads the audit store and asserts the
correct event was persisted with all required fields (event type, actor, timestamp, entity
id, details). It also proves the audit history is **immutable** — statically (no application
route `.update()`/`.delete()`s an audit table) and at runtime (a captured record is
byte-identical after the run). The matrix lives in code at
`artifacts/api-server/src/lib/audit-matrix.ts` — 11 audited operations across both
append-only stores (`security_events` + `cell_lot_events`). **Any audit mismatch or
immutability violation fails certification.** Current: ✅ 11/11 operations recorded
correctly; history immutable.

## Security Standard SS-04 (permanent automated test)

Production configuration integrity is verified by a **permanent regression test**.
`pnpm --filter @workspace/api-server run test:config` (validation command `config`) gathers
every production-affecting configuration value (security **and** manufacturing) and validates
each against an explicit rule — required value present, within range, no unsafe default, no
duplicates, no internal conflicts. **A FAIL means configuration drift, treated as a production
defect** (exits non-zero); a **WARN** is permitted only for a documented development-mode
exception. The snapshot + validators live in code at
`artifacts/api-server/src/lib/config-integrity.ts` (`gatherConfig()` + `validateConfig()`) —
the single source of truth shared by both this suite and the director-only
`GET /api/developer/configuration` dashboard, so they cannot drift. Coverage spans JWT/session,
cookie, CORS, CSP, trust-proxy, rate limits, environment variables, manufacturing stage
sequence, feature flags, battery-grading thresholds, charging thresholds, and version
consistency. Notably the CSP rule fails on any production `script-src 'unsafe-inline'`, and the
admin-credential rule is value-aware (fails even if `ADMIN_PASSWORD` is set to the known seed
default). **Any configuration drift fails certification.** Current: ✅ 31 pass · 3 warn · 0 fail
(34 checks); all warnings are documented dev-mode exceptions.

### RBAC model (CTO-approved — DEF-M06-001)

- **Director** — full access to every module.
- **Supervisor** — Masters, lot receiving/editing, QC approval, dispatch, dealers,
  production planning, reports. **Not**: user administration, system settings,
  certification administration.
- **Operator** — cell receiving, grading, matching, charging, testing, production
  stage execution. **Not**: Masters, QC approval, dispatch/dealer management, reports.
- **Viewer** — read-only everywhere. No POST / PATCH / PUT / DELETE; no state changes.

Enforcement: `requireAuth` (global, in `routes/index.ts`) gates every non-public
route. Write authorization uses `requireWriteRole(...roles)` mounted per sub-router
— read methods (GET/HEAD) pass for any authenticated user, write methods require a
listed role. Director is included in every write list.

---

## Matrix

Legend — **Auth**: ✅ requires session · ❌ public. **Rate**: global = 300/min;
auth = 20/15min on login; register = 20/15min. Reads = any authenticated user
unless a minimum role is stated.

### Public & Auth

| Endpoint | Method | Auth | Minimum Role | Rate Limited | Audit Logged | Cert Status |
|---|---|---|---|---|---|---|
| `/api/healthz` | GET | ❌ | — | global | no | ✅ |
| `/api/auth/login` | POST | ❌ | — | auth (20/15m) | **yes** (`auth.login.success`/`failed`) | ✅ |
| `/api/auth/logout` | POST | ❌ | — | global | **yes** (`auth.logout`) | ✅ |
| `/api/auth/me` | GET | ✅ | any | global | no | ✅ |
| `/api/auth/register` | POST | ✅ | **director** | register (20/15m) | **yes** (`user.created`) | ✅ (DEF-M06-002) |

### Masters (`/api/masters/{products,cells,bms,cabinets,connectors,cables,busbars,chargers,test-equipment}`)

| Endpoint | Method | Auth | Minimum Role | Rate Limited | Audit Logged | Cert Status |
|---|---|---|---|---|---|---|
| `/api/masters/*` | GET | ✅ | viewer (read) | global | no | ✅ |
| `/api/masters/*` | POST | ✅ | **supervisor, director** | global | no | ✅ (DEF-M06-001) |
| `/api/masters/*/:id` | PATCH | ✅ | **supervisor, director** | global | no | ✅ |
| `/api/masters/*/:id/status` | PATCH | ✅ | **supervisor, director** | global | no | ✅ |

### Manufacturing (`/api/manufacturing`)

| Endpoint | Method | Auth | Minimum Role | Rate Limited | Audit Logged | Cert Status |
|---|---|---|---|---|---|---|
| `/orders` | GET | ✅ | viewer (read) | global | no | ✅ |
| `/orders`, `/orders/:id` | POST/PATCH | ✅ | **supervisor, director** | global | no | ✅ |
| `/orders/:id/stages/*` | GET | ✅ | viewer (read) | global | no | ✅ |
| `/orders/:id/stages/*` (start/pause/resume/complete/update) | POST/PATCH | ✅ | **operator, supervisor, director** | global | no | ✅ |
| `/orders/:id/stages/:stage/approve` · `/reject` | POST | ✅ | **supervisor, director** | global | no | ✅ (sign-off is supervisory) |
| `/orders/:id/qc-approval` | POST | ✅ | **supervisor, director** | global | no | ✅ |
| `/orders/:id/genealogy` | GET | ✅ | viewer (read) | global | no | ✅ |
| `/orders/:id/genealogy` | POST | ✅ | **operator, supervisor, director** | global | no | ✅ |
| `/orders/:id/test-results` | GET | ✅ | viewer (read) | global | no | ✅ |
| `/orders/:id/test-results` | POST/PUT | ✅ | **operator, supervisor, director** | global | no | ✅ |
| `/rework` | GET | ✅ | viewer (read) | global | no | ✅ |
| `/rework/:id` | PATCH | ✅ | **operator, supervisor, director** | global | no | ✅ |
| `/charger-units` | GET | ✅ | viewer (read) | global | no | ✅ |
| `/charger-units*` | POST/PATCH | ✅ | **supervisor, director** | global | no | ✅ |
| dashboards (charging/testing/formation) | GET | ✅ | viewer (read) | global | no | ✅ |

> **Note (rework, genealogy, charger-units):** rework ticket updates and manual
> genealogy entries are classified as production execution (operator+); charger-unit
> management is equipment administration (supervisor+). Flagged for CTO confirmation.

### Cells (`/api/cells`)

| Endpoint | Method | Auth | Minimum Role | Rate Limited | Audit Logged | Cert Status |
|---|---|---|---|---|---|---|
| `/lots` | GET | ✅ | viewer (read) | global | no | ✅ |
| `/lots`, `/lots/:id` | POST/PATCH | ✅ | **operator, supervisor, director** | global | no | ✅ |
| `/cells` (grading) | GET | ✅ | viewer (read) | global | no | ✅ |
| `/cells` (grade) | POST | ✅ | **operator, supervisor, director** | global | no | ✅ |
| `/matches` | GET | ✅ | viewer (read) | global | no | ✅ |
| `/matches*` (match/reserve/release) | POST | ✅ | **operator, supervisor, director** | global | no | ✅ |
| `/config` | GET | ✅ | viewer (read) | global | no | ✅ |
| `/config` | PUT/PATCH | ✅ | **supervisor, director** | global | no | ✅ (empty-body → 400, DEF-M06-EMPTY-BODY) |
| `/inventory`, reports | GET | ✅ | viewer (read) | global | no | ✅ |

### Logistics (`/api/logistics`)

| Endpoint | Method | Auth | Minimum Role | Rate Limited | Audit Logged | Cert Status |
|---|---|---|---|---|---|---|
| `/dispatch-orders*` | GET | ✅ | viewer (read) | global | no | ✅ |
| `/dispatch-orders*` (create/advance) | POST/PATCH | ✅ | **supervisor, director** | global | no | ✅ |
| `/dealers*` | GET | ✅ | viewer (read) | global | no | ✅ |
| `/dealers*` | POST/PATCH/DELETE | ✅ | **supervisor, director** | global | no | ✅ |
| `/packing-dashboard` | GET | ✅ | viewer (read) | global | no | ✅ |

### Dashboard / Reports / Developer

| Endpoint | Method | Auth | Minimum Role | Rate Limited | Audit Logged | Cert Status |
|---|---|---|---|---|---|---|
| `/api/dashboard/*` | GET | ✅ | viewer (read) | global | no | ✅ |
| `/api/reports/*` | GET | ✅ | **director, supervisor** | global | no | ✅ |
| `/api/developer/*` (incl. performance snapshots) | GET/POST | ✅ | **director** | global | no | ✅ |
| `/api/developer/security` (security dashboard) | GET | ✅ | **director** | global | no | ✅ (SS-02 verified) |
| `/api/developer/configuration` (config-integrity dashboard) | GET | ✅ | **director** | global | no | ✅ (SS-02 verified; SS-04 source) |

> **Reports interpretation:** reporting is a management capability (CTO matrix lists
> Reports under supervisor; operators excluded). It is intentionally restricted to
> director + supervisor even for reads, rather than exposed to viewer.

---

## Open follow-ups (filed, not yet remediated)

- ✅ **DEF-M06-003 (LOW) — RESOLVED 2026-06-28.** Persistent `security_events` table now
  records auth (`auth.login.success`/`failed`, `auth.logout`), `user.created`,
  `authz.denied` (403s), and `ratelimit.exceeded` events with actor + IP + metadata.
- ✅ **DEF-M06-EMPTY-BODY (LOW) — FIXED 2026-06-28.** `PUT /api/cells/config` with an
  empty body returned 500 (all-optional schema passed, empty SQL SET clause threw); now
  returns 400 per SS-01.
- ✅ **DEF-M06-004 (LOW) — RESOLVED 2026-06-28.** Production `script-src` no longer allows
  `'unsafe-inline'` (env-gated in `lib/security-config.ts`); enforced by SS-04. `style-src`
  keeps `'unsafe-inline'` as a documented temporary exception pending a nonce/hash migration.
- **DEF-M06-005 (LOW)** — stateless JWT has no server-side revocation list (8 h window
  accepted residual risk).
