# Task 70-G — WIP Returns Evidence

**Run date:** 2026-09-13  
**Environment:** development database and working tree only  
**Scope:** WIP return documents, approval/posting workflow, WIP-to-available ledger movement, idempotency, authorization, concurrency, and reconciliation  
**Certification status:** Evidence complete and ready for user certification. The agent does not self-certify Task 70-G.

## Implementation covered

- Added `return_documents.wip_issue_note_id` and `return_documents.idempotency_key`.
- Added the mutually exclusive return-source constraint and unique idempotency index.
- Added `return_seq`.
- Added handwritten Zod schemas for create, approve, and reject requests.
- Added and registered `/api/inventory/returns`.
- Return reads require authentication.
- Draft creation and posting require supervisor/director access.
- Approval is director-only.
- Posting locks the return document first, then WIP rows in deterministic order.
- Posting writes exactly one negative `RETURN` WIP ledger row and one positive `RETURN` available ledger row per returned slice.
- Posting updates `returned_qty`, `remaining_qty`, and WIP status atomically.
- Reservation and allocation rows are not modified.
- WIP rows without a GRN source line are rejected.
- Return idempotency uses an advisory transaction lock before the unique-key lookup.

## Schema application

The development schema push was run through a real pseudo-terminal. Drizzle presented the sequence selector:

```text
Is return_seq sequence created or renamed from another sequence?
❯ + return_seq create sequence
```

The confirmed **create sequence** choice was submitted. Post-push inspection confirmed:

- `return_documents.wip_issue_note_id` exists.
- `return_documents.idempotency_key` exists as `varchar(100)`.
- `return_seq` exists.
- `return_documents_idempotency_key_unique` exists.
- `return_documents_issue_source_exclusive` exists.
- WIP issue-note and source warehouse/location foreign keys exist.

## Focused 70-G verification — 11/11 pass

Runner: `pnpm --filter @workspace/api-server run test:task70-g-returns`

| Check | Result |
|---|---|
| 70G-01 happy path: draft → director approval → post, typed ledger rows, WIP state, outbox event | PASS |
| 70G-02 reservation row remains byte-identical | PASS |
| 70G-03 authenticated list/detail reads | PASS |
| 70G-04 supervisor approval denied; reject/post workflow guards | PASS |
| 70G-05 over-return rejected with zero ledger mutation | PASS |
| 70G-06 fully consumed WIP cannot be returned | PASS |
| 70G-07 concurrent same-key post replays with one ledger pair and one outbox event | PASS |
| 70G-08 return-versus-consumption race has exactly one winner and zero loser mutation | PASS |
| 70G-09 INV-P5-01 return reconciliation and INV-P4-05 reservation reconciliation | PASS |
| 70G-10 viewer write denied; source exclusivity path exercised | PASS |
| 70G-11 full §10 regression list recorded below | PASS |

## Full §10 regression list

- Reservation regression: **15/15 PASS**.
- Procurement PO regression: **15/15 PASS**.
- Receiving regression: **12/12 PASS**.
- SS-02 authorization: **777 assertions + 12 dealer-assignment checks PASS**.
- SS-03 audit: **13/13 audited operations PASS**, including static and runtime immutability checks.
- SS-04 configuration: **31 pass, 3 development-only warnings, 0 fail**.
- Option A transfer regression: **PASS**.
- FAT read-only smoke: **32/32 PASS**.
- Authenticated MIN list smoke: **HTTP 200**.
- Library and API typechecks: **PASS**.
- API health: **HTTP 200**, `{"status":"ok"}`.
- `git diff --check`: **PASS**.

## Fixture residue

The focused 70-G harness teardown completed successfully. Final development-database residue queries returned zero rows for:

- temporary 70-G users;
- 70-G materials;
- 70-G material categories;
- 70-G production orders;
- 70-G warehouses;
- 70-G locations;
- return documents linked to 70-G materials.

## Existing release caveat

The pre-existing FAT BMS WIP ledger balance of `-0.500` remains unchanged and was not hidden or repaired by Task 70-G. The Phase 4 evidence already records that this baseline exception blocks release sign-off until repaired. Task 70-G evidence is green independently of that pre-existing release blocker.

## Certification decision

All requested Task 70-G implementation and verification evidence is present. **The user/project owner must issue the Task 70-G certification decision; this record intentionally does not self-certify the task.**