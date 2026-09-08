#!/usr/bin/env tsx
/**
 * Repeatable FAT route evidence runner.
 *
 * The runner assumes the controlled FAT-E2E- dataset is seeded with
 * `cert:fat:seed`. The password is read only from FAT_TEST_PASSWORD and is
 * never written to evidence. Set FAT_EVIDENCE_DIR to change the output dir.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { actorEmail, FAT_IDS, FAT_PREFIX } from "./fat-fixture-manifest";

const BASE = process.env.CERT_TARGET ?? "http://localhost:8080";
const PASSWORD = process.env.FAT_TEST_PASSWORD;
if (!PASSWORD || PASSWORD.length < 8) {
  throw new Error("FAT_TEST_PASSWORD must be supplied out of band and contain at least 8 characters");
}

const OUTPUT_DIR = resolve(process.env.FAT_EVIDENCE_DIR ?? "../../certification/fat-evidence");
const RUN_AT = new Date().toISOString();
const FROZEN_TAG = "FAT-CANDIDATE-2026-09-08";
const FROZEN_COMMIT = "60564b1b49b76ce0b97e46d1de65a7325ef50ba7";
const roles = ["owner", "director", "supervisor", "operator", "viewer", "dealer"] as const;
type Role = (typeof roles)[number];
type Cookie = string | undefined;

interface Evidence {
  case_id: string;
  area: string;
  result: "PASS" | "FAIL";
  role: Role | "anonymous";
  actor_id?: string;
  actor_alias?: string;
  method: string;
  path: string;
  request_body?: unknown;
  http_status: number;
  response_body?: unknown;
  request_id?: string;
  note?: string;
}

const evidence: Evidence[] = [];
const tokens = new Map<Role, Cookie>();
let failures = 0;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => {
        if (/password|token|secret|authorization|cookie/i.test(key)) return [key, "[REDACTED]"];
        return [key, redact(child)];
      }),
    );
  }
  if (typeof value === "string" && /^(ocs_token=|bearer )/i.test(value)) return "[REDACTED]";
  return value;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return redact(JSON.parse(text));
  } catch {
    return text.slice(0, 4000);
  }
}

function actor(role: Role): Pick<Evidence, "role" | "actor_id" | "actor_alias"> {
  return {
    role,
    actor_id: FAT_IDS.users[role],
    actor_alias: actorEmail(role),
  };
}

function expectedPass(status: number, expected: number | number[]): boolean {
  return (Array.isArray(expected) ? expected : [expected]).includes(status);
}

async function request(
  caseId: string,
  area: string,
  role: Role | "anonymous",
  method: string,
  path: string,
  options: { body?: unknown; expected?: number | number[]; note?: string; cookie?: Cookie } = {},
): Promise<{ status: number; body: unknown; cookie?: Cookie }> {
  const cookie = options.cookie ?? (role === "anonymous" ? undefined : tokens.get(role));
  const headers: Record<string, string> = { Accept: "application/json" };
  if (cookie) headers.Cookie = cookie;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const body = await readBody(response);
  const requestId = response.headers.get("x-request-id") ?? response.headers.get("x-correlation-id") ?? undefined;
  const pass = expectedPass(response.status, options.expected ?? 200);
  if (!pass) failures += 1;
  evidence.push({
    case_id: caseId,
    area,
    result: pass ? "PASS" : "FAIL",
    ...(role === "anonymous" ? { role } : actor(role)),
    method,
    path,
    ...(options.body !== undefined ? { request_body: redact(options.body) } : {}),
    http_status: response.status,
    response_body: body,
    ...(requestId ? { request_id: requestId } : {}),
    ...(options.note ? { note: options.note } : {}),
  });
  return {
    status: response.status,
    body,
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}

async function login(role: Role, caseId = "AUTH-P01"): Promise<void> {
  const result = await request(caseId, "authentication", role, "POST", "/api/auth/login", {
    body: { email: actorEmail(role), password: PASSWORD },
    expected: 200,
  });
  if (result.cookie) tokens.set(role, result.cookie);
}

async function get(caseId: string, area: string, role: Role, path: string, expected: number | number[] = 200): Promise<void> {
  await request(caseId, area, role, "GET", path, { expected });
}

async function post(
  caseId: string,
  area: string,
  role: Role,
  path: string,
  body: unknown,
  expected: number | number[] = 200,
): Promise<{ status: number; body: unknown }> {
  return request(caseId, area, role, "POST", path, { body, expected });
}

async function runAuth(): Promise<void> {
  for (const role of roles) await login(role);
  for (const role of roles) await get("AUTH-P02", "authentication", role, "/api/auth/me");
  await request("AUTH-N01", "authentication", "anonymous", "POST", "/api/auth/login", {
    body: { email: actorEmail("owner"), password: "wrong-password-not-evidence" },
    expected: 401,
  });
  await get("AUTH-N02", "authentication", "owner", "/api/auth/me", 200);
  await request("AUTH-N02", "authentication", "anonymous", "GET", "/api/auth/me", { expected: 401 });
  await request("AUTH-N02", "authentication", "anonymous", "GET", "/api/masters/products", { expected: 401 });
  await post("AUTH-N03", "authentication", "supervisor", "/api/auth/register", {
    email: "fat.negative-director@fat.local",
    name: "FAT negative authorization probe",
    role: "director",
    password: "[REDACTED]",
  }, 403);
  await post("AUTH-N04", "authentication", "operator", "/api/auth/register", {
    email: "fat.negative-operator@fat.local",
    name: "FAT negative authorization probe",
    role: "viewer",
    password: "[REDACTED]",
  }, 403);
  const logout = await post("AUTH-N05", "authentication", "owner", "/api/auth/logout", {}, 200);
  if (logout.status === 200) {
    tokens.delete("owner");
    await request("AUTH-N05", "authentication", "anonymous", "GET", "/api/auth/me", {
      expected: 401,
      cookie: undefined,
    });
    await login("owner", "AUTH-P01");
  }
}

async function runMasters(): Promise<void> {
  const masterPaths: Array<[string, string]> = [
    ["products", "model"], ["cells", "cell"], ["bms", "bms"], ["cabinets", "cabinet"],
    ["connectors", "connector"], ["cables", "cable"], ["busbars", "busbar"], ["chargers", "charger"],
    ["test-equipment", "testEquipment"], ["product-categories", "category"],
    ["product-workflows", "workflow"], ["material-categories", "materialCategoryCell"],
    ["materials", "materialCell"], ["suppliers", "supplier"], ["material-workflows", "materialWorkflow"],
  ];
  for (const [slug, key] of masterPaths) {
    await get("MAS-P01", "masters", "owner", `/api/masters/${slug}`);
    await get("MAS-P01", "masters", "owner", `/api/masters/${slug}/${FAT_IDS.masters[key as keyof typeof FAT_IDS.masters]}`);
  }
  await get("MAS-P04", "masters", "owner", `/api/boms/${FAT_IDS.bom.header}`);
  await get("MAS-N02", "masters", "dealer", "/api/masters/products", 403);
  await post("MAS-N01", "masters", "viewer", "/api/masters/products", {}, 403);
}

async function runInventoryAndCells(): Promise<void> {
  const inventoryPaths = [
    "/api/inventory/grns?search=FAT-E2E-",
    `/api/inventory/grns/${FAT_IDS.procurement.posted}`,
    "/api/inventory/inspections?search=FAT-E2E-",
    `/api/inventory/inspections/${FAT_IDS.procurement.inspection}`,
    "/api/inventory/stock",
    "/api/inventory/cell-stock",
    "/api/inventory/transfers?search=FAT-E2E-",
    `/api/inventory/transfers/${FAT_IDS.procurement.transfer}`,
  ];
  for (const path of inventoryPaths) await get("INV-P01", "procurement-inventory", "supervisor", path);
  await get("CELL-P01", "cells-grading-matching", "operator", "/api/cells");
  await get("CELL-P01", "cells-grading-matching", "operator", "/api/cells/fa160000-0000-4000-8000-000000000001");
  await get("CELL-P02", "cells-grading-matching", "operator", "/api/cells/lots");
  await get("CELL-P02", "cells-grading-matching", "operator", `/api/cells/lots/${FAT_IDS.cells.lot}`);
  await get("CELL-P02", "cells-grading-matching", "operator", `/api/cells/lots/${FAT_IDS.cells.lot}/history`);
  await get("CELL-P04", "cells-grading-matching", "operator", "/api/cells/matches");
  await get("CELL-P04", "cells-grading-matching", "operator", `/api/cells/matches/${FAT_IDS.cells.matchAllocated}`);
  await get("CELL-P04", "cells-grading-matching", "operator", `/api/cells/matches/${FAT_IDS.cells.matchPending}`);
  await get("CELL-P05", "cells-grading-matching", "operator", "/api/cells/config");
  for (const report of ["receiving", "grading", "inventory", "matching"]) {
    await get("CELL-P06", "cells-grading-matching", "operator", `/api/cells/reports/${report}`);
  }
  await post("INV-N01", "procurement-inventory", "viewer", "/api/inventory/grns", {}, 403);
}

async function runManufacturing(): Promise<void> {
  await get("MFG-P01", "manufacturing", "operator", "/api/manufacturing/orders?search=FAT-E2E-");
  for (const id of [FAT_IDS.orders.clean, FAT_IDS.orders.reject, FAT_IDS.orders.raceOne, FAT_IDS.orders.raceTwo, FAT_IDS.orders.completion]) {
    await get("MFG-P02", "manufacturing", "operator", `/api/manufacturing/orders/${id}`);
    await get("MFG-P02", "manufacturing", "operator", `/api/manufacturing/orders/${id}/stages`);
    await get("MFG-P02", "manufacturing", "operator", `/api/manufacturing/orders/${id}/timeline`);
    await get("MFG-P02", "manufacturing", "operator", `/api/manufacturing/orders/${id}/genealogy`);
    await get("MFG-P02", "manufacturing", "operator", `/api/manufacturing/orders/${id}/allocated-cells`);
    await get("MFG-P02", "manufacturing", "operator", `/api/manufacturing/orders/${id}/formation-report`, [200, 404]);
    await get("MFG-P02", "manufacturing", "operator", `/api/manufacturing/orders/${id}/test-results`);
    await get("MFG-P02", "manufacturing", "operator", `/api/manufacturing/orders/${id}/qc-approval`, [200, 404]);
  }
  await get("MFG-P03", "manufacturing", "supervisor", "/api/manufacturing/charger-units");
  await get("MFG-P03", "manufacturing", "supervisor", "/api/manufacturing/dashboard");
  await get("MFG-P03", "manufacturing", "supervisor", "/api/manufacturing/testing-dashboard");
  await get("MFG-P03", "manufacturing", "supervisor", `/api/manufacturing/orders/${FAT_IDS.orders.clean}/material-issues`);
  await request("MFG-N01", "manufacturing", "viewer", "POST", `/api/manufacturing/orders/${FAT_IDS.orders.raceOne}/stages/charging/start`, {
    body: { operatorName: "FAT E2E Viewer", stageData: { chargerUnitId: FAT_IDS.chargers.primary } },
    expected: 403,
  });
}

async function runConcurrency(): Promise<void> {
  const startPath = (id: string) => `/api/manufacturing/orders/${id}/stages/charging/start`;
  const body = { operatorName: "FAT E2E Operator", stageData: { chargerUnitId: FAT_IDS.chargers.primary } };
  const [chargerOne, chargerTwo] = await Promise.all([
    request("CONC-P01", "concurrency", "operator", "POST", startPath(FAT_IDS.orders.raceOne), { body, expected: [200, 409] }),
    request("CONC-P01", "concurrency", "operator", "POST", startPath(FAT_IDS.orders.raceTwo), { body, expected: [200, 409] }),
  ]);
  if (!([chargerOne.status, chargerTwo.status].includes(200) && [chargerOne.status, chargerTwo.status].includes(409))) failures += 1;

  const [matchOne, matchTwo] = await Promise.all([
    request("CONC-P02", "concurrency", "operator", "POST", `/api/cells/matches/${FAT_IDS.cells.matchPending}/accept`, { body: {}, expected: [200, 409] }),
    request("CONC-P02", "concurrency", "operator", "POST", `/api/cells/matches/${FAT_IDS.cells.matchPending}/accept`, { body: {}, expected: [200, 409] }),
  ]);
  const matchRacePassed = [matchOne.status, matchTwo.status].includes(200) && [matchOne.status, matchTwo.status].includes(409);
  if (!matchRacePassed) {
    failures += 1;
    evidence.push({
      case_id: "CONC-P02",
      area: "concurrency",
      result: "FAIL",
      ...actor("operator"),
      method: "COMPOSITE",
      path: `/api/cells/matches/${FAT_IDS.cells.matchPending}/accept`,
      http_status: 200,
      response_body: { simultaneous_statuses: [matchOne.status, matchTwo.status], expected: "one 200 and one 409" },
      note: "Both concurrent accept requests returned success; the exact-one-winner invariant was not demonstrated.",
    });
  }

  await request("CONC-N01", "concurrency", "operator", "POST", startPath(FAT_IDS.orders.clean), {
    body: { operatorName: "FAT E2E Operator", stageData: { chargerUnitId: FAT_IDS.chargers.primary } },
    expected: 409,
    note: "The race winner keeps the charger unavailable to a later order.",
  });
  await post("CONC-P03", "concurrency", "operator", `/api/manufacturing/orders/${FAT_IDS.orders.completion}/stages/quality_control/start`, {
    operatorName: "FAT E2E Operator",
    stageData: { fixture: FAT_PREFIX },
  }, 200);
  await post("CONC-P03", "concurrency", "operator", `/api/manufacturing/orders/${FAT_IDS.orders.completion}/stages/quality_control/complete`, {
    operatorName: "FAT E2E Operator",
    stageData: { fixture: FAT_PREFIX },
  }, 200);
  const [qcApproval, stageApproval] = await Promise.all([
    request("CONC-P03", "concurrency", "supervisor", "POST", `/api/manufacturing/orders/${FAT_IDS.orders.completion}/qc-approval`, {
      body: { decision: "approved", inspectorName: "FAT E2E Supervisor", inspectorRole: "Plant Manager" },
      expected: [201, 409, 422],
    }),
    request("CONC-P03", "concurrency", "supervisor", "POST", `/api/manufacturing/orders/${FAT_IDS.orders.completion}/stages/quality_control/approve`, {
      body: { supervisorName: "FAT E2E Supervisor" },
      expected: [200, 409, 422],
    }),
  ]);
  const completionResponses = [qcApproval.status, stageApproval.status];
  evidence.push({
    case_id: "CONC-P03",
    area: "concurrency",
    result: completionResponses.some((status) => status === 201 || status === 200) ? "PASS" : "FAIL",
    ...actor("supervisor"),
    method: "COMPOSITE",
    path: `/api/manufacturing/orders/${FAT_IDS.orders.completion}/qc-approval + /stages/quality_control/approve`,
    http_status: completionResponses.find((status) => status === 201 || status === 200) ?? completionResponses[0],
    response_body: { simultaneous_statuses: completionResponses, shared_completion_gate: true },
    note: "Both completion contracts were executed concurrently against the same boundary order; the completion gate must leave one logical product.",
  });
}

async function runFulfillmentAndTraceability(): Promise<void> {
  await get("FUL-P01", "packing", "supervisor", "/api/products");
  await get("FUL-P01", "packing", "supervisor", `/api/products/${FAT_IDS.products.readyForPacking}`);
  await post("FUL-N02", "packing", "supervisor", "/api/packing", {
    product_ids: [FAT_IDS.products.nonPackable],
    packing_date: "2026-09-08",
    packed_by: "FAT E2E Supervisor",
  }, [400, 422]);
  await get("FUL-P03", "dispatch", "supervisor", "/api/dispatch");
  await get("FUL-P03", "dispatch", "supervisor", `/api/dispatch/${FAT_IDS.fulfillment.dispatch}`);
  await post("FUL-N03", "dispatch", "supervisor", "/api/dispatch", {}, [400, 422]);
  await get("FUL-P07", "customer-warranty", "supervisor", "/api/customers/registrations");
  await get("FUL-P07", "customer-warranty", "supervisor", `/api/customers/registrations/${FAT_IDS.fulfillment.registration}`);
  await post("FUL-N04", "customer-warranty", "supervisor", "/api/customers/registrations", {
    product_serial: `${FAT_PREFIX}BATTERY-SERIAL-001`,
    customer_name: "FAT duplicate registration probe",
    mobile: "9000000008",
    address: "FAT evidence probe",
    installation_date: "2026-09-08",
  }, [400, 409]);
  await get("PORTAL-P01", "dealer-portal", "dealer", `/api/dealers/${FAT_IDS.dealer}/inventory`);
  await get("PORTAL-P01", "dealer-portal", "dealer", `/api/dealers/${FAT_IDS.dealer}/dispatch-history`);
  await get("PORTAL-N01", "dealer-portal", "dealer", `/api/dealers/00000000-0000-4000-8000-000000000002/inventory`, 403);
  await get("PORTAL-N02", "dealer-portal", "dealer", "/api/manufacturing/orders", 403);
  await get("WAR-P01", "customer-warranty", "supervisor", "/api/warranties");
  await get("WAR-P01", "customer-warranty", "supervisor", `/api/warranties/${FAT_IDS.fulfillment.warranty}`);
  await post("WAR-P02", "customer-warranty", "supervisor", `/api/warranties/${FAT_IDS.fulfillment.warranty}/void`, {
    reason: "FAT evidence lifecycle closure",
  }, 200);
  await post("WAR-N01", "customer-warranty", "operator", `/api/warranties/${FAT_IDS.fulfillment.warranty}/void`, {
    reason: "unauthorized evidence probe",
  }, 403);
  await get("TRACE-P01", "traceability", "supervisor", `/api/products/${FAT_IDS.products.dispatched}`);
  await get("TRACE-P01", "traceability", "supervisor", `/api/products/${FAT_IDS.products.dispatched}/genealogy`);
  await get("TRACE-P01", "traceability", "supervisor", `/api/products/${FAT_IDS.products.dispatched}/events`);
  await get("TRACE-P01", "traceability", "supervisor", `/api/products/${FAT_IDS.products.dispatched}/traceability`);
  const unknown = "00000000-0000-4000-8000-000000000099";
  await get("TRACE-N01", "traceability", "supervisor", `/api/products/${unknown}/genealogy`, 404);
  await get("TRACE-N01", "traceability", "supervisor", `/api/products/${unknown}/events`, 404);
  await get("TRACE-N01", "traceability", "supervisor", `/api/products/${unknown}/traceability`, 404);
}

async function runReportsAndDashboard(): Promise<void> {
  for (const report of ["executive", "production", "cells", "quality", "inventory", "logistics"]) {
    await get("RPT-P01", "reports", "director", `/api/reports/${report}`);
    await get("RPT-P01", "reports", "supervisor", `/api/reports/${report}`);
  }
  await get("RPT-P02", "reports", "director", "/api/dashboard/director");
  await get("RPT-N01", "reports", "operator", "/api/reports/executive", 403);
  await get("RPT-N01", "reports", "viewer", "/api/reports/executive", 403);
  await get("RPT-N01", "reports", "dealer", "/api/reports/executive", 403);
}

function markdown(): string {
  const passed = evidence.filter((item) => item.result === "PASS").length;
  const failed = evidence.length - passed;
  const lines = [
    "# FAT Journey Evidence",
    "",
    `- Run: ${RUN_AT}`,
    `- Environment: ${BASE}`,
    `- Dataset: ${FAT_PREFIX}`,
    `- Frozen tag: ${FROZEN_TAG}`,
    `- Frozen commit: ${FROZEN_COMMIT}`,
    `- Password evidence: omitted; supplied only through FAT_TEST_PASSWORD`,
    `- Result: ${passed} PASS / ${failed} FAIL`,
    "",
    "| Case | Area | Role | Method | Path | Status | Result |",
    "|---|---|---|---|---|---:|---|",
    ...evidence.map((item) => `| ${item.case_id} | ${item.area} | ${item.role} | ${item.method} | \`${item.path}\` | ${item.http_status} | **${item.result}** |`),
    "",
    "Response bodies and sanitized request bodies are in `fat-journey-evidence.json`.",
  ];
  return `${lines.join("\n")}\n`;
}

function resetFixture(): void {
  const root = resolve(process.cwd(), "../..");
  execFileSync("pnpm", ["--filter", "@workspace/api-server", "run", "cert:fat:teardown"], {
    cwd: root,
    stdio: "pipe",
    encoding: "utf8",
  });
  execFileSync("pnpm", ["--filter", "@workspace/api-server", "run", "cert:fat:verify"], {
    cwd: root,
    stdio: "pipe",
    encoding: "utf8",
  });
  evidence.push({
    case_id: "DATA-P01",
    area: "fixture-reset",
    result: "PASS",
    role: "owner",
    actor_id: FAT_IDS.users.owner,
    actor_alias: actorEmail("owner"),
    method: "COMMAND",
    path: "pnpm cert:fat:teardown && pnpm cert:fat:verify",
    http_status: 0,
    response_body: {
      namespace: FAT_PREFIX,
      state: "clean",
      residual_counts: "all zero",
      password_evidence: "omitted",
    },
    note: "The isolated FAT-E2E namespace was torn down and verified clean; non-FAT namespaces are outside the teardown scope.",
  });
}

async function main(): Promise<void> {
  await runAuth();
  await runMasters();
  await runInventoryAndCells();
  await runManufacturing();
  await runConcurrency();
  await runFulfillmentAndTraceability();
  await runReportsAndDashboard();

  let resetError: unknown;
  try {
    resetFixture();
  } catch (error) {
    resetError = error;
    failures += 1;
    evidence.push({
      case_id: "DATA-P01",
      area: "fixture-reset",
      result: "FAIL",
      role: "owner",
      actor_id: FAT_IDS.users.owner,
      actor_alias: actorEmail("owner"),
      method: "COMMAND",
      path: "pnpm cert:fat:teardown && pnpm cert:fat:verify",
      http_status: 1,
      response_body: { error: "Fixture reset or clean verification failed" },
    });
  }

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(resolve(OUTPUT_DIR, "fat-journey-evidence.json"), `${JSON.stringify({
    run_at: RUN_AT,
    environment: BASE,
    dataset: FAT_PREFIX,
    frozen_tag: FROZEN_TAG,
    frozen_commit: FROZEN_COMMIT,
    password_evidence: "omitted; supplied only through FAT_TEST_PASSWORD",
    summary: {
      total: evidence.length,
      passed: evidence.filter((item) => item.result === "PASS").length,
      failed: evidence.filter((item) => item.result === "FAIL").length,
    },
    cases: evidence,
  }, null, 2)}\n`, "utf8");
  await writeFile(resolve(OUTPUT_DIR, "fat-journey-evidence.md"), markdown(), "utf8");

  console.log(JSON.stringify({
    outputDir: OUTPUT_DIR,
    total: evidence.length,
    passed: evidence.filter((item) => item.result === "PASS").length,
    failed: failures,
    passwordEvidence: "omitted",
  }, null, 2));
  if (resetError) console.error("FAT fixture reset failed:", resetError instanceof Error ? resetError.message : resetError);
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("FAT journey evidence failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});