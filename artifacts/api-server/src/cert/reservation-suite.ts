#!/usr/bin/env tsx
/**
 * RES-01..RES-15 reservation and allocation certification.
 *
 * Run against a running API:
 *   CERT_BASE_URL=http://localhost:80 pnpm --filter @workspace/api-server run test:reservation
 */

import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { pool } from "@workspace/db";

const BASE_URL = (
  process.env.OCS_URL ??
  process.env.CERT_BASE_URL ??
  "http://localhost:80"
).replace(/\/$/, "");

const CREDENTIALS: Record<string, { email: string; password: string }> = {
  director: {
    email: process.env.OCS_DIRECTOR_EMAIL ?? "director@ocs.local",
    password: process.env.OCS_DIRECTOR_PASSWORD ?? "change-me",
  },
  supervisor: {
    email: process.env.OCS_SUPERVISOR_EMAIL ?? "supervisor@ocs.local",
    password: process.env.OCS_SUPERVISOR_PASSWORD ?? "change-me",
  },
  operator: {
    email: process.env.OCS_OPERATOR_EMAIL ?? "operator@ocs.local",
    password: process.env.OCS_OPERATOR_PASSWORD ?? "change-me",
  },
  viewer: {
    email: process.env.OCS_VIEWER_EMAIL ?? "viewer@ocs.local",
    password: process.env.OCS_VIEWER_PASSWORD ?? "change-me",
  },
};

const prefix = `RESCERT-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`;
const cookies = new Map<string, string>();
const actorIds: string[] = [];
const materialIds: string[] = [];
const orderIds: string[] = [];
const grnIds: string[] = [];
const lineIds: string[] = [];
const lotIds: string[] = [];
const reservationIds: string[] = [];
const temporaryUserIds: string[] = [];
const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

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

async function call(
  role: string | null,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: any; headers: Headers }> {
  const headers = new Headers();
  const cookie = role ? cookies.get(role) : undefined;
  if (cookie) headers.set("Cookie", cookie);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  const response = await fetch(`${BASE_URL}/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const setCookie = response.headers.get("set-cookie");
  if (role && setCookie) cookies.set(role, setCookie.split(";")[0]);
  return { status: response.status, json: await readBody(response), headers: response.headers };
}

async function login(role: string): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await call(role, "POST", "/auth/login", CREDENTIALS[role]);
    if (result.status === 200) return;
    if (result.status !== 429) {
      throw new Error(`login failed for ${role}: HTTP ${result.status}`);
    }
    const retryAfter = Number(
      result.headers.get("ratelimit-reset") ?? result.headers.get("retry-after"),
    );
    const waitMilliseconds = Math.min(
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000 + 500
        : 2_000,
      65_000,
    );
    console.log(
      `login rate limited for ${role}; waiting ${Math.round(waitMilliseconds / 1000)}s`,
    );
    await sleep(waitMilliseconds);
  }
  throw new Error(`login failed for ${role}: persistent HTTP 429`);
}

function hasExplicitCredentials(role: string): boolean {
  const envPrefix = `OCS_${role.toUpperCase()}`;
  return Boolean(process.env[`${envPrefix}_EMAIL`] && process.env[`${envPrefix}_PASSWORD`]);
}

async function provisionTemporaryUsers(): Promise<void> {
  const passwordHash = await bcrypt.hash(`${prefix}-Certification-Password!`, 10);
  const roles = ["director", "supervisor", "operator", "viewer"];
  for (const role of roles) {
    if (hasExplicitCredentials(role)) continue;
    const id = randomUUID();
    const email = `${prefix.toLowerCase()}-${role}@cert.local`;
    await pool.query(
      `INSERT INTO users (id, email, password_hash, name, role, is_active)
       VALUES ($1, $2, $3, $4, $5, true)`,
      [id, email, passwordHash, `${prefix} ${role}`, role],
    );
    temporaryUserIds.push(id);
    CREDENTIALS[role] = {
      email,
      password: `${prefix}-Certification-Password!`,
    };
  }
}

async function databaseUserId(email: string): Promise<string> {
  const result = await pool.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email]);
  assert(result.rows[0]?.id, `user fixture not found for ${email}`);
  return result.rows[0].id;
}

async function createMaterial(suffix: string, uom = "PCS"): Promise<{
  id: string;
  code: string;
}> {
  const categoryId = randomUUID();
  const materialId = randomUUID();
  await pool.query(
    `INSERT INTO master_material_categories (id, code, name, engineering_master_required)
     VALUES ($1, $2, $3, false)`,
    [categoryId, `${prefix}-CAT-${suffix}`, `${prefix} Category ${suffix}`],
  );
  await pool.query(
    `INSERT INTO master_materials (id, code, name, category_id, uom, usage_type)
     VALUES ($1, $2, $3, $4, $5, 'CONSUMABLE')`,
    [materialId, `${prefix}-MAT-${suffix}`, `${prefix} Material ${suffix}`, categoryId, uom],
  );
  materialIds.push(materialId);
  return { id: materialId, code: `${prefix}-MAT-${suffix}` };
}

async function createOrder(suffix: string): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO mfg_production_orders
       (id, order_number, battery_number, factory_manager, status, priority)
     VALUES ($1, $2, $3, $4, 'draft', 'medium')`,
    [id, `${prefix}-PO-${suffix}`, `${prefix}-BAT-${suffix}`, `${prefix} Manager`],
  );
  orderIds.push(id);
  return id;
}

