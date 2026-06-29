import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import {
  db,
  pool,
  usersTable,
  cellGradeConfigTable,
  productCategoriesTable,
  productWorkflowsTable,
  materialCategoriesTable,
  materialWorkflowsTable,
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
    -- Inventory: race-safe GRN number generation (GRN-YYYYMMDD-NNNN).
    CREATE SEQUENCE IF NOT EXISTS grn_seq START 1 INCREMENT 1;
    -- Inventory: race-safe Incoming Inspection number (INSP-YYYYMMDD-NNNN).
    CREATE SEQUENCE IF NOT EXISTS incoming_inspection_seq START 1 INCREMENT 1;
    -- Fulfillment: race-safe Dispatch number (DIS-YYYYMMDD-NNNNNN).
    CREATE SEQUENCE IF NOT EXISTS dispatch_seq START 1 INCREMENT 1;
  `);

  // Forward-only resync of each id sequence to the max value already persisted in
  // its table. Every business id (PO-/BAT-/CORR-YYYYMMDD-NNNNNN) embeds the raw
  // padded sequence value, and each backing column is UNIQUE. A checkpoint
  // rollback or DB restore can reset a sequence BELOW its table's max (the table
  // rows survive, the sequence counter does not) — then nextval() mints a
  // DUPLICATE id and the unique constraint throws 23505 (surfaced as HTTP 409),
  // crashing the very first insert (e.g. cell grading via the ECF ledger). We
  // never move a sequence backward: a fresh DB (empty table, m=0) keeps id 1, and
  // setval(max, true) makes the next nextval = max+1, which is provably unused
  // because max is the current maximum. The regex guard skips any malformed
  // legacy value so a stray id can never crash startup.
  await pool.query(`
    DO $$
    DECLARE m bigint;
    BEGIN
      SELECT COALESCE(MAX(split_part(order_number, '-', 3)::bigint), 0) INTO m
        FROM mfg_production_orders WHERE order_number ~ '^[A-Za-z]+-[0-9]{8}-[0-9]+$';
      IF m > 0 THEN
        PERFORM setval('mfg_order_seq', GREATEST((SELECT last_value FROM mfg_order_seq), m), true);
      END IF;

      SELECT COALESCE(MAX(split_part(battery_number, '-', 3)::bigint), 0) INTO m
        FROM mfg_production_orders WHERE battery_number ~ '^[A-Za-z]+-[0-9]{8}-[0-9]+$';
      IF m > 0 THEN
        PERFORM setval('mfg_battery_seq', GREATEST((SELECT last_value FROM mfg_battery_seq), m), true);
      END IF;

      SELECT COALESCE(MAX(split_part(correction_id, '-', 3)::bigint), 0) INTO m
        FROM engineering_corrections WHERE correction_id ~ '^[A-Za-z]+-[0-9]{8}-[0-9]+$';
      IF m > 0 THEN
        PERFORM setval('ecf_correction_seq', GREATEST((SELECT last_value FROM ecf_correction_seq), m), true);
      END IF;

      SELECT COALESCE(MAX(split_part(grn_number, '-', 3)::bigint), 0) INTO m
        FROM grn_headers WHERE grn_number ~ '^[A-Za-z]+-[0-9]{8}-[0-9]+$';
      IF m > 0 THEN
        PERFORM setval('grn_seq', GREATEST((SELECT last_value FROM grn_seq), m), true);
      END IF;

      SELECT COALESCE(MAX(split_part(inspection_number, '-', 3)::bigint), 0) INTO m
        FROM incoming_inspections WHERE inspection_number ~ '^[A-Za-z]+-[0-9]{8}-[0-9]+$';
      IF m > 0 THEN
        PERFORM setval('incoming_inspection_seq', GREATEST((SELECT last_value FROM incoming_inspection_seq), m), true);
      END IF;

      SELECT COALESCE(MAX(split_part(dispatch_number, '-', 3)::bigint), 0) INTO m
        FROM dispatches WHERE dispatch_number ~ '^[A-Za-z]+-[0-9]{8}-[0-9]+$';
      IF m > 0 THEN
        PERFORM setval('dispatch_seq', GREATEST((SELECT last_value FROM dispatch_seq), m), true);
      END IF;
    END $$;
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
  // `productCreationTrigger` is platform config (workflow-driven Product creation),
  // so re-seeding reasserts the canonical trigger per workflow via onConflictDoUpdate
  // (from `excluded`) — this also corrects pre-existing rows (e.g. HYBRID) without
  // touching director-editable name/status/stageSequence.
  await db
    .insert(productWorkflowsTable)
    .values([
      {
        code: "BATTERY",
        name: "Battery Pack Manufacturing",
        status: "active",
        productCreationTrigger: "QC_PASS",
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
      { code: "INBUILT_LITHIUM", name: "Inbuilt Lithium Inverter Manufacturing", status: "inactive", productCreationTrigger: "QC_PASS", stageSequence: [] },
      { code: "HYBRID", name: "Hybrid Inverter Manufacturing", status: "inactive", productCreationTrigger: "INCOMING_INSPECTION_PASS", stageSequence: [] },
    ])
    .onConflictDoUpdate({
      target: productWorkflowsTable.code,
      set: { productCreationTrigger: sql`excluded.product_creation_trigger` },
    });

  // ── Inventory Platform: Material Category lookup (idempotent) ──────────────
  // Seeded as DATA so receiving/inspection have categories on a fresh DB; a
  // director can add more live via the Material Category master. onConflictDoNothing
  // preserves any director edits (name/status) on re-seed.
  await db
    .insert(materialCategoriesTable)
    .values([
      { code: "LIFEPO4_CELL", name: "LiFePO4 Cell", status: "active" },
      { code: "EMPTY_INBUILT_LITHIUM_INVERTER", name: "Empty Inbuilt Lithium Inverter", status: "active" },
      { code: "HYBRID_INVERTER", name: "Hybrid Inverter", status: "active" },
      { code: "PCB", name: "PCB", status: "active" },
      { code: "BMS", name: "BMS", status: "active" },
      { code: "CHARGER", name: "Charger", status: "active" },
      { code: "CONNECTOR", name: "Connector", status: "active" },
      { code: "CABLE", name: "Cable", status: "active" },
      { code: "PACKING_MATERIAL", name: "Packing Material", status: "active" },
      { code: "ACCESSORIES", name: "Accessories", status: "active" },
    ])
    .onConflictDoNothing({ target: materialCategoriesTable.code });

  // ── Inventory Platform: Material Workflows (idempotent) ───────────────────
  // Mirror the Product Workflow master. Two workflows cover the v1 routing model.
  // `postReceiptAction` is platform config (it drives behavioral dispatch in the GRN
  // posting engine), so re-seeding reasserts the canonical action via onConflictDoUpdate
  // (from `excluded`) without touching director-editable name/status.
  await db
    .insert(materialWorkflowsTable)
    .values([
      {
        code: "INCOMING_INSPECTION",
        name: "Incoming Inspection",
        status: "active",
        postReceiptAction: "INCOMING_INSPECTION",
      },
      {
        code: "DIRECT_TO_INVENTORY",
        name: "Direct to Inventory",
        status: "active",
        postReceiptAction: "DIRECT_TO_INVENTORY",
      },
    ])
    .onConflictDoUpdate({
      target: materialWorkflowsTable.code,
      set: { postReceiptAction: sql`excluded.post_receipt_action` },
    });

  // Default Material-Category → Workflow assignments (idempotent). Inspection-bearing
  // categories (cells, inverters, electronics) route through Incoming Inspection;
  // generic/consumable categories (connectors, cables, packing, accessories) go direct.
  // onConflictDoNothing preserves any director re-assignment on re-seed. Workflow
  // assignment is MANDATORY (CTO directive): a category left UNASSIGNED causes GRN
  // posting to FAIL with a clear error — the posting engine never assumes a default.
  await pool.query(`
    INSERT INTO material_workflow_assignments (category_id, workflow_id)
    SELECT c.id, w.id
    FROM (VALUES
      ('LIFEPO4_CELL', 'INCOMING_INSPECTION'),
      ('EMPTY_INBUILT_LITHIUM_INVERTER', 'INCOMING_INSPECTION'),
      ('HYBRID_INVERTER', 'INCOMING_INSPECTION'),
      ('PCB', 'INCOMING_INSPECTION'),
      ('BMS', 'INCOMING_INSPECTION'),
      ('CHARGER', 'INCOMING_INSPECTION'),
      ('CONNECTOR', 'DIRECT_TO_INVENTORY'),
      ('CABLE', 'DIRECT_TO_INVENTORY'),
      ('PACKING_MATERIAL', 'DIRECT_TO_INVENTORY'),
      ('ACCESSORIES', 'DIRECT_TO_INVENTORY')
    ) AS m(cat_code, wf_code)
    JOIN master_material_categories c ON c.code = m.cat_code
    JOIN material_workflows w ON w.code = m.wf_code
    ON CONFLICT (category_id) DO NOTHING;
  `);

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
