# OCS ONE — FAT Blocker Patches
# Consolidated Remediation Guide
# Date: 2026-08-08
# Base: Commit ebf7a3b
# Source: Independent Architecture Review Verification Report

---

## How to Use This File

1. Apply patches in the order listed below (schema changes first, then routes, then frontend).
2. Each patch includes: File path, Problem, Before/After code, and Acceptance Criteria.
3. Run migrations after schema changes.
4. Run the full test suite + load tests after all patches are applied.

---

# ============================================================
# BLOCKER 1 — C1: Dealer Data Cross-Contamination
# ============================================================
# Risk: CRITICAL
# Files: middleware/auth.ts, routes/dealers/index.ts
# Problem: JWT payload carries no dealerId. Dealer endpoints have no
#          ownership predicate. Any authenticated factory user reads
#          any dealer's data.
# ============================================================

---
## PATCH 1A — middleware/auth.ts
## Add dealerId to JWT payload
---

// Find the token payload construction (around lines 21-28).
// BEFORE:
const tokenPayload = {
  userId: user.id,
  email: user.email,
  role: user.role,
};

// AFTER:
const tokenPayload = {
  userId: user.id,
  email: user.email,
  role: user.role,
  dealerId: user.dealerId ?? null,  // null for factory roles
};

// Ensure the JWT signing call includes this payload unchanged.

---
## PATCH 1B — routes/dealers/index.ts
## Add ownership scoping to dealer endpoints
---

import { requireAuth } from "@/middleware/auth";

// --- GET /dealers/:dealerId/inventory (around line 41-42) ---
router.get("/:dealerId/inventory", requireAuth, async (req, res, next) => {
  const { dealerId } = req.params;

  // ADD ownership guard:
  if (req.user.role === "dealer" && req.user.dealerId !== dealerId) {
    return res.status(403).json({ error: "Access denied: not your dealership" });
  }
  // director / owner / supervisor can read any dealer — no block

  // ... existing query logic below ...
});

// --- GET /dealers/:dealerId/dispatch-history (around line 82-83) ---
router.get("/:dealerId/dispatch-history", requireAuth, async (req, res, next) => {
  const { dealerId } = req.params;

  // ADD ownership guard:
  if (req.user.role === "dealer" && req.user.dealerId !== dealerId) {
    return res.status(403).json({ error: "Access denied: not your dealership" });
  }

  // ... existing query logic below ...
});

---
## ACCEPTANCE CRITERIA — BLOCKER 1
---

[ ] Dealer-role user with dealerId="DLR-001" gets 403 on GET /dealers/DLR-002/inventory
[ ] Director / supervisor / owner can still read any dealer's data
[ ] authz certification suite passes with CERT_AUTHZ_CHECK=1
[ ] JWT payload decoded at client contains dealerId field

---

# ============================================================
# BLOCKER 2 — C2: Dual Dispatch Systems
# ============================================================
# Risk: CRITICAL
# Files: routes/logistics/dispatch-orders.ts, Sidebar.tsx,
#        routes/dispatch/index.ts
# Problem: Two active routes mint DIS-* numbers differently
#          (DB sequence vs count+1). Legacy path allows arbitrary
#          status transitions. Reports query different tables.
# ============================================================

---
## PATCH 2A — routes/logistics/dispatch-orders.ts
## Freeze legacy dispatch behind owner-only guard
---

import { requireRole } from "@/middleware/auth";

// At the top of the router file (around line 15-18)
const router = express.Router();

// ADD: Freeze legacy dispatch behind owner-only guard
router.use(requireRole("owner"));

// ... rest of existing routes remain unchanged for data history ...

---
## PATCH 2B — Sidebar.tsx
## Remove legacy dispatch from operator sidebar
---

// Around line 114-122 — in the sidebar navigation tree

// BEFORE (example):
// <SidebarLink to="/logistics/dispatch-orders">Dispatch Orders</SidebarLink>

// AFTER:
{user.role === "owner" && (
  <SidebarLink to="/logistics/dispatch-orders">Legacy Dispatch (Admin Only)</SidebarLink>
)}

// The main "Dispatch" link (new path) remains visible to all relevant roles.

---
## PATCH 2C — routes/dispatch/index.ts
## Document authoritative numbering (no code change required)
---

