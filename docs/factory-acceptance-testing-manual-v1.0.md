# OCS One — Factory Acceptance Testing (FAT) Manual

| Field | Value |
|---|---|
| **Product** | OCS One — Manufacturing ERP |
| **Company** | OCS Oorja Green Pvt. Ltd. |
| **Release** | Factory Ready v1.0 |
| **Document Version** | 1.0 |
| **Date** | 01 July 2026 |
| **Status** | For Acceptance Testing & Sign-Off |
| **Audience** | Testers, QA, Supervisors, Stores, Management |

> **Documentation only.** This manual describes how to validate OCS One. It does not change any
> software, database, API, or configuration. Use it to run Factory Acceptance Testing (FAT) and
> to record results before the platform is frozen for deployment.

---

## Table of Contents

1. System Overview
2. End-to-End Process Flow
3. Module-by-Module User Guide
4. Factory Acceptance Test Cases
5. Negative Test Cases
6. Product Traceability Test
7. User Roles
8. Frequently Asked Questions
9. Factory Readiness Checklist
10. Operator Quick Reference (One Page)

---

# 1. System Overview

## 1.1 What OCS One is

OCS One is the operations control system (manufacturing ERP) for OCS Oorja Green Pvt. Ltd. It
manages the complete factory journey of energy products — from receiving raw materials and cells,
through manufacturing and quality control, to packing, dispatch, and after-sale warranty — while
keeping every serialized product fully traceable.

OCS One handles three product journeys:

- **Manufactured products** (e.g. LiFePO4 battery packs) — built on the shop floor through
  staged manufacturing.
- **Imported products** (Inbuilt Lithium Inverters, Hybrid Inverters) — finished goods received
  from suppliers and registered into the system.
- **After-sale** — customer registration, warranty, and lifecycle traceability for every unit.

## 1.2 Main modules

| Group | Modules |
|---|---|
| **Master data** | Masters, Procurement (Suppliers) |
| **Inbound** | GRN, Incoming Inspection, Inventory |
| **Manufacturing** | BOM, Production Order, Material Issue Note (MIN), Manufacturing stages, QC |
| **Products** | Product Platform, Imported Product Registration, Product Traceability |
| **Outbound** | Packing, Dispatch, Dealer Portal |
| **After-sale** | Customer Registration, Warranty |
| **Oversight** | Director Dashboard, Security Dashboard, Configuration Dashboard, Product Inventory |

## 1.3 Overall manufacturing workflow (summary)

```
Master data  →  Inbound (GRN → Inspection → Inventory)  →  Manufacturing (BOM → Order → MIN → Stages → QC)
     →  Serialized Product (at QC PASS)  →  Packing  →  Dispatch  →  Customer Registration  →  Warranty
```

Imported goods skip manufacturing and enter as serialized Products through **Imported Product
Registration** after inspection, then follow the same Packing → Dispatch → Customer → Warranty chain.

## 1.4 User roles (summary)

OCS One enforces four **system roles**: **Director, Supervisor, Operator, Viewer**. Writes are
gated by role; a Viewer can read everything but change nothing. Section 7 maps these to the
factory's organizational roles (Admin, Factory Manager, QA, Store, Sales).

## 1.5 Core design principles (why the system behaves as it does)

- **Single source of truth** — the Product Platform is the only serialized-product repository.
- **Append-only ledger** — inventory is never overwritten; it is the sum of signed transactions.
- **Configuration over hard-coding** — workflows and business rules are configurable.
- **Immutable commercial documents** — posted/approved documents cannot be edited.
- **Traceability first** — every serialized product is traceable across its whole life.

---

# 2. End-to-End Process Flow

## 2.1 Manufactured product

