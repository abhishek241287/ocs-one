#!/usr/bin/env tsx
/**
 * Batch 71-H — Phase 6 final certification gate.
 *
 * This is deliberately a certification-only suite. It uses the director
 * configuration APIs for capture configuration, the public capture channels for
 * execution, and SQL only for isolated master fixtures, evidence queries, and
 * teardown.
 *
 * Run against the already-running development API:
 *   CERT_BASE_URL=http://localhost:80 pnpm --filter @workspace/api-server run test:phase6-gate
 */

import bcrypt from "bcryptjs";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { getCaptureAdapter } from "../lib/universal-capture/adapters";
import "../lib/universal-capture/grn-adapter";
import { pool } from "@workspace/db";

const BASE_URL = (process.env.CERT_BASE_URL ?? "http://localhost:80").replace(/\/$/, "");
const PASSWORD = "P71H-Certification-2026!";
const PREFIX = `P71H-${randomUUID().slice(0, 8).toUpperCase()}`;
const CODE_PREFIX = PREFIX;
const LOWER_PREFIX = PREFIX.toLowerCase();
const EMAIL = `${LOWER_PREFIX}-director@cert.local`;
const LOT_NUMBER = `${PREFIX}-LOT-R1`;

type Result = { response: Response; body: any };
type Field = {
  code: string;
  name: string;
  data_type: "TEXT" | "DECIMAL" | "DATE" | "DROPDOWN";
  unit_code?: string;
  precision?: number;
  scale?: number;
  allowed_values?: string[];
  required?: boolean;
};
type Configured = {
  categoryId: string;
  materialId: string;
  templateId: string;
  versionId: string;
  fields: Record<string, string>;
  fieldIds: Record<string, string>;
};

const client = await pool.connect();
const directorId = randomUUID();
const supplierId = randomUUID();
const categoryIds = {
  battery: randomUUID(),
  transformer: randomUUID(),
  cable: randomUUID(),
};
const materialIds = {
  battery: randomUUID(),
  transformer: randomUUID(),
  cable: randomUUID(),
};
const lotId = randomUUID();
let cookie = "";
let passed = 0;
const scenarioStatus: Record<string, string> = {};
const constitutional: Record<string, string> = {};
const invariants: Record<string, string> = {};
const createdGrnIds: string[] = [];
const s1GrnIds: string[] = [];
let regressionWallStatus: "NOT_RUN" | "SKIPPED" | "PASS" | "FAIL" = "NOT_RUN";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function body(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request(path: string, init: RequestInit = {}): Promise<Result> {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("Cookie", cookie);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  return { response, body: await body(response) };
}

function cookieFrom(response: Response): string {
  const token = response.headers.get("set-cookie")?.match(/ocs_token=([^;]+)/)?.[1];
  assert(token, "71-H login did not return ocs_token");
  return `ocs_token=${token}`;
}

async function login(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    if (result.response.status === 200) return cookieFrom(result.response);
    if (result.response.status !== 429) {
      throw new Error(`71-H login failed: ${JSON.stringify(result.body)}`);
    }
    const retryAfter = Number(result.response.headers.get("retry-after") ?? result.response.headers.get("ratelimit-reset"));
    await new Promise((resolve) => setTimeout(resolve, Math.min(
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 + 500 : 61_000,
      65_000,
    )));
  }
  throw new Error("71-H login failed: persistent HTTP 429");
}

async function run(label: string, test: () => Promise<void>): Promise<void> {
  await test();
  passed += 1;
  console.log(`${label} PASS`);
}

function code(suffix: string): string {
  return `${CODE_PREFIX}-${suffix}`;
}

function attributeCode(namespace: string, suffix: string): string {
  return `${LOWER_PREFIX}_${namespace.toLowerCase()}_${suffix.toLowerCase()}`;
}

function templateCode(suffix: string): string {
  return `${LOWER_PREFIX}_${suffix.toLowerCase()}`;
}

function materialQr(id: string): string {
  return JSON.stringify({ v: 1, entity: "material", id });
}

function lotQr(id: string): string {
  return JSON.stringify({ v: 1, entity: "lot", id });
}

function attrs(config: Configured, values: Record<string, unknown>, units: Record<string, string> = {}) {
  return Object.entries(values).map(([field, value]) => ({
    attribute_code: config.fields[field] ?? field,
    raw: String(value),
    value,
    ...(units[field] ? { supplied_unit: units[field] } : {}),
  }));
}

