#!/usr/bin/env tsx
/**
 * QA Dataset Seed — FAT Blocker Verification
 *
 * Creates the controlled dataset needed to exercise the four data-dependent
 * scenarios that were previously skipped in fat-blocker-suite.ts:
 *
 *   C1  — Dealer A vs Dealer B cross-access isolation
 *   H11 — Lot traceability (in-progress order with no MIN)
 *   H14 — Order completion idempotency (completed order)
 *   H17 — Concurrent charger reservation (2 orders + 1 available charger)
 *
 * All seeded rows carry the QA-FAT prefix for easy identification.
 * Run before fat-blocker-suite.ts. Safe to re-run (idempotent).
 */

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";

// ─── Stable UUIDs for QA fixtures ────────────────────────────────────────────
// Using valid UUID v4 format (3rd group starts 4, 4th group starts 8/9/a/b).

export const QA = {
  DEALER_A_ID: "a0a00000-fa01-4000-8001-000000000aa1",
  DEALER_B_ID: "b0b00000-fb01-4000-8001-000000000bb2",
  CHARGER_H17_ID: "c17c0000-f001-4000-8001-000000c17001",
  ORDER_H11_ID: "d1100000-f011-4000-8001-000000d11001",
  ORDER_H14_ID: "d1400000-f014-4000-8001-000000d14001",
  ORDER_H17_1_ID: "d1700000-f017-4000-8001-000000d17001",
  ORDER_H17_2_ID: "d1700000-f017-4000-8001-000000d17002",
  DEALER_USER_EMAIL: "qa.dealer.a@qa.local",
  DEALER_USER_NAME: "QA FAT Dealer Alpha User",
  /** Password used when logging in as the QA dealer user in the cert suite. */
  DEALER_USER_PASSWORD: "QADlr#2026!",
} as const;

// Stage sequence with the correct ordering integers.
const ALL_STAGES = [
  { type: "cell_allocation",  order: 1 },
  { type: "assembly",         order: 2 },
  { type: "compression",      order: 3 },
  { type: "bms_allocation",   order: 4 },
  { type: "bms_programming",  order: 5 },
  { type: "charging",         order: 6 },
  { type: "testing",          order: 7 },
  { type: "quality_control",  order: 8 },
  { type: "packing",          order: 9 },
] as const;