```
        Material Master
              │
              ▼
           Supplier
              │
              ▼
             GRN                (receive what the supplier delivered)
              │
              ▼
      Incoming Inspection       (accept / reject line-by-line)
              │
              ▼
          Inventory             (accepted stock becomes available)
              │
              ▼
        Approved BOM            (recipe of what the product needs)
              │
              ▼
       Production Order         (an order to build)
              │
              ▼
    Material Issue Note (MIN)   (issue exact BOM quantities)
              │
              ▼
        Manufacturing           (assembly → … → testing stages)
              │
              ▼
           QC PASS              (quality gate)
              │
              ▼
      Serialized Product        (official serial minted at QC PASS)
              │
              ▼
           Packing
              │
              ▼
          Dispatch              (immutable dispatch note + invoice)
              │
              ▼
    Customer Registration
              │
              ▼
          Warranty
```

## 2.2 Imported product

```
        Material Master
              │
              ▼
             GRN
              │
              ▼
      Incoming Inspection
              │
              ▼
          Inventory
              │
              ▼
  Imported Product Registration  (manual — OCS mints LIV serial, or OEM serial captured)
              │
              ▼
      Serialized Product
              │
              ▼
           Packing
              │
              ▼
          Dispatch
              │
              ▼
    Customer Registration
              │
              ▼
          Warranty
```

**Key difference:** imported products have **no** BOM, Production Order, MIN, manufacturing
stages, or QC — they are already finished. A serialized Product is created by a deliberate manual
registration step, not automatically.

---

# 3. Module-by-Module User Guide

> Each module below follows the same structure: **Purpose · Who uses it · Prerequisites · How to
> create · How to edit · Validation rules · Common mistakes · Expected result.** Insert
> screenshots in the `[Screenshot: …]` placeholders during the FAT run.

## 3.1 Masters

- **Purpose:** maintain reference data — Materials/Product Models, BMS, cells, chargers,
  connectors, cables, busbars, cabinets, plus categories and workflows.
- **Who uses it:** Director / Supervisor (create & edit); everyone (read).
- **Prerequisites:** none — masters are the starting point.
- **How to create:** open the relevant master → **New** → fill the form → **Save**.
- **How to edit:** open a record → change fields → **Save**. Use the status toggle to
  activate/deactivate (an inactive master is hidden from pick lists).
- **Validation rules:** unique code per master (duplicate is rejected); required fields enforced;
  a master that is referenced elsewhere cannot be deleted.
- **Common mistakes:** creating a master but leaving it **inactive** — it will not appear in
  dropdowns until activated; entering a duplicate code.
- **Expected result:** the record saves and (when active) appears in dropdowns across the system.
- `[Screenshot: Master list + create form]`

## 3.2 Procurement (Suppliers)

- **Purpose:** maintain the supplier master used on goods receipts.
- **Who uses it:** Director / Supervisor.
- **Prerequisites:** none.
- **How to create:** Suppliers → **New** → name & details → **Save**.
- **How to edit:** open supplier → edit → **Save**; deactivate to remove from GRN pick lists.
- **Validation rules:** unique supplier identity; required fields.
- **Common mistakes:** inactive supplier not appearing when creating a GRN.
- **Expected result:** supplier is selectable on a new GRN.
- `[Screenshot: Supplier master]`

## 3.3 GRN (Goods Receipt Note)

- **Purpose:** record what a supplier physically delivered.
- **Who uses it:** Store / Supervisor.
- **Prerequisites:** active supplier; active materials; the material's category must have an
  assigned receiving workflow.
- **How to create:** GRN → **New** → choose **one** supplier → add lines (material, quantity
  received, UOM) → **Save as draft**.
- **How to post:** open the draft → **Post**. Posting generates inventory transactions.
- **How to edit:** a **draft** GRN can be edited or deleted. A **posted** GRN is **read-only**
  (there is no edit; only view).
- **Validation rules:** exactly one supplier per GRN; each line's material category must have a
  receiving workflow assigned, otherwise posting is blocked (422) and nothing is written;
  posted GRN cannot be changed.
- **Common mistakes:** trying to put two suppliers on one GRN (use separate GRNs); posting when a
  material has no workflow assignment; expecting to edit a posted GRN.
- **Expected result:** draft posts successfully; stock appears in the correct inbound state.
- `[Screenshot: GRN header + lines + Post button]`

