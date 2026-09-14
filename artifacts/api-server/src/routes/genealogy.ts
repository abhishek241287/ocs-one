import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../middleware/auth";
import { recordSecurityEvent, reqMeta } from "../lib/security-events";

const router: IRouter = Router();
router.use(requireAuth);

type DbRow = Record<string, unknown>;
type Citation = { type: string; id: string };

function documentCited(type: string, id: string): Citation {
  return { type, id };
}

function numify(value: unknown): unknown {
  return typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)
    ? Number(value)
    : value;
}

function queryValue(req: Request, name: string): string | undefined {
  const value = req.query[name];
  return typeof value === "string" ? value.trim() : undefined;
}

function isUuid(value: string | undefined): value is string {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      ),
  );
}

function isIsoDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function auditRead(req: Request, statusCode: number, detail: string): void {
  void recordSecurityEvent({
    eventType: "genealogy.read",
    actorId: req.user?.userId ?? null,
    actorEmail: req.user?.email ?? null,
    actorRole: req.user?.role ?? null,
    ...reqMeta(req),
    statusCode,
    detail,
  });
}

function validationError(
  req: Request,
  res: Response,
  issues: Array<{ path: string[]; message: string }>,
): void {
  auditRead(req, 422, "Genealogy query validation failed");
  res.status(422).json({ error: "Validation failed", issues });
}

function notFound(req: Request, res: Response, message: string): void {
  auditRead(req, 404, message);
  res.status(404).json({ error: message });
}

async function rows<T extends DbRow>(text: string, values: unknown[]): Promise<T[]> {
  const result = await pool.query(text, values);
  return result.rows as T[];
}

type Downstream = {
  reservations: DbRow[];
  wip: DbRow[];
  consumptions: DbRow[];
  transfers: DbRow[];
};

function emptyDownstream(): Downstream {
  return { reservations: [], wip: [], consumptions: [], transfers: [] };
}

async function loadDownstream(lotIds: string[]): Promise<Map<string, Downstream>> {
  const result = new Map<string, Downstream>();
  for (const lotId of lotIds) result.set(lotId, emptyDownstream());
  if (lotIds.length === 0) return result;

  const [reservationRows, wipRows, consumptionRows, transferRows] = await Promise.all([
    rows(
      `SELECT
         ira.lot_id,
         ira.id AS allocation_id,
         ira.quantity AS allocation_quantity,
         ira.status AS allocation_status,
         ir.id AS reservation_id,
         ir.reservation_number,
         ir.production_order_id
       FROM inventory_reservation_allocations ira
       JOIN inventory_reservations ir ON ir.id = ira.reservation_id
       WHERE ira.lot_id = ANY($1::uuid[])
       ORDER BY ira.lot_id, ir.created_at, ira.created_at, ira.id`,
      [lotIds],
    ),
    rows(
      `SELECT
         wil.lot_id,
         wil.id AS wip_issue_line_id,
         win.id AS wip_issue_note_id,
         win.production_order_id,
         wil.quantity,
         wi.id AS wip_inventory_id,
         wi.consumed_qty
       FROM wip_issue_lines wil
       JOIN wip_issue_notes win ON win.id = wil.wip_issue_note_id
       LEFT JOIN wip_inventory wi
         ON wi.wip_issue_note_id = win.id
        AND wi.lot_id = wil.lot_id
       WHERE wil.lot_id = ANY($1::uuid[])
       ORDER BY wil.lot_id, win.created_at, wil.created_at, wil.id`,
      [lotIds],
    ),
    rows(
      `SELECT
         cc.lot_id,
         cc.id AS confirmation_id,
         cc.confirmation_number,
         cc.actual_qty,
         cc.production_order_id
       FROM consumption_confirmations cc
       WHERE cc.lot_id = ANY($1::uuid[])
       ORDER BY cc.lot_id, cc.created_at, cc.id`,
      [lotIds],
    ),
    rows(
      `SELECT
         tl.lot_id,
         tl.id AS transfer_line_id,
         tl.transfer_request_id,
         tr.transfer_number,
         tr.status,
         COALESCE(tl.received_qty, tl.issued_qty, tl.requested_qty) AS quantity
       FROM transfer_lines tl
       JOIN transfer_requests tr ON tr.id = tl.transfer_request_id
       WHERE tl.lot_id = ANY($1::uuid[])
       ORDER BY tl.lot_id, tr.created_at, tl.id`,
      [lotIds],
    ),
  ]);

  for (const row of reservationRows) {
    const lot = result.get(String(row.lot_id));
    if (!lot) continue;
    const reservationId = String(row.reservation_id);
    const existing = lot.reservations.find(
      (item) => item.reservation_id === reservationId,
    );
    const activeQuantity = row.allocation_status === "active" ? numify(row.allocation_quantity) : 0;
    if (existing) {
      existing.quantity_active = Number(existing.quantity_active ?? 0) + Number(activeQuantity);
      continue;
    }
    lot.reservations.push({
      reservation_id: reservationId,
      number: row.reservation_number,
      production_order_id: row.production_order_id,
      quantity_active: activeQuantity,
      document_cited: documentCited("inventory_reservation", reservationId),
    });
  }

  for (const row of wipRows) {
    const lot = result.get(String(row.lot_id));
    if (!lot) continue;
    lot.wip.push({
      wip_issue_note_id: row.wip_issue_note_id,
      production_order_id: row.production_order_id,
      quantity: numify(row.quantity),
      consumed_qty: numify(row.consumed_qty ?? "0"),
      document_cited: documentCited("wip_issue_line", String(row.wip_issue_line_id)),
    });
  }

  for (const row of consumptionRows) {
    const lot = result.get(String(row.lot_id));
    if (!lot) continue;
    lot.consumptions.push({
      confirmation_id: row.confirmation_id,
      number: row.confirmation_number,
      actual_qty: numify(row.actual_qty),
      document_cited: documentCited("consumption_confirmation", String(row.confirmation_id)),
    });
  }

  for (const row of transferRows) {
    const lot = result.get(String(row.lot_id));
    if (!lot) continue;
    lot.transfers.push({
      transfer_request_id: row.transfer_request_id,
      number: row.transfer_number,
      status: row.status,
      quantity: numify(row.quantity),
      document_cited: documentCited("transfer_line", String(row.transfer_line_id)),
    });
  }

  return result;
}