// Around line 295-299 — this already uses nextval('dispatch_seq')
// Add a prominent comment to prevent future developers from introducing
// a second numbering authority:

// ============================================================
// AUTHORITATIVE DISPATCH NUMBERING
// This is the ONLY dispatch numbering authority in the system.
// Do NOT introduce a second numbering scheme.
// Legacy /logistics/dispatch-orders is frozen and owner-guarded.
// ============================================================
const dispatchNumber = `DIS-${formatDate(new Date())}-${String(
  await db.execute(sql`nextval('dispatch_seq')`)
).padStart(6, '0')}`;

---
## ACCEPTANCE CRITERIA — BLOCKER 2
---

[ ] Operator / supervisor role sees only "Dispatch" (new path) in sidebar
[ ] Owner role sees both "Dispatch" and "Legacy Dispatch (Admin Only)"
[ ] POST /logistics/dispatch-orders returns 403 for non-owner roles
[ ] 100-request load test produces zero DIS-* collisions
[ ] No legacy dispatch links accessible from operator UI

---

# ============================================================
# BLOCKER 3 — H1: Customer Dealer-Override
# ============================================================
# Risk: HIGH
# File: routes/customers/index.ts
# Problem: Registration accepts caller-supplied dealer_id from request
#          body. Server validates only that dealer is active, not that
#          it owns the product. Warranty ownership can be written to
#          the wrong dealer.
# ============================================================

---
## PATCH 3 — routes/customers/index.ts
## Derive dealerId from product, reject caller-supplied value
---

// BEFORE (around line 173-180):
// const { productSerial, dealer_id, customerName, phone, address } = req.body;
// const dealer = await db.query.dealers.findFirst({
//   where: eq(dealers.code, dealer_id),
// });
// if (!dealer || dealer.status !== "active") {
//   return res.status(400).json({ error: "Invalid or inactive dealer" });
// }

// AFTER:
const { productSerial, customerName, phone, address } = req.body;

// REJECT caller-supplied dealer_id — derive from product authoritatively
if (req.body.dealer_id !== undefined) {
  return res.status(400).json({ error: "dealer_id must not be supplied by caller" });
}

// Look up product to find its assigned dealer
const product = await db.query.products.findFirst({
  where: eq(products.productSerial, productSerial),
});
if (!product) {
  return res.status(404).json({ error: "Product not found" });
}
if (!product.dealerId) {
  return res.status(400).json({ error: "Product has no assigned dealer" });
}

const dealerId = product.dealerId; // Authoritative source

// Validate dealer is active
const dealer = await db.query.dealers.findFirst({
  where: eq(dealers.id, dealerId),
});
if (!dealer || dealer.status !== "active") {
  return res.status(400).json({ error: "Product dealer is invalid or inactive" });
}

// Use dealerId for registration (do not trust req.body)
const registration = await db.insert(customerRegistrations).values({
  productSerial,
  dealerId,        // derived from product, not caller
  customerName,
  phone,
  address,
  registeredAt: new Date(),
}).returning();

---
## ACCEPTANCE CRITERIA — BLOCKER 3
---

[ ] POST /customers with body containing dealer_id: "DLR-999" returns 400
[ ] Registration correctly assigns the product's actual dealer
[ ] Warranty lookup returns the correct dealer for the product
[ ] Existing registrations with correct dealer_id continue to work

---

# ============================================================
# BLOCKER 4 — H8: One-Shot Inspection Model
# ============================================================
# Risk: HIGH
# Files: lib/db/src/schema.ts, routes/inventory/incoming-inspection.ts
# Problem: Inspection requires one submission covering all pending GRN
#          lines at once. No partial inspection, re-inspection, or
#          sampling path. Factory floor testing blocked by this.
# ============================================================

---
## PATCH 4A — lib/db/src/schema.ts
## Relax unique constraint to allow multiple inspections per GRN line
---

// Find the incoming_inspections table definition (around line 446-458).
// BEFORE:
// uniqueIndex("unique_grn_inspection").on(table.grnId), // one inspection per GRN

// AFTER:
// Allow multiple inspection events per GRN, but one per GRN line
uniqueIndex("unique_grn_line_inspection").on(table.grnLineId),

// Note: If your schema uses a composite key approach, adjust accordingly.
// The intent is to move the uniqueness from GRN-level to GRN-line-level.

