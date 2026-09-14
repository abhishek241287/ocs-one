import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import "../lib/universal-capture/grn-adapter";

const BASE = "http://localhost:8080";
const password = "P71D-Ledger-2026!";
const suffix = randomUUID().slice(0, 8).toUpperCase();
const prefix = `P71D-L-${suffix}`;
const lower = prefix.toLowerCase();
const id = {
  user: randomUUID(), supplier: randomUUID(), category: randomUUID(), material: randomUUID(),
  unit: randomUUID(), attr: randomUUID(), template: randomUUID(), version: randomUUID(),
  templateAttr: randomUUID(), workflow: randomUUID(), assignment: randomUUID(),
};
const email = `${lower}@cert.local`;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
async function request(path: string, cookie: string | undefined, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("Cookie", cookie);
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await response.text();
  return { response, body: text ? JSON.parse(text) : null };
}

async function main(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const hash = await bcrypt.hash(password, 10);
    await client.query(
      `INSERT INTO users (id,email,password_hash,name,role,is_active) VALUES ($1,$2,$3,$4,'director',true)`,
      [id.user, email, hash, `${prefix} Director`],
    );
    await client.query(
      `INSERT INTO master_suppliers (id,code,name,status,revision_number,created_by) VALUES ($1,$2,$3,'active',1,$4)`,
      [id.supplier, `${prefix}-SUP`, `${prefix} Supplier`, id.user],
    );
    await client.query(
      `INSERT INTO master_material_categories (id,code,name,status,revision_number,engineering_master_required,created_by)
       VALUES ($1,$2,$3,'active',1,false,$4)`,
      [id.category, `${prefix}-CAT`, `${prefix} Category`, id.user],
    );
    await client.query(
      `INSERT INTO master_materials (id,code,name,category_id,uom,usage_type,status,revision_number,created_by)
       VALUES ($1,$2,$3,$4,'PCS','CONSUMABLE','active',1,$5)`,
      [id.material, `${prefix}-MAT`, `${prefix} Material`, id.category, id.user],
    );
    await client.query(
      `INSERT INTO material_workflows (id,code,name,post_receipt_action,status,revision_number,created_by)
       VALUES ($1,$2,$3,'DIRECT_TO_INVENTORY','active',1,$4)`,
      [id.workflow, `${prefix}-WF`, `${prefix} Workflow`, id.user],
    );
    await client.query(
      `INSERT INTO material_workflow_assignments (id,category_id,workflow_id,created_by,updated_by)
       VALUES ($1,$2,$3,$4,$4)`,
      [id.assignment, id.category, id.workflow, id.user],
    );
    await client.query(
      `INSERT INTO unit_definitions (id,unit_code,dimension,canonical_unit,conversion_factor,active)
       VALUES ($1,$2,'ELECTRICAL_CAPACITY','AH','1',true)`,
      [id.unit, `${prefix}-AH`],
    );
    await client.query(
      `INSERT INTO attribute_definitions
       (id,code,name,data_type,scope,unit_code,precision,scale,status,created_by)
       VALUES ($1,$2,$3,'DECIMAL','RECEIPT_LINE',$4,8,2,'ACTIVE',$5)`,
      [id.attr, `${lower}_capacity`, `${prefix} Capacity`, `${prefix}-AH`, id.user],
    );
    await client.query(
      `INSERT INTO attribute_templates (id,code,name,status,created_by,updated_by)
       VALUES ($1,$2,$3,'ACTIVE',$4,$4)`,
      [id.template, lower, `${prefix} Template`, id.user],
    );
    await client.query(
      `INSERT INTO attribute_template_versions
       (id,template_id,version_no,status,effective_from,created_by)
       VALUES ($1,$2,1,'ACTIVE',now()-interval '1 minute',$3)`,
      [id.version, id.template, id.user],
    );
    await client.query(
      `INSERT INTO attribute_template_attributes (id,template_version_id,attribute_id,required,sequence)
       VALUES ($1,$2,$3,true,1)`,
      [id.templateAttr, id.version, id.attr],
    );
    await client.query(
      `INSERT INTO material_template_mappings
       (id,scope,category_id,template_id,status,effective_from,created_by)
       VALUES ($1,'CATEGORY',$2,$3,'ACTIVE',now()-interval '1 minute',$4)`,
      [randomUUID(), id.category, id.template, id.user],
    );
    await client.query("COMMIT");

    const login = await request("/api/auth/login", undefined, {
      method: "POST", body: JSON.stringify({ email, password }),
    });
    assert(login.response.status === 200, `login failed: ${JSON.stringify(login.body)}`);
    const token = login.response.headers.get("set-cookie")?.match(/ocs_token=([^;]+)/)?.[1];
    assert(token, "missing auth cookie");
    const cookie = `ocs_token=${token}`;
    const common = { supplier_id: id.supplier, received_date: "2026-09-14", lines: [{ material_id: id.material, quantity_received: 7 }] };
    const captured = await request("/api/inventory/grns", cookie, {
      method: "POST",
      body: JSON.stringify({
        ...common,
        attribute_values: [{
          line_number: 1,
          attributes: [{ attribute_code: `${lower}_capacity`, value: "280", supplied_unit: `${prefix}-AH` }],
        }],
      }),
    });
    const plain = await request("/api/inventory/grns", cookie, { method: "POST", body: JSON.stringify(common) });
    assert(captured.response.status === 201 && plain.response.status === 201, "ledger comparison GRNs failed");
    const capturedPost = await request(`/api/inventory/grns/${captured.body.id}/post`, cookie, { method: "POST" });
    const plainPost = await request(`/api/inventory/grns/${plain.body.id}/post`, cookie, { method: "POST" });
    assert(capturedPost.response.status === 200 && plainPost.response.status === 200, "ledger comparison posting failed");

    const shape = async (grnId: string) => (await client.query(
      `SELECT transaction_type,material_id,quantity,uom,stock_state,source_document_type,(source_line_id IS NOT NULL) AS has_source_line
       FROM inventory_transactions WHERE source_document_id=$1 ORDER BY created_at`,
      [grnId],
    )).rows.map((row) => ({ ...row, quantity: String(row.quantity) }));
    const capturedShape = await shape(captured.body.id);
    const plainShape = await shape(plain.body.id);
    assert(JSON.stringify(capturedShape.map(({ source_line_id: _ignored, ...row }) => row)) === JSON.stringify(plainShape.map(({ source_line_id: _ignored, ...row }) => row)), `ledger shape mismatch: ${JSON.stringify({ capturedShape, plainShape })}`);
    console.log(JSON.stringify({ result: "PASS", case: "captured_vs_no_capture_ledger_shape", fixture_prefix: prefix, rows: capturedShape.length }));
  } finally {
    await client.query("BEGIN").catch(() => undefined);
    try {
      await client.query(`DELETE FROM outbox_events WHERE aggregate_id IN (SELECT id FROM grn_line_items WHERE grn_id IN (SELECT id FROM grn_headers WHERE created_by=$1))`, [id.user]);
      await client.query(`DELETE FROM security_events WHERE actor_id=$1`, [id.user]);
      await client.query(`DELETE FROM inventory_transactions WHERE created_by=$1`, [id.user]);
      await client.query(`DELETE FROM inventory_lots WHERE grn_line_id IN (SELECT id FROM grn_line_items WHERE grn_id IN (SELECT id FROM grn_headers WHERE created_by=$1))`, [id.user]);
      await client.query(`DELETE FROM attribute_capture_values WHERE capture_instance_id IN (SELECT id FROM attribute_capture_instances WHERE material_id=$1)`, [id.material]);
      await client.query(`DELETE FROM attribute_capture_instances WHERE material_id=$1`, [id.material]);
      await client.query(`DELETE FROM grn_headers WHERE created_by=$1`, [id.user]);
      await client.query(`DELETE FROM material_template_mappings WHERE created_by=$1`, [id.user]);
      await client.query(`DELETE FROM attribute_template_attributes WHERE template_version_id=$1`, [id.version]);
      await client.query(`DELETE FROM attribute_template_versions WHERE id=$1`, [id.version]);
      await client.query(`DELETE FROM attribute_templates WHERE id=$1`, [id.template]);
      await client.query(`DELETE FROM attribute_definitions WHERE id=$1`, [id.attr]);
      await client.query(`DELETE FROM unit_definitions WHERE id=$1`, [id.unit]);
      await client.query(`DELETE FROM material_workflow_assignments WHERE id=$1`, [id.assignment]);
      await client.query(`DELETE FROM material_workflows WHERE id=$1`, [id.workflow]);
      await client.query(`DELETE FROM master_materials WHERE id=$1`, [id.material]);
      await client.query(`DELETE FROM master_material_categories WHERE id=$1`, [id.category]);
      await client.query(`DELETE FROM master_suppliers WHERE id=$1`, [id.supplier]);
      await client.query(`DELETE FROM users WHERE id=$1`, [id.user]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
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