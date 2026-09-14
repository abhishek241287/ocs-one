/**
 * Phase 6 — unit registry normalization (Constitution A8).
 *
 * conversionFactor is the database value used as:
 * value_canonical = value_supplied × conversionFactor.
 */
export interface UnitRow {
  unitCode: string;
  dimension: string;
  canonicalUnit: string;
  conversionFactor: string;
}

export interface UnitAttributeDefinition {
  unitCode: string | null;
  allowedUnits: string[] | null;
}

export type UnitNormalizationResult =
  | { ok: true; value: number; unit: string }
  | { ok: false; rule: string; message: string };

export function normalizeUnit(
  value: number,
  suppliedUnit: string | null | undefined,
  def: UnitAttributeDefinition,
  registry: UnitRow[],
): UnitNormalizationResult {
  if (!def.unitCode) return { ok: true, value, unit: "" };

  const defRow = registry.find(
    (row) => row.unitCode.toUpperCase() === def.unitCode?.toUpperCase(),
  );
  const dimension = defRow?.dimension;

  if (suppliedUnit == null || suppliedUnit.trim() === "") {
    return { ok: true, value, unit: def.unitCode };
  }

  const row = registry.find(
    (candidate) =>
      candidate.unitCode.toUpperCase() === suppliedUnit.trim().toUpperCase(),
  );
  if (!row) {
    return {
      ok: false,
      rule: "UNIT",
      message: `Unknown unit '${suppliedUnit}'`,
    };
  }
  if (dimension && row.dimension !== dimension) {
    return {
      ok: false,
      rule: "UNIT_DIMENSION",
      message: `Unit '${suppliedUnit}' is ${row.dimension}, expected ${dimension}`,
    };
  }
  if (
    def.allowedUnits &&
    def.allowedUnits.length > 0 &&
    !def.allowedUnits.some(
      (allowed) => allowed.toUpperCase() === row.unitCode.toUpperCase(),
    )
  ) {
    return {
      ok: false,
      rule: "UNIT_ALLOWED",
      message: `Unit '${suppliedUnit}' not allowed for this attribute`,
    };
  }

  const factor = Number(row.conversionFactor);
  if (!Number.isFinite(factor)) {
    return {
      ok: false,
      rule: "UNIT",
      message: `Unit '${row.unitCode}' has an invalid conversion factor`,
    };
  }
  return {
    ok: true,
    value: value * factor,
    unit: row.canonicalUnit,
  };
}