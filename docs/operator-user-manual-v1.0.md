# OCS One — Operator User Manual

| Field | Value |
|---|---|
| **Product** | OCS One — Manufacturing ERP |
| **Company** | OCS Oorja Green Pvt. Ltd. |
| **Release** | Factory Ready v1.0 |
| **Document Version** | 1.0 |
| **Date** | 01 July 2026 |
| **Audience** | Factory operators, stores, QA, supervisors, sales |

> A short, step-by-step guide for everyday use on the factory floor. For full test cases and
> validation detail, see the **Factory Acceptance Testing (FAT) Manual**. This is a documentation
> guide only — it does not change the software.

---

## Contents

1. Getting Started
2. The Daily Flow at a Glance
3. Receiving Goods (GRN)
4. Incoming Inspection
5. Checking Inventory
6. Building a Product (Production)
7. Issuing Materials (MIN)
8. Quality Control (QC)
9. Registering Imported Products
10. Packing
11. Dispatch
12. Customer Registration
13. Warranty
14. Finding a Product's History (Traceability)
15. Common Errors & What to Do
16. Do's and Don'ts
17. Quick Reference Card

---

# 1. Getting Started

1. Open OCS One in your browser.
2. Log in with the email and password given to you by your administrator.
3. You will see a menu of modules on the side. You only need the ones for your job.
4. If a module or button is missing, your role may not allow that action — ask your supervisor.

**Tip:** If a dropdown is empty, the item you need is probably **inactive**. Ask a supervisor to
activate it (a master must be active to appear in lists).

---

# 2. The Daily Flow at a Glance

```
Receive goods (GRN)  →  Inspect (accept/reject)  →  Stock available
        │
        ▼
Build order  →  Issue materials (MIN, exact)  →  Run stages  →  QC PASS  →  Product created
        │                                                                      │
Imported goods → Register imported product ─────────────────────────────────► │
                                                                               ▼
                                                            Packing  →  Dispatch  →  Customer  →  Warranty
```

Follow the arrows. Each step unlocks the next.

---

# 3. Receiving Goods (GRN)

**Use this when a supplier delivers materials.**

1. Go to **GRN → New**.
2. Select **one supplier** (one GRN = one supplier).
3. Add each material with the **quantity received** and unit.
4. Click **Save** (this is a draft — you can still change it).
5. When correct, click **Post**.

✅ **Result:** stock is recorded and waiting for inspection.
⚠️ After you **Post**, the GRN is locked (read-only). Double-check before posting.

---

# 4. Incoming Inspection

**Use this after a GRN is posted, to accept or reject the goods.**

1. Go to **Incoming Inspection → Eligible GRNs**.
2. Pick the posted GRN.
3. For **each line**, enter **Accepted** and **Rejected** quantities.
   - Accepted + Rejected must equal the received quantity.
   - If you reject anything, you **must** type a **reason**.
4. Click **Submit**.

✅ **Result:** accepted goods become **available** stock; rejected goods go to **rejected**.
⚠️ You can inspect a GRN only **once**. Inspection never changes the received quantity.

---

# 5. Checking Inventory

1. Go to **Inventory / Stock**.
2. See on-hand quantity by material and state (pending, available, rejected).

You cannot type a stock number directly — stock always comes from documents (GRN, inspection,
issue). If a number looks wrong, check the documents behind it.

---

# 6. Building a Product (Production)

1. Go to **Production → New Order**.
2. Choose the model, its **approved BOM**, and quantity. Save.
3. Move the order through its stages using the stage cards:
   cell allocation → assembly → compression → BMS install → BMS programming → charging → testing → QC.
4. On each stage card use **Start / Pause / Resume / Complete** and capture the required data.

⚠️ Once an order is **Completed** or **Cancelled**, it is locked and cannot be edited.

---

# 7. Issuing Materials (MIN)

**Use this to take materials from stock for an order.**

1. Go to **Material Issue Note (MIN)**.
2. Select the production order.
3. Issue the materials — the quantity must **exactly** match the approved BOM.
4. Confirm.

✅ **Result:** the exact quantities are consumed from stock.
⚠️ You cannot issue **less** or **more** than the BOM. If it is rejected, check your quantities.

---

# 8. Quality Control (QC)

1. Open the order's **QC** stage card.
2. Review the captured data.
3. Click **Approve** (pass) or **Reject**.

