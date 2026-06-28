# OCS One — Certification Programme

> **This index is the entry point for the entire certification audit trail.**
> A new engineer should be able to understand the full certification programme from this file alone.

---

## What Is Certification?

Every module in OCS One must pass an 8-step Certification Wave before it is considered production-ready. A module marked `✅ Built` has been implemented. A module marked `🔵 Certified` has been tested, validated, and accepted by the factory.

Each wave produces six evidence documents:

| File | Purpose |
|------|---------|
| `MAT.md` | Module Acceptance Test — 10-point scorecard + test case results |
| `Defects.md` | Defect log — severity, status, resolution for every defect found |
| `Performance.md` | API and frontend performance test results |
| `Integration.md` | Cross-module integration verification |
| `UAT.md` | Factory User Acceptance Test — named approver sign-off |
| `Certification.md` | Final certification record — all 11 exit criteria with evidence |

**Policy: Templates are versioned. Evidence is immutable.**
Templates (these files) may be improved for future waves. Once a wave is certified, its evidence records must never be rewritten. If a certified module later fails, record the event in a new maintenance or re-certification entry — do not alter the original.

---

## Standard Certification Testing Practices

These practices are **permanent and apply to every certification wave (CW-02 → CW-08)**.

### Batch MAT methodology (per phase)

Run the **whole phase as one batch**, then triage: (1) execute the entire phase's test suite —
every case, no stopping; (2) collect ALL findings; (3) classify each defect Critical / High /
Medium / Low **and** module-specific vs. platform-improvement; (4) present the consolidated
report to the CTO and get approval **before any fix**; (5) fix all Critical/High/Medium together
in a single remediation cycle; (6) re-run the FULL phase; (7) close the gate only on a full PASS.
No per-defect test→fix→retest loops. Mantra: **Measure. Verify. Document.** — before any change.

### Standard fixture teardown — set-based, prefix-scoped (CTO-accepted 2026-06-28, CW-02 MAT-04)

Every live certification harness that creates fixtures MUST tear them down so the wave leaves
**0 residual** certification data. The accepted standard:

1. **Prefix-tag every fixture** with one stable, searchable token (e.g. `CW0X-CERT-…`).
2. **Tear down by prefix, set-based** — delete with `WHERE … LIKE 'PREFIX-%'` (and equivalent
   `created_by` / actor columns), **never by IDs captured in the run**. Captured-ID teardown
   only cleans the current run, so a prior partial run's orphans persist and their FKs can block
   the current cleanup — residual silently accumulates.
3. **Break foreign keys before deleting parents** — null child FK columns first, then delete
   leaf → root in FK-safe order.
4. **Surface every teardown error** — a SQL helper may return DB/FK errors as *text* without
   throwing, so `try/catch` alone can hide a failed delete. Print each statement's result and
   then run an explicit **residual-count assertion (must equal 0)** across every table touched.
5. **Account for cascading platform writes** — e.g. grading appends an ECF
   `engineering_corrections` original row per cell, so a grading harness must also clear that
   ledger (keyed on the harness actor). Enumerate every table a tested operation writes.

> Rationale: certification must never pollute the live dataset. A wave is not closeable until
> its teardown is proven to 0 residual.

---

## Certification Waves

### CW-01 — Cell Receiving

| Field | Value |
|-------|-------|
| **Objective** | Certify the inbound cell lot creation and intake workflow as production-ready |
| **Status** | 🟡 In Progress |
| **Start Date** | — |
| **Completion Date** | — |
| **Lead Engineer** | — |
| **Certification Status** | ⬜ Not certified |
| **Folder** | [`CW-01-Cell-Receiving/`](./CW-01-Cell-Receiving/) |

---

### CW-02 — Cell Grading

| Field | Value |
|-------|-------|
| **Objective** | Certify per-cell grading (capacity, IR, voltage), grade configuration, and allocation pool integrity |
| **Status** | ⬜ Not started |
| **Start Date** | — |
| **Completion Date** | — |
| **Lead Engineer** | — |
| **Certification Status** | ⬜ Not certified |
| **Folder** | [`CW-02-Cell-Grading/`](./CW-02-Cell-Grading/) |

