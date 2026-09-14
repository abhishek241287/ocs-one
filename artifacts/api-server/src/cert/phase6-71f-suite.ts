#!/usr/bin/env tsx
/**
 * Batch 71-F Universal Scan Sessions certification.
 *
 * Run against a running development API:
 *   CERT_BASE_URL=http://localhost:80 pnpm --filter @workspace/api-server run test:phase6-71f
 */

import bcrypt from "bcryptjs";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";

const BASE_URL = (process.env.CERT_BASE_URL ?? "http://localhost:80").replace(/\/$/, "");
const PASSWORD = "P71F-Certification-2026!";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function responseBody(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function waitForLocalHealth(baseUrl: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/healthz`);
      if (response.ok) return;
    } catch {
      // The temporary server is still building or starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Temporary certification API did not start at ${baseUrl}`);
}

async function request(path: string, cookie: string | undefined, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("Cookie", cookie);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  return { response, body: await responseBody(response) };
}

function cookieFrom(response: Response): string {
  const token = response.headers.get("set-cookie")?.match(/ocs_token=([^;]+)/)?.[1];
  if (!token) throw new Error("71-F certification login did not return ocs_token");
  return `ocs_token=${token}`;
}

type Fixture = {
  prefix: string;
  directorId: string;
  operatorId: string;
  viewerId: string;
  supplierId: string;
  categoryId: string;
  materialId: string;
  lotId: string;
  unitId: string;
  capacityAttributeId: string;
  chemistryAttributeId: string;
  templateId: string;
  versionId: string;
  capacityTemplateAttributeId: string;
  chemistryTemplateAttributeId: string;
  directorCookie?: string;
  operatorCookie?: string;
  viewerCookie?: string;
};

function materialQr(materialId: string): string {
  return JSON.stringify({ v: 1, entity: "material", id: materialId, label: "display-only" });
}

function lotQr(lotId: string): string {
  return JSON.stringify({ v: 1, entity: "lot", id: lotId });
}

function validAttributes(prefix: string) {
  return [
    { attribute_code: `${prefix.toLowerCase()}_capacity`, raw: "280", value: "280", supplied_unit: `${prefix}-AH` },
    { attribute_code: `${prefix.toLowerCase()}_chemistry`, raw: "LiFePO4", value: "LiFePO4" },
  ];
}

function serialAttributes(prefix: string, serial: string) {
  return [
    ...validAttributes(prefix),
    { attribute_code: "serial_number", raw: serial, value: serial },
  ];
}

