---
name: Consumption ledger source labels
description: Runtime constraint and naming rule for inventory transaction source-document labels.
---

Inventory transaction `source_document_type` values must fit the database's 16-character column. Use short canonical labels such as `CONSUMPTION`, not route or table names such as `consumption_confirmation`.

**Why:** A semantically descriptive label exceeded the live column limit and caused the entire confirmation transaction to roll back at runtime, despite typechecks passing.

**How to apply:** Before adding a ledger writer, inspect the column width and existing labels, then choose a bounded label consistently across the route and its reconciliation queries.