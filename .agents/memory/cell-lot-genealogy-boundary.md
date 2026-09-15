---
name: Cell-lot genealogy feed boundary
description: The downstream genealogy operation and Cell Lot detail use different lot domains.
---

The downstream genealogy operation is valid for `inventory_lots`; IDs from the
Cell Lot receiving flow are `cell_lots` and cannot be sent to that operation.

**Why:** A cell-lot ID can look like a valid lot ID and pass UUID validation,
but the server correctly returns not found because the tables represent
different material domains.

**How to apply:** Verify the table/domain behind a candidate genealogy
operation before mapping it to a Cell Lot page. If no cell-lot genealogy feed
exists, omit the tab rather than placeholdering it or inventing a new endpoint.