## 3.4 Incoming Inspection

- **Purpose:** accept or reject received goods, line by line, after a GRN is posted.
- **Who uses it:** QA / Supervisor.
- **Prerequisites:** a posted GRN with pending inspection lines.
- **How to create:** Incoming Inspection → **Eligible GRNs** → pick a posted GRN → for each line
  enter **accepted** and **rejected** quantities (and a **rejection reason** if any is rejected)
  → **Submit**.
- **How to edit:** inspection is finalized on submit and cannot be re-run for the same GRN.
- **Validation rules:** submitted lines must exactly cover all pending lines; accepted + rejected
  must equal received (both ≥ 0); rejection reason is mandatory when rejected > 0; only one
  inspection per GRN; inspection **never** changes the GRN's received quantities.
- **Common mistakes:** accepted + rejected not equal to received; omitting the rejection reason;
  trying to inspect the same GRN twice.
- **Expected result:** accepted stock moves to **available**, rejected stock to **rejected**, and
  the GRN line shows an inspection-status badge (the GRN data itself is unchanged).
- `[Screenshot: Inspection line entry]`

## 3.5 Inventory

- **Purpose:** show on-hand stock by material and state (inspection-pending, available, rejected).
- **Who uses it:** Store / Supervisor / Management (read).
- **Prerequisites:** posted GRNs and inspections generate the underlying transactions.
- **How it works:** inventory is an **append-only ledger** — stock is the running sum of signed
  transactions; nothing is ever overwritten.
- **Validation rules:** quantities are system-generated from GRN/inspection/issue actions; there
  is no manual overwrite.
- **Common mistakes:** expecting to "edit" a stock number directly — instead post the correct
  document (GRN, inspection, issue).
- **Expected result:** stock totals reconcile with the sum of all transactions.
- `[Screenshot: Stock view]`

## 3.6 BOM (Bill of Materials)

- **Purpose:** define the recipe (materials and quantities) required to build a product model.
- **Who uses it:** Supervisor / Director.
- **Prerequisites:** product model and component materials exist as masters.
- **How to create:** BOM → **New** → select model → add component lines with quantities → **Save**
  → **Approve** when ready.
- **How to edit:** a draft BOM can be edited; create a **revision** for changes. An **approved**
  BOM is read-only; obsolete it to retire it.
- **Validation rules:** approved BOM is immutable; revisioning preserves history.
- **Common mistakes:** editing an approved BOM (create a revision instead); building against an
  unapproved BOM.
- **Expected result:** an approved BOM is available for production orders and MIN.
- `[Screenshot: BOM detail + approve]`

## 3.7 Production Order

- **Purpose:** authorize and track the build of a product through manufacturing stages.
- **Who uses it:** Supervisor / Operator.
- **Prerequisites:** approved BOM; required inventory available.
- **How to create:** Production → **New Order** → choose model/BOM/quantity → **Save**; then move
  it through its stage lifecycle (cell allocation → assembly → compression → BMS install → BMS
  programming → charging → testing → QC → packing).
- **How to edit:** an order in **Draft / Released / In Progress** (which includes QC inspection)
  can be edited. Once **Completed** or **Cancelled**, the order is **read-only**.
- **Validation rules:** editing a completed or cancelled order is blocked (422); the guard is
  enforced on the server inside a locked transaction, so concurrent edits are safe.
- **Common mistakes:** trying to change an order after it is completed/cancelled.
- **Expected result:** the order progresses stage by stage; a Product is minted at QC PASS.
- `[Screenshot: Production order + stage cards]`

## 3.8 Material Issue Note (MIN)

- **Purpose:** issue materials from inventory to a production order per the approved BOM.
- **Who uses it:** Store / Supervisor.
- **Prerequisites:** approved BOM; sufficient available inventory.
- **How to create:** MIN → select the order → issue the listed materials → **Confirm**.
- **How to edit:** a posted MIN is a committed inventory movement and is not edited.
- **Validation rules:** the issued quantity must **exactly** equal the approved BOM quantity — no
  partial (short) and no over-issue; a mismatch is rejected (422).
