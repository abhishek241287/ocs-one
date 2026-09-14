#!/usr/bin/env tsx
/**
 * MAS-N04 focused certification.
 *
 * Creates an isolated BOM, approves it, creates a production order, verifies
 * MIN creation is retired, then directly inserts the historical MIN fixture
 * needed to prove the used BOM cannot be obsoleted.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pool } from "@workspace/db";
import { FAT_IDS, actorEmail } from "./fat-fixture-manifest";

const BASE = process.env.CERT_TARGET ?? "http://localhost:8080";
const PASSWORD = process.env.FAT_TEST_PASSWORD;
const OUTPUT = resolve(
  process.env.FAT_EVIDENCE_DIR ?? "../../certification/fat-evidence",
  "fat-block-2-mas-n04-used-bom.json",
);

if (!PASSWORD || PASSWORD.length < 8) {
  throw new Error("FAT_TEST_PASSWORD must be supplied out of band and contain at least 8 characters");
}

type Result = "PASS" | "FAIL" | "DATA SETUP REQUIRED";
type HttpEvidence = {
  method: string;
  path: string;
  status: number;
  response: unknown;
};

const runAt = new Date().toISOString();
const runKey = runAt.replace(/\D/g, "").slice(0, 14);
const prefix = `FAT-E2E-MAS-N04-${runKey}`;
const evidence: HttpEvidence[] = [];

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [
        key,
        /password|token|secret|authorization|cookie/i.test(key) ? "[REDACTED]" : redact(child),
      ]),
    );
  }
  return value;
}

async function login(): Promise<string> {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: actorEmail("director"), password: PASSWORD }),
  });
  if (!response.ok) throw new Error(`Director login failed: HTTP ${response.status}`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("Director login did not return a session cookie");
  return cookie;
}

async function api(
  cookie: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      Cookie: cookie,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text.slice(0, 4000);
  }
  const safe = redact(parsed);
  evidence.push({ method, path, status: response.status, response: safe });
  return { status: response.status, body: parsed };
}

async function query<T extends Record<string, unknown>>(
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  return (await pool.query(text, values)).rows as T[];
}

async function cleanup(ids: {
  bomId?: string;
  orderId?: string;
  minId?: string;
  stockSetupId?: string;
}): Promise<void> {
  await pool.query("BEGIN");
  try {
    if (ids.minId) {
      await pool.query(
        `DELETE FROM inventory_transactions WHERE source_document_type = 'MIN' AND source_document_id = $1`,
        [ids.minId],
      );
      await pool.query(`DELETE FROM material_issue_note_lines WHERE min_id = $1`, [ids.minId]);
      await pool.query(`DELETE FROM material_issue_notes WHERE id = $1`, [ids.minId]);
    }
    if (ids.stockSetupId) {
      await pool.query(`DELETE FROM inventory_transactions WHERE id = $1`, [ids.stockSetupId]);
    }
    if (ids.orderId) {
      await pool.query(`DELETE FROM mfg_battery_timeline WHERE production_order_id = $1`, [ids.orderId]);
      await pool.query(`DELETE FROM mfg_order_stages WHERE production_order_id = $1`, [ids.orderId]);
      await pool.query(`DELETE FROM mfg_production_orders WHERE id = $1`, [ids.orderId]);
    }
    if (ids.bomId) {
      await pool.query(`DELETE FROM bom_lines WHERE bom_id = $1`, [ids.bomId]);
      await pool.query(`DELETE FROM bom_headers WHERE id = $1`, [ids.bomId]);
    }
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
}

async function main(): Promise<void> {
  const cookie = await login();
  const ids: { bomId?: string; orderId?: string; minId?: string; stockSetupId?: string } = {};
  let result: Result = "FAIL";
  let failure: string | undefined;
  let setupRequired: string | undefined;
  let before: Record<string, unknown> | undefined;
  let after: Record<string, unknown> | undefined;
  let canonicalBefore: Record<string, unknown> | undefined;
  let canonicalAfter: Record<string, unknown> | undefined;
  let setupQuantity = 0;

  try {
    canonicalBefore = (await query(
      `SELECT id, status::text AS status, revision, bom_number
       FROM bom_headers WHERE id = $1`,
      [FAT_IDS.bom.header],
    ))[0];

    const createdBom = await api(cookie, "POST", "/api/boms", {
      model_id: FAT_IDS.masters.model,
      name: `${prefix} isolated used BOM`,
      yield_percent: 100,
      notes: "MAS-N04 isolated manufacturing-use candidate",
      lines: [
        {
          material_id: FAT_IDS.masters.materialBms,
          quantity_per: 1,
          position: 1,
          is_critical_component: true,
          traceability_required: true,
          notes: "Controlled BMS use line",
        },
      ],
    });
    if (createdBom.status !== 201 || !createdBom.body?.id) {
      throw new Error(`Isolated BOM creation failed: HTTP ${createdBom.status}`);
    }
    ids.bomId = createdBom.body.id;

    const approved = await api(cookie, "POST", `/api/boms/${ids.bomId}/approve`);
    if (approved.status !== 200) {
      throw new Error(`Isolated BOM approval failed: HTTP ${approved.status}`);
    }

    const createdOrder = await api(cookie, "POST", "/api/manufacturing/orders", {
      productId: FAT_IDS.masters.model,
      factoryManager: "FAT E2E MAS-N04",
      priority: "medium",
      notes: `${prefix} isolated production-use order`,
    });
    if (createdOrder.status !== 201 || !createdOrder.body?.id) {
      throw new Error(`Isolated production order creation failed: HTTP ${createdOrder.status}`);
    }
    ids.orderId = createdOrder.body.id;

    const availableRows = await query<{ available: string }>(
      `SELECT coalesce(sum(quantity), 0)::text AS available
       FROM inventory_transactions
       WHERE material_id = $1 AND stock_state = 'available'`,
      [FAT_IDS.masters.materialBms],
    );
    const available = Number(availableRows[0]?.available ?? 0);
    setupQuantity = Math.max(0, 1 - available);
    if (setupQuantity > 0) {
      const setupRows = await query<{ id: string }>(
        `INSERT INTO inventory_transactions
           (transaction_type, material_id, quantity, uom, stock_state,
            source_document_type, source_document_id, source_line_id, created_by)
         VALUES ('INSPECTION_ACCEPT', $1, $2, 'PCS', 'available',
                 'FAT-SETUP', $3, $4, $5)
         RETURNING id`,
        [
          FAT_IDS.masters.materialBms,
          setupQuantity,
          "fa150000-0000-4000-8000-000000000004",
          "fa150000-0000-4000-8000-000000000006",
          FAT_IDS.users.director,
        ],
      );
      ids.stockSetupId = setupRows[0]?.id;
    }

    const preview = await api(
      cookie,
      "GET",
      `/api/manufacturing/orders/${ids.orderId}/material-issues/preview`,
    );
    if (preview.status !== 200 || !preview.body?.bom_header_id || !preview.body?.requirements?.length) {
      throw new Error(`Material-use preview did not resolve the isolated BOM: HTTP ${preview.status}`);
    }
    if (preview.body.bom_header_id !== ids.bomId) {
      throw new Error(
        `Material-use preview resolved ${preview.body.bom_header_id}, expected isolated BOM ${ids.bomId}`,
      );
    }

    const requirement = preview.body.requirements[0];
    if (
      Number(requirement.available_qty ?? 0) < Number(requirement.required_qty) ||
      !requirement.suggested_grn_id ||
      !requirement.suggested_grn_line_id ||
      !requirement.suggested_supplier_lot_number
    ) {
      setupRequired = "Controlled BMS stock or traceability lot is unavailable for the isolated issue";
    } else {
      const issued = await api(cookie, "POST", `/api/manufacturing/orders/${ids.orderId}/material-issues`, {
        lines: [
          {
            source_bom_line_id: requirement.bom_line_id,
            issued_qty: requirement.required_qty,
            grn_id: requirement.suggested_grn_id,
            grn_line_id: requirement.suggested_grn_line_id,
            supplier_lot_number: requirement.suggested_supplier_lot_number,
          },
        ],
        notes: `${prefix} controlled production use`,
      });
      if (
        issued.status !== 410 ||
        issued.body?.code !== "MIN_DEPRECATED" ||
        issued.body?.replacement !== "POST /api/manufacturing/orders/:id/issues/bulk"
      ) {
        throw new Error(`MIN deprecation contract failed: HTTP ${issued.status}`);
      }

      const historicalMinId = randomUUID();
      const historicalLineId = randomUUID();
      const bomRevision = Number(
        (await query(`SELECT revision FROM bom_headers WHERE id = $1`, [ids.bomId]))[0]?.revision ?? 1,
      );
      await query(
        `INSERT INTO material_issue_notes
          (id, min_number, source_type, source_ref_id, bom_header_id, bom_revision,
           status, issued_by, notes)
         VALUES ($1, $2, 'PRODUCTION_ORDER', $3, $4, $5, 'posted', $6, $7)`,
        [
          historicalMinId,
          `${prefix.slice(0, 24)}-HMIN`,
          ids.orderId,
          ids.bomId,
          bomRevision,
          FAT_IDS.users.director,
          `${prefix} direct historical MIN fixture`,
        ],
      );
      await query(
        `INSERT INTO material_issue_note_lines
          (id, min_id, line_number, material_id, source_bom_line_id, required_qty,
           issued_qty, uom, grn_id, grn_line_id, supplier_lot_number,
           is_critical_component, traceability_required)
         VALUES ($1, $2, 1, $3, $4, $5, $5, $6::material_uom, $7, $8, $9, $10, $11)`,
        [
          historicalLineId,
          historicalMinId,
          requirement.material_id,
          requirement.bom_line_id,
          requirement.required_qty,
          requirement.uom,
          requirement.suggested_grn_id,
          requirement.suggested_grn_line_id,
          requirement.suggested_supplier_lot_number,
          requirement.is_critical_component,
          requirement.traceability_required,
        ],
      );
      await query(
        `INSERT INTO inventory_transactions
          (transaction_type, material_id, quantity, uom, stock_state,
           source_document_type, source_document_id, source_line_id, created_by)
         VALUES ('PRODUCTION_ISSUE', $1, $2, $3::material_uom, 'available',
                 'MIN', $4, $5, $6)`,
        [
          requirement.material_id,
          -Number(requirement.required_qty),
          requirement.uom,
          historicalMinId,
          historicalLineId,
          FAT_IDS.users.director,
        ],
      );
      ids.minId = historicalMinId;

      before = (await query(
        `SELECT h.id, h.status::text AS status, h.revision, h.bom_number,
                count(m.id)::int AS material_issue_count
         FROM bom_headers h
         LEFT JOIN material_issue_notes m ON m.bom_header_id = h.id
         WHERE h.id = $1
         GROUP BY h.id`,
        [ids.bomId],
      ))[0];

      const obsolete = await api(cookie, "POST", `/api/boms/${ids.bomId}/obsolete`);
      after = (await query(
        `SELECT h.id, h.status::text AS status, h.revision, h.bom_number,
                count(m.id)::int AS material_issue_count
         FROM bom_headers h
         LEFT JOIN material_issue_notes m ON m.bom_header_id = h.id
         WHERE h.id = $1
         GROUP BY h.id`,
        [ids.bomId],
      ))[0];
      if (
        obsolete.status !== 422 ||
        !String(obsolete.body?.error ?? "").includes("used by production") ||
        before?.status !== "approved" ||
        after?.status !== "approved" ||
        Number(after?.material_issue_count) !== 1
      ) {
        throw new Error(`Used-BOM obsoletion guard failed: HTTP ${obsolete.status}`);
      }
      result = "PASS";
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  } finally {
    await cleanup(ids);
    canonicalAfter = (await query(
      `SELECT id, status::text AS status, revision, bom_number
       FROM bom_headers WHERE id = $1`,
      [FAT_IDS.bom.header],
    ))[0];
  }

  if (setupRequired && !failure) result = "DATA SETUP REQUIRED";
  const canonicalUnchanged =
    JSON.stringify(canonicalBefore) === JSON.stringify(canonicalAfter);
  if (!canonicalUnchanged && !failure) {
    result = "FAIL";
    failure = "Canonical FAT BOM changed during isolated evidence run";
  }

  const output = {
    metadata: {
      case_id: "MAS-N04",
      assertion: "Used approved BOM cannot be obsoleted",
      generated_at: runAt,
      target: BASE,
      fixture_prefix: prefix,
      result,
    },
    setup: {
      isolated_bom_id: ids.bomId ?? null,
      production_order_id: ids.orderId ?? null,
      material_issue_id: ids.minId ?? null,
      temporary_stock_setup_id: ids.stockSetupId ?? null,
      temporary_stock_setup_quantity: setupQuantity,
      setup_required: setupRequired ?? null,
      failure: failure ?? null,
    },
    evidence: evidence.map((item) => redact(item)),
    database: {
      isolated_before_obsoletion: before ?? null,
      isolated_after_obsoletion: after ?? null,
      canonical_before: canonicalBefore ?? null,
      canonical_after: canonicalAfter ?? null,
      canonical_unchanged: canonicalUnchanged,
    },
  };
  await mkdir(resolve(OUTPUT, ".."), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(output, null, 2));
  await pool.end();
  if (result === "FAIL") process.exitCode = 1;
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exitCode = 1;
});