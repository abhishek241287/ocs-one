import { eq } from "drizzle-orm";
import type { Executor } from "@workspace/db";
import {
  inventoryLotsTable,
  materialsTable,
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
  if (envelope.v !== 1 || !QR_ENTITIES.includes(envelope.entity as QrEntity) || !isUuid(envelope.id)) {
    return { ok: false };
  }
  return {
    ok: true,
    entity: envelope.entity as QrEntity,
    id: envelope.id,
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
    return unknown(entity, id, "Serial QR cannot be resolved until a serial index exists");
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