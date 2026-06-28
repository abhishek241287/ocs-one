# CW-03 Freeze Notice — Manufacturing Orders (on OCS One Foundation v1.0)

> **OFFICIAL BASELINE EXTENSION.** This notice declares the **Manufacturing Orders** module and the
> **Unified Product Platform v1.0** (first implementation) frozen following the certification and CTO
> acceptance of Certification Wave 03. OCS One Foundation v1.0 (CW-01) remains the baseline; CW-02
> (Cell Grading + ECF v1.0) extends it; this notice extends it further.

---

## Freeze Summary

| Field | Value |
|-------|-------|
| **Wave Frozen** | CW-03 — Manufacturing Orders |
| **Baseline** | OCS One Foundation v1.0 (CW-01) + Cell Grading/ECF v1.0 (CW-02) |
| **Certification Date** | 2026-06-28 |
| **Approval Number** | `CW-03-APR-001` |
| **Git Tag** | `CW-03-CERTIFIED` (recorded; physical tag pending — main agent cannot create git refs) |
| **API Version** | `@workspace/api-server` `1.0.0` (Express 5) |
| **Product Platform** | v1.0 — FROZEN (first implementation: Manufacturing → Product mint at QC-pass) |
| **ECF Version** | v1.0 — FROZEN (unchanged) |
| **ODS Version** | v1.0 — FROZEN (unchanged) |
| **Security Standard Version** | SS-01…SS-04 — v1.0 (permanent, unchanged) |
| **Approved By** | CTO, OCS Oorja Green Pvt. Ltd. |

---

## Modules Covered

CW-03 certifies the **Manufacturing Orders** module end-to-end (MAT-01 → MAT-06), plus the platform
asset first implemented during the wave:

- **Manufacturing Orders** — production order creation, the full 9-stage lifecycle (cell allocation →
  assembly → compression → BMS install → BMS programming → charging → testing → QC → packing), per-stage
  start/pause/resume/complete/approve/reject with data capture, sequence guards, and stage-data/notes
  persistence — plus supporting API/RBAC/validation/audit/performance.
- **Unified Product Platform v1.0 (first implementation)** — serialized **Product** minted at the
  QC-pass gate (`products` + `official_product_serial`/`serial_source`, `product_status` lifecycle,
  `product_genealogy`, append-only `product_events`). Creation is **workflow-driven** (the workflow's
  `product_creation_trigger` decides WHEN), **atomic + idempotent** (no duplicate Product on
  re-approval), with genealogy copied from `mfg_battery_genealogy` at the gate. Downstream modules key
  off the official serial; **Permanent rule: No Product before QC PASS.**

Full evidence: `certification/CW-03-Manufacturing-Orders/` (archived read-only).

---

## Carried Forward — Post-Certification Enhancement Backlog (none block certification; CTO-acknowledged)

| ID | Severity | Class | Disposition | Item |
|----|----------|-------|-------------|------|
| DEF-CW03-001 | Low | App-level shared UI (**not** a frozen framework) | **Post-cert enhancement backlog — no fix during manufacturing milestone (CTO 2026-06-28)** | React "key prop spread into JSX" dev-console warning on the shared master Add/Edit drawer. Zero functional / security / audit / data-integrity impact. Revisit only if it later develops into a functional defect. |

---

## Freeze Rules

In force from 2026-06-28 until explicitly lifted by the CTO:

1. **Manufacturing Orders + Unified Product Platform v1.0 are frozen** on top of the CW-01/CW-02
   baseline. Certified evidence in `certification/CW-03-Manufacturing-Orders/` is archived read-only.
2. **No platform changes** are permitted (ODS, ECF, Product Platform, Security Standards, Certification
   Framework) — the Platform Freeze Policy stays in force through CW-08.
3. **The only permitted change is a fix required by a Critical/High certification defect or a security
   vulnerability.** Any such fix is made once in the shared layer and re-verified against SS-02/SS-03/SS-04.
   Every other idea goes to the relevant enhancement backlog.
4. **Permanent rule: No Product before QC PASS.** The Workflow decides WHEN a Product is created; the
   Product Platform decides WHAT is created. Official Product Serial + Engineering references never
   reset/renumber (Compatibility Rule).
5. **The three automated suites (`authz`, `audit`, `config`) remain the standing gates** and must stay
   green in every subsequent wave. Default-mode `audit`/`authz` workflows may show red purely from
   global auth-limiter residue — authoritative mode (`CERT_AUDIT_RATELIMIT=1`, restarted server, no
   competing traffic) is the SS-03/SS-02 gate.

---

## Authorization for the Next Capability — Inventory Platform

Per CTO direction (2026-06-28), the next major business capability before deployment is the **Inventory
Platform** (Goods Receipt/GRN, Material Master, Material Inventory, Incoming Inspection, Product
Inventory, Rejected Inventory, Warehouse Stock, Stock Movements). It consumes the now-frozen Unified
Product Platform (finished-goods Product Inventory is a projection over `products` at/after QC-pass) and
the frozen Security/ECF/ODS platforms unmodified. Implementation plan: `INVENTORY_PLATFORM_IMPLEMENTATION_PLAN.md`.

**Simplified cadence (CTO-directed for remaining modules):** Implement → Test → Report blockers → Fix
critical → Freeze. Priority is business capability (manufacturing / inventory / financial correctness,
security, audit, data integrity) — no cosmetic work. No new architecture work; no new documentation
unless necessary.

---

*Issued 2026-06-28 · Approval `CW-03-APR-001` · Git tag `CW-03-CERTIFIED` · Manufacturing Orders + Unified Product Platform v1.0 frozen on the CW-01/CW-02 baseline.*
