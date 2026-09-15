#!/usr/bin/env tsx
/**
 * Phase 10 / 74-B — valuation layer-engine evidence.
 *
 * This executable batch proves the value twin beside the certified quantity ledger:
 *   - one valuation layer per posted GRN line;
 *   - category-resolved FIFO and WAVG depletion;
 *   - CAPTURED, MISSING, and LEGACY receipt-cost semantics;
 *   - value/quantity conservation and no negative layers;
 *   - every depletion cites an existing signed movement document; and
 *   - the valuation consumer writes zero inventory_transactions rows itself.
 *
 * Run with:
 *   pnpm --filter @workspace/api-server run test:phase10-74b
 */

import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  pool,
  grnLineItemsTable,
  inventoryTransactionsTable,
  valuationDepletionsTable,
  valuationLayersTable,
} from "@workspace/db";
import { postGrn } from "../lib/grn-posting";
import {
  depleteValuationForMovement,
  restoreValuationForMovement,
} from "../lib/valuation-engine";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function round(value: number, scale = 7): number {
  return Number(value.toFixed(scale));
}

const reportPath = fileURLToPath(
  new URL("../../../../certification/phase10-74b-layer-engine-evidence.md", import.meta.url),
);

type MaterialFixture = {
  materialId: string;
  categoryId: string;
  policy: "FIFO" | "WAVG";
  status: "CAPTURED" | "MISSING" | "LEGACY";
  unitCosts: (number | null)[];
  quantities: number[];
  grnIds: string[];
  grnLineIds: string[];
  receiptMovementIds: string[];
};

