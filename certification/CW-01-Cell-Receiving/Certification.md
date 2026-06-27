# CW-01 — Cell Receiving: Certification Record

| Field | Value |
|-------|-------|
| **Wave** | CW-01 |
| **Module** | Cell Receiving |
| **Certifier** | — |
| **Certification Date** | — |
| **Version Certified** | — |
| **Git Tag** | — |

---

## Certification Exit Criteria — Evidence Record

Every item must be checked and backed by evidence. An unchecked item is a certification blocker.

| # | Criterion | ✅/❌ | Evidence |
|---|-----------|------|----------|
| 1 | MAT completed — all mandatory tests passing | ⬜ | See `MAT.md` — scorecard and pass rate |
| 2 | No Critical or High defects open | ⬜ | See `Defects.md` — open count: Critical ____ High ____ |
| 3 | TypeScript: 0 errors | ⬜ | `pnpm run typecheck` output: |
| 4 | ESLint: 0 warnings | ⬜ | `pnpm run lint` output: |
| 5 | OpenAPI spec matches implementation | ⬜ | Codegen run output (paste below) |
| 6 | DB migrations applied and verified | ⬜ | Migration files applied: (list or "N/A") |
| 7 | Integration with dependent modules verified | ⬜ | See `Integration.md` — all ✅ |
| 8 | Reports and Director Dashboard reflect correct data | ⬜ | See `Integration.md` — items 5 and 6 |
| 9 | Documentation updated | ⬜ | Commit hash: |
| 10 | Factory UAT signed off | ⬜ | See `UAT.md` — Approver: ____ Date: ____ |
| 11 | Release checkpoint created | ⬜ | Git tag: &nbsp;&nbsp; Backup file: |

---

## Tool Output Evidence

### TypeScript (`pnpm run typecheck`)

```
[paste output here]
```

### ESLint (`pnpm run lint`)

```
[paste output here]
```

### Codegen (`pnpm --filter @workspace/api-spec run codegen`)

```
[paste output here]
```

---

## Wave Metrics

| Metric | Value |
|--------|-------|
| Modules certified | 1 |
| Defects found | |
| Defects fixed | |
| Defects deferred | |
| Total test cases | |
| Test pass rate | |
| Wave duration (days) | |

---

## Certification Decision

- [ ] **CERTIFIED** — all 11 exit criteria met with evidence. Module status updated to 🔵 Certified.
- [ ] **NOT CERTIFIED** — one or more criteria not met. See blocked items above.

**Certifier:** _________________________ **Date:** _____________

---

## Post-Certification Actions

- [ ] Module status updated in `PROJECT_STATUS.md` → `🔵 Certified`
- [ ] Certification History row appended in `PROJECT_STATUS.md`
- [ ] Wave Metrics row appended in `PROJECT_STATUS.md`
- [ ] Progress Trackers updated in `PROJECT_STATUS.md`
- [ ] Release Health updated in `PROJECT_STATUS.md`
- [ ] `CHANGELOG.md` section appended for CW-01
- [ ] Module frozen — no further changes except critical defect fixes
- [ ] CW-02 folder opened
