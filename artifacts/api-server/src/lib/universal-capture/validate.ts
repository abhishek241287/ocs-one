/**
 * Phase 6 — shared capture validator (Constitution A1/A8/A14/A16).
 *
 * The order is frozen:
 * normalize → unit convert → precision/scale → min/max →
 * max_length → regex → required.
 */
import { normalizeUnit, type UnitRow } from "./units";
import {
  normalizeAttribute,
  parseNumericInput,
  type NormalizedPrimitive,
} from "./normalize";

export interface TemplateField {
  attributeId: string;
  attributeCode: string;
  dataType: string;
  required: boolean;
  sequence: number;
  defaultValue: string | null;
  unitCode: string | null;
  allowedUnits: string[] | null;
  allowedValues: string[] | null;
  precision: number | null;
  scale: number | null;
  minValue: string | null;
  maxValue: string | null;
  regex: string | null;
  maxLength: number | null;
}

export interface CaptureError {
  attribute_code: string;
  rule: string;
  input: unknown;
  normalized: unknown;
  message: string;
  row?: number;
  column?: string;
}

export interface ValidatedValue {
  attributeId: string;
  attributeCode: string;
  valueText: string | null;
  valueNum: string | null;
  valueBool: boolean | null;
  valueDate: Date | null;
  unit: string | null;
  valueOrigin: "EXPLICIT" | "DEFAULT" | "NORMALIZED";
}

interface CaptureAttribute {
  attribute_code: string;
  raw?: unknown;
}

interface CaptureAttributeInput {
  attributes: CaptureAttribute[];
}

function isBlank(raw: unknown): boolean {
  return (
    raw === null ||
    raw === undefined ||
    (typeof raw === "string" && raw.trim() === "")
  );
}

function decimalMetrics(value: number): { digits: number; decimals: number } {
  const text = Math.abs(value).toString().toLowerCase();
  const [coefficient, exponentText] = text.split("e");
  const exponent = exponentText ? Number(exponentText) : 0;
  const [whole, fraction = ""] = coefficient.split(".");
  const digitsText = `${whole}${fraction}`.replace(/^0+(?=\d)/, "");
  return {
    digits: digitsText.length,
    decimals: Math.max(0, fraction.length - exponent),
  };
}

function pushError(
  errors: CaptureError[],
  field: TemplateField,
  rule: string,
  input: unknown,
  normalized: unknown,
  message: string,
): void {
  errors.push({
    attribute_code: field.attributeCode,
    rule,
    input,
    normalized,
    message,
  });
}

export function validateCapture(
  input: CaptureAttributeInput,
  fields: TemplateField[],
  registry: UnitRow[],
): { ok: boolean; errors: CaptureError[]; values: ValidatedValue[] } {
  const errors: CaptureError[] = [];
  const values: ValidatedValue[] = [];
  const byCode = new Map(input.attributes.map((attribute) => [attribute.attribute_code, attribute]));

  for (const field of [...fields].sort((a, b) => a.sequence - b.sequence)) {
    const supplied = byCode.get(field.attributeCode);
    let raw: unknown = supplied?.raw;
    let origin: ValidatedValue["valueOrigin"] = "EXPLICIT";

    if (isBlank(raw) && field.defaultValue !== null) {
      raw = field.defaultValue;
      origin = "DEFAULT";
    }

    const normalized = normalizeAttribute(raw, field.dataType, field.allowedValues);
    if (normalized.error) {
      pushError(
        errors,
        field,
        normalized.error.rule,
        raw,
        null,
        normalized.error.message,
      );
      continue;
    }
    if (normalized.value === null) {
      if (field.required) {
        pushError(errors, field, "REQUIRED", raw, null, "Required value missing");
      }
      continue;
    }

    let valueNum: number | null = null;
    let unit: string | null = null;

    if (field.dataType === "INTEGER" || field.dataType === "DECIMAL") {
      const parsed = parseNumericInput(raw);
      const suppliedUnit = parsed?.unit ?? null;
      const unitResult = normalizeUnit(
        normalized.value as number,
        suppliedUnit,
        field,
        registry,
      );
      if (!unitResult.ok) {
        pushError(
          errors,
          field,
          unitResult.rule,
          raw,
          normalized.value,
          unitResult.message,
        );
        continue;
      }

      valueNum = unitResult.value;
      unit = unitResult.unit || null;
      origin = "NORMALIZED";

      const metrics = decimalMetrics(valueNum);
      if (field.precision !== null && metrics.digits > field.precision) {
        pushError(
          errors,
          field,
          "PRECISION",
          raw,
          valueNum,
          `Exceeds precision ${field.precision} (rejected, not rounded)`,
        );
        continue;
      }
      if (field.scale !== null && metrics.decimals > field.scale) {
        pushError(
          errors,
          field,
          "SCALE",
          raw,
          valueNum,
          `Exceeds scale ${field.scale} (rejected, not rounded)`,
        );
        continue;
      }
      if (field.minValue !== null && valueNum < Number(field.minValue)) {
        pushError(
          errors,
          field,
          "MIN",
          raw,
          valueNum,
          `Below minimum ${field.minValue}`,
        );
        continue;
      }
      if (field.maxValue !== null && valueNum > Number(field.maxValue)) {
        pushError(
          errors,
          field,
          "MAX",
          raw,
          valueNum,
          `Exceeds maximum ${field.maxValue}`,
        );
        continue;
      }
    }

    if (field.dataType === "TEXT") {
      const value = normalized.value as string;
      if (field.maxLength !== null && value.length > field.maxLength) {
        pushError(
          errors,
          field,
          "MAX_LENGTH",
          raw,
          value,
          `Exceeds max length ${field.maxLength}`,
        );
        continue;
      }
      if (field.regex) {
        let matches = false;
        try {
          matches = new RegExp(field.regex).test(value);
        } catch {
          pushError(errors, field, "REGEX", raw, value, "Invalid pattern");
          continue;
        }
        if (!matches) {
          pushError(errors, field, "REGEX", raw, value, "Pattern mismatch");
          continue;
        }
      }
    }

    const primitive: NormalizedPrimitive = normalized.value;
    values.push({
      attributeId: field.attributeId,
      attributeCode: field.attributeCode,
      valueText:
        field.dataType === "TEXT" || field.dataType === "DROPDOWN"
          ? String(primitive)
          : null,
      valueNum: valueNum === null ? null : String(valueNum),
      valueBool: field.dataType === "BOOLEAN" ? (primitive as boolean) : null,
      valueDate:
        field.dataType === "DATE" || field.dataType === "DATETIME"
          ? (primitive as Date)
          : null,
      unit,
      valueOrigin: origin,
    });
  }

  const knownCodes = new Set(fields.map((field) => field.attributeCode));
  for (const attribute of input.attributes) {
    if (!knownCodes.has(attribute.attribute_code)) {
      errors.push({
        attribute_code: attribute.attribute_code,
        rule: "UNKNOWN_ATTRIBUTE",
        input: attribute.raw,
        normalized: null,
        message: "Attribute not in template version",
      });
    }
  }

  return { ok: errors.length === 0, errors, values };
}