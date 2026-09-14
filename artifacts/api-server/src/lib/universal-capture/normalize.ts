/**
 * Phase 6 — per-datatype normalization (Constitution A8).
 *
 * Blank is always null. In particular, blank is never coerced to zero.
 */
export type NormalizedPrimitive = string | number | boolean | Date;

export interface NormalizationError {
  rule: string;
  message: string;
}

export interface AttributeNormalization {
  value: NormalizedPrimitive | null;
  error?: NormalizationError;
}

export interface ParsedNumericInput {
  value: number;
  unit: string | null;
}

const NUMERIC_WITH_OPTIONAL_UNIT =
  /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*(?:([^\s]+))?\s*$/i;

function isBlank(raw: unknown): boolean {
  return (
    raw === null ||
    raw === undefined ||
    (typeof raw === "string" && raw.trim() === "")
  );
}

function unwrapNumericInput(raw: unknown): { value: unknown; unit: string | null } {
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    const candidate = raw as { value?: unknown; unit?: unknown };
    if ("value" in candidate) {
      return {
        value: candidate.value,
        unit:
          typeof candidate.unit === "string" && candidate.unit.trim() !== ""
            ? candidate.unit.trim()
            : null,
      };
    }
  }
  return { value: raw, unit: null };
}

export function parseNumericInput(raw: unknown): ParsedNumericInput | null {
  const unwrapped = unwrapNumericInput(raw);
  if (typeof unwrapped.value === "number") {
    return Number.isFinite(unwrapped.value)
      ? { value: unwrapped.value, unit: unwrapped.unit }
      : null;
  }
  if (typeof unwrapped.value !== "string") return null;

  const match = unwrapped.value.match(NUMERIC_WITH_OPTIONAL_UNIT);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return {
    value,
    unit: unwrapped.unit ?? match[2] ?? null,
  };
}

export function normalizeAttribute(
  raw: unknown,
  dataType: string,
  allowedValues: string[] | null,
): AttributeNormalization {
  if (isBlank(raw)) return { value: null };

  switch (dataType) {
    case "TEXT":
      return { value: String(raw) };

    case "INTEGER": {
      const parsed = parseNumericInput(raw);
      if (!parsed || !Number.isInteger(parsed.value)) {
        return {
          value: null,
          error: { rule: "TYPE", message: "Expected integer" },
        };
      }
      return { value: parsed.value };
    }

    case "DECIMAL": {
      const parsed = parseNumericInput(raw);
      if (!parsed) {
        return {
          value: null,
          error: { rule: "TYPE", message: "Expected number" },
        };
      }
      return { value: parsed.value };
    }

    case "BOOLEAN": {
      const value = String(raw).trim().toLowerCase();
      if (["true", "yes", "1"].includes(value)) return { value: true };
      if (["false", "no", "0"].includes(value)) return { value: false };
      return {
        value: null,
        error: {
          rule: "TYPE",
          message: "Expected boolean (true/false/yes/no/1/0)",
        },
      };
    }

    case "DATE":
    case "DATETIME": {
      const date = raw instanceof Date ? new Date(raw.getTime()) : new Date(String(raw));
      if (Number.isNaN(date.getTime())) {
        return {
          value: null,
          error: {
            rule: "TYPE",
            message: `Invalid ${dataType.toLowerCase()}`,
          },
        };
      }
      return { value: date };
    }

    case "DROPDOWN": {
      const input = String(raw).trim();
      const canonical = (allowedValues ?? []).find(
        (value) => value.toUpperCase() === input.toUpperCase(),
      );
      if (canonical === undefined) {
        return {
          value: null,
          error: {
            rule: "ALLOWED_VALUES",
            message: "Value not in allowed set",
          },
        };
      }
      return { value: canonical };
    }

    default:
      return {
        value: null,
        error: { rule: "TYPE", message: `Unsupported data type ${dataType}` },
      };
  }
}