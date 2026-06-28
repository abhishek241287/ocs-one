# Platform Scorecard — Operational Dashboard

> **This is an operational dashboard, not a governance document.** It is the **first place
> to look before deciding whether a platform framework needs modification.** Platforms are
> measured by both **Adoption** (is capability being built on top?) and **Platform Health**
> (does it stay stable while adoption grows?). A healthy platform supports *more*
> manufacturing capability with *fewer* changes over time.

Each frozen platform maintains the ten fields below. Update on: a module adopting a
platform, a permitted (Critical/High/security) platform change, a defect opening/closing,
or a certification-wave gate.

_Last reviewed: 2026-06-28 (CW-02, Cell Grading in progress)._

## Health legend

- **Open Critical / High Defects** — defects against the platform itself. Any non-zero here
  is the *only* routine trigger (with security vulns) for touching a frozen platform.
- **Breaking Changes Since Freeze** — must stay **0** under the Compatibility Rule; any
  breaking change forces a major version (e.g. ECF v2.0) with a migration plan.
- **Certification Status** — whether the platform's standing gates (SS-02/SS-03/SS-04) and
  wave certification are green.

---

## Engineering Correction Framework (ECF)

| Field | Value |
|-------|-------|
| **Version** | v1.0 |
| **Freeze Status** | FROZEN |
| **Modules Using It** | 1 — Cell Grading (reference consumer) |
| **Last Platform Change** | v1.0 extraction + freeze (CW-02, 2026-06-28) |
| **Open Critical Defects** | 0 |
| **Open High Defects** | 0 |
| **Breaking Changes Since Freeze** | 0 |
| **Certification Status** | ✅ Standing gates green (SS-02/SS-03/SS-04); ledger in SS-03 immutability suite |
| **Next Planned Version** | v1.1 (post-certification roadmap) |
| **Enhancement Backlog Count** | 5 (ECF-001…ECF-005) |

## Operational Design System (ODS)

| Field | Value |
|-------|-------|
| **Version** | v1.0 |
| **Freeze Status** | FROZEN (19 components) |
| **Modules Using It** | All ocs-one frontend modules (15 feature areas) |
| **Last Platform Change** | v1.0 freeze (CW-01, 2026-06-28) |
| **Open Critical Defects** | 0 |
| **Open High Defects** | 0 |
| **Breaking Changes Since Freeze** | 0 |
| **Certification Status** | ✅ Certified under CW-01 (Foundation v1.0) |
| **Next Planned Version** | v2.0 (post-certification roadmap) |
| **Enhancement Backlog Count** | Tracked under post-cert ODS 2.0 scope (not enumerated during cert waves) |

## Security Standards (SS-01 … SS-04)

| Field | Value |
|-------|-------|
| **Version** | v1.0 (permanent) |
| **Freeze Status** | FROZEN |
| **Modules Using It** | Platform-wide — every protected endpoint / module |
| **Last Platform Change** | v1.0 (CW-01, 2026-06-28) |
| **Open Critical Defects** | 0 |
| **Open High Defects** | 0 |
| **Breaking Changes Since Freeze** | 0 |
| **Certification Status** | ✅ `authz` / `audit` / `config` suites green |
| **Next Planned Version** | None — permanent standards |
| **Enhancement Backlog Count** | 0 (none recorded) |

## Certification Framework

| Field | Value |
|-------|-------|
| **Version** | v1.0 |
| **Freeze Status** | FROZEN |
| **Modules Using It** | Per wave — CW-01 Cell Receiving (certified); CW-02 Cell Grading (in progress) |
| **Last Platform Change** | v1.0 (CW-01, 2026-06-28) |
| **Open Critical Defects** | 0 |
| **Open High Defects** | 0 |
| **Breaking Changes Since Freeze** | 0 |
| **Certification Status** | ✅ CW-01 closed at full pass; CW-02 in progress |
| **Next Planned Version** | None during CW-02→CW-08 |
| **Enhancement Backlog Count** | 0 (none recorded) |

---

### How to read this dashboard

- **Before modifying any platform, check here first.** A frozen platform is touched only when
  Open Critical Defects > 0, Open High Defects > 0, or a security vulnerability requires
  immediate remediation (Platform Freeze Policy gate). Everything else is backlog.
- **Adoption signal:** *Modules Using It* should grow each wave while *Version* stays put.
- **Health signal:** *Open Critical/High Defects = 0* and *Breaking Changes Since Freeze = 0*
  while adoption rises = a healthy platform (more capability, fewer changes).
- **Backlog growth is healthy** — ideas are parked for the post-certification roadmap, not
  built during waves.
