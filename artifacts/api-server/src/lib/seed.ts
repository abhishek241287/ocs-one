import bcrypt from "bcryptjs";
import {
  db,
  pool,
  usersTable,
  cellGradeConfigTable,
  productCategoriesTable,
  productWorkflowsTable,
} from "@workspace/db";
import { logger } from "./logger";

// The seed default admin password. Exported so SS-04 (config-integrity) can
// detect — without ever logging the value — whether this known default is still
// in use, and fail certification in production if so.
export const DEFAULT_ADMIN_PASSWORD = "OCS@Admin2026!";

export async function seedDatabase(): Promise<void> {
  // Create sequences used for race-condition-safe order number generation
  await pool.query(`
    CREATE SEQUENCE IF NOT EXISTS mfg_order_seq START 1 INCREMENT 1;
    CREATE SEQUENCE IF NOT EXISTS mfg_battery_seq START 1 INCREMENT 1;
    -- ECF: global monotonic counter for the human Correction ID (CORR-YYYYMMDD-NNNNNN).
    CREATE SEQUENCE IF NOT EXISTS ecf_correction_seq START 1 INCREMENT 1;
  `);

  // Ensure the singleton grade-config row exists so reads (GET /cells/config)
  // never need to perform a write. Schema defaults populate the values.
  await db
    .insert(cellGradeConfigTable)
    .values({ id: 1 })
    .onConflictDoNothing({ target: cellGradeConfigTable.id });

  // ── Unified Product Platform masters (idempotent) ──────────────────────────
  // Category master: all three categories are seeded as data; only Battery Pack
  // is exercised in CW-03 (Inbuilt Lithium / Hybrid are reserved for later waves).
  await db
    .insert(productCategoriesTable)
    .values([
      { code: "BATTERY_PACK", name: "Battery Pack", status: "active" },
      { code: "INBUILT_LITHIUM_INVERTER", name: "Inbuilt Lithium Inverter", status: "inactive" },
      { code: "HYBRID_INVERTER", name: "Hybrid Inverter", status: "inactive" },
    ])
    .onConflictDoNothing({ target: productCategoriesTable.code });

  // Workflow master: BATTERY is active and carries the canonical 9-stage sequence
  // (DATA, not wired to any engine in CW-03 — the workflow-driven stage engine is
  // UPP Phase 3). INBUILT_LITHIUM / HYBRID are reserved data only (inactive).
  await db
    .insert(productWorkflowsTable)
    .values([
      {
        code: "BATTERY",
        name: "Battery Pack Manufacturing",
        status: "active",
        stageSequence: [
          "cell_allocation",
          "assembly",
          "compression",
          "bms_allocation",
          "bms_programming",
          "charging",
          "testing",
          "quality_control",
          "packing",
        ],
      },
      { code: "INBUILT_LITHIUM", name: "Inbuilt Lithium Inverter Manufacturing", status: "inactive", stageSequence: [] },
      { code: "HYBRID", name: "Hybrid Inverter Manufacturing", status: "inactive", stageSequence: [] },
    ])
    .onConflictDoNothing({ target: productWorkflowsTable.code });

  // Seed default director account if no users exist
  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .limit(1);

  if (!existing) {
    const email = process.env.ADMIN_EMAIL ?? "admin@ocs.local";
    const password = process.env.ADMIN_PASSWORD ?? DEFAULT_ADMIN_PASSWORD;
    const passwordHash = await bcrypt.hash(password, 12);

    await db.insert(usersTable).values({
      email,
      passwordHash,
      name: "System Administrator",
      role: "director",
    });

    logger.warn(
      { email },
      "Seeded default admin user. Set ADMIN_EMAIL and ADMIN_PASSWORD env vars and change the password immediately."
    );

    if (!process.env.ADMIN_PASSWORD) {
      logger.warn(
        "⚠️  ADMIN_PASSWORD not set — default password in use. This must be changed before production."
      );
    }
  }
}
