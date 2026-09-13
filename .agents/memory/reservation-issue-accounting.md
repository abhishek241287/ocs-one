---
name: Reservation issue accounting
description: How reservation quantities and allocation evidence must evolve when issuing reserved stock into WIP.
---

`inventory_reservations.allocated_qty` is cumulative allocated quantity and
`issued_qty` is cumulative issued quantity. Issue-to-WIP must advance only
`issued_qty`; the active allocation rows represent the remaining allocatable
quantity, while issued allocation rows preserve the issued evidence.

**Why:** The database invariant is `reserved_qty >= allocated_qty >= issued_qty`.
Decrementing `allocated_qty` during repeated issues makes the second issue violate
the invariant even though the allocation rows and physical stock are valid.

**How to apply:** Compute issuable quantity as `allocated_qty - issued_qty`, split
or flip allocation evidence rows, and leave cumulative `allocated_qty` unchanged
when posting each issue.

For reversal, the durable projection invariant is:
`SUM(active allocation quantities) = allocated_qty - issued_qty`, and
`SUM(issued allocation quantities) = issued_qty`.

**Why:** This connects the Task 69 allocation evidence rows to the Phase 4
movement columns and proves that reversal restores the exact active hold rather
than merely making the reservation status look allocated.

**How to apply:** Assert both equalities after every reversal and after any
future issue/reversal sequence; record this as `INV-P4-05`.