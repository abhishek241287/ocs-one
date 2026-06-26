import { db } from "@workspace/db";
import {
  mfgProductionOrdersTable,
  mfgBatteryTimelineTable,
  mfgStagetypeEnum,
} from "@workspace/db";
import { like, count } from "drizzle-orm";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function todayDateStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export async function generateOrderNumber(tx: Tx): Promise<string> {
  const dateStr = todayDateStr();
  const prefix = `PO-${dateStr}-`;
  const [result] = await tx
    .select({ count: count() })
    .from(mfgProductionOrdersTable)
    .where(like(mfgProductionOrdersTable.orderNumber, `${prefix}%`));
  const seq = ((result?.count as number) ?? 0) + 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

export async function generateBatteryNumber(tx: Tx): Promise<string> {
  const dateStr = todayDateStr();
  const prefix = `BAT-${dateStr}-`;
  const [result] = await tx
    .select({ count: count() })
    .from(mfgProductionOrdersTable)
    .where(like(mfgProductionOrdersTable.batteryNumber, `${prefix}%`));
  const seq = ((result?.count as number) ?? 0) + 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

export type StageTypeValue = (typeof mfgStagetypeEnum.enumValues)[number];

// Sprint 5 stage sequence: Cell Allocation → Assembly → Compression → BMS Install → BMS Programming → (future)
export const STAGE_SEQUENCE: StageTypeValue[] = [
  "cell_allocation",
  "assembly",
  "compression",
  "bms_allocation",
  "bms_programming",
  "charging",
  "testing",
  "quality_control",
  "packing",
];

export function getNextStage(current: StageTypeValue): StageTypeValue | null {
  const idx = STAGE_SEQUENCE.indexOf(current);
  if (idx === -1 || idx === STAGE_SEQUENCE.length - 1) return null;
  return STAGE_SEQUENCE[idx + 1];
}

export async function logEvent(
  tx: Tx,
  opts: {
    productionOrderId: string;
    eventType: string;
    stageType?: StageTypeValue;
    actor: string;
    description: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await tx.insert(mfgBatteryTimelineTable).values({
    productionOrderId: opts.productionOrderId,
    eventType: opts.eventType,
    stageType: opts.stageType,
    actor: opts.actor,
    description: opts.description,
    metadata: opts.metadata ?? {},
  });
}