---
## PATCH 4B — routes/inventory/incoming-inspection.ts
## Support line-level partial inspection submissions
---

// Around line 72-115 — replace full-coverage enforcement

// BEFORE (full-coverage enforcement):
// const pendingLines = await db.query.grnLines.findMany({
//   where: and(eq(grnLines.grnId, grnId), eq(grnLines.status, "pending_inspection")),
// });
// if (pendingLines.length !== inspectionLines.length) {
//   return res.status(422).json({ error: "All pending lines must be inspected" });
// }

// AFTER (line-level partial inspection):
const { grnId, inspectionLines } = req.body;
// inspectionLines = array of { grnLineId, acceptedQty, rejectedQty, rejectionReason }

await db.transaction(async (tx) => {
  // 1. Validate each line belongs to this GRN and is inspectable
  for (const line of inspectionLines) {
    const grnLine = await tx.query.grnLines.findFirst({
      where: and(
        eq(grnLines.id, line.grnLineId),
        eq(grnLines.grnId, grnId),
        eq(grnLines.status, "pending_inspection")
      ),
    });
    if (!grnLine) {
      return res.status(422).json({
        error: `GRN line ${line.grnLineId} is not inspectable (not found or already inspected)`
      });
    }
    if (line.acceptedQty + line.rejectedQty !== grnLine.receivedQty) {
      return res.status(422).json({
        error: `Quantities do not match for line ${line.grnLineId}: expected ${grnLine.receivedQty}, got ${line.acceptedQty + line.rejectedQty}`
      });
    }
  }

  // 2. Insert inspection header
  const [inspection] = await tx.insert(incomingInspections).values({
    grnId,
    inspectionNumber: await generateInspectionNumber(),
    status: "completed",
    inspectedBy: req.user.userId,
    inspectedAt: new Date(),
  }).returning();

  // 3. Insert inspection lines and update GRN line statuses
  for (const line of inspectionLines) {
    await tx.insert(incomingInspectionLines).values({
      inspectionId: inspection.id,
      grnLineId: line.grnLineId,
      acceptedQty: line.acceptedQty,
      rejectedQty: line.rejectedQty,
      rejectionReason: line.rejectedQty > 0 ? line.rejectionReason : null,
    });

    // Update GRN line status
    const newStatus = line.rejectedQty > 0 ? "partially_accepted" : "inspected";
    await tx.update(grnLines).set({
      status: newStatus,
      acceptedQty: line.acceptedQty,
      rejectedQty: line.rejectedQty,
    }).where(eq(grnLines.id, line.grnLineId));
  }

  // 4. Check if all GRN lines are now inspected
  const remainingPending = await tx.query.grnLines.findMany({
    where: and(
      eq(grnLines.grnId, grnId),
      eq(grnLines.status, "pending_inspection")
    ),
  });

  if (remainingPending.length === 0) {
    await tx.update(grns).set({
      status: "fully_inspected",
      inspectedAt: new Date(),
    }).where(eq(grns.id, grnId));
  } else {
    await tx.update(grns).set({
      status: "partially_inspected",
    }).where(eq(grns.id, grnId));
  }
});

---
## ACCEPTANCE CRITERIA — BLOCKER 4
---

[ ] Can submit inspection for 2 of 5 GRN lines; remaining 3 stay "pending_inspection"
[ ] Cannot inspect a line that is already "inspected" or "partially_accepted"
[ ] GRN status becomes "fully_inspected" only when all lines are done
[ ] GRN status is "partially_inspected" when some lines remain pending
[ ] Ledger rows (inventory_transactions) are written correctly for partial inspections
[ ] acceptedQty + rejectedQty = receivedQty enforced for every line

---

# ============================================================
# BLOCKER 5 — H11: Lot Traceability Not Enforced
# ============================================================
# Risk: HIGH
# File: routes/inventory/material-issue.ts
# Problem: MIN records lot references but does not validate them against
#          the ledger. Operator can enter any GRN/lot number. For LiFePO4
#          recall, traceability records are untrustworthy.
# ============================================================

---
## PATCH 5 — routes/inventory/material-issue.ts
## Validate lot allocation against ledger at MIN creation
---

// ADD this validation function before the MIN creation handler
// (around line 140-150, or in a shared helpers file):

