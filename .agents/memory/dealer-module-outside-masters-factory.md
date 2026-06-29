---
name: Logistics dealer routes bypass the masters factory
description: Why dealer (and possibly other logistics) CRUD lacks the audit/error/validation the masters factory provides
---

`logistics/dealers.ts` is a hand-written Express router, NOT built via `createMasterRouter` (`masters/common.ts`). The factory gives every master, for free: audit events (`master.created/updated/status_changed`), `handlePgWriteError` (23505→409 field-aware, 23503→400), `trimStrings`, and OpenAPI-driven validation. Modules built outside the factory silently miss ALL of these.

**Symptoms seen during commercial UAT:** dealer create/edit/delete wrote NO audit rows; deleting a referenced dealer leaked the raw FK constraint name via the global 23503→400 handler; `creditLimit` had no `minimum`, email/GST/mobile no format checks.

**How to apply:** when UAT'ing any module NOT routed through `createMasterRouter` (check whether its router file imports the factory), explicitly verify audit coverage, FK-delete error messaging (should be a friendly 409, not a 400 leaking `*_fk`), and field validation — the factory's guarantees do not apply. Validation for OPTIONAL string fields is safe to add as OpenAPI `pattern`/`format` because the ocs-one master forms convert empty inputs to `undefined` (omitted), so patterns only fire when a value is actually entered.
