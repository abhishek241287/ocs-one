import { eq } from "drizzle-orm";
import { db, mfgProductionOrdersTable } from "@workspace/db";
import { createProductFromOrder } from "./product-creation";
import { logger } from "./logger";

export interface BackfillReport {
  scanned: number;
  created: number;
  existed: number;
  skipped: number;
  skippedDetail: { orderId: string; reason: string }[];
}

/**
 * Idempotent backfill: ensure every order that has already passed QC (status
 * `completed`) has a serialized Product, using the SAME generic creation engine
 * as the live QC-PASS hook (single source of truth for the rules).
 *
 * Safe to run on every startup — orders that already have a Product return
 * `exists` and write nothing; model-less orders are skipped-and-reported rather
 * than producing an identity-incomplete Product.
 */
export async function backfillProducts(): Promise<BackfillReport> {
  const orders = await db
    .select({ id: mfgProductionOrdersTable.id })
    .from(mfgProductionOrdersTable)
    .where(eq(mfgProductionOrdersTable.status, "completed"));

  const report: BackfillReport = {
    scanned: orders.length,
    created: 0,
    existed: 0,
    skipped: 0,
    skippedDetail: [],
  };

  for (const order of orders) {
    // Each order in its own transaction so one skip/failure never rolls back the
    // Products already created in this run.
    const result = await db.transaction((tx) =>
      createProductFromOrder(tx, order.id, "system:backfill"),
    );
    if (result.status === "created") report.created += 1;
    else if (result.status === "exists") report.existed += 1;
    else {
      report.skipped += 1;
      report.skippedDetail.push({ orderId: order.id, reason: result.reason });
    }
  }

  if (report.scanned > 0) {
    logger.info(
      {
        scanned: report.scanned,
        created: report.created,
        existed: report.existed,
        skipped: report.skipped,
      },
      "UPP product backfill complete",
    );
    if (report.skipped > 0) {
      logger.warn(
        { skipped: report.skippedDetail },
        "UPP product backfill skipped orders (reported, not created)",
      );
    }
  }

  return report;
}
