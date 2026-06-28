---
name: Master-pick dropdowns filter to active rows
description: An empty master-data dropdown in ocs-one is usually no ACTIVE rows, not a code bug — seed/activate masters before e2e.
---

Across the ocs-one frontend, dropdowns that pick a master record (e.g. GRN create page's
Supplier and Material selects) filter their options to `status === "active"`. Inactive
master rows are intentionally excluded.

**Symptom that looks like a bug but isn't:** the combobox opens but renders zero
`role=option` items even though the list API returns data — because every returned row is
`status: "inactive"`. The filter is correct intended behaviour (you should not receive
against an inactive material/supplier).

**Why it matters:** a Playwright/e2e run will fail at "select the first option" with no
selectable items. Before running such a flow, ensure the relevant master has ACTIVE rows
(activate via the master's toggle-status endpoint, or directly
`UPDATE <master_table> SET status='active' WHERE ...`). Master PATCH `/:id` does NOT change
`status` — status is changed through the dedicated toggle-status route only.

**How to apply:** if an ocs-one master dropdown is empty, first check the API response's
`status` field before suspecting the component. Consider seeding active demo masters for
predictable e2e.
