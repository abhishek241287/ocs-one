# OCS One FAT Defect Log Template

Use one copy of this record per observed defect. A missing prerequisite must be
recorded as **DATA SETUP REQUIRED**, not as a defect.

## Defect record

| Field | Entry |
|---|---|
| Defect ID | `FAT-YYYYMMDD-NNN` |
| Test case ID | |
| Workflow | |
| Severity | Critical / High / Medium / Low |
| Status | Open / Reproduced / Blocked by data / Deferred / Fixed / Retest passed / Closed |
| Disposition | Release blocker / Accepted risk / Data setup / Not a defect |
| Environment | |
| Frozen tag | `FAT-CANDIDATE-2026-09-08` |
| Frozen commit | `60564b1b49b76ce0b97e46d1de65a7325ef50ba7` |
| Date/time and timezone | |
| Reporter and role | |

## Preconditions

- Accounts and roles:
- Master/reference IDs:
- Business document IDs:
- Product/serial/lot IDs:
- Database snapshot or fixture version:
- Required prior test cases:

## Reproduction

1.
2.
3.

**Request**

```text
METHOD /api/...
```

Sanitized body:

```json
{}
```

## Expected versus actual

| Dimension | Expected | Actual |
|---|---|---|
| HTTP status | | |
| Response body | | |
| UI result | | |
| Database state | | |
| Inventory ledger | | |
| Genealogy/serial trace | | |
| Audit/timeline event | | |
| Concurrency outcome | | |

## Evidence

- Request/response capture:
- Screenshot:
- API/server log:
- Audit event:
- Ledger rows:
- Genealogy/event rows:
- Before/after database export:

## Impact and disposition

**Business impact:**

**Security/authorization impact:**

**Transaction-integrity impact:**

**Release decision:**

**Owner:**

**Target retest case:**

## Retest

| Field | Entry |
|---|---|
| Retest date/time | |
| Retest commit/tag | |
| Retest data reset | |
| Result | Pass / Fail / Blocked |
| Evidence link | |
| Closure approver | |

## FAT data-block record

Use this shorter record when the case cannot run because data is missing:

| Field | Entry |
|---|---|
| Test case | |
| Missing prerequisite | |
| Why current QA seed cannot provide it | |
| Data owner | |
| Setup required | |
| Planned setup date | |
| Defect opened? | **No — DATA SETUP REQUIRED** |
