# CW-05 — Quality Control: Certification Record

| Field | Value |
|-------|-------|
| **Wave** | CW-05 |
| **Module** | Quality Control |
| **Certifier** | — |
| **Certification Date** | — |
| **Version Certified** | — |
| **Git Tag** | — |

---

## Exit Criteria — Evidence Record

| # | Criterion | ✅/❌ | Evidence |
|---|-----------|------|----------|
| 1 | MAT completed — all mandatory tests passing | ⬜ | See `MAT.md` |
| 2 | No Critical or High defects open | ⬜ | See `Defects.md` |
| 3 | TypeScript: 0 errors | ⬜ | `pnpm run typecheck` output: |
| 4 | ESLint: 0 warnings | ⬜ | `pnpm run lint` output: |
| 5 | OpenAPI spec matches implementation | ⬜ | Codegen run output: |
| 6 | DB migrations applied and verified | ⬜ | Migration files: |
| 7 | Integration verified | ⬜ | See `Integration.md` |
| 8 | Reports and Dashboard correct | ⬜ | See `Integration.md` items 4–5 |
| 9 | Documentation updated | ⬜ | Commit hash: |
| 10 | Factory UAT signed off | ⬜ | See `UAT.md` |
| 11 | Release checkpoint created | ⬜ | Git tag: &nbsp; Backup: |

---

## Tool Output Evidence

### TypeScript
```
[paste output]
```
### ESLint
```
[paste output]
```
### Codegen
```
[paste output]
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

- [ ] **CERTIFIED**
- [ ] **NOT CERTIFIED**

**Certifier:** _________________________ **Date:** _____________

## Post-Certification Actions

- [ ] `PROJECT_STATUS.md` updated
- [ ] `CHANGELOG.md` section appended
- [ ] Module frozen
- [ ] CW-06 folder opened