- **Common mistakes:** trying to issue a partial quantity or more than the BOM requires.
- **Expected result:** the exact BOM quantities are consumed from inventory and recorded.
- `[Screenshot: MIN issue screen]`

## 3.9 QC (Quality Control)

- **Purpose:** the pass/reject quality gate at the end of manufacturing.
- **Who uses it:** QA / Supervisor.
- **Prerequisites:** order has reached the QC stage.
- **How to use:** open the QC stage card → review captured data → **Approve** (pass) or **Reject**.
- **Validation rules:** on QC **PASS**, a serialized Product is created automatically (single
  source of truth); on reject, the order does not produce a product.
- **Common mistakes:** expecting a Product before QC PASS — Products are only minted at QC PASS.
- **Expected result:** a QC-passed order yields exactly one serialized Product with an official
  serial and genealogy.
- `[Screenshot: QC approval card]`

## 3.10 Imported Product Registration

- **Purpose:** register imported finished goods (Inbuilt Lithium & Hybrid inverters) as
  serialized Products — no manufacturing involved.
- **Who uses it:** Supervisor / Director.
- **Prerequisites:** the goods have been received (GRN) and inspected (recommended); a product
  model in an importable category exists.
- **How to create:** Imported Product Registration → choose a model → then:
  - **Inbuilt Lithium Inverter** → OCS mints the official serial (`LIV-YYYYMMDD-NNNNNN`); supply
    a **quantity**.
  - **Hybrid Inverter** → enter the manufacturer's **OEM serials** (one Product per serial).
  - Optionally link the source GRN for traceability.
- **How to edit:** created Products follow the Product lifecycle; the registration itself is a
  one-time minting action.
- **Validation rules:** serial provenance is decided by the model's **category** (not its name);
  duplicate OEM serials are rejected (both within the request and against the database).
- **Common mistakes:** expecting Products to appear automatically after inspection — creation is
  **manual by design**; entering a duplicate OEM serial.
- **Expected result:** serialized Products are created at a ready-to-fulfill state and flow into
  Packing → Dispatch → Customer → Warranty like manufactured units.
- `[Screenshot: Imported registration (quantity vs OEM-serial mode)]`

## 3.11 Packing

- **Purpose:** mark QC-passed / imported products as packed for dispatch.
- **Who uses it:** Store / Supervisor.
- **Prerequisites:** products in **ready-for-packing** state.
- **How to create:** Packing → select eligible products → **Pack**.
- **Validation rules:** all selected products must be ready-for-packing; otherwise the batch is
  rejected (422) naming the offenders and nothing is packed (all-or-nothing).
- **Common mistakes:** selecting a product that is not ready for packing.
- **Expected result:** products move to **packed** with an immutable packed event.
- `[Screenshot: Packing queue]`

## 3.12 Dispatch

- **Purpose:** issue an immutable dispatch document sending packed products to a dealer.
- **Who uses it:** Store / Supervisor.
- **Prerequisites:** packed products; an active dealer.
- **How to create:** Dispatch → choose dealer → add packed products → enter **invoice number** →
  **Dispatch**. The dispatch number (`DIS-YYYYMMDD-NNNNNN`) is generated by the system.
- **How to reverse:** Dispatch → open the dispatch → **Reverse** with a **mandatory reason**
  (only one reversal per dispatch). Reversal returns products to **packed** and clears the dealer.
- **Validation rules:** dealer must exist (404 if not) and be active (422 if inactive); invoice
  number must be globally unique (409 if duplicate); all products must be packed; the dispatch
  number is never client-supplied; a dispatch can only be reversed once.
- **Common mistakes:** reusing an invoice number; dispatching an inactive dealer; dispatching
  unpacked products.
- **Expected result:** products move to **dispatched**, assigned to the dealer, with a printable
  Dispatch Note.
- `[Screenshot: Dispatch note]`

## 3.13 Customer Registration

