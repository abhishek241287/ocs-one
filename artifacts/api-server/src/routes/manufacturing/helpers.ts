import { db, pool } from "@workspace/db";
import {
  mfgBatteryTimelineTable,
  mfgStagetypeEnum,
} from "@workspace/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function todayDateStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export async function generateOrderNumber(_tx: Tx): Promise<string> {
  const { rows } = await pool.query("SELECT nextval('mfg_order_seq') AS seq");
  const seq = String(rows[0].seq).padStart(6, "0");
  return `PO-${todayDateStr()}-${seq}`;
}

export async function generateBatteryNumber(_tx: Tx): Promise<string> {
  const { rows } = await pool.query("SELECT nextval('mfg_battery_seq') AS seq");
  const seq = String(rows[0].seq).padStart(6, "0");
  return `BAT-${todayDateStr()}-${seq}`;
}

export type StageTypeValue = (typeof mfgStagetypeEnum.enumValues)[number];

export const STAGE_META: { type: StageTypeValue; label: string; shortLabel: string }[] = [
  { type: "cell_allocation",  label: "Cell Allocation",  shortLabel: "Cell Alloc" },
  { type: "assembly",         label: "Assembly",          shortLabel: "Assembly" },
  { type: "compression",      label: "Compression",       shortLabel: "Compress" },
  { type: "bms_allocation",   label: "BMS Installation",  shortLabel: "BMS Install" },
  { type: "bms_programming",  label: "BMS Programming",   shortLabel: "BMS Prog" },
  { type: "charging",         label: "Charging",          shortLabel: "Charging" },
  { type: "testing",          label: "Testing",           shortLabel: "Testing" },
  { type: "quality_control",  label: "Quality Control",   shortLabel: "QC" },
  { type: "packing",          label: "Packing",           shortLabel: "Packing" },
];

export const STAGE_SEQUENCE: StageTypeValue[] = STAGE_META.map((s) => s.type);

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
