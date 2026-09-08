# FAT Remediation Verification Record

**Status:** VERIFIED — FAT candidate baseline  
**Verification date:** 2026-09-08  
**Product:** OCS One  
**Scope:** FAT blocker remediation and certification verification only

## Commit lineage

### Base commit before remediation

- **Hash:** `44894ec2c081ec9011f0683c010f207c66840fa5`
- **Subject:** `Implement material issue logic and expand api server routes and endpoints`

### Final remediation commit

- **Hash:** `60564b1b49b76ce0b97e46d1de65a7325ef50ba7`
- **Subject:** `Implement fat blocker suite fixes and add qa seeding logic`
- **Parent:** `44894ec2c081ec9011f0683c010f207c66840fa5`

The final remediation commit contains the QA seed, FAT suite corrections, and the two narrow dealer-portal authorization fixes described below. It does not contain unrelated product functionality, UI work, schema changes, or architectural changes.

## Exact blockers addressed

The FAT blocker acceptance suite verified each of the following remediation areas:

1. **Patch 1A — `dealer_id` on users:** the column exists and supports dealer-to-dealership linkage.
2. **Patch 1C — dealer identity in auth:** `/auth/me` exposes the `dealerId` field.
3. **H18 — genealogy idempotency:** unique indexes exist on battery and product genealogy.
4. **C2 — legacy dispatch write freeze:** director and supervisor writes are rejected; owner writes reach the owner-only gate; factory reads remain available.
5. **H1 — customer registration dealer authority:** caller-supplied `dealer_id` is rejected and nonexistent serials return a non-500 response.
6. **C1 — dealer data isolation:** a dealer cannot read another dealer’s inventory, while the dealer can read its own inventory.
7. **H11 — lot traceability:** an invalid lot reference in a material issue request is rejected without a 500 response.
8. **H14 — order completion idempotency:** completed orders remain readable without creating a duplicate product.
9. **H17 — charger reservation race:** concurrent charging reservations cannot both succeed.

## Exact verification commands and results

The API server was restarted before the certification runs to begin from a clean process/rate-limiter state.

### QA dataset

```text
pnpm --filter @workspace/api-server exec tsx src/cert/qa-seed.ts
```

Result: seed completed successfully. Verification reported 2 QA dealers, 1 charger, 4 QA production orders, 18 H17 stages, and 1 QA dealer user.

### FAT blocker acceptance

```text
pnpm --filter @workspace/api-server exec tsx src/cert/fat-blocker-suite.ts
```

Result:

```text
18 pass · 0 skip · 0 fail
```

The four data-dependent blocker paths were live, not skipped. C1 cross-access returned 403, C1 own-dealer access returned 200, and H17 returned one failed reservation and one successful reservation.

### SS-02 authorization

```text
pnpm --filter @workspace/api-server run test:authz
```

Result:

```text
SS-02 PASSED — all 770 authorization assertions hold.
```

This covers 110 endpoints × 7 principals = **770/770** assertions.

### SS-03 audit trail

The authoritative rate-limit mode was used so the suite generates and verifies the rate-limit audit event explicitly:

```text
CERT_AUDIT_RATELIMIT=1 pnpm --filter @workspace/api-server run test:audit
```

Result:

```text
SS-03 PASSED — all 12 audited operations recorded correctly; audit history immutable.
```

Result: **12/12** audited operations passed. Static and runtime immutability checks also passed for `cell_lot_events`, `security_events`, and `engineering_corrections`.

The default shape-mode run can report the known pre-existing `ratelimit.exceeded path≠login` residue when it reuses an earlier rate-limit event. That is not the authoritative gate; `CERT_AUDIT_RATELIMIT=1` is the verification run recorded above.

### SS-04 configuration integrity

```text
pnpm --filter @workspace/api-server run test:config
```

Result:

```text
31 pass · 3 warn · 0 fail (34 checks)
SS-04 PASS
```

This is **31/31 passing configuration checks**, with the following three documented development warnings:

1. **Default admin credentials:** the known seed default admin password is in use; this is permitted for development and must be changed before production.
2. **Cookie secure flag:** the secure cookie flag is off in development and auto-enables in production.
3. **CSP `script-src`:** `'unsafe-inline'` is present for the Vite HMR client in development and must not be present in production.

The separate `style-src 'unsafe-inline'` allowance is documented and passed its dedicated integrity check; it is not one of the three warnings.

## Bugs discovered during verification

### 1. Global dealer guard made the portal isolation guard unreachable

`denyDealerFactoryAccess` ran globally before the `/dealers` router and returned 403 for every dealer-role request, including valid dealer-portal requests.

**Fix:** dealer-role requests under the `/dealers` prefix now pass through the global factory guard. The dealers router applies the narrower per-dealership isolation check. All other factory paths remain blocked for dealer-role users.

### 2. `req.params` was empty in `router.use()` middleware

The C1 isolation middleware initially read `req.params.id` / `req.params.dealerId`. Express had not matched the child route yet, so those values were undefined and cross-dealer access was not rejected.

**Fix:** the middleware extracts the leading dealer ID from `req.path.split("/")[1]`, which is populated relative to the mounted `/dealers` router at middleware time. Cross-dealer access now returns 403 and own-dealer access remains permitted.

## Scope confirmation

No other features or unrelated code were introduced. The remediation delta is limited to:

- making the existing C1 FAT scenario executable against a seeded QA user;
- adding an idempotent, `QA-FAT-`-prefixed certification dataset;
- correcting the H17 certification request path/body to match the existing API contract;
- fixing the two narrowly scoped dealer-portal authorization issues discovered by the live verification;
- recording verification evidence.

No new user-facing product feature, UI surface, database schema, manufacturing workflow, or unrelated API behavior was added.

## FAT candidate baseline freeze

The final remediation commit is frozen as the FAT candidate baseline:

```text
FAT-CANDIDATE-2026-09-08
60564b1b49b76ce0b97e46d1de65a7325ef50ba7
```

Future FAT regression comparisons should use this commit as the candidate baseline and preserve the test order: QA seed, FAT blocker suite, SS-02, authoritative SS-03, and SS-04.