- **Purpose:** record the customer/owner of a serialized product.
- **Who uses it:** Sales / Supervisor.
- **Prerequisites:** a serialized product exists (ideally dispatched).
- **How to create:** Customer Registration → enter customer details → link the product serial →
  **Save**.
- **Validation rules:** registration is keyed to the official serial; duplicate registration of
  the same unit is prevented.
- **Common mistakes:** registering the same serial twice; registering an unknown serial.
- **Expected result:** the customer is linked to the product and available for warranty.
- `[Screenshot: Customer registration]`

## 3.14 Warranty

- **Purpose:** manage per-serial warranty and warranty-service handling.
- **Who uses it:** Sales / QA / Supervisor.
- **Prerequisites:** a registered product/customer.
- **How to create:** Warranty → select the product serial → activate/record warranty; the term
  derives from the model's warranty period.
- **Validation rules:** warranty is per official serial; service records attach to that serial.
- **Common mistakes:** expecting warranty on an unregistered unit.
- **Expected result:** warranty status and service history are visible per serial.
- `[Screenshot: Warranty record]`

## 3.15 Product Traceability

- **Purpose:** view the complete lifecycle of any serialized product.
- **Who uses it:** everyone (read).
- **Prerequisites:** a serialized product.
- **How to use:** search by serial number → view genealogy (components) and the event timeline
  (created → packed → dispatched → registered → warranty).
- **Validation rules:** read-only projection over the Product Platform.
- **Common mistakes:** searching a component serial instead of the official product serial.
- **Expected result:** the full history is visible end to end for the serial.
- `[Screenshot: Traceability timeline]`

---

# 4. Factory Acceptance Test Cases

> For each test: perform the steps, compare to the expected result, tick **Pass** or **Fail**,
> and record remarks. Print this section for the FAT session.

### TC-01 · Masters — Create a material
- **Objective:** a material master can be created and used.
- **Steps:** Masters → New material → fill code/name → Save → activate.
- **Expected:** saves; appears active in dropdowns.
- **Pass ☐   Fail ☐   Remarks: ______________________**

### TC-02 · Procurement — Create a supplier
- **Objective:** supplier available for GRN.
- **Steps:** Suppliers → New → Save → activate.
- **Expected:** supplier selectable on a new GRN.
- **Pass ☐   Fail ☐   Remarks: ______________________**

### TC-03 · GRN — Create & post
- **Objective:** receive goods and generate inventory.
- **Steps:** GRN → New → one supplier → lines → Save draft → Post.
- **Expected:** posts; stock in inbound state; posted GRN is read-only.
- **Pass ☐   Fail ☐   Remarks: ______________________**

### TC-04 · Incoming Inspection — Accept/reject
- **Objective:** inspect a posted GRN line by line.
- **Steps:** Inspection → eligible GRN → enter accepted/rejected (+reason) → Submit.
- **Expected:** accepted→available, rejected→rejected; GRN quantities unchanged.
- **Pass ☐   Fail ☐   Remarks: ______________________**

### TC-05 · Inventory — Stock reconciles
- **Objective:** stock equals the sum of transactions.
- **Steps:** open Stock after TC-03/04.
- **Expected:** available quantity equals accepted quantity.
- **Pass ☐   Fail ☐   Remarks: ______________________**

### TC-06 · BOM — Create & approve
- **Objective:** define and approve a recipe.
- **Steps:** BOM → New → add lines → Save → Approve.
- **Expected:** approved BOM is available and read-only.
- **Pass ☐   Fail ☐   Remarks: ______________________**

### TC-07 · Production Order — Create & progress
- **Objective:** build order runs through stages.
- **Steps:** Production → New order → progress stages.
- **Expected:** stages advance; order reaches QC.
- **Pass ☐   Fail ☐   Remarks: ______________________**

### TC-08 · MIN — Exact issue
- **Objective:** issue exact BOM quantities.
- **Steps:** MIN → select order → issue exact BOM quantities → Confirm.
- **Expected:** inventory consumed exactly; issue recorded.
- **Pass ☐   Fail ☐   Remarks: ______________________**

