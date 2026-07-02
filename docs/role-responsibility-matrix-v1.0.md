# OCS One — Role & Responsibility Matrix

| Field | Value |
|---|---|
| **Product** | OCS One — Manufacturing ERP |
| **Company** | OCS Oorja Green Pvt. Ltd. |
| **Release** | Factory Ready v1.0 |
| **Document Version** | 1.0 |
| **Date** | 01 July 2026 |
| **Audience** | IT administrators, HR onboarding, auditors, factory managers |

> The authoritative reference for **who can do what** in OCS One. Use it to configure users
> (IT), onboard staff (HR), review access controls (audit), and assign responsibilities
> (management). Permissions in this document are derived directly from the enforced authorization
> rules in the software (`lib/authz-matrix.ts` / `docs/security-matrix.md`) and are verified by an
> automated authorization regression test (Security Standard SS-02). **Documentation only — no
> software was changed.**

---

## Table of Contents

1. Roles Overview
2. Permission Legend
3. Master Permission Matrix (Create / View / Edit / Approve / Delete)
4. Module Business Responsibility & Workflow Ownership
5. Governance & Administrative Functions
6. Organizational Role → System Role Mapping
7. Access-Control Principles
8. Administrator & Auditor Checklist

---

# 1. Roles Overview

OCS One enforces **four system roles**. Every user is assigned exactly one.

| Role | Scope | Cannot do |
|---|---|---|
| **Director** | Full access to every module; user administration; governance masters; oversight dashboards. | — (unrestricted) |
| **Supervisor** | Masters, receiving, inspection, BOM, production planning, QC approval, dispatch, dealers, after-sale, reports. | User administration; governance masters (categories/workflows); system/certification administration. |
| **Operator** | Shop-floor execution — cell receiving/grading/matching, charging, testing, production stage execution. | Masters, QC approval, dispatch/dealer management, after-sale writes, reports. |
| **Viewer** | Read-only everywhere. | Any create / edit / approve / delete / state change. |

**Enforcement:** authentication (`requireAuth`) gates every non-public route; write authorization
is enforced per module (`requireWriteRole` / `requireRole`). Reads (GET) are open to any
authenticated user unless a minimum role is stated. **Director is included in every write
permission set.**

---

# 2. Permission Legend

| Symbol | Meaning |
|---|---|
| **D** | Director |
| **S** | Supervisor |
| **O** | Operator |
| **V** | Viewer (read-only) |
| ✅ | Action permitted for the listed roles |
| 👁 | View/read — permitted for **all** authenticated roles (D, S, O, V) |
| — | Action does not exist in this module (by design) |

> **By design, many records are immutable.** Posted GRNs, completed/cancelled production orders,
> approved BOMs, posted MINs, and all commercial documents cannot be edited or deleted — they are
> corrected through append-only actions (e.g. dispatch reversal, MIN reversal, grade correction),
> not overwritten. Where "Edit"/"Delete" shows "—", that is an intentional integrity control, not
> a missing feature.

---

# 3. Master Permission Matrix

Roles allowed for each action are listed per cell. "View" is open to all authenticated roles.

| Module | View | Create | Edit | Approve / Sign-off | Delete |
|---|---|---|---|---|---|
| **User Administration** | D | D | — | — | — |
| **Governance Masters** (Product/Material Categories, Product/Material Workflows, Workflow Assignments) | 👁 | D | D | — | — |
| **Masters** (Materials, Product Models, Cells, BMS, Chargers, Connectors, Cables, Busbars, Cabinets, Test Equipment) | 👁 | D · S | D · S | — | — |
| **Procurement (Suppliers)** | 👁 | D · S | D · S | — | — |
| **Dealers** | 👁 | D · S | D · S | — | D · S |
| **GRN (Goods Receipt Note)** | 👁 | D · S | — (draft delete+recreate; posted read-only) | D · S (Post) | D · S (draft only) |
| **Incoming Inspection** | 👁 | D · S | — (finalized on submit) | D · S (Submit) | — |
| **Inventory (Stock)** | 👁 | — (system-generated ledger) | — | — | — |
| **Material Transfer** | 👁 | D · S | — | — | — |
| **BOM (Bill of Materials)** | 👁 | D · S | D · S (draft / revision) | D · S (Approve / Obsolete) | — |
| **Production Order** | 👁 | D · S | D · S (until completed/cancelled) | D · S (stage approve / reject) | — |
| **Production Stage Execution** (start/pause/resume/complete, genealogy, test results, rework) | 👁 | D · S · O | D · S · O | D · S (stage sign-off) | — |
| **Cell Receiving / Grading / Matching** | 👁 | D · S · O | D · S · O | D · S (grade correction) | — |
| **Material Issue Note (MIN)** | 👁 | D · S | — (append-only) | — | D · S (reversal, one per MIN, reason) |
| **QC (Quality Control)** | 👁 | — | — | D · S (Approve / Reject) | — |
| **Imported Product Registration** | 👁 | D · S | — (one-time mint) | — | — |
| **Packing** | 👁 | D · S | — | — | — |
| **Dispatch** | 👁 | D · S | — (immutable document) | — | D · S (reversal, one per dispatch, reason) |
| **Customer Registration** | 👁 | D · S | — | — | — |
| **Warranty** | 👁 | — (auto-created on registration) | — | D · S (Void, reason) | — |
| **Product Traceability** | 👁 | — | — | — | — |
| **Product Lifecycle Status** | 👁 | — | D · S (forward-only transition) | — | — |
| **Oversight Dashboards** (Director KPI / Security / Configuration) | D | — | — | — | — |

