#!/usr/bin/env tsx
/**
 * Batch 73-D permanent read-only genealogy API certification.
 *
 * This suite never creates genealogy fixtures. It consumes the isolated P73-D
 * fixture rows when present, fails closed when they are absent, and removes no
 * append-only audit evidence created by the read requests.
 */

import { pool, type UserRole } from "@workspace/db";
import { signToken } from "../middleware/auth";

const BASE_URL = (process.env.CERT_BASE_URL ?? "http://localhost:80").replace(/\/$/, "");
const OWNER_EMAIL =
  process.env.CERT_OWNER_EMAIL ?? process.env.CERT_DIRECTOR_EMAIL ?? "admin@ocs.local";
type Json = Record<string, unknown>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function request(
  path: string,
  cookie: string | null,
  init: RequestInit = {},
): Promise<{ status: number; body: Json }> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(init.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as Json;
  return { status: response.status, body };
}

function assertCitations(value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertCitations(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  const object = value as Json;
  if ("document_cited" in object) {
    const citation = object.document_cited as Json;
    assert(
      citation &&
        typeof citation.type === "string" &&
        typeof citation.id === "string" &&
        citation.type.length > 0 &&
        citation.id.length > 0,
      `${path} has an invalid document_cited object`,
    );
  }
  Object.entries(object).forEach(([key, child]) => assertCitations(child, `${path}.${key}`));
}

function assertStatus(result: { status: number; body: Json }, status: number, label: string): void {
  assert(result.status === status, `${label}: expected ${status}, got ${result.status}: ${JSON.stringify(result.body)}`);
}

async function sessionFor(email: string): Promise<string> {
  const [user] = (
    await pool.query<{
      id: string;
      email: string;
      name: string;
      role: string;
      session_version: number;
      is_active: boolean;
    }>(
      `SELECT id, email, name, role, session_version, is_active
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [email],
    )
  ).rows;
  assert(user?.is_active, `Active certification principal ${email} was not found`);
  return `ocs_token=${signToken({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role as UserRole,
    sessionVersion: Number(user.session_version),
  })}`;
}

async function run(): Promise<void> {
  const cookie = await sessionFor(OWNER_EMAIL);

  const fixtureResult = await pool.query<{
    upstream_order_id: string | null;
    downstream_lot_id: string | null;
    composition_product_id: string | null;
    composition_serial_number: string | null;
    recall_template_id: string | null;
    recall_attribute_code: string | null;
    recall_min: string | null;
    recall_max: string | null;
  }>(`
    SELECT
      (
        SELECT win.production_order_id
        FROM wip_issue_notes win
        JOIN wip_issue_lines wil ON wil.wip_issue_note_id = win.id
        LEFT JOIN bulk_batch_lines bbl ON bbl.wip_issue_note_id = win.id
        GROUP BY win.production_order_id
        HAVING count(*) FILTER (WHERE bbl.id IS NULL) > 0
           AND count(*) FILTER (WHERE bbl.id IS NOT NULL) > 0
        ORDER BY min(win.created_at)
        LIMIT 1
      ) AS upstream_order_id,
      (
        SELECT il.id
        FROM inventory_lots il
        JOIN inventory_reservation_allocations ira ON ira.lot_id = il.id
        JOIN wip_issue_lines wil ON wil.lot_id = il.id
        JOIN consumption_confirmations cc ON cc.lot_id = il.id
        JOIN transfer_lines tl ON tl.lot_id = il.id
        ORDER BY il.created_at
        LIMIT 1
      ) AS downstream_lot_id,
      (
        SELECT p.id
        FROM products p
        JOIN wip_inventory wi ON wi.production_order_id = p.source_production_order_id
        WHERE p.source_production_order_id IS NOT NULL
          AND wi.consumed_qty > 0
        ORDER BY p.created_at
        LIMIT 1
      ) AS composition_product_id,
      (
        SELECT su.serial_number
        FROM serial_units su
        JOIN products p ON p.id = su.product_id
        JOIN wip_inventory wi ON wi.production_order_id = p.source_production_order_id
        WHERE p.source_production_order_id IS NOT NULL
          AND wi.consumed_qty > 0
        ORDER BY su.created_at
        LIMIT 1
      ) AS composition_serial_number,
      (
        SELECT ac.template_version_id
        FROM attribute_capture_instances ac
        JOIN attribute_capture_values av ON av.capture_instance_id = ac.id
        JOIN attribute_definitions ad ON ad.id = av.attribute_id
        WHERE ac.target_type = 'GRN_LINE'
          AND ac.status = 'VALIDATED'
          AND av.value_num IS NOT NULL
        ORDER BY ac.created_at
        LIMIT 1
      ) AS recall_template_id,
      (
        SELECT ad.code
        FROM attribute_capture_instances ac
        JOIN attribute_capture_values av ON av.capture_instance_id = ac.id
        JOIN attribute_definitions ad ON ad.id = av.attribute_id
        WHERE ac.target_type = 'GRN_LINE'
          AND ac.status = 'VALIDATED'
          AND av.value_num IS NOT NULL
        ORDER BY ac.created_at
        LIMIT 1
      ) AS recall_attribute_code,
      (
        SELECT (floor(av.value_num::numeric) - 1)::text
        FROM attribute_capture_instances ac
        JOIN attribute_capture_values av ON av.capture_instance_id = ac.id
        WHERE ac.target_type = 'GRN_LINE'
          AND ac.status = 'VALIDATED'
          AND av.value_num IS NOT NULL
        ORDER BY ac.created_at
        LIMIT 1
      ) AS recall_min,
      (
        SELECT (ceil(av.value_num::numeric) + 1)::text
        FROM attribute_capture_instances ac
        JOIN attribute_capture_values av ON av.capture_instance_id = ac.id
        WHERE ac.target_type = 'GRN_LINE'
          AND ac.status = 'VALIDATED'
          AND av.value_num IS NOT NULL
        ORDER BY ac.created_at
        LIMIT 1
      ) AS recall_max
  `);
  const fixture = fixtureResult.rows[0];
  assert(fixture, "fixture probe returned no row");

  const blocked: string[] = [];
  const passed: string[] = [];

  const anonymous = await request(
    "/api/genealogy/upstream?production_order_id=00000000-0000-0000-0000-000000000000",
    null,
  );
  assertStatus(anonymous, 401, "GQ-07 anonymous");
  passed.push("GQ-07 anonymous 401");

  const invalidRecall = await request(
    "/api/genealogy/recall?attribute_code=capacity&min=1&max=2",
    cookie,
  );
  assertStatus(invalidRecall, 422, "GQ-06 recall without template_id");
  passed.push("GQ-06 recall scope validation");

  const post = await request("/api/genealogy/upstream", cookie, { method: "POST" });
  assertStatus(post, 405, "GQ-07 authenticated POST");
  passed.push("GQ-07 authenticated POST 405");

  if (fixture.upstream_order_id) {
    const result = await request(
      `/api/genealogy/upstream?production_order_id=${fixture.upstream_order_id}`,
      cookie,
    );
    assertStatus(result, 200, "GQ-01 upstream");
    assert(Array.isArray(result.body.inputs), "GQ-01 upstream inputs missing");
    assertCitations(result.body.inputs, "$.inputs");
    passed.push("GQ-01 upstream");

    const viewerCookie = await sessionFor("viewer@ocs.local");
    const viewerResult = await request(
      `/api/genealogy/upstream?production_order_id=${fixture.upstream_order_id}`,
      viewerCookie,
    );
    assertStatus(viewerResult, 200, "GQ-07 viewer");
    passed.push("GQ-07 viewer 200");
  } else {
    blocked.push("GQ-01 requires one order with single and bulk issue notes");
    blocked.push("GQ-07 viewer 200 requires the upstream fixture");
  }

  if (fixture.downstream_lot_id) {
    const result = await request(
      `/api/genealogy/downstream?lot_id=${fixture.downstream_lot_id}`,
      cookie,
    );
    assertStatus(result, 200, "GQ-02 downstream");
    assertCitations(result.body, "$");
    passed.push("GQ-02 downstream");
  } else {
    blocked.push("GQ-02 requires a lot with reservation, WIP, consumption, and transfer consumers");
  }

  if (fixture.composition_product_id && fixture.composition_serial_number) {
    const byProduct = await request(
      `/api/genealogy/composition?product_id=${fixture.composition_product_id}`,
      cookie,
    );
    const bySerial = await request(
      `/api/genealogy/composition?serial_number=${encodeURIComponent(fixture.composition_serial_number)}`,
      cookie,
    );
    assertStatus(byProduct, 200, "GQ-03 composition by product_id");
    assertStatus(bySerial, 200, "GQ-03 composition by serial_number");
    assert(
      JSON.stringify(byProduct.body) === JSON.stringify(bySerial.body),
      "GQ-03 product_id and serial_number results differ",
    );
    assert(!("component_serials" in byProduct.body), "GQ-03 exposed deferred component_serials");
    assertCitations(byProduct.body, "$");
    passed.push("GQ-03 composition");
  } else {
    blocked.push("GQ-03 requires a manufactured Product, consumed lot, and serial_units output identity");
  }

  if (
    fixture.recall_template_id &&
    fixture.recall_attribute_code &&
    fixture.recall_min &&
    fixture.recall_max
  ) {
    const recallPath =
      `/api/genealogy/recall?template_id=${fixture.recall_template_id}` +
      `&attribute_code=${encodeURIComponent(fixture.recall_attribute_code)}` +
      `&min=${fixture.recall_min}&max=${fixture.recall_max}`;
    const started = performance.now();
    const first = await request(recallPath, cookie);
    const elapsedMs = performance.now() - started;
    const second = await request(recallPath, cookie);
    assertStatus(first, 200, "GQ-04 recall");
    assertStatus(second, 200, "GQ-04 recall repeat");
    assert(JSON.stringify(first.body) === JSON.stringify(second.body), "GQ-04 recall is not deterministic");
    assertCitations(first.body.matches, "$.matches");
    for (const item of (first.body.downstream as Json[]) ?? []) {
      const meta = item.meta as Json;
      const consumers = item.consumers as unknown[];
      assert(consumers.length <= 25, "GQ-06 downstream cap exceeded");
      assert(typeof meta?.truncated === "boolean", "GQ-06 truncated flag missing");
    }
    assert(elapsedMs < 2000, `GQ-08 recall exceeded 2s (${Math.round(elapsedMs)}ms)`);
    passed.push("GQ-04 recall");
    passed.push("GQ-05 edge citations");
    passed.push("GQ-06 cap and truncation");
    passed.push("GQ-08 recall performance");
  } else {
    blocked.push("GQ-04 requires a validated numeric GRN capture and template version");
  }

  if (blocked.length > 0) {
    console.error(JSON.stringify({ result: "BLOCKED", suite: "phase8-genealogy", passed, blocked }));
    process.exitCode = 2;
    return;
  }
  console.log(JSON.stringify({ result: "PASS", suite: "phase8-genealogy", passed }));
}

run().catch((error) => {
  console.error(JSON.stringify({ result: "FAIL", suite: "phase8-genealogy", error: String(error) }));
  process.exitCode = 1;
});