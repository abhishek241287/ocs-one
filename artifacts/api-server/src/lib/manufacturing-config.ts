// ─── Manufacturing configuration — single source of truth ────────────────────
// Centralises the numeric manufacturing / charging thresholds that affect
// production behaviour so the values enforced on the shop floor are exactly what
// the /developer/configuration dashboard introspects and the SS-04 Configuration
// Integrity suite validates. This is the manufacturing-side mirror of
// lib/security-config.ts — config is read from here, never re-described.

import { STAGE_ORDER } from "@workspace/db";

/** Cell-balancing voltage-spread thresholds applied during the charging stage.
 * A pack's (max − min) cell-voltage delta in mV is graded against these bounds:
 *   delta ≤ passMaxMv     → "pass"
 *   delta ≤ warningMaxMv  → "warning"
 *   delta >  warningMaxMv → "fail"
 * Enforced in routes/manufacturing/stages.ts (charging completion). */
export const BALANCING_THRESHOLDS = {
  passMaxMv: 20,
  warningMaxMv: 50,
};

/** The canonical manufacturing stage sequence, in execution order. SS-04 asserts
 * the live STAGE_ORDER map matches this exactly (order, names, no duplicates). */
export const EXPECTED_STAGE_SEQUENCE = [
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

/** Manufacturing config rendered for the configuration dashboard. */
export function describeManufacturingConfig() {
  const stages = Object.entries(STAGE_ORDER)
    .sort((a, b) => a[1] - b[1])
    .map(([name, order]) => ({ name, order }));
  return {
    stages,
    stageCount: stages.length,
    balancing: { ...BALANCING_THRESHOLDS },
  };
}
