import { decimalString } from "./decimal";

export interface UnitRow {
  unitCode: string;
  dimension: string;
  canonicalUnit: string;
  conversionFactor: string;
}

export interface UnitField {
  unitCode: string | null;
  allowedUnits: string[] | null;
}

export type UnitNormalizationResult =
  | { ok: true; value: string; unit: string }
  | { ok: false; rule: string; message: string };

export function normalizeUnit(
  value: number | string,
  suppliedUnit: string | null | undefined,
  def: UnitField,
  registry: UnitRow[],
): UnitNormalizationResult {
  const normalizedSuppliedUnit = suppliedUnit?.trim() ?? "";

  if (!def.unitCode) {
    if (def.allowedUnits?.length) {
      return {
        ok: false,
        rule: "CONFIGURATION",
        message: "allowedUnits set without canonical unit",
      };
    }
    if (normalizedSuppliedUnit) {
      return {
        ok: false,
        rule: "UNIT_NOT_ALLOWED",
        message: `Attribute is unitless; '${normalizedSuppliedUnit}' not permitted`,
      };
    }
    return { ok: true, value: decimalString(value), unit: "" };
  }

  const defRow = registry.find(
    (row) => row.unitCode.toUpperCase() === def.unitCode?.toUpperCase(),
  );
  if (!defRow) {
    return {
      ok: false,
      rule: "CONFIGURATION",
      message: `Canonical unit '${def.unitCode}' not in registry`,
    };
  }

  if (!normalizedSuppliedUnit) {
    return {
      ok: true,
      value: decimalString(value),
      unit: defRow.canonicalUnit,
    };
  }

  const row = registry.find(
    (candidate) =>
      candidate.unitCode.toUpperCase() === normalizedSuppliedUnit.toUpperCase(),
  );
  if (!row) {
    return {
      ok: false,
      rule: "UNIT",
      message: `Unknown unit '${normalizedSuppliedUnit}'`,
    };
  }
  if (row.dimension !== defRow.dimension) {
    return {
      ok: false,
      rule: "UNIT_DIMENSION",
      message: `'${normalizedSuppliedUnit}' is ${row.dimension}, expected ${defRow.dimension}`,
    };
  }
  if (
    !def.allowedUnits?.length &&
    row.unitCode.toUpperCase() !== defRow.unitCode.toUpperCase()
  ) {
    return {
      ok: false,
      rule: "UNIT_ALLOWED",
      message: `'${normalizedSuppliedUnit}' not allowed; only '${defRow.unitCode}' is canonical`,
    };
  }
  if (
    def.allowedUnits?.length &&
    !def.allowedUnits.some(
      (allowed) => allowed.toUpperCase() === row.unitCode.toUpperCase(),
    )
  ) {
    return {
      ok: false,
      rule: "UNIT_ALLOWED",
      message: `'${normalizedSuppliedUnit}' not allowed for this attribute`,
    };
  }
  if (
    row.canonicalUnit.toUpperCase() === defRow.canonicalUnit.toUpperCase() &&
    row.unitCode.toUpperCase() === defRow.unitCode.toUpperCase()
  ) {
    return { ok: true, value: decimalString(value), unit: row.canonicalUnit };
  }

  const factor = Number(row.conversionFactor);
  if (!Number.isFinite(factor)) {
    return {
      ok: false,
      rule: "CONFIGURATION",
      message: `Unit '${row.unitCode}' has an invalid conversion factor`,
    };
  }
  const converted = Number(value) * factor;
  return {
    ok: true,
    value: decimalString(converted),
    unit: row.canonicalUnit,
  };
}