#!/usr/bin/env tsx
/**
 * Batch 71-D Universal Capture / GRN adapter certification.
 *
 * Run against a running development API:
 *   CERT_BASE_URL=http://localhost:80 pnpm --filter @workspace/api-server run test:phase6-71d
 */

import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { getCaptureAdapter } from "../lib/universal-capture/adapters";
import "../lib/universal-capture/grn-adapter";

const BASE_URL = (process.env.CERT_BASE_URL ?? "http://localhost:80").replace(/\/$/, "");
const PASSWORD = "P71D-Certification-2026!";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function responseBody(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request(path: string, cookie: string | undefined, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("Cookie", cookie);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  return { response, body: await responseBody(response) };
}

function cookieFrom(response: Response): string {
  const token = response.headers.get("set-cookie")?.match(/ocs_token=([^;]+)/)?.[1];
  if (!token) throw new Error("71-D certification login did not return ocs_token");
  return `ocs_token=${token}`;
}

type Fixture = {
  prefix: string;
  directorId: string;
  supplierId: string;
  categoryId: string;
  noTemplateCategoryId: string;
  materialId: string;
  noTemplateMaterialId: string;
  workflowId: string;
  assignmentId: string;
  unitId: string;
  capacityAttributeId: string;
  chemistryAttributeId: string;
  templateId: string;
  versionId: string;
  capacityTemplateAttributeId: string;
  chemistryTemplateAttributeId: string;
  directorCookie?: string;
};

async function main(): Promise<void> {
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const fixture: Fixture = {
    prefix: `P71D-${suffix}`,
    directorId: randomUUID(),
    supplierId: randomUUID(),
    categoryId: randomUUID(),
    noTemplateCategoryId: randomUUID(),
    materialId: randomUUID(),
    noTemplateMaterialId: randomUUID(),
    workflowId: randomUUID(),
    assignmentId: randomUUID(),
    unitId: randomUUID(),
    capacityAttributeId: randomUUID(),
    chemistryAttributeId: randomUUID(),
    templateId: randomUUID(),
    versionId: randomUUID(),
    capacityTemplateAttributeId: randomUUID(),
    chemistryTemplateAttributeId: randomUUID(),
  };
  const email = `${fixture.prefix.toLowerCase()}-director@cert.local`;
  const client = await pool.connect();
  const createdGrnIds: string[] = [];
  let passed = 0;

  const run = async (label: string, test: () => Promise<void>) => {
    await test();
    passed += 1;
    console.log(`${label} PASS`);
  };

  const countFixtureGrns = async (): Promise<number> => {
    const result = await client.query(
      "SELECT count(*)::int AS count FROM grn_headers WHERE created_by = $1",
      [fixture.directorId],
    );
    return Number(result.rows[0].count);
  };

  const line = (materialId: string, quantity = 10) => ({
    material_id: materialId,
    quantity_received: quantity,
  });

  try {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO users (id, email, password_hash, name, role, is_active)
       VALUES ($1, $2, $3, $4, 'director', true)`,
      [fixture.directorId, email, passwordHash, `${fixture.prefix} Director`],
    );
    await client.query(
      `INSERT INTO master_suppliers
       (id, code, name, status, revision_number, created_by)
       VALUES ($1, $2, $3, 'active', 1, $4)`,
      [fixture.supplierId, `${fixture.prefix}-SUP`, `${fixture.prefix} Supplier`, fixture.directorId],
    );
    await client.query(
      `INSERT INTO master_material_categories
       (id, code, name, status, revision_number, engineering_master_required, created_by)
       VALUES ($1, $2, $3, 'active', 1, false, $4),
              ($5, $6, $7, 'active', 1, false, $4)`,
      [
        fixture.categoryId,
        `${fixture.prefix}-CAT`,
        `${fixture.prefix} Category`,
        fixture.directorId,
        fixture.noTemplateCategoryId,
        `${fixture.prefix}-NO-CAT`,
        `${fixture.prefix} No Template Category`,
      ],
    );
    await client.query(
      `INSERT INTO master_materials
       (id, code, name, category_id, uom, usage_type, status, revision_number, created_by)
       VALUES ($1, $2, $3, $4, 'PCS', 'CONSUMABLE', 'active', 1, $5),
              ($6, $7, $8, $9, 'PCS', 'CONSUMABLE', 'active', 1, $5)`,
      [
        fixture.materialId,
        `${fixture.prefix}-MAT`,
        `${fixture.prefix} Material`,
        fixture.categoryId,
        fixture.directorId,
        fixture.noTemplateMaterialId,
        `${fixture.prefix}-NO-MAT`,
        `${fixture.prefix} No Template Material`,
        fixture.noTemplateCategoryId,
      ],
    );
    await client.query(
      `INSERT INTO material_workflows
       (id, code, name, post_receipt_action, status, revision_number, created_by)
       VALUES ($1, $2, $3, 'DIRECT_TO_INVENTORY', 'active', 1, $4)`,
      [fixture.workflowId, `${fixture.prefix}-WF`, `${fixture.prefix} Workflow`, fixture.directorId],
    );
    await client.query(
      `INSERT INTO material_workflow_assignments
       (id, category_id, workflow_id, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $4)`,
      [fixture.assignmentId, fixture.categoryId, fixture.workflowId, fixture.directorId],
    );
    await client.query(
      `INSERT INTO unit_definitions
       (id, unit_code, dimension, canonical_unit, conversion_factor, active)
       VALUES ($1, $2, 'ELECTRICAL_CAPACITY', 'AH', '1', true)`,
      [fixture.unitId, `${fixture.prefix}-AH`],
    );
    await client.query(
      `INSERT INTO attribute_definitions
       (id, code, name, data_type, scope, unit_code, precision, scale, status, created_by)
       VALUES ($1, $2, $3, 'DECIMAL', 'RECEIPT_LINE', $4, 8, 2, 'ACTIVE', $5),
              ($6, $7, $8, 'DROPDOWN', 'RECEIPT_LINE', NULL, NULL, NULL, 'ACTIVE', $5)`,
      [
        fixture.capacityAttributeId,
        `${fixture.prefix.toLowerCase()}_capacity`,
        `${fixture.prefix} Capacity`,
        `${fixture.prefix}-AH`,
        fixture.directorId,
        fixture.chemistryAttributeId,
        `${fixture.prefix.toLowerCase()}_chemistry`,
        `${fixture.prefix} Chemistry`,
      ],
    );
    await client.query(
      `UPDATE attribute_definitions
       SET allowed_values = '["LiFePO4", "NMC"]'::jsonb
       WHERE id = $1`,
      [fixture.chemistryAttributeId],
    );
    await client.query(
      `INSERT INTO attribute_templates
       (id, code, name, status, created_by, updated_by)
       VALUES ($1, $2, $3, 'ACTIVE', $4, $4)`,
      [fixture.templateId, fixture.prefix.toLowerCase(), `${fixture.prefix} Template`, fixture.directorId],
    );
    await client.query(
      `INSERT INTO attribute_template_versions
       (id, template_id, version_no, status, effective_from, created_by)
       VALUES ($1, $2, 1, 'ACTIVE', now() - interval '1 minute', $3)`,
      [fixture.versionId, fixture.templateId, fixture.directorId],
    );
    await client.query(
      `INSERT INTO attribute_template_attributes
       (id, template_version_id, attribute_id, required, sequence)
       VALUES ($1, $2, $3, true, 1),
              ($4, $2, $5, true, 2)`,
      [
        fixture.capacityTemplateAttributeId,
        fixture.versionId,
        fixture.capacityAttributeId,
        fixture.chemistryTemplateAttributeId,
        fixture.chemistryAttributeId,
      ],
    );
    await client.query(
      `INSERT INTO material_template_mappings
       (id, scope, category_id, template_id, status, effective_from, created_by)
       VALUES ($1, 'CATEGORY', $2, $3, 'ACTIVE', now() - interval '1 minute', $4)`,
      [randomUUID(), fixture.categoryId, fixture.templateId, fixture.directorId],
    );
    await client.query("COMMIT");

    const login = await request("/api/auth/login", undefined, {
      method: "POST",
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    assert(login.response.status === 200, `Certification login failed: ${JSON.stringify(login.body)}`);
    fixture.directorCookie = cookieFrom(login.response);
    const baselineGrns = await countFixtureGrns();

    let capturedGrnId = "";
    await run("71D-01 valid normalized capture", async () => {
      const result = await request("/api/inventory/grns", fixture.directorCookie, {
        method: "POST",
        body: JSON.stringify({
          supplier_id: fixture.supplierId,
          received_date: "2026-09-14",
          lines: [line(fixture.materialId)],
          attribute_values: [{
            line_number: 1,
            attributes: [
              {
                attribute_code: `${fixture.prefix.toLowerCase()}_capacity`,
                raw: "280 AH",
                value: "280",
                supplied_unit: `${fixture.prefix}-AH`,
              },
              {
                attribute_code: `${fixture.prefix.toLowerCase()}_chemistry`,
                raw: "lifepo4",
                value: "lifepo4",
              },
            ],
          }],
        }),
      });
      assert(result.response.status === 201, `Valid capture failed: ${JSON.stringify(result.body)}`);
      capturedGrnId = result.body.id;
      createdGrnIds.push(capturedGrnId);
      const capture = result.body.lines[0]?.capture;
      assert(capture?.template_version_id === fixture.versionId, "Capture template version was not pinned");
      assert(
        capture.fields.some(
          (field: any) =>
            field.attribute_code === `${fixture.prefix.toLowerCase()}_capacity` &&
            field.value_num === 280 &&
            field.unit === "AH" &&
            field.value_origin === "NORMALIZED",
        ),
        "Decimal capture was not normalized to canonical AH",
      );
      assert(
        capture.fields.some(
          (field: any) =>
            field.attribute_code === `${fixture.prefix.toLowerCase()}_chemistry` &&
            field.value_text === "LiFePO4",
        ),
        "Dropdown capture was not canonicalized",
      );
      assert(await countFixtureGrns() === baselineGrns + 1, "Valid capture did not create exactly one GRN");
    });

    await run("71D-02 CAPTURE_VALIDATION rollback", async () => {
      const result = await request("/api/inventory/grns", fixture.directorCookie, {
        method: "POST",
        body: JSON.stringify({
          supplier_id: fixture.supplierId,
          received_date: "2026-09-14",
          lines: [line(fixture.materialId)],
          attribute_values: [{
            line_number: 1,
            attributes: [
              { attribute_code: `${fixture.prefix.toLowerCase()}_capacity`, value: "10.256" },
              { attribute_code: `${fixture.prefix.toLowerCase()}_chemistry`, value: "NMC" },
            ],
          }],
        }),
      });
      assert(
        result.response.status === 422 &&
          result.body.error === "CAPTURE_VALIDATION" &&
          result.body.capture_errors.some((error: any) => error.rule === "SCALE"),
        `Unexpected validation response: ${JSON.stringify(result.body)}`,
      );
      assert(await countFixtureGrns() === baselineGrns + 1, "Validation failure left a GRN header");
    });

    await run("71D-03 NO_TEMPLATE rollback", async () => {
      const result = await request("/api/inventory/grns", fixture.directorCookie, {
        method: "POST",
        body: JSON.stringify({
          supplier_id: fixture.supplierId,
          received_date: "2026-09-14",
          lines: [line(fixture.noTemplateMaterialId)],
          attribute_values: [{ line_number: 1, attributes: [{ attribute_code: "unknown", value: "x" }] }],
        }),
      });
      assert(
        result.response.status === 422 && result.body.error === "NO_TEMPLATE",
        `Unexpected NO_TEMPLATE response: ${JSON.stringify(result.body)}`,
      );
      assert(await countFixtureGrns() === baselineGrns + 1, "NO_TEMPLATE failure left a GRN header");
    });

    await run("71D-04 duplicate attribute rollback", async () => {
      const result = await request("/api/inventory/grns", fixture.directorCookie, {
        method: "POST",
        body: JSON.stringify({
          supplier_id: fixture.supplierId,
          received_date: "2026-09-14",
          lines: [line(fixture.materialId)],
          attribute_values: [{
            line_number: 1,
            attributes: [
              { attribute_code: `${fixture.prefix.toLowerCase()}_capacity`, value: "1" },
              { attribute_code: `${fixture.prefix.toLowerCase()}_capacity`, value: "2" },
              { attribute_code: `${fixture.prefix.toLowerCase()}_chemistry`, value: "NMC" },
            ],
          }],
        }),
      });
      assert(
        result.response.status === 422 &&
          result.body.error === "CAPTURE_VALIDATION" &&
          result.body.capture_errors.some((error: any) => error.rule === "DUPLICATE_ATTRIBUTE"),
        `Unexpected duplicate response: ${JSON.stringify(result.body)}`,
      );
      assert(await countFixtureGrns() === baselineGrns + 1, "Duplicate validation left a GRN header");
    });

    let plainGrnId = "";
    await run("71D-05 configured material without capture", async () => {
      const result = await request("/api/inventory/grns", fixture.directorCookie, {
        method: "POST",
        body: JSON.stringify({
          supplier_id: fixture.supplierId,
          received_date: "2026-09-14",
          lines: [line(fixture.materialId)],
        }),
      });
      assert(result.response.status === 201, `No-capture GRN failed: ${JSON.stringify(result.body)}`);
      assert(result.body.lines[0]?.capture === null, "No-capture GRN response changed");
      plainGrnId = result.body.id;
      createdGrnIds.push(plainGrnId);
    });

    await run("71D-06 no-template material without capture", async () => {
      const result = await request("/api/inventory/grns", fixture.directorCookie, {
        method: "POST",
        body: JSON.stringify({
          supplier_id: fixture.supplierId,
          received_date: "2026-09-14",
          lines: [line(fixture.noTemplateMaterialId)],
        }),
      });
      assert(result.response.status === 201, `No-template no-capture GRN failed: ${JSON.stringify(result.body)}`);
      assert(result.body.lines[0]?.capture === null, "No-template no-capture response changed");
      createdGrnIds.push(result.body.id);
    });

    await run("71D-07 GRN_LINE adapter wall", async () => {
      const adapter = getCaptureAdapter("GRN_LINE");
      assert(adapter.targetType === "GRN_LINE", "GRN_LINE adapter is not registered");
      let transferError = "";
      try {
        getCaptureAdapter("TRANSFER_LINE");
      } catch (error) {
        transferError = String(error);
      }
      assert(/UNREGISTERED_TARGET/.test(transferError), "TRANSFER_LINE unexpectedly registered");
    });

    await run("71D-08 capture outbox and security evidence", async () => {
      const outbox = await client.query(
        `SELECT count(*)::int AS count
         FROM outbox_events
         WHERE event_type = 'CAPTURE_RECORDED'
           AND aggregate_id IN (
             SELECT id FROM grn_line_items WHERE grn_id = $1
           )`,
        [capturedGrnId],
      );
      assert(Number(outbox.rows[0].count) === 1, "Expected one CAPTURE_RECORDED outbox event");
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const security = await client.query(
          `SELECT count(*)::int AS count
           FROM security_events
           WHERE actor_id = $1 AND event_type = 'capture.grn_line.recorded'`,
          [fixture.directorId],
        );
        if (Number(security.rows[0].count) >= 1) return;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error("capture.grn_line.recorded security event was not observed");
    });

    await run("71D-09 posting ledger equivalence", async () => {
      const capturedPost = await request(`/api/inventory/grns/${capturedGrnId}/post`, fixture.directorCookie, {
        method: "POST",
      });
      const plainPost = await request(`/api/inventory/grns/${plainGrnId}/post`, fixture.directorCookie, {
        method: "POST",
      });
      assert(capturedPost.response.status === 200, `Captured GRN posting failed: ${JSON.stringify(capturedPost.body)}`);
      assert(plainPost.response.status === 200, `Plain GRN posting failed: ${JSON.stringify(plainPost.body)}`);

      const ledgerShape = async (grnId: string) => {
        const result = await client.query(
          `SELECT transaction_type, material_id, quantity::text AS quantity, uom,
                  stock_state, source_document_type, (source_line_id IS NOT NULL) AS has_source_line
           FROM inventory_transactions
           WHERE source_document_id = $1
           ORDER BY created_at`,
          [grnId],
        );
        return result.rows;
      };
      const capturedShape = await ledgerShape(capturedGrnId);
      const plainShape = await ledgerShape(plainGrnId);
      assert(capturedShape.length === 1 && plainShape.length === 1, "Expected one ledger row per posted GRN");
      assert(
        JSON.stringify(capturedShape) === JSON.stringify(plainShape),
        `Capture changed ledger shape: ${JSON.stringify({ capturedShape, plainShape })}`,
      );
      assert(capturedShape[0].transaction_type === "GRN_RECEIPT", "Unexpected GRN ledger transaction type");
    });

    console.log(JSON.stringify({ result: "PASS", cases: passed, fixture_prefix: fixture.prefix }));
  } finally {
    await client.query("BEGIN").catch(() => undefined);
    try {
      // Generated documents are owned through the fixture actor; generated lots
      // are owned through their GRN lines. Delete leaves before controlled masters.
      await client.query(
        `DELETE FROM outbox_events
         WHERE aggregate_id IN (
           SELECT id FROM grn_line_items
           WHERE grn_id IN (SELECT id FROM grn_headers WHERE created_by = $1)
         )`,
        [fixture.directorId],
      );
      await client.query(`DELETE FROM security_events WHERE actor_id = $1`, [fixture.directorId]);
      await client.query(`DELETE FROM inventory_transactions WHERE created_by = $1`, [fixture.directorId]);
      await client.query(
        `DELETE FROM inventory_lots
         WHERE grn_line_id IN (
           SELECT id FROM grn_line_items
           WHERE grn_id IN (SELECT id FROM grn_headers WHERE created_by = $1)
         )`,
        [fixture.directorId],
      );
      await client.query(
        `DELETE FROM attribute_capture_values
         WHERE capture_instance_id IN (
           SELECT id FROM attribute_capture_instances
           WHERE material_id IN ($1, $2)
         )`,
        [fixture.materialId, fixture.noTemplateMaterialId],
      );
      await client.query(
        `DELETE FROM attribute_capture_instances WHERE material_id IN ($1, $2)`,
        [fixture.materialId, fixture.noTemplateMaterialId],
      );
      await client.query(`DELETE FROM grn_headers WHERE created_by = $1`, [fixture.directorId]);
      await client.query(
        `DELETE FROM material_template_mappings WHERE created_by = $1`,
        [fixture.directorId],
      );
      await client.query(
        `DELETE FROM attribute_template_attributes WHERE template_version_id = $1`,
        [fixture.versionId],
      );
      await client.query(`DELETE FROM attribute_template_versions WHERE id = $1`, [fixture.versionId]);
      await client.query(`DELETE FROM attribute_templates WHERE id = $1`, [fixture.templateId]);
      await client.query(
        `DELETE FROM attribute_definitions WHERE id IN ($1, $2)`,
        [fixture.capacityAttributeId, fixture.chemistryAttributeId],
      );
      await client.query(`DELETE FROM unit_definitions WHERE id = $1`, [fixture.unitId]);
      await client.query(`DELETE FROM material_workflow_assignments WHERE id = $1`, [fixture.assignmentId]);
      await client.query(`DELETE FROM material_workflows WHERE id = $1`, [fixture.workflowId]);
      await client.query(
        `DELETE FROM master_materials WHERE id IN ($1, $2)`,
        [fixture.materialId, fixture.noTemplateMaterialId],
      );
      await client.query(
        `DELETE FROM master_material_categories WHERE id IN ($1, $2)`,
        [fixture.categoryId, fixture.noTemplateCategoryId],
      );
      await client.query(`DELETE FROM master_suppliers WHERE id = $1`, [fixture.supplierId]);
      await client.query(`DELETE FROM users WHERE id = $1`, [fixture.directorId]);

      const residual = await client.query(
        `SELECT
           (SELECT count(*) FROM users WHERE email LIKE $1) AS users,
           (SELECT count(*) FROM master_suppliers WHERE code LIKE $2) AS suppliers,
           (SELECT count(*) FROM master_material_categories WHERE code LIKE $2) AS categories,
           (SELECT count(*) FROM master_materials WHERE code LIKE $2) AS materials,
           (SELECT count(*) FROM material_workflows WHERE code LIKE $2) AS workflows,
           (SELECT count(*) FROM material_workflow_assignments WHERE id = $3) AS assignments,
           (SELECT count(*) FROM unit_definitions WHERE unit_code LIKE $2) AS units,
           (SELECT count(*) FROM attribute_definitions WHERE code LIKE $1) AS attributes,
           (SELECT count(*) FROM attribute_templates WHERE code LIKE $1) AS templates,
           (SELECT count(*) FROM attribute_template_versions WHERE id = $4) AS versions,
           (SELECT count(*) FROM grn_headers WHERE created_by = $5) AS grns,
           (SELECT count(*) FROM attribute_capture_instances WHERE material_id IN ($6, $7)) AS captures,
           (SELECT count(*) FROM inventory_lots WHERE grn_line_id IN (
             SELECT id FROM grn_line_items WHERE grn_id IN (
               SELECT id FROM grn_headers WHERE created_by = $5
             )
           )) AS lots`,
        [
          `${fixture.prefix.toLowerCase()}%`,
          `${fixture.prefix}%`,
          fixture.assignmentId,
          fixture.versionId,
          fixture.directorId,
          fixture.materialId,
          fixture.noTemplateMaterialId,
        ],
      );
      const residualValues = Object.values(residual.rows[0]).map(Number);
      assert(residualValues.every((value) => value === 0), `71-D fixture residue: ${JSON.stringify(residual.rows[0])}`);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});