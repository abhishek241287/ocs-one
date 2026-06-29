---
name: executeSql RETURNING gotcha
description: The code_execution executeSql callback returns the command tag (e.g. "INSERT 0 1") for write statements, not the RETURNING rows.
---

# executeSql does not surface RETURNING rows

In the `code_execution` sandbox, `executeSql({ sqlQuery })` for an `INSERT ... RETURNING id` resolves `.output` to the Postgres **command tag** string (e.g. `"INSERT 0 1"`), NOT the returned row(s). Parsing that string as an id yields garbage (downstream `WHERE id='INSERT 0 1'` → `invalid input syntax for type uuid`).

**How to apply:** after a write, fetch generated values with a **separate `SELECT`** keyed on a known unique column (e.g. a test prefix on `order_number`). For SELECTs, `.output` is CSV text: first non-empty line = header, following lines = rows — split on `\n`, then `,`. Always wrap throwaway-row tests in try/finally and tear down by prefix so an aborted run never leaks fixtures.