### TC-09 · QC — Pass creates Product
- **Objective:** QC PASS mints a serialized Product.
- **Steps:** QC stage → Approve.
- **Expected:** one serialized Product with official serial + genealogy.
- **Pass ☐   Fail ☐   Remarks: ______________________**

### TC-10 · Imported — Lithium (OCS serial)
- **Objective:** OCS mints serial for Inbuilt Lithium Inverter.
- **Steps:** Imported Registration → Lithium model → quantity → Save.
- **Expected:** Products created with `LIV-…` serials.
- **Pass ☐   Fail ☐   Remarks: ______________________**

### TC-11 · Imported — Hybrid (OEM serial)
- **Objective:** capture OEM serials for Hybrid Inverter.
- **Steps:** Imported Registration → Hybrid model → enter OEM serials → Save.
- **Expected:** one Product per OEM serial.
- **Pass ☐   Fail ☐   Remarks: ______________________**

### TC-12 · Packing
- **Objective:** pack eligible products.
- **Steps:** Packing → select ready products → Pack.
- **Expected:** status → packed; packed event recorded.
- **Pass ☐   Fail ☐   Remarks: ______________________**

### TC-13 · Dispatch
- **Objective:** dispatch to a dealer with an invoice.
- **Steps:** Dispatch → active dealer → packed products → invoice → Dispatch.
- **Expected:** system dispatch number; status → dispatched; printable note.
- **Pass ☐   Fail ☐   Remarks: ______________________**

### TC-14 · Dispatch reversal
- **Objective:** reverse a dispatch with a reason.
- **Steps:** open dispatch → Reverse → enter reason.
- **Expected:** products → packed; dealer cleared; one reversal only.
- **Pass ☐   Fail ☐   Remarks: ______________________**

### TC-15 · Customer Registration
- **Objective:** register the owner of a serial.
- **Steps:** Customer Registration → details → link serial → Save.
- **Expected:** customer linked to product.
- **Pass ☐   Fail ☐   Remarks: ______________________**

### TC-16 · Warranty
- **Objective:** activate/record warranty for a serial.
- **Steps:** Warranty → select serial → activate.
- **Expected:** warranty status visible per serial.
- **Pass ☐   Fail ☐   Remarks: ______________________**

### TC-17 · Product Traceability
- **Objective:** full lifecycle visible by serial.
- **Steps:** Traceability → search serial.
- **Expected:** genealogy + full event timeline shown.
- **Pass ☐   Fail ☐   Remarks: ______________________**

---

# 5. Negative Test Cases

> These verify that the system **prevents** invalid actions. Expected result for all: **the
> action is blocked with a clear message; no data is changed.**

### NT-01 · Duplicate OEM serial
- **Steps:** register a Hybrid Inverter using an OEM serial that already exists.
- **Expected:** rejected (duplicate serial). **Pass ☐  Fail ☐  Remarks: __________**

### NT-02 · Duplicate material / master code
- **Steps:** create a master with an existing code.
- **Expected:** rejected (duplicate code). **Pass ☐  Fail ☐  Remarks: __________**

### NT-03 · Insufficient inventory
- **Steps:** attempt to issue/consume more than is available.
- **Expected:** blocked; no negative stock. **Pass ☐  Fail ☐  Remarks: __________**

### NT-04 · Invalid dispatch (bad dealer / duplicate invoice / unpacked)
- **Steps:** dispatch to an inactive dealer, reuse an invoice number, or dispatch unpacked units.
- **Expected:** blocked (inactive dealer, duplicate invoice, or not-packed). **Pass ☐  Fail ☐  Remarks: __________**

### NT-05 · Edit a completed Production Order
- **Steps:** open a completed/cancelled order and attempt to change it.
- **Expected:** blocked (read-only). **Pass ☐  Fail ☐  Remarks: __________**

### NT-06 · Duplicate customer registration
- **Steps:** register the same serial to a customer twice.
- **Expected:** blocked (already registered). **Pass ☐  Fail ☐  Remarks: __________**

