---
name: FAT ledger provenance
description: Provenance requirements for controlled FAT inventory ledger anchors used by later lot-scoped issue paths
---

Controlled FAT inventory fixtures must attach the same lot, warehouse, and
location provenance to their GRN and inspection ledger anchors that later
reservation, allocation, and WIP issue rows will use.

**Why:** A material-level signed-ledger sum can remain nonnegative while a
warehouse- or lot-scoped sum is negative if positive receipt/inspection rows
have NULL provenance and the later issue row is fully scoped. This makes a
global balance check and a warehouse balance check disagree without implying
an application race or write-path defect.

**How to apply:** Create the controlled warehouse/location/lot before the
fixture's downstream issue path, then update or insert every related GRN and
inspection ledger anchor with those IDs. Validate material+warehouse+state and
material+lot+state scopes before certification.