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
| `/api/auth/login` | POST | ❌ | — | auth (20/15m) | no | ✅ |
| `/api/auth/logout` | POST | ❌ | — | global | no | ✅ |
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
| `/config` | PUT/PATCH | ✅ | **supervisor, director** | global | no | ✅ |
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

> **Reports interpretation:** reporting is a management capability (CTO matrix lists
> Reports under supervisor; operators excluded). It is intentionally restricted to
> director + supervisor even for reads, rather than exposed to viewer.

---

## Open follow-ups (filed, not yet remediated)

- **DEF-M06-003 (LOW)** — no persistent auth/audit-event log. User creation is currently
  written to the structured application log (`event: "user.created"`); a queryable DB
  audit table is the planned follow-up. Until then, the **Audit Logged** column reflects
  application-log coverage only.
- **DEF-M06-004 (LOW)** — production CSP allows `unsafe-inline`.
- **DEF-M06-005 (LOW)** — stateless JWT has no server-side revocation list.
