import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  type Transaction,
  grnLineItemsTable,
  inventoryLotsTable,
  inventoryReservationAllocationsTable,
  inventoryReservationsTable,
  inventoryTransactionsTable,
  outboxEventsTable,
  wipInventoryTable,
  wipIssueLinesTable,
  wipIssueNotesTable,
} from "@workspace/db";

export const HOLDING_STATUSES = [
  "active",
  "partially_allocated",
  "fully_allocated",
  "partially_issued",
  "fully_issued",
] as const;

export type ReservationCreateOutcome =
  | { status: "ok"; reservation: Record<string, any> }
  | { status: "insufficient"; available: number; reserved: number };

export interface CreateReservationInTxArgs {
  productionOrderId: string;
  materialId: string;
  quantity: number;
  uom: string;
  reservationNumber: string;
  actorId: string;
  expiryDate?: Date | null;
  allowPartial?: boolean;
}

async function materialAvailable(tx: Transaction, materialId: string): Promise<number> {
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

async function materialReserved(tx: Transaction, materialId: string): Promise<number> {
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

export async function createReservationInTx(
  tx: Transaction,
  args: CreateReservationInTxArgs,
): Promise<ReservationCreateOutcome> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`reservation-material:${args.materialId}`}))`,
  );

  const available = await materialAvailable(tx, args.materialId);
  const reserved = await materialReserved(tx, args.materialId);
  const reservable = available - reserved;
  if (reservable <= 0 || (args.quantity > reservable && !args.allowPartial)) {
    return { status: "insufficient", available, reserved };
  }
  const quantity = Math.min(args.quantity, reservable);
  if (quantity <= 0) return { status: "insufficient", available, reserved };

  const [created] = await tx
    .insert(inventoryReservationsTable)
    .values({
      reservationNumber: args.reservationNumber,
      productionOrderId: args.productionOrderId,
      materialId: args.materialId,
      reservedQty: String(quantity),
      allocatedQty: "0",
      issuedQty: "0",
      uom: args.uom as never,
      status: "active",
      expiresAt: args.expiryDate ?? null,
      createdBy: args.actorId,
    })
    .returning();

  await tx.insert(outboxEventsTable).values({
    aggregateType: "inventory_reservation",
    aggregateId: created.id,
    eventType: "RESERVATION_CREATED",
    payload: {
      reservation_number: created.reservationNumber,
      production_order_id: args.productionOrderId,
      material_id: args.materialId,
      requested_qty: args.quantity,
      reserved_qty: quantity,
      partial: quantity < args.quantity,
      uom: args.uom,
      actor_id: args.actorId,
    },
  });

  return { status: "ok", reservation: created as Record<string, any> };
}

export type AllocationOutcome =
  | { status: "ok"; reservation: Record<string, any>; allocations: AllocationRecord[] }
  | { status: "not_found" }
  | { status: "expired" }
  | { status: "invalid_state"; current: string }
  | { status: "nothing" }
  | { status: "quantity_exceeds_remainder"; remainder: number }
  | { status: "bad_lot" }
  | { status: "insufficient"; unallocated: number };

export interface AllocationRecord {
  lotId: string;
  grnLineId: string;
  lotNumber: string;
  warehouseId: string | null;
  locationId: string | null;
  binId: string | null;
  quantity: number;
}

export interface AllocateInTxArgs {
  reservationId: string;
  actorId: string | null;
  quantity?: number;
  strategy?: "FIFO" | "FEFO";
  allowPartial?: boolean;
  lotId?: string | null;
}

function nextReservationStatus(
  reserved: number,
  allocated: number,
): "active" | "partially_allocated" | "fully_allocated" {
  if (allocated >= reserved) return "fully_allocated";
  if (allocated > 0) return "partially_allocated";
  return "active";
}

async function lineAvailable(tx: Transaction, grnLineId: string): Promise<number> {
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

async function lineHeld(tx: Transaction, grnLineId: string): Promise<number> {
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

async function lotHeld(tx: Transaction, lotId: string): Promise<number> {
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

export async function allocateInTx(
  tx: Transaction,
  args: AllocateInTxArgs,
): Promise<AllocationOutcome> {
  const [reservation] = await tx
    .select()
    .from(inventoryReservationsTable)
    .where(eq(inventoryReservationsTable.id, args.reservationId))
    .for("update")
    .limit(1);

  if (!reservation) return { status: "not_found" };

  if (
    reservation.expiresAt &&
    new Date(reservation.expiresAt) < new Date() &&
    ["active", "partially_allocated", "fully_allocated"].includes(reservation.status)
  ) {
    await tx
      .update(inventoryReservationsTable)
      .set({ status: "expired" })
      .where(eq(inventoryReservationsTable.id, reservation.id));
    return { status: "expired" };
  }

  if (!["active", "partially_allocated"].includes(reservation.status)) {
    return { status: "invalid_state", current: reservation.status };
  }

  const reserved = Number(reservation.reservedQty);
  const allocated = Number(reservation.allocatedQty);
  const remainder = reserved - allocated;
  const requested = args.quantity ?? remainder;
  if (remainder <= 0 || requested <= 0) return { status: "nothing" };
  if (requested > remainder) {
    return { status: "quantity_exceeds_remainder", remainder };
  }

  if (args.lotId) {
    const [forced] = await tx
      .select({
        id: inventoryLotsTable.id,
        materialId: inventoryLotsTable.materialId,
      })
      .from(inventoryLotsTable)
      .where(eq(inventoryLotsTable.id, args.lotId))
      .limit(1);
    if (!forced || forced.materialId !== reservation.materialId) return { status: "bad_lot" };
  }

  const lotConditions = [
    eq(inventoryLotsTable.materialId, reservation.materialId),
    eq(inventoryLotsTable.status, "active"),
    isNotNull(inventoryLotsTable.grnLineId),
  ];
  if (args.lotId) lotConditions.push(eq(inventoryLotsTable.id, args.lotId));

  const orderBy =
    args.strategy === "FEFO"
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

  const allocations: AllocationRecord[] = [];
  const lockedLines = new Map<string, number>();
  let need = requested;

  for (const lot of candidates) {
    if (need <= 0) break;
    const grnLineId = lot.grnLineId;
    if (!grnLineId) continue;

    if (!lockedLines.has(grnLineId)) {
      const [lineLock] = await tx
        .select({ id: grnLineItemsTable.id })
        .from(grnLineItemsTable)
        .where(eq(grnLineItemsTable.id, grnLineId))
        .for("update")
        .limit(1);
      if (!lineLock) continue;
      lockedLines.set(grnLineId, (await lineAvailable(tx, grnLineId)) - (await lineHeld(tx, grnLineId)));
    }

    const lineReservable = lockedLines.get(grnLineId)!;
    if (lineReservable <= 0) continue;
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

  if (allocations.length === 0 || (need > 0 && !args.allowPartial)) {
    return { status: "insufficient", unallocated: need };
  }

  const newAllocated = allocated + allocations.reduce((sum, item) => sum + item.quantity, 0);
  const [updated] = await tx
    .update(inventoryReservationsTable)
    .set({
      allocatedQty: String(newAllocated),
      status: nextReservationStatus(reserved, newAllocated),
    })
    .where(eq(inventoryReservationsTable.id, reservation.id))
    .returning();

  await tx.insert(outboxEventsTable).values({
    aggregateType: "inventory_reservation",
    aggregateId: reservation.id,
    eventType: "RESERVATION_ALLOCATED",
    payload: {
      reservation_number: reservation.reservationNumber,
      strategy: args.strategy ?? "FIFO",
      allocations: allocations.map((item) => ({
        lot_id: item.lotId,
        lot_number: item.lotNumber,
        grn_line_id: item.grnLineId,
        quantity: item.quantity,
      })),
      new_allocated_qty: newAllocated,
      actor_id: args.actorId,
    },
  });

  return { status: "ok", reservation: updated as Record<string, any>, allocations };
}

export type IssueToWipOutcome =
  | { status: "ok"; note: Record<string, any>; lines: Array<Record<string, any>>; reservation: Record<string, any> }
  | { status: "replay"; note: Record<string, any>; lines: Array<Record<string, any>> }
  | { status: "not_found" }
  | { status: "expired" }
  | { status: "invalid_state"; current: string }
  | { status: "nothing" }
  | { status: "exceeds"; issuable: number }
  | { status: "bad_lot" }
  | { status: "no_alloc" }
  | { status: "phys_unavailable" }
  | { status: "insufficient"; unissued: number };

export interface IssueToWipInTxArgs {
  reservationId: string;
  issueNumber: string;
  actorId: string;
  actorName: string | null;
  quantity?: number;
  lotId?: string | null;
  allowPartial?: boolean;
  notes?: string | null;
  idempotencyKey?: string | null;
  outboxEventType?: string;
  outboxPayload?: Record<string, unknown>;
}

function nextIssuedStatus(reserved: number, issued: number): "partially_issued" | "fully_issued" {
  return issued >= reserved ? "fully_issued" : "partially_issued";
}

export async function issueToWipInTx(
  tx: Transaction,
  args: IssueToWipInTxArgs,
): Promise<IssueToWipOutcome> {
  if (args.idempotencyKey) {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`wip-issue-idem:${args.idempotencyKey}`}))`,
    );
    const [existing] = await tx
      .select()
      .from(wipIssueNotesTable)
      .where(eq(wipIssueNotesTable.idempotencyKey, args.idempotencyKey))
      .limit(1);
    if (existing) {
      const lines = await tx
        .select()
        .from(wipIssueLinesTable)
        .where(eq(wipIssueLinesTable.wipIssueNoteId, existing.id));
      return { status: "replay", note: existing as Record<string, any>, lines: lines as Array<Record<string, any>> };
    }
  }

  const [reservation] = await tx
    .select()
    .from(inventoryReservationsTable)
    .where(eq(inventoryReservationsTable.id, args.reservationId))
    .for("update")
    .limit(1);
  if (!reservation) return { status: "not_found" };

  if (
    reservation.expiresAt &&
    new Date(reservation.expiresAt) < new Date() &&
    ["active", "partially_allocated", "fully_allocated", "partially_issued"].includes(
      reservation.status,
    )
  ) {
    await tx
      .update(inventoryReservationsTable)
      .set({ status: "expired" })
      .where(eq(inventoryReservationsTable.id, reservation.id));
    return { status: "expired" };
  }

  if (!["partially_allocated", "fully_allocated", "partially_issued"].includes(reservation.status)) {
    return { status: "invalid_state", current: reservation.status };
  }

  const reserved = Number(reservation.reservedQty);
  const allocated = Number(reservation.allocatedQty);
  const issued = Number(reservation.issuedQty);
  const issuable = allocated - issued;
  if (issuable <= 0) return { status: "nothing" };

  let need = args.quantity ?? issuable;
  if (need > issuable) {
    if (!args.allowPartial) return { status: "exceeds", issuable };
    need = issuable;
  }

  const allocations = await tx
    .select({
      allocation: inventoryReservationAllocationsTable,
      lot: inventoryLotsTable,
    })
    .from(inventoryReservationAllocationsTable)
    .innerJoin(
      inventoryLotsTable,
      eq(inventoryLotsTable.id, inventoryReservationAllocationsTable.lotId),
    )
    .where(
      and(
        eq(inventoryReservationAllocationsTable.reservationId, reservation.id),
        eq(inventoryReservationAllocationsTable.status, "active"),
        ...(args.lotId
          ? [eq(inventoryReservationAllocationsTable.lotId, args.lotId)]
          : []),
      ),
    )
    .orderBy(
      asc(inventoryLotsTable.receivedDate),
      asc(inventoryLotsTable.lotNumber),
      asc(inventoryReservationAllocationsTable.createdAt),
    )
    .for("update");

  if (!allocations.length) return { status: "no_alloc" };

  const [note] = await tx
    .insert(wipIssueNotesTable)
    .values({
      issueNumber: args.issueNumber,
      reservationId: reservation.id,
      productionOrderId: reservation.productionOrderId,
      status: "fully_issued",
      issuedBy: args.actorId,
      notes: args.notes ?? null,
      idempotencyKey: args.idempotencyKey ?? null,
    })
    .returning();

  const issueLines: Array<Record<string, any>> = [];
  const perLot = new Map<string, { lot: typeof allocations[number]["lot"]; qty: number }>();
  let remaining = need;

  for (const { allocation, lot } of allocations) {
    if (remaining <= 0) break;
    if (!lot.grnLineId || !lot.warehouseId) continue;

    await tx
      .select({ id: grnLineItemsTable.id })
      .from(grnLineItemsTable)
      .where(eq(grnLineItemsTable.id, lot.grnLineId))
      .for("update")
      .limit(1);

    const [balance] = await tx
      .select({
        sum: sql<string>`coalesce(sum(${inventoryTransactionsTable.quantity}), 0)`,
      })
      .from(inventoryTransactionsTable)
      .where(
        and(
          eq(inventoryTransactionsTable.sourceLineId, lot.grnLineId),
          eq(inventoryTransactionsTable.stockState, "available"),
        ),
      );
    const physicalAvailable = Number(balance?.sum ?? 0);
    const alreadyMoving = issueLines
      .filter((line) => line.grnLineId === lot.grnLineId)
      .reduce((sum, line) => sum + Number(line.quantity), 0);
    const allowed = Math.min(
      remaining,
      Number(allocation.quantity),
      Math.max(physicalAvailable - alreadyMoving, 0),
    );
    if (allowed <= 0) continue;
    remaining -= allowed;

    let issuedAllocationId = allocation.id;
    if (allowed < Number(allocation.quantity)) {
      await tx
        .update(inventoryReservationAllocationsTable)
        .set({ quantity: String(Number(allocation.quantity) - allowed) })
        .where(eq(inventoryReservationAllocationsTable.id, allocation.id));
      const [issuedSlice] = await tx
        .insert(inventoryReservationAllocationsTable)
        .values({
          reservationId: reservation.id,
          lotId: allocation.lotId,
          quantity: String(allowed),
          status: "issued",
        })
        .returning();
      issuedAllocationId = issuedSlice.id;
    } else {
      await tx
        .update(inventoryReservationAllocationsTable)
        .set({ status: "issued" })
        .where(eq(inventoryReservationAllocationsTable.id, allocation.id));
    }

    const [line] = await tx
      .insert(wipIssueLinesTable)
      .values({
        wipIssueNoteId: note.id,
        reservationAllocationId: issuedAllocationId,
        lotId: allocation.lotId,
        quantity: String(allowed),
        uom: reservation.uom,
      })
      .returning();
    issueLines.push({
      id: line.id,
      reservationAllocationId: line.reservationAllocationId,
      lotId: line.lotId,
      grnLineId: lot.grnLineId,
      quantity: String(allowed),
      uom: line.uom,
    });

    const lotTotal = perLot.get(allocation.lotId) ?? { lot, qty: 0 };
    lotTotal.qty += allowed;
    perLot.set(allocation.lotId, lotTotal);
  }

  const totalIssued = issueLines.reduce((sum, line) => sum + Number(line.quantity), 0);
  if (totalIssued <= 0) return { status: "phys_unavailable" };
  if (remaining > 0 && !args.allowPartial) {
    return { status: "insufficient", unissued: remaining };
  }

  for (const { lot, qty } of perLot.values()) {
    if (!lot.grnLineId || !lot.warehouseId) continue;
    const ledgerBase = {
      materialId: reservation.materialId,
      uom: reservation.uom,
      sourceDocumentType: "wip_issue_note",
      sourceDocumentId: note.id,
      sourceLineId: lot.grnLineId,
      lotId: lot.id,
      warehouseId: lot.warehouseId,
      locationId: lot.locationId,
      binId: lot.binId,
      productionOrderId: reservation.productionOrderId,
      actorId: args.actorId,
      actorName: args.actorName,
      createdBy: args.actorId,
    } as const;

    await tx.insert(inventoryTransactionsTable).values({
      ...ledgerBase,
      quantity: String(-qty),
      stockState: "available",
      transactionType: "PRODUCTION_ISSUE",
    });
    await tx.insert(inventoryTransactionsTable).values({
      ...ledgerBase,
      quantity: String(qty),
      stockState: "wip",
      transactionType: "WIP_RECEIPT",
    });
    await tx.insert(wipInventoryTable).values({
      productionOrderId: reservation.productionOrderId,
      materialId: reservation.materialId,
      lotId: lot.id,
      wipIssueNoteId: note.id,
      warehouseId: lot.warehouseId,
      locationId: lot.locationId,
      issuedQty: String(qty),
      consumedQty: "0",
      returnedQty: "0",
      scrappedQty: "0",
      remainingQty: String(qty),
      uom: reservation.uom,
      status: "active",
    });
  }

  const newIssued = issued + totalIssued;
  const [updatedReservation] = await tx
    .update(inventoryReservationsTable)
    .set({
      issuedQty: String(newIssued),
      status: nextIssuedStatus(reserved, newIssued),
    })
    .where(eq(inventoryReservationsTable.id, reservation.id))
    .returning();

  await tx.insert(outboxEventsTable).values({
    aggregateType: "wip_issue_note",
    aggregateId: note.id,
    eventType: args.outboxEventType ?? "WIP_ISSUE_CREATED",
    payload: {
      issue_number: args.issueNumber,
      reservation_id: reservation.id,
      reservation_number: reservation.reservationNumber,
      production_order_id: reservation.productionOrderId,
      lines: issueLines.map((line) => ({
        lot_id: line.lotId,
        quantity: Number(line.quantity),
      })),
      total_issued: totalIssued,
      actor_id: args.actorId,
      ...(args.outboxPayload ?? {}),
    },
  });

  return {
    status: "ok",
    note: note as Record<string, any>,
    lines: issueLines,
    reservation: updatedReservation as Record<string, any>,
  };
}

