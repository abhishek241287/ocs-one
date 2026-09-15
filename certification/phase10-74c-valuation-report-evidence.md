# Phase 10 / Task 74-C — valuation report evidence

- Base URL: http://localhost:80
- Fixture prefix: VAL74C-MU2RFJWK-9A1E30AA
- Result: PASS
- Checks: 14 passed, 0 failed

- [x] invalid UUID filter is rejected
- [x] invalid stock-state filter is rejected
- [x] invalid date range is rejected
- [x] viewer can read value-on-hand
- [x] unknown quantity stays separate
- [x] unknown value remains NULL
- [x] captured on-hand reconciles to layer remainder
- [x] viewer can read movements-at-cost
- [x] movements include receipt and depletion events
- [x] movement ordering is deterministic
- [x] viewer can read layer-trace
- [x] layer trace preserves both citations
- [x] report reads write zero inventory rows
- [x] report reads write zero valuation rows

The fixture was removed in the finally block. Report endpoints were exercised through authenticated HTTP GETs only.
