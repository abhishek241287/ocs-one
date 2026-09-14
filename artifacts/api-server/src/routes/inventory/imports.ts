import { Router, type Request, type Response } from "express";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  attributeTemplateVersionsTable,
  attributeTemplatesTable,
  db,
  importRowsTable,
  importSessionsTable,
  materialsTable,
  suppliersTable,
  outboxEventsTable,
} from "@workspace/db";
import {
  CanonicalCaptureInput,
  ImportCsvBody,
} from "@workspace/api-zod";
import { requireAuth, requireWriteRole } from "../../middleware/auth";
import {
  buildTemplateFields,
  confirmBatch,
  loadUnitRegistry,
  nextGrnNumber,
  resolveForMaterial,
} from "../../lib/universal-capture/grn-adapter";
import { validateCapture, type CaptureError, type ValidatedValue } from "../../lib/universal-capture/validate";
import {
  CsvImportError,
  generateCsv,
  parseCsv,
  readCsvMetadata,
  sha256,
  type ParsedImportRow,
} from "../../lib/universal-capture/csv";

const router = Router();
router.use(requireAuth);
router.use(requireWriteRole("supervisor", "director"));

type StoredCanonical = CanonicalCaptureInput & {
  material_code: string;
  supplier_code: string;
};

function idParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] ?? "" : value;
}

function sessionJson(row: Record<string, any>): Record<string, unknown> {
  return {
    id: row.id,
    import_number: row.importNumber,
    file_hash: row.fileHash,
    filename: row.filename,
    template_version_id: row.templateVersionId,
    status: row.status,
    total_rows: row.totalRows,
    valid_rows: row.validRows,
    invalid_rows: row.invalidRows,
    confirm_key: row.confirmKey,
    downstream_document_id: row.downstreamDocumentId,
    created_by: row.createdBy,
    created_at: row.createdAt,
  };
}

function rowJson(row: Record<string, any>): Record<string, unknown> {
  return {
    id: row.id,
    row_number: row.rowNumber,
    raw: row.raw,
    canonical: row.canonical,
    status: row.status,
    errors: row.errors,
    grn_line_id: row.grnLineId,
  };
}

function isoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function importNumber(sequence: number): string {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate(),
  ).padStart(2, "0")}`;
  return `IMP-${date}-${String(sequence).padStart(4, "0")}`;
}

async function templateForCodeVersion(templateCode: string, versionNo: number) {
  const [row] = await db
    .select({
      templateId: attributeTemplatesTable.id,
      templateCode: attributeTemplatesTable.code,
      versionId: attributeTemplateVersionsTable.id,
      versionNo: attributeTemplateVersionsTable.versionNo,
      status: attributeTemplateVersionsTable.status,
    })
    .from(attributeTemplateVersionsTable)
    .innerJoin(
      attributeTemplatesTable,
      eq(attributeTemplatesTable.id, attributeTemplateVersionsTable.templateId),
    )
    .where(
      and(
        eq(attributeTemplatesTable.code, templateCode),
        eq(attributeTemplateVersionsTable.versionNo, versionNo),
      ),
    )
    .limit(1);
  return row;
}

function captureErrors(errors: CaptureError[], rowNumber: number): CaptureError[] {
  return errors.map((error) => ({ ...error, row: rowNumber }));
}

function validatorAttributes(input: CanonicalCaptureInput["attributes"]) {
  return input.map((attribute) => ({
    attribute_code: attribute.attribute_code,
    raw: attribute.raw,
    value: attribute.value === undefined ? attribute.raw : attribute.value,
    supplied_unit: attribute.supplied_unit,
  }));
}

router.get("/template", async (req: Request, res: Response): Promise<void> => {
  const materialId = typeof req.query.material_id === "string" ? req.query.material_id : "";
  if (!materialId) {
    res.status(400).json({ error: "material_id is required" });
    return;
  }
  const resolution = await resolveForMaterial(db, materialId, new Date());
  if (resolution.kind === "NO_TEMPLATE") {
    res.status(422).json({ error: "NO_TEMPLATE", material_id: materialId });
    return;
  }
  if (resolution.kind === "ERROR") {
    res.status(422).json({ error: "TEMPLATE_RESOLUTION", reason: resolution.reason });
    return;
  }
  const requestedVersion =
    typeof req.query.template_version_id === "string" ? req.query.template_version_id : null;
  if (requestedVersion && requestedVersion !== resolution.templateVersionId) {
    res.status(409).json({ error: "STALE_TEMPLATE" });
    return;
  }
  const [version] = await db
    .select({
      templateCode: attributeTemplatesTable.code,
      versionNo: attributeTemplateVersionsTable.versionNo,
    })
    .from(attributeTemplateVersionsTable)
    .innerJoin(
      attributeTemplatesTable,
      eq(attributeTemplatesTable.id, attributeTemplateVersionsTable.templateId),
    )
    .where(eq(attributeTemplateVersionsTable.id, resolution.templateVersionId))
    .limit(1);
  if (!version) {
    res.status(422).json({ error: "TEMPLATE_RESOLUTION" });
    return;
  }
  const fields = await buildTemplateFields(db, resolution.templateVersionId);
  const csv = generateCsv({
    templateCode: version.templateCode,
    versionNo: version.versionNo,
    fields,
  });
  res.type("text/csv");
  res.attachment(`${version.templateCode}v${version.versionNo}.csv`);
  res.send(csv);
});

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const parsedBody = ImportCsvBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }
  const { csv, filename } = parsedBody.data;
  let metadata: ReturnType<typeof readCsvMetadata>;
  let template;
  try {
    metadata = readCsvMetadata(csv);
    template = await templateForCodeVersion(metadata.template, Number(metadata.version));
    if (!template || template.status !== "ACTIVE") {
      res.status(409).json({ error: "STALE_TEMPLATE" });
      return;
    }
  } catch (error) {
    if (error instanceof CsvImportError) {
      res.status(error.code === "INVALID_SCHEMA" ? 400 : 422).json({
        error: error.code,
        ...(error.details ? { details: error.details } : {}),
      });
      return;
    }
    throw error;
  }

  const fields = await buildTemplateFields(db, template.versionId);
  let parsedCsv;
  try {
    parsedCsv = parseCsv(csv, fields);
  } catch (error) {
    if (error instanceof CsvImportError) {
      res.status(error.code === "INVALID_SCHEMA" ? 400 : 422).json({
        error: error.code,
        ...(error.details ? { details: error.details } : {}),
      });
      return;
    }
    throw error;
  }
  const fileHash = sha256(csv);
  const existing = await db
    .select()
    .from(importSessionsTable)
    .where(eq(importSessionsTable.fileHash, fileHash))
    .limit(1);
  if (existing[0]) {
    if (existing[0].templateVersionId !== template.versionId) {
      res.status(409).json({ error: "STALE_TEMPLATE" });
      return;
    }
    res.status(200).json(sessionJson(existing[0]));
    return;
  }

  const uniqueMaterials = [...new Set(parsedCsv.rows.map((row) => row.materialCode))];
  const uniqueSuppliers = [...new Set(parsedCsv.rows.map((row) => row.supplierCode))];
  const [materials, suppliers] = await Promise.all([
    uniqueMaterials.length
      ? db
          .select({ id: materialsTable.id, code: materialsTable.code })
          .from(materialsTable)
          .where(inArray(materialsTable.code, uniqueMaterials))
      : [],
    uniqueSuppliers.length
      ? db
          .select({ id: suppliersTable.id, code: suppliersTable.code })
          .from(suppliersTable)
          .where(inArray(suppliersTable.code, uniqueSuppliers))
      : [],
  ]);
  const materialByCode = new Map(materials.map((row) => [row.code, row]));
  const supplierByCode = new Map(suppliers.map((row) => [row.code, row]));
  const unknownMaterial = uniqueMaterials.find((code) => !materialByCode.has(code));
  const unknownSupplier = uniqueSuppliers.find((code) => !supplierByCode.has(code));
  if (unknownMaterial) {
    res.status(422).json({ error: "UNKNOWN_MATERIAL", material_code: unknownMaterial });
    return;
  }
  if (unknownSupplier) {
    res.status(422).json({ error: "UNKNOWN_SUPPLIER", supplier_code: unknownSupplier });
    return;
  }

  const registry = await loadUnitRegistry(db);
  const staged = parsedCsv.rows.map((row: ParsedImportRow) => {
    const material = materialByCode.get(row.materialCode)!;
    const canonical: StoredCanonical = {
      material_id: material.id,
      material_code: row.materialCode,
      supplier_code: row.supplierCode,
      lot_number: row.canonical.lot_number,
      quantity: row.canonical.quantity,
      attributes: row.canonical.attributes,
      source: row.canonical.source,
    };
    const quantityErrors: CaptureError[] = Number.isFinite(canonical.quantity) && canonical.quantity > 0
      ? []
      : [{
          attribute_code: "quantity",
          rule: "POSITIVE",
          input: row.raw.quantity,
          normalized: null,
          message: "Quantity must be a positive number",
          row: row.rowNumber,
        }];
    const validation = validateCapture(
      { attributes: validatorAttributes(canonical.attributes) },
      fields,
      registry,
    );
    const errors = [...quantityErrors, ...captureErrors(validation.errors, row.rowNumber)];
    return {
      row,
      canonical,
      validation,
      errors,
    };
  });

  const firstMaterial = staged[0]!.canonical.material_id;
  const resolved = await resolveForMaterial(db, firstMaterial, new Date());
  if (
    resolved.kind !== "OK" ||
    resolved.templateVersionId !== template.versionId ||
    resolved.templateId !== template.templateId
  ) {
    res.status(409).json({ error: "STALE_TEMPLATE" });
    return;
  }
  for (const entry of staged) {
    const rowResolution = await resolveForMaterial(db, entry.canonical.material_id, new Date());
    if (rowResolution.kind !== "OK" || rowResolution.templateVersionId !== template.versionId) {
      res.status(409).json({ error: "STALE_TEMPLATE", row: entry.row.rowNumber });
      return;
    }
  }

  const result = await db.transaction(async (tx) => {
    const sameHash = await tx
      .select()
      .from(importSessionsTable)
      .where(eq(importSessionsTable.fileHash, fileHash))
      .limit(1);
    if (sameHash[0]) return { existing: sameHash[0] };
    const sequenceResult = await tx.execute(sql`SELECT nextval('import_seq') AS seq`);
    const sequence = Number((sequenceResult as any).rows?.[0]?.seq);
    if (!Number.isFinite(sequence)) throw new Error("IMPORT_SEQUENCE_UNAVAILABLE");
    const [session] = await tx
      .insert(importSessionsTable)
      .values({
        importNumber: importNumber(sequence),
        fileHash,
        filename: filename ?? null,
        templateVersionId: template.versionId,
        status: "VALIDATED",
        totalRows: staged.length,
        validRows: staged.filter((entry) => entry.errors.length === 0).length,
        invalidRows: staged.filter((entry) => entry.errors.length > 0).length,
        createdBy: req.user?.userId ?? null,
      })
      .returning();
    if (!session) throw new Error("IMPORT_SESSION_INSERT_FAILED");
    await tx.insert(importRowsTable).values(
      staged.map((entry) => ({
        importSessionId: session.id,
        rowNumber: entry.row.rowNumber,
        raw: entry.row.raw,
        canonical: {
          ...entry.canonical,
          source: { ...entry.canonical.source, session_id: session.id },
        },
        status: entry.errors.length === 0 ? "VALID" as const : "INVALID" as const,
        errors: entry.errors.length > 0 ? entry.errors : null,
      })),
    );
    await tx.insert(outboxEventsTable).values({
      aggregateType: "import_session",
      aggregateId: session.id,
      eventType: "IMPORT_SESSION_CREATED",
      payload: {
        import_number: session.importNumber,
        file_hash: fileHash,
        total_rows: staged.length,
        valid_rows: session.validRows,
        invalid_rows: session.invalidRows,
      },
    });
    return { session };
  });
  res.status(result.existing ? 200 : 201).json(sessionJson(result.existing ?? result.session));
});

router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const [session] = await db
    .select()
    .from(importSessionsTable)
    .where(eq(importSessionsTable.id, idParam(req.params.id)))
    .limit(1);
  if (!session) {
    res.status(404).json({ error: "IMPORT_SESSION_NOT_FOUND" });
    return;
  }
  const rows = await db
    .select()
    .from(importRowsTable)
    .where(eq(importRowsTable.importSessionId, session.id))
    .orderBy(asc(importRowsTable.rowNumber));
  res.json({ session: sessionJson(session), rows: rows.map(rowJson) });
});

router.post("/:id/confirm", async (req: Request, res: Response): Promise<void> => {
  const confirmKey = req.header("Idempotency-Key")?.trim();
  if (!confirmKey || confirmKey.length > 100) {
    res.status(400).json({ error: "Idempotency-Key header is required" });
    return;
  }
  const id = idParam(req.params.id);
  const session = await db
    .select()
    .from(importSessionsTable)
    .where(eq(importSessionsTable.id, id))
    .limit(1);
  if (!session[0]) {
    res.status(404).json({ error: "IMPORT_SESSION_NOT_FOUND" });
    return;
  }
  const current = session[0];
  if (current.status === "CONFIRMED" && current.confirmKey === confirmKey) {
    res.json({ import_session_id: current.id, document_id: current.downstreamDocumentId });
    return;
  }
  if (current.status === "CONFIRMED") {
    res.status(409).json({ error: "SESSION_ALREADY_CONFIRMED" });
    return;
  }
  if (current.status === "CANCELLED") {
    res.status(409).json({ error: "SESSION_CANCELLED" });
    return;
  }

  const rows = await db
    .select()
    .from(importRowsTable)
    .where(eq(importRowsTable.importSessionId, id))
    .orderBy(asc(importRowsTable.rowNumber));
  if (rows.some((row) => row.status === "PENDING")) {
    res.status(409).json({ error: "ROWS_NOT_VALIDATED" });
    return;
  }
  if (rows.some((row) => row.status === "INVALID")) {
    res.status(409).json({ error: "SESSION_HAS_INVALID_ROWS" });
    return;
  }
  const canonicals = rows.map((row) => row.canonical as StoredCanonical);
  const supplierCodes = [...new Set(canonicals.map((row) => row.supplier_code))];
  if (supplierCodes.length !== 1) {
    res.status(422).json({ error: "MULTIPLE_SUPPLIERS" });
    return;
  }
  const [supplier] = await db
    .select({ id: suppliersTable.id })
    .from(suppliersTable)
    .where(eq(suppliersTable.code, supplierCodes[0]!))
    .limit(1);
  if (!supplier) {
    res.status(422).json({ error: "UNKNOWN_SUPPLIER", supplier_code: supplierCodes[0] });
    return;
  }
  const fields = await buildTemplateFields(db, current.templateVersionId);
  const registry = await loadUnitRegistry(db);
  const inputs = canonicals.map((canonical) =>
    CanonicalCaptureInput.parse({
      material_id: canonical.material_id,
      lot_number: canonical.lot_number,
      quantity: canonical.quantity,
      attributes: canonical.attributes,
      source: canonical.source,
    }),
  );
  const validations: ValidatedValue[][] = inputs.map((input) =>
    validateCapture({ attributes: validatorAttributes(input.attributes) }, fields, registry).values,
  );

  const result = await db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(importSessionsTable)
      .where(eq(importSessionsTable.id, id))
      .for("update")
      .limit(1);
    if (!locked) throw new Error("IMPORT_SESSION_NOT_FOUND");
    if (locked.status === "CONFIRMED" && locked.confirmKey === confirmKey) {
      return { replay: true, documentId: locked.downstreamDocumentId, lineIds: [] as string[] };
    }
    if (locked.status === "CONFIRMED") throw new Error("SESSION_ALREADY_CONFIRMED");
    const batch = await confirmBatch(tx, inputs, validations, {
      supplierId: supplier.id,
      receivedDate: isoDate(),
      actorId: req.user?.userId ?? null,
      templateVersionId: locked.templateVersionId,
    });
    await tx
      .update(importRowsTable)
      .set({ grnLineId: sql`CASE ${sql.join(
        batch.lineIds.map(
          (lineId, index) =>
            sql`WHEN ${importRowsTable.rowNumber} = ${rows[index]!.rowNumber} THEN ${lineId}::uuid`,
        ),
        sql` `,
      )} ELSE ${importRowsTable.grnLineId} END` as any })
      .where(eq(importRowsTable.importSessionId, id));
    const [updated] = await tx
      .update(importSessionsTable)
      .set({
        status: "CONFIRMED",
        confirmKey,
        downstreamDocumentId: batch.documentId,
      })
      .where(eq(importSessionsTable.id, id))
      .returning();
    await tx.insert(outboxEventsTable).values({
      aggregateType: "import_session",
      aggregateId: id,
      eventType: "IMPORT_CONFIRMED",
      payload: {
        file_hash: locked.fileHash,
        total_rows: locked.totalRows,
        valid_rows: locked.validRows,
        downstream_document_id: batch.documentId,
      },
    });
    return { replay: false, documentId: updated?.downstreamDocumentId ?? batch.documentId, lineIds: batch.lineIds };
  });
  res.json({ import_session_id: id, document_id: result.documentId, replay: result.replay });
});

router.post("/:id/cancel", async (req: Request, res: Response): Promise<void> => {
  const id = idParam(req.params.id);
  const [updated] = await db
    .update(importSessionsTable)
    .set({ status: "CANCELLED" })
    .where(
      and(
        eq(importSessionsTable.id, id),
        inArray(importSessionsTable.status, ["DRAFT", "VALIDATED"]),
      ),
    )
    .returning();
  if (!updated) {
    const [existing] = await db
      .select({ status: importSessionsTable.status })
      .from(importSessionsTable)
      .where(eq(importSessionsTable.id, id))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "IMPORT_SESSION_NOT_FOUND" });
      return;
    }
    res.status(409).json({ error: `SESSION_${existing.status}` });
    return;
  }
  res.json(sessionJson(updated));
});

export default router;