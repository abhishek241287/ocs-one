import type {
  AttributeTemplatePreview,
  CanonicalAttributeValue,
  GrnLineItemInput,
  MaterialMaster,
} from "@workspace/api-client-react";

export type InventoryLineDraft = {
  material_id: string;
  quantity_received: string;
  supplier_lot_number: string;
};

export type InventoryMaterial = MaterialMaster & {
  code?: string;
  name?: string;
  uom?: string;
  category_id?: string;
};

export type CaptureValues = CanonicalAttributeValue[];

export type InventoryInputContext = {
  supplierId: string;
  receivedDate: string;
  invoiceNumber: string;
  remarks: string;
  lines: InventoryLineDraft[];
  materials: InventoryMaterial[];
};

export type ManualCapturePanelProps = InventoryInputContext & {
  canSubmit: boolean;
  onLineChange: (index: number, patch: Partial<InventoryLineDraft>) => void;
  onSubmitted?: (documentId: string) => void;
};

export function toGrnLines(lines: InventoryLineDraft[]): GrnLineItemInput[] {
  return lines.map((line) => ({
    material_id: line.material_id,
    quantity_received: Number(line.quantity_received),
    supplier_lot_number: line.supplier_lot_number.trim() || undefined,
  }));
}

export function defaultCaptureValues(preview?: AttributeTemplatePreview): CaptureValues {
  return (preview?.fields ?? [])
    .filter((field) => field.default_value !== null && field.default_value !== undefined)
    .map((field) => ({
      attribute_code: field.attribute_code,
      raw: field.default_value,
      value: field.default_value,
      supplied_unit: field.unit ?? null,
    }));
}

export function captureValueMap(values: CaptureValues): Map<string, CanonicalAttributeValue> {
  return new Map(values.map((value) => [value.attribute_code, value]));
}

export function validateCaptureValues(
  preview: AttributeTemplatePreview | undefined,
  values: CaptureValues,
): string[] {
  const byCode = captureValueMap(values);
  return (preview?.fields ?? []).flatMap((field) => {
    if (!field.required) return [];
    const value = byCode.get(field.attribute_code)?.value;
    return value === undefined || value === null || String(value).trim() === ""
      ? [`${field.name} is required`]
      : [];
  });
}