async function validateLotAllocation(
  materialId: string,
  grnLineId: string,
  lotNumber: string,
  requestedQty: number,
  tx: any  // Drizzle transaction client
): Promise<{ valid: boolean; error?: string }> {
  // 1. Verify the GRN line exists and matches the material
  const grnLine = await tx.query.grnLines.findFirst({
    where: eq(grnLines.id, grnLineId),
    with: { grn: true, material: true },
  });
  if (!grnLine) {
    return { valid: false, error: `GRN line ${grnLineId} not found` };
  }
  if (grnLine.materialId !== materialId) {
    return { valid: false, error: "GRN line does not match the requested material" };
  }

  // 2. Verify the lot number matches the GRN line
  if (grnLine.lotNumber !== lotNumber) {
    return { valid: false, error: `Lot number ${lotNumber} does not match GRN line (expected ${grnLine.lotNumber})` };
  }

  // 3. Check available balance for this material + lot
  const [balanceRow] = await tx
    .select({ total: sum(inventoryTransactions.quantity) })
    .from(inventoryTransactions)
    .where(and(
      eq(inventoryTransactions.materialId, materialId),
      eq(inventoryTransactions.lotNumber, lotNumber),
      eq(inventoryTransactions.state, "available")
    ));

  const available = Number(balanceRow?.total ?? 0);
  if (available < requestedQty) {
    return {
      valid: false,
      error: `Insufficient lot balance: available ${available}, requested ${requestedQty}`
    };
  }

  return { valid: true };
}

// IN the MIN creation handler (around line 384-388),
// REPLACE the traceability check:

// BEFORE:
// if (traceabilityRequired) {
//   // presence check only — does not validate against ledger
// }

// AFTER:
if (traceabilityRequired) {
  const lotValidation = await validateLotAllocation(
    materialId,
    grnLineId,
    lotNumber,
    requestedQty,
    tx
  );
  if (!lotValidation.valid) {
    return res.status(422).json({ error: lotValidation.error });
  }
}

// Continue with existing MIN creation logic...

---
## ACCEPTANCE CRITERIA — BLOCKER 5
---

[ ] MIN creation rejected when GRN line does not match material
[ ] MIN creation rejected when lot number does not match GRN line
[ ] MIN creation rejected when lot balance < requested quantity
[ ] Valid lot allocation succeeds and writes correct ledger rows
[ ] Traceability query returns validated lot references only

---

# ============================================================
# BLOCKER 6 — H14: Dual Order Completion Paths
# ============================================================
# Risk: HIGH
# Files: routes/manufacturing/product-creation.ts,
#        routes/manufacturing/stages.ts,
#        routes/manufacturing/qc-approval.ts
# Problem: Terminal stage completion and QC approval both call
#          completeOrderWithProduct. No idempotency guard.
#          Race → duplicate product records.
# ============================================================

---
## PATCH 6A — routes/manufacturing/product-creation.ts
## Add idempotency guard to completeOrderWithProduct
---

// In the completeOrderWithProduct function, ADD at the very beginning:

export async function completeOrderWithProduct(
  orderId: string,
  tx: any
): Promise<void> {
  // ===== IDEMPOTENCY GUARD =====
  // Lock the order row and check if already completed
  const [order] = await tx
    .select()
    .from(mfgProductionOrders)
    .where(eq(mfgProductionOrders.id, orderId))
    .for("update");  // row-level lock

  if (!order) {
    throw new Error(`Production order ${orderId} not found`);
  }

  if (order.status === "completed") {
    // Already completed — no-op, not an error
    console.warn(`completeOrderWithProduct: order ${orderId} already completed — skipping`);
    return;
  }

  if (order.status !== "qc_approved" && order.status !== "final_stage_completed") {
    throw new Error(`Cannot complete order ${orderId} from status: ${order.status}`);
  }
  // ===== END IDEMPOTENCY GUARD =====

  // ... existing completion logic (create product, genealogy, events, etc.) ...

  // Update order status to completed
  await tx
    .update(mfgProductionOrders)
    .set({
      status: "completed",
      completedAt: new Date(),
    })
    .where(eq(mfgProductionOrders.id, orderId));
}

---
## PATCH 6B — routes/manufacturing/stages.ts
## Guard terminal stage completion
---

// Around line 587-592 — before calling completeOrderWithProduct:

// BEFORE:
// await completeOrderWithProduct(orderId, tx);

