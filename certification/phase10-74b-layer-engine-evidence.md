# Phase 10 / 74-B — valuation layer-engine evidence

**Run:** 2026-09-15T16:30:00.032Z
**Verdict:** PASS

## Scope

This batch proves the valuation value twin beside the signed quantity ledger. It does
not add valuation writes to `inventory_transactions`.

## INV-VAL gates

- **INV-VAL-01 — value and quantity conservation: PASS.** FIFO captured layers satisfied
  receipt quantity = remaining quantity − signed depletion quantity and receipt value =
  remaining layer value − signed depletion value.
- **INV-VAL-02 — no negative layers: PASS.** FIFO, WAVG, MISSING, and LEGACY paths stayed
  nonnegative; an over-consumption attempt failed and rolled back its signed movement.
- **INV-VAL-03 — document-cited events: PASS.** Every depletion joined back to the exact
  `inventory_transactions` movement and matched document type, document id, and source line.
- **INV-VAL-04 — ledger wall: PASS.** FIFO, WAVG, MISSING, and LEGACY valuation calls
  changed the inventory transaction count by zero.

## Policy and cost states

- FIFO captured path: 5 @ 10.0000 + 7 @ 20.0000; consume 6 → 5 + 1 split, values
  -50.0000000 and -20.0000000.
- WAVG captured path: 2 @ 10.0000 + 8 @ 20.0000; consume 5 → proportional 1 + 4 split,
  values -10.0000000 and -80.0000000.
- MISSING path: quantity depleted, `value_status=UNKNOWN`, no unit cost, no value amount.
- LEGACY path: lazily materialized as explicit LEGACY evidence, then depleted with the same
  UNKNOWN semantics.

## Transaction boundary

The failed 99-unit FIFO attempt rolled back both its signed movement and any valuation
changes. This proves the value consumer is composed inside the movement transaction.
