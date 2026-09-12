#!/usr/bin/env tsx
/**
 * Deterministic response-shape contract checks for report consumers.
 *
 * This intentionally validates required consumer fields only. Additional API
 * fields are allowed so the contract catches drift without freezing unrelated
 * response expansion.
 */

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type JsonObject = Record<string, unknown>;

const ENDPOINTS = {
  production: "/api/reports/production",
  dashboard: "/api/dashboard/director",
} as const;

const EVIDENCE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../..",
  "certification/fat-evidence/fat-report-evidence.json",
);

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function contractError(endpoint: string, path: string, expected: string, actual: unknown): never {
  throw new Error(
    `[${endpoint}] ${path}: expected ${expected}; received ${describe(actual)}`,
  );
}

function required(object: JsonObject, key: string, endpoint: string, path: string): unknown {
  if (!Object.prototype.hasOwnProperty.call(object, key)) {
    throw new Error(`[${endpoint}] ${path}.${key}: missing required field`);
  }
  return object[key];
}

function objectAt(value: unknown, endpoint: string, path: string): JsonObject {
  if (!isObject(value)) contractError(endpoint, path, "object", value);
  return value;
}

function stringAt(value: unknown, endpoint: string, path: string): void {
  if (typeof value !== "string") contractError(endpoint, path, "string", value);
}

function nullableStringAt(value: unknown, endpoint: string, path: string): void {
  if (value !== null && typeof value !== "string") {
    contractError(endpoint, path, "string or null", value);
  }
}

function numberAt(value: unknown, endpoint: string, path: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    contractError(endpoint, path, "finite number", value);
  }
}

function arrayAt(value: unknown, endpoint: string, path: string): unknown[] {
  if (!Array.isArray(value)) contractError(endpoint, path, "array", value);
  return value;
}

function requiredString(
  object: JsonObject,
  key: string,
  endpoint: string,
  path: string,
): void {
  stringAt(required(object, key, endpoint, path), endpoint, `${path}.${key}`);
}

function requiredNullableString(
  object: JsonObject,
  key: string,
  endpoint: string,
  path: string,
): void {
  nullableStringAt(required(object, key, endpoint, path), endpoint, `${path}.${key}`);
}

function requiredNumber(
  object: JsonObject,
  key: string,
  endpoint: string,
  path: string,
): void {
  numberAt(required(object, key, endpoint, path), endpoint, `${path}.${key}`);
}

function validateProductionReport(value: unknown): void {
  const endpoint = ENDPOINTS.production;
  const root = objectAt(value, endpoint, "$");
  const filters = objectAt(required(root, "filters", endpoint, "$"), endpoint, "$.filters");

  requiredString(filters, "from", endpoint, "$.filters");
  requiredString(filters, "to", endpoint, "$.filters");
  requiredNullableString(filters, "productId", endpoint, "$.filters");

  const byDay = arrayAt(required(root, "byDay", endpoint, "$"), endpoint, "$.byDay");
  byDay.forEach((entry, index) => {
    const path = `$.byDay[${index}]`;
    const row = objectAt(entry, endpoint, path);
    requiredString(row, "date", endpoint, path);
    requiredNumber(row, "created", endpoint, path);
    requiredNumber(row, "completed", endpoint, path);
  });

  const byWeek = arrayAt(required(root, "byWeek", endpoint, "$"), endpoint, "$.byWeek");
  byWeek.forEach((entry, index) => {
    const path = `$.byWeek[${index}]`;
    const row = objectAt(entry, endpoint, path);
    requiredString(row, "week", endpoint, path);
    requiredNumber(row, "created", endpoint, path);
    requiredNumber(row, "completed", endpoint, path);
  });

  const byMonth = arrayAt(required(root, "byMonth", endpoint, "$"), endpoint, "$.byMonth");
  byMonth.forEach((entry, index) => {
    const path = `$.byMonth[${index}]`;
    const row = objectAt(entry, endpoint, path);
    requiredString(row, "month", endpoint, path);
    requiredNumber(row, "created", endpoint, path);
    requiredNumber(row, "completed", endpoint, path);
  });

  const byOperator = arrayAt(required(root, "byOperator", endpoint, "$"), endpoint, "$.byOperator");
  byOperator.forEach((entry, index) => {
    const path = `$.byOperator[${index}]`;
    const row = objectAt(entry, endpoint, path);
    requiredString(row, "operator", endpoint, path);
    requiredNumber(row, "completed", endpoint, path);
  });

  const stageTimings = arrayAt(
    required(root, "stageTimings", endpoint, "$"),
    endpoint,
    "$.stageTimings",
  );
  stageTimings.forEach((entry, index) => {
    const path = `$.stageTimings[${index}]`;
    const row = objectAt(entry, endpoint, path);
    requiredString(row, "stage", endpoint, path);
    const avgHrs = required(row, "avgHrs", endpoint, path);
    if (avgHrs !== null) numberAt(avgHrs, endpoint, `${path}.avgHrs`);
    requiredNumber(row, "count", endpoint, path);
  });

  requiredString(root, "refreshedAt", endpoint, "$");
}