// AFTER:
if (order.status !== "completed") {
  await completeOrderWithProduct(orderId, tx);
} else {
  console.warn(`Stage completion: order ${orderId} already completed`);
}

---
## PATCH 6C — routes/manufacturing/qc-approval.ts
## Guard QC approval completion
---

// Around line 126-130 — before calling completeOrderWithProduct:

// BEFORE:
// await completeOrderWithProduct(orderId, tx);

// AFTER:
if (order.status !== "completed") {
  await completeOrderWithProduct(orderId, tx);
} else {
  console.warn(`QC approval: order ${orderId} already completed`);
}

---
## ACCEPTANCE CRITERIA — BLOCKER 6
---

[ ] Concurrent terminal stage completion + QC approval does not create duplicate products
[ ] Second call to completeOrderWithProduct on same order is a no-op
[ ] Order status transitions correctly to "completed" exactly once
[ ] Only one product record created per production order
[ ] Audit trail shows single completion event

---

# ============================================================
# BLOCKER 7 — H16 + H17 + H18: Race Conditions in Shop-Floor Allocation
# ============================================================
# Risk: HIGH
# Files: lib/db/src/schema.ts,
#        routes/manufacturing/stages.ts,
#        routes/manufacturing/matches.ts
# Problem:
#   H16: Genealogy retries insert duplicate lineage rows (no uniqueness constraint)
#   H17: Two operators can reserve same charger (no availability predicate)
#   H18: Cell matching reads availability outside transaction (lost update)
# ============================================================

---
## PATCH 7A — lib/db/src/schema.ts
## Add genealogy uniqueness constraint
---

// Around line 150-167 — in the product_genealogy table definition:

// BEFORE:
// export const productGenealogy = pgTable("product_genealogy", {
//   id: serial("id").primaryKey(),
//   productionOrderId: integer("production_order_id").notNull(),
//   componentType: varchar("component_type", { length: 50 }).notNull(),
//   componentId: integer("component_id"),
//   serialNumber: varchar("serial_number", { length: 100 }),
//   // ... other columns
// });

// AFTER:
export const productGenealogy = pgTable("product_genealogy", {
  id: serial("id").primaryKey(),
  productionOrderId: integer("production_order_id").notNull(),
  componentType: varchar("component_type", { length: 50 }).notNull(),
  componentId: integer("component_id"),
  serialNumber: varchar("serial_number", { length: 100 }),
  // ... other columns
}, (table) => ({
  // ADD: Prevent duplicate genealogy rows for same component
  uniqueGenealogy: uniqueIndex("unique_genealogy").on(
    table.productionOrderId,
    table.componentType,
    table.componentId,
    table.serialNumber
  ),
}));

---
## PATCH 7B — routes/manufacturing/stages.ts
## Charger reservation/release with conditional predicates
---

// --- Charger RESERVATION (around line 68-83) ---

// BEFORE:
// await tx.update(chargers)
//   .set({ status: "in_use", productionOrderId: orderId })
//   .where(eq(chargers.id, chargerId));

// AFTER:
const [reserved] = await tx
  .update(chargers)
  .set({
    status: "in_use",
    productionOrderId: orderId,
    reservedAt: new Date(),
  })
  .where(and(
    eq(chargers.id, chargerId),
    eq(chargers.status, "available")  // CRITICAL: only reserve if available
  ))
  .returning();

if (!reserved) {
  throw new Error(
    `Charger ${chargerId} is no longer available — possibly reserved by another operator. Please refresh and try again.`
  );
}

// --- Charger RELEASE (around line 170-177) ---

// BEFORE:
// await tx.update(chargers)
//   .set({ status: "available", productionOrderId: null })
//   .where(eq(chargers.id, chargerId));

// AFTER:
const [released] = await tx
  .update(chargers)
  .set({
    status: "available",
    productionOrderId: null,
    reservedAt: null,
  })
  .where(and(
    eq(chargers.id, chargerId),
    eq(chargers.status, "in_use"),           // only release if currently in use
    eq(chargers.productionOrderId, orderId)  // and belongs to this order
  ))
  .returning();

if (!released) {
  throw new Error(
    `Charger ${chargerId} release failed — may have been released already or reassigned.`
  );
}

