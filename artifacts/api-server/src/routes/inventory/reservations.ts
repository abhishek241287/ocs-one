import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  inventoryReservationsTable,
  inventoryTransactionsTable,
  materialsTable,
  mfgProductionOrdersTable,
  outboxEventsTable,
  pool,
} from "@workspace/db";
import { CreateReservationBody } from "@workspace/api-zod";
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

export default router;