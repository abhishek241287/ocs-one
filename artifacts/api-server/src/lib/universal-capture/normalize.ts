export const BOOLEAN_SPELLINGS: Record<string, boolean> = {
  true: true,
  yes: true,
  "1": true,
  false: false,
  no: false,
  "0": false,
};

export type NormalizedPrimitive = string | number | boolean | Date;

export interface NormalizationError {
  rule: string;
  message: string;
}

export interface AttributeNormalization {
  value: NormalizedPrimitive | null;
  error?: NormalizationError;
}

export function normalizeAttribute(
  raw: unknown,
  dataType: string,
  allowedValues: string[] | null,
): AttributeNormalization {
  const blank =
    raw === null ||
    raw === undefined ||
    (typeof raw === "string" && raw.trim() === "");
  if (blank) return { value: null };

  switch (dataType) {
    case "TEXT":
      return { value: String(raw) };

    case "INTEGER": {
      const value = String(raw).trim();
      if (!/^-?\d+$/.test(value)) {
        return {
          value: null,
          error: { rule: "TYPE", message: "Expected integer" },
        };
      }
      const numeric = Number(value);
      if (!Number.isSafeInteger(numeric)) {
        return {
          value: null,
          error: { rule: "TYPE", message: "Expected safe integer" },
        };
      }
      return { value: numeric };
    }

    case "DECIMAL": {
      const value = String(raw).trim();
      if (!/^-?\d+(?:\.\d+)?$/.test(value)) {
        return {
          value: null,
          error: { rule: "TYPE", message: "Expected decimal" },
        };
      }
      return { value };
    }

    case "BOOLEAN": {
      const value = BOOLEAN_SPELLINGS[String(raw).trim().toLowerCase()];
      if (value === undefined) {
        return {
          value: null,
          error: {
            rule: "TYPE",
            message: "Expected boolean (true/false/yes/no/1/0)",
          },
        };
      }
      return { value };
    }

    case "DATE": {
      const value = String(raw).trim();
      if (!/^\d{4}-\d{2}-\d{2}/.test(value)) {
        return {
          value: null,
          error: { rule: "TYPE", message: "DATE must be YYYY-MM-DD" },
        };
      }
      const datePart = value.slice(0, 10);
      if (value !== datePart) {
        return {
          value: null,
          error: { rule: "TYPE", message: "DATE must be YYYY-MM-DD" },
        };
      }
      const date = new Date(`${datePart}T00:00:00Z`);
      if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== datePart) {
        return {
          value: null,
          error: { rule: "TYPE", message: "Invalid calendar date" },
        };
      }
      return { value: date };
    }

    case "DATETIME": {
      const value = String(raw).trim();
      if (
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/.test(
          value,
        )
      ) {
        return {
          value: null,
          error: {
            rule: "TYPE",
            message: "DATETIME must be ISO-8601 with timezone offset",
          },
        };
      }
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return {
          value: null,
          error: { rule: "TYPE", message: "Invalid datetime" },
        };
      }
      return { value: date };
    }

    case "DROPDOWN": {
      const value = String(raw).trim();
      const canonical = (allowedValues ?? []).find(
        (candidate) => candidate.toUpperCase() === value.toUpperCase(),
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