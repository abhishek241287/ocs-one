# OCS One — Quick Start Guide

| | |
|---|---|
| **Product** | OCS One — Manufacturing ERP |
| **Company** | OCS Oorja Green Pvt. Ltd. |
| **Release** | Factory Ready v1.0 |
| **Version** | 1.0 · 01 July 2026 |
| **Read time** | ~10 minutes |

> New here? Read this first. For step-by-step task detail see the **Operator User Manual**; for
> testing see the **FAT Manual**. Documentation only — nothing here changes the software.

---

## Page 1 — Login, Navigation & Roles

### Login
1. Open OCS One in your browser.
2. Enter the **email** and **password** your administrator gave you.
3. Click **Sign in**.

If you can't log in, contact your administrator (see Page 4). Never share your password.

### Navigation
- The **side menu** lists the modules. You'll only use the ones for your job.
- Modules follow the factory flow, top to bottom: receiving → inventory → manufacturing →
  products → dispatch → after-sale.
- **Search by serial number** in **Product Traceability** to find any unit's full history.
- If a button or module is missing, your **role** doesn't allow that action — ask your supervisor.

### Roles (what you can do)
OCS One has four roles:

| Role | What you can do |
|---|---|
| **Director** | Everything, plus dashboards and user management (the Admin account is a Director). |
| **Supervisor** | Most day-to-day actions — receiving, inspection, production, dispatch, after-sale. |
| **Operator** | Shop-floor work — run production stages and capture data. |
| **Viewer** | Read-only — can look at everything, change nothing. |

Your organizational title (Factory Manager, QA, Store, Sales…) is mapped to one of these by your
administrator. You always get the **lowest** role that lets you do your job.

---

## Page 2 — Daily Workflow

Follow the arrows — each step unlocks the next.

```
Receive goods (GRN)  →  Inspect (accept/reject)  →  Stock available
        │
        ├─ Build:  Production Order → Issue materials (MIN, exact) → Run stages → QC PASS → Product
        │
        └─ Import: Imported Product Registration → Product
                                                     │
                                                     ▼
                                    Packing → Dispatch → Customer Registration → Warranty
```

**The seven everyday steps**
1. **GRN** — record what a supplier delivered (one supplier per GRN), then **Post**.
2. **Incoming Inspection** — accept/reject each line; add a reason for any rejection.
3. **Production Order** — start a build against an approved BOM, then run the stage cards.
4. **Material Issue Note (MIN)** — issue the **exact** BOM quantities.
5. **QC** — Approve to pass; a serialized **Product** is created automatically at PASS.
   - *Imported goods:* skip 3–5, use **Imported Product Registration** instead.
6. **Packing** → **Dispatch** — pack ready units, then dispatch to a dealer with a unique invoice.
7. **Customer Registration** → **Warranty** — register the owner and activate warranty.

**Remember**
- A Product exists **only after QC PASS**.
- MIN must match the BOM **exactly** — no partial, no over-issue.
- Posted GRNs and completed orders are **locked**.

---

## Page 3 — Common Errors

| What you see | Why | What to do |
|---|---|---|
| "Read-only" on an order | It's Completed or Cancelled | Start a new order — finalized ones can't change |
| MIN rejected | Quantity ≠ the BOM | Issue the exact BOM quantity |
| GRN won't post | Material's category has no receiving workflow | Ask a supervisor to assign it |
| Duplicate invoice / serial / code | The value already exists | Use a unique value |
| Dealer can't be selected | Dealer is inactive or missing | Ask a supervisor to activate/create it |
| Dropdown is empty | The item (master) is inactive | Ask a supervisor to activate it |
| Can't inspect a GRN | It was already inspected | Inspection happens once per GRN |
| Can't edit a posted GRN | Posted GRNs are locked | Only drafts can be edited |
| Button / module missing | Your role can't do it | Ask your supervisor |

**Golden rule:** if something is blocked, note the **exact message**, then ask your supervisor —
the system blocks actions to protect data, not to slow you down.

---

## Page 4 — Who to Contact

| Need help with… | Contact | Details |
|---|---|---|
| Login / password / access | System Administrator | ____________________ |
| Goods, stock, GRN, dispatch | Stores In-charge | ____________________ |
| Quality, inspection, QC | QA Lead | ____________________ |
| Production / stage questions | Shift Supervisor | ____________________ |
| Customer / warranty | Sales | ____________________ |
| Anything else | Your Supervisor | ____________________ |

**Reference documents**
- **Operator User Manual** — detailed step-by-step for every task.
- **Factory Acceptance Testing (FAT) Manual** — full test cases and validation rules.

---

*OCS One Quick Start Guide — Factory Ready v1.0. Documentation only; no software was changed.*
