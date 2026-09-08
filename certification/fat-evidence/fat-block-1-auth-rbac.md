# OCS One FAT Block 1 — Authentication & RBAC

- System under test: FAT-CANDIDATE-2026-09-08
- Frozen application commit: 60564b1b49b76ce0b97e46d1de65a7325ef50ba7
- Fixture: FAT-E2E-
- Fixture seed: PASS
- Fixture verify: PASS
- Formal request assertions: 44 PASS, 0 FAIL, 0 DATA SETUP REQUIRED

## Case summary

| Case | Result | Requests | Statuses |
|---|---:|---:|---|
| AUTH-P01 | **PASS** | 6 | 200 |
| AUTH-P02 | **PASS** | 6 | 200 |
| AUTH-P03 | **PASS** | 2 | 201 |
| AUTH-P04 | **PASS** | 4 | 201 |
| AUTH-P05 | **PASS** | 2 | 201 |
| AUTH-N01 | **PASS** | 2 | 401 |
| AUTH-N02 | **PASS** | 2 | 401 |
| AUTH-N03 | **PASS** | 2 | 403 |
| AUTH-N04 | **PASS** | 3 | 403 |
| RBAC-N01 | **PASS** | 1 | 403 |
| RBAC-N02 | **PASS** | 1 | 403 |
| RBAC-N03 | **PASS** | 1 | 403 |
| RBAC-N04 | **PASS** | 1 | 403 |
| RBAC-N05 | **PASS** | 1 | 403 |
| RBAC-N06 | **PASS** | 1 | 403 |
| RBAC-N07 | **PASS** | 1 | 403 |
| RBAC-N08 | **PASS** | 1 | 403 |
| RBAC-N09 | **PASS** | 1 | 403 |
| RBAC-N10 | **PASS** | 1 | 403 |
| RBAC-N11 | **PASS** | 1 | 403 |
| RBAC-N12 | **PASS** | 1 | 200 |
| AUTH-N05 | **PASS** | 3 | 200, 401 |

## Evidence details

The complete sanitized request/response records, actor accounts, cookie flags, response record IDs, and audit rows are in `fat-block-1-auth-rbac.json`. Passwords and session tokens are not recorded.

Audit event counts observed during the execution window:
- auth.login.success: 8
- user.created: 8
- auth.login.failed: 2
- authz.denied: 15
- auth.logout: 2

RBAC-N11 returned the required 403. No corresponding `security_events` row was observed for that dealer cross-account denial; this was recorded as an observation, not a failed HTTP authorization result.

Blocks 2–12 were not executed.