function flattenedConsumers(downstream: Downstream): DbRow[] {
  return [
    ...downstream.reservations.map((item) => ({ kind: "reservation", ...item }) as DbRow),
    ...downstream.wip.map((item) => ({ kind: "wip", ...item }) as DbRow),
    ...downstream.consumptions.map((item) => ({ kind: "consumption", ...item }) as DbRow),
    ...downstream.transfers.map((item) => ({ kind: "transfer", ...item }) as DbRow),
  ].sort((a, b) =>
    `${(a.document_cited as Citation).type}:${(a.document_cited as Citation).id}`.localeCompare(
      `${(b.document_cited as Citation).type}:${(b.document_cited as Citation).id}`,
    ),
  );
}

router.get("/upstream", async (req: Request, res: Response): Promise<void> => {
  const productionOrderId = queryValue(req, "production_order_id");
  if (!isUuid(productionOrderId)) {
    validationError(req, res, [
      { path: ["production_order_id"], message: "A valid production_order_id is required" },
    ]);
    return;
  }

  const [order] = await rows<{
    id: string;
    order_number: string;
  }>(
    `SELECT id, order_number
     FROM mfg_production_orders
     WHERE id = $1
     LIMIT 1`,
    [productionOrderId],
  );
  if (!order) {
    notFound(req, res, "Production order not found");
    return;
  }

  const inputRows = await rows(
    `SELECT
       wil.id AS wip_issue_line_id,
       wil.quantity AS quantity_issued,
       wil.uom,
       win.id AS wip_issue_note_id,
       win.issue_number,
       ir.material_id,
       m.code AS material_code,
       ira.id AS allocation_id,
       ira.quantity AS allocation_quantity,
       il.id AS lot_id,
       il.lot_number,
       gli.id AS grn_line_id,
       gh.id AS grn_id,
       gh.grn_number,
       s.id AS supplier_id,
       s.name AS supplier_name,
       ac.id AS capture_instance_id,
       av.id AS capture_value_id,
       ad.code AS attribute_code,
       av.value_text,
       av.value_num,
       av.value_bool,
       av.value_date,
       av.unit
     FROM wip_issue_notes win
     JOIN wip_issue_lines wil ON wil.wip_issue_note_id = win.id
     JOIN inventory_reservations ir
       ON ir.id = win.reservation_id
      AND ir.production_order_id = win.production_order_id
     JOIN materials m ON m.id = ir.material_id
     JOIN inventory_reservation_allocations ira
       ON ira.id = wil.reservation_allocation_id
      AND ira.lot_id = wil.lot_id
     JOIN inventory_lots il
       ON il.id = ira.lot_id
      AND il.grn_line_id IS NOT NULL
     JOIN grn_line_items gli ON gli.id = il.grn_line_id
     JOIN grn_headers gh ON gh.id = gli.grn_id
     JOIN master_suppliers s ON s.id = gh.supplier_id
     LEFT JOIN attribute_capture_instances ac
       ON ac.target_type = 'GRN_LINE'
      AND ac.target_id = gli.id
      AND ac.status = 'VALIDATED'
     LEFT JOIN attribute_capture_values av
       ON av.capture_instance_id = ac.id
     LEFT JOIN attribute_definitions ad ON ad.id = av.attribute_id
     WHERE win.production_order_id = $1
     ORDER BY win.created_at, wil.created_at, wil.id, av.id`,
    [productionOrderId],
  );

  const inputs = new Map<string, DbRow>();
  for (const row of inputRows) {
    const inputKey = String(row.wip_issue_line_id);
    let input = inputs.get(inputKey);
    if (!input) {
      input = {
        material_id: row.material_id,
        material_code: row.material_code,
        quantity_issued: numify(row.quantity_issued),
        uom: row.uom,
        document_cited: documentCited("wip_issue_line", inputKey),
        issue: {
          note_id: row.wip_issue_note_id,
          note_number: row.issue_number,
          document_cited: documentCited("wip_issue_note", String(row.wip_issue_note_id)),
        },
        allocations: [],
        attributes: [],
      };
      inputs.set(inputKey, input);
    }

    const allocations = input.allocations as DbRow[];
    if (
      row.allocation_id &&
      !allocations.some((allocation) => allocation.allocation_id === row.allocation_id)
    ) {
      allocations.push({
        allocation_id: row.allocation_id,
        lot_id: row.lot_id,
        lot_number: row.lot_number,
        quantity: numify(row.allocation_quantity),
        grn_line_id: row.grn_line_id,
        grn_id: row.grn_id,
        grn_number: row.grn_number,
        supplier_id: row.supplier_id,
        supplier_name: row.supplier_name,
        document_cited: documentCited("inventory_reservation_allocation", String(row.allocation_id)),
      });
    }

    const attributes = input.attributes as DbRow[];
    if (row.capture_value_id && row.attribute_code) {
      attributes.push({
        attribute_code: row.attribute_code,
        value:
          row.value_text ??
          row.value_num ??
          row.value_bool ??
          row.value_date ??
          null,
        unit: row.unit,
        document_cited: documentCited("attribute_capture_value", String(row.capture_value_id)),
      });
    }
  }

  auditRead(req, 200, "Genealogy upstream traversal");
  res.json({
    production_order_id: order.id,
    order_number: order.order_number,
    inputs: [...inputs.values()],
  });
});

