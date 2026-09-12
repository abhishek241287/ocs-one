# INV-P04 Corrected-Candidate Retest Record

**Date:** 2026-09-12  
**Case:** `INV-P04`  
**Retest status:** **BLOCKED — fixture setup defect**  
**Approved model:** Option A  

## Candidate recorded before execution

- Corrected candidate commit: `601b90bdeff5bdcea44c96a4c1f59f4e3357e2dc`
- Corrected candidate tag: none
- Historical candidate tag: `FAT-CANDIDATE-2026-09-08`
- Historical candidate commit: `60564b1b49b76ce0b97e46d1de65a7325ef50ba7`
- Historical `INV-P04` result: `FAIL` (preserved)

## Outcome

The controlled retest stopped during isolated fixture setup, before login and
before `POST /api/inventory/transfers` executed. PostgreSQL rejected a fixture
value with:

```text
value too long for type character varying(32)
```

This is a defect in the one-off retest fixture data, not an application
acceptance result. No `INV-P04` acceptance criterion was evaluated, and the
retest must not be reported as PASS or FAIL for product behavior.

## Sanitized fixture and cleanup evidence

- Fixture prefix: `INV-P04-RETEST-MTXRWIAY-63BF98`
- User: `b31bafaa-6f2a-4981-a787-81e65f848451`
- Supplier: `92d0c302-4eed-462a-9bed-17eb001ef368`
- Material category: `425cd7da-3cb5-4b12-a435-8c70dc84ca5b`
- Cell master: `e42fb1d2-b15a-4185-a0cd-f3424a974f5f`
- Material: `e1c0d38a-92be-4544-8637-6b4b63b4b51e`
- GRN: `2f898aa4-2490-4e26-8606-64726068d102`
- GRN line: `637e8418-2dcf-4784-a48e-d1f9f0cd4751`
- Inspection: `bba1ee7d-a056-4220-b9ab-6f16a4aaf9c7`
- Inspection line: `00cd314c-50fd-49c8-ab9d-c0ee6f7b36b0`

Cleanup completed successfully. Post-cleanup counts were zero for users,
masters, GRN rows, inspection rows, inventory rows, transfers, cell lots,
cells, and security events.

Because the transfer endpoint was never called, there are no transfer,
ledger, cell-lot, generated-cell, API response, or audit-event results for
this attempt.

## Protection checks

- Application code modified: no
- Schema modified: no
- Routes modified: no
- UI modified: no
- Workflows modified: no
- Frozen candidate modified: no
- Historical Block 3 evidence modified: no

Historical evidence hashes remained unchanged:

```text
59fcdcb8abcfaf6563dd492622c40eba48f5a92cbc4c8bc46957861ced02b7af  certification/fat-evidence/fat-block-3-procurement-grn-inventory.json
faccd76fb22021cc07d9bab59b9afa90232629526d7164589268a68a0f221815  certification/fat-evidence/fat-block-3-procurement-grn-inventory.md
6952643797ee28889a3763d2f4e583bc9519951ceed4fd78bf24a0e78d0d5bb2  certification/fat-evidence/fat-block-3-inv-p04-defect-investigation.md
```

Per the execution approval, the retest stopped here. Block 4 and all later
FAT blocks were not run, and no application patch was made.