---
## PATCH 7C — routes/manufacturing/matches.ts
## Atomic cell matching with transaction-level locking
---

// Around line 161-168 — replace the availability check

// BEFORE:
// const approvedCells = await db.query.cellRecords.findMany({
//   where: and(eq(cellRecords.status, "approved"), ...),
// });
// // ... acceptance logic outside tx ...
// await tx.update(cellRecords)
//   .set({ status: "allocated" })
//   .where(inArray(cellRecords.id, cellIds));

// AFTER:
const { orderId, cellIds } = req.body;

await db.transaction(async (tx) => {
  // 1. Lock and verify cells are still approved INSIDE the transaction
  const lockedCells = await tx
    .select()
    .from(cellRecords)
    .where(and(
      inArray(cellRecords.id, cellIds),
      eq(cellRecords.status, "approved")  // CRITICAL: must still be approved
    ))
    .for("update");  // row-level lock prevents concurrent allocation

  if (lockedCells.length !== cellIds.length) {
    const foundIds = new Set(lockedCells.map(c => c.id));
    const missing = cellIds.filter(id => !foundIds.has(id));
    throw new Error(
      `Cells no longer available (allocated by another operator): ${missing.join(", ")}`
    );
  }

  // 2. Allocate cells atomically
  await tx
    .update(cellRecords)
    .set({
      status: "allocated",
      productionOrderId: orderId,
      allocatedAt: new Date(),
    })
    .where(and(
      inArray(cellRecords.id, cellIds),
      eq(cellRecords.status, "approved")  // double-check predicate
    ));

  // 3. Create genealogy records (idempotent — duplicates silently ignored)
  for (const cell of lockedCells) {
    await tx
      .insert(productGenealogy)
      .values({
        productionOrderId: orderId,
        componentType: "cell",
        componentId: cell.id,
        serialNumber: cell.serialNumber,
      })
      .onConflictDoNothing({
        target: [
          productGenealogy.productionOrderId,
          productGenealogy.componentType,
          productGenealogy.componentId,
        ]
      });
  }
});

---
## ACCEPTANCE CRITERIA — BLOCKER 7
---

[ ] Two concurrent charger reservations for same charger — only one succeeds
[ ] Two concurrent cell matching requests for same cells — only one succeeds
[ ] Genealogy insert with duplicate key is silently ignored (idempotent)
[ ] Load test with 10 concurrent operators — zero double-allocations
[ ] Charger release by wrong order fails (cannot steal another order's charger)
[ ] Cell allocation rollback on partial failure (all-or-nothing)

---

# ============================================================
# POST-PATCH CHECKLIST
# ============================================================

## Schema Migration Order
1. Run PATCH 4A (inspection unique index change)
2. Run PATCH 7A (genealogy unique constraint)
3. Generate and apply Drizzle migrations
4. Verify constraints in database

## Code Deployment Order
1. PATCH 1A + 1B (auth + dealer scoping)
2. PATCH 2A + 2B + 2C (dispatch freeze)
3. PATCH 3 (customer dealer-override)
4. PATCH 4B (partial inspection)
5. PATCH 5 (lot traceability validation)
6. PATCH 6A + 6B + 6C (order completion idempotency)
7. PATCH 7B + 7C (shop-floor race conditions)

## Regression Tests to Run
[ ] authz certification suite — authoritative mode (CERT_AUTHZ_CHECK=1)
[ ] audit certification suite — authoritative mode (CERT_AUDIT_RATELIMIT=1)
[ ] config certification suite
[ ] End-to-end traceability: GRN → cell → battery → dispatch → customer → warranty
[ ] Dealer data isolation: supervisor cannot see cross-dealer data
[ ] Concurrent cell matching: 10 parallel requests, 0 duplicates
[ ] Concurrent charger reservation: 10 parallel requests, 0 double-bookings
[ ] Load test: 100 DIS-* numbers generated, 0 collisions
[ ] Partial inspection: submit 2 of 5 lines, verify remaining pending

## FAT Freeze Criteria (Re-check after all patches)
[ ] All 7 blockers closed and regression-tested
[ ] No legacy dispatch numbers generated during test
[ ] Cell matching tested with two concurrent users — no duplicate allocations
[ ] Charger reservation tested with concurrent stage starts — no double-booking
[ ] End-to-end traceability demonstrated in one transaction sequence

---

# End of Patches