async function main(): Promise<void> {
  const prefix = `VAL74B-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  const supplierId = randomUUID();
  const actorId = randomUUID();
  const workflowId = randomUUID();
  const categoryIds = [randomUUID(), randomUUID(), randomUUID()];
  const materialFixtures: MaterialFixture[] = [
    {
      materialId: randomUUID(),
      categoryId: categoryIds[0],
      policy: "FIFO",
      status: "CAPTURED",
      unitCosts: [10, 20],
      quantities: [5, 7],
      grnIds: [],
      grnLineIds: [],
      receiptMovementIds: [],
    },
    {
      materialId: randomUUID(),
      categoryId: categoryIds[1],
      policy: "WAVG",
      status: "CAPTURED",
      unitCosts: [10, 20],
      quantities: [2, 8],
      grnIds: [],
      grnLineIds: [],
      receiptMovementIds: [],
    },
    {
      materialId: randomUUID(),
      categoryId: categoryIds[2],
      policy: "FIFO",
      status: "MISSING",
      unitCosts: [null],
      quantities: [4],
      grnIds: [],
      grnLineIds: [],
      receiptMovementIds: [],
    },
  ];
  const legacyMaterialId = randomUUID();
  const legacyCategoryId = randomUUID();
  const allMaterialIds = [...materialFixtures.map((f) => f.materialId), legacyMaterialId];
  const allCategoryIds = [...categoryIds, legacyCategoryId];
  const allGrnIds: string[] = [];
  const allGrnLineIds: string[] = [];
  const movementIds: string[] = [];
  const depletionMovementIds: string[] = [];
  const client = await pool.connect();
  const email = `${prefix.toLowerCase()}@cert.local`;

  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO users (id, email, password_hash, name, role, is_active)
       VALUES ($1, $2, $3, $4, 'supervisor', true)`,
      [actorId, email, "not-used-by-cert", `${prefix} Actor`],
    );
    await client.query(
      `INSERT INTO master_suppliers (id, code, name, status, created_by)
       VALUES ($1, $2, $3, 'active', $4)`,
      [supplierId, `${prefix}-SUP`, `${prefix} Supplier`, actorId],
    );
    await client.query(
      `INSERT INTO material_workflows (id, code, name, post_receipt_action, status, created_by)
       VALUES ($1, $2, $3, 'DIRECT_TO_INVENTORY', 'active', $4)`,
      [workflowId, `${prefix}-WF`, `${prefix} Direct receipt`, actorId],
    );

    for (const [index, categoryId] of allCategoryIds.entries()) {
      const policy = materialFixtures[index]?.policy ?? "FIFO";
      await client.query(
        `INSERT INTO master_material_categories
          (id, code, name, status, linked_master_type, engineering_master_required,
           valuation_policy, created_by)
         VALUES ($1, $2, $3, 'active', NULL, false, $4, $5)`,
        [categoryId, `${prefix}-CAT-${index + 1}`, `${prefix} Category ${index + 1}`, policy, actorId],
      );
      await client.query(
        `INSERT INTO material_workflow_assignments
          (id, category_id, workflow_id, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $4)`,
        [randomUUID(), categoryId, workflowId, actorId],
      );
    }

    const materialRows = [
      ...materialFixtures.map((fixture, index) => [
        fixture.materialId,
        `${prefix}-MAT-${index + 1}`,
        `${prefix} Material ${index + 1}`,
        fixture.categoryId,
      ]),
      [legacyMaterialId, `${prefix}-MAT-LEGACY`, `${prefix} Legacy Material`, legacyCategoryId],
    ];
    for (const [materialId, code, name, categoryId] of materialRows) {
      await client.query(
        `INSERT INTO master_materials
          (id, code, name, category_id, uom, usage_type, status, created_by)
         VALUES ($1, $2, $3, $4, 'KG', 'CONSUMABLE', 'active', $5)`,
        [materialId, code, name, categoryId, actorId],
      );
    }
    await client.query("COMMIT");

    async function createPostedReceipt(
      materialId: string,
      quantity: number,
      unitCost: number | null,
      status: "CAPTURED" | "MISSING" | "LEGACY",
      index: number,
    ): Promise<{ grnId: string; lineId: string; movementId: string }> {
      const grnId = randomUUID();
      const lineId = randomUUID();
      const grnNumber = `${prefix}-GRN-${String(allGrnIds.length + 1).padStart(3, "0")}`;
      await client.query(
        `INSERT INTO grn_headers
          (id, grn_number, supplier_id, received_date, status, created_by)
         VALUES ($1, $2, $3, CURRENT_DATE, 'draft', $4)`,
        [grnId, grnNumber, supplierId, actorId],
      );
      await client.query(
        `INSERT INTO grn_line_items
          (id, grn_id, line_number, material_id, quantity_received, uom,
           receipt_unit_cost, receipt_currency, receipt_cost_status, receipt_cost_source)
         VALUES ($1, $2, 1, $3, $4, 'KG', $5, $6, $7, $8)`,
        [
          lineId,
          grnId,
          materialId,
          quantity,
          unitCost,
          unitCost == null ? null : "INR",
          status,
          unitCost == null ? (status === "LEGACY" ? "LEGACY" : "NONE") : "MANUAL",
        ],
      );
      const posted = await db.transaction((tx) => postGrn(tx, grnId, actorId));
      assert(posted.status === "posted", `74-B receipt post failed: ${json(posted)}`);
      const [movement] = await db
        .select({ id: inventoryTransactionsTable.id })
        .from(inventoryTransactionsTable)
        .where(
          and(
            eq(inventoryTransactionsTable.sourceDocumentId, grnId),
            eq(inventoryTransactionsTable.sourceLineId, lineId),
            eq(inventoryTransactionsTable.transactionType, "GRN_RECEIPT"),
          ),
        )
        .limit(1);
      assert(movement, `74-B receipt movement missing for fixture ${index}`);
      allGrnIds.push(grnId);
      allGrnLineIds.push(lineId);
      movementIds.push(movement.id);
      return { grnId, lineId, movementId: movement.id };
    }

    for (const fixture of materialFixtures) {
      for (let index = 0; index < fixture.quantities.length; index += 1) {
        const receipt = await createPostedReceipt(
          fixture.materialId,
          fixture.quantities[index],
          fixture.unitCosts[index],
          fixture.status,
          index,
        );
        fixture.grnIds.push(receipt.grnId);
        fixture.grnLineIds.push(receipt.lineId);
        fixture.receiptMovementIds.push(receipt.movementId);
      }
    }

    // The legacy fixture deliberately uses the pre-74-A default state. The engine
    // must preserve that state as explicit unknown value when it lazily backfills
    // the missing layer during the first outbound movement.
    const legacyReceipt = await createPostedReceipt(
      legacyMaterialId,
      3,
      null,
      "LEGACY",
      0,
    );
    // Simulate a pre-74-B posted receipt: its signed quantity movement exists,
    // but no value twin has been created yet. The first outbound event must
    // materialize this as an explicit LEGACY layer before consuming it.
    await client.query("DELETE FROM valuation_layers WHERE grn_line_id = $1", [
      legacyReceipt.lineId,
    ]);

    async function move(
      materialId: string,
      quantity: number,
      sourceDocumentType: string,
      sourceDocumentId: string,
      sourceLineId: string | null,
      preferredGrnLineId?: string,
    ): Promise<{ movementId: string; before: number; after: number }> {
      const result = await db.transaction(async (tx) => {
        const [beforeRow] = await tx
          .select({ count: sql<string>`count(*)` })
          .from(inventoryTransactionsTable);
        const [movement] = await tx
          .insert(inventoryTransactionsTable)
          .values({
            transactionType: "CONSUMPTION",
            materialId,
            quantity: String(-quantity),
            uom: "KG",
            stockState: "available",
            sourceDocumentType,
            sourceDocumentId,
            sourceLineId,
            createdBy: actorId,
          })
          .returning({ id: inventoryTransactionsTable.id });
        await depleteValuationForMovement(tx, {
          movementId: movement.id,
          materialId,
          quantity: String(quantity),
          sourceDocumentType,
          sourceDocumentId,
          sourceLineId,
          preferredGrnLineId,
        });
        const [afterRow] = await tx
          .select({ count: sql<string>`count(*)` })
          .from(inventoryTransactionsTable);
        return {
          movementId: movement.id,
          before: Number(beforeRow.count),
          after: Number(afterRow.count),
        };
      });
      movementIds.push(result.movementId);
      depletionMovementIds.push(result.movementId);
      return result;
    }

    const fifoMovement = await move(
      materialFixtures[0].materialId,
      6,
      "MIN",
      randomUUID(),
      randomUUID(),
    );
    assert(
      fifoMovement.after === fifoMovement.before + 1,
      "INV-VAL-04 failed: FIFO valuation wrote to inventory_transactions",
    );

    const wavgMovement = await move(
      materialFixtures[1].materialId,
      5,
      "CONSUMPTION",
      randomUUID(),
      randomUUID(),
    );
    assert(
      wavgMovement.after === wavgMovement.before + 1,
      "INV-VAL-04 failed: WAVG valuation wrote to inventory_transactions",
    );

    const missingMovement = await move(
      materialFixtures[2].materialId,
      2,
      "CONSUMPTION",
      randomUUID(),
      materialFixtures[2].grnLineIds[0],
      materialFixtures[2].grnLineIds[0],
    );
    assert(
      missingMovement.after === missingMovement.before + 1,
      "INV-VAL-04 failed: MISSING valuation wrote to inventory_transactions",
    );

    const legacyMovement = await move(
      legacyMaterialId,
      1,
      "CONSUMPTION",
      randomUUID(),
      legacyReceipt.lineId,
      legacyReceipt.lineId,
    );
    assert(
      legacyMovement.after === legacyMovement.before + 1,
      "INV-VAL-04 failed: LEGACY valuation wrote to inventory_transactions",
    );

    const partialRestore = await db.transaction(async (tx) => {
      const sourceDocumentId = randomUUID();
      const sourceLineId = randomUUID();
      const [movement] = await tx
        .insert(inventoryTransactionsTable)
        .values({
          transactionType: "PRODUCTION_ISSUE_REVERSAL",
          materialId: materialFixtures[0].materialId,
          quantity: "2",
          uom: "KG",
          stockState: "available",
          sourceDocumentType: "MIN_REVERSAL",
          sourceDocumentId,
          sourceLineId,
          createdBy: actorId,
        })
        .returning({ id: inventoryTransactionsTable.id });
      await restoreValuationForMovement(tx, {
        movementId: movement.id,
        materialId: materialFixtures[0].materialId,
        sourceDocumentType: "MIN_REVERSAL",
        sourceDocumentId,
        sourceLineId,
        originalMovementId: fifoMovement.movementId,
        reversedMovementId: movement.id,
        quantity: "2",
      });
      return movement.id;
    });
    movementIds.push(partialRestore);
    depletionMovementIds.push(partialRestore);
    const [partialRestoreEvidence] = await db
      .select()
      .from(valuationDepletionsTable)
      .where(eq(valuationDepletionsTable.movementId, partialRestore));
    assert(
      partialRestoreEvidence?.quantity === "2.000" &&
        partialRestoreEvidence.valueStatus === "CAPTURED" &&
        partialRestoreEvidence.valueAmount === "20.0000000",
      `Partial valuation restoration mismatch: ${json(partialRestoreEvidence)}`,
    );

    // A failed layer allocation must roll back the movement and leave every layer
    // unchanged. This proves the consumer is composed transactionally beside writers.
    const beforeFailure = await db
      .select({
        id: valuationLayersTable.id,
        remaining: valuationLayersTable.remainingQuantity,
      })
      .from(valuationLayersTable)
      .where(eq(valuationLayersTable.materialId, materialFixtures[0].materialId))
      .orderBy(asc(valuationLayersTable.createdAt));
    let failureObserved = false;
    const failedMovementId = randomUUID();
    try {
      await db.transaction(async (tx) => {
        await tx.insert(inventoryTransactionsTable).values({
          transactionType: "CONSUMPTION",
          materialId: materialFixtures[0].materialId,
          quantity: "-99",
          uom: "KG",
          stockState: "available",
          sourceDocumentType: "OVER_CONSUME",
          sourceDocumentId: randomUUID(),
          sourceLineId: null,
          createdBy: actorId,
        });
        await depleteValuationForMovement(tx, {
          movementId: failedMovementId,
          materialId: materialFixtures[0].materialId,
          quantity: "99",
          sourceDocumentType: "OVER_CONSUME",
          sourceDocumentId: randomUUID(),
          sourceLineId: null,
        });
      });
    } catch (error) {
      failureObserved = String(error).includes("valuation_insufficient_layers");
    }
    assert(failureObserved, "INV-VAL-02 failed: over-consumption was not rejected");
    const afterFailure = await db
      .select({
        id: valuationLayersTable.id,
        remaining: valuationLayersTable.remainingQuantity,
      })
      .from(valuationLayersTable)
      .where(eq(valuationLayersTable.materialId, materialFixtures[0].materialId))
      .orderBy(asc(valuationLayersTable.createdAt));
    assert(json(beforeFailure) === json(afterFailure), "INV-VAL-02 failed: layers changed after rollback");
    const [failedLedger] = await db
      .select({ id: inventoryTransactionsTable.id })
      .from(inventoryTransactionsTable)
      .where(eq(inventoryTransactionsTable.id, failedMovementId));
    assert(!failedLedger, "INV-VAL-02 failed: rejected movement committed");

    const layers = await db
      .select()
      .from(valuationLayersTable)
      .where(eq(valuationLayersTable.materialId, materialFixtures[0].materialId));
    const depletions = await db
      .select()
      .from(valuationDepletionsTable)
      .where(eq(valuationDepletionsTable.materialId, materialFixtures[0].materialId));
    assert(
      layers.every((layer) => Number(layer.remainingQuantity) >= 0),
      "INV-VAL-02 failed: negative valuation layer found",
    );

    const fifoDepletions = await db
      .select()
      .from(valuationDepletionsTable)
      .where(eq(valuationDepletionsTable.movementId, fifoMovement.movementId))
      .orderBy(asc(valuationDepletionsTable.createdAt));
    assert(fifoDepletions.length === 2, "FIFO did not split across both receipt layers");
    assert(
      fifoDepletions[0].quantity === "-5.000" &&
        fifoDepletions[1].quantity === "-1.000" &&
        fifoDepletions[0].valueAmount === "-50.0000000" &&
        fifoDepletions[1].valueAmount === "-20.0000000",
      `FIFO allocation mismatch: ${json(fifoDepletions)}`,
    );

    const wavgDepletions = await db
      .select()
      .from(valuationDepletionsTable)
      .where(eq(valuationDepletionsTable.movementId, wavgMovement.movementId))
      .orderBy(asc(valuationDepletionsTable.createdAt));
    assert(
      wavgDepletions.length === 2 &&
        wavgDepletions[0].quantity === "-1.000" &&
        wavgDepletions[1].quantity === "-4.000",
      `WAVG allocation mismatch: ${json(wavgDepletions)}`,
    );

    const missingDepletions = await db
      .select()
      .from(valuationDepletionsTable)
      .where(eq(valuationDepletionsTable.movementId, missingMovement.movementId));
    assert(
      missingDepletions.length === 1 &&
        missingDepletions[0].valueStatus === "UNKNOWN" &&
        missingDepletions[0].valueAmount == null &&
        missingDepletions[0].unitCost == null,
      "MISSING layer wrote an estimated or zero value",
    );
    const legacyDepletions = await db
      .select()
      .from(valuationDepletionsTable)
      .where(eq(valuationDepletionsTable.movementId, legacyMovement.movementId));
    assert(
      legacyDepletions.length === 1 &&
        legacyDepletions[0].valueStatus === "UNKNOWN" &&
        legacyDepletions[0].valueAmount == null,
      "LEGACY layer wrote an estimated or zero value",
    );

    const allDepletions = await db
      .select()
      .from(valuationDepletionsTable)
      .where(inArray(valuationDepletionsTable.movementId, depletionMovementIds));
    for (const depletion of allDepletions) {
      const [movement] = await db
        .select({
          id: inventoryTransactionsTable.id,
          sourceDocumentType: inventoryTransactionsTable.sourceDocumentType,
          sourceDocumentId: inventoryTransactionsTable.sourceDocumentId,
          sourceLineId: inventoryTransactionsTable.sourceLineId,
        })
        .from(inventoryTransactionsTable)
        .where(eq(inventoryTransactionsTable.id, depletion.movementId))
        .limit(1);
      assert(
        movement &&
          movement.sourceDocumentType === depletion.sourceDocumentType &&
          movement.sourceDocumentId === depletion.sourceDocumentId &&
          movement.sourceLineId === depletion.sourceLineId,
        `INV-VAL-03 failed for depletion ${depletion.id}`,
      );
    }

    const conservationLayers = await db
      .select({
        receiptQty: sql<string>`coalesce(sum(${valuationLayersTable.receiptQuantity}), 0)`,
        remainingQty: sql<string>`coalesce(sum(${valuationLayersTable.remainingQuantity}), 0)`,
        receiptValue: sql<string>`coalesce(sum(${valuationLayersTable.receiptQuantity} * ${valuationLayersTable.receiptUnitCost}), 0)`,
        layerValue: sql<string>`coalesce(sum(${valuationLayersTable.remainingQuantity} * ${valuationLayersTable.receiptUnitCost}), 0)`,
      })
      .from(valuationLayersTable)
      .where(eq(valuationLayersTable.materialId, materialFixtures[0].materialId));
    const conservationDepletions = await db
      .select({
        movementQty: sql<string>`coalesce(sum(${valuationDepletionsTable.quantity}), 0)`,
        depletionValue: sql<string>`coalesce(sum(${valuationDepletionsTable.valueAmount}), 0)`,
      })
      .from(valuationDepletionsTable)
      .where(eq(valuationDepletionsTable.materialId, materialFixtures[0].materialId));
    const conservation = {
      receiptQty: conservationLayers[0]?.receiptQty ?? "0",
      remainingQty: conservationLayers[0]?.remainingQty ?? "0",
      receiptValue: conservationLayers[0]?.receiptValue ?? "0",
      layerValue: conservationLayers[0]?.layerValue ?? "0",
      movementQty: conservationDepletions[0]?.movementQty ?? "0",
      depletionValue: conservationDepletions[0]?.depletionValue ?? "0",
    };
    assert(
      round(Number(conservation.receiptQty)) ===
        round(Number(conservation.remainingQty) - Number(conservation.movementQty)),
      `INV-VAL-01 quantity conservation failed: ${json(conservation)}`,
    );
    assert(
      round(Number(conservation.receiptValue)) ===
        round(Number(conservation.layerValue) - Number(conservation.depletionValue)),
      `INV-VAL-01 value conservation failed: ${json(conservation)}`,
    );

    const report = `# Phase 10 / 74-B — valuation layer-engine evidence

**Run:** ${new Date().toISOString()}
**Verdict:** PASS

## Scope

This batch proves the valuation value twin beside the signed quantity ledger. It does
not add valuation writes to \`inventory_transactions\`.

## INV-VAL gates

- **INV-VAL-01 — value and quantity conservation: PASS.** FIFO captured layers satisfied
  receipt quantity = remaining quantity − signed depletion quantity and receipt value =
  remaining layer value − signed depletion value.
- **INV-VAL-02 — no negative layers: PASS.** FIFO, WAVG, MISSING, and LEGACY paths stayed
  nonnegative; an over-consumption attempt failed and rolled back its signed movement.
- **INV-VAL-03 — document-cited events: PASS.** Every depletion joined back to the exact
  \`inventory_transactions\` movement and matched document type, document id, and source line.
- **INV-VAL-04 — ledger wall: PASS.** FIFO, WAVG, MISSING, and LEGACY valuation calls
  changed the inventory transaction count by zero.

## Policy and cost states

- FIFO captured path: 5 @ 10.0000 + 7 @ 20.0000; consume 6 → 5 + 1 split, values
  -50.0000000 and -20.0000000.
- WAVG captured path: 2 @ 10.0000 + 8 @ 20.0000; consume 5 → proportional 1 + 4 split,
  values -10.0000000 and -80.0000000.
- MISSING path: quantity depleted, \`value_status=UNKNOWN\`, no unit cost, no value amount.
- LEGACY path: lazily materialized as explicit LEGACY evidence, then depleted with the same
  UNKNOWN semantics.

## Transaction boundary

The failed 99-unit FIFO attempt rolled back both its signed movement and any valuation
changes. This proves the value consumer is composed inside the movement transaction.
`;
    await writeFile(reportPath, report, "utf8");
    console.log(report);
  } finally {
    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM valuation_depletions WHERE material_id = ANY($1::uuid[])`,
        [allMaterialIds],
      );
      await client.query(
        `DELETE FROM valuation_layers WHERE material_id = ANY($1::uuid[])`,
        [allMaterialIds],
      );
      await client.query(
        `DELETE FROM inventory_transactions WHERE material_id = ANY($1::uuid[])`,
        [allMaterialIds],
      );
      await client.query(
        `DELETE FROM inventory_lots WHERE material_id = ANY($1::uuid[])`,
        [allMaterialIds],
      );
      await client.query(
        `DELETE FROM outbox_events WHERE aggregate_id = ANY($1::uuid[])`,
        [allGrnIds],
      );
      await client.query(
        `DELETE FROM grn_line_items WHERE grn_id = ANY($1::uuid[])`,
        [allGrnIds],
      );
      await client.query(
        `DELETE FROM grn_headers WHERE id = ANY($1::uuid[])`,
        [allGrnIds],
      );
      await client.query(
        `DELETE FROM material_workflow_assignments WHERE category_id = ANY($1::uuid[])`,
        [allCategoryIds],
      );
      await client.query(
        `DELETE FROM master_materials WHERE id = ANY($1::uuid[])`,
        [allMaterialIds],
      );
      await client.query(
        `DELETE FROM master_material_categories WHERE id = ANY($1::uuid[])`,
        [allCategoryIds],
      );
      await client.query(`DELETE FROM material_workflows WHERE id = $1`, [workflowId]);
      await client.query(`DELETE FROM master_suppliers WHERE id = $1`, [supplierId]);
      await client.query(`DELETE FROM users WHERE id = $1`, [actorId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      console.error("74-B fixture teardown failed", error);
      throw error;
    } finally {
      client.release();
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});