> **Note on "Approve" for MIN/Dispatch:** these modules have no edit/delete; corrections are made
> through a single, reason-stamped, append-only **reversal** (Supervisor/Director), shown in the
> Delete column to indicate the corrective control.

---

# 4. Module Business Responsibility & Workflow Ownership

| Module | Business responsibility | Workflow owner (organizational) |
|---|---|---|
| User Administration | Create user accounts, assign roles, enforce least privilege | IT Admin / Director |
| Governance Masters | Define product & material categories, manufacturing/receiving workflows, and routing | Director |
| Masters | Maintain product models, components, and reference data | Supervisor (Director approves governance items) |
| Procurement (Suppliers) | Maintain supplier records used on receipts | Stores / Purchasing |
| Dealers | Maintain dealer network for dispatch | Sales / Logistics |
| GRN | Record what suppliers physically delivered | Stores |
| Incoming Inspection | Accept/reject received goods, line by line | QA |
| Inventory | Maintain accurate on-hand stock (append-only ledger) | Stores |
| BOM | Define and approve product recipes | Production Engineering / Supervisor |
| Production Order | Authorize and track builds through stages | Production / Supervisor |
| Production Stage Execution | Execute and capture data at each manufacturing stage | Operators (shop floor) |
| Cell Receiving/Grading/Matching | Receive, grade, and match cells for battery packs | Operators / QA |
| Material Issue Note (MIN) | Issue exact BOM materials to orders | Stores |
| QC | Final quality gate; mints the serialized Product on PASS | QA |
| Imported Product Registration | Register imported finished inverters as serialized Products | Stores / Supervisor |
| Packing | Mark QC-passed / imported products packed | Stores |
| Dispatch | Issue immutable dispatch documents to dealers | Stores / Logistics |
| Customer Registration | Record product owner; triggers warranty | Sales |
| Warranty | Manage per-serial warranty and service | Sales / QA |
| Product Traceability | Provide full-lifecycle visibility by serial | All (read) |
| Oversight Dashboards | Monitor KPIs, security posture, configuration integrity | Director |

---

# 5. Governance & Administrative Functions

These functions are **Director-only** and are the primary controls auditors should review.

| Function | Who | Why restricted |
|---|---|---|
| Create user accounts / assign roles | Director | Access control is a governance responsibility; there is no self-registration. |
| Product / Material Categories | Director | Category defines serialization & routing behavior across the platform. |
| Product / Material Workflows | Director | Workflows decide *when* products are created and *how* receipts are routed. |
| Category → Workflow assignments | Director | Mis-assignment would misroute inventory; changes are high-impact. |
| Security dashboard (`/developer/security`) | Director | Exposes auth events, permission failures, and audit feed. |
| Configuration dashboard (`/developer/configuration`) | Director | Shows production configuration integrity (never secret values). |

> **Supervisors explicitly cannot** perform user administration, edit governance masters, or
> access the developer dashboards. **Operators** additionally cannot touch Masters, approve QC,
> or manage dispatch/dealers.

---

# 6. Organizational Role → System Role Mapping

The factory's job titles map onto the four system roles. Assign the **lowest** role that lets a
person do their job (least privilege).

| Organizational role | Recommended system role | Notes |
|---|---|---|
| **Admin** | Director | The seed administrator account is a Director. |
| **Director** | Director | Full authority + oversight dashboards. |
| **Factory Manager** | Supervisor (Director if plant-wide governance is needed) | Governance masters & user admin require Director. |
| **Supervisor** | Supervisor | Line/shift operational authority incl. QC approval and dispatch. |
| **QA** | Supervisor (for QC/inspection sign-off) or Operator (capture-only) | QC approval and grade correction require Supervisor+. |
| **Store** | Supervisor (for GRN/dispatch/MIN) or Operator (limited) | Dispatch, MIN, packing writes require Supervisor+. |
| **Sales** | Supervisor (for customer/warranty) or Viewer (read-only) | Customer registration & warranty void require Supervisor+. |

> A single organizational role may be granted different system roles for different people
> depending on the authority delegated to them. Document each assignment for audit.

---

# 7. Access-Control Principles

- **Least privilege** — grant the minimum role required; a Viewer for anyone who only needs to
  look.
- **No self-registration** — accounts are created only by a Director; no public sign-up.
- **Separation of duties** — governance (Director) is separated from operations (Supervisor) and
  execution (Operator).
- **Read is broad, write is narrow** — any authenticated user can read most data; writes are
  gated by role.
- **Append-only integrity** — finalized records are never edited or deleted; corrections are made
  through reason-stamped, append-only reversals/corrections.
- **Verified, not assumed** — the authorization matrix is enforced by an automated regression test
  (SS-02); every protected endpoint is checked against all roles on each run.

---

# 8. Administrator & Auditor Checklist

**For IT administrators (user setup)**
- ☐ Each user has exactly one system role.
- ☐ Directors are limited to those who genuinely need governance + user admin.
- ☐ Read-only staff are set to Viewer.
- ☐ New joiners follow the org→system role mapping (Section 6).

**For auditors (access review)**
- ☐ Director count is small and justified.
- ☐ No shared accounts; each person has their own login.
- ☐ Governance masters and user administration are Director-only in practice.
- ☐ Failed-login and permission-denied events reviewed on the Security dashboard.
- ☐ Configuration integrity dashboard shows no FAIL.

**For HR (onboarding/offboarding)**
- ☐ Role assignment recorded at onboarding.
- ☐ Access revoked (account disabled) at offboarding.

**Sign-off:** Name ______________  Role ______________  Signature ____________  Date __________

---

*End of Role & Responsibility Matrix — OCS One Factory Ready v1.0. Documentation only; no software
was changed.*
