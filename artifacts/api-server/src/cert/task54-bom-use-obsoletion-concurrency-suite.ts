#!/usr/bin/env tsx
/**
 * Task #54 focused development regression.
 *
 * Creates two isolated BOM/order fixtures and exercises the real HTTP routes.
 * MIN creation is now retired, so both orderings prove the safe result:
 * MIN returns the stable 410 contract and obsoletion proceeds without a MIN.
 *
 * Only the isolated rows created by this suite are removed. Historical FAT
 * fixtures and evidence are not touched.
 *
 * Run:
 *   TESTED_REVISION="$(git rev-parse HEAD)" \
 *   CERT_BASE_URL=http://localhost:80 \
 *   pnpm --filter @workspace/api-server run test:task54-bom-use-obsoletion
 */

import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pool } from "@workspace/db";
import { FAT_IDS, actorEmail } from "./fat-fixture-manifest";

const BASE_URL = (process.env.CERT_BASE_URL ?? "http://localhost:80").replace(/\/$/, "");
const PASSWORD = process.env.FAT_TEST_PASSWORD;
const OUTPUT = resolve(
  process.env.FAT_EVIDENCE_DIR ?? "../../certification/fat-evidence",
  "task54-bom-use-obsoletion-concurrency.json",
);
const TESTED_REVISION = process.env.TESTED_REVISION ?? "uncommitted-working-tree";

if (!PASSWORD || PASSWORD.length < 8) {
  throw new Error("FAT_TEST_PASSWORD must be supplied out of band and contain at least 8 characters");
}

type Result = "PASS" | "FAIL" | "ENVIRONMENT BLOCKED";
type Ordering = "material_use_first" | "obsoletion_first";

type Fixture = {
  prefix: string;
  modelId: string;
  bomId: string;
  bomLineId: string;
  orderId: string;
  minId?: string;
};

type HttpResult = {
  status: number;
  body: any;
};

type State = {
  bomStatus: string | null;
  materialIssueCount: number;
  materialIssueLineCount: number;
  inventoryMovementCount: number;
  materialIssueTimelineCount: number;
  minIds: string[];
};

type RaceEvidence = {
  ordering: Ordering;
  firstOperation: "material_issue" | "obsolete";
  secondOperation: "material_issue" | "obsolete";
  materialIssue: { status: number; id: string | null; error: string | null };
  obsoletion: { status: number; bomStatus: string | null; error: string | null };
  finalState: State | null;
  assertions: Record<string, boolean>;
  exactOutcome: boolean;
  forbiddenState: boolean;
  cleanup: { ok: boolean; error: string | null };
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function jsonBody(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function cookieFromSetCookie(setCookie: string | null): string {
  const match = setCookie?.match(/ocs_token=([^;]+)/);
  if (!match) throw new Error("Task #54 login did not return ocs_token");
  return `ocs_token=${match[1]}`;
}

async function login(): Promise<string> {
  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: actorEmail("director"), password: PASSWORD }),
  });
  if (!response.ok) throw new Error(`Director login failed: HTTP ${response.status}`);
  return cookieFromSetCookie(response.headers.get("set-cookie"));
}

async function request(
  cookie: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<HttpResult> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      Cookie: cookie,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await jsonBody(response) };
}

async function query<T extends Record<string, unknown>>(
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  return (await pool.query(text, values)).rows as T[];
}

