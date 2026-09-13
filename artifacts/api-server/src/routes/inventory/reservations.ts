import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  db,
  grnLineItemsTable,
  inventoryLotsTable,
  inventoryReservationAllocationsTable,
  inventoryReservationsTable,
  inventoryTransactionsTable,
  materialsTable,
  mfgProductionOrdersTable,
  outboxEventsTable,
  pool,
} from "@workspace/db";
import { AllocateReservationBody, CreateReservationBody } from "@workspace/api-zod";
import { requireWriteRole } from "../../middleware/auth";
import { recordSecurityEvent, reqMeta } from "../../lib/security-events";

const router: IRouter = Router();

// Reservation writes are supervisor+director; reads pass for any authed user —
// same policy as GRN / Inspection / Transfer.
router.use(requireWriteRole("supervisor", "director"));

function numify(v: unknown): unknown {
  return typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
}

function serializeReservation(r: Record<string, any>): Record<string, unknown> {
  return {
    id: r.id,
    reservation_number: r.reservationNumber,
    production_order_id: r.productionOrderId,
    material_id: r.materialId,
    reserved_qty: numify(r.reservedQty),
    allocated_qty: numify(r.allocatedQty),
    issued_qty: numify(r.issuedQty),
    uom: r.uom,
    status: r.status,
    lot_id: r.lotId ?? null,
    warehouse_id: r.warehouseId ?? null,
    location_id: r.locationId ?? null,
    expires_at: r.expiresAt ?? null,
    released_at: r.releasedAt ?? null,
    cancelled_at: r.cancelledAt ?? null,
    cancelled_by: r.cancelledBy ?? null,
    cancellation_reason: r.cancellationReason ?? null,
    created_by: r.createdBy,
    created_at: r.createdAt,
  };
}

// Availability is always derived from the signed ledger. Inventory reservations
// do not write ledger rows, so they are accounted for separately below.
async function materialAvailable(tx: any, materialId: string): Promise<number> {
  const [row] = await tx
    .select({
      sum: sql<string>`coalesce(sum(${inventoryTransactionsTable.quantity}), 0)`,
    })
    .from(inventoryTransactionsTable)
    .where(
      and(
        eq(inventoryTransactionsTable.materialId, materialId),
        eq(inventoryTransactionsTable.stockState, "available"),
      ),
    );
  return Number(row?.sum ?? 0);
}

// Every pre-fulfilment state holds stock. Released/cancelled/expired do not.
const HOLDING_STATUSES = [
  "active",
  "partially_allocated",
  "fully_allocated",
  "partially_issued",
  "fully_issued",
] as const;