### NT-07 · Invalid BOM (edit approved / build without approval)
- **Steps:** edit an approved BOM, or run production against an unapproved BOM.
- **Expected:** approved BOM immutable; production requires an approved BOM. **Pass ☐  Fail ☐  Remarks: __________**

### NT-08 · Partial material issue
- **Steps:** issue less or more than the approved BOM quantity in a MIN.
- **Expected:** blocked (must be exact). **Pass ☐  Fail ☐  Remarks: __________**

### NT-09 · Post GRN with unassigned workflow
- **Steps:** post a GRN whose material category has no receiving workflow.
- **Expected:** blocked (422), naming the material; nothing posted. **Pass ☐  Fail ☐  Remarks: __________**

### NT-10 · Re-inspect a GRN
- **Steps:** submit a second inspection for an already-inspected GRN.
- **Expected:** blocked (already inspected). **Pass ☐  Fail ☐  Remarks: __________**

### NT-11 · Edit a posted GRN
- **Steps:** attempt to edit/delete a posted GRN.
- **Expected:** blocked (posted GRN is read-only; delete only allowed on drafts). **Pass ☐  Fail ☐  Remarks: __________**

### NT-12 · Viewer attempts a write
- **Steps:** log in as a Viewer and attempt any create/edit.
- **Expected:** blocked (read-only role). **Pass ☐  Fail ☐  Remarks: __________**

---

# 6. Product Traceability Test

**Objective:** prove that any serialized product's complete lifecycle is visible.

**Steps:**
1. Pick a product that has been through the full chain (built or imported → packed → dispatched →
   customer-registered → warranty).
2. Go to **Product Traceability** and search by its **official serial number**.
3. Verify the following are all visible:
   - Product identity and official serial.
   - Genealogy (components / source, e.g. cells or source GRN).
   - Event timeline: created → packed → dispatched (with dispatch/invoice) → customer registered
     → warranty.

**Expected result:** the full, unbroken lifecycle is shown for the serial, with no missing steps.

**Pass ☐   Fail ☐   Remarks: ______________________**

---

# 7. User Roles

## 7.1 System roles (enforced by the software)

| System role | Can do |
|---|---|
| **Director** | Everything — all reads and all writes across all modules; user management; dashboards. |
| **Supervisor** | Most operational writes — masters, GRN, inspection, BOM, production, MIN, imported registration, packing, dispatch (incl. reversal with reason), customer, warranty. |
| **Operator** | Shop-floor operations — run production stages and data capture; day-to-day operational actions permitted for the role. |
| **Viewer** | Read-only everywhere — can view all data but cannot create, edit, or delete. |

> Writes are gated per endpoint by role; a Viewer passing authentication still cannot write.
> Director is included in every write permission set.

## 7.2 Mapping factory/organizational roles to system roles

| Organizational role | Maps to system role | Notes |
|---|---|---|
| **Admin** | Director | The seed administrator account has the Director role. |
| **Director** | Director | Full authority + oversight dashboards. |
| **Factory Manager** | Supervisor (or Director) | Assign Director if plant-wide oversight is needed. |
| **Supervisor** | Supervisor | Line/shift operational authority. |
| **QA** | Supervisor | For inspection & QC actions (or Operator for capture-only). |
| **Store** | Supervisor / Operator | GRN, MIN, packing, dispatch, depending on authority granted. |
| **Sales** | Supervisor / Viewer | Customer registration & warranty (Supervisor) or read-only (Viewer). |

> The factory decides which organizational role receives which system role. Grant the **lowest**
> role that lets a person do their job (least privilege).

---

# 8. Frequently Asked Questions

**Q: Why can't I edit a completed Production Order?**
A: A completed (or cancelled) order is a finalized record. Like a posted GRN, an approved BOM, or a
posted MIN, it is locked to protect the integrity of what actually happened. Draft, Released, and
In Progress orders remain editable.

**Q: Why can't I issue partial material?**
A: A Material Issue Note must match the approved BOM exactly — no short or over issue. This keeps
inventory accurate and the build consistent with its approved recipe.