function validateDirectorDashboard(value: unknown): void {
  const endpoint = ENDPOINTS.dashboard;
  const root = objectAt(value, endpoint, "$");
  requiredString(root, "refreshedAt", endpoint, "$");

  const kpis = objectAt(required(root, "kpis", endpoint, "$"), endpoint, "$.kpis");
  for (const key of [
    "todayTarget",
    "todayCompleted",
    "productionEfficiency",
    "inProgress",
    "qcPending",
    "dispatchReady",
    "reworkQueue",
    "chargerUtilization",
  ]) {
    requiredNumber(kpis, key, endpoint, "$.kpis");
  }

  const pipeline = arrayAt(required(root, "pipeline", endpoint, "$"), endpoint, "$.pipeline");
  pipeline.forEach((entry, index) => {
    const path = `$.pipeline[${index}]`;
    const row = objectAt(entry, endpoint, path);
    for (const key of ["key", "label", "href"]) requiredString(row, key, endpoint, path);
    for (const key of ["inProgress", "waiting", "blocked", "completedToday"]) {
      requiredNumber(row, key, endpoint, path);
    }
    requiredString(row, "health", endpoint, path);
  });

  const alerts = arrayAt(required(root, "alerts", endpoint, "$"), endpoint, "$.alerts");
  alerts.forEach((entry, index) => {
    const path = `$.alerts[${index}]`;
    const row = objectAt(entry, endpoint, path);
    for (const key of ["id", "severity", "message", "timestamp"]) {
      requiredString(row, key, endpoint, path);
    }
  });

  const recentOrders = arrayAt(
    required(root, "recentOrders", endpoint, "$"),
    endpoint,
    "$.recentOrders",
  );
  recentOrders.forEach((entry, index) => {
    const path = `$.recentOrders[${index}]`;
    const row = objectAt(entry, endpoint, path);
    for (const key of [
      "id",
      "orderNumber",
      "batteryNumber",
      "status",
      "priority",
      "createdAt",
      "updatedAt",
    ]) {
      requiredString(row, key, endpoint, path);
    }
    requiredNullableString(row, "currentStage", endpoint, path);
  });

  const operatorActivity = arrayAt(
    required(root, "operatorActivity", endpoint, "$"),
    endpoint,
    "$.operatorActivity",
  );
  operatorActivity.forEach((entry, index) => {
    const path = `$.operatorActivity[${index}]`;
    const row = objectAt(entry, endpoint, path);
    requiredNullableString(row, "operatorName", endpoint, path);
    requiredNullableString(row, "stage", endpoint, path);
    requiredString(row, "lastActivity", endpoint, path);
    requiredNumber(row, "batteriesCompletedToday", endpoint, path);
  });

  const equipmentStatus = objectAt(
    required(root, "equipmentStatus", endpoint, "$"),
    endpoint,
    "$.equipmentStatus",
  );
  for (const group of ["chargers", "testEquipment"]) {
    const path = `$.equipmentStatus.${group}`;
    const equipment = objectAt(required(equipmentStatus, group, endpoint, "$.equipmentStatus"), endpoint, path);
    for (const key of ["total", "available", "busy", "maintenance"]) {
      requiredNumber(equipment, key, endpoint, path);
    }
  }

  const qualitySummary = objectAt(
    required(root, "qualitySummary", endpoint, "$"),
    endpoint,
    "$.qualitySummary",
  );
  for (const key of [
    "passRate",
    "rejectRate",
    "testPassCount",
    "testFailCount",
    "sampleCount",
  ]) {
    requiredNumber(qualitySummary, key, endpoint, "$.qualitySummary");
  }

  const logistics = objectAt(required(root, "logistics", endpoint, "$"), endpoint, "$.logistics");
  for (const key of ["readyForDispatch", "inTransit", "deliveredToday", "totalDealers"]) {
    requiredNumber(logistics, key, endpoint, "$.logistics");
  }

  const cellInventory = objectAt(
    required(root, "cellInventory", endpoint, "$"),
    endpoint,
    "$.cellInventory",
  );
  for (const key of [
    "total",
    "received",
    "grading",
    "approved",
    "reserved",
    "allocated",
    "rejected",
    "quarantine",
  ]) {
    requiredNumber(cellInventory, key, endpoint, "$.cellInventory");
  }

  const orderStats = objectAt(required(root, "orderStats", endpoint, "$"), endpoint, "$.orderStats");
  for (const key of ["total", "inProgress", "completed", "draft"]) {
    requiredNumber(orderStats, key, endpoint, "$.orderStats");
  }
}

function findEvidenceResponse(
  evidence: JsonObject,
  endpoint: string,
): unknown {
  const cases = arrayAt(evidence.cases, "evidence", "$.cases");
  const match = cases.find((entry) => {
    if (!isObject(entry)) return false;
    return (
      entry.method === "GET" &&
      entry.http_status === 200 &&
      typeof entry.path === "string" &&
      entry.path.split("?")[0] === endpoint &&
      isObject(entry.response_body)
    );
  });
  if (!match || !isObject(match)) {
    throw new Error(`[${endpoint}] no successful GET response found in ${EVIDENCE_PATH}`);
  }
  return match.response_body;
}

async function main(): Promise<void> {
  const evidence = JSON.parse(await readFile(EVIDENCE_PATH, "utf8")) as unknown;
  const root = objectAt(evidence, "evidence", "$");

  validateProductionReport(findEvidenceResponse(root, ENDPOINTS.production));
  validateDirectorDashboard(findEvidenceResponse(root, ENDPOINTS.dashboard));

  console.log(
    JSON.stringify(
      {
        result: "PASS",
        source: EVIDENCE_PATH,
        endpoints: [ENDPOINTS.production, ENDPOINTS.dashboard],
        contract: "required consumer fields and primitive/array/object types; additional fields allowed",
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    `✗ report response shape contract failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});