async function materialReserved(tx: any, materialId: string): Promise<number> {
  const [row] = await tx
    .select({
      sum: sql<string>`coalesce(sum(${inventoryReservationsTable.reservedQty}), 0)`,
    })
    .from(inventoryReservationsTable)
    .where(
      and(
        eq(inventoryReservationsTable.materialId, materialId),
        inArray(inventoryReservationsTable.status, [...HOLDING_STATUSES]),
      ),
    );
  return Number(row?.sum ?? 0);
}

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateReservationBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.issues }, "Invalid reservation input");
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const body = parsed.data;
  const actorId = req.user!.userId;

  // Pre-transaction existence validation — unknown references use the GRN house
  // style and return 400 rather than surfacing a generic FK error.
  const [material] = await db
    .select({ id: materialsTable.id, uom: materialsTable.uom })
    .from(materialsTable)
    .where(eq(materialsTable.id, body.material_id))
    .limit(1);
  if (!material) {
    res.status(400).json({ error: "Unknown material id" });
    return;
  }

  const [productionOrder] = await db
    .select({ id: mfgProductionOrdersTable.id })
    .from(mfgProductionOrdersTable)
    .where(eq(mfgProductionOrdersTable.id, body.production_order_id))
    .limit(1);
  if (!productionOrder) {
    res.status(400).json({ error: "Unknown production order id" });
    return;
  }

  // Sequence gaps on rollback are accepted house behavior.
  const now = new Date();
  const dateStr = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
  const { rows } = await pool.query("SELECT nextval('res_seq') AS seq");
  const reservationNumber = `RSV-${dateStr}-${String(rows[0].seq).padStart(4, "0")}`;

  const outcome = await db.transaction(async (tx) => {
    // Serialize reservation creators for this material so the availability check
    // and insert form one race-free decision.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`reservation-material:${body.material_id}`}))`,
    );

    const available = await materialAvailable(tx, body.material_id);
    const reserved = await materialReserved(tx, body.material_id);
    const reservable = available - reserved;

    if (reservable <= 0 || body.quantity > reservable && !body.allow_partial) {
      return { status: "insufficient" as const, available, reserved };
    }

    const quantity = body.quantity > reservable ? reservable : body.quantity;
    if (quantity <= 0) {
      return { status: "insufficient" as const, available, reserved };
    }

    const [created] = await tx
      .insert(inventoryReservationsTable)
      .values({
        reservationNumber,
        productionOrderId: body.production_order_id,
        materialId: body.material_id,
        reservedQty: String(quantity),
        allocatedQty: "0",
        issuedQty: "0",
        uom: material.uom,
        status: "active",
        expiresAt: body.expiry_date ? new Date(body.expiry_date) : null,
        createdBy: actorId,
      })
      .returning();

    await tx.insert(outboxEventsTable).values({
      aggregateType: "inventory_reservation",
      aggregateId: created.id,
      eventType: "RESERVATION_CREATED",
      payload: {
        reservation_number: reservationNumber,
        production_order_id: body.production_order_id,
        material_id: body.material_id,
        requested_qty: body.quantity,
        reserved_qty: quantity,
        partial: quantity < body.quantity,
        uom: material.uom,
        actor_id: actorId,
      },
    });

    return { status: "ok" as const, created, reserved: quantity };
  });

  if (outcome.status === "insufficient") {
    res.status(409).json({
      error: "INSUFFICIENT_STOCK",
      details: {
        available: outcome.available,
        reserved: outcome.reserved,
        requested: body.quantity,
      },
    });
    return;
  }

  void recordSecurityEvent({
    eventType: "reservation.created",
    actorId,
    actorEmail: req.user?.email ?? null,
    actorRole: req.user?.role ?? null,
    ...reqMeta(req),
    statusCode: 201,
    detail: `Reservation ${reservationNumber} created (production order ${body.production_order_id}, material ${body.material_id}, qty ${outcome.reserved}${outcome.reserved < body.quantity ? ", partial" : ""})`,
  });

  res.status(201).json(serializeReservation(outcome.created as Record<string, any>));
});

// ─── Allocation helpers ──────────────────────────────────────────────────────
// The signed ledger is line-level for received stock. Lot remaining_qty is only
// a projection and is intentionally not used for reservation allocation.
async function lineAvailable(tx: any, grnLineId: string): Promise<number> {
  const [row] = await tx
    .select({
      sum: sql<string>`coalesce(sum(${inventoryTransactionsTable.quantity}), 0)`,
    })
    .from(inventoryTransactionsTable)
    .where(
      and(
        eq(inventoryTransactionsTable.sourceLineId, grnLineId),
        eq(inventoryTransactionsTable.stockState, "available"),
      ),
    );
  return Number(row?.sum ?? 0);
}

async function lineHeld(tx: any, grnLineId: string): Promise<number> {
  const [row] = await tx
    .select({
      sum: sql<string>`coalesce(sum(${inventoryReservationAllocationsTable.quantity}), 0)`,
    })
    .from(inventoryReservationAllocationsTable)
    .innerJoin(
      inventoryLotsTable,
      eq(inventoryLotsTable.id, inventoryReservationAllocationsTable.lotId),
    )
    .where(
      and(
        eq(inventoryLotsTable.grnLineId, grnLineId),
        eq(inventoryReservationAllocationsTable.status, "active"),
      ),
    );
  return Number(row?.sum ?? 0);
}

async function lotHeld(tx: any, lotId: string): Promise<number> {
  const [row] = await tx
    .select({
      sum: sql<string>`coalesce(sum(${inventoryReservationAllocationsTable.quantity}), 0)`,
    })
    .from(inventoryReservationAllocationsTable)
    .where(
      and(
        eq(inventoryReservationAllocationsTable.lotId, lotId),
        eq(inventoryReservationAllocationsTable.status, "active"),
      ),
    );
  return Number(row?.sum ?? 0);
}

