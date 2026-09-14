import { asc, and, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import type { CanonicalCaptureInput } from "@workspace/api-zod";
import {
  attributeCaptureInstancesTable,
  attributeCaptureValuesTable,
  attributeDefinitionsTable,
  attributeTemplateAttributesTable,
  attributeTemplateVersionsTable,
  attributeTemplatesTable,
  db,
  grnHeadersTable,
  grnLineItemsTable,
  materialTemplateMappingsTable,
  materialsTable,
  outboxEventsTable,
  pool,
  unitDefinitionsTable,
  type Executor,
  type Transaction,
} from "@workspace/db";
import { resolveTemplate, type TemplateResolution } from "./resolve";
import { validateCapture, type CaptureAttribute, type TemplateField, type ValidatedValue } from "./validate";
import type { UnitRow } from "./units";
import { registerCaptureAdapter } from "./adapters";
import { indexSerialInTx } from "../serial-index";

type CaptureSourceType = "MANUAL" | "CSV" | "SCAN" | "API" | "SYSTEM";

export class GrnCaptureError extends Error {
  constructor(
    public readonly statusCode: 400 | 422,
    public readonly payload: Record<string, unknown>,
  ) {
    super(String(payload.error ?? "GRN capture failed"));
    this.name = "GrnCaptureError";
  }
}

export interface GrnDraftLine {
  materialId: string;
  quantityReceived: number | string;
  uom: string;
  purchaseOrderLineId?: string | null;
  supplierLotNumber?: string | null;
  remarks?: string | null;
}

export interface GrnDraftInput {
  grnNumber: string;
  supplierId: string;
  purchaseOrderId?: string | null;
  invoiceNumber?: string | null;
  receivedDate: string;
  remarks?: string | null;
  actorId?: string | null;
  lines: GrnDraftLine[];
}

export async function nextGrnNumber(now = new Date()): Promise<string> {
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const { rows } = await pool.query("SELECT nextval('grn_seq') AS seq");
  return `GRN-${dateStr}-${String(rows[0].seq).padStart(4, "0")}`;
}

/**
 * The one GRN draft insert sequence shared by the manual route and the
 * confirmation adapter. Validation belongs to the caller; this helper only
 * writes the document and its lines in the caller's transaction.
 */
export async function insertGrnDraft(tx: Transaction, input: GrnDraftInput): Promise<string> {
  const [header] = await tx
    .insert(grnHeadersTable)
    .values({
      grnNumber: input.grnNumber,
      supplierId: input.supplierId,
      purchaseOrderId: input.purchaseOrderId ?? null,
      invoiceNumber: input.invoiceNumber ?? null,
      receivedDate: input.receivedDate,
      status: "draft",
      remarks: input.remarks ?? null,
      createdBy: input.actorId ?? null,
    })
    .returning({ id: grnHeadersTable.id });
  if (!header) throw new Error("GRN insert returned no row");

  await tx.insert(grnLineItemsTable).values(
    input.lines.map((line, index) => ({
      grnId: header.id,
      lineNumber: index + 1,
      materialId: line.materialId,
      purchaseOrderLineId: line.purchaseOrderLineId ?? null,
      quantityReceived: String(line.quantityReceived),
      uom: line.uom as any,
      supplierLotNumber: line.supplierLotNumber ?? null,
      remarks: line.remarks ?? null,
    })),
  );
  return header.id;
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : null;
}

export async function buildTemplateFields(
  executor: Executor,
  versionId: string,
): Promise<TemplateField[]> {
  const rows = await executor
    .select({
      attributeId: attributeDefinitionsTable.id,
      attributeCode: attributeDefinitionsTable.code,
      dataType: attributeDefinitionsTable.dataType,
      required: attributeTemplateAttributesTable.required,
      sequence: attributeTemplateAttributesTable.sequence,
      defaultValue: attributeTemplateAttributesTable.defaultValue,
      unitOverride: attributeTemplateAttributesTable.unitOverride,
      attributeUnit: attributeDefinitionsTable.unitCode,
      allowedUnits: attributeDefinitionsTable.allowedUnits,
      allowedValuesOverride: attributeTemplateAttributesTable.allowedValuesOverride,
      allowedValues: attributeDefinitionsTable.allowedValues,
      precision: attributeDefinitionsTable.precision,
      scale: attributeDefinitionsTable.scale,
      minValue: attributeDefinitionsTable.minValue,
      maxValue: attributeDefinitionsTable.maxValue,
      regex: attributeDefinitionsTable.regex,
      maxLength: attributeDefinitionsTable.maxLength,
    })
    .from(attributeTemplateAttributesTable)
    .innerJoin(
      attributeDefinitionsTable,
      eq(attributeDefinitionsTable.id, attributeTemplateAttributesTable.attributeId),
    )
    .where(eq(attributeTemplateAttributesTable.templateVersionId, versionId))
    .orderBy(asc(attributeTemplateAttributesTable.sequence));

  return rows.map((row) => ({
    attributeId: row.attributeId,
    attributeCode: row.attributeCode,
    dataType: row.dataType,
    required: row.required,
    sequence: row.sequence,
    defaultValue: row.defaultValue,
    unitCode: row.unitOverride ?? row.attributeUnit,
    allowedUnits: stringArray(row.allowedUnits),
    allowedValues: stringArray(row.allowedValuesOverride ?? row.allowedValues),
    precision: row.precision,
    scale: row.scale,
    minValue: row.minValue,
    maxValue: row.maxValue,
    regex: row.regex,
    maxLength: row.maxLength,
  }));
}

export async function loadUnitRegistry(executor: Executor): Promise<UnitRow[]> {
  const rows = await executor
    .select({
      unitCode: unitDefinitionsTable.unitCode,
      dimension: unitDefinitionsTable.dimension,
      canonicalUnit: unitDefinitionsTable.canonicalUnit,
      conversionFactor: unitDefinitionsTable.conversionFactor,
    })
    .from(unitDefinitionsTable)
    .where(eq(unitDefinitionsTable.active, true));
  return rows.map((row) => ({
    unitCode: row.unitCode,
    dimension: row.dimension,
    canonicalUnit: row.canonicalUnit,
    conversionFactor: String(row.conversionFactor),
  }));
}

export async function resolveForMaterial(
  executor: Executor,
  materialId: string,
  resolutionDate: Date,
): Promise<TemplateResolution> {
  const [material] = await executor
    .select({
      id: materialsTable.id,
      categoryId: materialsTable.categoryId,
    })
    .from(materialsTable)
    .where(eq(materialsTable.id, materialId))
    .limit(1);
  if (!material) return { kind: "NO_TEMPLATE" };

  const effectivePredicate = (scope: "MATERIAL" | "CATEGORY", id: string) =>
    and(
      eq(materialTemplateMappingsTable.scope, scope),
      eq(materialTemplateMappingsTable.status, "ACTIVE"),
      eq(
        scope === "MATERIAL"
          ? materialTemplateMappingsTable.materialId
          : materialTemplateMappingsTable.categoryId,
        id,
      ),
      lte(materialTemplateMappingsTable.effectiveFrom, resolutionDate),
      or(
        isNull(materialTemplateMappingsTable.effectiveTo),
        gt(materialTemplateMappingsTable.effectiveTo, resolutionDate),
      ),
    );

  const materialMappings = await executor
    .select({ templateId: materialTemplateMappingsTable.templateId })
    .from(materialTemplateMappingsTable)
    .where(effectivePredicate("MATERIAL", material.id));
  const categoryMappings = await executor
    .select({ templateId: materialTemplateMappingsTable.templateId })
    .from(materialTemplateMappingsTable)
    .where(effectivePredicate("CATEGORY", material.categoryId));
  const templateIds = [
    ...new Set([
      ...materialMappings.map((mapping) => mapping.templateId),
      ...categoryMappings.map((mapping) => mapping.templateId),
    ]),
  ];
  const versions = templateIds.length
    ? await executor
        .select({
          templateVersionId: attributeTemplateVersionsTable.id,
          templateId: attributeTemplateVersionsTable.templateId,
          status: attributeTemplateVersionsTable.status,
          effectiveFrom: attributeTemplateVersionsTable.effectiveFrom,
          effectiveTo: attributeTemplateVersionsTable.effectiveTo,
        })
        .from(attributeTemplateVersionsTable)
        .where(inArray(attributeTemplateVersionsTable.templateId, templateIds))
    : [];

  return resolveTemplate({
    materialMappings,
    categoryMappings,
    resolutionDate,
    versions: (mapping) =>
      versions.filter((version) => version.templateId === mapping.templateId),
  });
}

function displayValue(value: ValidatedValue): string | null {
  if (value.valueText !== null) return value.valueText;
  if (value.valueNum !== null) return value.unit ? `${value.valueNum} ${value.unit}` : value.valueNum;
  if (value.valueBool !== null) return String(value.valueBool);
  if (value.valueDate !== null) return value.valueDate.toISOString();
  return null;
}

export async function persistCapture(
  tx: Transaction,
  params: {
    lineId: string;
    materialId: string;
    templateVersionId: string;
    sourceType: CaptureSourceType;
    sourceSessionId?: string | null;
    sourceRowRef?: string | null;
    createdBy?: string | null;
  },
  values: ValidatedValue[],
): Promise<{ instanceId: string }> {
  const [instance] = await tx
    .insert(attributeCaptureInstancesTable)
    .values({
      targetType: "GRN_LINE",
      targetId: params.lineId,
      templateVersionId: params.templateVersionId,
      materialId: params.materialId,
      status: "VALIDATED",
      sourceType: params.sourceType,
      sourceSessionId: params.sourceSessionId ?? null,
      sourceRowRef: params.sourceRowRef ?? null,
      createdBy: params.createdBy ?? null,
    })
    .returning({ id: attributeCaptureInstancesTable.id });
  if (!instance) throw new Error("Capture instance insert returned no row");

  if (values.length > 0) {
    await tx.insert(attributeCaptureValuesTable).values(
      values.map((value) => ({
        captureInstanceId: instance.id,
        attributeId: value.attributeId,
        valueText: value.valueText,
        valueNum: value.valueNum,
        valueBool: value.valueBool,
        valueDate: value.valueDate,
        unit: value.unit,
        valueOrigin: value.valueOrigin,
        displayCache: { display: displayValue(value) },
      })),
    );
  }

  const serialAttributeIds = values.length > 0
    ? new Set(
        (
          await tx
            .select({
              id: attributeDefinitionsTable.id,
              code: attributeDefinitionsTable.code,
              scope: attributeDefinitionsTable.scope,
            })
            .from(attributeDefinitionsTable)
            .where(inArray(attributeDefinitionsTable.id, values.map((value) => value.attributeId)))
        )
          .filter((definition) => definition.scope === "SERIAL" || definition.code === "serial_number")
          .map((definition) => definition.id),
      )
    : new Set<string>();

  if (serialAttributeIds.size > 0) {
    const [line] = await tx
      .select({ lotId: grnLineItemsTable.lotId })
      .from(grnLineItemsTable)
      .where(eq(grnLineItemsTable.id, params.lineId))
      .limit(1);

    for (const value of values) {
      if (!serialAttributeIds.has(value.attributeId)) continue;
      const raw = value.valueText ?? displayValue(value);
      const serialNumber = raw == null ? "" : String(raw).trim();
      if (!serialNumber) continue;
      await indexSerialInTx(tx, {
        serialNumber,
        materialId: params.materialId,
        lotId: line?.lotId ?? null,
        captureInstanceId: instance.id,
        sourceDocumentType: "grn_line",
        sourceDocumentId: params.lineId,
        createdBy: params.createdBy ?? null,
        actorId: params.createdBy ?? null,
      });
    }
  }

  await tx.insert(outboxEventsTable).values({
    aggregateType: "grn_line",
    aggregateId: params.lineId,
    eventType: "CAPTURE_RECORDED",
    payload: {
      target_type: "GRN_LINE",
      target_id: params.lineId,
      capture_instance_id: instance.id,
      template_version_id: params.templateVersionId,
      material_id: params.materialId,
      source_type: params.sourceType,
      value_count: values.length,
    },
  });
  return { instanceId: instance.id };
}

function normalizeInputAttributes(attributes: CanonicalCaptureInput["attributes"]): CaptureAttribute[] {
  return attributes.map((attribute) => ({
    attribute_code: attribute.attribute_code,
    raw: attribute.raw,
    value: attribute.value === undefined ? attribute.raw : attribute.value,
    supplied_unit: attribute.supplied_unit,
  }));
}

export async function validateAndPersistGrnCapture(
  tx: Transaction,
  params: {
    lineId: string;
    materialId: string;
    attributes: CanonicalCaptureInput["attributes"];
    sourceType?: CaptureSourceType;
    sourceSessionId?: string | null;
    sourceRowRef?: string | null;
    createdBy?: string | null;
    resolutionDate: Date;
  },
): Promise<{ instanceId: string; templateVersionId: string }> {
  const resolution = await resolveForMaterial(tx, params.materialId, params.resolutionDate);
  if (resolution.kind === "NO_TEMPLATE") {
    throw new GrnCaptureError(422, {
      error: "NO_TEMPLATE",
      line_number: params.sourceRowRef ? Number(params.sourceRowRef) || null : null,
      material_id: params.materialId,
    });
  }
  if (resolution.kind === "ERROR") {
    throw new GrnCaptureError(422, {
      error: "TEMPLATE_RESOLUTION",
      reason: resolution.reason,
      material_id: params.materialId,
    });
  }

  const fields = await buildTemplateFields(tx, resolution.templateVersionId);
  const registry = await loadUnitRegistry(tx);
  const validated = validateCapture(
    { attributes: normalizeInputAttributes(params.attributes) },
    fields,
    registry,
  );
  if (!validated.ok) {
    throw new GrnCaptureError(422, {
      error: "CAPTURE_VALIDATION",
      capture_errors: validated.errors.map((error) => ({
        ...error,
        row: params.sourceRowRef ? Number(params.sourceRowRef) || undefined : undefined,
      })),
    });
  }

  const persisted = await persistCapture(
    tx,
    {
      lineId: params.lineId,
      materialId: params.materialId,
      templateVersionId: resolution.templateVersionId,
      sourceType: params.sourceType ?? "MANUAL",
      sourceSessionId: params.sourceSessionId,
      sourceRowRef: params.sourceRowRef,
      createdBy: params.createdBy,
    },
    validated.values,
  );
  return { ...persisted, templateVersionId: resolution.templateVersionId };
}

export interface GrnLineCaptureProjection {
  template_version_id: string;
  template_id: string;
  template_code: string;
  version_no: number;
  fields: Array<{
    attribute_code: string;
    name: string;
    data_type: string;
    value_text: string | null;
    value_num: number | string | null;
    value_bool: boolean | null;
    value_date: Date | null;
    unit: string | null;
    value_origin: string;
    display: string | null;
  }>;
}

export async function readGrnLineCaptures(
  lineIds: string[],
): Promise<Map<string, GrnLineCaptureProjection>> {
  const captures = new Map<string, GrnLineCaptureProjection>();
  if (lineIds.length === 0) return captures;

  const instances = await db
    .select({
      id: attributeCaptureInstancesTable.id,
      lineId: attributeCaptureInstancesTable.targetId,
      templateVersionId: attributeCaptureInstancesTable.templateVersionId,
      templateId: attributeTemplateVersionsTable.templateId,
      templateCode: attributeTemplatesTable.code,
      versionNo: attributeTemplateVersionsTable.versionNo,
      createdAt: attributeCaptureInstancesTable.createdAt,
    })
    .from(attributeCaptureInstancesTable)
    .innerJoin(
      attributeTemplateVersionsTable,
      eq(attributeTemplateVersionsTable.id, attributeCaptureInstancesTable.templateVersionId),
    )
    .innerJoin(
      attributeTemplatesTable,
      eq(attributeTemplatesTable.id, attributeTemplateVersionsTable.templateId),
    )
    .where(
      and(
        eq(attributeCaptureInstancesTable.targetType, "GRN_LINE"),
        inArray(attributeCaptureInstancesTable.targetId, lineIds),
      ),
    )
    .orderBy(asc(attributeCaptureInstancesTable.createdAt));
  if (instances.length === 0) return captures;

  const latestByLine = new Map<string, (typeof instances)[number]>();
  for (const instance of instances) latestByLine.set(instance.lineId, instance);
  const values = await db
    .select({
      captureInstanceId: attributeCaptureValuesTable.captureInstanceId,
      attributeCode: attributeDefinitionsTable.code,
      name: attributeDefinitionsTable.name,
      dataType: attributeDefinitionsTable.dataType,
      valueText: attributeCaptureValuesTable.valueText,
      valueNum: attributeCaptureValuesTable.valueNum,
      valueBool: attributeCaptureValuesTable.valueBool,
      valueDate: attributeCaptureValuesTable.valueDate,
      unit: attributeCaptureValuesTable.unit,
      valueOrigin: attributeCaptureValuesTable.valueOrigin,
      displayCache: attributeCaptureValuesTable.displayCache,
    })
    .from(attributeCaptureValuesTable)
    .innerJoin(
      attributeDefinitionsTable,
      eq(attributeDefinitionsTable.id, attributeCaptureValuesTable.attributeId),
    )
    .where(inArray(attributeCaptureValuesTable.captureInstanceId, [...latestByLine.values()].map((row) => row.id)));

  const valuesByInstance = new Map<string, typeof values>();
  for (const value of values) {
    const list = valuesByInstance.get(value.captureInstanceId) ?? [];
    list.push(value);
    valuesByInstance.set(value.captureInstanceId, list);
  }
  for (const [lineId, instance] of latestByLine) {
    captures.set(lineId, {
      template_version_id: instance.templateVersionId,
      template_id: instance.templateId,
      template_code: instance.templateCode,
      version_no: instance.versionNo,
      fields: (valuesByInstance.get(instance.id) ?? []).map((value) => ({
        attribute_code: value.attributeCode,
        name: value.name,
        data_type: value.dataType,
        value_text: value.valueText,
        value_num: value.valueNum === null ? null : Number(value.valueNum),
        value_bool: value.valueBool,
        value_date: value.valueDate,
        unit: value.unit,
        value_origin: value.valueOrigin,
        display:
          typeof value.displayCache === "object" &&
          value.displayCache !== null &&
          "display" in value.displayCache
            ? String((value.displayCache as { display?: unknown }).display ?? "")
            : null,
      })),
    });
  }
  return captures;
}

type GrnAdapterInput = CanonicalCaptureInput & {
  supplier_id?: string;
  received_date?: string;
  invoice_number?: string | null;
  remarks?: string | null;
};

export interface GrnBatchContext {
  supplierId: string;
  receivedDate: string;
  actorId?: string | null;
  templateVersionId: string;
}

export async function confirmBatch(
  tx: Transaction,
  inputs: CanonicalCaptureInput[],
  validatedRows: ValidatedValue[][],
  context: GrnBatchContext,
): Promise<{ documentId: string; lineIds: string[] }> {
  if (inputs.length === 0 || inputs.length !== validatedRows.length) {
    throw new Error("GRN_BATCH_INPUT_MISMATCH");
  }
  const materials = await tx
    .select({ id: materialsTable.id, code: materialsTable.code, uom: materialsTable.uom })
    .from(materialsTable)
    .where(inArray(materialsTable.id, inputs.map((input) => input.material_id)));
  const materialById = new Map(materials.map((material) => [material.id, material]));
  const lines = inputs.map((input) => {
    const material = materialById.get(input.material_id);
    if (!material) throw new Error(`Unknown material id '${input.material_id}'`);
    return {
      materialId: material.id,
      quantityReceived: input.quantity,
      uom: material.uom,
      supplierLotNumber: input.lot_number ?? null,
    };
  });
  const grnId = await insertGrnDraft(tx, {
    grnNumber: await nextGrnNumber(),
    supplierId: context.supplierId,
    receivedDate: context.receivedDate,
    actorId: context.actorId,
    lines,
  });
  const insertedLines = await tx
    .select({ id: grnLineItemsTable.id, lineNumber: grnLineItemsTable.lineNumber })
    .from(grnLineItemsTable)
    .where(eq(grnLineItemsTable.grnId, grnId))
    .orderBy(asc(grnLineItemsTable.lineNumber));
  if (insertedLines.length !== inputs.length) {
    throw new Error("GRN_BATCH_LINE_COUNT_MISMATCH");
  }
  for (let index = 0; index < inputs.length; index += 1) {
    await persistCapture(
      tx,
      {
        lineId: insertedLines[index]!.id,
        materialId: inputs[index]!.material_id,
        templateVersionId: context.templateVersionId,
        sourceType: "CSV",
        sourceSessionId: inputs[index]!.source.session_id,
        sourceRowRef: inputs[index]!.source.row_ref,
        createdBy: context.actorId,
      },
      validatedRows[index]!,
    );
  }
  return { documentId: grnId, lineIds: insertedLines.map((line) => line.id) };
}

const batchAdapter = {
  targetType: "GRN_LINE",
  confirmBatch,
  confirm: async (input: CanonicalCaptureInput, validated: ValidatedValue[]) => {
    const context = input as GrnAdapterInput;
    if (!context.supplier_id || !context.received_date) {
      throw new Error(
        "GRN_ADAPTER_CONTEXT_REQUIRED: supplier_id and received_date are required to confirm a GRN",
      );
    }
    const grnNumber = await nextGrnNumber();
    const documentId = await db.transaction(async (tx) => {
      const [material] = await tx
        .select({ id: materialsTable.id, uom: materialsTable.uom })
        .from(materialsTable)
        .where(eq(materialsTable.id, input.material_id))
        .limit(1);
      if (!material) throw new Error(`Unknown material id '${input.material_id}'`);
      const grnId = await insertGrnDraft(tx, {
        grnNumber,
        supplierId: context.supplier_id!,
        invoiceNumber: context.invoice_number,
        receivedDate: context.received_date!,
        remarks: context.remarks,
        lines: [{
          materialId: material.id,
          quantityReceived: input.quantity,
          uom: material.uom,
          supplierLotNumber: input.lot_number,
        }],
      });
      const [line] = await tx
        .select({ id: grnLineItemsTable.id })
        .from(grnLineItemsTable)
        .where(and(eq(grnLineItemsTable.grnId, grnId), eq(grnLineItemsTable.lineNumber, 1)))
        .limit(1);
      if (!line) throw new Error("GRN line insert returned no row");
      const resolution = await resolveForMaterial(tx, input.material_id, new Date());
      if (resolution.kind !== "OK") {
        throw new Error(
          resolution.kind === "ERROR"
            ? `GRN_ADAPTER_TEMPLATE_ERROR: ${resolution.reason}`
            : "GRN_ADAPTER_NO_TEMPLATE",
        );
      }
      await persistCapture(
        tx,
        {
          lineId: line.id,
          materialId: input.material_id,
          templateVersionId: resolution.templateVersionId,
          sourceType: input.source.type,
          sourceSessionId: input.source.session_id,
          sourceRowRef: input.source.row_ref,
        },
        validated,
      );
      return grnId;
    });
    return { documentId };
  },
};

registerCaptureAdapter(batchAdapter as any);