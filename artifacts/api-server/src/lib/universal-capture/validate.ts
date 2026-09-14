import {
  decimalCompare,
  decimalScale,
  decimalSignificants,
  decimalString,
} from "./decimal";
import { normalizeAttribute, type NormalizedPrimitive } from "./normalize";
import { normalizeUnit, type UnitRow } from "./units";

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

export interface CaptureAttribute {
  attribute_code: string;
  raw?: unknown;
  value?: unknown;
  supplied_unit?: string | null;
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

function isBlank(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "")
  );
}

function evidenceFor(attribute: CaptureAttribute | undefined): unknown {
  if (!attribute) return null;
  return "raw" in attribute ? attribute.raw : attribute.value ?? null;
}

function pushError(
  errors: CaptureError[],
  field: TemplateField | null,
  attributeCode: string,
  rule: string,
  input: unknown,
  normalized: unknown,
  message: string,
): void {
  errors.push({
    attribute_code: field?.attributeCode ?? attributeCode,
    rule,
    input,
    normalized,
    message,
  });
}

export function validateCapture(
  input: { attributes: CaptureAttribute[] },
  fields: TemplateField[],
  registry: UnitRow[],
): { ok: boolean; errors: CaptureError[]; values: ValidatedValue[] } {
  const errors: CaptureError[] = [];
  const values: ValidatedValue[] = [];

  const seen = new Set<string>();
  for (const attribute of input.attributes) {
    if (seen.has(attribute.attribute_code)) {
      errors.push({
        attribute_code: attribute.attribute_code,
        rule: "DUPLICATE_ATTRIBUTE",
        input: evidenceFor(attribute),
        normalized: null,
        message: "Attribute supplied more than once",
      });
    }
    seen.add(attribute.attribute_code);
  }
  if (errors.length > 0) return { ok: false, errors, values };

  const byCode = new Map(
    input.attributes.map((attribute) => [attribute.attribute_code, attribute]),
  );

  for (const field of [...fields].sort((a, b) => a.sequence - b.sequence)) {
    const supplied = byCode.get(field.attributeCode);
    let raw: unknown = supplied?.value;
    let suppliedUnit = supplied?.supplied_unit ?? null;
    let origin: ValidatedValue["valueOrigin"] = "EXPLICIT";

    if (isBlank(raw) && field.defaultValue !== null) {
      raw = field.defaultValue;
      suppliedUnit = null;
      origin = "DEFAULT";
    }

    const normalized = normalizeAttribute(raw, field.dataType, field.allowedValues);
    if (normalized.error) {
      pushError(
        errors,
        field,
        field.attributeCode,
        normalized.error.rule,
        evidenceFor(supplied),
        null,
        normalized.error.message,
      );
      continue;
    }
    if (normalized.value === null) {
      if (field.required) {
        pushError(
          errors,
          field,
          field.attributeCode,
          "REQUIRED",
          evidenceFor(supplied),
          null,
          "Required value missing",
        );
      }
      continue;
    }

    if (origin === "EXPLICIT") {
      const explicitZero =
        (field.dataType === "INTEGER" || field.dataType === "DECIMAL") &&
        (raw === 0 || (typeof raw === "string" && raw.trim() === "0"));
      if (!explicitZero) origin = "NORMALIZED";
    }

    let valueNum: string | null = null;
    let unit: string | null = null;
    if (field.dataType === "INTEGER" || field.dataType === "DECIMAL") {
      if (!field.unitCode && suppliedUnit) {
        pushError(
          errors,
          field,
          field.attributeCode,
          "UNIT_NOT_ALLOWED",
          evidenceFor(supplied),
          normalized.value,
          `Attribute is unitless; '${suppliedUnit}' not permitted`,
        );
        continue;
      }
      if (!field.unitCode && !field.allowedUnits?.length) {
        pushError(
          errors,
          field,
          field.attributeCode,
          "CONFIGURATION",
          evidenceFor(supplied),
          normalized.value,
          "Numeric attribute requires a canonical unit",
        );
        continue;
      }

      const unitResult = normalizeUnit(
        normalized.value as number | string,
        suppliedUnit,
        field,
        registry,
      );
      if (!unitResult.ok) {
        pushError(
          errors,
          field,
          field.attributeCode,
          unitResult.rule,
          evidenceFor(supplied),
          normalized.value,
          unitResult.message,
        );
        continue;
      }
      valueNum = unitResult.value;
      unit = unitResult.unit || null;

      if (field.precision !== null && decimalSignificants(valueNum) > field.precision) {
        pushError(
          errors,
          field,
          field.attributeCode,
          "PRECISION",
          evidenceFor(supplied),
          valueNum,
          `Exceeds precision ${field.precision} (rejected, not rounded)`,
        );
        continue;
      }
      if (field.scale !== null && decimalScale(valueNum) > field.scale) {
        pushError(
          errors,
          field,
          field.attributeCode,
          "SCALE",
          evidenceFor(supplied),
          valueNum,
          `Exceeds scale ${field.scale} (rejected, not rounded)`,
        );
        continue;
      }
      if (
        field.minValue !== null &&
        decimalCompare(valueNum, decimalString(field.minValue)) < 0
      ) {
        pushError(
          errors,
          field,
          field.attributeCode,
          "MIN",
          evidenceFor(supplied),
          valueNum,
          `Below minimum ${field.minValue}`,
        );
        continue;
      }
      if (
        field.maxValue !== null &&
        decimalCompare(valueNum, decimalString(field.maxValue)) > 0
      ) {
        pushError(
          errors,
          field,
          field.attributeCode,
          "MAX",
          evidenceFor(supplied),
          valueNum,
          `Exceeds maximum ${field.maxValue}`,
        );
        continue;
      }
    }

    if (field.dataType === "TEXT") {
      const text = normalized.value as string;
      if (field.maxLength !== null && text.length > field.maxLength) {
        pushError(
          errors,
          field,
          field.attributeCode,
          "MAX_LENGTH",
          evidenceFor(supplied),
          text,
          `Exceeds max length ${field.maxLength}`,
        );
        continue;
      }
      if (field.regex) {
        let matches = false;
        try {
          matches = new RegExp(field.regex).test(text);
        } catch {
          pushError(
            errors,
            field,
            field.attributeCode,
            "REGEX",
            evidenceFor(supplied),
            text,
            "Invalid pattern",
          );
          continue;
        }
        if (!matches) {
          pushError(
            errors,
            field,
            field.attributeCode,
            "REGEX",
            evidenceFor(supplied),
            text,
            "Pattern mismatch",
          );
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
      valueNum,
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
        input: evidenceFor(attribute),
        normalized: null,
        message: "Attribute not in template version",
      });
    }
  }

  return { ok: errors.length === 0, errors, values };
}