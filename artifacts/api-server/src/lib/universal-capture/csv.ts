import crypto from "node:crypto";
import type { CanonicalCaptureInput } from "@workspace/api-zod";
import type { TemplateField } from "./validate";

export interface CsvMetadata {
  template: string;
  version: string;
  generated: string;
  hash: string;
}

export interface ParsedImportRow {
  rowNumber: number;
  raw: Record<string, string>;
  supplierCode: string;
  materialCode: string;
  canonical: Omit<CanonicalCaptureInput, "material_id"> & { material_code: string };
}

export class CsvImportError extends Error {
  constructor(
    public readonly code: "INVALID_SCHEMA" | "INVALID_CSV",
    public readonly details?: Record<string, unknown>,
  ) {
    super(code);
    this.name = "CsvImportError";
  }
}

const SYSTEM_COLUMNS = ["supplier_code", "material_code", "lot_number", "quantity"] as const;

function escapeCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseRecord(line: string): string[] {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      cells.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  if (quoted) throw new CsvImportError("INVALID_CSV", { message: "Unclosed CSV quote" });
  cells.push(value);
  return cells;
}

function parseLines(payload: string): string[] {
  return payload.replace(/^\uFEFF/, "").split(/\r?\n/);
}

export function readCsvMetadata(payload: string): CsvMetadata {
  const metadata: Partial<CsvMetadata> = {};
  for (const line of parseLines(payload)) {
    if (line.trim() === "") continue;
    if (!line.startsWith("#")) break;
    const match = /^#(template|version|generated|hash):\s*(.*)$/.exec(line);
    if (match) metadata[match[1] as keyof CsvMetadata] = match[2] ?? "";
  }
  if (
    !metadata.template ||
    !metadata.version ||
    !metadata.generated ||
    metadata.hash === undefined
  ) {
    throw new CsvImportError("INVALID_SCHEMA", { reason: "Missing CSV metadata" });
  }
  return metadata as CsvMetadata;
}

export function sha256(payload: string): string {
  return crypto.createHash("sha256").update(payload, "utf8").digest("hex");
}

export function generateCsv(params: {
  templateCode: string;
  versionNo: number;
  fields: TemplateField[];
  generatedAt?: Date;
}): string {
  const attributeColumns = params.fields.map((field) => field.attributeCode);
  const unitColumns = params.fields
    .filter((field) => Boolean(field.unitCode))
    .map((field) => `${field.attributeCode}unit`);
  const columns = [...SYSTEM_COLUMNS, ...attributeColumns, ...unitColumns];
  const generated = (params.generatedAt ?? new Date()).toISOString();
  const prefix = [
    `#template: ${params.templateCode}`,
    `#version: ${params.versionNo}`,
    `#generated: ${generated}`,
    "#hash:",
    columns.map(escapeCell).join(","),
    "",
  ].join("\n");
  const hash = sha256(prefix);
  return prefix.replace("#hash:", `#hash: ${hash}`);
}

export function parseCsv(payload: string, fields: TemplateField[]): {
  metadata: CsvMetadata;
  rows: ParsedImportRow[];
} {
  const lines = parseLines(payload);
  const metadata = readCsvMetadata(payload);
  let headerIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.trim() === "") continue;
    if (line.startsWith("#")) {
      continue;
    }
    headerIndex = index;
    break;
  }
  if (
    headerIndex < 0 ||
    !metadata.template ||
    !metadata.version ||
    !metadata.generated ||
    metadata.hash === undefined
  ) {
    throw new CsvImportError("INVALID_SCHEMA", { reason: "Missing CSV metadata or header" });
  }

  const headers = parseRecord(lines[headerIndex] ?? "").map((header) => header.trim());
  const expectedAttributes = new Map(fields.map((field) => [field.attributeCode, field]));
  const unitCodes = new Set(
    fields.filter((field) => field.unitCode).map((field) => `${field.attributeCode}unit`),
  );
  const expected = new Set([...SYSTEM_COLUMNS, ...expectedAttributes.keys(), ...unitCodes]);
  const unknown = headers.filter((header) => !expected.has(header));
  const duplicates = headers.filter((header, index) => headers.indexOf(header) !== index);
  if (
    unknown.length > 0 ||
    duplicates.length > 0 ||
    SYSTEM_COLUMNS.some((column, index) => headers[index] !== column)
  ) {
    throw new CsvImportError("INVALID_SCHEMA", {
      unknown_columns: unknown,
      duplicate_columns: duplicates,
      expected_system_columns: SYSTEM_COLUMNS,
    });
  }

  const rows: ParsedImportRow[] = [];
  for (let lineIndex = headerIndex + 1, rowNumber = 1; lineIndex < lines.length; lineIndex += 1, rowNumber += 1) {
    const line = lines[lineIndex] ?? "";
    if (line.trim() === "") continue;
    const cells = parseRecord(line);
    if (cells.length !== headers.length) {
      throw new CsvImportError("INVALID_CSV", {
        row: rowNumber,
        message: `Expected ${headers.length} cells, received ${cells.length}`,
      });
    }
    const raw = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
    const attributes = fields
      .map((field) => {
        const cell = raw[field.attributeCode] ?? "";
        const unit = field.unitCode ? raw[`${field.attributeCode}unit`] ?? "" : "";
        if (cell.trim() === "" && unit.trim() === "") return null;
        const numeric = ["DECIMAL", "INTEGER"].includes(field.dataType);
        return {
          attribute_code: field.attributeCode,
          ...(numeric ? { value: cell } : { raw: cell }),
          ...(unit.trim() ? { supplied_unit: unit.trim() } : {}),
        };
      })
      .filter((attribute): attribute is NonNullable<typeof attribute> => attribute !== null);
    const quantity = Number(raw.quantity);
    rows.push({
      rowNumber,
      raw,
      supplierCode: raw.supplier_code ?? "",
      materialCode: raw.material_code ?? "",
      canonical: {
        material_code: raw.material_code ?? "",
        lot_number: raw.lot_number || null,
        quantity,
        attributes,
        source: { type: "CSV", row_ref: String(rowNumber) },
      },
    });
  }
  if (rows.length === 0) throw new CsvImportError("INVALID_SCHEMA", { reason: "CSV has no data rows" });
  return {
    metadata,
    rows,
  };
}