#!/usr/bin/env tsx
/**
 * PO-01..PO-15 Phase 1 procurement integration certification.
 *
 * This suite uses only the Phase 1 purchase-order endpoints.  Its fixture is
 * identified by a unique supplier/material prefix and is removed with set-based
 * statements in finally, so a failed case cannot leave shared test data behind.
 *
 * Run against a running API:
 *   CERT_BASE_URL=http://localhost:80 pnpm --filter @workspace/api-server run test:procurement-po
 */

import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";

const BASE_URL = (process.env.CERT_BASE_URL ?? "http://localhost:80").replace(/\/$/, "");
const PASSWORD = "PO-01!Certification2026";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function body(response: Response): Promise<any> {
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
  return { response, body: await body(response) };
}

function cookieFrom(response: Response): string {
  const value = response.headers.get("set-cookie");
  const token = value?.match(/ocs_token=([^;]+)/)?.[1];
  if (!token) throw new Error("Certification login did not return ocs_token");
  return `ocs_token=${token}`;
}

type Fixture = {
  prefix: string;
  supplierId: string;
  categoryId: string;
  materialId: string;
  supervisorId: string;
  directorId: string;
  viewerId: string;
  supervisorCookie?: string;
  directorCookie?: string;
  viewerCookie?: string;
};

