#!/usr/bin/env tsx
/**
 * FAT preflight drift certification.
 *
 * Each case changes one controlled FAT anchor, runs the same preflight command
 * used before FAT, and restores that anchor before the next case. The suite
 * owns only the FAT-E2E-* namespace and tears it down even when a case fails.
 *
 * Run with:
 *   FAT_TEST_PASSWORD='provided out of band' pnpm test:fat:preflight-drift
 */

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pool } from "@workspace/db";
import {
  FAT_FIXTURE_CONTRACT,
  FAT_IDS,
  FAT_PREFIX,
  assertNoResiduals,
  teardownFatDataset,
  type SqlClient,
} from "./fat-fixture-manifest";

type PreflightReport = {
  state?: string;
  passwordEvidence?: string;
  groups?: Array<{ group: string; failed: number }>;
  failures?: Array<{ group: string; name: string }>;
};

type Mutation = {
  name: string;
  expectedGroup: string;
  apply(client: SqlClient): Promise<void>;
  restore(client: SqlClient): Promise<void>;
};

const workspaceRoot = resolve(process.cwd());
const password = process.env.FAT_TEST_PASSWORD;
const preflightCommand = ["--filter", "@workspace/api-server", "run", "cert:fat:preflight"];

function queryResult(reportText: string): PreflightReport {
  const start = reportText.indexOf("{");
  const end = reportText.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("preflight returned no report");
  return JSON.parse(reportText.slice(start, end + 1)) as PreflightReport;
}