async function main(): Promise<void> {
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const fixture: Fixture = {
    prefix: `P71F-${suffix}`,
    directorId: randomUUID(),
    operatorId: randomUUID(),
    viewerId: randomUUID(),
    supplierId: randomUUID(),
    categoryId: randomUUID(),
    materialId: randomUUID(),
    lotId: randomUUID(),
    unitId: randomUUID(),
    capacityAttributeId: randomUUID(),
    chemistryAttributeId: randomUUID(),
    templateId: randomUUID(),
    versionId: randomUUID(),
    capacityTemplateAttributeId: randomUUID(),
    chemistryTemplateAttributeId: randomUUID(),
  };
  const emailBase = fixture.prefix.toLowerCase();
  const client = await pool.connect();
  let passed = 0;

  const run = async (label: string, test: () => Promise<void>) => {
    await test();
    passed += 1;
    console.log(`${label} PASS`);
  };

  const login = async (email: string): Promise<string> => {
    const result = await request("/api/auth/login", undefined, {
      method: "POST",
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    assert(result.response.status === 200, `Login failed: ${JSON.stringify(result.body)}`);
    return cookieFrom(result.response);
  };

  const createSession = async (cookie: string) => {
    const result = await request("/api/inventory/scan-sessions", cookie, {
      method: "POST",
      body: JSON.stringify({
        supplier_id: fixture.supplierId,
        material_id: fixture.materialId,
      }),
    });
    assert(result.response.status === 201, `Session create failed: ${JSON.stringify(result.body)}`);
    return result.body;
  };

  const scan = async (
    sessionId: string,
    cookie: string,
    payload: string,
    extra: Record<string, unknown> = {},
  ) => request(`/api/inventory/scan-sessions/${sessionId}/scan`, cookie, {
    method: "POST",
    body: JSON.stringify({ payload, ...extra }),
  });

  const countFixtureGrns = async () => {
    const result = await client.query(
      "SELECT count(*)::int AS count FROM grn_headers WHERE created_by = $1",
      [fixture.directorId],
    );
    return Number(result.rows[0].count);
  };

  try {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO users (id, email, password_hash, name, role, is_active)
       VALUES ($1, $2, $3, $4, 'director', true),
              ($5, $6, $3, $7, 'operator', true),
              ($8, $9, $3, $10, 'viewer', true)`,
      [
        fixture.directorId,
        `${emailBase}-director@cert.local`,
        passwordHash,
        `${fixture.prefix} Director`,
        fixture.operatorId,
        `${emailBase}-operator@cert.local`,
        `${fixture.prefix} Operator`,
        fixture.viewerId,
        `${emailBase}-viewer@cert.local`,
        `${fixture.prefix} Viewer`,
      ],
    );
    await client.query(
      `INSERT INTO master_suppliers
       (id, code, name, status, revision_number, created_by)
       VALUES ($1, $2, $3, 'active', 1, $4)`,
      [fixture.supplierId, `${fixture.prefix}-SUP`, `${fixture.prefix} Supplier`, fixture.directorId],
    );
    await client.query(
      `INSERT INTO master_material_categories
       (id, code, name, status, revision_number, engineering_master_required, created_by)
       VALUES ($1, $2, $3, 'active', 1, false, $4)`,
      [fixture.categoryId, `${fixture.prefix}-CAT`, `${fixture.prefix} Category`, fixture.directorId],
    );
    await client.query(
      `INSERT INTO master_materials
       (id, code, name, category_id, uom, usage_type, status, revision_number, created_by)
       VALUES ($1, $2, $3, $4, 'PCS', 'CONSUMABLE', 'active', 1, $5)`,
      [fixture.materialId, `${fixture.prefix}-MAT`, `${fixture.prefix} Material`, fixture.categoryId, fixture.directorId],
    );
    await client.query(
      `INSERT INTO inventory_lots
       (id, lot_number, material_id, supplier_id, status, total_received_qty, remaining_qty, uom)
       VALUES ($1, $2, $3, $4, 'active', 100, 100, 'PCS')`,
      [fixture.lotId, `${fixture.prefix}-LOT`, fixture.materialId, fixture.supplierId],
    );
    await client.query(
      `INSERT INTO unit_definitions
       (id, unit_code, dimension, canonical_unit, conversion_factor, active)
       VALUES ($1, $2, 'ELECTRICAL_CAPACITY', 'AH', '1', true)`,
      [fixture.unitId, `${fixture.prefix}-AH`],
    );
    await client.query(
      `INSERT INTO attribute_definitions
       (id, code, name, data_type, scope, unit_code, precision, scale, status, created_by)
       VALUES ($1, $2, $3, 'DECIMAL', 'RECEIPT_LINE', $4, 8, 2, 'ACTIVE', $5),
              ($6, $7, $8, 'DROPDOWN', 'RECEIPT_LINE', NULL, NULL, NULL, 'ACTIVE', $5)`,
      [
        fixture.capacityAttributeId,
        `${emailBase}_capacity`,
        `${fixture.prefix} Capacity`,
        `${fixture.prefix}-AH`,
        fixture.directorId,
        fixture.chemistryAttributeId,
        `${emailBase}_chemistry`,
        `${fixture.prefix} Chemistry`,
      ],
    );
    await client.query(
      `UPDATE attribute_definitions SET allowed_values = '["LiFePO4", "NMC"]'::jsonb WHERE id = $1`,
      [fixture.chemistryAttributeId],
    );
    await client.query(
      `INSERT INTO attribute_templates
       (id, code, name, status, created_by, updated_by)
       VALUES ($1, $2, $3, 'ACTIVE', $4, $4)`,
      [fixture.templateId, emailBase, `${fixture.prefix} Template`, fixture.directorId],
    );
    await client.query(
      `INSERT INTO attribute_template_versions
       (id, template_id, version_no, status, effective_from, created_by)
       VALUES ($1, $2, 1, 'ACTIVE', now() - interval '1 minute', $3)`,
      [fixture.versionId, fixture.templateId, fixture.directorId],
    );
    await client.query(
      `INSERT INTO attribute_template_attributes
       (id, template_version_id, attribute_id, required, sequence)
       VALUES ($1, $2, $3, true, 1), ($4, $2, $5, true, 2)`,
      [
        fixture.capacityTemplateAttributeId,
        fixture.versionId,
        fixture.capacityAttributeId,
        fixture.chemistryTemplateAttributeId,
        fixture.chemistryAttributeId,
      ],
    );
    await client.query(
      `INSERT INTO material_template_mappings
       (id, scope, material_id, template_id, status, effective_from, created_by)
       VALUES ($1, 'MATERIAL', $2, $3, 'ACTIVE', now() - interval '1 minute', $4)`,
      [randomUUID(), fixture.materialId, fixture.templateId, fixture.directorId],
    );
    await client.query("COMMIT");

    fixture.directorCookie = await login(`${emailBase}-director@cert.local`);
    fixture.operatorCookie = await login(`${emailBase}-operator@cert.local`);
    fixture.viewerCookie = await login(`${emailBase}-viewer@cert.local`);

    await run("SF-09 certified regression gate", async () => {
      const port = 8100 + (process.pid % 1000);
      const isolatedBaseUrl = `http://127.0.0.1:${port}`;
      let server: ChildProcess | undefined;
      try {
        server = spawn("pnpm", ["--filter", "@workspace/api-server", "run", "dev"], {
          cwd: process.cwd(),
          env: { ...process.env, PORT: String(port) },
          stdio: "ignore",
        });
        await waitForLocalHealth(isolatedBaseUrl);
        const env = { ...process.env, CERT_BASE_URL: isolatedBaseUrl };
        const regressionScripts = [
          "test:phase4-wip",
          "test:receiving",
          "test:reservation",
          "test:phase6-71c",
          "test:phase6-71d",
        ];
        for (let index = 0; index < regressionScripts.length; index += 1) {
          const script = regressionScripts[index]!;
          execFileSync("pnpm", ["--filter", "@workspace/api-server", "run", script], {
            cwd: process.cwd(),
            env,
            stdio: "inherit",
          });
          if (index < regressionScripts.length - 1) {
            execFileSync("sleep", ["61"], { stdio: "ignore" });
          }
        }
      } finally {
        server?.kill("SIGTERM");
      }
    });

    await run("SF-01 material scan and GRN provenance", async () => {
      const session = await createSession(fixture.directorCookie!);
      const scanned = await scan(session.id, fixture.directorCookie!, materialQr(fixture.materialId), {
        attributes: validAttributes(fixture.prefix),
      });
      assert(scanned.response.status === 201 && scanned.body.state === "READY", `Material scan failed: ${JSON.stringify(scanned.body)}`);
      const before = await countFixtureGrns();
      const confirmed = await request(`/api/inventory/scan-sessions/${session.id}/confirm`, fixture.directorCookie!, {
        method: "POST",
        headers: { "Idempotency-Key": `${fixture.prefix}-SF01` },
        body: "{}",
      });
      assert(confirmed.response.status === 200, `Material confirm failed: ${JSON.stringify(confirmed.body)}`);
      assert(await countFixtureGrns() === before + 1, "Material scan did not create exactly one GRN");
      const evidence = await client.query(
        `SELECT ac.source_type, ac.source_session_id, ac.source_row_ref
         FROM attribute_capture_instances ac
         JOIN grn_line_items li ON li.id = ac.target_id
         JOIN grn_headers gh ON gh.id = li.grn_id
         WHERE gh.id = $1`,
        [confirmed.body.document_id],
      );
      assert(evidence.rows.length === 1 && evidence.rows[0].source_type === "SCAN" &&
        evidence.rows[0].source_session_id === session.id && evidence.rows[0].source_row_ref === "1",
      `Bad scan provenance: ${JSON.stringify(evidence.rows)}`);
    });

    await run("SF-02 lot QR resolves material and lot", async () => {
      const session = await createSession(fixture.directorCookie!);
      const scanned = await scan(session.id, fixture.directorCookie!, lotQr(fixture.lotId));
      assert(scanned.response.status === 201 && scanned.body.material_id === fixture.materialId &&
        scanned.body.lot_number === `${fixture.prefix}-LOT`, `Lot scan failed: ${JSON.stringify(scanned.body)}`);
    });

    await run("SF-03 UNKNOWN scans persist and block confirmation", async () => {
      const session = await createSession(fixture.directorCookie!);
      await scan(session.id, fixture.directorCookie!, "not-json");
      await scan(session.id, fixture.directorCookie!, JSON.stringify({ v: 1, entity: "material", id: randomUUID() }));
      const review = await request(`/api/inventory/scan-sessions/${session.id}`, fixture.viewerCookie!);
      assert(review.response.status === 200 && review.body.session.unknown === 2 &&
        review.body.items.every((item: any) => item.state === "UNKNOWN"),
      `Unknown review failed: ${JSON.stringify(review.body)}`);
      const before = await countFixtureGrns();
      const confirmed = await request(`/api/inventory/scan-sessions/${session.id}/confirm`, fixture.directorCookie!, {
        method: "POST",
        headers: { "Idempotency-Key": `${fixture.prefix}-SF03` },
        body: "{}",
      });
      assert(confirmed.response.status === 409 && await countFixtureGrns() === before,
        `Unknown confirm did not fail closed: ${JSON.stringify(confirmed.body)}`);
    });

    await run("SF-04 SERIAL duplicate and undo", async () => {
      await client.query(
        `INSERT INTO material_inventory_profiles (material_id, tracking_mode, updated_by)
         VALUES ($1, 'SERIAL', $2)
         ON CONFLICT (material_id) DO UPDATE SET tracking_mode = 'SERIAL', updated_by = $2`,
        [fixture.materialId, fixture.directorId],
      );
      const session = await createSession(fixture.directorCookie!);
      const first = await scan(session.id, fixture.directorCookie!, materialQr(fixture.materialId), {
        attributes: serialAttributes(fixture.prefix, "SER-001"),
      });
      const second = await scan(session.id, fixture.directorCookie!, materialQr(fixture.materialId), {
        attributes: serialAttributes(fixture.prefix, "SER-001"),
      });
      assert(first.body.state === "READY" && second.body.errors?.[0]?.rule === "DUPLICATE_SERIAL",
        `Serial duplicate was not flagged: ${JSON.stringify({ first: first.body, second: second.body })}`);
      const blocked = await request(`/api/inventory/scan-sessions/${session.id}/confirm`, fixture.directorCookie!, {
        method: "POST",
        headers: { "Idempotency-Key": `${fixture.prefix}-SF04-BLOCKED` },
        body: "{}",
      });
      assert(blocked.response.status === 409, "Serial duplicate did not block confirmation");
      await request(`/api/inventory/scan-sessions/${session.id}/items/${first.body.id}/remove`, fixture.directorCookie!, {
        method: "POST",
        body: "{}",
      });
      const rescanned = await scan(session.id, fixture.directorCookie!, materialQr(fixture.materialId), {
        attributes: serialAttributes(fixture.prefix, "SER-001"),
      });
      assert(rescanned.body.state === "READY", `Serial undo did not permit rescan: ${JSON.stringify(rescanned.body)}`);
      const confirmed = await request(`/api/inventory/scan-sessions/${session.id}/confirm`, fixture.directorCookie!, {
        method: "POST",
        headers: { "Idempotency-Key": `${fixture.prefix}-SF04` },
        body: "{}",
      });
      assert(confirmed.response.status === 200, `Serial undo confirm failed: ${JSON.stringify(confirmed.body)}`);
    });

    await run("SF-05 LOT scans accumulate", async () => {
      await client.query(
        `INSERT INTO material_inventory_profiles (material_id, tracking_mode, updated_by)
         VALUES ($1, 'LOT', $2)
         ON CONFLICT (material_id) DO UPDATE SET tracking_mode = 'LOT', updated_by = $2`,
        [fixture.materialId, fixture.directorId],
      );
      const session = await createSession(fixture.directorCookie!);
      await scan(session.id, fixture.directorCookie!, lotQr(fixture.lotId), { attributes: validAttributes(fixture.prefix) });
      await scan(session.id, fixture.directorCookie!, lotQr(fixture.lotId), { attributes: validAttributes(fixture.prefix) });
      await scan(session.id, fixture.directorCookie!, lotQr(fixture.lotId), { attributes: validAttributes(fixture.prefix) });
      const review = await request(`/api/inventory/scan-sessions/${session.id}`, fixture.viewerCookie!);
      assert(review.body.items.length === 1 && review.body.items[0].quantity === 3 &&
        review.body.items[0].duplicate_scan_count === 2 && review.body.session.ready === 1,
      `Lot accumulation failed: ${JSON.stringify(review.body)}`);
    });

    await run("SF-06 hybrid quantity and attributes use one canonical pipeline", async () => {
      await client.query(
        `INSERT INTO material_inventory_profiles (material_id, tracking_mode, updated_by)
         VALUES ($1, 'NONE', $2)
         ON CONFLICT (material_id) DO UPDATE SET tracking_mode = 'NONE', updated_by = $2`,
        [fixture.materialId, fixture.directorId],
      );
      const session = await createSession(fixture.directorCookie!);
      const attributes = [
        { attribute_code: `${emailBase}_capacity`, raw: "280", value: "280", supplied_unit: `${fixture.prefix}-AH` },
        { attribute_code: `${emailBase}_chemistry`, raw: "LiFePO4", value: "LiFePO4" },
      ];
      const scanned = await scan(session.id, fixture.directorCookie!, materialQr(fixture.materialId), {
        quantity: 200,
        attributes,
      });
      assert(scanned.body.state === "READY" && scanned.body.quantity === 200 &&
        scanned.body.canonical?.quantity === 200 && scanned.body.canonical?.attributes?.length === 2,
      `Hybrid canonical shape failed: ${JSON.stringify(scanned.body)}`);
    });

    await run("SF-07 confirmation idempotency", async () => {
      const session = await createSession(fixture.directorCookie!);
      await scan(session.id, fixture.directorCookie!, materialQr(fixture.materialId), {
        attributes: validAttributes(fixture.prefix),
      });
      const first = await request(`/api/inventory/scan-sessions/${session.id}/confirm`, fixture.directorCookie!, {
        method: "POST",
        headers: { "Idempotency-Key": `${fixture.prefix}-SF07` },
        body: "{}",
      });
      const second = await request(`/api/inventory/scan-sessions/${session.id}/confirm`, fixture.directorCookie!, {
        method: "POST",
        headers: { "Idempotency-Key": `${fixture.prefix}-SF07` },
        body: "{}",
      });
      assert(first.response.status === 200 && second.response.status === 200 &&
        first.body.document_id === second.body.document_id && second.body.replay === true,
      `Confirmation replay failed: ${JSON.stringify({ first: first.body, second: second.body })}`);
    });

    await run("SF-08 RBAC", async () => {
      const anonymous = await request("/api/inventory/scan-sessions", undefined);
      assert(anonymous.response.status === 401, "Anonymous scan session write was not denied");
      const operator = await request("/api/inventory/scan-sessions", fixture.operatorCookie!, {
        method: "POST",
        body: JSON.stringify({ supplier_id: fixture.supplierId }),
      });
      const viewer = await request("/api/inventory/scan-sessions", fixture.viewerCookie!, {
        method: "POST",
        body: JSON.stringify({ supplier_id: fixture.supplierId }),
      });
      const session = await createSession(fixture.directorCookie!);
      const read = await request(`/api/inventory/scan-sessions/${session.id}`, fixture.viewerCookie!);
      assert(operator.response.status === 403 && viewer.response.status === 403 && read.response.status === 200,
        `RBAC matrix failed: ${JSON.stringify({ operator: operator.body, viewer: viewer.body, read: read.body })}`);
    });

    console.log(JSON.stringify({ result: "PASS", cases: passed, fixture_prefix: fixture.prefix }));
  } finally {
    await client.query("BEGIN").catch(() => undefined);
    try {
      await client.query(
        `DELETE FROM attribute_capture_values
         WHERE capture_instance_id IN (
           SELECT id FROM attribute_capture_instances
           WHERE target_id IN (
             SELECT id FROM grn_line_items
             WHERE grn_id IN (SELECT id FROM grn_headers WHERE created_by = $1)
           )
         )`,
        [fixture.directorId],
      );
      await client.query(
        `DELETE FROM outbox_events
         WHERE aggregate_id IN (
           SELECT id FROM scan_sessions WHERE created_by = $1
           UNION SELECT id FROM grn_headers WHERE created_by = $1
           UNION SELECT id FROM grn_line_items
             WHERE grn_id IN (SELECT id FROM grn_headers WHERE created_by = $1)
         )`,
        [fixture.directorId],
      );
      await client.query(
        `DELETE FROM attribute_capture_instances
         WHERE target_id IN (
           SELECT id FROM grn_line_items
           WHERE grn_id IN (SELECT id FROM grn_headers WHERE created_by = $1)
         )`,
        [fixture.directorId],
      );
      await client.query(`DELETE FROM grn_headers WHERE created_by = $1`, [fixture.directorId]);
      await client.query(`DELETE FROM scan_sessions WHERE created_by = $1`, [fixture.directorId]);
      await client.query(`DELETE FROM material_inventory_profiles WHERE material_id = $1`, [fixture.materialId]);
      await client.query(`DELETE FROM security_events WHERE actor_id IN ($1, $2, $3)`, [
        fixture.directorId,
        fixture.operatorId,
        fixture.viewerId,
      ]);
      await client.query(`DELETE FROM inventory_lots WHERE id = $1`, [fixture.lotId]);
      await client.query(`DELETE FROM material_template_mappings WHERE material_id = $1`, [fixture.materialId]);
      await client.query(`DELETE FROM attribute_template_attributes WHERE template_version_id = $1`, [fixture.versionId]);
      await client.query(`DELETE FROM attribute_template_versions WHERE id = $1`, [fixture.versionId]);
      await client.query(`DELETE FROM attribute_templates WHERE id = $1`, [fixture.templateId]);
      await client.query(`DELETE FROM attribute_definitions WHERE id IN ($1, $2)`, [
        fixture.capacityAttributeId,
        fixture.chemistryAttributeId,
      ]);
      await client.query(`DELETE FROM unit_definitions WHERE id = $1`, [fixture.unitId]);
      await client.query(`DELETE FROM master_materials WHERE id = $1`, [fixture.materialId]);
      await client.query(`DELETE FROM master_material_categories WHERE id = $1`, [fixture.categoryId]);
      await client.query(`DELETE FROM master_suppliers WHERE id = $1`, [fixture.supplierId]);
      await client.query(`DELETE FROM users WHERE id IN ($1, $2, $3)`, [
        fixture.directorId,
        fixture.operatorId,
        fixture.viewerId,
      ]);
      const residual = await client.query(
        `SELECT
           (SELECT count(*) FROM users WHERE email LIKE $1) AS users,
           (SELECT count(*) FROM master_suppliers WHERE code LIKE $2) AS suppliers,
           (SELECT count(*) FROM master_materials WHERE code LIKE $2) AS materials,
           (SELECT count(*) FROM master_material_categories WHERE code LIKE $2) AS categories,
           (SELECT count(*) FROM inventory_lots WHERE lot_number LIKE $2) AS lots,
           (SELECT count(*) FROM scan_sessions WHERE created_by = $3) AS sessions,
           (SELECT count(*) FROM scan_items WHERE session_id IN (SELECT id FROM scan_sessions WHERE created_by = $3)) AS items,
           (SELECT count(*) FROM grn_headers WHERE created_by = $3) AS grns,
           (SELECT count(*) FROM attribute_capture_instances WHERE material_id = $4) AS captures`,
        [
          `${emailBase}%`,
          `${fixture.prefix}%`,
          fixture.directorId,
          fixture.materialId,
        ],
      );
      const values = Object.values(residual.rows[0]).map(Number);
      assert(values.every((value) => value === 0), `71-F fixture residue: ${JSON.stringify(residual.rows[0])}`);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});