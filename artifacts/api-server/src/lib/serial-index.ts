import { and, eq, sql } from "drizzle-orm";
import {
  type Transaction,
  outboxEventsTable,
  securityEventsTable,
  serialUnitsTable,
} from "@workspace/db";

export type SerialIndexInput = {
  serialNumber: string;
  materialId: string;
  lotId?: string | null;
  captureInstanceId?: string | null;
  productionOrderId?: string | null;
  productId?: string | null;
  sourceDocumentType: string;
  sourceDocumentId: string;
  createdBy?: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
};

export type SerialIndexResult =
  | { status: "created"; id: string }
  | { status: "existing"; id: string }
  | { status: "enriched"; id: string };

export class SerialConflictError extends Error {
  readonly code = "SERIAL_CONFLICT";
  readonly statusCode = 409;

  constructor(
    public readonly serialNumber: string,
    public readonly existingMaterialId: string,
    public readonly requestedMaterialId: string,
    public readonly existingLotId: string | null,
    public readonly requestedLotId: string | null,
  ) {
    super(`Serial "${serialNumber}" is already indexed with a different material or lot`);
    this.name = "SerialConflictError";
  }
}

function sameNullable(left: string | null | undefined, right: string | null | undefined): boolean {
  return (left ?? null) === (right ?? null);
}

async function writeSerialAudit(
  tx: Transaction,
  input: SerialIndexInput,
  serialUnitId: string,
  operation: "created" | "enriched",
): Promise<void> {
  const payload = {
    serial_unit_id: serialUnitId,
    serial_number: input.serialNumber,
    material_id: input.materialId,
    lot_id: input.lotId ?? null,
    capture_instance_id: input.captureInstanceId ?? null,
    production_order_id: input.productionOrderId ?? null,
    product_id: input.productId ?? null,
    source_document_type: input.sourceDocumentType,
    source_document_id: input.sourceDocumentId,
    operation,
  };

  await tx.insert(outboxEventsTable).values({
    aggregateType: "serial_unit",
    aggregateId: serialUnitId,
    eventType: "SERIAL_INDEXED",
    payload,
  });

  await tx.insert(securityEventsTable).values({
    eventType: "serial.indexed",
    severity: "info",
    actorId: input.actorId ?? input.createdBy ?? null,
    actorEmail: input.actorEmail ?? null,
    actorRole: input.actorRole ?? null,
    method: "SYSTEM",
    path: "serial_units",
    statusCode: 201,
    detail: JSON.stringify({
      serial_number: input.serialNumber,
      serial_unit_id: serialUnitId,
      source_document_type: input.sourceDocumentType,
      source_document_id: input.sourceDocumentId,
      operation,
    }).slice(0, 1000),
  });
}

/**
 * Index one observed serial in the caller's transaction.
 *
 * The advisory lock closes the absent-row race before the unique lookup. A
 * serial may never be silently re-pointed to another material or lot. Replays
 * of the same observation are no-ops; later observations may only enrich the
 * optional Product/order/capture references when identity agrees.
 */
export async function indexSerialInTx(
  tx: Transaction,
  input: SerialIndexInput,
): Promise<SerialIndexResult> {
  const serialNumber = input.serialNumber.trim();
  if (!serialNumber) throw new Error("SERIAL_INDEX_EMPTY");

  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`serial-index:${serialNumber}`}))`);

  const [existing] = await tx
    .select({
      id: serialUnitsTable.id,
      materialId: serialUnitsTable.materialId,
      lotId: serialUnitsTable.lotId,
      captureInstanceId: serialUnitsTable.captureInstanceId,
      productionOrderId: serialUnitsTable.productionOrderId,
      productId: serialUnitsTable.productId,
      sourceDocumentType: serialUnitsTable.sourceDocumentType,
      sourceDocumentId: serialUnitsTable.sourceDocumentId,
    })
    .from(serialUnitsTable)
    .where(eq(serialUnitsTable.serialNumber, serialNumber))
    .for("update")
    .limit(1);

  if (existing) {
    if (
      existing.materialId !== input.materialId ||
      !sameNullable(existing.lotId, input.lotId)
    ) {
      throw new SerialConflictError(
        serialNumber,
        existing.materialId,
        input.materialId,
        existing.lotId,
        input.lotId ?? null,
      );
    }

    if (
      existing.sourceDocumentType === input.sourceDocumentType &&
      existing.sourceDocumentId === input.sourceDocumentId
    ) {
      return { status: "existing", id: existing.id };
    }

    const enrichment = {
      ...(existing.captureInstanceId ? {} : input.captureInstanceId ? { captureInstanceId: input.captureInstanceId } : {}),
      ...(existing.productionOrderId ? {} : input.productionOrderId ? { productionOrderId: input.productionOrderId } : {}),
      ...(existing.productId ? {} : input.productId ? { productId: input.productId } : {}),
    };

    if (Object.keys(enrichment).length === 0) {
      return { status: "existing", id: existing.id };
    }

    await tx
      .update(serialUnitsTable)
      .set(enrichment)
      .where(eq(serialUnitsTable.id, existing.id));
    await writeSerialAudit(tx, { ...input, serialNumber }, existing.id, "enriched");
    return { status: "enriched", id: existing.id };
  }

  const [created] = await tx
    .insert(serialUnitsTable)
    .values({
      serialNumber,
      materialId: input.materialId,
      lotId: input.lotId ?? null,
      captureInstanceId: input.captureInstanceId ?? null,
      productionOrderId: input.productionOrderId ?? null,
      productId: input.productId ?? null,
      sourceDocumentType: input.sourceDocumentType,
      sourceDocumentId: input.sourceDocumentId,
      createdBy: input.createdBy ?? null,
    })
    .returning({ id: serialUnitsTable.id });
  if (!created) throw new Error("SERIAL_INDEX_INSERT_FAILED");

  await writeSerialAudit(tx, { ...input, serialNumber }, created.id, "created");
  return { status: "created", id: created.id };
}