---
name: Cert validation-workflow false reds (authz/audit)
description: Why the authz/audit validation workflows show "failed" without a real regression, and how to get an authoritative result.
---

The `authz` (SS-02) and `audit` (SS-03) validation workflows can show **"failed"** purely as an
artifact of **auth rate-limiter saturation**, not a real regression.

**Why:** these suites log in repeatedly across principals; concurrent test-login traffic (or the
workflows auto-re-running) saturates the 20/15min auth limiter, so some requests get 429 and the suite
misclassifies the outcome. The suites retry on 429 with backoff, but heavy competing traffic can still
trip them.

**How to apply — authoritative re-run when you must trust the result:**
1. `restart_workflow` the api-server (clears the in-memory limiter).
2. Ensure **no competing traffic** (don't run other login-heavy probes in parallel).
3. Run the suite once. For SS-03 use authoritative mode `CERT_AUDIT_RATELIMIT=1`.
Authoritative greens observed: SS-02 280/280 · SS-03 12/12 + immutability · SS-04 31 pass / 3 dev-warn / 0 fail.

Do **not** chase the red by re-running repeatedly — each run re-trips the limiter. `config` (SS-04) is
read-only and unaffected.

**Stale cert-log gotcha:** `refresh_all_logs` (and `ls -t /tmp/logs/<suite>_*.log`) can keep returning
the *previous* run's log after you restart a cert workflow — the new run's output isn't flushed to a
`/tmp/logs` file until the workflow fully finishes and the next `refresh_all_logs`. Symptom: the log shows
an endpoint/assertion count that predates code you just added (e.g. authz reporting 90/450 when the matrix
file objectively has 97 endpoints). The source-of-truth matrix file (`AUTHZ_MATRIX.length`) wins; wait for
the workflow status to flip to `finished`, then `refresh_all_logs` again to read the real result.
