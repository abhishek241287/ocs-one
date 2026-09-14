# FAT Read-Only Route Smoke Evidence

- Run: 2026-09-14T11:22:07.366Z
- Environment: http://localhost:8080
- Dataset: FAT-E2E-
- Frozen tag: FAT-CANDIDATE-2026-09-08
- Frozen commit: 60564b1b49b76ce0b97e46d1de65a7325ef50ba7
- Password evidence: omitted; supplied only through FAT_TEST_PASSWORD
- Fixture mutation: none; authenticated GET-only route checks after login
- Result: 32 PASS / 0 FAIL

| Case | Area | Role | Method | Path | Status | Result |
|---|---|---|---|---|---:|---|
| SMOKE-AUTH-P01 | authentication | owner | POST | `/api/auth/login` | 200 | **PASS** |
| SMOKE-AUTH-P01 | authentication | director | POST | `/api/auth/login` | 200 | **PASS** |
| SMOKE-AUTH-P01 | authentication | supervisor | POST | `/api/auth/login` | 200 | **PASS** |
| SMOKE-AUTH-P01 | authentication | operator | POST | `/api/auth/login` | 200 | **PASS** |
| SMOKE-AUTH-P01 | authentication | viewer | POST | `/api/auth/login` | 200 | **PASS** |
| SMOKE-AUTH-P01 | authentication | dealer | POST | `/api/auth/login` | 200 | **PASS** |
| SMOKE-AUTH-P02 | authentication | owner | GET | `/api/auth/me` | 200 | **PASS** |
| SMOKE-AUTH-P02 | authentication | owner | ASSERT | `/api/auth/me` | 0 | **PASS** |
| SMOKE-AUTH-P02 | authentication | director | GET | `/api/auth/me` | 200 | **PASS** |
| SMOKE-AUTH-P02 | authentication | director | ASSERT | `/api/auth/me` | 0 | **PASS** |
| SMOKE-AUTH-P02 | authentication | supervisor | GET | `/api/auth/me` | 200 | **PASS** |
| SMOKE-AUTH-P02 | authentication | supervisor | ASSERT | `/api/auth/me` | 0 | **PASS** |
| SMOKE-AUTH-P02 | authentication | operator | GET | `/api/auth/me` | 200 | **PASS** |
| SMOKE-AUTH-P02 | authentication | operator | ASSERT | `/api/auth/me` | 0 | **PASS** |
| SMOKE-AUTH-P02 | authentication | viewer | GET | `/api/auth/me` | 200 | **PASS** |
| SMOKE-AUTH-P02 | authentication | viewer | ASSERT | `/api/auth/me` | 0 | **PASS** |
| SMOKE-AUTH-P02 | authentication | dealer | GET | `/api/auth/me` | 200 | **PASS** |
| SMOKE-AUTH-P02 | authentication | dealer | ASSERT | `/api/auth/me` | 0 | **PASS** |
| SMOKE-PORTAL-P01 | dealer-portal | dealer | GET | `/api/dealers/fa120000-0000-4000-8000-000000000001/inventory` | 200 | **PASS** |
| SMOKE-PORTAL-P01 | dealer-portal | dealer | ASSERT | `/api/dealers/fa120000-0000-4000-8000-000000000001/inventory` | 0 | **PASS** |
| SMOKE-PORTAL-P02 | dealer-portal | dealer | GET | `/api/dealers/fa120000-0000-4000-8000-000000000001/dispatch-history` | 200 | **PASS** |
| SMOKE-PORTAL-P02 | dealer-portal | dealer | ASSERT | `/api/dealers/fa120000-0000-4000-8000-000000000001/dispatch-history` | 0 | **PASS** |
| SMOKE-MFG-P01 | manufacturing | operator | GET | `/api/manufacturing/orders/fa180000-0000-4000-8000-000000000001/stages` | 200 | **PASS** |
| SMOKE-MFG-P01 | manufacturing | operator | ASSERT | `/api/manufacturing/orders/fa180000-0000-4000-8000-000000000001/stages` | 0 | **PASS** |
| SMOKE-MFG-P02 | manufacturing | operator | GET | `/api/manufacturing/orders/fa180000-0000-4000-8000-000000000001/genealogy` | 200 | **PASS** |
| SMOKE-MFG-P02 | manufacturing | operator | ASSERT | `/api/manufacturing/orders/fa180000-0000-4000-8000-000000000001/genealogy` | 0 | **PASS** |
| SMOKE-FUL-P01 | dispatch | supervisor | GET | `/api/dispatch/fa1a0000-0000-4000-8000-000000000001` | 200 | **PASS** |
| SMOKE-FUL-P01 | dispatch | supervisor | ASSERT | `/api/dispatch/fa1a0000-0000-4000-8000-000000000001` | 0 | **PASS** |
| SMOKE-FUL-P02 | customer-warranty | supervisor | GET | `/api/customers/registrations/fa1a0000-0000-4000-8000-000000000003` | 200 | **PASS** |
| SMOKE-FUL-P02 | customer-warranty | supervisor | ASSERT | `/api/customers/registrations/fa1a0000-0000-4000-8000-000000000003` | 0 | **PASS** |
| SMOKE-FUL-P03 | customer-warranty | viewer | GET | `/api/warranties/fa1a0000-0000-4000-8000-000000000004` | 200 | **PASS** |
| SMOKE-FUL-P03 | customer-warranty | viewer | ASSERT | `/api/warranties/fa1a0000-0000-4000-8000-000000000004` | 0 | **PASS** |

Response bodies and sanitized request bodies are in `fat-journey-evidence.json`.