**Q: Why is the Product created only after QC PASS?**
A: A serialized Product represents a unit that has passed quality and can leave the factory.
Creating it only at QC PASS guarantees every serial in the system is a genuine, quality-approved
unit — the Product Platform is the single source of truth.

**Q: Why is Imported Product Registration manual?**
A: Passing incoming inspection means the inventory is *acceptable* — it does not automatically mean
finished serialized products should exist. The operator decides when to mint imported Products, so
serialization, review, and inventory control stay under factory supervision.

**Q: Why can't I edit stock numbers directly?**
A: Inventory is an append-only ledger; the on-hand figure is the sum of all transactions. To change
stock, post the correct document (GRN, inspection, or issue) — never an overwrite.

**Q: Why does a posted GRN show an inspection summary but the received quantity never changes?**
A: The GRN records what the supplier **delivered**; the inspection records what OCS **accepted**.
They are separate documents — inspection never rewrites the GRN.

**Q: Why can a dispatch be reversed only once, and why is a reason required?**
A: A dispatch is a commercial document. A single, reason-stamped reversal keeps a clean, auditable
history rather than repeated silent edits.

---

# 9. Factory Readiness Checklist (printable)

> Management sign-off checklist. Tick each item after the corresponding tests pass.

**Master data**
- ☐ Materials / models created and active
- ☐ Suppliers created and active
- ☐ Dealers created and active
- ☐ BOMs approved for all products to be built

**Inbound**
- ☐ GRN create & post verified
- ☐ Incoming inspection accept/reject verified
- ☐ Inventory reconciles with transactions

**Manufacturing**
- ☐ Production order lifecycle verified
- ☐ MIN exact-issue verified
- ☐ QC PASS mints a serialized Product

**Imported goods**
- ☐ Lithium (OCS serial) registration verified
- ☐ Hybrid (OEM serial) registration verified

**Outbound**
- ☐ Packing verified
- ☐ Dispatch + note + unique invoice verified
- ☐ Dispatch reversal verified

**After-sale**
- ☐ Customer registration verified
- ☐ Warranty verified

**Traceability & controls**
- ☐ Full lifecycle traceable by serial
- ☐ Negative tests (Section 5) all blocked as expected
- ☐ Role permissions verified (Viewer cannot write)

**Governance**
- ☐ No blocking defects open
- ☐ Configuration integrity check GREEN
- ☐ Sign-off document (`factory-ready-v1.0-signoff.md`) approved

**Approved for deployment:** Name ______________  Signature ____________  Date __________

---

# 10. Operator Quick Reference (One Page)

> Print/laminate this page for the shop floor. See the separate **Operator User Manual** for
> step-by-step detail.

**Daily workflow**
1. Receive goods → **GRN** (one supplier) → **Post**.
2. **Incoming Inspection** → accept/reject each line (+reason if rejected).
3. Build: **Production Order** → **MIN** (exact BOM) → run stages → **QC**.
4. QC **PASS** → serialized Product is created automatically.
5. Imported goods → **Imported Product Registration** (Lithium=quantity, Hybrid=OEM serials).
6. **Packing** → **Dispatch** (dealer + unique invoice).
7. **Customer Registration** → **Warranty**.

**Common actions**
- Find a unit's history → **Product Traceability** → search official serial.
- Wrong dispatch → open it → **Reverse** (reason required, once only).

**Common errors (and why)**
- "Read-only" on an order → it is Completed/Cancelled.
- MIN rejected → quantity must match the BOM exactly.
- GRN won't post → material category has no receiving workflow assigned.
- Duplicate invoice / OEM serial / material code → must be unique.
- Dropdown empty → the master is inactive; activate it.

**Contact points**
- System / access issues: ____________________
- Inventory / stores: ____________________
- QA / quality: ____________________
- Supervisor on shift: ____________________

---

*End of Factory Acceptance Testing Manual — OCS One Factory Ready v1.0. Documentation only; no
software was changed.*
