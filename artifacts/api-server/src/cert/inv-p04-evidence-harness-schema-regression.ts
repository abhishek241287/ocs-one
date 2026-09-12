#!/usr/bin/env tsx
/**
 * Static guard for INV-P04 and related certification harness SQL.
 *
 * Cell lots point to material transfers through cell_lots.transfer_id. The
 * source GRN line lives on material_transfers.grn_line_id; cell_lots does not
 * have a grn_line_id column. This check prevents future certification
 * harnesses from encoding invalid direct column references. Cell-lot timeline
 * events are ordered by performed_at and id; cell_lot_events.created_at does
 * not exist.
 */

import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CERT_DIR = dirname(fileURLToPath(import.meta.url));
const INVALID_CELL_LOT_SOURCE_PATTERNS = [
  /\bcell_lots\s*\.\s*grn_line_id\b/i,
  /\bfrom\s+cell_lots(?:\s+(?:as\s+)?[a-z_][a-z0-9_]*)?\s+where\s+(?:[a-z_][a-z0-9_]*\.)?grn_line_id\b/i,
];
const INVALID_CELL_LOT_EVENT_TIMESTAMP_PATTERNS = [
  /\bcell_lot_events\s*\.\s*created_at\b/i,
  /\bfrom\s+cell_lot_events(?:\s+(?:as\s+)?[a-z_][a-z0-9_]*)?[\s\S]{0,300}\border\s+by\s+[a-z_][a-z0-9_]*\s*\.\s*created_at\b/i,
];

async function main(): Promise<void> {
  const entries = await readdir(CERT_DIR, { withFileTypes: true });
  const certificationSources = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        extname(entry.name) === ".ts" &&
        entry.name !== "inv-p04-evidence-harness-schema-regression.ts",
    )
    .map((entry) => entry.name)
    .sort();
  const violations: string[] = [];

  for (const fileName of certificationSources) {
    const filePath = join(CERT_DIR, fileName);
    const source = await readFile(filePath, "utf8");
    for (const pattern of [
      ...INVALID_CELL_LOT_SOURCE_PATTERNS,
      ...INVALID_CELL_LOT_EVENT_TIMESTAMP_PATTERNS,
    ]) {
      if (pattern.test(source)) {
        violations.push(`${fileName}: ${pattern}`);
      }
    }
  }

  if (violations.length > 0) {
    throw new Error(
      `Invalid cell-lot source-line reference found in certification harness SQL:\n${violations.join("\n")}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        result: "PASS",
        scanned_files: certificationSources.length,
        canonical_relationship: "cell_lots.transfer_id -> material_transfers.id -> material_transfers.grn_line_id",
        event_order: "cell_lot_events.performed_at, cell_lot_events.id",
        invalid_references: ["cell_lots.grn_line_id", "cell_lot_events.created_at"],
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    `✗ INV-P04 evidence-harness schema regression failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});