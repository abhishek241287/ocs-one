import { Router, type Request, type Response } from "express";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import {
  attributeCaptureInstancesTable,
  attributeTemplateVersionsTable,
  db,
  grnLineItemsTable,
  materialInventoryProfilesTable,
  materialsTable,
  outboxEventsTable,
  scanItemsTable,
  scanSessionsTable,
  suppliersTable,
  type Transaction,
} from "@workspace/db";
import {
  CanonicalCaptureInput,
  ScanBody,
  ScanConfirmBody,
  ScanSessionCreateBody,
} from "@workspace/api-zod";
import { requireAuth, requireWriteRole } from "../../middleware/auth";
import {
  buildTemplateFields,
  confirmBatch,
  loadUnitRegistry,
  resolveForMaterial,
} from "../../lib/universal-capture/grn-adapter";
import { validateCapture, type CaptureError, type ValidatedValue } from "../../lib/universal-capture/validate";
import { decodePayload, resolveEntity, type QrEntity, type ResolvedEntity } from "../../lib/universal-capture/qr";
import { indexSerialInTx } from "../../lib/serial-index";

const router = Router();
router.use(requireAuth);

type StoredCanonical = CanonicalCaptureInput & {
  template_version_id: string | null;
};

class ScanRouteError extends Error {
  constructor(public readonly status: number, public readonly body: Record<string, unknown>) {
    super(String(body.error ?? "Scan session error"));
  }
}

function idParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] ?? "" : value;
}

function sessionJson(row: Record<string, any>): Record<string, unknown> {
  return {
    id: row.id,
    session_number: row.sessionNumber,
    status: row.status,
    supplier_id: row.supplierId,
    template_version_id: row.templateVersionId,
    total: row.totalItems,
    ready: row.readyItems,
    unknown: row.unknownItems,
    duplicate: row.duplicateItems,
    removed: row.removedItems,
    confirm_key: row.confirmKey,
    downstream_document_id: row.downstreamDocumentId,
    created_by: row.createdBy,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    confirmed_at: row.confirmedAt,
    cancelled_at: row.cancelledAt,
  };
}

