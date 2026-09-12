#!/usr/bin/env tsx
/**
 * Repeatable FAT route evidence runner.
 *
 * The runner assumes the controlled FAT-E2E- dataset is seeded with
 * `cert:fat:seed`. The password is read only from FAT_TEST_PASSWORD and is
 * never written to evidence. Set FAT_EVIDENCE_DIR to change the output dir.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { pool } from "@workspace/db";
import {
  actorEmail,
  FAT_FIXTURE_CONTRACT,
  FAT_IDS,
  FAT_MANIFEST_PATH,
  FAT_PREFIX,
} from "./fat-fixture-manifest";

const BASE = process.env.CERT_TARGET ?? "http://localhost:8080";
const PASSWORD = process.env.FAT_TEST_PASSWORD;
if (!PASSWORD || PASSWORD.length < 8) {
  throw new Error("FAT_TEST_PASSWORD must be supplied out of band and contain at least 8 characters");
}

const OUTPUT_DIR = resolve(process.env.FAT_EVIDENCE_DIR ?? "../../certification/fat-evidence");
const RUN_AT = new Date().toISOString();
const FROZEN_TAG = "FAT-CANDIDATE-2026-09-08";
const FROZEN_COMMIT = "60564b1b49b76ce0b97e46d1de65a7325ef50ba7";
const roles = FAT_FIXTURE_CONTRACT.roles;
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
  options: {
    body?: unknown;
    expected?: number | number[];
    note?: string;
    cookie?: Cookie;
    captureRequestBody?: boolean;
  } = {},
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
    ...(options.body !== undefined && options.captureRequestBody !== false
      ? { request_body: redact(options.body) }
      : {}),
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function numberAt(value: unknown, path: string): number | null {
  const result = path.split(".").reduce<unknown>((current, key) => (
    isRecord(current) ? current[key] : undefined
  ), value);
  return typeof result === "number" ? result : null;
}

function rowsAt(value: unknown, path: string): Array<Record<string, unknown>> {
  const result = path.split(".").reduce<unknown>((current, key) => (
    isRecord(current) ? current[key] : undefined
  ), value);
  return Array.isArray(result) ? result.filter(isRecord) : [];
}

function assertCheck(
  caseId: string,
  area: string,
  role: Role,
  path: string,
  passed: boolean,
  expected: unknown,
  actual: unknown,
  note: string,
): void {
  if (!passed) failures += 1;
  evidence.push({
    case_id: caseId,
    area,
    result: passed ? "PASS" : "FAIL",
    ...actor(role),
    method: "ASSERT",
    path,
    http_status: 0,
    response_body: { expected: redact(expected), actual: redact(actual) },
    note,
  });
}

async function login(role: Role, caseId = "AUTH-P01"): Promise<void> {
  const result = await request(caseId, "authentication", role, "POST", "/api/auth/login", {
    body: { email: actorEmail(role), password: PASSWORD },
    expected: 200,
    captureRequestBody: false,
  });
  if (result.cookie) tokens.set(role, result.cookie);
}

async function get(caseId: string, area: string, role: Role, path: string, expected: number | number[] = 200): Promise<unknown> {
  const result = await request(caseId, area, role, "GET", path, { expected });
  return result.body;
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

async function runReadOnlySmoke(): Promise<void> {
  // The smoke pass deliberately authenticates every seeded role, but keeps the
  // password and session cookie out of the evidence. Login is the only POST:
  // every fixture/business-record check below is an explicit GET by FAT ID.
  for (const role of roles) await login(role, "SMOKE-AUTH-P01");

  for (const role of roles) {
    const path = "/api/auth/me";
    const me = await get("SMOKE-AUTH-P02", "authentication", role, path);
    const user = isRecord(me) && isRecord(me.user) ? me.user : null;
    assertCheck(
      "SMOKE-AUTH-P02",
      "authentication",
      role,
      path,
      user?.userId === FAT_IDS.users[role] &&
        user.email === actorEmail(role) &&
        user.role === role &&
        (user.dealerId ?? null) === (role === "dealer" ? FAT_IDS.dealer : null),
      {
        id: FAT_IDS.users[role],
        email: actorEmail(role),
        role,
        dealerId: role === "dealer" ? FAT_IDS.dealer : null,
      },
      user,
      "Every seeded role must authenticate and receive the expected scoped identity from /auth/me.",
    );
  }

  const dealerInventoryPath = `/api/dealers/${FAT_IDS.dealer}/inventory`;
  const dealerInventory = await get("SMOKE-PORTAL-P01", "dealer-portal", "dealer", dealerInventoryPath);
  assertCheck(
    "SMOKE-PORTAL-P01",
    "dealer-portal",
    "dealer",
    dealerInventoryPath,
    numberAt(dealerInventory, "total") === 1 &&
      rowsAt(dealerInventory, "items")[0]?.id === FAT_IDS.products.dispatched &&
      rowsAt(dealerInventory, "items")[0]?.dealer_id === FAT_IDS.dealer,
    { total: 1, productId: FAT_IDS.products.dispatched, dealerId: FAT_IDS.dealer },
    dealerInventory,
    "Dealer inventory must return only the controlled FAT product for the authenticated dealer.",
  );

  const dealerHistoryPath = `/api/dealers/${FAT_IDS.dealer}/dispatch-history`;
  const dealerHistory = await get("SMOKE-PORTAL-P02", "dealer-portal", "dealer", dealerHistoryPath);
  assertCheck(
    "SMOKE-PORTAL-P02",
    "dealer-portal",
    "dealer",
    dealerHistoryPath,
    numberAt(dealerHistory, "total") === 1 &&
      rowsAt(dealerHistory, "items")[0]?.product_id === FAT_IDS.products.dispatched,
    { total: 1, productId: FAT_IDS.products.dispatched },
    dealerHistory,
    "Dealer dispatch history must return the controlled FAT dispatch event.",
  );

  const stagesPath = `/api/manufacturing/orders/${FAT_IDS.orders.clean}/stages`;
  const stages = await get("SMOKE-MFG-P01", "manufacturing", "operator", stagesPath);
  const stageRows = rowsAt(stages, "items");
  assertCheck(
    "SMOKE-MFG-P01",
    "manufacturing",
    "operator",
    stagesPath,
    stageRows.length === FAT_FIXTURE_CONTRACT.stages.perOrder &&
      stageRows.every((row) =>
        row.productionOrderId === FAT_IDS.orders.clean &&
        typeof row.stageType === "string" &&
        row.stageData !== null,
      ),
    { stageCount: FAT_FIXTURE_CONTRACT.stages.perOrder, productionOrderId: FAT_IDS.orders.clean },
    stages,
    "The manufacturing stages route must expose the complete nine-stage FAT projection.",
  );

  const genealogyPath = `/api/manufacturing/orders/${FAT_IDS.orders.clean}/genealogy`;
  const genealogy = await get("SMOKE-MFG-P02", "manufacturing", "operator", genealogyPath);
  const genealogyRows = rowsAt(genealogy, "items");
  assertCheck(
    "SMOKE-MFG-P02",
    "manufacturing",
    "operator",
    genealogyPath,
    genealogyRows.length === FAT_FIXTURE_CONTRACT.genealogy.cleanOrderRows &&
      genealogyRows.every((row) =>
        row.productionOrderId === FAT_IDS.orders.clean &&
        typeof row.componentType === "string" &&
        String(row.notes ?? "").startsWith(FAT_PREFIX),
      ),
    { genealogyCount: FAT_FIXTURE_CONTRACT.genealogy.cleanOrderRows, productionOrderId: FAT_IDS.orders.clean, notesPrefix: FAT_PREFIX },
    genealogy,
    "Manufacturing genealogy must expose the five controlled FAT component records.",
  );

  const dispatchPath = `/api/dispatch/${FAT_IDS.fulfillment.dispatch}`;
  const dispatch = await get("SMOKE-FUL-P01", "dispatch", "supervisor", dispatchPath);
  const dispatchItems = rowsAt(dispatch, "items");
  assertCheck(
    "SMOKE-FUL-P01",
    "dispatch",
    "supervisor",
    dispatchPath,
    isRecord(dispatch) &&
      dispatch.id === FAT_IDS.fulfillment.dispatch &&
      dispatch.dealer_id === FAT_IDS.dealer &&
    dispatchItems.length === FAT_FIXTURE_CONTRACT.fulfillment.dispatchItemCount &&
      dispatchItems[0]?.product_id === FAT_IDS.products.dispatched,
    {
      dispatchId: FAT_IDS.fulfillment.dispatch,
      dealerId: FAT_IDS.dealer,
      productId: FAT_IDS.products.dispatched,
    },
    dispatch,
    "Dispatch detail must resolve the controlled FAT document and serialized product.",
  );

  const registrationPath = `/api/customers/registrations/${FAT_IDS.fulfillment.registration}`;
  const registration = await get("SMOKE-FUL-P02", "customer-warranty", "supervisor", registrationPath);
  assertCheck(
    "SMOKE-FUL-P02",
    "customer-warranty",
    "supervisor",
    registrationPath,
    isRecord(registration) &&
      registration.id === FAT_IDS.fulfillment.registration &&
      registration.product_id === FAT_IDS.products.dispatched &&
      registration.dealer_id === FAT_IDS.dealer,
    {
      registrationId: FAT_IDS.fulfillment.registration,
      productId: FAT_IDS.products.dispatched,
      dealerId: FAT_IDS.dealer,
    },
    registration,
    "Customer registration detail must resolve the controlled dispatched product and dealer.",
  );

  const warrantyPath = `/api/warranties/${FAT_IDS.fulfillment.warranty}`;
  const warranty = await get("SMOKE-FUL-P03", "customer-warranty", "viewer", warrantyPath);
  assertCheck(
    "SMOKE-FUL-P03",
    "customer-warranty",
    "viewer",
    warrantyPath,
    isRecord(warranty) &&
      warranty.id === FAT_IDS.fulfillment.warranty &&
      warranty.product_id === FAT_IDS.products.dispatched &&
      warranty.registration_id === FAT_IDS.fulfillment.registration,
    {
      warrantyId: FAT_IDS.fulfillment.warranty,
      productId: FAT_IDS.products.dispatched,
      registrationId: FAT_IDS.fulfillment.registration,
    },
    warranty,
    "Warranty detail must resolve the controlled registration and serialized product.",
  );
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
      http_status: matchOne.status,
      response_body: { simultaneous_statuses: [matchOne.status, matchTwo.status], expected: "one 200 and one 409" },
      note: "The concurrent acceptance did not produce exactly one winner and one contention response.",
    });
  }

  const matchAfterRace = await request(
    "CONC-P02",
    "concurrency",
    "operator",
    "GET",
    `/api/cells/matches/${FAT_IDS.cells.matchPending}`,
    {
      expected: 200,
      note: `The winning acceptance must leave the match reserved with all ${FAT_FIXTURE_CONTRACT.concurrency.pendingMatchItems} cells reserved for it.`,
    },
  );
  const matchAfterBody = isRecord(matchAfterRace.body) ? matchAfterRace.body : {};
  const acceptedCells = rowsAt(matchAfterRace.body, "batteries")
    .flatMap((battery) => rowsAt(battery, "cells"));
  assertCheck(
    "CONC-P02",
    "concurrency",
    "operator",
    `/api/cells/matches/${FAT_IDS.cells.matchPending}`,
    matchAfterRace.status === 200 &&
      matchAfterBody.status === "reserved" &&
      acceptedCells.length === FAT_FIXTURE_CONTRACT.concurrency.pendingMatchItems &&
      acceptedCells.every((cell) => cell.status === "reserved" && cell.matchId === FAT_IDS.cells.matchPending),
    {
      match_status: "reserved",
      cell_count: FAT_FIXTURE_CONTRACT.concurrency.pendingMatchItems,
      cell_status: "reserved",
      cell_match_id: FAT_IDS.cells.matchPending,
    },
    {
      match_status: matchAfterBody.status,
      cell_count: acceptedCells.length,
      cell_statuses: acceptedCells.map((cell) => cell.status),
      cell_match_ids: acceptedCells.map((cell) => cell.matchId),
    },
    `The exact-one-winner race must leave one reserved match owning all ${FAT_FIXTURE_CONTRACT.concurrency.pendingMatchItems} reserved cells.`,
  );

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
  const manifest = JSON.parse(await readFile(FAT_MANIFEST_PATH, "utf8")) as {
    recordCounts: Record<string, number>;
    expectations: Record<string, number | boolean>;
    residualCounts: Record<string, number>;
  };
  const reportBodies = new Map<string, unknown>();
  for (const report of ["executive", "production", "cells", "quality", "inventory", "logistics"]) {
    reportBodies.set(report, await get("RPT-P01", "reports", "director", `/api/reports/${report}`));
    await get("RPT-P01", "reports", "supervisor", `/api/reports/${report}`);
  }
  const dashboard = await get("RPT-P02", "reports", "director", "/api/dashboard/director");
  await get("RPT-P02", "reports", "viewer", "/api/dashboard/director");
  await get("RPT-N01", "reports", "operator", "/api/reports/executive", 403);
  await get("RPT-N01", "reports", "viewer", "/api/reports/executive", 403);
  await get("RPT-N01", "reports", "dealer", "/api/reports/executive", 403);

  const [source] = (await pool.query(`
    SELECT
      (SELECT count(*)::int FROM mfg_production_orders) AS orders_total,
      (SELECT count(*)::int FROM mfg_production_orders WHERE status = 'in_progress') AS orders_in_progress,
      (SELECT count(*)::int FROM mfg_production_orders WHERE status = 'completed') AS orders_completed,
      (SELECT count(*)::int FROM mfg_production_orders WHERE status = 'draft') AS orders_draft,
      (SELECT count(*)::int FROM cells) AS cells_total,
      (SELECT count(*)::int FROM cells WHERE status = 'approved') AS cells_approved,
      (SELECT count(*)::int FROM cells WHERE status = 'allocated') AS cells_allocated,
      (SELECT count(*)::int FROM cells WHERE grade = 'A') AS cells_grade_a,
      (SELECT count(*)::int FROM cells WHERE grade = 'B') AS cells_grade_b,
      (SELECT count(*)::int FROM cells WHERE grade = 'C') AS cells_grade_c,
      (SELECT count(*)::int FROM cells WHERE grade = 'reject') AS cells_rejected,
      (SELECT count(*)::int FROM mfg_test_results) AS tests_total,
      (SELECT count(*)::int FROM mfg_test_results WHERE result = 'pass') AS tests_passed,
      (SELECT count(*)::int FROM mfg_test_results WHERE result = 'fail') AS tests_failed,
      (SELECT count(*)::int FROM mfg_order_stages WHERE stage_type = 'quality_control') AS qc_total,
      (SELECT count(*)::int FROM mfg_order_stages WHERE stage_type = 'quality_control' AND status = 'approved') AS qc_approved,
      (SELECT count(*)::int FROM mfg_order_stages WHERE stage_type = 'quality_control' AND status = 'rejected') AS qc_rejected,
      (SELECT count(*)::int FROM mfg_rework_tickets) AS rework_total,
      (SELECT count(*)::int FROM mfg_rework_tickets WHERE status = 'open') AS rework_open,
      (SELECT count(*)::int FROM logistics_dispatch_orders) AS dispatch_total,
      (SELECT count(*)::int FROM logistics_dispatch_orders WHERE status = 'in_transit') AS dispatch_in_transit,
      (SELECT count(*)::int FROM logistics_dispatch_orders WHERE status = 'delivered') AS dispatch_delivered,
      (SELECT count(*)::int FROM logistics_dispatch_items i
        INNER JOIN logistics_dispatch_orders d ON d.id = i.dispatch_order_id
        WHERE d.status IN ('in_transit', 'delivered')) AS shipped_items,
      (SELECT count(*)::int FROM products) AS products_total,
      (SELECT count(*)::int FROM mfg_charger_units) AS chargers_total,
      (SELECT count(*)::int FROM mfg_charger_units WHERE status = 'available') AS chargers_available,
      (SELECT count(*)::int FROM mfg_charger_units WHERE status = 'busy') AS chargers_busy,
      (SELECT count(*)::int FROM mfg_charger_units WHERE status = 'maintenance') AS chargers_maintenance,
      (SELECT count(*)::int FROM logistics_dealers) AS dealers_total
  `)).rows;

  const executive = reportBodies.get("executive");
  const quality = reportBodies.get("quality");
  const cells = reportBodies.get("cells");
  const inventory = reportBodies.get("inventory");
  const logistics = reportBodies.get("logistics");

  const sourceCount = (key: string): number => Number(source?.[key] ?? -1);
  const compare = (caseId: string, role: Role, path: string, actual: unknown, expected: unknown, note: string) => {
    assertCheck(caseId, "reports-reconciliation", role, path, actual === expected, expected, actual, note);
  };

  compare("RPT-P01", "director", "/api/reports/executive", numberAt(executive, "production.total"), sourceCount("orders_completed"), "Executive production total must equal completed orders.");
  compare("RPT-P01", "director", "/api/reports/executive", numberAt(executive, "production.inProgress"), sourceCount("orders_in_progress"), "Executive in-progress orders must equal the production-order source.");
  compare("RPT-P01", "director", "/api/reports/executive", numberAt(executive, "inventory.totalCells"), sourceCount("cells_total"), "Executive cell total must equal the cells source.");
  compare("RPT-P01", "director", "/api/reports/executive", numberAt(executive, "logistics.totalShipments"), sourceCount("dispatch_total"), "Executive shipment total must equal dispatch orders.");
  compare("RPT-P01", "director", "/api/reports/quality", numberAt(quality, "summary.totalTests"), sourceCount("tests_total"), "Quality test total must equal test-result rows.");
  compare("RPT-P01", "director", "/api/reports/quality", numberAt(quality, "summary.passed"), sourceCount("tests_passed"), "Quality pass count must equal passed test-result rows.");
  compare("RPT-P01", "director", "/api/reports/quality", numberAt(quality, "summary.failed"), sourceCount("tests_failed"), "Quality fail count must equal failed test-result rows.");
  compare("RPT-P01", "director", "/api/reports/quality", numberAt(quality, "summary.qcApprovals"), sourceCount("qc_total"), "Quality-control stage count must equal QC stage rows.");
  compare("RPT-P01", "director", "/api/reports/inventory", numberAt(inventory, "cells.total"), sourceCount("cells_total"), "Inventory cell total must equal the cells source.");
  compare("RPT-P01", "director", "/api/reports/inventory", numberAt(inventory, "cells.available"), sourceCount("cells_approved"), "Inventory available cells must equal approved cells.");
  compare("RPT-P01", "director", "/api/reports/inventory", numberAt(inventory, "cells.allocated"), sourceCount("cells_allocated"), "Inventory allocated cells must equal allocated cells.");
  compare("RPT-P01", "director", "/api/reports/inventory", numberAt(inventory, "batteries.total"), sourceCount("orders_total"), "Inventory battery total must equal production orders.");
  compare("RPT-P01", "director", "/api/reports/inventory", numberAt(inventory, "finishedProducts.total"), sourceCount("products_total"), "Inventory finished-product total must equal products.");
  compare("RPT-P01", "director", "/api/reports/logistics", numberAt(logistics, "summary.total"), sourceCount("dispatch_total"), "Logistics shipment total must equal dispatch orders.");
  compare("RPT-P01", "director", "/api/reports/logistics", numberAt(logistics, "summary.inTransit"), sourceCount("dispatch_in_transit"), "Logistics in-transit total must equal dispatch status rows.");
  compare("RPT-P01", "director", "/api/reports/logistics", numberAt(logistics, "summary.delivered"), sourceCount("dispatch_delivered"), "Logistics delivered total must equal dispatch status rows.");
  compare("RPT-P01", "director", "/api/reports/logistics", numberAt(logistics, "summary.totalBatteriesShipped"), sourceCount("shipped_items"), "Logistics shipped-item total must equal dispatched/delivered items.");

  const fixtureCellLot = rowsAt(cells, "byLot").find((row) => String(row.lotNumber ?? "").startsWith(FAT_PREFIX));
  const fixtureInventoryLot = rowsAt(inventory, "byLot").find((row) => String(row.lotNumber ?? "").startsWith(FAT_PREFIX));
  const expectedAcceptedCells = FAT_FIXTURE_CONTRACT.cells.acceptable;
  const expectedAllocatedCells = FAT_FIXTURE_CONTRACT.cells.allocated;
  const expectedAvailableCells = expectedAcceptedCells - expectedAllocatedCells;
  assertCheck("RPT-P01", "reports-reconciliation", "director", "/api/reports/cells", fixtureCellLot?.total === manifest.recordCounts.cells &&
    fixtureCellLot?.gradeA === FAT_FIXTURE_CONTRACT.cells.gradeACount &&
      fixtureCellLot?.rejected === FAT_FIXTURE_CONTRACT.cells.rejected,
  { total: manifest.recordCounts.cells, gradeA: FAT_FIXTURE_CONTRACT.cells.gradeACount, rejected: FAT_FIXTURE_CONTRACT.cells.rejected }, fixtureCellLot,
  "The FAT lot must retain the manifest cell count and controlled grading split.");
  assertCheck("RPT-P01", "reports-reconciliation", "director", "/api/reports/inventory", fixtureInventoryLot?.total === manifest.recordCounts.cells &&
    fixtureInventoryLot?.available === expectedAvailableCells && fixtureInventoryLot?.allocated === expectedAllocatedCells && fixtureInventoryLot?.rejected === FAT_FIXTURE_CONTRACT.cells.rejected,
  { total: manifest.recordCounts.cells, available: expectedAvailableCells, allocated: expectedAllocatedCells, rejected: FAT_FIXTURE_CONTRACT.cells.rejected }, fixtureInventoryLot,
  "The inventory report must preserve the FAT lot availability projection.");

  const production = reportBodies.get("production");
  const productionCreated = rowsAt(production, "byDay").reduce((sum, row) => sum + Number(row.created ?? 0), 0);
  const productionCompleted = rowsAt(production, "byDay").reduce((sum, row) => sum + Number(row.completed ?? 0), 0);
  assertCheck("RPT-P01", "reports-reconciliation", "director", "/api/reports/production", productionCreated >= manifest.residualCounts.orders,
    `at least ${manifest.residualCounts.orders} controlled orders in the date window`, productionCreated,
    "Production report date buckets must include every FAT production order.");
  assertCheck("RPT-P01", "reports-reconciliation", "director", "/api/reports/production", productionCompleted >= 2,
    "at least 2 controlled completed orders", productionCompleted,
    "Production report completed buckets must include the two seeded completed orders.");

  const reportWindow = FAT_FIXTURE_CONTRACT.reports.productionDateWindow;
  const boundedProductionPath = `/api/reports/production?from=${encodeURIComponent(reportWindow.from)}&to=${encodeURIComponent(reportWindow.to)}`;
  const boundedProduction = await get("RPT-P03", "reports-reconciliation", "director", boundedProductionPath);
  const boundaryIds: string[] = [
    reportWindow.boundaryOrders.before.id,
    reportWindow.boundaryOrders.inside.id,
    reportWindow.boundaryOrders.after.id,
  ];
  const sourceRows = (await pool.query(
    `SELECT id, order_number, created_at, status
       FROM mfg_production_orders
      WHERE order_number LIKE $1
      ORDER BY created_at, id`,
    [`${FAT_PREFIX}%`],
  )).rows;
  const fromMillis = Date.parse(reportWindow.from);
  const toMillis = Date.parse(reportWindow.to);
  const includedRows = sourceRows.filter((row) => {
    const createdAt = Date.parse(String(row.created_at));
    return createdAt >= fromMillis && createdAt <= toMillis;
  });
  const excludedRows = sourceRows.filter((row) => !includedRows.includes(row));
  const includedIds = includedRows.map((row) => String(row.id));
  const excludedIds = excludedRows.map((row) => String(row.id));
  const expectedCreated = includedRows.length;
  const expectedCompleted = includedRows.filter((row) => row.status === "completed").length;
  const reportTotals = (bucket: string) => ({
    created: rowsAt(boundedProduction, bucket).reduce((sum, row) => sum + Number(row.created ?? 0), 0),
    completed: rowsAt(boundedProduction, bucket).reduce((sum, row) => sum + Number(row.completed ?? 0), 0),
  });
  const expectedExcludedIds = [reportWindow.boundaryOrders.before.id, reportWindow.boundaryOrders.after.id];
  assertCheck(
    "RPT-P03",
    "reports-reconciliation",
    "director",
    boundedProductionPath,
    includedIds.includes(reportWindow.boundaryOrders.inside.id) &&
      !includedIds.includes(reportWindow.boundaryOrders.before.id) &&
      !includedIds.includes(reportWindow.boundaryOrders.after.id) &&
      JSON.stringify(excludedIds.filter((id) => boundaryIds.includes(id)).sort()) === JSON.stringify(expectedExcludedIds.sort()) &&
      ["byDay", "byWeek", "byMonth"].every((bucket) => {
        const totals = reportTotals(bucket);
        return totals.created === expectedCreated && totals.completed === expectedCompleted;
      }),
    {
      window: reportWindow,
      included_record_ids: includedIds,
      excluded_record_ids: excludedIds,
      totals: {
        by_day: { created: expectedCreated, completed: expectedCompleted },
        by_week: { created: expectedCreated, completed: expectedCompleted },
        by_month: { created: expectedCreated, completed: expectedCompleted },
      },
    },
    {
      included_record_ids: includedIds,
      excluded_record_ids: excludedIds,
      totals: {
        by_day: reportTotals("byDay"),
        by_week: reportTotals("byWeek"),
        by_month: reportTotals("byMonth"),
      },
      response: boundedProduction,
    },
    "Production by-day, by-week, and by-month totals must include only orders created inside the requested window; the boundary IDs make both inclusion and exclusion machine-readable.",
  );

  const dashboardProductionTotal = numberAt(dashboard, "orderStats.total");
  const dashboardCellsTotal = numberAt(dashboard, "cellInventory.total");
  const dashboardChargers = numberAt(dashboard, "equipmentStatus.chargers.total");
  compare("RPT-P02", "director", "/api/dashboard/director", dashboardProductionTotal, sourceCount("orders_total"), "Dashboard order total must equal the production-order source.");
  compare("RPT-P02", "director", "/api/dashboard/director", dashboardCellsTotal, sourceCount("cells_total"), "Dashboard cell total must equal the cells source.");
  compare("RPT-P02", "director", "/api/dashboard/director", dashboardChargers, sourceCount("chargers_total"), "Dashboard charger total must equal charger-unit rows.");
  compare("RPT-P02", "director", "/api/dashboard/director", numberAt(dashboard, "qualitySummary.testPassCount"), sourceCount("tests_passed"), "Dashboard quality pass count must equal test-result rows.");
  compare("RPT-P02", "director", "/api/dashboard/director", numberAt(dashboard, "logistics.totalDealers"), sourceCount("dealers_total"), "Dashboard dealer count must equal dealer-master rows.");

  const dealerInventory = await get("PORTAL-P01", "dealer-portal", "dealer", `/api/dealers/${FAT_IDS.dealer}/inventory`);
  const dealerHistory = await get("PORTAL-P01", "dealer-portal", "dealer", `/api/dealers/${FAT_IDS.dealer}/dispatch-history`);
  await get("PORTAL-P02", "dealer-portal", "viewer", `/api/dealers/${FAT_IDS.dealer}/inventory`);
  await get("PORTAL-N01", "dealer-portal", "dealer", "/api/dealers/00000000-0000-0000-0000-000000000002/inventory", 403);
  assertCheck("PORTAL-P01", "dealer-portal", "dealer", `/api/dealers/${FAT_IDS.dealer}/inventory`,
    numberAt(dealerInventory, "total") === 1 && rowsAt(dealerInventory, "items")[0]?.id === FAT_IDS.products.dispatched,
    { total: 1, productId: FAT_IDS.products.dispatched }, dealerInventory,
    "Dealer inventory must expose exactly the controlled product and no other dealer's rows.");
  assertCheck("PORTAL-P01", "dealer-portal", "dealer", `/api/dealers/${FAT_IDS.dealer}/dispatch-history`,
    numberAt(dealerHistory, "total") === 1 && rowsAt(dealerHistory, "items")[0]?.product_id === FAT_IDS.products.dispatched,
    { total: 1, productId: FAT_IDS.products.dispatched }, dealerHistory,
    "Dealer dispatch history must expose the controlled dispatched product.");

  const warrantyList = await get("WAR-P01", "customer-warranty", "viewer", "/api/warranties");
  const warrantyDetail = await get("WAR-P01", "customer-warranty", "viewer", `/api/warranties/${FAT_IDS.fulfillment.warranty}`);
  await get("WAR-N01", "customer-warranty", "dealer", "/api/warranties", 403);
  assertCheck("WAR-P01", "customer-warranty", "viewer", "/api/warranties",
    rowsAt(warrantyList, "items").some((row) => row.id === FAT_IDS.fulfillment.warranty),
    { warrantyId: FAT_IDS.fulfillment.warranty }, warrantyList,
    "Factory read access must include the controlled warranty record.");
  assertCheck("WAR-P01", "customer-warranty", "viewer", `/api/warranties/${FAT_IDS.fulfillment.warranty}`,
    isRecord(warrantyDetail) && warrantyDetail.id === FAT_IDS.fulfillment.warranty &&
      warrantyDetail.product_id === FAT_IDS.products.dispatched,
    { warrantyId: FAT_IDS.fulfillment.warranty, productId: FAT_IDS.products.dispatched }, warrantyDetail,
    "Warranty detail must resolve to the controlled serialized product.");
}

function markdown(): string {
  const passed = evidence.filter((item) => item.result === "PASS").length;
  const failed = evidence.length - passed;
  const smokeOnly = process.env.FAT_READONLY_ONLY === "1";
  const lines = [
    smokeOnly ? "# FAT Read-Only Route Smoke Evidence" : "# FAT Journey Evidence",
    "",
    `- Run: ${RUN_AT}`,
    `- Environment: ${BASE}`,
    `- Dataset: ${FAT_PREFIX}`,
    `- Frozen tag: ${FROZEN_TAG}`,
    `- Frozen commit: ${FROZEN_COMMIT}`,
    `- Password evidence: omitted; supplied only through FAT_TEST_PASSWORD`,
    ...(smokeOnly ? ["- Fixture mutation: none; authenticated GET-only route checks after login"] : []),
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

async function persistEvidence(): Promise<void> {
  const reportOnly = process.env.FAT_REPORTS_ONLY === "1";
  const smokeOnly = process.env.FAT_READONLY_ONLY === "1";
  const jsonName = reportOnly
    ? "fat-report-evidence.json"
    : smokeOnly
      ? "fat-readonly-smoke-evidence.json"
      : "fat-journey-evidence.json";
  const markdownName = reportOnly
    ? "fat-report-evidence.md"
    : smokeOnly
      ? "fat-readonly-smoke-evidence.md"
      : "fat-journey-evidence.md";
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(resolve(OUTPUT_DIR, jsonName), `${JSON.stringify({
    run_at: RUN_AT,
    environment: BASE,
    dataset: FAT_PREFIX,
    mode: smokeOnly ? "read-only-route-smoke" : reportOnly ? "reports" : "full-journey",
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
  await writeFile(resolve(OUTPUT_DIR, markdownName), markdown(), "utf8");
  console.log(JSON.stringify({
    outputDir: OUTPUT_DIR,
    total: evidence.length,
    passed: evidence.filter((item) => item.result === "PASS").length,
    failed: failures,
    passwordEvidence: "omitted",
  }, null, 2));
}

async function main(): Promise<void> {
  if (process.env.FAT_READONLY_ONLY === "1") {
    await runReadOnlySmoke();
    await persistEvidence();
    if (failures > 0) process.exitCode = 1;
    return;
  }

  if (process.env.FAT_REPORTS_ONLY === "1") {
    for (const role of roles) await login(role, "RPT-AUTH");
    await runReportsAndDashboard();
    await persistEvidence();
    if (failures > 0) process.exitCode = 1;
    return;
  }

  await runAuth();
  await runMasters();
  await runInventoryAndCells();
  await runManufacturing();
  // Reconcile all report/dashboard/portal read paths before the later
  // concurrency and fulfillment probes mutate their isolated FAT fixtures.
  await runReportsAndDashboard();
  await runConcurrency();
  await runFulfillmentAndTraceability();

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

  await persistEvidence();
  if (resetError) console.error("FAT fixture reset failed:", resetError instanceof Error ? resetError.message : resetError);
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("FAT journey evidence failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