router.get("/downstream", async (req: Request, res: Response): Promise<void> => {
  const lotId = queryValue(req, "lot_id");
  if (!isUuid(lotId)) {
    validationError(req, res, [{ path: ["lot_id"], message: "A valid lot_id is required" }]);
    return;
  }

  const [lot] = await rows<{
    id: string;
    lot_number: string;
    material_id: string;
  }>(
    `SELECT id, lot_number, material_id
     FROM inventory_lots
     WHERE id = $1
     LIMIT 1`,
    [lotId],
  );
  if (!lot) {
    notFound(req, res, "Inventory lot not found");
    return;
  }

  const loaded = await loadDownstream([lotId]);
  const downstream = loaded.get(lotId) ?? emptyDownstream();
  auditRead(req, 200, "Genealogy downstream traversal");
  res.json({
    lot_id: lot.id,
    lot_number: lot.lot_number,
    material_id: lot.material_id,
    ...downstream,
  });
});

router.get("/composition", async (req: Request, res: Response): Promise<void> => {
  const productId = queryValue(req, "product_id");
  const serialNumber = queryValue(req, "serial_number");
  if ((productId && serialNumber) || (!productId && !serialNumber)) {
    validationError(req, res, [
      {
        path: ["product_id", "serial_number"],
        message: "Provide exactly one of product_id or serial_number",
      },
    ]);
    return;
  }
  if (productId && !isUuid(productId)) {
    validationError(req, res, [{ path: ["product_id"], message: "product_id must be a valid UUID" }]);
    return;
  }
  if (serialNumber && serialNumber.length > 100) {
    validationError(req, res, [{ path: ["serial_number"], message: "serial_number is too long" }]);
    return;
  }

  const productRows = productId
    ? await rows(
        `SELECT id AS product_id, official_product_serial AS serial_number,
                source_production_order_id AS production_order_id
         FROM products
         WHERE id = $1
         LIMIT 1`,
        [productId],
      )
    : await rows(
        `SELECT p.id AS product_id,
                p.official_product_serial AS serial_number,
                p.source_production_order_id AS production_order_id
         FROM serial_units su
         JOIN products p ON p.id = su.product_id
         WHERE su.serial_number = $1
         LIMIT 1`,
        [serialNumber],
      );
  const product = productRows[0];
  if (!product) {
    notFound(req, res, "Manufactured Product not found");
    return;
  }
  if (!product.production_order_id) {
    notFound(req, res, "Composition is only available for manufactured Products");
    return;
  }

  const [orderRows, lotRows, cellRows] = await Promise.all([
    rows(
      `SELECT id, order_number
       FROM mfg_production_orders
       WHERE id = $1
       LIMIT 1`,
      [product.production_order_id],
    ),
    rows(
      `SELECT
         wi.lot_id,
         il.lot_number,
         wi.material_id,
         SUM(wi.consumed_qty) AS quantity,
         MIN(wi.id::text) AS document_id
       FROM wip_inventory wi
       JOIN inventory_lots il ON il.id = wi.lot_id
       WHERE wi.production_order_id = $1
         AND wi.lot_id IS NOT NULL
         AND wi.consumed_qty > 0
       GROUP BY wi.lot_id, il.lot_number, wi.material_id
       ORDER BY il.lot_number, wi.lot_id`,
      [product.production_order_id],
    ),
    rows(
      `SELECT DISTINCT
         cl.id AS cell_lot_id,
         cl.transfer_id,
         mt.grn_line_id,
         cmi.id AS match_item_id
       FROM mfg_production_orders po
       JOIN cell_matches cm ON cm.id = po.cell_match_id
       JOIN cell_match_items cmi ON cmi.match_id = cm.id
       JOIN cells c ON c.id = cmi.cell_id
       JOIN cell_lots cl ON cl.id = c.lot_id
       JOIN material_transfers mt ON mt.id = cl.transfer_id
       WHERE po.id = $1
       ORDER BY cl.id`,
      [product.production_order_id],
    ),
  ]);
  const order = orderRows[0];
  if (!order) {
    notFound(req, res, "Production order not found for Product");
    return;
  }

  auditRead(req, 200, "Genealogy composition traversal");
  res.json({
    product: {
      product_id: product.product_id,
      serial_number: product.serial_number,
      production_order_id: product.production_order_id,
      document_cited: documentCited("product", String(product.product_id)),
    },
    order: {
      id: order.id,
      number: order.order_number,
      document_cited: documentCited("mfg_production_order", String(order.id)),
    },
    consumed_lots: lotRows.map((row) => ({
      lot_id: row.lot_id,
      lot_number: row.lot_number,
      material_id: row.material_id,
      quantity: numify(row.quantity),
      document_cited: documentCited("wip_inventory", String(row.document_id)),
    })),
    cell_genealogy: cellRows.map((row) => ({
      cell_lot_id: row.cell_lot_id,
      transfer_id: row.transfer_id,
      grn_line_id: row.grn_line_id,
      document_cited: documentCited("cell_match_item", String(row.match_item_id)),
    })),
  });
});

