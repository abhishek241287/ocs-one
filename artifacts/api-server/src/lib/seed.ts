import bcrypt from "bcryptjs";
import { db, pool, usersTable, cellGradeConfigTable } from "@workspace/db";
import { logger } from "./logger";

export async function seedDatabase(): Promise<void> {
  // Create sequences used for race-condition-safe order number generation
  await pool.query(`
    CREATE SEQUENCE IF NOT EXISTS mfg_order_seq START 1 INCREMENT 1;
    CREATE SEQUENCE IF NOT EXISTS mfg_battery_seq START 1 INCREMENT 1;
  `);

  // Ensure the singleton grade-config row exists so reads (GET /cells/config)
  // never need to perform a write. Schema defaults populate the values.
  await db
    .insert(cellGradeConfigTable)
    .values({ id: 1 })
    .onConflictDoNothing({ target: cellGradeConfigTable.id });

  // Seed default director account if no users exist
  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .limit(1);

  if (!existing) {
    const email = process.env.ADMIN_EMAIL ?? "admin@ocs.local";
    const password = process.env.ADMIN_PASSWORD ?? "OCS@Admin2026!";
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