async function main() {
  console.log("═".repeat(72));
  console.log("QA Seed — FAT Blocker Dataset");
  console.log("═".repeat(72));

  // ── 1. Dealers ─────────────────────────────────────────────────────────────
  await db.execute(sql`
    INSERT INTO logistics_dealers
      (id, dealer_code, dealer_name, address, status, created_at, updated_at)
    VALUES
      (${QA.DEALER_A_ID}, 'QA-FAT-DLR-A', 'QA FAT Dealer Alpha',
       '1 Alpha Street, QA City', 'active', NOW(), NOW()),
      (${QA.DEALER_B_ID}, 'QA-FAT-DLR-B', 'QA FAT Dealer Beta',
       '2 Beta Street, QA City',  'active', NOW(), NOW())
    ON CONFLICT (dealer_code) DO UPDATE
      SET dealer_name = EXCLUDED.dealer_name,
          status      = 'active',
          updated_at  = NOW()
  `);
  console.log("  ✓ Dealers A and B upserted");

  // ── 2. Charger unit for H17 (always reset to available) ────────────────────
  await db.execute(sql`
    INSERT INTO mfg_charger_units
      (id, charger_code, model, manufacturer, serial_number,
       status, current_order_id, created_at, updated_at)
    VALUES
      (${QA.CHARGER_H17_ID}, 'QA-CHG-H17-001', 'QA-Charger-3000', 'QA Industries',
       'QA-SN-CHG-H17-001', 'available', NULL, NOW(), NOW())
    ON CONFLICT (charger_code) DO UPDATE
      SET status           = 'available',
          current_order_id = NULL,
          updated_at       = NOW()
  `);
  console.log("  ✓ Charger unit QA-CHG-H17-001 (available)");

  // ── 3. Production orders ────────────────────────────────────────────────────
  await db.execute(sql`
    INSERT INTO mfg_production_orders
      (id, order_number, battery_number, factory_manager,
       status, current_stage, created_at, updated_at)
    VALUES
      -- H11: in_progress order with no product_id (no BOM → non-500 validation)
      (${QA.ORDER_H11_ID}, 'QA-ORD-H11-001', 'QA-BATT-H11-001', 'QA Manager',
       'in_progress', 'assembly', NOW(), NOW()),

      -- H14: completed order (for idempotency GET test)
      (${QA.ORDER_H14_ID}, 'QA-ORD-H14-001', 'QA-BATT-H14-001', 'QA Manager',
       'completed', 'packing', NOW(), NOW()),

      -- H17 pair: in_progress orders at charging stage (stages seeded below)
      (${QA.ORDER_H17_1_ID}, 'QA-ORD-H17-001', 'QA-BATT-H17-001', 'QA Manager',
       'in_progress', 'charging', NOW(), NOW()),
      (${QA.ORDER_H17_2_ID}, 'QA-ORD-H17-002', 'QA-BATT-H17-002', 'QA Manager',
       'in_progress', 'charging', NOW(), NOW())
    ON CONFLICT (order_number) DO UPDATE
      SET status        = EXCLUDED.status,
          current_stage = EXCLUDED.current_stage,
          updated_at    = NOW()
  `);
  console.log("  ✓ Production orders upserted (H11, H14, H17-1, H17-2)");

  // ── 4. Stages for H17 orders ────────────────────────────────────────────────
  // Delete first (no unique constraint on (order, stage_type)) then re-insert.
  await db.execute(sql`
    DELETE FROM mfg_order_stages
    WHERE production_order_id IN (${QA.ORDER_H17_1_ID}, ${QA.ORDER_H17_2_ID})
  `);

  for (const orderId of [QA.ORDER_H17_1_ID, QA.ORDER_H17_2_ID]) {
    for (const s of ALL_STAGES) {
      // Stages 1-5 (cell_allocation → bms_programming) are approved so the
      // charging stage (6) can be started. Stages 6-9 remain pending.
      const status = s.order <= 5 ? "approved" : "pending";
      await db.execute(sql`
        INSERT INTO mfg_order_stages
          (production_order_id, stage_type, stage_order, status, created_at, updated_at)
        VALUES
          (${orderId},
           ${s.type}::mfg_stage_type,
           ${s.order},
           ${status}::mfg_stage_status,
           NOW(), NOW())
      `);
    }
  }
  console.log("  ✓ H17 stages (1-5 approved, 6-9 pending) inserted for both orders");

  // ── 5. Dealer-role user linked to Dealer A ──────────────────────────────────
  const existing = await db.execute(sql`
    SELECT id FROM users WHERE email = ${QA.DEALER_USER_EMAIL} LIMIT 1
  `);
  if (existing.rows.length === 0) {
    const hash = await bcrypt.hash(QA.DEALER_USER_PASSWORD, 12);
    await db.execute(sql`
      INSERT INTO users
        (name, email, password_hash, role, dealer_id, is_active, created_at, updated_at)
      VALUES
        (${QA.DEALER_USER_NAME}, ${QA.DEALER_USER_EMAIL}, ${hash},
         'dealer', ${QA.DEALER_A_ID}, true, NOW(), NOW())
    `);
    console.log("  ✓ Dealer user created:", QA.DEALER_USER_EMAIL);
  } else {
    // User exists — ensure dealer_id points to Dealer A (idempotent reset).
    await db.execute(sql`
      UPDATE users
      SET dealer_id  = ${QA.DEALER_A_ID},
          is_active  = true,
          updated_at = NOW()
      WHERE email = ${QA.DEALER_USER_EMAIL}
    `);
    console.log("  ✓ Dealer user exists — dealer_id reset to Dealer A");
  }

  // ── 6. Verification summary ─────────────────────────────────────────────────
  const summary = await db.execute(sql`
    SELECT
      (SELECT count(*) FROM logistics_dealers
       WHERE dealer_code LIKE 'QA-FAT-%')              AS dealers,
      (SELECT count(*) FROM mfg_charger_units
       WHERE charger_code = 'QA-CHG-H17-001')          AS chargers,
      (SELECT count(*) FROM mfg_production_orders
       WHERE order_number LIKE 'QA-ORD-%')             AS orders,
      (SELECT count(*) FROM mfg_order_stages mos
       JOIN mfg_production_orders mpo
         ON mpo.id = mos.production_order_id
       WHERE mpo.order_number LIKE 'QA-ORD-H17-%')     AS h17_stages,
      (SELECT count(*) FROM users
       WHERE email = ${QA.DEALER_USER_EMAIL})           AS dealer_users
  `);
  const s = summary.rows[0] as Record<string, unknown>;
  console.log("\n  Verification:");
  console.log(`    Dealers:      ${s.dealers} (expect 2)`);
  console.log(`    Chargers:     ${s.chargers} (expect 1)`);
  console.log(`    Orders:       ${s.orders}   (expect 4)`);
  console.log(`    H17 stages:   ${s.h17_stages} (expect 18 = 2×9)`);
  console.log(`    Dealer users: ${s.dealer_users} (expect 1)`);

  console.log("\n═".repeat(72));
  console.log("Seed complete. Run fat-blocker-suite.ts next.");
  console.log("═".repeat(72));
  process.exit(0);
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