async function configure(
  name: string,
  categoryId: string,
  materialId: string,
  fields: Field[],
  trackingMode: "LOT" | "SERIAL",
): Promise<Configured> {
  const unitCodes = [...new Set(fields.flatMap((field) => field.unit_code ? [field.unit_code] : []))];
  for (const unitCode of unitCodes) {
    const canonicalUnit = unitCode.endsWith("-M") ? "M" : unitCode.includes("-AH") ? "AH" : "V";
    const result = await request("/api/masters/units", {
      method: "POST",
      body: JSON.stringify({
        unit_code: unitCode,
        dimension: canonicalUnit === "M"
          ? "LENGTH"
          : canonicalUnit === "AH"
            ? "ELECTRICAL_CAPACITY"
            : "ELECTRICAL_VOLTAGE",
        canonical_unit: canonicalUnit,
        conversion_factor: 1,
      }),
    });
    if (result.response.status !== 201) {
      const existing = await request(`/api/masters/units?search=${encodeURIComponent(unitCode)}`);
      assert(existing.response.status === 200 &&
        existing.body.items?.some((item: any) => item.unit_code === unitCode),
      `Unit configuration failed: ${JSON.stringify(result.body)}`);
    }
  }

  const fieldIds: Record<string, string> = {};
  const fieldCodes: Record<string, string> = {};
  for (const field of fields) {
    const immutableCode = attributeCode(name, field.code);
    const result = await request("/api/masters/material-attributes", {
      method: "POST",
      body: JSON.stringify({
        code: immutableCode,
        name: `${PREFIX} ${field.name}`,
        data_type: field.data_type,
        scope: "RECEIPT_LINE",
        ...(field.unit_code ? { unit_code: field.unit_code } : {}),
        ...(field.precision ? { precision: field.precision } : {}),
        ...(field.scale !== undefined ? { scale: field.scale } : {}),
        ...(field.allowed_values ? { allowed_values: field.allowed_values } : {}),
      }),
    });
    assert(result.response.status === 201, `Attribute ${field.code} create failed: ${JSON.stringify(result.body)}`);
    const id = result.body.id as string;
    const activated = await request(`/api/masters/material-attributes/${id}/activate`, {
      method: "POST",
      body: "{}",
    });
    assert(activated.response.status === 200, `Attribute ${field.code} activation failed: ${JSON.stringify(activated.body)}`);
    fieldIds[field.code] = id;
    fieldCodes[field.code] = immutableCode;
  }

  const template = await request("/api/masters/attribute-templates", {
    method: "POST",
    body: JSON.stringify({ code: templateCode(name), name: `${PREFIX} ${name}` }),
  });
  assert(template.response.status === 201, `Template ${name} create failed: ${JSON.stringify(template.body)}`);
  const templateId = template.body.id as string;
  const version = await request(`/api/masters/attribute-templates/${templateId}/versions`, {
    method: "POST",
    body: JSON.stringify({
      version_no: 1,
      effective_from: "2026-01-01T00:00:00.000Z",
    }),
  });
  assert(version.response.status === 201, `Template ${name} version create failed: ${JSON.stringify(version.body)}`);
  const versionId = version.body.id as string;
  for (const [sequence, field] of fields.entries()) {
    const added = await request(`/api/masters/attribute-templates/versions/${versionId}/attributes`, {
      method: "POST",
      body: JSON.stringify({
        attribute_id: fieldIds[field.code],
        required: field.required ?? true,
        sequence: sequence + 1,
      }),
    });
    assert(added.response.status === 201, `Template ${name} field add failed: ${JSON.stringify(added.body)}`);
  }
  const activated = await request(`/api/masters/attribute-templates/versions/${versionId}/activate`, {
    method: "POST",
    body: "{}",
  });
  assert(activated.response.status === 200, `Template ${name} activation failed: ${JSON.stringify(activated.body)}`);

  const mapping = await request("/api/masters/material-template-mappings", {
    method: "POST",
    body: JSON.stringify({
      scope: "CATEGORY",
      category_id: categoryId,
      template_id: templateId,
      effective_from: "2026-01-01T00:00:00.000Z",
    }),
  });
  assert(mapping.response.status === 201, `Template ${name} mapping failed: ${JSON.stringify(mapping.body)}`);
  const profile = await request(`/api/masters/material-inventory-profiles/${materialId}`, {
    method: "PUT",
    body: JSON.stringify({ tracking_mode: trackingMode }),
  });
  assert(profile.response.status === 200 || profile.response.status === 201,
    `Tracking profile ${name} failed: ${JSON.stringify(profile.body)}`);

  return { categoryId, materialId, templateId, versionId, fields: fieldCodes, fieldIds };
}

async function createManual(
  materialId: string,
  quantity: number,
  lotNumber: string,
  attributes: any[],
): Promise<any> {
  const result = await request("/api/inventory/grns", {
    method: "POST",
    body: JSON.stringify({
      supplier_id: supplierId,
      received_date: "2026-09-14",
      lines: [{ material_id: materialId, quantity_received: quantity, supplier_lot_number: lotNumber }],
      attribute_values: [{ line_number: 1, attributes }],
    }),
  });
  assert(result.response.status === 201, `Manual GRN failed: ${JSON.stringify(result.body)}`);
  createdGrnIds.push(result.body.id);
  return result.body;
}

async function createCsv(
  config: Configured,
  materialCode: string,
  quantity: number,
  lotNumber: string,
  values: Record<string, unknown>,
  units: Record<string, string> = {},
  suffix = "csv",
): Promise<{ session: any; csv: string; status: number }> {
  const template = await request(`/api/inventory/imports/template?material_id=${config.materialId}`);
  assert(template.response.status === 200, `CSV template generation failed: ${JSON.stringify(template.body)}`);
  const templateLines = String(template.body).replace(/\r/g, "").split("\n");
  const metadata = templateLines.filter((line) => line.startsWith("#")).slice(0, 4).join("\n");
  const header = templateLines.find((line) => line.trim() !== "" && !line.startsWith("#"))!;
  const columns = header.split(",");
  const row: Record<string, string> = {
    material_code: materialCode,
    supplier_code: code("SUP"),
    quantity: String(quantity),
    lot_number: lotNumber,
  };
  for (const [key, value] of Object.entries(values)) {
    row[config.fields[key] ?? key] = String(value);
  }
  for (const [key, value] of Object.entries(units)) {
    row[`${config.fields[key] ?? key}unit`] = value;
  }
  const csv = `${metadata}\n${header}\n${columns.map((column) => row[column] ?? "").join(",")}\n`;
  const uploaded = await request("/api/inventory/imports", {
    method: "POST",
    body: JSON.stringify({ csv, filename: `${PREFIX}-${suffix}.csv` }),
  });
  return { session: uploaded.body, csv, status: uploaded.response.status };
}

async function confirmImport(sessionId: string, key: string): Promise<any> {
  const result = await request(`/api/inventory/imports/${sessionId}/confirm`, {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: "{}",
  });
  assert(result.response.status === 200, `CSV confirm failed: ${JSON.stringify(result.body)}`);
  if (result.body.document_id) createdGrnIds.push(result.body.document_id);
  return result.body;
}

async function createScan(config: Configured, attributes: any[], lot: string, key: string): Promise<any> {
  const session = await request("/api/inventory/scan-sessions", {
    method: "POST",
    body: JSON.stringify({ supplier_id: supplierId, material_id: config.materialId }),
  });
  assert(session.response.status === 201, `Scan session create failed: ${JSON.stringify(session.body)}`);
  const scanned = await request(`/api/inventory/scan-sessions/${session.body.id}/scan`, {
    method: "POST",
    body: JSON.stringify({ payload: lotQr(lotId), quantity: 200, attributes }),
  });
  assert(scanned.response.status === 201 && scanned.body.state === "READY",
    `Scan failed: ${JSON.stringify(scanned.body)}`);
  const confirmed = await request(`/api/inventory/scan-sessions/${session.body.id}/confirm`, {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: "{}",
  });
  assert(confirmed.response.status === 200, `Scan confirm failed: ${JSON.stringify(confirmed.body)}`);
  if (confirmed.body.document_id) createdGrnIds.push(confirmed.body.document_id);
  return { session: session.body, item: scanned.body, confirmed: confirmed.body };
}

