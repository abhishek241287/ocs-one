import { eq } from "drizzle-orm";
import type { Executor } from "@workspace/db";
import {
  inventoryLotsTable,
  materialsTable,
  serialUnitsTable,
} from "@workspace/db";

export const QR_ENTITIES = [
  "material",
  "lot",
  "serial",
  "location",
  "warehouse",
  "document",
] as const;
export type QrEntity = (typeof QR_ENTITIES)[number];

export type DecodedPayload =
  | { ok: true; entity: QrEntity; id: string; label?: string }
  | { ok: false };

export type ResolvedEntity =
  | {
      ok: true;
      entity: QrEntity;
      id: string;
      materialId?: string;
      lotNumber?: string;
      serialNumber?: string;
      productionOrderId?: string;
      productId?: string;
      confirmable: boolean;
      state: "RESOLVED";
      errors?: Array<{ rule: string; message: string }>;
    }
  | {
      ok: false;
      entity?: QrEntity;
      id?: string;
      state: "UNKNOWN";
      errors: Array<{ rule: "UNKNOWN_SCAN"; message: string }>;
    };

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function decodePayload(raw: string): DecodedPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false };
  }
  if (!parsed || typeof parsed !== "object") return { ok: false };
  const envelope = parsed as Record<string, unknown>;
  const entity = envelope.entity as QrEntity;
  const validId = entity === "serial"
    ? typeof envelope.id === "string" && envelope.id.trim().length > 0
    : isUuid(envelope.id);
  if (envelope.v !== 1 || !QR_ENTITIES.includes(entity) || !validId) {
    return { ok: false };
  }
  return {
    ok: true,
    entity,
    id: envelope.id as string,
    ...(typeof envelope.label === "string" ? { label: envelope.label } : {}),
  };
}

function unknown(
  entity?: QrEntity,
  id?: string,
  message = "Scan payload could not be resolved",
): ResolvedEntity {
  return {
    ok: false,
    ...(entity ? { entity } : {}),
    ...(id ? { id } : {}),
    state: "UNKNOWN",
    errors: [{ rule: "UNKNOWN_SCAN", message }],
  };
}

export async function resolveEntity(
  entity: QrEntity,
  id: string,
  executor: Executor,
): Promise<ResolvedEntity> {
  if (entity === "material") {
    const [material] = await executor
      .select({ id: materialsTable.id })
      .from(materialsTable)
      .where(eq(materialsTable.id, id))
      .limit(1);
    return material
      ? { ok: true, entity, id, materialId: material.id, confirmable: true, state: "RESOLVED" }
      : unknown(entity, id, "Material QR does not identify an existing material");
  }

  if (entity === "lot") {
    const [lot] = await executor
      .select({
        id: inventoryLotsTable.id,
        materialId: inventoryLotsTable.materialId,
        lotNumber: inventoryLotsTable.lotNumber,
      })
      .from(inventoryLotsTable)
      .where(eq(inventoryLotsTable.id, id))
      .limit(1);
    return lot
      ? {
          ok: true,
          entity,
          id,
          materialId: lot.materialId,
          lotNumber: lot.lotNumber,
          confirmable: true,
          state: "RESOLVED",
        }
      : unknown(entity, id, "Lot QR does not identify an existing inventory lot");
  }

  if (entity === "serial") {
    const [serial] = await executor
      .select({
        id: serialUnitsTable.id,
        serialNumber: serialUnitsTable.serialNumber,
        materialId: serialUnitsTable.materialId,
        lotNumber: inventoryLotsTable.lotNumber,
        productionOrderId: serialUnitsTable.productionOrderId,
        productId: serialUnitsTable.productId,
      })
      .from(serialUnitsTable)
      .leftJoin(inventoryLotsTable, eq(inventoryLotsTable.id, serialUnitsTable.lotId))
      .where(eq(serialUnitsTable.serialNumber, id))
      .limit(1);
    return serial
      ? {
          ok: true,
          entity,
          id: serial.id,
          materialId: serial.materialId,
          lotNumber: serial.lotNumber ?? undefined,
          serialNumber: serial.serialNumber,
        productionOrderId: serial.productionOrderId ?? undefined,
        productId: serial.productId ?? undefined,
          confirmable: true,
          state: "RESOLVED",
        }
      : unknown(entity, id, "Serial QR does not identify an indexed serial");
  }

  return {
    ok: true,
    entity,
    id,
    confirmable: false,
    state: "RESOLVED",
    errors: [{
      rule: "NON_CONFIRMABLE_SCAN",
      message: `${entity} scans are identified but not confirmable in Phase 6`,
    }],
  };
}