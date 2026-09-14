---
name: FAT WIP issue fixtures
description: Development FAT data can contain stock ledger rows without the lot and warehouse records required by WIP issue allocation.
---

WIP issue certification fixtures must explicitly create a warehouse, location, posted GRN line, inventory lot, and matching available ledger row; master stock totals alone are not sufficient.

**Why:** The development FAT seed can leave available ledger quantities while omitting the source lot/warehouse dimensions that allocation and reversal lock/validate.

**How to apply:** Before testing issue, reversal, or consumption flows, verify the source lot and GRN line exist and have warehouse/location provenance. Tear down the named fixture after the run.

When a fixture test resolves a lot through the GRN detail API, link the created lot back to its GRN line (`lot_id`) after inserting both rows; a standalone inventory lot is not enough for the read projection.