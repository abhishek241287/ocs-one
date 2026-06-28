// ─── SS-04 · Configuration Integrity Certification Suite ──────────────────────
// The configuration-side complement to SS-02 (authorization) and SS-03 (audit).
// Gathers a snapshot of every production configuration that affects security or
// manufacturing behaviour and runs the integrity rules from the shared single
// source of truth (lib/config-integrity.ts) — the same module the
// /developer/configuration dashboard renders, so the suite and dashboard cannot
// drift. Any FAIL (configuration drift = production defect) fails certification.
//
//   pnpm --filter @workspace/api-server run test:config
//
// Force-fail sanity check: temporarily break a config value (e.g. flip a grade
// threshold) and re-run — the suite must report drift and exit non-zero.

import { pool } from "@workspace/db";
import {
  gatherConfig,
  validateConfig,
  type ConfigCheck,
  type ConfigStatus,
} from "../lib/config-integrity";

const ICON: Record<ConfigStatus, string> = { pass: "✓", warn: "!", fail: "✗" };

async function main(): Promise<void> {
  console.log("\n─── SS-04 · Configuration Integrity Certification ───");

  const snapshot = await gatherConfig();
  const { checks, summary } = validateConfig(snapshot);

  const byGroup = new Map<string, ConfigCheck[]>();
  for (const c of checks) {
    const list = byGroup.get(c.group) ?? [];
    list.push(c);
    byGroup.set(c.group, list);
  }

  for (const [group, list] of byGroup) {
    console.log(`\n  ${group}`);
    for (const c of list) {
      console.log(`    [${ICON[c.status]}] ${c.label} — ${c.message}`);
      if (c.status !== "pass") {
        console.log(`        expected: ${c.expected}  ·  actual: ${c.actual}`);
      }
    }
  }

  console.log(
    `\n─── Summary: ${summary.passed} pass · ${summary.warnings} warn · ${summary.failed} fail (${summary.total} checks) ───`,
  );

  if (summary.drift) {
    console.error("\n✗ CONFIGURATION DRIFT DETECTED — SS-04 certification FAILED.\n");
  } else {
    console.log("\n✓ Configuration integrity verified — no drift. SS-04 PASS.\n");
  }

  await pool.end();
  process.exit(summary.drift ? 1 : 0);
}

main().catch(async (err) => {
  console.error("SS-04 suite crashed:", err);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