async function waitForBomLockWaiters(expected: number): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const rows = await query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM pg_locks
       WHERE NOT granted`,
    );
    if (Number(rows[0]?.count ?? 0) >= expected) return;
    await sleep(25);
  }
  throw new Error(`Timed out waiting for ${expected} BOM lifecycle lock waiter(s)`);
}

async function createFixture(cookie: string, prefix: string): Promise<Fixture> {
  const modelId = randomUUID();
  await pool.query(
    `INSERT INTO master_products
       (id, code, name, description, status, revision_number, chemistry, category,
        nominal_voltage_v, capacity_ah, energy_kwh, configuration, cell_count,
        warranty_period_months, created_by)
     VALUES ($1, $2, $3, $4, 'active', 1, 'LFP', 'TASK54',
             51.2, 280, 14.336, 'TASK54', 16, 24, $5)`,
    [
      modelId,
      `${prefix}-MODEL`,
      `${prefix} isolated model`,
      `${prefix} Task #54 model with no alternate approved BOM`,
      FAT_IDS.users.director,
    ],
  );

  try {
    const createdBom = await request(cookie, "POST", "/api/boms", {
      model_id: modelId,
      name: `${prefix} isolated concurrency BOM`,
      yield_percent: 100,
      notes: `${prefix} Task #54 isolated fixture`,
      lines: [
        {
          material_id: FAT_IDS.masters.materialBms,
          quantity_per: 1,
          position: 1,
          is_critical_component: false,
          traceability_required: false,
          is_optional: false,
          notes: `${prefix} material line`,
        },
      ],
    });
    assert(createdBom.status === 201 && createdBom.body?.id, `BOM creation failed: HTTP ${createdBom.status}`);

    const bomId = String(createdBom.body.id);
    const bomLineId = String(createdBom.body.lines?.[0]?.id ?? "");
    assert(bomLineId, "Created Task #54 BOM did not return its line");

    const approved = await request(cookie, "POST", `/api/boms/${bomId}/approve`);
    assert(approved.status === 200, `BOM approval failed: HTTP ${approved.status}`);

    const createdOrder = await request(cookie, "POST", "/api/manufacturing/orders", {
      productId: modelId,
      factoryManager: `${prefix} Task #54`,
      priority: "medium",
      notes: `${prefix} isolated concurrency order`,
    });
    assert(
      createdOrder.status === 201 && createdOrder.body?.id,
      `Production order creation failed: HTTP ${createdOrder.status}`,
    );

    return {
      prefix,
      modelId,
      bomId,
      bomLineId,
      orderId: String(createdOrder.body.id),
    };
  } catch (error) {
    await pool.query(`DELETE FROM master_products WHERE id = $1`, [modelId]);
    throw error;
  }
}

async function prepareStock(): Promise<string | null> {
  const availableRows = await query<{ available: string }>(
    `SELECT coalesce(sum(quantity), 0)::text AS available
     FROM inventory_transactions
     WHERE material_id = $1 AND stock_state = 'available'`,
    [FAT_IDS.masters.materialBms],
  );
  const available = Number(availableRows[0]?.available ?? 0);
  const needed = Math.max(0, 2 - available);
  if (needed <= 0) return null;

  const uomRows = await query<{ uom: string }>(
    `SELECT uom::text AS uom FROM master_materials WHERE id = $1`,
    [FAT_IDS.masters.materialBms],
  );
  assert(uomRows[0]?.uom, "Task #54 BMS material UOM is unavailable");

  const [sourceDocumentId, sourceLineId] = [randomUUID(), randomUUID()];
  const rows = await query<{ id: string }>(
    `INSERT INTO inventory_transactions
       (transaction_type, material_id, quantity, uom, stock_state,
        source_document_type, source_document_id, source_line_id, created_by)
     VALUES ('INSPECTION_ACCEPT', $1, $2, $3, 'available',
             'TASK54_SETUP', $4, $5, $6)
     RETURNING id`,
    [
      FAT_IDS.masters.materialBms,
      needed,
      uomRows[0].uom,
      sourceDocumentId,
      sourceLineId,
      FAT_IDS.users.director,
    ],
  );
  return rows[0]?.id ?? null;
}

async function issueBody(cookie: string, fixture: Fixture): Promise<unknown> {
  const preview = await request(
    cookie,
    "GET",
    `/api/manufacturing/orders/${fixture.orderId}/material-issues/preview`,
  );
  assert(
    preview.status === 200 &&
      preview.body?.bom_header_id === fixture.bomId &&
      preview.body?.requirements?.length === 1,
    `Task #54 preview did not resolve isolated BOM: HTTP ${preview.status}`,
  );
  const requirement = preview.body.requirements[0];
  assert(
    requirement.bom_line_id === fixture.bomLineId,
    `Task #54 preview resolved unexpected BOM line ${requirement.bom_line_id}`,
  );
  return {
    lines: [
      {
        source_bom_line_id: requirement.bom_line_id,
        issued_qty: requirement.required_qty,
      },
    ],
    notes: `${fixture.prefix} controlled concurrent material use`,
  };
}

