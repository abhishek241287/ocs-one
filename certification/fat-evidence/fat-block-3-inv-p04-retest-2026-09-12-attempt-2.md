# INV-P04 Corrected-Candidate Retest Attempt 2

**Date:** 2026-09-12  
**Case:** `INV-P04`  
**Status:** **BLOCKED — evidence harness query defect**  
**Approved model:** Option A

## Candidate

- Corrected candidate commit: `de8fc816a1ab198d3032eea1cd3d51d10ef20b58`
- Corrected candidate tag: none
- Historical candidate: `FAT-CANDIDATE-2026-09-08`
- Historical candidate commit: `60564b1b49b76ce0b97e46d1de65a7325ef50ba7`
- Historical `INV-P04` result: `FAIL`, preserved

The repository revision was checked against the corrected candidate before
execution and matched exactly.

## Outcome

The isolated fixture setup completed, but the temporary evidence harness
stopped before login and before `POST /api/inventory/transfers` because it
queried a nonexistent column:

```text
column "grn_line_id" does not exist
```

The failing query attempted to inspect pre-transfer destination counts through
`cell_lots.grn_line_id`. This is an evidence-harness defect. It is not an
application acceptance result.

No transfer, ledger, cell-lot, generated-cell, API response, or audit
acceptance evidence was produced by this attempt.

## Isolated fixture and cleanup

- Fixture prefix: `IP04-MTXS61MG-8C9070`
- User: `bf59f339-2913-4ead-895e-88723a09c331`
- Supplier: `e5fd47a0-ea5f-42bd-b6ef-b66e37c0e286`
- Material category: `a27fb203-6043-425d-87c9-7846271b88f4`
- Cell master: `243d9d94-69df-4e8d-9cee-94799504bad4`
- Material: `baf0eec1-5230-4b60-983b-318dc8c4171b`
- GRN: `5a49c1fd-b25a-4337-8ef1-c6e48dcf4048`
- GRN line: `192bbd11-2b65-4fa9-aaa8-ebf128840cf2`
- Inspection: `d9d2aa9a-3079-4a10-a4a8-7f7b93826771`
- Inspection line: `c5c800b3-3541-4678-995b-52125b399ee7`

Cleanup completed successfully. Remaining counts were zero for users,
masters, GRN rows, inspection rows, inventory rows, transfers, cell lots,
cells, and security events.

## Protection checks

- Application code modified: no
- Schema modified: no
- Routes modified: no
- UI modified: no
- Workflows modified: no
- Frozen candidate modified: no
- Historical Block 3 evidence modified: no

Per the execution approval, the attempt stopped here. No retry, harness patch,
Block 4 execution, or later FAT block execution was performed.