function runPreflight(): PreflightReport {
  const result = spawnSync("pnpm", preflightCommand, {
    cwd: workspaceRoot,
    env: process.env,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  const combinedOutput = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (password && combinedOutput.includes(password)) {
    throw new Error("preflight output contained the supplied password");
  }
  return queryResult(String(result.stdout ?? ""));
}

function assertDrift(report: PreflightReport, expectedGroup: string, mutationName: string): void {
  if (report.state !== "drift") {
    throw new Error(`${mutationName}: expected drift state, got ${String(report.state)}`);
  }
  const group = report.groups?.find((candidate) => candidate.group === expectedGroup);
  if (!group || group.failed < 1) {
    throw new Error(`${mutationName}: expected a failed ${expectedGroup} group`);
  }
  if (!report.failures?.some((failure) => failure.group === expectedGroup)) {
    throw new Error(`${mutationName}: report did not identify a ${expectedGroup} failure`);
  }
  if (report.passwordEvidence !== "omitted; supplied only through FAT_TEST_PASSWORD") {
    throw new Error(`${mutationName}: password evidence was not redacted`);
  }
}

const mutations: Mutation[] = [
  {
    name: "inactive auth account",
    expectedGroup: "auth",
    async apply(client) {
      await client.query("UPDATE users SET is_active = false WHERE id = $1", [FAT_IDS.users.owner]);
    },
    async restore(client) {
      await client.query("UPDATE users SET is_active = true WHERE id = $1", [FAT_IDS.users.owner]);
    },
  },
  {
    name: "inactive dealer",
    expectedGroup: "dealer",
    async apply(client) {
      await client.query("UPDATE logistics_dealers SET status = 'inactive' WHERE id = $1", [FAT_IDS.dealer]);
    },
    async restore(client) {
      await client.query("UPDATE logistics_dealers SET status = 'active' WHERE id = $1", [FAT_IDS.dealer]);
    },
  },
  {
    name: "changed stage anchor",
    expectedGroup: "stage",
    async apply(client) {
      await client.query(
        `UPDATE mfg_order_stages
         SET stage_type = 'packing'
         WHERE production_order_id = $1 AND stage_order = 1`,
        [FAT_IDS.orders.clean],
      );
    },
    async restore(client) {
      await client.query(
        `UPDATE mfg_order_stages
         SET stage_type = $2
         WHERE production_order_id = $1 AND stage_order = 1`,
        [FAT_IDS.orders.clean, FAT_FIXTURE_CONTRACT.stages.canonical[0]],
      );
    },
  },
  {
    name: "changed ledger quantity",
    expectedGroup: "ledger",
    async apply(client) {
      const result = await client.query(
        `UPDATE inventory_transactions
         SET quantity = quantity - 1
         WHERE id = (
           SELECT id FROM inventory_transactions
           WHERE material_id = $1 AND source_document_id = $2 AND stock_state = 'available'
           ORDER BY id LIMIT 1
         )
         RETURNING id`,
        [FAT_IDS.masters.materialCell, FAT_IDS.procurement.inspection],
      );
      if (result.rows.length !== 1) throw new Error("changed ledger quantity: controlled available transaction was not found");
    },
    async restore(client) {
      await client.query(
        `UPDATE inventory_transactions
         SET quantity = quantity + 1
         WHERE id = (
           SELECT id FROM inventory_transactions
           WHERE material_id = $1 AND source_document_id = $2 AND stock_state = 'available'
           ORDER BY id LIMIT 1
         )`,
        [FAT_IDS.masters.materialCell, FAT_IDS.procurement.inspection],
      );
    },
  },
  {
    name: "moved genealogy row",
    expectedGroup: "genealogy",
    async apply(client) {
      await client.query(
        `UPDATE mfg_battery_genealogy
         SET production_order_id = $1
         WHERE id = (
           SELECT id FROM mfg_battery_genealogy
           WHERE production_order_id = $2
           ORDER BY id LIMIT 1
         )`,
        [FAT_IDS.orders.completion, FAT_IDS.orders.clean],
      );
    },
    async restore(client) {
      await client.query(
        `UPDATE mfg_battery_genealogy
         SET production_order_id = $1
         WHERE id = (
           SELECT id FROM mfg_battery_genealogy
           WHERE production_order_id = $2
           ORDER BY id DESC LIMIT 1
         )`,
        [FAT_IDS.orders.clean, FAT_IDS.orders.completion],
      );
    },
  },
  {
    name: "changed dispatch snapshot",
    expectedGroup: "dispatch",
    async apply(client) {
      await client.query(
        "UPDATE dispatches SET dealer_name = 'FAT E2E Drift' WHERE id = $1",
        [FAT_IDS.fulfillment.dispatch],
      );
    },
    async restore(client) {
      await client.query("UPDATE dispatches SET dealer_name = $2 WHERE id = $1", [
        FAT_IDS.fulfillment.dispatch,
        FAT_FIXTURE_CONTRACT.fulfillment.dealerSnapshot.name,
      ]);
    },
  },
  {
    name: "changed registration owner",
    expectedGroup: "registration",
    async apply(client) {
      await client.query("UPDATE customer_registrations SET customer_name = 'FAT E2E Drift' WHERE id = $1", [FAT_IDS.fulfillment.registration]);
    },
    async restore(client) {
      await client.query("UPDATE customer_registrations SET customer_name = $2 WHERE id = $1", [
        FAT_IDS.fulfillment.registration,
        FAT_FIXTURE_CONTRACT.fulfillment.customerName,
      ]);
    },
  },
  {
    name: "changed warranty term",
    expectedGroup: "warranty",
    async apply(client) {
      await client.query("UPDATE warranties SET period_months = 59 WHERE id = $1", [FAT_IDS.fulfillment.warranty]);
    },
    async restore(client) {
      await client.query("UPDATE warranties SET period_months = $2 WHERE id = $1", [
        FAT_IDS.fulfillment.warranty,
        FAT_FIXTURE_CONTRACT.fulfillment.warrantyPeriodMonths,
      ]);
    },
  },
  {
    name: "unavailable concurrency charger",
    expectedGroup: "concurrency",
    async apply(client) {
      await client.query("UPDATE mfg_charger_units SET status = 'maintenance' WHERE id = $1", [FAT_IDS.chargers.primary]);
    },
    async restore(client) {
      await client.query("UPDATE mfg_charger_units SET status = 'available' WHERE id = $1", [FAT_IDS.chargers.primary]);
    },
  },
];

async function seedNamespace(): Promise<void> {
  const result = spawnSync("pnpm", ["--filter", "@workspace/api-server", "run", "cert:fat:seed"], {
    cwd: workspaceRoot,
    env: process.env,
    encoding: "utf8",
    stdio: "pipe",
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error("FAT namespace seed failed; see the password-free seed error above");
  }
}

async function cleanNamespace(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await teardownFatDataset(client);
    await assertNoResiduals(client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  if (!password || password.length < 8) {
    throw new Error("FAT_TEST_PASSWORD must be supplied out of band and contain at least 8 characters");
  }

  let testError: unknown;
  let cleanupError: unknown;
  try {
    await seedNamespace();
    const client = await pool.connect();
    try {
      for (const mutation of mutations) {
        await mutation.apply(client);
        try {
          const report = runPreflight();
          assertDrift(report, mutation.expectedGroup, mutation.name);
          console.log(`[PASS] ${mutation.name} -> ${mutation.expectedGroup}`);
        } finally {
          await mutation.restore(client);
        }
      }
    } finally {
      client.release();
    }
  } catch (error) {
    testError = error;
  } finally {
    try {
      await cleanNamespace();
    } catch (error) {
      cleanupError = error;
    }
  }

  if (cleanupError) throw cleanupError;
  if (testError) throw testError;
  console.log(`FAT preflight drift coverage passed: ${mutations.length} controlled anchor mutations`);
}

main()
  .catch((error) => {
    console.error("FAT preflight drift suite failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });