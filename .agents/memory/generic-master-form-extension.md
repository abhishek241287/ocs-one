---
name: Generic master-form extension points
description: How to add dependent/conditional fields to the config-driven master form without forking per-master forms, and the dead-end UX rule.
---

The OCS masters share ONE config-driven form (FieldConfig[] + MasterConfig + a single edit drawer). Extend it with ADDITIVE, optional hooks rather than forking a bespoke form per master:

- `FieldConfig.optionsFn(form)` — dynamic select options computed from current form state (dependent pickers, e.g. a link scoped to the selected category's family). Takes precedence over static `options`.
- `FieldConfig.visibleWhen(form)` — conditional render; hidden fields are excluded from required/validation/error-summary (the drawer filters to `visibleFields` everywhere).
- `FieldConfig.helpText` — guidance rendered under the field.
- `MasterConfig.transformSubmit(data)` — last-mile payload derive/strip before create/update (derive server-required fields, null incompatible ones, drop response-only summary fields).
- `MasterConfig.onFieldChange(name,value,form) => form` — reconciler run after every change to clear/derive dependent fields (e.g. clear a link picker when the category/family changes) so the user can't submit a stale cross-dependency value.

**Dead-end UX rule (why visibleWhen must not over-hide):** if a field is REQUIRED for a mode but you hide it with `visibleWhen`, the required check is skipped → the form submits and the server rejects with a silent 4xx the operator can't act on. Instead keep the field VISIBLE for the whole mode and let `optionsFn` return `[]` when its prerequisite is unmet — empty options + `helpText` keep Save disabled WITH on-screen guidance, never a silent server rejection.

**Why:** one shared form keeps every master consistent (keyboard nav, error summary, ODS surfaces) and means a fix lands once for all masters; bespoke per-master forms drift. Surfacing real server messages (strip the `HTTP NNN ...:` prefix / read `err.data`) is essential when the backend enforces rules the UI only partially mirrors (immutable link, wrong family, already-linked).

**`required` is a STATIC boolean, not a function** — the drawer enforces it via `visibleFields.filter(f => f.required)`, so there is NO `requiredWhen`. To make a field conditionally required, toggle its `visibleWhen` (required+visible in the mode that needs it, hidden otherwise); do NOT try to flip `required` per form state.

**transformSubmit must not force-null an OPTIONAL dependent value.** When a rule becomes conditional (e.g. a linked-master that is REQUIRED for some categories but OPTIONAL for others), key the "set the value" branch on the value's own prerequisites being present (e.g. `family && linkId`), never on the requirement flag (`if (engReq) set else null`). Gating on the requirement flag silently WIPES an existing/optional link when you edit a record whose category does not require it — a real data-loss regression the requiredness check never catches (the field is hidden, so it's excluded from validation). **How to apply:** any conditionally-required field on the shared master form — persist when the payload can form a valid value, clear only when the value is genuinely inapplicable (no family/prerequisite at all).