✅ **On PASS:** a serialized **Product** is created automatically, with its official serial number.
ℹ️ A Product exists **only after QC PASS** — never before.

---

# 9. Registering Imported Products

**Use this for finished inverters that arrive from a supplier (no manufacturing).**

1. Go to **Imported Product Registration**.
2. Choose the product model.
3. Then:
   - **Inbuilt Lithium Inverter** → enter a **quantity**; OCS creates serials (`LIV-…`).
   - **Hybrid Inverter** → enter the manufacturer's **OEM serial numbers** (one per unit).
4. (Optional) link the GRN the goods came in on.
5. Save.

✅ **Result:** serialized Products are created, ready for Packing.
ℹ️ This step is **manual on purpose** — you decide when to create imported Products.
⚠️ OEM serial numbers must be **unique** (no duplicates).

---

# 10. Packing

1. Go to **Packing**.
2. Select the products that are **ready for packing**.
3. Click **Pack**.

✅ **Result:** products are marked **packed**.
⚠️ If any selected product is not ready, the whole batch is refused — remove it and try again.

---

# 11. Dispatch

1. Go to **Dispatch**.
2. Choose the **dealer** (must be active).
3. Add the **packed** products.
4. Enter the **invoice number** (must be unique).
5. Click **Dispatch**. The system creates the dispatch number automatically.
6. Print the **Dispatch Note**.

**To undo a dispatch:** open it → **Reverse** → type a **reason**. This can be done **once** only,
and returns the products to **packed**.

⚠️ Common blocks: inactive dealer, a reused invoice number, or unpacked products.

---

# 12. Customer Registration

1. Go to **Customer Registration**.
2. Enter the customer's details.
3. Link the product's **serial number**.
4. Save.

⚠️ A serial can be registered only once.

---

# 13. Warranty

1. Go to **Warranty**.
2. Select the product **serial**.
3. Activate / record the warranty. The period comes from the product model.

Service records for a unit attach to the same serial.

---

# 14. Finding a Product's History (Traceability)

1. Go to **Product Traceability**.
2. Search by the **official serial number**.
3. See the full history: created → packed → dispatched → registered → warranty, plus its
   components/source.

⚠️ Search the **product** serial, not a component serial.

---

# 15. Common Errors & What to Do

| Message / problem | What it means | What to do |
|---|---|---|
| "Read-only" on an order | Order is Completed or Cancelled | Create a new order; finalized ones can't change |
| MIN rejected | Quantity doesn't match the BOM | Issue the exact BOM quantity |
| GRN won't post | Material's category has no receiving workflow | Ask a supervisor to assign the workflow |
| Duplicate invoice / serial / code | The value already exists | Use a unique value |
| Dealer can't be selected | Dealer is inactive or missing | Activate/create the dealer |
| Dropdown is empty | The master is inactive | Ask a supervisor to activate it |
| Can't inspect a GRN | It was already inspected | Inspection happens once per GRN |
| Can't edit a posted GRN | Posted GRNs are locked | Only drafts can be edited/deleted |
| Button/module missing | Your role can't do that action | Ask your supervisor |

---

# 16. Do's and Don'ts

**Do**
- Double-check a GRN before posting (posting locks it).
- Enter a reason when you reject goods or reverse a dispatch.
- Issue materials exactly per the BOM.
- Use the official serial number when searching history.

**Don't**
- Don't try to edit stock numbers directly — use documents.
- Don't put two suppliers on one GRN — make separate GRNs.
- Don't expect a Product before QC PASS.
- Don't reuse invoice numbers or OEM serials.

---

# 17. Quick Reference Card

> Print/laminate for your station.

**Daily flow:** GRN → Inspect → (Build: Order → MIN → Stages → QC PASS) / (Import: Register) →
Pack → Dispatch → Customer → Warranty.

**Golden rules**
- One GRN = one supplier.
- Inspect once; accepted + rejected = received.
- MIN = exact BOM quantity.
- Product is created at **QC PASS** only.
- Imported registration is manual.
- Invoice, OEM serial, and codes must be unique.
- Completed/cancelled orders and posted GRNs are locked.

**If stuck:** note the exact message, then ask your supervisor.

**Contacts:** Access ____________ · Stores ____________ · QA ____________ · Supervisor ____________

---

*End of Operator User Manual — OCS One Factory Ready v1.0. Documentation only; no software was
changed.*
