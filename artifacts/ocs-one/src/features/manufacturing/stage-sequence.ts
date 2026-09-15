export const MANUFACTURING_STAGE_SEQUENCE = [
  "cell_allocation",
  "assembly",
  "compression",
  "bms_allocation",
  "bms_programming",
  "charging",
  "testing",
  "quality_control",
  "packing",
] as const;

export type ManufacturingStage = (typeof MANUFACTURING_STAGE_SEQUENCE)[number];

export const MANUFACTURING_STAGE_LABELS: Record<ManufacturingStage, string> = {
  cell_allocation: "Cell Allocation",
  assembly: "Assembly",
  compression: "Compression",
  bms_allocation: "BMS Installation",
  bms_programming: "BMS Programming",
  charging: "Charging",
  testing: "Testing",
  quality_control: "Quality Control",
  packing: "Packing",
};

export function getStageProgress(stage: string | null | undefined) {
  if (!stage) return null;
  const index = MANUFACTURING_STAGE_SEQUENCE.indexOf(stage as ManufacturingStage);
  if (index === -1) return null;

  return {
    step: index + 1,
    total: MANUFACTURING_STAGE_SEQUENCE.length,
    percent: Math.round(((index + 1) / MANUFACTURING_STAGE_SEQUENCE.length) * 100),
  };
}