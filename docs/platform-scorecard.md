# Platform Adoption Scorecard

> **Governance directive (CTO).** Platform frameworks are measured by **adoption, not by
> the number of new features.** The objective is to increase adoption across manufacturing
> modules while keeping each platform itself stable. Engineering success is measured by
> manufacturing capability delivered *on top of* the frozen platform, not by changes to the
> platform. Each frozen platform maintains the six fields below. Update this scorecard when a
> module adopts a platform, when a permitted (Critical / High / security) platform change
> ships, or at each certification-wave gate.

_Last reviewed: 2026-06-28 (CW-02, Cell Grading in progress)._

## Engineering Correction Framework (ECF)

| Field | Value |
|-------|-------|
| **Current Version** | v1.0 |
| **Freeze Status** | FROZEN |
| **Modules Using It** | 1 — Cell Grading (reference consumer) |
| **Last Platform Change** | v1.0 extraction + freeze (CW-02, 2026-06-28) |
| **Next Planned Version** | v1.1 (post-certification roadmap) |
| **Enhancement Backlog Count** | 5 (ECF-001…ECF-005) |

Adoption target: every correction-allowing module integrates ECF (Charging, Testing, QC,
Battery Assembly, Packing, Dispatch, Warranty, …) — as future work, NOT during cert waves.

## Operational Design System (ODS)

| Field | Value |
|-------|-------|
| **Current Version** | v1.0 |
| **Freeze Status** | FROZEN (19 components) |
| **Modules Using It** | All ocs-one frontend modules (15 feature areas) |
| **Last Platform Change** | v1.0 freeze (CW-01, 2026-06-28) |
| **Next Planned Version** | v2.0 (post-certification roadmap) |
| **Enhancement Backlog Count** | Tracked under the post-cert ODS 2.0 scope (not enumerated during cert waves) |

## Security Standards (SS-01 … SS-04)

| Field | Value |
|-------|-------|
| **Current Version** | v1.0 (permanent) |
| **Freeze Status** | FROZEN |
| **Modules Using It** | Platform-wide — every protected endpoint / module |
| **Last Platform Change** | v1.0 (CW-01, 2026-06-28) |
| **Next Planned Version** | None — permanent standards |
| **Enhancement Backlog Count** | 0 (none recorded) |

## Certification Framework

| Field | Value |
|-------|-------|
| **Current Version** | v1.0 |
| **Freeze Status** | FROZEN |
| **Modules Using It** | Per wave — CW-01 Cell Receiving (certified); CW-02 Cell Grading (in progress) |
| **Last Platform Change** | v1.0 (CW-01, 2026-06-28) |
| **Next Planned Version** | None during CW-02→CW-08 |
| **Enhancement Backlog Count** | 0 (none recorded) |

---

### How to read this

- **Freeze Status** never changes during CW-02→CW-08 except via the Platform Freeze Policy
  gate (Critical cert defect / High-severity cert defect / security vulnerability).
- **Modules Using It** is the headline metric — the goal is for this to grow each wave while
  Current Version stays put.
- **Enhancement Backlog Count** captures deferred ideas; growth here is healthy (ideas are
  parked, not built) and is worked only on the post-certification roadmap.