---

### CW-03 — Manufacturing Orders

| Field | Value |
|-------|-------|
| **Objective** | Certify the full 9-stage production order lifecycle including cell allocation, stage sign-off, rework, and battery genealogy |
| **Status** | ⬜ Not started |
| **Start Date** | — |
| **Completion Date** | — |
| **Lead Engineer** | — |
| **Certification Status** | ⬜ Not certified |
| **Folder** | [`CW-03-Manufacturing-Orders/`](./CW-03-Manufacturing-Orders/) |

---

### CW-04 — Charging

| Field | Value |
|-------|-------|
| **Objective** | Certify charger unit management, formation charge assignment, utilisation dashboard, and double-assignment prevention |
| **Status** | ⬜ Not started |
| **Start Date** | — |
| **Completion Date** | — |
| **Lead Engineer** | — |
| **Certification Status** | ⬜ Not certified |
| **Folder** | [`CW-04-Charging/`](./CW-04-Charging/) |

---

### CW-05 — Quality Control

| Field | Value |
|-------|-------|
| **Objective** | Certify test result capture, QC approval/rejection workflow, rework queue integration, and 30-day quality summary |
| **Status** | ⬜ Not started |
| **Start Date** | — |
| **Completion Date** | — |
| **Lead Engineer** | — |
| **Certification Status** | ⬜ Not certified |
| **Folder** | [`CW-05-Quality-Control/`](./CW-05-Quality-Control/) |

---

### CW-06 — Dispatch & Logistics

| Field | Value |
|-------|-------|
| **Objective** | Certify dispatch order lifecycle (Draft → Delivered), QC-pass gate, shipment event audit trail, and dealer management |
| **Status** | ⬜ Not started |
| **Start Date** | — |
| **Completion Date** | — |
| **Lead Engineer** | — |
| **Certification Status** | ⬜ Not certified |
| **Folder** | [`CW-06-Dispatch-Logistics/`](./CW-06-Dispatch-Logistics/) |

---

### CW-07 — Reports & Analytics

| Field | Value |
|-------|-------|
| **Objective** | Certify all four report types (Production, QC, Cell Analytics, Logistics), filter accuracy, and agreement with Director Dashboard KPIs |
| **Status** | ⬜ Not started |
| **Start Date** | — |
| **Completion Date** | — |
| **Lead Engineer** | — |
| **Certification Status** | ⬜ Not certified |
| **Folder** | [`CW-07-Reports-Analytics/`](./CW-07-Reports-Analytics/) |

---

### CW-08 — Warranty & Service

| Field | Value |
|-------|-------|
| **Objective** | Certify warranty registration on dispatch, service ticket lifecycle, repair history, and battery genealogy integration — completing v1.0-certified |
| **Status** | ⬜ Not started |
| **Start Date** | — |
| **Completion Date** | — |
| **Lead Engineer** | — |
| **Certification Status** | ⬜ Not certified |
| **Folder** | [`CW-08-Warranty-Service/`](./CW-08-Warranty-Service/) |

---

## Summary Table

| Wave | Module | Status | Certified |
|------|--------|--------|-----------|
| CW-01 | Cell Receiving | 🟡 In Progress | ⬜ |
| CW-02 | Cell Grading | ⬜ Not started | ⬜ |
| CW-03 | Manufacturing Orders | ⬜ Not started | ⬜ |
| CW-04 | Charging | ⬜ Not started | ⬜ |
| CW-05 | Quality Control | ⬜ Not started | ⬜ |
| CW-06 | Dispatch & Logistics | ⬜ Not started | ⬜ |
| CW-07 | Reports & Analytics | ⬜ Not started | ⬜ |
| CW-08 | Warranty & Service | ⬜ Not started | ⬜ |

**Waves certified: 0 / 8 — Overall certification progress: 0%**

---

## How to Update This File

When a wave moves to **In Progress**: set Status to `🟡 In Progress` and fill in Start Date and Lead Engineer.
When a wave is **Certified**: set Status to `🔵 Certified`, fill in Completion Date, update Certification Status, and update the Summary Table row.

*Last updated: 2026-06-27*