async function receive(
  materialId: string,
  quantity: number,
  suffix: string,
  options: {
    receivedDate?: string;
    stockState?: "available" | "inspection_pending" | "rejected";
    lotStatus?: "active" | "quarantined" | "rejected" | "consumed" | "expired";
  } = {},
): Promise<{ grnId: string; lineId: string; lotId: string }> {
  const headerId = randomUUID();
  const lineId = randomUUID();
  const lotId = randomUUID();
  const receivedDate = options.receivedDate ?? "2026-09-12";
  const stockState = options.stockState ?? "available";
  const lotStatus = options.lotStatus ?? "active";
  const lotNumber = `${prefix}-LOT-${suffix}`;

  await pool.query(
    `INSERT INTO grn_headers
       (id, grn_number, supplier_id, received_date, status, created_by)
     VALUES ($1, $2, $3, $4, 'posted', $5)`,
    [headerId, `${prefix.slice(0, 12)}-G-${suffix}`, supplierId, receivedDate, supervisorId],
  );
  grnIds.push(headerId);
  await pool.query(
    `INSERT INTO grn_line_items
       (id, grn_id, line_number, material_id, quantity_received, uom, accepted_qty, put_away_qty)
     VALUES ($1, $2, 1, $3, $4, 'PCS', $4, $4)`,
    [lineId, headerId, materialId, quantity],
  );
  lineIds.push(lineId);
  await pool.query(
    `INSERT INTO inventory_lots
       (id, lot_number, material_id, grn_line_id, received_date, status,
        total_received_qty, remaining_qty, uom)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7, 'PCS')`,
    [lotId, lotNumber, materialId, lineId, receivedDate, lotStatus, quantity],
  );
  lotIds.push(lotId);
  await pool.query(
    `INSERT INTO inventory_transactions
       (transaction_type, material_id, quantity, uom, stock_state,
        source_document_type, source_document_id, source_line_id, created_by)
     VALUES ('GRN_RECEIPT', $1, $2, 'PCS', $3, 'GRN', $4, $5, $6)`,
    [materialId, quantity, stockState, headerId, lineId, supervisorId],
  );
  return { grnId: headerId, lineId, lotId };
}

async function createReservation(
  orderId: string,
  materialId: string,
  quantity: number,
  extra: Record<string, unknown> = {},
): Promise<{ status: number; json: any }> {
  const result = await call("supervisor", "POST", "/inventory/reservations", {
    production_order_id: orderId,
    material_id: materialId,
    quantity,
    ...extra,
  });
  if (result.status === 201 && result.json?.id) reservationIds.push(result.json.id);
  return result;
}

async function availableOf(code: string): Promise<number> {
  const result = await call(
    "viewer",
    "GET",
    `/inventory/stock?search=${encodeURIComponent(code)}&stock_state=available&pageSize=200`,
  );
  assert(result.status === 200, `stock read failed: HTTP ${result.status}`);
  return (result.json?.items ?? []).reduce(
    (total: number, row: any) => total + Number(row.quantity ?? 0),
    0,
  );
}

let supplierId = "";
let supervisorId = "";

