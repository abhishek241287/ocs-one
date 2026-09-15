import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

const STOCK_STATES = [
  "inspection_pending",
  "available",
  "rejected",
  "quarantined",
  "wip",
  "consumed",
  "returned",
  "scrapped",
  "in_transit",
] as const;

type StockState = (typeof STOCK_STATES)[number];

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function parseUuid(value: string | undefined, name: string): string | undefined {
  if (value == null || value === "") return undefined;
  if (!isUuid(value)) throw new Error(`invalid_${name}`);
  return value;
}

function parseDate(value: string | undefined, name: string, endOfDay = false): Date | undefined {
  if (value == null || value === "") return undefined;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`
    : value;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) throw new Error(`invalid_${name}`);
  return parsed;
}

function parseLimit(value: string | undefined): number {
  if (value == null || value === "") return 100;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) {
    throw new Error("invalid_limit");
  }
  return parsed;
}

function parseStockState(value: string | undefined): StockState | undefined {
  if (value == null || value === "") return undefined;
  if (!STOCK_STATES.includes(value as StockState)) throw new Error("invalid_stock_state");
  return value as StockState;
}

function queryError(res: Parameters<Parameters<IRouter["get"]>[1]>[1], error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("invalid_")) {
    res.status(400).json({ error: message });
    return;
  }
  throw error;
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumberValue(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function rounded(value: number, digits = 7): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function dateFilters(
  from: string | undefined,
  to: string | undefined,
): { from: Date; to: Date } {
  const parsedFrom =
    parseDate(from, "from") ?? new Date(Date.now() - 30 * 86400000);
  const parsedTo = parseDate(to, "to", true) ?? new Date();
  if (parsedFrom > parsedTo) throw new Error("invalid_date_range");
  return { from: parsedFrom, to: parsedTo };
}

function sourceDocument(row: Record<string, unknown>, prefix = "source") {
  return {
    [`${prefix}_document_type`]: row[`${prefix}_document_type`] ?? null,
    [`${prefix}_document_id`]: row[`${prefix}_document_id`] ?? null,
    [`${prefix}_line_id`]: row[`${prefix}_line_id`] ?? null,
  };
}

/**
 * Value-on-hand is deliberately projected from two immutable sources:
 * valuation_layers supplies the authoritative remaining quantity and cost
 * status, while inventory_transactions supplies the current warehouse/state
 * split. A residual "unlocated" row keeps layer math visible if old or
 * malformed ledger rows cannot be mapped to a location.
 */
router.get("/value-on-hand", async (req, res) => {
  try {
    const materialId = parseUuid(req.query.material_id as string | undefined, "material_id");
    const warehouseId = parseUuid(req.query.warehouse_id as string | undefined, "warehouse_id");
    const stockState = parseStockState(req.query.stock_state as string | undefined);

    const layerFilters = [sql`vl.remaining_quantity > 0`];
    if (materialId) layerFilters.push(sql`vl.material_id = ${materialId}::uuid`);

    const balanceFilters = [sql`it.source_line_id IS NOT NULL`];
    if (materialId) balanceFilters.push(sql`it.material_id = ${materialId}::uuid`);
    const result = await db.execute(sql`
      WITH layer_scope AS (
        SELECT
          vl.id AS layer_id,
          vl.grn_line_id,
          vl.material_id,
          vl.receipt_quantity,
          vl.remaining_quantity,
          vl.uom,
          vl.receipt_unit_cost,
          vl.receipt_currency,
          vl.receipt_cost_status,
          vl.policy,
          vl.receipt_movement_id,
          vl.created_at
        FROM valuation_layers vl
        WHERE ${sql.join(layerFilters, sql` AND `)}
      ),
      balances AS (
        SELECT
          it.source_line_id AS grn_line_id,
          it.material_id,
          it.warehouse_id,
          it.stock_state,
          SUM(it.quantity)::numeric AS quantity
        FROM inventory_transactions it
        WHERE ${sql.join(balanceFilters, sql` AND `)}
        GROUP BY it.source_line_id, it.material_id, it.warehouse_id, it.stock_state
        HAVING SUM(it.quantity) <> 0
      ),
      mapped AS (
        SELECT
          ls.layer_id,
          ls.grn_line_id,
          ls.material_id,
          ls.receipt_quantity,
          ls.remaining_quantity,
          ls.uom,
          ls.receipt_unit_cost,
          ls.receipt_currency,
          ls.receipt_cost_status,
          ls.policy,
          ls.receipt_movement_id,
          ls.created_at,
          b.warehouse_id,
          b.stock_state,
          b.quantity
        FROM layer_scope ls
        INNER JOIN balances b
          ON b.grn_line_id = ls.grn_line_id
         AND b.material_id = ls.material_id
      ),
      residual AS (
        SELECT
          ls.layer_id,
          ls.grn_line_id,
          ls.material_id,
          ls.receipt_quantity,
          ls.remaining_quantity,
          ls.uom,
          ls.receipt_unit_cost,
          ls.receipt_currency,
          ls.receipt_cost_status,
          ls.policy,
          ls.receipt_movement_id,
          ls.created_at,
          NULL::uuid AS warehouse_id,
          NULL::inventory_stock_state AS stock_state,
          (
            ls.remaining_quantity - COALESCE(SUM(m.quantity), 0)
          )::numeric AS quantity
        FROM layer_scope ls
        LEFT JOIN mapped m ON m.layer_id = ls.layer_id
        GROUP BY
          ls.layer_id,
          ls.grn_line_id,
          ls.material_id,
          ls.receipt_quantity,
          ls.remaining_quantity,
          ls.uom,
          ls.receipt_unit_cost,
          ls.receipt_currency,
          ls.receipt_cost_status,
          ls.policy,
          ls.receipt_movement_id,
          ls.created_at
        HAVING ls.remaining_quantity - COALESCE(SUM(m.quantity), 0) <> 0
      ),
      projected AS (
        SELECT * FROM mapped WHERE quantity <> 0
        UNION ALL
        SELECT * FROM residual WHERE quantity <> 0
      )
      SELECT
        p.layer_id,
        p.grn_line_id,
        p.material_id,
        m.code AS material_code,
        m.name AS material_name,
        p.receipt_quantity,
        p.remaining_quantity AS layer_remaining_quantity,
        p.quantity,
        p.uom,
        CASE
          WHEN p.receipt_cost_status = 'CAPTURED' THEN 'CAPTURED'
          ELSE 'UNKNOWN'
        END AS value_status,
        CASE
          WHEN p.receipt_cost_status = 'CAPTURED' THEN p.receipt_unit_cost
          ELSE NULL
        END AS unit_cost,
        CASE
          WHEN p.receipt_cost_status = 'CAPTURED'
            THEN ROUND((p.quantity * p.receipt_unit_cost)::numeric, 7)
          ELSE NULL
        END AS value_amount,
        CASE
          WHEN p.receipt_cost_status = 'CAPTURED' THEN p.receipt_currency
          ELSE NULL
        END AS currency,
        p.receipt_cost_status,
        p.policy,
        p.receipt_movement_id,
        p.warehouse_id,
        COALESCE(w.code, 'UNLOCATED') AS warehouse_code,
        COALESCE(w.name, 'Unlocated / legacy mapping') AS warehouse_name,
        COALESCE(p.stock_state::text, 'unlocated') AS stock_state,
        p.created_at
      FROM projected p
      INNER JOIN master_materials m ON m.id = p.material_id
      LEFT JOIN warehouses w ON w.id = p.warehouse_id
      WHERE (${warehouseId ? sql`p.warehouse_id = ${warehouseId}::uuid` : sql`TRUE`})
        AND (${stockState ? sql`p.stock_state = ${stockState}::inventory_stock_state` : sql`TRUE`})
      ORDER BY m.code, p.warehouse_id NULLS LAST, p.stock_state NULLS LAST,
        p.receipt_cost_status, p.layer_id;
    `);

    const rows = (result.rows as Record<string, unknown>[]).map((row) => {
      const quantity = numberValue(row.quantity);
      const layerRemainingQuantity = numberValue(row.layer_remaining_quantity);
      const valueStatus = String(row.value_status);
      const valueAmount =
        valueStatus === "CAPTURED" ? nullableNumberValue(row.value_amount) : null;
      return {
        layer_id: String(row.layer_id),
        grn_line_id: String(row.grn_line_id),
        material_id: String(row.material_id),
        material_code: String(row.material_code),
        material_name: String(row.material_name),
        warehouse_id: row.warehouse_id == null ? null : String(row.warehouse_id),
        warehouse_code: String(row.warehouse_code),
        warehouse_name: String(row.warehouse_name),
        stock_state: String(row.stock_state),
        quantity: rounded(quantity, 3),
        uom: String(row.uom),
        layer_remaining_quantity: rounded(layerRemainingQuantity, 3),
        value_status: valueStatus,
        receipt_cost_status: String(row.receipt_cost_status),
        unit_cost: valueStatus === "CAPTURED" ? nullableNumberValue(row.unit_cost) : null,
        value_amount: valueAmount == null ? null : rounded(valueAmount),
        currency: valueStatus === "CAPTURED" ? String(row.currency) : null,
        policy: String(row.policy),
        receipt_movement_id: String(row.receipt_movement_id),
        created_at: new Date(String(row.created_at)).toISOString(),
      };
    });

    const capturedValueByCurrency = new Map<string, number>();
    let totalQuantity = 0;
    let capturedQuantity = 0;
    let unknownQuantity = 0;
    for (const row of rows) {
      totalQuantity += row.quantity;
      if (row.value_status === "CAPTURED") {
        capturedQuantity += row.quantity;
        if (row.currency && row.value_amount != null) {
          capturedValueByCurrency.set(
            row.currency,
            (capturedValueByCurrency.get(row.currency) ?? 0) + row.value_amount,
          );
        }
      } else {
        unknownQuantity += row.quantity;
      }
    }

    res.json({
      filters: {
        material_id: materialId ?? null,
        warehouse_id: warehouseId ?? null,
        stock_state: stockState ?? null,
      },
      summary: {
        total_quantity: rounded(totalQuantity, 3),
        captured_quantity: rounded(capturedQuantity, 3),
        unknown_quantity: rounded(unknownQuantity, 3),
        captured_coverage_pct:
          totalQuantity > 0 ? rounded((capturedQuantity / totalQuantity) * 100, 2) : null,
        captured_value_by_currency: [...capturedValueByCurrency.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([currency, value]) => ({ currency, value_amount: rounded(value) })),
        layer_count: new Set(rows.map((row) => row.layer_id)).size,
        row_count: rows.length,
      },
      rows,
      refreshed_at: new Date().toISOString(),
    });
  } catch (error) {
    queryError(res, error);
  }
});

router.get("/movements-at-cost", async (req, res) => {
  try {
    const materialId = parseUuid(req.query.material_id as string | undefined, "material_id");
    const movementId = parseUuid(req.query.movement_id as string | undefined, "movement_id");
    const { from, to } = dateFilters(
      req.query.from as string | undefined,
      req.query.to as string | undefined,
    );
    const limit = parseLimit(req.query.limit as string | undefined);

    const filters = [
      sql`e.event_at >= ${from.toISOString()}::timestamptz`,
      sql`e.event_at <= ${to.toISOString()}::timestamptz`,
    ];
    if (materialId) filters.push(sql`e.material_id = ${materialId}::uuid`);
    if (movementId) filters.push(sql`e.movement_id = ${movementId}::uuid`);

    const result = await db.execute(sql`
      WITH events AS (
        SELECT
          vl.id AS event_id,
          vl.id AS layer_id,
          vl.material_id,
          vl.receipt_movement_id AS movement_id,
          vl.created_at AS event_at,
          'RECEIPT'::text AS event_type,
          vl.receipt_quantity AS quantity,
          CASE WHEN vl.receipt_cost_status = 'CAPTURED' THEN 'CAPTURED' ELSE 'UNKNOWN' END AS value_status,
          CASE WHEN vl.receipt_cost_status = 'CAPTURED' THEN vl.receipt_unit_cost ELSE NULL END AS unit_cost,
          CASE
            WHEN vl.receipt_cost_status = 'CAPTURED'
              THEN ROUND((vl.receipt_quantity * vl.receipt_unit_cost)::numeric, 7)
            ELSE NULL
          END AS value_amount,
          CASE WHEN vl.receipt_cost_status = 'CAPTURED' THEN vl.receipt_currency ELSE NULL END AS currency,
          vl.policy,
          0::integer AS allocation_index,
          it.transaction_type,
          it.source_document_type,
          it.source_document_id,
          it.source_line_id,
          it.warehouse_id,
          it.stock_state
        FROM valuation_layers vl
        INNER JOIN inventory_transactions it ON it.id = vl.receipt_movement_id
        UNION ALL
        SELECT
          d.id AS event_id,
          d.valuation_layer_id AS layer_id,
          d.material_id,
          d.movement_id,
          d.created_at AS event_at,
          CASE
            WHEN it.transaction_type = 'SCRAP' THEN 'WRITE_OFF'
            WHEN it.transaction_type IN ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT') THEN 'ADJUSTMENT'
            WHEN d.quantity > 0 THEN 'RESTORATION'
            ELSE 'DEPLETION'
          END AS event_type,
          d.quantity AS quantity,
          d.value_status::text AS value_status,
          d.unit_cost,
          d.value_amount,
          d.currency,
          d.policy,
          d.allocation_index,
          it.transaction_type,
          d.source_document_type,
          d.source_document_id,
          d.source_line_id,
          it.warehouse_id,
          it.stock_state
        FROM valuation_depletions d
        INNER JOIN inventory_transactions it ON it.id = d.movement_id
      )
      SELECT
        e.*,
        m.code AS material_code,
        m.name AS material_name,
        w.code AS warehouse_code,
        w.name AS warehouse_name
      FROM events e
      INNER JOIN master_materials m ON m.id = e.material_id
      LEFT JOIN warehouses w ON w.id = e.warehouse_id
      WHERE ${sql.join(filters, sql` AND `)}
      ORDER BY e.event_at ASC, e.movement_id ASC, e.allocation_index ASC, e.event_id ASC
      LIMIT ${limit};
    `);

    const rows = (result.rows as Record<string, unknown>[]).map((row) => ({
      event_id: String(row.event_id),
      layer_id: String(row.layer_id),
      movement_id: String(row.movement_id),
      event_at: new Date(String(row.event_at)).toISOString(),
      event_type: String(row.event_type),
      transaction_type: String(row.transaction_type),
      material_id: String(row.material_id),
      material_code: String(row.material_code),
      material_name: String(row.material_name),
      quantity: rounded(numberValue(row.quantity), 3),
      value_status: String(row.value_status),
      unit_cost: nullableNumberValue(row.unit_cost),
      value_amount: nullableNumberValue(row.value_amount),
      currency: row.currency == null ? null : String(row.currency),
      policy: String(row.policy),
      allocation_index: Number(row.allocation_index),
      warehouse_id: row.warehouse_id == null ? null : String(row.warehouse_id),
      warehouse_code: row.warehouse_code == null ? null : String(row.warehouse_code),
      warehouse_name: row.warehouse_name == null ? null : String(row.warehouse_name),
      ...sourceDocument(row),
    }));

    res.json({
      filters: {
        from: from.toISOString(),
        to: to.toISOString(),
        material_id: materialId ?? null,
        movement_id: movementId ?? null,
        limit,
      },
      rows,
      refreshed_at: new Date().toISOString(),
    });
  } catch (error) {
    queryError(res, error);
  }
});

router.get("/layer-trace", async (req, res) => {
  try {
    const movementId = parseUuid(req.query.movement_id as string | undefined, "movement_id");
    const materialId = parseUuid(req.query.material_id as string | undefined, "material_id");
    const { from, to } = dateFilters(
      req.query.from as string | undefined,
      req.query.to as string | undefined,
    );
    const limit = parseLimit(req.query.limit as string | undefined);

    const filters = [
      sql`d.created_at >= ${from.toISOString()}::timestamptz`,
      sql`d.created_at <= ${to.toISOString()}::timestamptz`,
    ];
    if (movementId) filters.push(sql`d.movement_id = ${movementId}::uuid`);
    if (materialId) filters.push(sql`d.material_id = ${materialId}::uuid`);

    const result = await db.execute(sql`
      SELECT
        d.id AS allocation_id,
        d.created_at AS event_at,
        d.movement_id,
        d.allocation_index,
        CASE WHEN d.quantity > 0 THEN 'RESTORATION' ELSE 'DEPLETION' END AS direction,
        d.quantity,
        d.value_status,
        d.unit_cost,
        d.value_amount,
        d.currency,
        d.policy,
        d.material_id,
        m.code AS material_code,
        m.name AS material_name,
        d.source_document_type,
        d.source_document_id,
        d.source_line_id,
        d.valuation_layer_id AS layer_id,
        vl.grn_line_id,
        vl.receipt_movement_id,
        vl.receipt_quantity,
        vl.remaining_quantity AS layer_remaining_quantity,
        vl.receipt_cost_status,
        vl.receipt_unit_cost,
        vl.receipt_currency,
        vl.created_at AS layer_created_at,
        receipt_it.source_document_type AS receipt_document_type,
        receipt_it.source_document_id AS receipt_document_id,
        receipt_it.source_line_id AS receipt_line_id,
        receipt_it.created_at AS receipt_event_at
      FROM valuation_depletions d
      INNER JOIN valuation_layers vl ON vl.id = d.valuation_layer_id
      INNER JOIN master_materials m ON m.id = d.material_id
      LEFT JOIN inventory_transactions receipt_it ON receipt_it.id = vl.receipt_movement_id
      WHERE ${sql.join(filters, sql` AND `)}
      ORDER BY d.created_at ASC, d.movement_id ASC, d.allocation_index ASC, d.id ASC
      LIMIT ${limit};
    `);

    const rows = (result.rows as Record<string, unknown>[]).map((row) => ({
      allocation_id: String(row.allocation_id),
      event_at: new Date(String(row.event_at)).toISOString(),
      movement_id: String(row.movement_id),
      allocation_index: Number(row.allocation_index),
      direction: String(row.direction),
      quantity: rounded(numberValue(row.quantity), 3),
      value_status: String(row.value_status),
      unit_cost: nullableNumberValue(row.unit_cost),
      value_amount: nullableNumberValue(row.value_amount),
      currency: row.currency == null ? null : String(row.currency),
      policy: String(row.policy),
      material_id: String(row.material_id),
      material_code: String(row.material_code),
      material_name: String(row.material_name),
      ...sourceDocument(row),
      layer_id: String(row.layer_id),
      grn_line_id: String(row.grn_line_id),
      receipt_movement_id: String(row.receipt_movement_id),
      receipt_quantity: rounded(numberValue(row.receipt_quantity), 3),
      layer_remaining_quantity: rounded(numberValue(row.layer_remaining_quantity), 3),
      receipt_cost_status: String(row.receipt_cost_status),
      receipt_unit_cost: nullableNumberValue(row.receipt_unit_cost),
      receipt_currency: row.receipt_currency == null ? null : String(row.receipt_currency),
      layer_created_at: new Date(String(row.layer_created_at)).toISOString(),
      receipt_document_type: row.receipt_document_type == null ? null : String(row.receipt_document_type),
      receipt_document_id: row.receipt_document_id == null ? null : String(row.receipt_document_id),
      receipt_line_id: row.receipt_line_id == null ? null : String(row.receipt_line_id),
      receipt_event_at:
        row.receipt_event_at == null ? null : new Date(String(row.receipt_event_at)).toISOString(),
    }));

    res.json({
      filters: {
        from: from.toISOString(),
        to: to.toISOString(),
        movement_id: movementId ?? null,
        material_id: materialId ?? null,
        limit,
      },
      rows,
      refreshed_at: new Date().toISOString(),
    });
  } catch (error) {
    queryError(res, error);
  }
});

export default router;