# OCS One FAT Block 2 — Masters & BOM

- System under test: FAT-CANDIDATE-2026-09-08
- Frozen application commit: 60564b1b49b76ce0b97e46d1de65a7325ef50ba7
- Fixture: FAT-E2E-
- Formal request assertions: 106 PASS, 0 FAIL
- MAS-N04 used-BOM obsoletion: PASS (isolated manufacturing-use fixture; canonical fixture preserved)

| Case | Assertions | Pass | Fail |
|---|---:|---:|---:|
| MAS-P01 | 70 | 70 | 0 |
| MAS-P03 | 9 | 9 | 0 |
| MAS-P02 | 5 | 5 | 0 |
| MAS-P04 | 2 | 2 | 0 |
| MAS-N01 | 6 | 6 | 0 |
| MAS-N02 | 6 | 6 | 0 |
| MAS-N03 | 4 | 4 | 0 |
| MAS-N04 | 4 | 4 | 0 |

Controlled record IDs and sanitized request/response/audit evidence are in [fat-block-2-masters-bom.json](fat-block-2-masters-bom.json). The focused used-BOM run, including before/after status and database evidence, is in [fat-block-2-mas-n04-used-bom.json](fat-block-2-mas-n04-used-bom.json).