async function main(): Promise<void> {
  const suffix = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`.toUpperCase();
  const fixture: Fixture = {
    prefix: `POCERT-${suffix}`,
    supplierId: randomUUID(),
    categoryId: randomUUID(),
    materialId: randomUUID(),
    supervisorId: randomUUID(),
    directorId: randomUUID(),
    viewerId: randomUUID(),
  };
  const email = (role: string) => `${fixture.prefix.toLowerCase()}-${role}@cert.local`;
  const client = await pool.connect();
  const createdOrders: string[] = [];
  let primaryId: string | null = null;
  let primaryLineId: string | null = null;
  let passed = 0;

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
       VALUES ($1, $2, $3, $4, 'supervisor', true),
              ($5, $6, $3, $7, 'director', true),
              ($8, $9, $3, $10, 'viewer', true)`,
      [
        fixture.supervisorId,
        email("supervisor"),
        passwordHash,
        `${fixture.prefix} Supervisor`,
        fixture.directorId,
        email("director"),
        `${fixture.prefix} Director`,
        fixture.viewerId,
        email("viewer"),
        `${fixture.prefix} Viewer`,
      ],
    );
    await client.query(
      `INSERT INTO master_suppliers (id, code, name, status, created_by)
       VALUES ($1, $2, $3, 'active', $4)`,
      [fixture.supplierId, `${fixture.prefix}-SUP`, `${fixture.prefix} Supplier`, fixture.supervisorId],
    );
    await client.query(
      `INSERT INTO master_material_categories
       (id, code, name, linked_master_type, engineering_master_required, status, created_by)
       VALUES ($1, $2, $3, NULL, false, 'active', $4)`,
      [fixture.categoryId, `${fixture.prefix}-CAT`, `${fixture.prefix} Category`, fixture.supervisorId],
    );
    await client.query(
      `INSERT INTO master_materials
       (id, code, name, category_id, uom, usage_type, status, created_by)
       VALUES ($1, $2, $3, $4, 'PCS', 'CONSUMABLE', 'active', $5)`,
      [
        fixture.materialId,
        `${fixture.prefix}-MAT`,
        `${fixture.prefix} Material`,
        fixture.categoryId,
        fixture.supervisorId,
      ],
    );
    await client.query("COMMIT");

    const supervisorLogin = await request("/api/auth/login", undefined, {
      method: "POST",
      body: JSON.stringify({ email: email("supervisor"), password: PASSWORD }),
    });
    const directorLogin = await request("/api/auth/login", undefined, {
      method: "POST",
      body: JSON.stringify({ email: email("director"), password: PASSWORD }),
    });
    const viewerLogin = await request("/api/auth/login", undefined, {
      method: "POST",
      body: JSON.stringify({ email: email("viewer"), password: PASSWORD }),
    });
    assert(supervisorLogin.response.status === 200, "Supervisor fixture login failed");
    assert(directorLogin.response.status === 200, "Director fixture login failed");
    assert(viewerLogin.response.status === 200, "Viewer fixture login failed");
    fixture.supervisorCookie = cookieFrom(supervisorLogin.response);
    fixture.directorCookie = cookieFrom(directorLogin.response);
    fixture.viewerCookie = cookieFrom(viewerLogin.response);

    const draft = async (cookie = fixture.supervisorCookie) => {
      const result = await request("/api/procurement/purchase-orders", cookie, {
        method: "POST",
        body: JSON.stringify({
          supplier_id: fixture.supplierId,
          currency: "INR",
          lines: [
            { material_id: fixture.materialId, ordered_qty: 2, unit_price: 2.5 },
            { material_id: fixture.materialId, ordered_qty: 4, unit_price: 3 },
          ],
        }),
      });
      assert(
        result.response.status === 201,
        `Draft creation failed: HTTP ${result.response.status} ${JSON.stringify(result.body)}`,
      );
      createdOrders.push(result.body.id);
      return result;
    };

    await run("PO-01 number format and sequence", async () => {
      const result = await draft();
      primaryId = result.body.id;
      primaryLineId = result.body.lines[0].id;
      assert(/^PO-\d{8}-\d{4,}$/.test(result.body.po_number), `Invalid PO number ${result.body.po_number}`);
      const next = await draft();
      const firstSequence = Number(result.body.po_number.split("-").at(-1));
      const nextSequence = Number(next.body.po_number.split("-").at(-1));
      assert(nextSequence === firstSequence + 1, "PO sequence did not advance transactionally");
    });

    await run("PO-02 create/detail CRUD shape", async () => {
      const result = await request(`/api/procurement/purchase-orders/${primaryId}`, fixture.viewerCookie);
      assert(result.response.status === 200 && result.body.id === primaryId, "Detail did not return created PO");
      assert(Array.isArray(result.body.lines) && result.body.lines.length === 2, "Detail line shape is incorrect");
    });

    await run("PO-03 line totals and material UOM", async () => {
      const result = await request(`/api/procurement/purchase-orders/${primaryId}`, fixture.viewerCookie);
      assert(result.body.total_amount === 17, `Expected total 17, got ${result.body.total_amount}`);
      assert(result.body.lines.every((line: any) => line.uom === "PCS"), "Line UOM was not derived from material master");
    });

    await run("PO-04 header edit", async () => {
      const result = await request(`/api/procurement/purchase-orders/${primaryId}`, fixture.supervisorCookie, {
        method: "PATCH",
        body: JSON.stringify({ terms: `${fixture.prefix} Net 30`, notes: "Phase 1 certification" }),
      });
      assert(result.response.status === 200 && result.body.terms.includes("Net 30"), "Draft header edit failed");
    });

    await run("PO-05 line edit/add/delete and synchronized total", async () => {
      const update = await request(`/api/procurement/purchase-orders/${primaryId}/lines/${primaryLineId}`, fixture.supervisorCookie, {
        method: "PATCH",
        body: JSON.stringify({ ordered_qty: 10, unit_price: 4 }),
      });
      assert(update.response.status === 200 && update.body.total_amount === 52, "Line edit did not update total");
      const added = await request(`/api/procurement/purchase-orders/${primaryId}/lines`, fixture.supervisorCookie, {
        method: "POST",
        body: JSON.stringify({ material_id: fixture.materialId, ordered_qty: 1, unit_price: 100 }),
      });
      assert(added.response.status === 200 && added.body.total_amount === 152, "Line add did not update total");
      const addedId = added.body.lines.find((line: any) => line.unit_price === 100)?.id;
      assert(addedId, "Added line was not returned");
      const removed = await request(`/api/procurement/purchase-orders/${primaryId}/lines/${addedId}`, fixture.supervisorCookie, { method: "DELETE" });
      assert(removed.response.status === 200 && removed.body.total_amount === 52, "Line delete did not update total");
    });

    await run("PO-06 role enforcement", async () => {
      const result = await request("/api/procurement/purchase-orders", fixture.viewerCookie, {
        method: "POST",
        body: JSON.stringify({
          supplier_id: fixture.supplierId,
          lines: [{ material_id: fixture.materialId, ordered_qty: 1, unit_price: 1 }],
        }),
      });
      assert(result.response.status === 403, "Viewer was allowed to create a PO");
      const read = await request(`/api/procurement/purchase-orders/${primaryId}`, fixture.viewerCookie);
      assert(read.response.status === 200, "Viewer could not read a PO");
    });

    const submitted = await draft();
    await run("PO-07 valid submit transition", async () => {
      const result = await request(`/api/procurement/purchase-orders/${submitted.body.id}/submit`, fixture.supervisorCookie, { method: "POST" });
      assert(result.response.status === 200 && result.body.status === "submitted", "Draft did not submit");
    });

    await run("PO-08 submit rejects an empty order", async () => {
      const empty = await draft();
      for (const line of empty.body.lines) {
        const remove = await request(`/api/procurement/purchase-orders/${empty.body.id}/lines/${line.id}`, fixture.supervisorCookie, { method: "DELETE" });
        assert(remove.response.status === 200, "Could not remove an empty-order line");
      }
      const result = await request(`/api/procurement/purchase-orders/${empty.body.id}/submit`, fixture.supervisorCookie, { method: "POST" });
      assert(result.response.status === 409, "Empty PO was submitted");
    });

    await run("PO-09 approve role and transition", async () => {
      const denied = await request(`/api/procurement/purchase-orders/${submitted.body.id}/approve`, fixture.supervisorCookie, { method: "POST" });
      assert(denied.response.status === 403, "Supervisor was allowed to approve");
      const result = await request(`/api/procurement/purchase-orders/${submitted.body.id}/approve`, fixture.directorCookie, { method: "POST" });
      assert(result.response.status === 200 && result.body.status === "approved", "Director could not approve");
    });

    await run("PO-10 director cancellation transition", async () => {
      const result = await request(`/api/procurement/purchase-orders/${submitted.body.id}/cancel`, fixture.directorCookie, {
        method: "POST",
        body: JSON.stringify({ reason: "Certification cancellation" }),
      });
      assert(result.response.status === 200 && result.body.status === "cancelled", "Director could not cancel approved PO");
    });

    await run("PO-11 invalid lifecycle transitions", async () => {
      const approve = await request(`/api/procurement/purchase-orders/${submitted.body.id}/approve`, fixture.directorCookie, { method: "POST" });
      assert(approve.response.status === 409, "Cancelled PO was approved");
      const edit = await request(`/api/procurement/purchase-orders/${submitted.body.id}`, fixture.supervisorCookie, {
        method: "PATCH",
        body: JSON.stringify({ notes: "must fail" }),
      });
      assert(edit.response.status === 409, "Cancelled PO was edited");
    });

    await run("PO-12 durable outbox events", async () => {
      const events = await client.query(
        `SELECT event_type, payload FROM outbox_events
         WHERE aggregate_type = 'purchase_order' AND aggregate_id = $1
         ORDER BY occurred_at`,
        [submitted.body.id],
      );
      const types = events.rows.map((row) => row.event_type);
      assert(types.includes("purchase_order.created"), "Create event missing");
      assert(types.includes("purchase_order.submitted"), "Submit event missing");
      assert(types.includes("purchase_order.approved"), "Approve event missing");
      assert(types.includes("purchase_order.cancelled"), "Cancel event missing");
      assert(events.rows.every((row) => row.payload?.actor_id), "Outbox payload is missing actor attribution");
    });

    await run("PO-13 list/detail projections", async () => {
      const list = await request(`/api/procurement/purchase-orders?search=${encodeURIComponent(fixture.prefix)}`, fixture.viewerCookie);
      assert(list.response.status === 200 && list.body.items.length >= 3, "List did not return isolated fixture POs");
      assert(list.body.meta.total >= list.body.items.length, "List metadata is inconsistent");
      assert(Object.hasOwn(list.body.items[0], "po_number") && !Object.hasOwn(list.body.items[0], "poNumber"), "List was not snake_case");
    });

    await run("PO-14 concurrent number uniqueness", async () => {
      const responses = await Promise.all(Array.from({ length: 8 }, () => draft()));
      const numbers = responses.map((result) => result.body.po_number);
      assert(new Set(numbers).size === numbers.length, "Concurrent PO numbers were duplicated");
    });

    await run("PO-15 validation and transition errors", async () => {
      const badId = await request("/api/procurement/purchase-orders/not-a-uuid", fixture.viewerCookie);
      assert(badId.response.status === 400, "Malformed UUID did not return 400");
      const missingReason = await request(`/api/procurement/purchase-orders/${primaryId}/cancel`, fixture.directorCookie, {
        method: "POST",
        body: JSON.stringify({}),
      });
      assert(missingReason.response.status === 400, "Missing cancellation reason did not return 400");
    });

    console.log(JSON.stringify({ result: "PASS", cases: passed, fixture_prefix: fixture.prefix }, null, 2));
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.query("BEGIN");
    const ids = [fixture.supervisorId, fixture.directorId, fixture.viewerId];
    await client.query(`DELETE FROM security_events WHERE actor_id = ANY($1::uuid[])`, [ids]);
    await client.query(
      `DELETE FROM outbox_events
       WHERE aggregate_type = 'purchase_order'
          AND aggregate_id IN (SELECT id FROM purchase_orders WHERE supplier_id = $1)`,
      [fixture.supplierId],
    );
    await client.query(`DELETE FROM purchase_orders WHERE supplier_id = $1`, [fixture.supplierId]);
    await client.query(`DELETE FROM master_materials WHERE id = ANY($1::uuid[])`, [[fixture.materialId]]);
    await client.query(`DELETE FROM master_material_categories WHERE id = ANY($1::uuid[])`, [[fixture.categoryId]]);
    await client.query(`DELETE FROM master_suppliers WHERE id = ANY($1::uuid[])`, [[fixture.supplierId]]);
    await client.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [ids]);
    await client.query("COMMIT").catch(() => undefined);
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`✗ Procurement PO certification failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});