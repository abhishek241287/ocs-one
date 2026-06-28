---
name: Config-integrity cert pattern (SS-04)
description: The single-source-of-truth pattern shared by every OCS cert standard, and the WARN-vs-FAIL contract.
---

# Configuration-integrity / cert-suite pattern (SS-04)

**Rule:** Every permanent OCS certification standard is built as ONE source of truth
consumed by BOTH an automated suite (exit non-zero on failure) AND a director-only
dashboard — so the test and the UI can never drift. Do not add a dashboard that
recomputes its own view of the same data; have it call the same function the suite uses.

- SS-02 → `lib/authz-matrix.ts` (suite `cert/authz-suite.ts` + security dashboard)
- SS-03 → `lib/audit-matrix.ts` (suite `cert/audit-suite.ts`)
- SS-04 → `lib/config-integrity.ts` `gatherConfig()`+`validateConfig()` (suite
  `cert/config-suite.ts` + `/developer/configuration` dashboard)

**WARN vs FAIL contract (SS-04):** a check returns FAIL = configuration drift =
production defect → suite exits non-zero. WARN is allowed ONLY for a documented
*development-mode* exception (e.g. dev cookie `secure` off, dev `script-src`
unsafe-inline for Vite HMR, dev seed admin password). Only FAIL flips the exit code.

**Why:** the CTO mantra is "measure, verify, document, only then certify." A dashboard
that fabricates or recomputes data, or a check that softens a real prod gap to WARN,
defeats certification. Prove enforcement is real by running the suite with
`NODE_ENV=production` — it must FAIL on genuine prod defects (e.g. default admin
password) that only WARN in dev.

**How to apply:** when adding a new cert standard, (1) put the matrix/validators in a
`lib/` module, (2) drive both the suite and dashboard from it, (3) register a
validation command, (4) make value-aware checks where a present-but-wrong value is the
real risk (e.g. admin-credential check fails even if `ADMIN_PASSWORD` is set to the
known seed default), (5) keep the suite read-only or self-cleaning (throwaway cert
lot + temp user torn down on exit).