router.get("/recall", async (req: Request, res: Response): Promise<void> => {
  const templateId = queryValue(req, "template_id");
  const attributeCode = queryValue(req, "attribute_code");
  const minRaw = queryValue(req, "min");
  const maxRaw = queryValue(req, "max");
  const dateFrom = queryValue(req, "date_from");
  const dateTo = queryValue(req, "date_to");
  const issues: Array<{ path: string[]; message: string }> = [];

  if (!isUuid(templateId)) issues.push({ path: ["template_id"], message: "A valid template_id is required" });
  if (!attributeCode) issues.push({ path: ["attribute_code"], message: "attribute_code is required" });
  const min = minRaw === undefined ? Number.NaN : Number(minRaw);
  const max = maxRaw === undefined ? Number.NaN : Number(maxRaw);
  if (!Number.isFinite(min)) issues.push({ path: ["min"], message: "min must be numeric" });
  if (!Number.isFinite(max)) issues.push({ path: ["max"], message: "max must be numeric" });
  if (Number.isFinite(min) && Number.isFinite(max) && min >= max) {
    issues.push({ path: ["min", "max"], message: "min must be less than max" });
  }
  if (dateFrom && !isIsoDate(dateFrom)) issues.push({ path: ["date_from"], message: "date_from must be YYYY-MM-DD" });
  if (dateTo && !isIsoDate(dateTo)) issues.push({ path: ["date_to"], message: "date_to must be YYYY-MM-DD" });
  if ((dateFrom && !dateTo) || (!dateFrom && dateTo)) {
    issues.push({ path: ["date_from", "date_to"], message: "date_from and date_to must be supplied together" });
  }
  if (dateFrom && dateTo && dateFrom > dateTo) {
    issues.push({ path: ["date_from", "date_to"], message: "date_from must not be after date_to" });
  }
  if (issues.length > 0) {
    validationError(req, res, issues);
    return;
  }

  const [templateAttribute] = await rows(
    `SELECT
       atv.id AS template_version_id,
       atv.template_id,
       ata.attribute_id,
       ad.code AS attribute_code
     FROM attribute_template_versions atv
     JOIN attribute_template_attributes ata ON ata.template_version_id = atv.id
     JOIN attribute_definitions ad ON ad.id = ata.attribute_id
     WHERE atv.id = $1
       AND ad.code = $2
     LIMIT 1`,
    [templateId, attributeCode],
  );
  if (!templateAttribute) {
    validationError(req, res, [
      { path: ["template_id", "attribute_code"], message: "Attribute is not defined by template version" },
    ]);
    return;
  }

  const matchRows = await rows(
    `SELECT
       av.id AS capture_value_id,
       ac.id AS capture_instance_id,
       ac.material_id,
       ac.target_id AS grn_line_id,
       av.value_num,
       av.unit,
       gli.grn_id,
       il.id AS lot_id,
       il.lot_number
     FROM attribute_capture_instances ac
     JOIN attribute_capture_values av
       ON av.capture_instance_id = ac.id
      AND av.attribute_id = $2
     JOIN grn_line_items gli ON gli.id = ac.target_id
     JOIN grn_headers gh ON gh.id = gli.grn_id
     JOIN inventory_lots il ON il.grn_line_id = gli.id
     WHERE ac.target_type = 'GRN_LINE'
       AND ac.template_version_id = $1
       AND ac.status = 'VALIDATED'
       AND av.value_num IS NOT NULL
       AND av.value_num >= $3
       AND av.value_num < $4
       AND ($5::date IS NULL OR gh.received_date >= $5::date)
       AND ($6::date IS NULL OR gh.received_date <= $6::date)
     ORDER BY av.value_num, il.lot_number, il.id, av.id`,
    [
      templateId,
      templateAttribute.attribute_id,
      min,
      max,
      dateFrom ?? null,
      dateTo ?? null,
    ],
  );
  const lotIds = [...new Set(matchRows.map((row) => String(row.lot_id)))];
  const downstreamByLot = await loadDownstream(lotIds);

  const matches = matchRows.map((row) => ({
    material_id: row.material_id,
    lot_id: row.lot_id,
    lot_number: row.lot_number,
    grn_line_id: row.grn_line_id,
    grn_id: row.grn_id,
    value_num: numify(row.value_num),
    unit: row.unit,
    capture_instance_id: row.capture_instance_id,
    document_cited: documentCited("attribute_capture_value", String(row.capture_value_id)),
  }));
  const downstream = lotIds.map((lotId) => {
    const consumers = flattenedConsumers(downstreamByLot.get(lotId) ?? emptyDownstream());
    const capped = consumers.slice(0, 25);
    return {
      lot_id: lotId,
      consumers: capped,
      meta: {
        total: consumers.length,
        returned: capped.length,
        truncated: consumers.length > capped.length,
      },
    };
  });

  auditRead(req, 200, "Genealogy recall traversal");
  res.json({
    criteria: {
      template_id: templateId,
      attribute_code: attributeCode,
      min,
      max,
      date_from: dateFrom ?? null,
      date_to: dateTo ?? null,
    },
    matches,
    downstream,
  });
});

// Genealogy is read-only. Keep write verbs explicit so clients receive 405 rather
// than silently falling through to a different router or a generic 404.
router.use((req: Request, res: Response): void => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    auditRead(req, 405, "Genealogy write method rejected");
    res.status(405).set("Allow", "GET, HEAD").json({ error: "Genealogy is read-only" });
    return;
  }
  auditRead(req, 404, "Genealogy route not found");
  res.status(404).json({ error: "Genealogy route not found" });
});

export default router;