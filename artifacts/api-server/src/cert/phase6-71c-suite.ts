#!/usr/bin/env tsx
/**
 * Phase 6 / Batch 71-C configuration lifecycle certification.
 *
 * Run against a running development API:
 *   CERT_BASE_URL=http://localhost:80 pnpm --filter @workspace/api-server run test:phase6-71c
 *
 * This suite intentionally drives the configuration APIs over HTTP, while using
 * direct SQL only for isolated users/materials/activity fixtures and teardown.
 */

import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";

const BASE_URL = (process.env.CERT_BASE_URL ?? "http://localhost:80").replace(/\/$/, "");
const PASSWORD = "P71C-Certification-2026!";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function readBody(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request(
  path: string,
  cookie: string | undefined,
  init: RequestInit = {},
): Promise<{ response: Response; body: any }> {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("Cookie", cookie);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  return { response, body: await readBody(response) };
}

function cookieFrom(response: Response): string {
  const token = response.headers.get("set-cookie")?.match(/ocs_token=([^;]+)/)?.[1];
  if (!token) throw new Error("71-C certification login did not return ocs_token");
  return `ocs_token=${token}`;
}

type Fixture = {
  prefix: string;
  codePrefix: string;
  emailPrefix: string;
  directorId: string;
  supervisorId: string;
  viewerId: string;
  categoryId: string;
  noTemplateCategoryId: string;
  materialId: string;
  dateMaterialId: string;
  noTemplateMaterialId: string;
  sourceDocumentId: string;
  directorCookie?: string;
  supervisorCookie?: string;
  viewerCookie?: string;
  unitId?: string;
  badAttributeId?: string;
  validAttributeId?: string;
  inactiveAttributeId?: string;
  emptyTemplateId?: string;
  inactiveTemplateId?: string;
  categoryTemplateId?: string;
  materialTemplateId?: string;
  categoryV1Id?: string;
  categoryV2Id?: string;
  materialV1Id?: string;
  emptyVersionId?: string;
  inactiveVersionId?: string;
  categoryMappingId?: string;
  materialMappingId?: string;
};

function code(fixture: Fixture, suffix: string): string {
  return `${fixture.codePrefix}-${suffix}`;
}

function templateCode(fixture: Fixture, suffix: string): string {
  return `${fixture.codePrefix.toLowerCase()}_${suffix.toLowerCase()}`;
}

async function login(email: string): Promise<string> {
  const result = await request("/api/auth/login", undefined, {
    method: "POST",
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  assert(result.response.status === 200, `Login failed for ${email}: ${JSON.stringify(result.body)}`);
  return cookieFrom(result.response);
}

async function waitFor(
  check: () => Promise<boolean>,
  label: string,
  attempts = 30,
): Promise<void> {
  for (let i = 0; i < attempts; i += 1) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function cleanup(client: any, fixture: Fixture): Promise<void> {
  const codeLike = `${fixture.codePrefix}%`;
  const lowerCodeLike = `${fixture.codePrefix.toLowerCase()}%`;
  const emailLike = `${fixture.emailPrefix}%`;
  const aggregateIds = new Set<string>();

  const aggregateQueries = [
    [`SELECT id::text AS id FROM unit_definitions WHERE unit_code LIKE $1`, [codeLike]],
    [`SELECT id::text AS id FROM attribute_definitions WHERE code LIKE $1`, [lowerCodeLike]],
    [`SELECT id::text AS id FROM attribute_templates WHERE code LIKE $1`, [lowerCodeLike]],
    [
      `SELECT id::text AS id FROM attribute_template_versions
       WHERE template_id IN (SELECT id FROM attribute_templates WHERE code LIKE $1)`,
      [lowerCodeLike],
    ],
    [
      `SELECT id::text AS id FROM material_template_mappings
       WHERE material_id IN (SELECT id FROM master_materials WHERE code LIKE $1)
          OR category_id IN (SELECT id FROM master_material_categories WHERE code LIKE $1)`,
      [codeLike],
    ],
    [
      `SELECT material_id::text AS id FROM material_inventory_profiles
       WHERE material_id IN (SELECT id FROM master_materials WHERE code LIKE $1)`,
      [codeLike],
    ],
  ] as const;
  for (const [sql, params] of aggregateQueries) {
    const result = await client.query(sql, params);
    for (const row of result.rows) aggregateIds.add(row.id);
  }

  await client.query("BEGIN");
  try {
    const aggregateArray = [...aggregateIds];
    await client.query(
      `DELETE FROM outbox_events
       WHERE aggregate_id = ANY($1::uuid[])`,
      [aggregateArray],
    );
    await client.query(
      `DELETE FROM security_events
       WHERE actor_id IN (SELECT id FROM users WHERE email LIKE $1)`,
      [emailLike],
    );
    await client.query(
      `DELETE FROM material_template_mappings
       WHERE material_id IN (SELECT id FROM master_materials WHERE code LIKE $1)
          OR category_id IN (SELECT id FROM master_material_categories WHERE code LIKE $1)`,
      [codeLike],
    );
    await client.query(
      `DELETE FROM material_inventory_profiles
       WHERE material_id IN (SELECT id FROM master_materials WHERE code LIKE $1)`,
      [codeLike],
    );
    await client.query(
      `DELETE FROM attribute_template_attributes
       WHERE template_version_id IN (
         SELECT v.id
         FROM attribute_template_versions v
         JOIN attribute_templates t ON t.id = v.template_id
         WHERE t.code LIKE $1
       )`,
      [lowerCodeLike],
    );
    await client.query(
      `DELETE FROM attribute_template_versions
       WHERE template_id IN (SELECT id FROM attribute_templates WHERE code LIKE $1)`,
      [lowerCodeLike],
    );
    await client.query(`DELETE FROM attribute_templates WHERE code LIKE $1`, [lowerCodeLike]);
    await client.query(`DELETE FROM attribute_definitions WHERE code LIKE $1`, [lowerCodeLike]);
    await client.query(`DELETE FROM unit_definitions WHERE unit_code LIKE $1`, [codeLike]);
    await client.query(
      `DELETE FROM inventory_transactions
       WHERE material_id IN (SELECT id FROM master_materials WHERE code LIKE $1)`,
      [codeLike],
    );
    await client.query(`DELETE FROM master_materials WHERE code LIKE $1`, [codeLike]);
    await client.query(`DELETE FROM master_material_categories WHERE code LIKE $1`, [codeLike]);
    await client.query(`DELETE FROM users WHERE email LIKE $1`, [emailLike]);

    const residual = await client.query(
      `SELECT
         (SELECT count(*)::int FROM users WHERE email LIKE $1) AS users,
         (SELECT count(*)::int FROM master_material_categories WHERE code LIKE $2) AS categories,
         (SELECT count(*)::int FROM master_materials WHERE code LIKE $2) AS materials,
         (SELECT count(*)::int FROM unit_definitions WHERE unit_code LIKE $2) AS units,
         (SELECT count(*)::int FROM attribute_definitions WHERE code LIKE $3) AS attributes,
         (SELECT count(*)::int FROM attribute_templates WHERE code LIKE $3) AS templates,
         (SELECT count(*)::int FROM material_template_mappings
          WHERE material_id IN (SELECT id FROM master_materials WHERE code LIKE $2)
             OR category_id IN (SELECT id FROM master_material_categories WHERE code LIKE $2)) AS mappings,
         (SELECT count(*)::int FROM material_inventory_profiles
          WHERE material_id IN (SELECT id FROM master_materials WHERE code LIKE $2)) AS profiles,
         (SELECT count(*)::int FROM inventory_transactions
          WHERE material_id IN (SELECT id FROM master_materials WHERE code LIKE $2)) AS transactions,
         (SELECT count(*)::int FROM outbox_events WHERE aggregate_id = ANY($4::uuid[])) AS outbox`,
      [emailLike, codeLike, lowerCodeLike, [...aggregateIds]],
    );
    const counts = residual.rows[0] as Record<string, number>;
    assert(
      Object.values(counts).every((value) => Number(value) === 0),
      `71-C teardown left residual rows: ${JSON.stringify(counts)}`,
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function main(): Promise<void> {
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const fixture: Fixture = {
    prefix: `P71C-${suffix}`,
    codePrefix: `P71C-${suffix}`,
    emailPrefix: `p71c-${suffix.toLowerCase()}`,
    directorId: randomUUID(),
    supervisorId: randomUUID(),
    viewerId: randomUUID(),
    categoryId: randomUUID(),
    noTemplateCategoryId: randomUUID(),
    materialId: randomUUID(),
    dateMaterialId: randomUUID(),
    noTemplateMaterialId: randomUUID(),
    sourceDocumentId: randomUUID(),
  };
  const email = (role: string) => `${fixture.emailPrefix}-${role}@cert.local`;
  const client = await pool.connect();
  let passed = 0;
  let primaryError: unknown = null;

  const run = async (label: string, test: () => Promise<void>) => {
    await test();
    passed += 1;
    console.log(`${label} PASS`);
  };

  try {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO users (id, email, password_hash, name, role, is_active)
       VALUES ($1, $2, $3, $4, 'director', true),
              ($5, $6, $3, $7, 'supervisor', true),
              ($8, $9, $3, $10, 'viewer', true)`,
      [
        fixture.directorId,
        email("director"),
        passwordHash,
        `${fixture.prefix} Director`,
        fixture.supervisorId,
        email("supervisor"),
        `${fixture.prefix} Supervisor`,
        fixture.viewerId,
        email("viewer"),
        `${fixture.prefix} Viewer`,
      ],
    );
    await client.query(
      `INSERT INTO master_material_categories
       (id, code, name, status, revision_number, engineering_master_required, created_by)
       VALUES ($1, $2, $3, 'active', 1, false, $4),
              ($5, $6, $7, 'active', 1, false, $4)`,
      [
        fixture.categoryId,
        code(fixture, "CAT"),
        `${fixture.prefix} Category`,
        fixture.directorId,
        fixture.noTemplateCategoryId,
        code(fixture, "NO-CAT"),
        `${fixture.prefix} No Template Category`,
      ],
    );
    await client.query(
      `INSERT INTO master_materials
       (id, code, name, category_id, uom, status, revision_number, usage_type, created_by)
       VALUES ($1, $2, $3, $4, 'PCS', 'active', 1, 'CONSUMABLE', $5),
              ($6, $7, $8, $9, 'PCS', 'active', 1, 'CONSUMABLE', $5),
              ($10, $11, $12, $13, 'PCS', 'active', 1, 'CONSUMABLE', $5)`,
      [
        fixture.materialId,
        code(fixture, "MAT"),
        `${fixture.prefix} Material`,
        fixture.categoryId,
        fixture.directorId,
        fixture.dateMaterialId,
        code(fixture, "DATE-MAT"),
        `${fixture.prefix} Date Material`,
        fixture.categoryId,
        fixture.noTemplateMaterialId,
        code(fixture, "NO-MAT"),
        `${fixture.prefix} No Template Material`,
        fixture.noTemplateCategoryId,
      ],
    );
    await client.query(
      `INSERT INTO inventory_transactions
       (id, transaction_type, material_id, quantity, uom, stock_state,
        source_document_type, source_document_id, created_by)
       VALUES ($1, 'ADJUSTMENT_IN', $2, '1', 'PCS', 'available', $3, $4, $5)`,
      [
        randomUUID(),
        fixture.materialId,
        `${fixture.prefix}-ACTIVITY`,
        fixture.sourceDocumentId,
        fixture.directorId,
      ],
    );
    await client.query("COMMIT");

    fixture.directorCookie = await login(email("director"));
    fixture.supervisorCookie = await login(email("supervisor"));
    fixture.viewerCookie = await login(email("viewer"));

    await run("71C-01 RBAC matrix", async () => {
      const directorCreate = await request("/api/masters/units", fixture.directorCookie, {
        method: "POST",
        body: JSON.stringify({
          unit_code: code(fixture, "U"),
          dimension: "ELECTRICAL_CAPACITY",
          canonical_unit: "AH",
          conversion_factor: 1,
        }),
      });
      assert(directorCreate.response.status === 201, `Director unit mutation failed: ${JSON.stringify(directorCreate.body)}`);
      fixture.unitId = directorCreate.body.id;

      const supervisorWrite = await request("/api/masters/units", fixture.supervisorCookie, {
        method: "POST",
        body: JSON.stringify({
          unit_code: code(fixture, "SUP-U"),
          dimension: "ELECTRICAL_CAPACITY",
          canonical_unit: "AH",
          conversion_factor: 1,
        }),
      });
      assert(supervisorWrite.response.status === 403, `Supervisor mutation was not denied: ${JSON.stringify(supervisorWrite.body)}`);

      const viewerWrite = await request("/api/masters/units", fixture.viewerCookie, {
        method: "POST",
        body: JSON.stringify({
          unit_code: code(fixture, "VIEW-U"),
          dimension: "ELECTRICAL_CAPACITY",
          canonical_unit: "AH",
          conversion_factor: 1,
        }),
      });
      assert(viewerWrite.response.status === 403, `Viewer mutation was not denied: ${JSON.stringify(viewerWrite.body)}`);

      const viewerRead = await request("/api/masters/units", fixture.viewerCookie);
      const supervisorRead = await request("/api/masters/material-attributes", fixture.supervisorCookie);
      const anonymousWrite = await request("/api/masters/units", undefined, {
        method: "POST",
        body: JSON.stringify({
          unit_code: code(fixture, "ANON-U"),
          dimension: "ELECTRICAL_CAPACITY",
          canonical_unit: "AH",
          conversion_factor: 1,
        }),
      });
      assert(viewerRead.response.status === 200, "Authenticated viewer read was rejected");
      assert(supervisorRead.response.status === 200, "Authenticated supervisor read was rejected");
      assert(anonymousWrite.response.status === 401, "Anonymous mutation was not rejected");
    });

    await run("71C-02 attribute integrity activation", async () => {
      const invalid = await request("/api/masters/material-attributes", fixture.directorCookie, {
        method: "POST",
        body: JSON.stringify({
          code: `${fixture.codePrefix.toLowerCase()}_bad_attr`,
          name: `${fixture.prefix} Invalid Dropdown`,
          data_type: "DROPDOWN",
          scope: "RECEIPT_LINE",
        }),
      });
      assert(invalid.response.status === 201, "Invalid dropdown draft was not created");
      fixture.badAttributeId = invalid.body.id;

      const failedActivation = await request(
        `/api/masters/material-attributes/${fixture.badAttributeId}/activate`,
        fixture.directorCookie,
        { method: "POST", body: "{}" },
      );
      assert(
        failedActivation.response.status === 422 &&
          failedActivation.body.error === "TEMPLATE_INTEGRITY" &&
          failedActivation.body.checks.includes("DROPDOWN requires non-empty allowed_values"),
        `Dropdown integrity failure did not identify its check: ${JSON.stringify(failedActivation.body)}`,
      );

      const fixed = await request(`/api/masters/material-attributes/${fixture.badAttributeId}`, fixture.directorCookie, {
        method: "PATCH",
        body: JSON.stringify({ allowed_values: ["PASS", "FAIL"] }),
      });
      assert(fixed.response.status === 200, `Dropdown fix failed: ${JSON.stringify(fixed.body)}`);
      const activated = await request(
        `/api/masters/material-attributes/${fixture.badAttributeId}/activate`,
        fixture.directorCookie,
        { method: "POST", body: "{}" },
      );
      assert(activated.response.status === 200, `Fixed dropdown did not activate: ${JSON.stringify(activated.body)}`);

      const valid = await request("/api/masters/material-attributes", fixture.directorCookie, {
        method: "POST",
        body: JSON.stringify({
          code: `${fixture.codePrefix.toLowerCase()}_valid_attr`,
          name: `${fixture.prefix} Valid Decimal`,
          data_type: "DECIMAL",
          scope: "RECEIPT_LINE",
          unit_code: code(fixture, "U"),
          precision: 6,
          scale: 2,
          min_value: 0,
          max_value: 999,
        }),
      });
      assert(valid.response.status === 201, `Valid attribute draft failed: ${JSON.stringify(valid.body)}`);
      fixture.validAttributeId = valid.body.id;
      const validActivation = await request(
        `/api/masters/material-attributes/${fixture.validAttributeId}/activate`,
        fixture.directorCookie,
        { method: "POST", body: "{}" },
      );
      assert(validActivation.response.status === 200, `Valid attribute did not activate: ${JSON.stringify(validActivation.body)}`);
    });

    await run("71C-03 template integrity and preview", async () => {
      const emptyTemplate = await request("/api/masters/attribute-templates", fixture.directorCookie, {
        method: "POST",
        body: JSON.stringify({ code: templateCode(fixture, "empty"), name: `${fixture.prefix} Empty Template` }),
      });
      assert(emptyTemplate.response.status === 201, "Empty template create failed");
      fixture.emptyTemplateId = emptyTemplate.body.id;
      const emptyVersion = await request(`/api/masters/attribute-templates/${fixture.emptyTemplateId}/versions`, fixture.directorCookie, {
        method: "POST",
        body: JSON.stringify({ version_no: 1, effective_from: "2026-01-01T00:00:00.000Z" }),
      });
      assert(emptyVersion.response.status === 201, "Empty template version create failed");
      fixture.emptyVersionId = emptyVersion.body.id;
      const emptyActivation = await request(`/api/masters/attribute-templates/versions/${fixture.emptyVersionId}/activate`, fixture.directorCookie, {
        method: "POST",
        body: "{}",
      });
      assert(
        emptyActivation.response.status === 422 &&
          emptyActivation.body.checks.includes("template version requires at least one attribute"),
        `Empty version integrity check failed: ${JSON.stringify(emptyActivation.body)}`,
      );
      const emptyFirstField = await request(`/api/masters/attribute-templates/versions/${fixture.emptyVersionId}/attributes`, fixture.directorCookie, {
        method: "POST",
        body: JSON.stringify({ attribute_id: fixture.validAttributeId, required: true, sequence: 1 }),
      });
      assert(emptyFirstField.response.status === 201, "Sequence-check first field add failed");

      const inactive = await request("/api/masters/material-attributes", fixture.directorCookie, {
        method: "POST",
        body: JSON.stringify({
          code: `${fixture.codePrefix.toLowerCase()}_inactive_attr`,
          name: `${fixture.prefix} Inactive Attribute`,
          data_type: "TEXT",
          scope: "RECEIPT_LINE",
        }),
      });
      assert(inactive.response.status === 201, "Inactive attribute draft failed");
      fixture.inactiveAttributeId = inactive.body.id;
      const inactiveTemplate = await request("/api/masters/attribute-templates", fixture.directorCookie, {
        method: "POST",
        body: JSON.stringify({ code: templateCode(fixture, "inactive"), name: `${fixture.prefix} Inactive Template` }),
      });
      assert(inactiveTemplate.response.status === 201, "Inactive template create failed");
      fixture.inactiveTemplateId = inactiveTemplate.body.id;
      const inactiveVersion = await request(`/api/masters/attribute-templates/${fixture.inactiveTemplateId}/versions`, fixture.directorCookie, {
        method: "POST",
        body: JSON.stringify({ version_no: 1, effective_from: "2026-01-01T00:00:00.000Z" }),
      });
      assert(inactiveVersion.response.status === 201, "Inactive template version create failed");
      fixture.inactiveVersionId = inactiveVersion.body.id;
      const inactiveField = await request(`/api/masters/attribute-templates/versions/${fixture.inactiveVersionId}/attributes`, fixture.directorCookie, {
        method: "POST",
        body: JSON.stringify({ attribute_id: fixture.inactiveAttributeId, required: true, sequence: 1 }),
      });
      assert(inactiveField.response.status === 201, "Inactive template field add failed");
      const inactiveActivation = await request(`/api/masters/attribute-templates/versions/${fixture.inactiveVersionId}/activate`, fixture.directorCookie, {
        method: "POST",
        body: "{}",
      });
      assert(
        inactiveActivation.response.status === 422 &&
          inactiveActivation.body.checks.includes("every template attribute must be ACTIVE"),
        `Inactive attribute integrity check failed: ${JSON.stringify(inactiveActivation.body)}`,
      );
      const emptySecondField = await request(`/api/masters/attribute-templates/versions/${fixture.emptyVersionId}/attributes`, fixture.directorCookie, {
        method: "POST",
        body: JSON.stringify({ attribute_id: fixture.badAttributeId, required: true, sequence: 1 }),
      });
      assert(emptySecondField.response.status === 201, "Sequence-check second field add failed");
      const duplicateSequence = await request(`/api/masters/attribute-templates/versions/${fixture.emptyVersionId}/activate`, fixture.directorCookie, {
        method: "POST",
        body: "{}",
      });
      assert(
        duplicateSequence.response.status === 422 &&
          duplicateSequence.body.checks.includes("template attribute sequences must be unique"),
        `Duplicate sequence integrity check failed: ${JSON.stringify(duplicateSequence.body)}`,
      );

      const categoryTemplate = await request("/api/masters/attribute-templates", fixture.directorCookie, {
        method: "POST",
        body: JSON.stringify({ code: templateCode(fixture, "category"), name: `${fixture.prefix} Category Template` }),
      });
      assert(categoryTemplate.response.status === 201, "Category template create failed");
      fixture.categoryTemplateId = categoryTemplate.body.id;
      const categoryV1 = await request(`/api/masters/attribute-templates/${fixture.categoryTemplateId}/versions`, fixture.directorCookie, {
        method: "POST",
        body: JSON.stringify({
          version_no: 1,
          effective_from: "2026-01-01T00:00:00.000Z",
          effective_to: "2026-06-01T00:00:00.000Z",
        }),
      });
      assert(categoryV1.response.status === 201, "Category v1 create failed");
      fixture.categoryV1Id = categoryV1.body.id;
      const categoryField = await request(`/api/masters/attribute-templates/versions/${fixture.categoryV1Id}/attributes`, fixture.directorCookie, {
        method: "POST",
        body: JSON.stringify({ attribute_id: fixture.validAttributeId, required: true, sequence: 1 }),
      });
      assert(categoryField.response.status === 201, "Category v1 field add failed");
      const categoryActivation = await request(`/api/masters/attribute-templates/versions/${fixture.categoryV1Id}/activate`, fixture.directorCookie, {
        method: "POST",
        body: "{}",
      });
      assert(categoryActivation.response.status === 200, "Category v1 activation failed");

      const categoryV2 = await request(`/api/masters/attribute-templates/${fixture.categoryTemplateId}/versions`, fixture.directorCookie, {
        method: "POST",
        body: JSON.stringify({
          version_no: 2,
          effective_from: "2026-05-01T00:00:00.000Z",
          effective_to: "2026-12-31T00:00:00.000Z",
        }),
      });
      assert(categoryV2.response.status === 201, "Category v2 create failed");
      fixture.categoryV2Id = categoryV2.body.id;
      const categoryV2Field = await request(`/api/masters/attribute-templates/versions/${fixture.categoryV2Id}/attributes`, fixture.directorCookie, {
        method: "POST",
        body: JSON.stringify({ attribute_id: fixture.validAttributeId, required: true, sequence: 1 }),
      });
      assert(categoryV2Field.response.status === 201, "Category v2 field add failed");
      const preview = await request(`/api/masters/attribute-templates/versions/${fixture.categoryV1Id}/preview`, fixture.viewerCookie);
      assert(
        preview.response.status === 200 &&
          preview.body.fields[0].attribute_code === `${fixture.codePrefix.toLowerCase()}_valid_attr` &&
          preview.body.generated_csv.columns.includes(`${fixture.codePrefix.toLowerCase()}_valid_attr`) &&
          preview.body.generated_csv_columns.includes("quantity"),
        `Preview contract is incomplete: ${JSON.stringify(preview.body)}`,
      );
    });

    await run("71C-04 effective-date overlap and boundary activation", async () => {
      const overlap = await request(`/api/masters/attribute-templates/versions/${fixture.categoryV2Id}/activate`, fixture.directorCookie, {
        method: "POST",
        body: "{}",
      });
      assert(overlap.response.status === 409 && overlap.body.error === "EFFECTIVE_RANGE_OVERLAP", `Overlap was not rejected: ${JSON.stringify(overlap.body)}`);

      const adjusted = await request(`/api/masters/attribute-templates/versions/${fixture.categoryV2Id}`, fixture.directorCookie, {
        method: "PATCH",
        body: JSON.stringify({ effective_from: "2026-06-01T00:00:00.000Z", effective_to: null }),
      });
      assert(adjusted.response.status === 200, `Boundary date adjustment failed: ${JSON.stringify(adjusted.body)}`);
      const activated = await request(`/api/masters/attribute-templates/versions/${fixture.categoryV2Id}/activate`, fixture.directorCookie, {
        method: "POST",
        body: "{}",
      });
      assert(activated.response.status === 200, `Boundary version did not activate: ${JSON.stringify(activated.body)}`);
    });

    await run("71C-05 mapping scope and precedence", async () => {
      const categoryMapping = await request("/api/masters/material-template-mappings", fixture.directorCookie, {
        method: "POST",
        body: JSON.stringify({
          scope: "CATEGORY",
          category_id: fixture.categoryId,
          template_id: fixture.categoryTemplateId,
          effective_from: "2026-01-01T00:00:00.000Z",
        }),
      });
      assert(categoryMapping.response.status === 201, "Category mapping create failed");
      fixture.categoryMappingId = categoryMapping.body.id;

      const invalidShape = await request("/api/masters/material-template-mappings", fixture.directorCookie, {
        method: "POST",
        body: JSON.stringify({
          scope: "MATERIAL",
          material_id: fixture.materialId,
          category_id: fixture.categoryId,
          template_id: fixture.categoryTemplateId,
        }),
      });
      assert(invalidShape.response.status === 400, "Invalid mapping scope shape was accepted");

      const duplicateCategory = await request("/api/masters/material-template-mappings", fixture.directorCookie, {
        method: "POST",
        body: JSON.stringify({
          scope: "CATEGORY",
          category_id: fixture.categoryId,
          template_id: fixture.emptyTemplateId,
        }),
      });
      assert(
        duplicateCategory.response.status === 409 &&
          duplicateCategory.body.error === "AMBIGUOUS_CONFIGURATION" &&
          duplicateCategory.body.details?.winning_scope === "CATEGORY",
        `Duplicate active mapping did not identify ambiguity: ${JSON.stringify(duplicateCategory.body)}`,
      );

      const categoryResolved = await request(
        `/api/masters/resolve-template?material_id=${fixture.materialId}&date=2026-03-01T00:00:00.000Z`,
        fixture.viewerCookie,
      );
      assert(
        categoryResolved.response.status === 200 &&
          categoryResolved.body.kind === "OK" &&
          categoryResolved.body.template_id === fixture.categoryTemplateId &&
          categoryResolved.body.template_version_id === fixture.categoryV1Id,
        `Category fallback resolution failed: ${JSON.stringify(categoryResolved.body)}`,
      );

      const materialTemplate = await request("/api/masters/attribute-templates", fixture.directorCookie, {
        method: "POST",
        body: JSON.stringify({ code: templateCode(fixture, "material"), name: `${fixture.prefix} Material Template` }),
      });
      assert(materialTemplate.response.status === 201, "Material template create failed");
      fixture.materialTemplateId = materialTemplate.body.id;
      const materialVersion = await request(`/api/masters/attribute-templates/${fixture.materialTemplateId}/versions`, fixture.directorCookie, {
        method: "POST",
        body: JSON.stringify({ version_no: 1, effective_from: "2026-01-01T00:00:00.000Z" }),
      });
      assert(materialVersion.response.status === 201, "Material template version create failed");
      fixture.materialV1Id = materialVersion.body.id;
      const materialField = await request(`/api/masters/attribute-templates/versions/${fixture.materialV1Id}/attributes`, fixture.directorCookie, {
        method: "POST",
        body: JSON.stringify({ attribute_id: fixture.validAttributeId, required: true, sequence: 1 }),
      });
      assert(materialField.response.status === 201, "Material template field add failed");
      const materialActivation = await request(`/api/masters/attribute-templates/versions/${fixture.materialV1Id}/activate`, fixture.directorCookie, {
        method: "POST",
        body: "{}",
      });
      assert(materialActivation.response.status === 200, "Material template version activation failed");

      const materialMapping = await request("/api/masters/material-template-mappings", fixture.directorCookie, {
        method: "POST",
        body: JSON.stringify({
          scope: "MATERIAL",
          material_id: fixture.materialId,
          template_id: fixture.materialTemplateId,
          effective_from: "2026-01-01T00:00:00.000Z",
        }),
      });
      assert(materialMapping.response.status === 201, "Material mapping create failed");
      fixture.materialMappingId = materialMapping.body.id;

      const materialResolved = await request(
        `/api/masters/resolve-template?material_id=${fixture.materialId}&date=2026-03-01T00:00:00.000Z`,
        fixture.viewerCookie,
      );
      assert(
        materialResolved.response.status === 200 &&
          materialResolved.body.kind === "OK" &&
          materialResolved.body.template_id === fixture.materialTemplateId &&
          materialResolved.body.template_version_id === fixture.materialV1Id,
        `Material precedence resolution failed: ${JSON.stringify(materialResolved.body)}`,
      );
    });

    await run("71C-06 date-sensitive resolution and no-template result", async () => {
      const before = await request(
        `/api/masters/resolve-template?material_id=${fixture.noTemplateMaterialId}&date=2026-03-01T00:00:00.000Z`,
        fixture.viewerCookie,
      );
      const after = await request(
        `/api/masters/resolve-template?material_id=${fixture.noTemplateMaterialId}&date=2026-07-01T00:00:00.000Z`,
        fixture.viewerCookie,
      );
      assert(
        before.response.status === 200 &&
          before.body.kind === "NO_TEMPLATE",
        `Unmapped material unexpectedly inherited a template: ${JSON.stringify(before.body)}`,
      );

      const dateBefore = await request(
        `/api/masters/resolve-template?material_id=${fixture.dateMaterialId}&date=2026-03-01T00:00:00.000Z`,
        fixture.viewerCookie,
      );
      const dateAfter = await request(
        `/api/masters/resolve-template?material_id=${fixture.dateMaterialId}&date=2026-07-01T00:00:00.000Z`,
        fixture.viewerCookie,
      );
      assert(
        dateBefore.response.status === 200 &&
          dateAfter.response.status === 200 &&
          dateBefore.body.template_id === fixture.categoryTemplateId &&
          dateBefore.body.template_version_id === fixture.categoryV1Id &&
          dateAfter.body.template_id === fixture.categoryTemplateId &&
          dateAfter.body.template_version_id === fixture.categoryV2Id,
        `Date-sensitive version resolution failed: before=${JSON.stringify(dateBefore.body)} after=${JSON.stringify(dateAfter.body)}`,
      );

      const unknown = await request(`/api/masters/resolve-template?material_id=${randomUUID()}`, fixture.viewerCookie);
      assert(unknown.response.status === 200 && unknown.body.kind === "NO_TEMPLATE", `Unknown material did not return NO_TEMPLATE: ${JSON.stringify(unknown.body)}`);
    });

    await run("71C-07 profile transition guard", async () => {
      const created = await request(`/api/masters/material-inventory-profiles/${fixture.materialId}`, fixture.directorCookie, {
        method: "PUT",
        body: JSON.stringify({ tracking_mode: "LOT" }),
      });
      assert(created.response.status === 200 && created.body.tracking_mode === "LOT", `Profile create failed: ${JSON.stringify(created.body)}`);

      const sameMode = await request(`/api/masters/material-inventory-profiles/${fixture.materialId}`, fixture.directorCookie, {
        method: "PUT",
        body: JSON.stringify({ tracking_mode: "LOT" }),
      });
      assert(sameMode.response.status === 200, `Idempotent profile upsert failed: ${JSON.stringify(sameMode.body)}`);

      const unsafe = await request(`/api/masters/material-inventory-profiles/${fixture.materialId}`, fixture.directorCookie, {
        method: "PUT",
        body: JSON.stringify({ tracking_mode: "SERIAL" }),
      });
      assert(unsafe.response.status === 409 && unsafe.body.error === "UNSAFE_TRANSITION", `Unsafe profile transition was not blocked: ${JSON.stringify(unsafe.body)}`);
    });

    await run("71C-08 outbox evidence", async () => {
      const aggregateIds = [
        fixture.unitId,
        fixture.badAttributeId,
        fixture.validAttributeId,
        fixture.inactiveAttributeId,
        fixture.emptyTemplateId,
        fixture.inactiveTemplateId,
        fixture.categoryTemplateId,
        fixture.materialTemplateId,
        fixture.categoryV1Id,
        fixture.categoryV2Id,
        fixture.materialV1Id,
        fixture.emptyVersionId,
        fixture.inactiveVersionId,
        fixture.categoryMappingId,
        fixture.materialMappingId,
        fixture.materialId,
      ].filter(Boolean);
      const events = await client.query(
        `SELECT event_type, aggregate_id::text AS aggregate_id, payload
         FROM outbox_events
         WHERE aggregate_id = ANY($1::uuid[])`,
        [aggregateIds],
      );
      const eventTypes = new Set(events.rows.map((row: any) => row.event_type));
      for (const expected of [
        "UNIT_UPSERTED",
        "ATTRIBUTE_CREATED",
        "ATTRIBUTE_UPDATED",
        "ATTRIBUTE_ACTIVATED",
        "TEMPLATE_CREATED",
        "TEMPLATE_VERSION_CREATED",
        "TEMPLATE_VERSION_ATTRIBUTE_ADDED",
        "TEMPLATE_VERSION_UPDATED",
        "TEMPLATE_VERSION_ACTIVATED",
        "MAPPING_CREATED",
        "PROFILE_UPSERTED",
      ]) {
        assert(eventTypes.has(expected), `Missing outbox event ${expected}`);
      }
      assert(events.rows.every((row: any) => row.payload && typeof row.payload === "object"), "Outbox payload evidence is missing");
    });

    await run("71C-09 security audit evidence", async () => {
      const actorIds = [fixture.directorId, fixture.supervisorId, fixture.viewerId];
      await waitFor(async () => {
        const result = await client.query(
          `SELECT event_type, actor_id::text AS actor_id, status_code, path
           FROM security_events
           WHERE actor_id = ANY($1::uuid[])
             AND created_at > NOW() - INTERVAL '10 minutes'
             AND (event_type LIKE 'capture.%' OR event_type = 'authz.denied')`,
          [actorIds],
        );
        const types = new Set(result.rows.map((row: any) => row.event_type));
        return types.has("capture.unit.created") &&
          types.has("capture.attribute.activated") &&
          types.has("capture.template_version.activated") &&
          types.has("capture.mapping.created") &&
          types.has("capture.profile.upserted") &&
          result.rows.some((row: any) => row.event_type === "authz.denied" && Number(row.status_code) === 403);
      }, "71-C security events");
    });
  } catch (error) {
    primaryError = error;
  }

  try {
    await cleanup(client, fixture);
    passed += 1;
    console.log("71C-10 teardown residuals PASS");
  } catch (error) {
    if (!primaryError) primaryError = error;
    console.error(`71-C teardown failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    client.release();
    await pool.end();
  }

  if (primaryError) {
    throw primaryError;
  }
  console.log(JSON.stringify({ result: "PASS", cases: passed, fixture_prefix: fixture.prefix }, null, 2));
}

main().catch((error) => {
  console.error(`✗ 71-C configuration certification failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});