async function evidence(grnIds: string[]): Promise<any[]> {
  const result = await client.query(
    `SELECT ac.target_id, ac.template_version_id, ac.source_type, ac.source_session_id,
            ac.source_row_ref, ac.status, av.attribute_id, av.value_text, av.value_num,
            av.value_bool, av.value_date, av.unit
       FROM attribute_capture_instances ac
       JOIN attribute_capture_values av ON av.capture_instance_id = ac.id
       JOIN grn_line_items li ON li.id = ac.target_id
      WHERE li.grn_id = ANY($1::uuid[])
      ORDER BY ac.target_id, av.attribute_id`,
    [grnIds],
  );
  return result.rows;
}

async function captureCount(grnId: string): Promise<number> {
  const result = await client.query(
    `SELECT count(*)::int AS count
       FROM attribute_capture_values av
       JOIN attribute_capture_instances ac ON ac.id = av.capture_instance_id
       JOIN grn_line_items li ON li.id = ac.target_id
      WHERE li.grn_id = $1`,
    [grnId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function runConstitutional(configs: { battery: Configured; transformer: Configured }): Promise<void> {
  await run("C-01 adapter allowlist", async () => {
    assert(getCaptureAdapter("GRN_LINE"), "GRN_LINE adapter did not resolve");
    let failed = false;
    try {
      getCaptureAdapter("TRANSFER_LINE");
    } catch (error) {
      failed = error instanceof Error && error.message.includes("UNREGISTERED_TARGET");
    }
    assert(failed, "TRANSFER_LINE did not fail closed");
    constitutional["C-01"] = "PASS";
  });

  await run("C-02 reserved quantity attribute", async () => {
    const result = await request("/api/masters/material-attributes", {
      method: "POST",
      body: JSON.stringify({
        code: "quantity",
        name: `${PREFIX} Reserved`,
        data_type: "TEXT",
        scope: "RECEIPT_LINE",
      }),
    });
    assert(result.response.status >= 400, `Reserved attribute was accepted: ${JSON.stringify(result.body)}`);
    constitutional["C-02"] = "PASS";
  });

  await run("C-03 channel idempotency", async () => {
    const csvResult = await createCsv(
      configs.battery,
      code("BATTERY-CELL"),
      200,
      "LOT-C03",
      { manufacturer: "REPT", chemistry: "LiFePO4", nominal_voltage: "3.2", capacity: "280", batch_number: "B-C03", manufacturing_date: "2026-09-14" },
      { nominal_voltage: code("V"), capacity: code("AH") },
      "c03",
    );
    assert(csvResult.status === 201 && csvResult.session.status === "VALIDATED", "First CSV upload did not create a session");
    const replayUpload = await request("/api/inventory/imports", {
      method: "POST",
      body: JSON.stringify({ csv: csvResult.csv, filename: `${PREFIX}-c03.csv` }),
    });
    assert(replayUpload.response.status === 200 && replayUpload.body.id === csvResult.session.id,
      `CSV upload replay was not idempotent: ${JSON.stringify(replayUpload.body)}`);
    const first = await confirmImport(csvResult.session.id, `${PREFIX}-C03-CSV`);
    const second = await confirmImport(csvResult.session.id, `${PREFIX}-C03-CSV`);
    assert(first.document_id === second.document_id,
      `CSV confirmation replay failed: ${JSON.stringify({ first, second })}`);

    const scan = await createScan(
      configs.battery,
      attrs(configs.battery, { manufacturer: "REPT", chemistry: "LiFePO4", nominal_voltage: "3.2", capacity: "280", batch_number: "B-C03", manufacturing_date: "2026-09-14" }, { nominal_voltage: code("V"), capacity: code("AH") }),
      "LOT-C03-SCAN",
      `${PREFIX}-C03-SCAN`,
    );
    const replayScan = await request(`/api/inventory/scan-sessions/${scan.session.id}/confirm`, {
      method: "POST",
      headers: { "Idempotency-Key": `${PREFIX}-C03-SCAN` },
      body: "{}",
    });
    assert(replayScan.response.status === 200 && replayScan.body.replay === true &&
      replayScan.body.document_id === scan.confirmed.document_id, "Scan replay was not idempotent");
    constitutional["C-03"] = "PASS";
  });

  await run("C-04 invalid channels fail closed", async () => {
    const before = Number((await client.query("SELECT count(*)::int AS count FROM grn_headers WHERE created_by = $1", [directorId])).rows[0].count);
    const invalidCsv = await request("/api/inventory/imports", {
      method: "POST",
      body: JSON.stringify({ csv: "not,a,valid,template\n1,2,3,4\n", filename: `${PREFIX}-invalid.csv` }),
    });
    assert(invalidCsv.response.status >= 400, "Invalid CSV was accepted");
    const session = await request("/api/inventory/scan-sessions", {
      method: "POST",
      body: JSON.stringify({ supplier_id: supplierId, material_id: configs.battery.materialId }),
    });
    assert(session.response.status === 201, "Could not create C-04 scan session");
    const unknown = await request(`/api/inventory/scan-sessions/${session.body.id}/scan`, {
      method: "POST",
      body: JSON.stringify({ payload: JSON.stringify({ v: 1, entity: "material", id: randomUUID() }) }),
    });
    assert(unknown.response.status === 201 && unknown.body.state === "UNKNOWN", "Unknown scan was not persisted as UNKNOWN");
    const confirmation = await request(`/api/inventory/scan-sessions/${session.body.id}/confirm`, {
      method: "POST",
      headers: { "Idempotency-Key": `${PREFIX}-C04` },
      body: "{}",
    });
    const after = Number((await client.query("SELECT count(*)::int AS count FROM grn_headers WHERE created_by = $1", [directorId])).rows[0].count);
    assert(confirmation.response.status === 409 && before === after, "Unknown scan mutated GRNs");
    constitutional["C-04"] = "PASS";
  });

  await run("C-05 scale enforcement across channels", async () => {
    const badAttrs = attrs(configs.battery, { manufacturer: "REPT", chemistry: "LiFePO4", nominal_voltage: "10.256", capacity: "280", batch_number: "B-C05", manufacturing_date: "2026-09-14" }, { nominal_voltage: code("V"), capacity: code("AH") });
    const manual = await request("/api/inventory/grns", {
      method: "POST",
      body: JSON.stringify({
        supplier_id: supplierId,
        received_date: "2026-09-14",
        lines: [{ material_id: configs.battery.materialId, quantity_received: 1, supplier_lot_number: "LOT-C05-M" }],
        attribute_values: [{ line_number: 1, attributes: badAttrs }],
      }),
    });
    assert(manual.response.status >= 400, "Manual scale violation was accepted");
    const csv = await createCsv(configs.battery, code("BATTERY-CELL"), 1, "LOT-C05-C", { manufacturer: "REPT", chemistry: "LiFePO4", nominal_voltage: "10.256", capacity: "280", batch_number: "B-C05", manufacturing_date: "2026-09-14" }, { nominal_voltage: code("V"), capacity: code("AH") }, "c05");
    assert(Number(csv.session.invalid_rows) > 0, "CSV scale violation did not stage an invalid row");
    const csvConfirm = await request(`/api/inventory/imports/${csv.session.id}/confirm`, { method: "POST", headers: { "Idempotency-Key": `${PREFIX}-C05-CSV` }, body: "{}" });
    assert(csvConfirm.response.status === 409, "CSV scale violation confirmed");
    const scanSession = await request("/api/inventory/scan-sessions", { method: "POST", body: JSON.stringify({ supplier_id: supplierId, material_id: configs.battery.materialId }) });
    const scanned = await request(`/api/inventory/scan-sessions/${scanSession.body.id}/scan`, { method: "POST", body: JSON.stringify({ payload: lotQr(lotId), attributes: badAttrs }) });
    assert(scanned.response.status === 201 && scanned.body.state !== "READY", "Scan scale violation was accepted");
    constitutional["C-05"] = "PASS";
  });

  await run("C-06 provenance completeness", async () => {
    const rows = await evidence(createdGrnIds);
    assert(rows.length > 0 && rows.every((row) =>
      ["MANUAL", "CSV", "SCAN"].includes(row.source_type) &&
      (row.source_type === "MANUAL" || row.source_session_id !== null) &&
      row.source_row_ref !== null,
    ), `Capture provenance is incomplete: ${JSON.stringify(rows)}`);
    constitutional["C-06"] = "PASS";
  });

  await run("C-07 historical version pinning", async () => {
    const v2 = await request(`/api/masters/attribute-templates/${configs.transformer.templateId}/versions`, {
      method: "POST",
      body: JSON.stringify({ version_no: 2, effective_from: "2027-01-01T00:00:00.000Z" }),
    });
    assert(v2.response.status === 201, `Version 2 create failed: ${JSON.stringify(v2.body)}`);
    const v2Id = v2.body.id as string;
    for (const [sequence, fieldId] of Object.values(configs.transformer.fieldIds).entries()) {
      const added = await request(`/api/masters/attribute-templates/versions/${v2Id}/attributes`, {
        method: "POST",
        body: JSON.stringify({ attribute_id: fieldId, required: true, sequence: sequence + 1 }),
      });
      assert(added.response.status === 201, `Version 2 field add failed: ${JSON.stringify(added.body)}`);
    }
    const retireV1 = await request(`/api/masters/attribute-templates/versions/${configs.transformer.versionId}/retire`, {
      method: "POST",
      body: "{}",
    });
    assert(retireV1.response.status === 200, `Version 1 retirement failed: ${JSON.stringify(retireV1.body)}`);
    const activate = await request(`/api/masters/attribute-templates/versions/${v2Id}/activate`, { method: "POST", body: "{}" });
    assert(activate.response.status === 200, `Version 2 activation failed: ${JSON.stringify(activate.body)}`);
    const old = await client.query(
      `SELECT count(*)::int AS count FROM attribute_capture_instances
        WHERE template_version_id = $1`,
      [configs.transformer.versionId],
    );
    assert(Number(old.rows[0]?.count ?? 0) >= 200, "Historical captures were not pinned to version 1");
    constitutional["C-07"] = "PASS";
  });
}

async function runRegressionWall(): Promise<void> {
  if (process.env.PHASE6_GATE_SKIP_REGRESSION === "1") {
    regressionWallStatus = "SKIPPED";
    console.log("REGRESSION WALL SKIPPED BY PHASE6_GATE_SKIP_REGRESSION=1");
    return;
  }
  const scripts = [
    "test:phase4-wip",
    "test:receiving",
    "test:reservation",
    "test:task70-g-returns",
    "test:task70-h-scrap",
    "test:task70-i-adjustments",
    "test:task70-j-transfer-lifecycle",
    "test:phase5-gate",
    "test:phase6-71c",
    "test:phase6-71d",
    "test:authz",
    "test:audit",
    "test:config",
    "cert:fat:smoke",
  ];
  const port = 8100 + (process.pid % 1000);
  const isolatedBaseUrl = `http://127.0.0.1:${port}`;
  let server: ChildProcess | undefined;

  const startServer = async (): Promise<void> => {
    server = spawn("pnpm", ["--filter", "@workspace/api-server", "run", "dev"], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(port) },
      stdio: "ignore",
      detached: true,
    });
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        const health = await fetch(`${isolatedBaseUrl}/api/healthz`);
        if (health.ok) return;
      } catch {
        // The isolated API is still building or starting.
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Regression API did not start at ${isolatedBaseUrl}`);
  };

  const restartServer = async (): Promise<void> => {
    if (server?.pid) {
      try {
        process.kill(-server.pid, "SIGTERM");
      } catch {
        server.kill("SIGTERM");
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    await startServer();
  };

  try {
    await startServer();
    for (let index = 0; index < scripts.length; index += 1) {
      const script = scripts[index]!;
      console.log(`REGRESSION ${script} START`);
      execFileSync("pnpm", ["--filter", "@workspace/api-server", "run", script], {
        cwd: process.cwd(),
        env: { ...process.env, CERT_BASE_URL: isolatedBaseUrl },
        stdio: "inherit",
      });
      console.log(`REGRESSION ${script} PASS`);
      if (index < scripts.length - 1) {
        // Every legacy suite gets a fresh API process so its in-memory auth
        // limiter cannot accumulate login attempts from earlier suites.
        await restartServer();
      }
      if (index < scripts.length - 1) {
        // Keep legacy suites as separate processes and leave enough time for
        // the development auth window instead of nesting or parallelizing them.
        execFileSync("sleep", ["61"], { stdio: "ignore" });
      }
    }
    regressionWallStatus = "PASS";
  } finally {
    if (server?.pid) {
      try {
        process.kill(-server.pid, "SIGTERM");
      } catch {
        server.kill("SIGTERM");
      }
    }
  }
}

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  await client.query("BEGIN");
  try {
    await client.query(
      `INSERT INTO users (id, email, password_hash, name, role, is_active)
       VALUES ($1, $2, $3, $4, 'director', true)`,
      [directorId, EMAIL, passwordHash, `${PREFIX} Director`],
    );
    await client.query(
      `INSERT INTO master_suppliers
       (id, code, name, status, revision_number, created_by)
       VALUES ($1, $2, $3, 'active', 1, $4)`,
      [supplierId, code("SUP"), `${PREFIX} Supplier`, directorId],
    );
    await client.query(
      `INSERT INTO master_material_categories
       (id, code, name, status, revision_number, engineering_master_required, created_by)
       VALUES ($1, $2, $3, 'active', 1, false, $4),
              ($5, $6, $7, 'active', 1, false, $4),
              ($8, $9, $10, 'active', 1, false, $4)`,
      [
        categoryIds.battery, code("BATTERY_CELL"), `${PREFIX} Battery Cell`, directorId,
        categoryIds.transformer, code("TRANSFORMER"), `${PREFIX} Transformer`,
        categoryIds.cable, code("CABLE"), `${PREFIX} Cable`,
      ],
    );
    await client.query(
      `INSERT INTO master_materials
       (id, code, name, category_id, uom, usage_type, status, revision_number, created_by)
       VALUES ($1, $2, $3, $4, 'PCS', 'CONSUMABLE', 'active', 1, $13),
              ($5, $6, $7, $8, 'PCS', 'CONSUMABLE', 'active', 1, $13),
              ($9, $10, $11, $12, 'M', 'CONSUMABLE', 'active', 1, $13)`,
      [
        materialIds.battery, code("BATTERY-CELL"), `${PREFIX} REPT-280`, categoryIds.battery,
        materialIds.transformer, code("TRF-5K"), `${PREFIX} TRF-5K`, categoryIds.transformer,
        materialIds.cable, code("CBL-10"), `${PREFIX} CBL-10`, categoryIds.cable,
        directorId,
      ],
    );
    await client.query(
      `INSERT INTO inventory_lots
       (id, lot_number, material_id, supplier_lot_number, supplier_id, status,
        total_received_qty, remaining_qty, uom)
       VALUES ($1, $2, $3, $2, $4, 'active', 200, 200, 'PCS')`,
       [lotId, LOT_NUMBER, materialIds.battery, supplierId],
    );
    await client.query("COMMIT");

    cookie = await login();

    const battery = await configure("BATTERY-CELL-INCOMING", categoryIds.battery, materialIds.battery, [
      { code: "manufacturer", name: "Manufacturer", data_type: "TEXT" },
      { code: "chemistry", name: "Chemistry", data_type: "DROPDOWN", allowed_values: ["LiFePO4", "NMC"] },
      { code: "nominal_voltage", name: "Nominal Voltage", data_type: "DECIMAL", unit_code: code("V"), precision: 6, scale: 2 },
      { code: "capacity", name: "Capacity", data_type: "DECIMAL", unit_code: code("AH"), precision: 6, scale: 2 },
      { code: "batch_number", name: "Batch Number", data_type: "TEXT" },
      { code: "manufacturing_date", name: "Manufacturing Date", data_type: "DATE" },
    ], "LOT");
    const transformer = await configure("TRANSFORMER-INCOMING", categoryIds.transformer, materialIds.transformer, [
      { code: "manufacturer", name: "Manufacturer", data_type: "TEXT" },
      { code: "rating", name: "Rating", data_type: "DECIMAL", unit_code: code("V"), precision: 8, scale: 2 },
    ], "SERIAL");
    const cable = await configure("CABLE-INCOMING", categoryIds.cable, materialIds.cable, [
      { code: "length", name: "Length", data_type: "DECIMAL", unit_code: code("M"), precision: 8, scale: 2 },
      { code: "conductor", name: "Conductor", data_type: "DROPDOWN", allowed_values: ["Copper", "Aluminium"] },
    ], "LOT");

    const batteryValues = {
      manufacturer: "REPT",
      chemistry: "LiFePO4",
      nominal_voltage: "3.20",
      capacity: "280.00",
      batch_number: "B-R1",
      manufacturing_date: "2026-09-14",
    };
    await run("S1 manual canonical capture", async () => {
       const result = await createManual(materialIds.battery, 200, LOT_NUMBER, attrs(battery, batteryValues, { nominal_voltage: code("V"), capacity: code("AH") }));
      assert(result.lines?.[0]?.capture, "Manual GRN did not expose its capture projection");
      s1GrnIds.push(result.id);
      scenarioStatus["manual"] = "PASS";
    });
    await run("S1 CSV canonical capture", async () => {
       const csv = await createCsv(battery, code("BATTERY-CELL"), 200, LOT_NUMBER, batteryValues, { nominal_voltage: code("V"), capacity: code("AH") }, "s1");
      assert(csv.status === 201 && csv.session.status === "VALIDATED" && Number(csv.session.valid_rows) === 1, `CSV staging failed: ${JSON.stringify(csv.session)}`);
      const first = await confirmImport(csv.session.id, `${PREFIX}-S1-CSV`);
      assert(first.document_id, "CSV confirmation did not create a GRN");
      s1GrnIds.push(first.document_id);
      scenarioStatus["csv"] = "PASS";
    });
    await run("S1 keyboard-wedge scan canonical capture", async () => {
       const scan = await createScan(battery, attrs(battery, batteryValues, { nominal_voltage: code("V"), capacity: code("AH") }), LOT_NUMBER, `${PREFIX}-S1-SCAN`);
      assert(scan.confirmed.document_id, "Scan confirmation did not create a GRN");
      s1GrnIds.push(scan.confirmed.document_id);
      scenarioStatus["scan"] = "PASS";
    });

    await run("S1 three-channel convergence", async () => {
      const result = await client.query(
        `SELECT ac.source_type, av.attribute_id, av.value_text, av.value_num, av.value_bool, av.value_date, av.unit
           FROM attribute_capture_instances ac
           JOIN attribute_capture_values av ON av.capture_instance_id = ac.id
           JOIN grn_line_items li ON li.id = ac.target_id
          WHERE li.grn_id = ANY($1::uuid[])
          ORDER BY ac.source_type, av.attribute_id`,
        [s1GrnIds],
      );
      const groups = new Map<string, any[]>();
      for (const row of result.rows) groups.set(row.source_type, [...(groups.get(row.source_type) ?? []), row]);
      assert(["MANUAL", "CSV", "SCAN"].every((source) => groups.get(source)?.length === 6),
        `Expected six values per channel: ${JSON.stringify([...groups].map(([key, rows]) => [key, rows.length]))}`);
      const projection = (rows: any[]) => rows.map((row) => [row.attribute_id, row.value_text, row.value_num, row.value_bool, row.value_date, row.unit]);
      const canonical = projection(groups.get("MANUAL")!);
      assert(projection(groups.get("CSV")!).toString() === canonical.toString() &&
        projection(groups.get("SCAN")!).toString() === canonical.toString(),
      `Canonical channel values diverged: ${JSON.stringify([...groups].map(([key, rows]) => [key, projection(rows)]))}`);
      const provenance = new Set(result.rows.map((row: any) => row.source_type));
      assert(provenance.size === 3, "Channel provenance was not distinct");
    });

    await run("S2 strict 200-row CSV and duplicate serial wall", async () => {
      const fields = transformer.fields;
      const template = await request(`/api/inventory/imports/template?material_id=${transformer.materialId}`);
      assert(template.response.status === 200, `Transformer CSV template failed: ${JSON.stringify(template.body)}`);
      const templateLines = String(template.body).replace(/\r/g, "").split("\n");
      const metadata = templateLines.filter((line) => line.startsWith("#")).slice(0, 4).join("\n");
      const header = templateLines.find((line) => line.trim() !== "" && !line.startsWith("#"))!;
      const columns = header.split(",");
      const makeRow = (index: number, rating: string) => {
        const values: Record<string, string> = {
          material_code: code("TRF-5K"),
          supplier_code: code("SUP"),
          quantity: "1",
          [fields.manufacturer]: "OEM",
          [fields.rating]: rating,
          [`${fields.rating}unit`]: code("V"),
        };
        return columns.map((column) => values[column] ?? "").join(",");
      };
      const rows = Array.from({ length: 200 }, (_, index) => {
        const rating = index === 149 ? "10.256" : "5000.00";
        return makeRow(index, rating);
      });
      const csv = `${metadata}\n${header}\n${rows.join("\n")}\n`;
      const uploaded = await request("/api/inventory/imports", { method: "POST", body: JSON.stringify({ csv, filename: `${PREFIX}-transformer-invalid.csv` }) });
      assert(uploaded.response.status === 201 && uploaded.body.total_rows === 200 && uploaded.body.invalid_rows > 0,
        `Invalid 200-row import did not stage correctly: ${JSON.stringify(uploaded.body)}`);
      const before = Number((await client.query("SELECT count(*)::int AS count FROM grn_headers WHERE created_by = $1", [directorId])).rows[0].count);
      const blocked = await request(`/api/inventory/imports/${uploaded.body.id}/confirm`, { method: "POST", headers: { "Idempotency-Key": `${PREFIX}-S2-BLOCKED` }, body: "{}" });
      const after = Number((await client.query("SELECT count(*)::int AS count FROM grn_headers WHERE created_by = $1", [directorId])).rows[0].count);
      assert(blocked.response.status === 409 && before === after, "Strict invalid import mutated GRNs");

      const correctedRows = Array.from({ length: 200 }, (_, index) => makeRow(index, "5000.00"));
      const corrected = `${metadata}\n${header}\n${correctedRows.join("\n")}\n`;
      const correctedUpload = await request("/api/inventory/imports", { method: "POST", body: JSON.stringify({ csv: corrected, filename: `${PREFIX}-transformer-corrected.csv` }) });
      assert(correctedUpload.response.status === 201 && correctedUpload.body.valid_rows === 200, `Corrected import invalid: ${JSON.stringify(correctedUpload.body)}`);
      const confirmed = await confirmImport(correctedUpload.body.id, `${PREFIX}-S2-CORRECTED`);
      const detail = await request(`/api/inventory/grns/${confirmed.document_id}`);
      assert(detail.response.status === 200 && detail.body.lines?.length === 200 && await captureCount(confirmed.document_id) === 400,
        `Corrected import did not create 200 lines / 200 captures: ${JSON.stringify(detail.body?.lines?.length)}`);

      const scanSession = await request("/api/inventory/scan-sessions", { method: "POST", body: JSON.stringify({ supplier_id: supplierId, material_id: materialIds.transformer }) });
      const duplicateAttrs = [
        { attribute_code: fields.manufacturer, raw: "OEM", value: "OEM" },
        { attribute_code: "serial_number", raw: "TRF-DUP", value: "TRF-DUP" },
        { attribute_code: fields.rating, raw: "5000", value: "5000", supplied_unit: code("V") },
      ];
      const first = await request(`/api/inventory/scan-sessions/${scanSession.body.id}/scan`, { method: "POST", body: JSON.stringify({ payload: materialQr(materialIds.transformer), attributes: duplicateAttrs }) });
      const second = await request(`/api/inventory/scan-sessions/${scanSession.body.id}/scan`, { method: "POST", body: JSON.stringify({ payload: materialQr(materialIds.transformer), attributes: duplicateAttrs }) });
      assert(first.body.state === "READY" && second.body.errors?.some((error: any) => error.rule === "DUPLICATE_SERIAL"),
        `Duplicate serial was not flagged: ${JSON.stringify({ first: first.body, second: second.body })}`);
      scenarioStatus["transformer"] = "PASS";
    });

    await run("S3 configuration-only cable proof", async () => {
      const result = await createManual(materialIds.cable, 100, "LOT-CABLE", attrs(cable, { length: "100", conductor: "copper" }, { length: code("M") }));
      const captureRows = await client.query(
        `SELECT av.value_num, av.value_text, av.unit
           FROM attribute_capture_values av
           JOIN attribute_capture_instances ac ON ac.id = av.capture_instance_id
           JOIN grn_line_items li ON li.id = ac.target_id
          WHERE li.grn_id = $1
          ORDER BY av.attribute_id`,
        [result.id],
      );
      const lengthRow = captureRows.rows.find((row: any) => row.unit === "M");
      assert(Number(lengthRow?.value_num) === 100,
        `Cable length normalization failed: ${JSON.stringify(captureRows.rows)}`);
      assert(captureRows.rows.some((row: any) => row.value_text === "Copper"), `Cable dropdown was not canonicalized: ${JSON.stringify(captureRows.rows)}`);
      scenarioStatus["cable"] = "PASS";
    });

    await runConstitutional({ battery, transformer });
    await run("22-invariant pack plus Phase 6 ledger wall", async () => {
      const checks: Array<[string, boolean, string]> = [
        ["I01", Boolean((await client.query("SELECT 1")).rows.length), "database reachable"],
        ["I02", Boolean((await client.query("SELECT 1 FROM users WHERE id = $1", [directorId])).rows.length), "fixture actor"],
        ["I03", Boolean((await client.query("SELECT 1 FROM master_suppliers WHERE id = $1", [supplierId])).rows.length), "supplier FK"],
        ["I04", Boolean((await client.query("SELECT 1 FROM master_materials WHERE id = $1", [materialIds.battery])).rows.length), "battery material"],
        ["I05", Boolean((await client.query("SELECT 1 FROM material_inventory_profiles WHERE material_id = $1", [materialIds.battery])).rows.length), "tracking profile"],
        ["I06", Number((await client.query("SELECT count(*)::int AS count FROM grn_headers WHERE created_by = $1", [directorId])).rows[0].count) >= 5, "draft GRNs"],
        ["I07", Number((await client.query("SELECT count(*)::int AS count FROM grn_line_items li JOIN grn_headers gh ON gh.id = li.grn_id WHERE gh.created_by = $1", [directorId])).rows[0].count) >= 5, "GRN lines"],
        ["I08", Number((await client.query("SELECT count(*)::int AS count FROM attribute_capture_instances WHERE created_by = $1", [directorId])).rows[0].count) >= 5, "capture instances"],
        ["I09", Number((await client.query("SELECT count(*)::int AS count FROM attribute_capture_values av JOIN attribute_capture_instances ac ON ac.id = av.capture_instance_id WHERE ac.created_by = $1", [directorId])).rows[0].count) >= 6, "typed values"],
        ["I10", Number((await client.query("SELECT count(*)::int AS count FROM import_sessions WHERE created_by = $1", [directorId])).rows[0].count) >= 3, "import sessions"],
        ["I11", Number((await client.query("SELECT count(*)::int AS count FROM scan_sessions WHERE created_by = $1", [directorId])).rows[0].count) >= 3, "scan sessions"],
        ["I12", Number((await client.query("SELECT count(*)::int AS count FROM unit_definitions WHERE unit_code LIKE $1", [`${CODE_PREFIX}%`])).rows[0].count) >= 3, "units"],
        ["I13", Number((await client.query("SELECT count(*)::int AS count FROM attribute_templates WHERE code LIKE $1", [`${LOWER_PREFIX}%`])).rows[0].count) >= 3, "templates"],
        ["I14", Number((await client.query("SELECT count(*)::int AS count FROM material_template_mappings WHERE category_id = ANY($1::uuid[])", [[categoryIds.battery, categoryIds.transformer, categoryIds.cable]])).rows[0].count) === 3, "mappings"],
        ["I15", Number((await client.query("SELECT count(*)::int AS count FROM inventory_transactions WHERE material_id = ANY($1::uuid[])", [[materialIds.battery, materialIds.transformer, materialIds.cable]])).rows[0].count) === 0, "draft-only ledger"],
        ["I16", Number((await client.query("SELECT count(*)::int AS count FROM attribute_capture_instances WHERE target_type <> 'GRN_LINE' AND created_by = $1", [directorId])).rows[0].count) === 0, "capture target allowlist"],
        ["I17", Number((await client.query("SELECT count(*)::int AS count FROM attribute_capture_instances WHERE source_type NOT IN ('MANUAL','CSV','SCAN') AND created_by = $1", [directorId])).rows[0].count) === 0, "source allowlist"],
        ["I18", Number((await client.query("SELECT count(*)::int AS count FROM attribute_capture_instances WHERE template_version_id IS NULL AND created_by = $1", [directorId])).rows[0].count) === 0, "version pinning"],
        ["I19", Number((await client.query("SELECT count(*)::int AS count FROM import_rows WHERE import_session_id IN (SELECT id FROM import_sessions WHERE created_by = $1) AND status = 'INVALID'", [directorId])).rows[0].count) >= 1, "invalid rows retained"],
        ["I20", Number((await client.query("SELECT count(*)::int AS count FROM inventory_transactions it WHERE it.source_document_id IN (SELECT id FROM import_sessions WHERE created_by = $1 UNION SELECT id FROM scan_sessions WHERE created_by = $1)", [directorId])).rows[0].count) === 0, "Phase 6 ledger wall"],
        ["I21", (await client.query(
          `SELECT material_id, warehouse_id, stock_state, SUM(quantity)::numeric
             FROM inventory_transactions
            WHERE stock_state IN ('available', 'in_transit')
            GROUP BY 1, 2, 3
           HAVING SUM(quantity) < 0`,
        )).rows.length === 0, "global negative available/in-transit balance"],
        ["I22", (await client.query(
          `SELECT material_id, lot_id, stock_state, SUM(quantity)::numeric
             FROM inventory_transactions
            WHERE lot_id IS NOT NULL
            GROUP BY 1, 2, 3
           HAVING SUM(quantity) < 0`,
        )).rows.length === 0, "global negative lot balance"],
      ];
      for (const [name, ok, detail] of checks) {
        assert(ok, `${name} failed: ${detail}`);
        invariants[name] = "PASS";
      }
    });

    await runRegressionWall();
    console.log(JSON.stringify({
      result: "PASS",
      batch: "71-H",
      fixture_prefix: PREFIX,
      scenarios: scenarioStatus,
      constitutional,
      regression_wall: regressionWallStatus,
      invariants,
      cases: passed,
    }));
  } finally {
    await cleanup();
  }
}

async function cleanup(): Promise<void> {
  // Setup or a scenario can fail inside a transaction. Reset the client first
  // so teardown never masks the original certification failure with
  // "current transaction is aborted".
  await client.query("ROLLBACK").catch(() => undefined);
  await client.query("BEGIN").catch(() => undefined);
  try {
    await client.query(
      `DELETE FROM attribute_capture_values
        WHERE capture_instance_id IN (
          SELECT ac.id FROM attribute_capture_instances ac
          JOIN grn_line_items li ON li.id = ac.target_id
          JOIN grn_headers gh ON gh.id = li.grn_id
         WHERE gh.created_by = $1
        )`,
      [directorId],
    );
    await client.query(
      `DELETE FROM outbox_events
        WHERE aggregate_id IN (
          SELECT id FROM grn_headers WHERE created_by = $1
          UNION SELECT id FROM grn_line_items WHERE grn_id IN (SELECT id FROM grn_headers WHERE created_by = $1)
          UNION SELECT id FROM import_sessions WHERE created_by = $1
          UNION SELECT id FROM scan_sessions WHERE created_by = $1
        )`,
      [directorId],
    );
    await client.query(
      `DELETE FROM attribute_capture_instances
        WHERE target_id IN (
          SELECT id FROM grn_line_items WHERE grn_id IN (SELECT id FROM grn_headers WHERE created_by = $1)
        )`,
      [directorId],
    );
    await client.query(`DELETE FROM grn_headers WHERE created_by = $1`, [directorId]);
    await client.query(`DELETE FROM import_sessions WHERE created_by = $1`, [directorId]);
    await client.query(`DELETE FROM scan_sessions WHERE created_by = $1`, [directorId]);
    await client.query(`DELETE FROM inventory_lots WHERE id = $1`, [lotId]);
    await client.query(`DELETE FROM material_template_mappings WHERE category_id = ANY($1::uuid[])`, [[categoryIds.battery, categoryIds.transformer, categoryIds.cable]]);
    await client.query(`DELETE FROM material_inventory_profiles WHERE material_id = ANY($1::uuid[])`, [[materialIds.battery, materialIds.transformer, materialIds.cable]]);
    await client.query(
      `DELETE FROM attribute_template_attributes
        WHERE template_version_id IN (
          SELECT v.id FROM attribute_template_versions v
          JOIN attribute_templates t ON t.id = v.template_id
         WHERE t.code LIKE $1
        )`,
      [`${LOWER_PREFIX}%`],
    );
    await client.query(`DELETE FROM attribute_template_versions WHERE template_id IN (SELECT id FROM attribute_templates WHERE code LIKE $1)`, [`${LOWER_PREFIX}%`]);
    await client.query(`DELETE FROM attribute_templates WHERE code LIKE $1`, [`${LOWER_PREFIX}%`]);
    await client.query(`DELETE FROM attribute_definitions WHERE code LIKE $1`, [`${LOWER_PREFIX}%`]);
    await client.query(`DELETE FROM unit_definitions WHERE unit_code LIKE $1`, [`${CODE_PREFIX}%`]);
    await client.query(`DELETE FROM security_events WHERE actor_id = $1`, [directorId]);
    await client.query(`DELETE FROM master_materials WHERE id = ANY($1::uuid[])`, [[materialIds.battery, materialIds.transformer, materialIds.cable]]);
    await client.query(`DELETE FROM master_material_categories WHERE id = ANY($1::uuid[])`, [[categoryIds.battery, categoryIds.transformer, categoryIds.cable]]);
    await client.query(`DELETE FROM master_suppliers WHERE id = $1`, [supplierId]);
    await client.query(`DELETE FROM users WHERE id = $1`, [directorId]);

    const residue = await client.query(
      `SELECT
        (SELECT count(*)::int FROM users WHERE id = $1) AS users,
        (SELECT count(*)::int FROM master_suppliers WHERE id = $2) AS suppliers,
        (SELECT count(*)::int FROM master_materials WHERE id = ANY($3::uuid[])) AS materials,
        (SELECT count(*)::int FROM master_material_categories WHERE id = ANY($4::uuid[])) AS categories,
        (SELECT count(*)::int FROM unit_definitions WHERE unit_code LIKE $5) AS units,
        (SELECT count(*)::int FROM attribute_definitions WHERE code LIKE $6) AS attributes,
        (SELECT count(*)::int FROM attribute_templates WHERE code LIKE $6) AS templates,
        (SELECT count(*)::int FROM import_sessions WHERE created_by = $1) AS imports,
        (SELECT count(*)::int FROM scan_sessions WHERE created_by = $1) AS scans,
        (SELECT count(*)::int FROM grn_headers WHERE created_by = $1) AS grns`,
      [directorId, supplierId, [materialIds.battery, materialIds.transformer, materialIds.cable],
        [categoryIds.battery, categoryIds.transformer, categoryIds.cable], `${CODE_PREFIX}%`, `${LOWER_PREFIX}%`],
    );
    const counts = residue.rows[0] as Record<string, number>;
    assert(Object.values(counts).every((value) => Number(value) === 0), `71-H teardown residue: ${JSON.stringify(counts)}`);
    await client.query("COMMIT");
    console.log(`RESIDUE PASS ${JSON.stringify(counts)}`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

main().catch((error) => {
  regressionWallStatus = "FAIL";
  console.error(JSON.stringify({
    result: "FAIL",
    batch: "71-H",
    fixture_prefix: PREFIX,
    scenarios: scenarioStatus,
    constitutional,
    regression_wall: regressionWallStatus,
    invariants,
    error: error instanceof Error ? error.message : String(error),
  }));
  process.exitCode = 1;
});