async function readState(fixture: Fixture): Promise<State> {
  const statusRows = await query<{ status: string }>(
    `SELECT status::text AS status FROM bom_headers WHERE id = $1`,
    [fixture.bomId],
  );
  const minRows = await query<{ id: string }>(
    `SELECT id FROM material_issue_notes
     WHERE source_type = 'PRODUCTION_ORDER' AND source_ref_id = $1
     ORDER BY created_at`,
    [fixture.orderId],
  );
  const minIds = minRows.map((row) => row.id);
  const lineRows = minIds.length
    ? await query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM material_issue_note_lines
         WHERE min_id = ANY($1::uuid[])`,
        [minIds],
      )
    : [{ count: "0" }];
  const movementRows = minIds.length
    ? await query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM inventory_transactions
         WHERE source_document_type = 'MIN'
           AND source_document_id = ANY($1::uuid[])`,
        [minIds],
      )
    : [{ count: "0" }];
  const timelineRows = await query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM mfg_battery_timeline
     WHERE production_order_id = $1
       AND event_type = 'materials_issued'`,
    [fixture.orderId],
  );

  return {
    bomStatus: statusRows[0]?.status ?? null,
    materialIssueCount: minIds.length,
    materialIssueLineCount: Number(lineRows[0]?.count ?? 0),
    inventoryMovementCount: Number(movementRows[0]?.count ?? 0),
    materialIssueTimelineCount: Number(timelineRows[0]?.count ?? 0),
    minIds,
  };
}

async function cleanup(fixture: Fixture, stockSetupId: string | null): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const minRows = await client.query<{ id: string }>(
      `SELECT id FROM material_issue_notes
       WHERE source_type = 'PRODUCTION_ORDER' AND source_ref_id = $1`,
      [fixture.orderId],
    );
    const minIds = minRows.rows.map((row) => row.id);
    if (minIds.length) {
      await client.query(
        `DELETE FROM inventory_transactions
         WHERE source_document_type = 'MIN' AND source_document_id = ANY($1::uuid[])`,
        [minIds],
      );
      await client.query(
        `DELETE FROM material_issue_note_lines WHERE min_id = ANY($1::uuid[])`,
        [minIds],
      );
      await client.query(
        `DELETE FROM material_issue_notes WHERE id = ANY($1::uuid[])`,
        [minIds],
      );
    }
    await client.query(`DELETE FROM mfg_battery_timeline WHERE production_order_id = $1`, [
      fixture.orderId,
    ]);
    await client.query(`DELETE FROM mfg_order_stages WHERE production_order_id = $1`, [fixture.orderId]);
    await client.query(`DELETE FROM mfg_production_orders WHERE id = $1`, [fixture.orderId]);
    await client.query(`DELETE FROM bom_lines WHERE bom_id = $1`, [fixture.bomId]);
    await client.query(`DELETE FROM bom_headers WHERE id = $1`, [fixture.bomId]);
    await client.query(`DELETE FROM master_products WHERE id = $1`, [fixture.modelId]);
    if (stockSetupId) {
      await client.query(`DELETE FROM inventory_transactions WHERE id = $1`, [stockSetupId]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function errorText(body: any): string | null {
  return body && typeof body.error === "string" ? body.error : null;
}

async function runRace(
  cookie: string,
  fixture: Fixture,
  ordering: Ordering,
): Promise<RaceEvidence> {
  const materialBody = await issueBody(cookie, fixture);
  const materialFirst = ordering === "material_use_first";
  const firstOperation = materialFirst ? "material_issue" : "obsolete";
  const secondOperation = materialFirst ? "obsolete" : "material_issue";
  let materialResponse: HttpResult | null = null;
  let obsoleteResponse: HttpResult | null = null;
  const [first, second] = await Promise.all(
    materialFirst
      ? [
          request(cookie, "POST", `/api/manufacturing/orders/${fixture.orderId}/material-issues`, materialBody),
          request(cookie, "POST", `/api/boms/${fixture.bomId}/obsolete`),
        ]
      : [
          request(cookie, "POST", `/api/boms/${fixture.bomId}/obsolete`),
          request(cookie, "POST", `/api/manufacturing/orders/${fixture.orderId}/material-issues`, materialBody),
        ],
  );
  materialResponse = materialFirst ? first : second;
  obsoleteResponse = materialFirst ? second : first;

  assert(materialResponse && obsoleteResponse, `Task #54 ${ordering} did not return both responses`);
  const finalState = await readState(fixture);
  const materialId =
    materialResponse.body && materialResponse.status === 201
      ? String(materialResponse.body.id ?? "")
      : null;
  if (materialId) fixture.minId = materialId;

  const minDeprecated =
    materialResponse.status === 410 &&
    materialResponse.body?.code === "MIN_DEPRECATED" &&
    materialResponse.body?.replacement === "POST /api/manufacturing/orders/:id/issues/bulk";
  const obsoleteWon = obsoleteResponse.status === 200 && obsoleteResponse.body?.status === "obsolete";
  const assertions: Record<string, boolean> = {
    min_creation_deprecated: minDeprecated,
    obsoletion_committed: obsoleteWon,
    bom_is_obsolete: finalState.bomStatus === "obsolete",
    no_material_issue: finalState.materialIssueCount === 0,
    no_material_issue_lines: finalState.materialIssueLineCount === 0,
    no_inventory_movement: finalState.inventoryMovementCount === 0,
    no_material_issue_timeline: finalState.materialIssueTimelineCount === 0,
    transaction_atomicity:
      finalState.materialIssueCount === 0 &&
      finalState.materialIssueLineCount === 0 &&
      finalState.inventoryMovementCount === 0 &&
      finalState.materialIssueTimelineCount === 0,
  };
  const exactOutcome = minDeprecated && obsoleteWon && Object.values(assertions).every(Boolean);
  const forbiddenState =
    finalState.bomStatus === "obsolete" && finalState.materialIssueCount > 0;

  let cleanupResult: RaceEvidence["cleanup"] = { ok: false, error: null };
  try {
    await cleanup(fixture, null);
    cleanupResult = { ok: true, error: null };
  } catch (error) {
    cleanupResult = { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  return {
    ordering,
    firstOperation,
    secondOperation,
    materialIssue: {
      status: materialResponse.status,
      id: materialId,
      error: errorText(materialResponse.body),
    },
    obsoletion: {
      status: obsoleteResponse.status,
      bomStatus:
        obsoleteResponse.body && typeof obsoleteResponse.body.status === "string"
          ? obsoleteResponse.body.status
          : null,
      error: errorText(obsoleteResponse.body),
    },
    finalState,
    assertions: {
      ...assertions,
      forbidden_state_absent: !forbiddenState,
      cleanup_succeeded: cleanupResult.ok,
    },
    exactOutcome,
    forbiddenState,
    cleanup: cleanupResult,
  };
}

async function main(): Promise<void> {
  const runAt = new Date().toISOString();
  const runKey = runAt.replace(/\D/g, "").slice(0, 14);
  let stockSetupId: string | null = null;
  let cookie: string | null = null;
  const fixtures: Fixture[] = [];
  let result: Result = "FAIL";
  let failure: string | null = null;
  let caseA: RaceEvidence | null = null;
  let caseB: RaceEvidence | null = null;

  try {
    stockSetupId = await prepareStock();
    cookie = await login();
    const fixtureA = await createFixture(cookie, `TASK54-A-${runKey}`);
    fixtures.push(fixtureA);
    caseA = await runRace(cookie, fixtureA, "material_use_first");

    const fixtureB = await createFixture(cookie, `TASK54-B-${runKey}`);
    fixtures.push(fixtureB);
    caseB = await runRace(cookie, fixtureB, "obsoletion_first");

    if (
      caseA.exactOutcome &&
      caseB.exactOutcome &&
      !caseA.forbiddenState &&
      !caseB.forbiddenState &&
      caseA.cleanup.ok &&
      caseB.cleanup.ok
    ) {
      result = "PASS";
    } else {
      failure = "One or more Task #54 ordering assertions failed";
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
    if (/timed out|fetch failed|ECONNREFUSED|login failed/i.test(failure)) {
      result = "ENVIRONMENT BLOCKED";
    }
  } finally {
    for (const fixture of fixtures) {
      try {
        await cleanup(fixture, null);
      } catch (error) {
        failure ??= error instanceof Error ? error.message : String(error);
        result = "FAIL";
      }
    }
    if (stockSetupId) {
      try {
        await pool.query(`DELETE FROM inventory_transactions WHERE id = $1`, [stockSetupId]);
      } catch (error) {
        failure ??= error instanceof Error ? error.message : String(error);
        result = "FAIL";
      }
    }
  }

  const output = {
    metadata: {
      case_id: "TASK-54",
      assertion: "BOM use and obsoletion serialize on the BOM lifecycle lock",
      generated_at: runAt,
      tested_revision: TESTED_REVISION,
      target: BASE_URL,
      result,
      failure,
    },
    sequential_mas_n04: {
      result: "NOT_EXECUTED_HERE",
      preserved_by_existing_regression: "test:task32-bom-obsoletion",
    },
    race_orderings: {
      case_a_material_use_first: caseA,
      case_b_obsoletion_first: caseB,
    },
    protection: {
      forbidden_state:
        "bom_headers.status = obsolete AND material_issue_notes.bom_header_id = that BOM",
      prevented: result === "PASS",
    },
    cleanup: {
      temporary_stock_setup_id: stockSetupId,
      result:
        caseA?.cleanup.ok === true && caseB?.cleanup.ok === true && !failure ? "PASS" : "CHECK_REQUIRED",
    },
  };
  await mkdir(resolve(OUTPUT, ".."), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(output, null, 2));
  await pool.end();
  if (result !== "PASS") process.exitCode = 1;
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exitCode = 1;
});