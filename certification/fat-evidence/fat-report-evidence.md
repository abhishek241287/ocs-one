# FAT Journey Evidence

- Run: 2026-09-12T03:08:27.801Z
- Environment: http://localhost:8080
- Dataset: FAT-E2E-
- Frozen tag: FAT-CANDIDATE-2026-09-08
- Frozen commit: 60564b1b49b76ce0b97e46d1de65a7325ef50ba7
- Password evidence: omitted; supplied only through FAT_TEST_PASSWORD
- Result: 62 PASS / 0 FAIL

| Case | Area | Role | Method | Path | Status | Result |
|---|---|---|---|---|---:|---|
| RPT-AUTH | authentication | owner | POST | `/api/auth/login` | 200 | **PASS** |
| RPT-AUTH | authentication | director | POST | `/api/auth/login` | 200 | **PASS** |
| RPT-AUTH | authentication | supervisor | POST | `/api/auth/login` | 200 | **PASS** |
| RPT-AUTH | authentication | operator | POST | `/api/auth/login` | 200 | **PASS** |
| RPT-AUTH | authentication | viewer | POST | `/api/auth/login` | 200 | **PASS** |
| RPT-AUTH | authentication | dealer | POST | `/api/auth/login` | 200 | **PASS** |
| RPT-P01 | reports | director | GET | `/api/reports/executive` | 200 | **PASS** |
| RPT-P01 | reports | supervisor | GET | `/api/reports/executive` | 200 | **PASS** |
| RPT-P01 | reports | director | GET | `/api/reports/production` | 200 | **PASS** |
| RPT-P01 | reports | supervisor | GET | `/api/reports/production` | 200 | **PASS** |
| RPT-P01 | reports | director | GET | `/api/reports/cells` | 200 | **PASS** |
| RPT-P01 | reports | supervisor | GET | `/api/reports/cells` | 200 | **PASS** |
| RPT-P01 | reports | director | GET | `/api/reports/quality` | 200 | **PASS** |
| RPT-P01 | reports | supervisor | GET | `/api/reports/quality` | 200 | **PASS** |
| RPT-P01 | reports | director | GET | `/api/reports/inventory` | 200 | **PASS** |
| RPT-P01 | reports | supervisor | GET | `/api/reports/inventory` | 200 | **PASS** |
| RPT-P01 | reports | director | GET | `/api/reports/logistics` | 200 | **PASS** |
| RPT-P01 | reports | supervisor | GET | `/api/reports/logistics` | 200 | **PASS** |
| RPT-P02 | reports | director | GET | `/api/dashboard/director` | 200 | **PASS** |
| RPT-P02 | reports | viewer | GET | `/api/dashboard/director` | 200 | **PASS** |
| RPT-N01 | reports | operator | GET | `/api/reports/executive` | 403 | **PASS** |
| RPT-N01 | reports | viewer | GET | `/api/reports/executive` | 403 | **PASS** |
| RPT-N01 | reports | dealer | GET | `/api/reports/executive` | 403 | **PASS** |
| RPT-P01 | reports-reconciliation | director | ASSERT | `/api/reports/executive` | 0 | **PASS** |
| RPT-P01 | reports-reconciliation | director | ASSERT | `/api/reports/executive` | 0 | **PASS** |
| RPT-P01 | reports-reconciliation | director | ASSERT | `/api/reports/executive` | 0 | **PASS** |
| RPT-P01 | reports-reconciliation | director | ASSERT | `/api/reports/executive` | 0 | **PASS** |
| RPT-P01 | reports-reconciliation | director | ASSERT | `/api/reports/quality` | 0 | **PASS** |
| RPT-P01 | reports-reconciliation | director | ASSERT | `/api/reports/quality` | 0 | **PASS** |
| RPT-P01 | reports-reconciliation | director | ASSERT | `/api/reports/quality` | 0 | **PASS** |
| RPT-P01 | reports-reconciliation | director | ASSERT | `/api/reports/quality` | 0 | **PASS** |
| RPT-P01 | reports-reconciliation | director | ASSERT | `/api/reports/inventory` | 0 | **PASS** |
| RPT-P01 | reports-reconciliation | director | ASSERT | `/api/reports/inventory` | 0 | **PASS** |
| RPT-P01 | reports-reconciliation | director | ASSERT | `/api/reports/inventory` | 0 | **PASS** |
| RPT-P01 | reports-reconciliation | director | ASSERT | `/api/reports/inventory` | 0 | **PASS** |
| RPT-P01 | reports-reconciliation | director | ASSERT | `/api/reports/inventory` | 0 | **PASS** |
| RPT-P01 | reports-reconciliation | director | ASSERT | `/api/reports/logistics` | 0 | **PASS** |
| RPT-P01 | reports-reconciliation | director | ASSERT | `/api/reports/logistics` | 0 | **PASS** |
| RPT-P01 | reports-reconciliation | director | ASSERT | `/api/reports/logistics` | 0 | **PASS** |
| RPT-P01 | reports-reconciliation | director | ASSERT | `/api/reports/logistics` | 0 | **PASS** |
| RPT-P01 | reports-reconciliation | director | ASSERT | `/api/reports/cells` | 0 | **PASS** |
| RPT-P01 | reports-reconciliation | director | ASSERT | `/api/reports/inventory` | 0 | **PASS** |
| RPT-P01 | reports-reconciliation | director | ASSERT | `/api/reports/production` | 0 | **PASS** |
| RPT-P01 | reports-reconciliation | director | ASSERT | `/api/reports/production` | 0 | **PASS** |
| RPT-P03 | reports-reconciliation | director | GET | `/api/reports/production?from=2026-09-08T00%3A00%3A00.000Z&to=2026-09-08T23%3A59%3A59.999Z` | 200 | **PASS** |
| RPT-P03 | reports-reconciliation | director | ASSERT | `/api/reports/production?from=2026-09-08T00%3A00%3A00.000Z&to=2026-09-08T23%3A59%3A59.999Z` | 0 | **PASS** |
| RPT-P02 | reports-reconciliation | director | ASSERT | `/api/dashboard/director` | 0 | **PASS** |
| RPT-P02 | reports-reconciliation | director | ASSERT | `/api/dashboard/director` | 0 | **PASS** |
| RPT-P02 | reports-reconciliation | director | ASSERT | `/api/dashboard/director` | 0 | **PASS** |
| RPT-P02 | reports-reconciliation | director | ASSERT | `/api/dashboard/director` | 0 | **PASS** |
| RPT-P02 | reports-reconciliation | director | ASSERT | `/api/dashboard/director` | 0 | **PASS** |
| PORTAL-P01 | dealer-portal | dealer | GET | `/api/dealers/fa120000-0000-4000-8000-000000000001/inventory` | 200 | **PASS** |
| PORTAL-P01 | dealer-portal | dealer | GET | `/api/dealers/fa120000-0000-4000-8000-000000000001/dispatch-history` | 200 | **PASS** |
| PORTAL-P02 | dealer-portal | viewer | GET | `/api/dealers/fa120000-0000-4000-8000-000000000001/inventory` | 200 | **PASS** |
| PORTAL-N01 | dealer-portal | dealer | GET | `/api/dealers/00000000-0000-0000-0000-000000000002/inventory` | 403 | **PASS** |
| PORTAL-P01 | dealer-portal | dealer | ASSERT | `/api/dealers/fa120000-0000-4000-8000-000000000001/inventory` | 0 | **PASS** |
| PORTAL-P01 | dealer-portal | dealer | ASSERT | `/api/dealers/fa120000-0000-4000-8000-000000000001/dispatch-history` | 0 | **PASS** |
| WAR-P01 | customer-warranty | viewer | GET | `/api/warranties` | 200 | **PASS** |
| WAR-P01 | customer-warranty | viewer | GET | `/api/warranties/fa1a0000-0000-4000-8000-000000000004` | 200 | **PASS** |
| WAR-N01 | customer-warranty | dealer | GET | `/api/warranties` | 403 | **PASS** |
| WAR-P01 | customer-warranty | viewer | ASSERT | `/api/warranties` | 0 | **PASS** |
| WAR-P01 | customer-warranty | viewer | ASSERT | `/api/warranties/fa1a0000-0000-4000-8000-000000000004` | 0 | **PASS** |

Response bodies and sanitized request bodies are in `fat-journey-evidence.json`.