function nextStatus(reserved: number, allocated: number): string {
  if (allocated >= reserved) return "fully_allocated";
  if (allocated > 0) return "partially_allocated";
  return "active";
}

// ─── POST /inventory/reservations/:id/allocate ───────────────────────────────
router.post("/:id/allocate", async (req: Request, res: Response): Promise<void> => {
  const parsed = AllocateReservationBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const body = parsed.data;
  const actorId = req.user?.userId ?? null;

  const outcome = await db.transaction(async (tx) => {
    const [reservation] = await tx
      .select()
      .from(inventoryReservationsTable)
      .where(eq(inventoryReservationsTable.id, req.params.id as string))
      .for("update")
      .limit(1);

    if (!reservation) return { status: "not_found" as const };

    if (
      reservation.expiresAt &&
      new Date(reservation.expiresAt) < new Date() &&
      ["active", "partially_allocated", "fully_allocated"].includes(reservation.status)
    ) {
      await tx
        .update(inventoryReservationsTable)
        .set({ status: "expired" })
        .where(eq(inventoryReservationsTable.id, reservation.id));
      return { status: "expired" as const };
    }

    if (!["active", "partially_allocated"].includes(reservation.status)) {
      return { status: "invalid_state" as const, current: reservation.status };
    }

    const reserved = Number(reservation.reservedQty);
    const allocated = Number(reservation.allocatedQty);
    const remainder = reserved - allocated;
    const requested = body.quantity ?? remainder;

    if (remainder <= 0 || requested <= 0) {
      return { status: "nothing" as const };
    }
    if (requested > remainder) {
      return { status: "quantity_exceeds_remainder" as const, remainder };
    }

    if (body.lot_id) {
      const [forced] = await tx
        .select({
          id: inventoryLotsTable.id,
          materialId: inventoryLotsTable.materialId,
        })
        .from(inventoryLotsTable)
        .where(eq(inventoryLotsTable.id, body.lot_id))
        .limit(1);
      if (!forced || forced.materialId !== reservation.materialId) {
        return { status: "bad_lot" as const };
      }
    }

    const lotConditions = [
      eq(inventoryLotsTable.materialId, reservation.materialId),
      eq(inventoryLotsTable.status, "active"),
      isNotNull(inventoryLotsTable.grnLineId),
    ];
    if (body.lot_id) {
      lotConditions.push(eq(inventoryLotsTable.id, body.lot_id));
    }

    const orderBy =
      body.strategy === "FEFO"
        ? [
            sql`${inventoryLotsTable.expiryDate} ASC NULLS LAST`,
            asc(inventoryLotsTable.receivedDate),
            asc(inventoryLotsTable.lotNumber),
          ]
        : [
            asc(inventoryLotsTable.receivedDate),
            asc(inventoryLotsTable.lotNumber),
          ];

    const candidates = await tx
      .select({
        id: inventoryLotsTable.id,
        grnLineId: inventoryLotsTable.grnLineId,
        lotNumber: inventoryLotsTable.lotNumber,
        totalReceivedQty: inventoryLotsTable.totalReceivedQty,
        warehouseId: inventoryLotsTable.warehouseId,
        locationId: inventoryLotsTable.locationId,
        binId: inventoryLotsTable.binId,
      })
      .from(inventoryLotsTable)
      .where(and(...lotConditions))
      .orderBy(...orderBy)
      .for("update");

    const allocations: Array<{
      lotId: string;
      grnLineId: string;
      lotNumber: string;
      warehouseId: string | null;
      locationId: string | null;
      binId: string | null;
      quantity: number;
    }> = [];
    const lockedLines = new Map<string, number>();
    let need = requested;

    for (const lot of candidates) {
      if (need <= 0) break;
      const grnLineId = lot.grnLineId;
      if (!grnLineId) continue;

      // Transfers lock this same GRN line. Lock once per line, in the same
      // deterministic candidate order, then re-read both ledger and holds.
      if (!lockedLines.has(grnLineId)) {
        const [lineLock] = await tx
          .select({ id: grnLineItemsTable.id })
          .from(grnLineItemsTable)
          .where(eq(grnLineItemsTable.id, grnLineId))
          .for("update")
          .limit(1);
        if (!lineLock) continue;

        lockedLines.set(
          grnLineId,
          (await lineAvailable(tx, grnLineId)) - (await lineHeld(tx, grnLineId)),
        );
      }

      const lineReservable = lockedLines.get(grnLineId)!;
      if (lineReservable <= 0) continue;

      // A line can be split across multiple lots. Attribute the line-level
      // balance in scan order, bounded by each lot's received quantity minus
      // its active allocation holds. This never reads or writes remaining_qty.
      const heldOnLot = await lotHeld(tx, lot.id);
      const lotReservable = Math.max(0, Number(lot.totalReceivedQty) - heldOnLot);
      const take = Math.min(need, lineReservable, lotReservable);
      if (take <= 0) continue;

      await tx.insert(inventoryReservationAllocationsTable).values({
        reservationId: reservation.id,
        lotId: lot.id,
        quantity: String(take),
        status: "active",
      });
      allocations.push({
        lotId: lot.id,
        grnLineId,
        lotNumber: lot.lotNumber,
        warehouseId: lot.warehouseId,
        locationId: lot.locationId,
        binId: lot.binId,
        quantity: take,
      });
      lockedLines.set(grnLineId, lineReservable - take);
      need -= take;
    }

    if (allocations.length === 0 || (need > 0 && !body.allow_partial)) {
      return { status: "insufficient" as const, unallocated: need };
    }

    const newAllocated =
      allocated + allocations.reduce((sum, item) => sum + item.quantity, 0);
    const [updated] = await tx
      .update(inventoryReservationsTable)
      .set({
        allocatedQty: String(newAllocated),
        status: nextStatus(reserved, newAllocated) as
          | "active"
          | "partially_allocated"
          | "fully_allocated",
      })
      .where(eq(inventoryReservationsTable.id, reservation.id))
      .returning();

    await tx.insert(outboxEventsTable).values({
      aggregateType: "inventory_reservation",
      aggregateId: reservation.id,
      eventType: "RESERVATION_ALLOCATED",
      payload: {
        reservation_number: reservation.reservationNumber,
        strategy: body.strategy,
        allocations: allocations.map((item) => ({
          lot_id: item.lotId,
          lot_number: item.lotNumber,
          grn_line_id: item.grnLineId,
          quantity: item.quantity,
        })),
        new_allocated_qty: newAllocated,
        actor_id: actorId,
      },
    });

    return { status: "ok" as const, reservation: updated, allocations };
  });

  if (outcome.status === "not_found") {
    res.status(404).json({ error: "Reservation not found" });
    return;
  }
  if (outcome.status === "expired") {
    res.status(409).json({ error: "Reservation has expired" });
    return;
  }
  if (outcome.status === "invalid_state") {
    res
      .status(409)
      .json({ error: `Reservation cannot be allocated from status '${outcome.current}'` });
    return;
  }
  if (outcome.status === "nothing") {
    res.status(422).json({ error: "Nothing left to allocate" });
    return;
  }
  if (outcome.status === "quantity_exceeds_remainder") {
    res.status(422).json({
      error: "Allocation quantity exceeds unallocated reservation quantity",
      details: { remainder: outcome.remainder },
    });
    return;
  }
  if (outcome.status === "bad_lot") {
    res.status(422).json({ error: "Lot does not match the reserved material" });
    return;
  }
  if (outcome.status === "insufficient") {
    res.status(409).json({
      error: "INSUFFICIENT_STOCK",
      details: { unallocated: outcome.unallocated },
    });
    return;
  }

  void recordSecurityEvent({
    eventType: "reservation.allocated",
    actorId,
    actorEmail: req.user?.email ?? null,
    actorRole: req.user?.role ?? null,
    ...reqMeta(req),
    statusCode: 200,
    detail: `Reservation ${outcome.reservation.reservationNumber} allocated across ${outcome.allocations.length} lot(s) [${body.strategy}]`,
  });

  res.json({
    ...serializeReservation(outcome.reservation as Record<string, any>),
    allocations: outcome.allocations.map((item) => ({
      lot_id: item.lotId,
      lot_number: item.lotNumber,
      grn_line_id: item.grnLineId,
      quantity: item.quantity,
      warehouse_id: item.warehouseId,
      location_id: item.locationId,
      bin_id: item.binId,
      status: "active",
    })),
  });
});

export default router;