function itemJson(row: Record<string, any>): Record<string, unknown> {
  return {
    id: row.id,
    item_number: row.itemNumber,
    payload_raw: row.payloadRaw,
    entity_type: row.entityType,
    entity_id: row.entityId,
    state: row.state,
    material_id: row.materialId,
    lot_number: row.lotNumber,
    serial_number: row.serialNumber,
    quantity: row.quantity === null ? null : Number(row.quantity),
    duplicate_scan_count: row.duplicateScanCount,
    attributes: row.attributes,
    canonical: row.canonical,
    errors: row.errors,
    grn_line_id: row.grnLineId,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

function normalizeAttributes(attributes: NonNullable<ScanBody["attributes"]>) {
  return attributes.map((attribute) => ({
    attribute_code: attribute.attribute_code,
    raw: attribute.raw,
    value: attribute.value === undefined ? attribute.raw : attribute.value,
    supplied_unit: attribute.supplied_unit,
  }));
}

function validationAttributes(attributes: NonNullable<ScanBody["attributes"]>) {
  return normalizeAttributes(
    attributes.filter((attribute) => attribute.attribute_code !== "serial_number"),
  );
}

function identityAttribute(
  attributes: NonNullable<ScanBody["attributes"]>,
  code: "serial_number",
): string | null {
  const attribute = attributes.find((candidate) => candidate.attribute_code === code);
  const value = attribute?.value ?? attribute?.raw;
  return value === undefined || value === null || String(value).trim() === ""
    ? null
    : String(value).trim();
}

function scanError(rule: string, message: string): CaptureError {
  return {
    attribute_code: "",
    rule,
    input: null,
    normalized: null,
    message,
  };
}

async function nextItemNumber(tx: Transaction, sessionId: string): Promise<number> {
  const [last] = await tx
    .select({ itemNumber: scanItemsTable.itemNumber })
    .from(scanItemsTable)
    .where(eq(scanItemsTable.sessionId, sessionId))
    .orderBy(desc(scanItemsTable.itemNumber))
    .limit(1);
  return (last?.itemNumber ?? 0) + 1;
}

async function refreshSessionCounters(
  tx: Transaction,
  sessionId: string,
  actorId: string | null | undefined,
): Promise<void> {
  const items = await tx
    .select({ state: scanItemsTable.state, duplicateScanCount: scanItemsTable.duplicateScanCount })
    .from(scanItemsTable)
    .where(eq(scanItemsTable.sessionId, sessionId));
  const active = items.filter((item) => item.state !== "REMOVED");
  const allReady = active.length > 0 && active.every((item) => item.state === "READY");
  await tx
    .update(scanSessionsTable)
    .set({
      status: allReady ? "READY" : "DRAFT",
      totalItems: items.length,
      readyItems: active.filter((item) => item.state === "READY").length,
      unknownItems: active.filter((item) => item.state === "UNKNOWN").length,
      duplicateItems: items.reduce((total, item) => total + item.duplicateScanCount, 0),
      removedItems: items.filter((item) => item.state === "REMOVED").length,
      updatedBy: actorId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(scanSessionsTable.id, sessionId));
}

async function getSessionForUpdate(tx: Transaction, sessionId: string) {
  const [session] = await tx
    .select()
    .from(scanSessionsTable)
    .where(eq(scanSessionsTable.id, sessionId))
    .for("update")
    .limit(1);
  if (!session) throw new ScanRouteError(404, { error: "SCAN_SESSION_NOT_FOUND" });
  return session;
}

function requireOpen(session: { status: string }): void {
  if (session.status === "CONFIRMED") throw new ScanRouteError(409, { error: "SESSION_ALREADY_CONFIRMED" });
  if (session.status === "CANCELLED") throw new ScanRouteError(409, { error: "SESSION_CANCELLED" });
}

async function resolveMaterialTemplate(
  tx: Transaction,
  session: { templateVersionId: string | null },
  materialId: string,
) {
  const resolution = await resolveForMaterial(tx, materialId, new Date());
  if (resolution.kind !== "OK") return { resolution, templateVersionId: null };
  if (session.templateVersionId && session.templateVersionId !== resolution.templateVersionId) {
    return {
      resolution: {
        kind: "ERROR" as const,
        reason: "SCAN_TEMPLATE_MISMATCH",
      },
      templateVersionId: null,
    };
  }
  return { resolution, templateVersionId: resolution.templateVersionId };
}

async function insertUnknownItem(
  tx: Transaction,
  sessionId: string,
  payload: string,
  itemNumber: number,
  attributes: NonNullable<ScanBody["attributes"]>,
  resolved: ResolvedEntity | null,
): Promise<string> {
  const [item] = await tx
    .insert(scanItemsTable)
    .values({
      sessionId,
      itemNumber,
      payloadRaw: payload,
      entityType: resolved?.ok ? resolved.entity : resolved?.entity,
      entityId: resolved?.ok ? resolved.id : resolved?.id,
      state: "UNKNOWN",
      attributes,
      errors: resolved?.errors ?? [{ rule: "UNKNOWN_SCAN", message: "Scan payload could not be decoded" }],
    })
    .returning({ id: scanItemsTable.id });
  if (!item) throw new Error("SCAN_ITEM_INSERT_FAILED");
  return item.id;
}

async function findDuplicate(
  tx: Transaction,
  sessionId: string,
  materialId: string,
  trackingMode: string,
  lotNumber: string | null,
  serialNumber: string | null,
) {
  if (trackingMode === "SERIAL" && serialNumber) {
    return tx
      .select()
      .from(scanItemsTable)
      .where(and(
        eq(scanItemsTable.sessionId, sessionId),
        eq(scanItemsTable.materialId, materialId),
        eq(scanItemsTable.serialNumber, serialNumber),
        ne(scanItemsTable.state, "REMOVED"),
      ))
      .orderBy(asc(scanItemsTable.itemNumber))
      .limit(1);
  }
  if ((trackingMode === "LOT" || trackingMode === "LOT_AND_SERIAL") && lotNumber) {
    return tx
      .select()
      .from(scanItemsTable)
      .where(and(
        eq(scanItemsTable.sessionId, sessionId),
        eq(scanItemsTable.materialId, materialId),
        eq(scanItemsTable.lotNumber, lotNumber),
        ne(scanItemsTable.state, "REMOVED"),
      ))
      .orderBy(asc(scanItemsTable.itemNumber))
      .limit(1);
  }
  return [];
}

router.post("/", requireWriteRole("supervisor", "director"), async (req: Request, res: Response): Promise<void> => {
  const parsed = ScanSessionCreateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const body = parsed.data;
  const [supplier] = await db
    .select({ id: suppliersTable.id })
    .from(suppliersTable)
    .where(eq(suppliersTable.id, body.supplier_id))
    .limit(1);
  if (!supplier) {
    res.status(422).json({ error: "UNKNOWN_SUPPLIER", supplier_id: body.supplier_id });
    return;
  }

  let templateVersionId = body.template_version_id ?? null;
  if (body.material_id) {
    const resolution = await resolveForMaterial(db, body.material_id, new Date());
    if (resolution.kind !== "OK") {
      res.status(422).json({
        error: resolution.kind === "ERROR" ? "TEMPLATE_RESOLUTION" : "NO_TEMPLATE",
        material_id: body.material_id,
      });
      return;
    }
    if (templateVersionId && templateVersionId !== resolution.templateVersionId) {
      res.status(409).json({ error: "STALE_TEMPLATE" });
      return;
    }
    templateVersionId = resolution.templateVersionId;
  } else if (templateVersionId) {
    const [version] = await db
      .select({ id: attributeTemplateVersionsTable.id })
      .from(attributeTemplateVersionsTable)
      .where(eq(attributeTemplateVersionsTable.id, templateVersionId))
      .limit(1);
    if (!version) {
      res.status(409).json({ error: "STALE_TEMPLATE" });
      return;
    }
  }

  const result = await db.transaction(async (tx) => {
    const sequenceResult = await tx.execute(sql`SELECT nextval('scan_seq') AS seq`);
    const sequence = Number((sequenceResult as any).rows?.[0]?.seq);
    if (!Number.isFinite(sequence)) throw new Error("SCAN_SEQUENCE_UNAVAILABLE");
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const [session] = await tx
      .insert(scanSessionsTable)
      .values({
        sessionNumber: `SCN-${date}-${String(sequence).padStart(4, "0")}`,
        supplierId: supplier.id,
        templateVersionId,
        createdBy: req.user?.userId ?? null,
        updatedBy: req.user?.userId ?? null,
      })
      .returning();
    if (!session) throw new Error("SCAN_SESSION_INSERT_FAILED");
    await tx.insert(outboxEventsTable).values({
      aggregateType: "scan_session",
      aggregateId: session.id,
      eventType: "SCAN_SESSION_CREATED",
      payload: {
        session_number: session.sessionNumber,
        supplier_id: session.supplierId,
        template_version_id: session.templateVersionId,
      },
    });
    return session;
  });
  res.status(201).json(sessionJson(result));
});

router.post("/:id/scan", requireWriteRole("supervisor", "director"), async (req: Request, res: Response): Promise<void> => {
  const parsed = ScanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const body = parsed.data;
  const sessionId = idParam(req.params.id);
  try {
    const result = await db.transaction(async (tx) => {
      const session = await getSessionForUpdate(tx, sessionId);
      requireOpen(session);
      const itemNumber = await nextItemNumber(tx, sessionId);
      const decoded = decodePayload(body.payload);
      if (!decoded.ok) {
        const itemId = await insertUnknownItem(tx, sessionId, body.payload, itemNumber, body.attributes ?? [], null);
        await refreshSessionCounters(tx, sessionId, req.user?.userId);
        return itemId;
      }

      const resolved = await resolveEntity(decoded.entity, decoded.id, tx);
      if (!resolved.ok) {
        const itemId = await insertUnknownItem(tx, sessionId, body.payload, itemNumber, body.attributes ?? [], resolved);
        await refreshSessionCounters(tx, sessionId, req.user?.userId);
        return itemId;
      }

      if (!resolved.materialId || !resolved.confirmable) {
        const [item] = await tx
          .insert(scanItemsTable)
          .values({
            sessionId,
            itemNumber,
            payloadRaw: body.payload,
            entityType: resolved.entity,
            entityId: resolved.id,
            state: "RESOLVED",
            materialId: resolved.materialId ?? null,
            lotNumber: resolved.lotNumber ?? null,
            serialNumber: resolved.serialNumber ?? null,
            quantity: String(body.quantity ?? 1),
            attributes: body.attributes ?? [],
            errors: resolved.errors ?? [scanError("NON_CONFIRMABLE_SCAN", "Scan is not confirmable in Phase 6")],
          })
          .returning({ id: scanItemsTable.id });
        if (!item) throw new Error("SCAN_ITEM_INSERT_FAILED");
        await refreshSessionCounters(tx, sessionId, req.user?.userId);
        return item.id;
      }

      const template = await resolveMaterialTemplate(tx, session, resolved.materialId);
      let templateVersionId = template.templateVersionId;
      let validation: { ok: boolean; errors: CaptureError[]; values: ValidatedValue[] } = {
        ok: true,
        errors: [],
        values: [],
      };
      if (template.resolution.kind === "OK" && templateVersionId) {
        const fields = await buildTemplateFields(tx, templateVersionId);
        validation = validateCapture(
          { attributes: validationAttributes(body.attributes ?? []) },
          fields,
          await loadUnitRegistry(tx),
        );
      } else {
        validation = {
          ok: false,
          errors: [scanError(
            template.resolution.kind === "ERROR" ? "TEMPLATE_RESOLUTION" : "NO_TEMPLATE",
            template.resolution.kind === "ERROR"
              ? template.resolution.reason
              : "No attribute template resolves for this material",
          )],
          values: [],
        };
      }

      const profile = await tx
        .select({ trackingMode: materialInventoryProfilesTable.trackingMode })
        .from(materialInventoryProfilesTable)
        .where(eq(materialInventoryProfilesTable.materialId, resolved.materialId))
        .limit(1);
      const trackingMode = profile[0]?.trackingMode ?? "NONE";
      const lotNumber = resolved.lotNumber ?? null;
      const serialNumber = resolved.serialNumber ?? identityAttribute(body.attributes ?? [], "serial_number");
      const duplicate = await findDuplicate(tx, sessionId, resolved.materialId, trackingMode, lotNumber, serialNumber);
      if (duplicate[0] && (
        trackingMode === "LOT" ||
        trackingMode === "LOT_AND_SERIAL" ||
        (trackingMode === "SERIAL" && serialNumber)
      )) {
        if (trackingMode === "LOT" || trackingMode === "LOT_AND_SERIAL") {
          const existing = duplicate[0];
          const canonical = (existing.canonical ?? {}) as StoredCanonical;
          const quantity = Number(existing.quantity) + (body.quantity ?? 1);
          const [updated] = await tx
            .update(scanItemsTable)
            .set({
              quantity: String(quantity),
              duplicateScanCount: existing.duplicateScanCount + 1,
              canonical: { ...canonical, quantity },
              updatedAt: new Date(),
            })
            .where(eq(scanItemsTable.id, existing.id))
            .returning();
          await refreshSessionCounters(tx, sessionId, req.user?.userId);
          return updated?.id ?? existing.id;
        }
      }

      const errors = validation.errors.map((error) => ({ ...error, rule: error.rule }));
      if (trackingMode === "SERIAL" && duplicate[0] && serialNumber) {
        errors.push(scanError("DUPLICATE_SERIAL", "Serial has already been scanned in this session"));
      }
      const canonical: StoredCanonical = {
        material_id: resolved.materialId,
        lot_number: lotNumber,
        serial_number: serialNumber,
        quantity: body.quantity ?? 1,
        attributes: body.attributes ?? [],
        source: {
          type: "SCAN",
          session_id: sessionId,
          row_ref: String(itemNumber),
        },
        template_version_id: templateVersionId,
      };
      const state = errors.length === 0 ? "READY" : "VALIDATED";
      const [item] = await tx
        .insert(scanItemsTable)
        .values({
          sessionId,
          itemNumber,
          payloadRaw: body.payload,
          entityType: resolved.entity,
          entityId: resolved.id,
          state,
          materialId: resolved.materialId,
          lotNumber,
          serialNumber,
          quantity: String(body.quantity ?? 1),
          attributes: body.attributes ?? [],
          canonical,
          errors: errors.length > 0 ? errors : null,
        })
        .returning();
      if (!item) throw new Error("SCAN_ITEM_INSERT_FAILED");
      await refreshSessionCounters(tx, sessionId, req.user?.userId);
      return item.id;
    });
    const [item] = await db.select().from(scanItemsTable).where(eq(scanItemsTable.id, result)).limit(1);
    res.status(201).json(itemJson(item));
  } catch (error) {
    if (error instanceof ScanRouteError) {
      res.status(error.status).json(error.body);
      return;
    }
    throw error;
  }
});

router.post("/:id/items/:itemId/remove", requireWriteRole("supervisor", "director"), async (req: Request, res: Response): Promise<void> => {
  try {
    const item = await db.transaction(async (tx) => {
      const session = await getSessionForUpdate(tx, idParam(req.params.id));
      requireOpen(session);
      const [existing] = await tx
        .select()
        .from(scanItemsTable)
        .where(and(eq(scanItemsTable.id, idParam(req.params.itemId)), eq(scanItemsTable.sessionId, session.id)))
        .for("update")
        .limit(1);
      if (!existing) throw new ScanRouteError(404, { error: "SCAN_ITEM_NOT_FOUND" });
      if (existing.state === "REMOVED") throw new ScanRouteError(409, { error: "SCAN_ITEM_ALREADY_REMOVED" });
      const [updated] = await tx
        .update(scanItemsTable)
        .set({ state: "REMOVED", updatedAt: new Date() })
        .where(
          existing.serialNumber
            ? and(
                eq(scanItemsTable.sessionId, session.id),
                eq(scanItemsTable.materialId, existing.materialId!),
                eq(scanItemsTable.serialNumber, existing.serialNumber),
                ne(scanItemsTable.state, "REMOVED"),
              )
            : eq(scanItemsTable.id, existing.id),
        )
        .returning();
      await refreshSessionCounters(tx, session.id, req.user?.userId);
      return updated;
    });
    res.json(itemJson(item));
  } catch (error) {
    if (error instanceof ScanRouteError) {
      res.status(error.status).json(error.body);
      return;
    }
    throw error;
  }
});

router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const sessionId = idParam(req.params.id);
  const [session] = await db
    .select()
    .from(scanSessionsTable)
    .where(eq(scanSessionsTable.id, sessionId))
    .limit(1);
  if (!session) {
    res.status(404).json({ error: "SCAN_SESSION_NOT_FOUND" });
    return;
  }
  const items = await db
    .select()
    .from(scanItemsTable)
    .where(eq(scanItemsTable.sessionId, sessionId))
    .orderBy(asc(scanItemsTable.itemNumber));
  res.json({ session: sessionJson(session), items: items.map(itemJson) });
});

router.post("/:id/confirm", requireWriteRole("supervisor", "director"), async (req: Request, res: Response): Promise<void> => {
  const parsed = ScanConfirmBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const confirmKey = req.header("Idempotency-Key")?.trim();
  if (!confirmKey || confirmKey.length > 100) {
    res.status(400).json({ error: "Idempotency-Key header is required" });
    return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      const session = await getSessionForUpdate(tx, idParam(req.params.id));
      if (session.status === "CONFIRMED" && session.confirmKey === confirmKey) {
        return { replay: true, sessionId: session.id, documentId: session.downstreamDocumentId };
      }
      requireOpen(session);
      const items = await tx
        .select()
        .from(scanItemsTable)
        .where(eq(scanItemsTable.sessionId, session.id))
        .orderBy(asc(scanItemsTable.itemNumber))
        .for("update");
      const active = items.filter((item) => item.state !== "REMOVED");
      if (active.length === 0 || active.some((item) => item.state !== "READY" || item.errors)) {
        throw new ScanRouteError(409, { error: "SESSION_NOT_READY" });
      }

      const inputs: CanonicalCaptureInput[] = [];
      const validatedRows: ValidatedValue[][] = [];
      let templateVersionId = session.templateVersionId;
      for (const item of active) {
        const stored = CanonicalCaptureInput.safeParse(item.canonical);
        if (!stored.success || !item.materialId) {
          throw new ScanRouteError(409, { error: "SESSION_NOT_READY" });
        }
        const template = await resolveMaterialTemplate(tx, session, item.materialId);
        if (template.resolution.kind !== "OK" || !template.templateVersionId) {
          throw new ScanRouteError(409, { error: "SESSION_NOT_READY" });
        }
        if (templateVersionId && templateVersionId !== template.templateVersionId) {
          throw new ScanRouteError(409, { error: "SESSION_NOT_READY", reason: "MULTIPLE_TEMPLATES" });
        }
        templateVersionId = template.templateVersionId;
        const fields = await buildTemplateFields(tx, template.templateVersionId);
        const validation = validateCapture(
          { attributes: validationAttributes(stored.data.attributes) },
          fields,
          await loadUnitRegistry(tx),
        );
        if (!validation.ok) throw new ScanRouteError(409, { error: "SESSION_NOT_READY" });
        inputs.push({
          ...stored.data,
          source: {
            type: "SCAN",
            session_id: session.id,
            row_ref: String(item.itemNumber),
          },
        });
        validatedRows.push(validation.values);
      }
      if (!templateVersionId) throw new ScanRouteError(409, { error: "SESSION_NOT_READY" });
      const confirmed = await confirmBatch(tx, inputs, validatedRows, {
        supplierId: session.supplierId,
        receivedDate: new Date().toISOString().slice(0, 10),
        actorId: req.user?.userId ?? null,
        templateVersionId,
      });
      for (let index = 0; index < active.length; index += 1) {
        const item = active[index]!;
        const serialNumber = item.serialNumber?.trim();
        if (!serialNumber) continue;
        const lineId = confirmed.lineIds[index]!;
        const [capture] = await tx
          .select({ id: attributeCaptureInstancesTable.id })
          .from(attributeCaptureInstancesTable)
          .where(
            and(
              eq(attributeCaptureInstancesTable.targetId, lineId),
              eq(attributeCaptureInstancesTable.materialId, item.materialId!),
            ),
          )
          .orderBy(desc(attributeCaptureInstancesTable.createdAt))
          .limit(1);
        const [line] = await tx
          .select({ lotId: grnLineItemsTable.lotId })
          .from(grnLineItemsTable)
          .where(eq(grnLineItemsTable.id, lineId))
          .limit(1);
        await indexSerialInTx(tx, {
          serialNumber,
          materialId: item.materialId!,
          lotId: line?.lotId ?? null,
          captureInstanceId: capture?.id ?? null,
          sourceDocumentType: "scan_session",
          sourceDocumentId: session.id,
          createdBy: req.user?.userId ?? null,
          actorId: req.user?.userId ?? null,
          actorEmail: req.user?.email ?? null,
          actorRole: req.user?.role ?? null,
        });
      }
      await tx
        .update(attributeCaptureInstancesTable)
        .set({ sourceType: "SCAN" })
        .where(inArray(attributeCaptureInstancesTable.targetId, confirmed.lineIds));
      await tx
        .update(outboxEventsTable)
        .set({
          payload: sql`jsonb_set(${outboxEventsTable.payload}, '{source_type}', '"SCAN"'::jsonb, true)`,
        })
        .where(and(
          eq(outboxEventsTable.eventType, "CAPTURE_RECORDED"),
          inArray(outboxEventsTable.aggregateId, confirmed.lineIds),
        ));
      for (let index = 0; index < active.length; index += 1) {
        await tx
          .update(scanItemsTable)
          .set({ state: "CONFIRMED", grnLineId: confirmed.lineIds[index]!, updatedAt: new Date() })
          .where(eq(scanItemsTable.id, active[index]!.id));
      }
      await tx
        .update(scanSessionsTable)
        .set({
          status: "CONFIRMED",
          confirmKey,
          downstreamDocumentId: confirmed.documentId,
          confirmedAt: new Date(),
          updatedBy: req.user?.userId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(scanSessionsTable.id, session.id));
      await tx.insert(outboxEventsTable).values({
        aggregateType: "scan_session",
        aggregateId: session.id,
        eventType: "SCAN_CONFIRMED",
        payload: {
          session_number: session.sessionNumber,
          document_id: confirmed.documentId,
          item_count: active.length,
        },
      });
      return { replay: false, sessionId: session.id, documentId: confirmed.documentId };
    });
    res.json({
      scan_session_id: result.sessionId,
      document_id: result.documentId,
      replay: result.replay,
    });
  } catch (error) {
    if (error instanceof ScanRouteError) {
      res.status(error.status).json(error.body);
      return;
    }
    throw error;
  }
});

router.post("/:id/cancel", requireWriteRole("supervisor", "director"), async (req: Request, res: Response): Promise<void> => {
  try {
    const session = await db.transaction(async (tx) => {
      const current = await getSessionForUpdate(tx, idParam(req.params.id));
      if (current.status === "CONFIRMED") throw new ScanRouteError(409, { error: "SESSION_ALREADY_CONFIRMED" });
      if (current.status === "CANCELLED") return current;
      const [updated] = await tx
        .update(scanSessionsTable)
        .set({
          status: "CANCELLED",
          cancelledAt: new Date(),
          updatedBy: req.user?.userId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(scanSessionsTable.id, current.id))
        .returning();
      return updated;
    });
    res.json(sessionJson(session));
  } catch (error) {
    if (error instanceof ScanRouteError) {
      res.status(error.status).json(error.body);
      return;
    }
    throw error;
  }
});

export default router;