export async function nextWipIssueNumber(tx: Transaction): Promise<string> {
  await tx.execute(sql`
    SELECT setval(
      'wip_issue_seq',
      GREATEST(
        (SELECT last_value FROM wip_issue_seq),
        COALESCE(
          (
            SELECT max(substring(issue_number from '[0-9]+$')::bigint)
            FROM wip_issue_notes
            WHERE issue_number LIKE 'ISS-' || to_char(current_date, 'YYYYMMDD') || '-%'
          ),
          0
        )
      ),
      true
    )
  `);
  const result = await tx.execute(sql`SELECT nextval('wip_issue_seq') AS seq`);
  const rows = Array.isArray(result) ? result : (result as any).rows;
  const seq = Number(rows?.[0]?.seq ?? 0);
  const now = new Date();
  const date = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
  return `ISS-${date}-${String(seq).padStart(4, "0")}`;
}

export async function nextReservationNumber(tx: Transaction): Promise<string> {
  await tx.execute(sql`
    SELECT setval(
      'res_seq',
      GREATEST(
        (SELECT last_value FROM res_seq),
        COALESCE(
          (
            SELECT max(substring(reservation_number from '[0-9]+$')::bigint)
            FROM inventory_reservations
            WHERE reservation_number LIKE 'RSV-' || to_char(current_date, 'YYYYMMDD') || '-%'
          ),
          0
        )
      ),
      true
    )
  `);
  const result = await tx.execute(sql`SELECT nextval('res_seq') AS seq`);
  const rows = Array.isArray(result) ? result : (result as any).rows;
  const seq = Number(rows?.[0]?.seq ?? 0);
  const now = new Date();
  const date = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
  return `RSV-${date}-${String(seq).padStart(4, "0")}`;
}