async function main(): Promise<void> {
  let passed = 0;
  let failed = 0;
  let manual = 0;

  const check = (id: string, condition: boolean, detail = "") => {
    if (condition) {
      passed += 1;
      console.log(`${id}: PASS`);
    } else {
      failed += 1;
      console.log(`${id}: FAIL ${detail}`);
    }
  };

  const note = (id: string, detail: string) => {
    manual += 1;
    console.log(`${id}: MANUAL — ${detail}`);
  };

  try {
    await provisionTemporaryUsers();
    for (const role of ["director", "supervisor", "operator", "viewer"]) {
      await login(role);
    }
    supervisorId = await databaseUserId(CREDENTIALS.supervisor.email);
    actorIds.push(
      await databaseUserId(CREDENTIALS.director.email),
      supervisorId,
      await databaseUserId(CREDENTIALS.operator.email),
      await databaseUserId(CREDENTIALS.viewer.email),
    );
    supplierId = randomUUID();
    await pool.query(
      `INSERT INTO master_suppliers (id, code, name)
       VALUES ($1, $2, $3)`,
      [supplierId, `${prefix}-SUP`, `${prefix} Supplier`],
    );

    // RES-01 Create reservation.
    {
      const material = await createMaterial("R01");
      const order = await createOrder("R01");
      await receive(material.id, 100, "R01");
      const result = await createReservation(order, material.id, 30);
      check(
        "RES-01",
        result.status === 201 &&
          result.json?.status === "active" &&
          /^RSV-\d{8}-\d{4}/.test(result.json?.reservation_number ?? ""),
        `HTTP ${result.status}`,
      );
    }

    // RES-02 Validation and unknown references.
    {
      const material = await createMaterial("R02");
      const order = await createOrder("R02");
      await receive(material.id, 10, "R02");
      const negative = await createReservation(order, material.id, -5);
      const unknownMaterial = await createReservation(
        order,
        "00000000-0000-0000-0000-000000000000",
        5,
      );
      const unknownOrder = await createReservation(
        "00000000-0000-0000-0000-000000000000",
        material.id,
        5,
      );
      check(
        "RES-02",
        negative.status === 400 &&
          unknownMaterial.status === 400 &&
          unknownOrder.status === 400,
        `${negative.status}/${unknownMaterial.status}/${unknownOrder.status}`,
      );
    }

    // RES-03 Strict stock limit and allow_partial cap.
    {
      const material = await createMaterial("R03");
      const order = await createOrder("R03");
      await receive(material.id, 50, "R03");
      const strict = await createReservation(order, material.id, 60);
      const partial = await createReservation(order, material.id, 60, { allow_partial: true });
      check(
        "RES-03",
        strict.status === 409 &&
          strict.json?.error === "INSUFFICIENT_STOCK" &&
          partial.status === 201 &&
          Number(partial.json?.reserved_qty) === 50,
        `${strict.status}/${partial.status}`,
      );
    }

    // RES-04 FIFO allocation across two receipts.
    {
      const material = await createMaterial("R04");
      const order = await createOrder("R04");
      const early = await receive(material.id, 60, "R04-EARLY", {
        receivedDate: "2026-09-11",
      });
      const late = await receive(material.id, 40, "R04-LATE", {
        receivedDate: "2026-09-12",
      });
      const reservation = await createReservation(order, material.id, 80);
      const allocation = await call(
        "supervisor",
        "POST",
        `/inventory/reservations/${reservation.json.id}/allocate`,
      );
      const allocations = allocation.json?.allocations ?? [];
      check(
        "RES-04",
        allocation.status === 200 &&
          allocation.json?.status === "fully_allocated" &&
          allocations.length === 2 &&
          allocations[0]?.grn_line_id === early.lineId &&
          Number(allocations[0]?.quantity) === 60 &&
          allocations[1]?.grn_line_id === late.lineId &&
          Number(allocations[1]?.quantity) === 20,
        JSON.stringify(allocations),
      );
    }

    // RES-05 Partial allocation.
    {
      const material = await createMaterial("R05");
      const order = await createOrder("R05");
      await receive(material.id, 50, "R05");
      const reservation = await createReservation(order, material.id, 50);
      const allocation = await call(
        "supervisor",
        "POST",
        `/inventory/reservations/${reservation.json.id}/allocate`,
        { quantity: 20 },
      );
      check(
        "RES-05",
        allocation.status === 200 &&
          allocation.json?.status === "partially_allocated" &&
          Number(allocation.json?.allocated_qty) === 20,
        JSON.stringify(allocation.json),
      );
    }

    // RES-06 Detail exposes lot and location dimensions.
    {
      const material = await createMaterial("R06");
      const order = await createOrder("R06");
      await receive(material.id, 10, "R06");
      const reservation = await createReservation(order, material.id, 10);
      await call("supervisor", "POST", `/inventory/reservations/${reservation.json.id}/allocate`);
      const detail = await call(
        "viewer",
        "GET",
        `/inventory/reservations/${reservation.json.id}`,
      );
      const allocation = detail.json?.allocations?.[0];
      check(
        "RES-06",
        detail.status === 200 &&
          Boolean(allocation?.lot_id) &&
          String(allocation?.lot_number).startsWith(`${prefix}-LOT-`) &&
          Number(allocation?.quantity) === 10 &&
          Object.prototype.hasOwnProperty.call(allocation, "warehouse_id") &&
          Object.prototype.hasOwnProperty.call(allocation, "location_id") &&
          Object.prototype.hasOwnProperty.call(allocation, "bin_id"),
        JSON.stringify(allocation),
      );
    }

    // RES-07 Release restores reservable quantity and allocation status.
    {
      const material = await createMaterial("R07");
      const order = await createOrder("R07");
      await receive(material.id, 10, "R07");
      const reservation = await createReservation(order, material.id, 10);
      await call("supervisor", "POST", `/inventory/reservations/${reservation.json.id}/allocate`);
      const release = await call(
        "supervisor",
        "POST",
        `/inventory/reservations/${reservation.json.id}/release`,
      );
      const replacement = await createReservation(order, material.id, 10);
      const detail = await call(
        "viewer",
        "GET",
        `/inventory/reservations/${reservation.json.id}`,
      );
      check(
        "RES-07",
        release.status === 200 &&
          release.json?.status === "released" &&
          replacement.status === 201 &&
          (detail.json?.allocations ?? []).every((item: any) => item.status === "released"),
        `${release.status}/${replacement.status}`,
      );
    }

    // RES-08 Cancellation requires a reason and is idempotent.
    {
      const material = await createMaterial("R08");
      const order = await createOrder("R08");
      await receive(material.id, 5, "R08");
      const reservation = await createReservation(order, material.id, 5);
      const noReason = await call(
        "supervisor",
        "POST",
        `/inventory/reservations/${reservation.json.id}/cancel`,
        {},
      );
      const first = await call(
        "supervisor",
        "POST",
        `/inventory/reservations/${reservation.json.id}/cancel`,
        { reason: "certification cancellation" },
      );
      const repeat = await call(
        "supervisor",
        "POST",
        `/inventory/reservations/${reservation.json.id}/cancel`,
        { reason: "different repeat reason" },
      );
      check(
        "RES-08",
        noReason.status === 400 &&
          first.status === 200 &&
          first.json?.status === "cancelled" &&
          repeat.status === 200 &&
          JSON.stringify(repeat.json) === JSON.stringify(first.json),
        `${noReason.status}/${first.status}/${repeat.status}`,
      );
    }

    // RES-09 Invalid lifecycle transitions.
    {
      const material = await createMaterial("R09");
      const order = await createOrder("R09");
      await receive(material.id, 5, "R09");
      const reservation = await createReservation(order, material.id, 5);
      await call("supervisor", "POST", `/inventory/reservations/${reservation.json.id}/release`);
      const allocateAfterRelease = await call(
        "supervisor",
        "POST",
        `/inventory/reservations/${reservation.json.id}/allocate`,
      );
      const doubleRelease = await call(
        "supervisor",
        "POST",
        `/inventory/reservations/${reservation.json.id}/release`,
      );
      check(
        "RES-09",
        allocateAfterRelease.status === 409 && doubleRelease.status === 409,
        `${allocateAfterRelease.status}/${doubleRelease.status}`,
      );
    }

    // RES-10 Competing reservation creators: exactly one winner.
    {
      const material = await createMaterial("R10");
      const order = await createOrder("R10");
      await receive(material.id, 100, "R10");
      const [first, second] = await Promise.all([
        createReservation(order, material.id, 60),
        createReservation(order, material.id, 60),
      ]);
      const statuses = [first.status, second.status].sort();
      const third = await createReservation(order, material.id, 60);
      check(
        "RES-10",
        statuses[0] === 201 && statuses[1] === 409 && third.status === 409,
        `${first.status}/${second.status}/${third.status}`,
      );
    }

    // RES-11 Competing allocations cannot over-allocate a GRN line.
    {
      const material = await createMaterial("R11");
      const orderA = await createOrder("R11-A");
      const orderB = await createOrder("R11-B");
      const received = await receive(material.id, 80, "R11");
      const [reservationA, reservationB] = await Promise.all([
        createReservation(orderA, material.id, 40),
        createReservation(orderB, material.id, 40),
      ]);
      assert(reservationA.status === 201 && reservationB.status === 201, "RES-11 setup reservations failed");
      await pool.query(
        `INSERT INTO inventory_transactions
           (transaction_type, material_id, quantity, uom, stock_state,
            source_document_type, source_document_id, source_line_id, created_by)
         VALUES ('TRANSFER_OUT', $1, -30, 'PCS', 'available', 'GRN', $2, $3, $4)`,
        [material.id, received.grnId, received.lineId, supervisorId],
      );
      await Promise.all([
        call("supervisor", "POST", `/inventory/reservations/${reservationA.json.id}/allocate`),
        call("supervisor", "POST", `/inventory/reservations/${reservationB.json.id}/allocate`),
      ]);
      const detailA = await call("viewer", "GET", `/inventory/reservations/${reservationA.json.id}`);
      const detailB = await call("viewer", "GET", `/inventory/reservations/${reservationB.json.id}`);
      const activeTotal = [
        ...(detailA.json?.allocations ?? []),
        ...(detailB.json?.allocations ?? []),
      ]
        .filter((item: any) => item.status === "active")
        .reduce((total: number, item: any) => total + Number(item.quantity), 0);
      check("RES-11", activeTotal >= 40 && activeTotal <= 50, `active allocation total=${activeTotal}`);
    }

    // RES-12 Pending and quarantined lots cannot be allocated.
    {
      const pendingMaterial = await createMaterial("R12-PENDING");
      const pendingOrder = await createOrder("R12-PENDING");
      await receive(pendingMaterial.id, 30, "R12-PENDING", {
        stockState: "inspection_pending",
      });
      const pending = await createReservation(pendingOrder, pendingMaterial.id, 10);

      const quarantinedMaterial = await createMaterial("R12-QUARANTINE");
      const quarantinedOrder = await createOrder("R12-QUARANTINE");
      const quarantinedLot = await receive(quarantinedMaterial.id, 20, "R12-QUARANTINE", {
        lotStatus: "quarantined",
      });
      const quarantined = await createReservation(quarantinedOrder, quarantinedMaterial.id, 10);
      const allocation = await call(
        "supervisor",
        "POST",
        `/inventory/reservations/${quarantined.json.id}/allocate`,
      );
      const lotStatus = await pool.query<{ status: string }>(
        "SELECT status FROM inventory_lots WHERE id = $1",
        [quarantinedLot.lotId],
      );
      check(
        "RES-12",
        pending.status === 409 &&
          pending.json?.error === "INSUFFICIENT_STOCK" &&
          quarantined.status === 201 &&
          allocation.status === 409 &&
          lotStatus.rows[0]?.status === "quarantined",
        `${pending.status}/${quarantined.status}/${allocation.status}`,
      );
    }

    // RES-13 Reservation lifecycle does not alter physical ledger availability.
    {
      const material = await createMaterial("R13");
      const order = await createOrder("R13");
      await receive(material.id, 40, "R13");
      const before = await availableOf(material.code);
      const reservation = await createReservation(order, material.id, 10);
      await call("supervisor", "POST", `/inventory/reservations/${reservation.json.id}/allocate`);
      await call("supervisor", "POST", `/inventory/reservations/${reservation.json.id}/release`);
      const after = await availableOf(material.code);
      check("RES-13", before === 40 && after === 40, `before=${before} after=${after}`);
    }

    // RES-14 Transactional outbox evidence for the lifecycle.
    {
      const material = await createMaterial("R14");
      const order = await createOrder("R14");
      await receive(material.id, 3, "R14");
      const reservation = await createReservation(order, material.id, 3);
      await call("supervisor", "POST", `/inventory/reservations/${reservation.json.id}/allocate`);
      await call("supervisor", "POST", `/inventory/reservations/${reservation.json.id}/release`);
      const events = await pool.query<{ event_type: string; count: string }>(
        `SELECT event_type, COUNT(*)::text AS count
         FROM outbox_events
         WHERE aggregate_id = $1
         GROUP BY event_type`,
        [reservation.json.id],
      );
      const byType = Object.fromEntries(events.rows.map((row) => [row.event_type, Number(row.count)]));
      check(
        "RES-14",
        byType.RESERVATION_CREATED === 1 &&
          byType.RESERVATION_ALLOCATED === 1 &&
          byType.RESERVATION_RELEASED === 1,
        JSON.stringify(byType),
      );
    }

    // RES-15 Authorization: only supervisor/director writes; viewer reads.
    {
      const material = await createMaterial("R15");
      const order = await createOrder("R15");
      await receive(material.id, 2, "R15");
      const body = { production_order_id: order, material_id: material.id, quantity: 1 };
      const operator = await call("operator", "POST", "/inventory/reservations", body);
      const viewer = await call("viewer", "POST", "/inventory/reservations", body);
      const anonymous = await call(null, "POST", "/inventory/reservations", body);
      const supervisor = await call("supervisor", "POST", "/inventory/reservations", body);
      const viewerRead = await call("viewer", "GET", "/inventory/reservations?pageSize=1");
      check(
        "RES-15",
        operator.status === 403 &&
          viewer.status === 403 &&
          anonymous.status === 401 &&
          supervisor.status === 201 &&
          viewerRead.status === 200,
        `${operator.status}/${viewer.status}/${anonymous.status}/${supervisor.status}/${viewerRead.status}`,
      );
    }

    console.log(
      `\nTOTAL: ${passed} PASS / ${failed} FAIL / ${manual} MANUAL (${passed + failed + manual} verification points)`,
    );
    if (failed > 0) process.exitCode = 1;
  } catch (error) {
    console.error("SUITE ERROR:", error);
    process.exitCode = 1;
  } finally {
    await pool.query("BEGIN").catch(() => undefined);
    try {
      const discoveredReservations = await pool.query<{ id: string; reservation_number: string }>(
        `SELECT id, reservation_number
         FROM inventory_reservations
         WHERE id = ANY($1::uuid[])
            OR production_order_id = ANY($2::uuid[])
            OR material_id = ANY($3::uuid[])`,
        [reservationIds, orderIds, materialIds],
      );
      const cleanupReservationIds = [
        ...new Set(discoveredReservations.rows.map((row) => row.id)),
      ];
      if (cleanupReservationIds.length) {
        const detailPatterns = discoveredReservations.rows.map(
          (row) => `%${row.reservation_number}%`,
        );
        await pool.query(
          `DELETE FROM security_events
           WHERE actor_id = ANY($1::uuid[])
             AND event_type LIKE 'reservation.%'
             AND detail LIKE ANY($2::text[])`,
          [actorIds, detailPatterns],
        );
        await pool.query(
          "DELETE FROM outbox_events WHERE aggregate_id = ANY($1::uuid[])",
          [cleanupReservationIds],
        );
        await pool.query(
          "DELETE FROM inventory_reservation_allocations WHERE reservation_id = ANY($1::uuid[])",
          [cleanupReservationIds],
        );
        await pool.query(
          "DELETE FROM inventory_reservations WHERE id = ANY($1::uuid[])",
          [cleanupReservationIds],
        );
      }
      if (lineIds.length) {
        await pool.query(
          "DELETE FROM inventory_transactions WHERE source_line_id = ANY($1::uuid[])",
          [lineIds],
        );
        await pool.query(
          "DELETE FROM inventory_lots WHERE id = ANY($1::uuid[])",
          [lotIds],
        );
        await pool.query("DELETE FROM grn_line_items WHERE id = ANY($1::uuid[])", [lineIds]);
        await pool.query("DELETE FROM grn_headers WHERE id = ANY($1::uuid[])", [grnIds]);
      }
      if (orderIds.length) {
        await pool.query(
          "DELETE FROM mfg_production_orders WHERE id = ANY($1::uuid[])",
          [orderIds],
        );
      }
      if (materialIds.length) {
        await pool.query(
          "DELETE FROM master_materials WHERE id = ANY($1::uuid[])",
          [materialIds],
        );
      }
      await pool.query("DELETE FROM master_material_categories WHERE code LIKE $1", [
        `${prefix}-CAT-%`,
      ]);
      if (supplierId) {
        await pool.query("DELETE FROM master_suppliers WHERE id = $1", [supplierId]);
      }
      if (temporaryUserIds.length) {
        await pool.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [temporaryUserIds]);
      }
      await pool.query("COMMIT");
    } catch (cleanupError) {
      await pool.query("ROLLBACK").catch(() => undefined);
      console.error("CLEANUP ERROR:", cleanupError);
      process.exitCode = 1;
    }
    await pool.end();
  }
}

void main();