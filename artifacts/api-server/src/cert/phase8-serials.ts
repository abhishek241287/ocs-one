#!/usr/bin/env tsx
/**
 * Batch 73-B permanent serial-index certification.
 *
 * This suite is intentionally additive and isolated. It exercises the shared
 * transaction writer and QR resolver directly, while 71-F covers the live W2
 * scan-confirm path and its direct-QR regression.
 */

import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  inventoryLotsTable,
  materialsTable,
  outboxEventsTable,
  pool,
  securityEventsTable,
} from "@workspace/db";
import { indexSerialInTx, SerialConflictError } from "../lib/serial-index";
import { decodePayload, resolveEntity } from "../lib/universal-capture/qr";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const prefix = `P73B-${randomUUID().slice(0, 8).toUpperCase()}`;
  const serials = [`${prefix}-GRN-001`, `${prefix}-GRN-002`, `${prefix}-GRN-003`];
  const scanSerial = `${prefix}-SCAN-001`;
  const outputSerial = `${prefix}-OUTPUT-001`;
  const sourceIds = [randomUUID(), randomUUID(), randomUUID()];
  const scanSourceId = randomUUID();
  const serialUnitIds: string[] = [];
  const fixtureOrderId = randomUUID();
  const fixtureProductId = randomUUID();
  let passed = 0;
  let outputFixture: { productId: string; productionOrderId: string };

  const [fixture] = await db
    .select({ materialId: materialsTable.id, lotId: inventoryLotsTable.id })
    .from(materialsTable)
    .leftJoin(inventoryLotsTable, eq(inventoryLotsTable.materialId, materialsTable.id))
    .limit(1);
  assert(fixture, "No material fixture is available for serial certification");

  const category = await pool.query<{ id: string }>(
    "SELECT id FROM product_categories WHERE code = 'BATTERY_PACK' LIMIT 1",
  );
  const model = await pool.query<{ id: string }>(
    "SELECT id FROM master_products ORDER BY created_at LIMIT 1",
  );
  const workflow = await pool.query<{ code: string }>(
    "SELECT code FROM product_workflows WHERE code = 'BATTERY' LIMIT 1",
  );
  assert(category.rows[0] && model.rows[0] && workflow.rows[0], "Product masters are unavailable for W3 certification");
  await pool.query(
    `INSERT INTO mfg_production_orders
      (id, order_number, battery_number, product_id, factory_manager, current_stage, status, priority, notes)
     VALUES ($1, $2, $3, $4, '73-B certification', 'quality_control', 'completed', 'low', $5)`,
    [fixtureOrderId, `${prefix}-ORDER`, outputSerial, model.rows[0].id, prefix],
  );
  await pool.query(
    `INSERT INTO products
      (id, category_id, model_id, workflow_code, source_production_order_id,
       official_product_serial, serial_source, qc_status, product_status,
       manufacturing_completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'OCS', 'passed', 'qc_passed', now())`,
    [
      fixtureProductId,
      category.rows[0].id,
      model.rows[0].id,
      workflow.rows[0].code,
      fixtureOrderId,
      outputSerial,
    ],
  );
  outputFixture = { productId: fixtureProductId, productionOrderId: fixtureOrderId };

  try {
    await db.transaction(async (tx) => {
      for (let index = 0; index < serials.length; index += 1) {
        const result = await indexSerialInTx(tx, {
          serialNumber: serials[index]!,
          materialId: fixture.materialId,
          lotId: fixture.lotId ?? null,
          sourceDocumentType: "grn_line",
          sourceDocumentId: sourceIds[index]!,
        });
        assert(result.status === "created", `S-01 did not create ${serials[index]}`);
        serialUnitIds.push(result.id);
      }
      passed += 1; // S-01 W1 provenance

      const scanResult = await indexSerialInTx(tx, {
        serialNumber: scanSerial,
        materialId: fixture.materialId,
        lotId: fixture.lotId ?? null,
        sourceDocumentType: "scan_session",
        sourceDocumentId: scanSourceId,
      });
      assert(scanResult.status === "created", "S-02 W2 serial was not indexed");
      serialUnitIds.push(scanResult.id);
      passed += 1;

      const outputResult = await indexSerialInTx(tx, {
        serialNumber: outputSerial,
        materialId: fixture.materialId,
        lotId: null,
        productionOrderId: outputFixture.productionOrderId,
        productId: outputFixture.productId,
        sourceDocumentType: "product",
        sourceDocumentId: outputFixture.productId,
      });
      assert(outputResult.status === "created", "S-03 W3 output serial was not indexed");
      serialUnitIds.push(outputResult.id);
      passed += 1;

      const replay = await indexSerialInTx(tx, {
        serialNumber: serials[0]!,
        materialId: fixture.materialId,
        lotId: fixture.lotId ?? null,
        sourceDocumentType: "grn_line",
        sourceDocumentId: sourceIds[0]!,
      });
      assert(replay.status === "existing", "S-06 same-source replay was not a no-op");
      passed += 1;
    });

    const decoded = decodePayload(JSON.stringify({ v: 1, entity: "serial", id: outputSerial }));
    assert(decoded.ok && decoded.entity === "serial" && decoded.id === outputSerial, "S-04 serial QR did not decode");
    const resolved = await resolveEntity("serial", outputSerial, db);
    assert(
      resolved.ok &&
        resolved.state === "RESOLVED" &&
        resolved.serialNumber === outputSerial &&
        resolved.productId === outputFixture.productId &&
        resolved.productionOrderId === outputFixture.productionOrderId,
      `S-04 serial QR context was incomplete: ${JSON.stringify(resolved)}`,
    );
    const unknown = await resolveEntity("serial", `${prefix}-UNKNOWN`, db);
    assert(!unknown.ok && unknown.state === "UNKNOWN", "S-04 unknown serial did not remain UNKNOWN");
    passed += 1;

    try {
      await db.transaction(async (tx) => {
        await indexSerialInTx(tx, {
          serialNumber: serials[0]!,
          materialId: fixture.materialId,
          lotId: fixture.lotId ? null : randomUUID(),
          sourceDocumentType: "scan_session",
          sourceDocumentId: randomUUID(),
        });
      });
      throw new Error("S-05 different lot did not raise SERIAL_CONFLICT");
    } catch (error) {
      assert(error instanceof SerialConflictError, `S-05 returned the wrong error: ${String(error)}`);
      assert(error.statusCode === 409 && error.code === "SERIAL_CONFLICT", "S-05 conflict contract was wrong");
    }
    passed += 1;

    const [outbox] = await db
      .select({ count: sql<number>`count(*)` })
      .from(outboxEventsTable)
      .where(eq(outboxEventsTable.eventType, "SERIAL_INDEXED"));
    assert(Number(outbox?.count ?? 0) >= serialUnitIds.length, "S-08 SERIAL_INDEXED outbox evidence missing");
    const [security] = await db
      .select({ count: sql<number>`count(*)` })
      .from(securityEventsTable)
      .where(eq(securityEventsTable.eventType, "serial.indexed"));
    assert(Number(security?.count ?? 0) >= serialUnitIds.length, "S-08 security evidence missing");
    passed += 1;

    // S-07 is deliberately a documented deferral: no cell writer was added
    // because the surveyed cell → lot → transfer → GRN link is not always
    // unambiguous. S-09/S-10 are release-gate checks run by the surrounding
    // Phase 6/7 suites and source-control workflow, not mutable fixture data.
    console.log(JSON.stringify({
      result: "PASS",
      suite: "phase8-serials",
      passed,
      s07: "DEFERRED_UNAMBIGUOUS_CELL_LINK_ONLY",
      s09: "RUN_PHASE6_PHASE7_GATES",
      s10: "NO_COMMIT_REQUIRED",
    }));
  } finally {
    await pool.query(
      "DELETE FROM security_events WHERE event_type = 'serial.indexed' AND detail LIKE $1",
      [`%${prefix}%`],
    );
    await pool.query(
      "DELETE FROM outbox_events WHERE aggregate_id = ANY($1::uuid[])",
      [serialUnitIds],
    );
    await pool.query("DELETE FROM serial_units WHERE serial_number LIKE $1", [`${prefix}-%`]);
    await pool.query("DELETE FROM products WHERE id = $1", [fixtureProductId]);
    await pool.query("DELETE FROM mfg_production_orders WHERE id = $1", [fixtureOrderId]);
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});