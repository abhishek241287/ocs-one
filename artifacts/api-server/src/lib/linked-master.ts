import { and, eq, ne } from "drizzle-orm";
import {
  db,
  materialsTable,
  materialCategoriesTable,
  masterCellsTable,
  masterBmsTable,
  masterCablesTable,
  masterBusbarsTable,
  masterConnectorsTable,
  masterChargersTable,
  masterCabinetsTable,
  grnLineItemsTable,
  inventoryTransactionsTable,
} from "@workspace/db";
import type { MasterWriteHook } from "../routes/masters/common";

// ─── Generic material → component-master linkage ────────────────────────────
// The procurement (GRN) module is the single source of truth for inventory; a
// material self-describes by linking to ONE component master across 7 families.
// This module centralizes every integrity rule so no route path duplicates it
// (CTO design 2026-06-30: polymorphic link, NO component registry).

export type LinkedMasterType =
  | "CELL"
  | "BMS"
  | "CABLE"
  | "BUSBAR"
  | "CONNECTOR"
  | "CHARGER"
  | "CABINET";

export type MaterialUsageType =
  | "INVENTORY_COMPONENT"
  | "CONSUMABLE"
  | "PACKAGING"
  | "SERVICE_ITEM";

export interface LinkedMasterSummary {
  type: LinkedMasterType;
  id: string;
  code: string;
  name: string;
  status: string;
}

type Dbx = typeof db;

// Exhaustive map family → master table. A `never` default makes adding a family a
// compile error here until the new table is wired in.
function masterTableFor(type: LinkedMasterType) {
  switch (type) {
    case "CELL":
      return masterCellsTable;
    case "BMS":
      return masterBmsTable;
    case "CABLE":
      return masterCablesTable;
    case "BUSBAR":
      return masterBusbarsTable;
    case "CONNECTOR":
      return masterConnectorsTable;
    case "CHARGER":
      return masterChargersTable;
    case "CABINET":
      return masterCabinetsTable;
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown linked master type: ${String(_exhaustive)}`);
    }
  }
}

// Resolve a (type,id) link to a code/name/status summary (read-only, derived).
// Returns null when the row does not exist.
export async function resolveLinkedMaster(
  type: LinkedMasterType,
  id: string,
  dbx: Dbx = db,
): Promise<LinkedMasterSummary | null> {
  const t = masterTableFor(type) as any;
  const [row] = await dbx
    .select({ id: t.id, code: t.code, name: t.name, status: t.status })
    .from(t)
    .where(eq(t.id, id))
    .limit(1);
  if (!row) return null;
  return {
    type,
    id: row.id as string,
    code: row.code as string,
    name: row.name as string,
    status: row.status as string,
  };
}

type ValidationFail = { ok: false; status: number; error: string };
type ValidationResult = { ok: true } | ValidationFail;
const fail = (status: number, error: string): ValidationFail => ({ ok: false, status, error });

// THE single material-write integrity gate (Rule 3). Fail-fast.
//
// The REQUIREMENT to provide a component link is driven SOLELY by the material's
// category `engineeringMasterRequired` flag (UAT refinement 2026-07-01) — no longer
// by Usage Type, and never by hard-coded category names. Usage Type defines inventory
// behavior, not engineering requirements. Every OTHER link check (family declared,
// family match, master exists + active, one-active-per-master) is UNCHANGED and still
// runs whenever a link is present — whether that link is mandatory or an optional one
// supplied for a non-requiring category.
export async function validateLinkedMaster(
  input: {
    categoryId: string;
    linkedMasterType: LinkedMasterType | null;
    linkedMasterId: string | null;
    excludeMaterialId?: string | null;
  },
  dbx: Dbx = db,
): Promise<ValidationResult> {
  const { categoryId, linkedMasterType, linkedMasterId, excludeMaterialId } = input;
  const hasLink = !!(linkedMasterType && linkedMasterId);

  // The category carries the (immutable-per-write) declared family AND the
  // engineeringMasterRequired flag — both read from the SAME row, once.
  const [cat] = await dbx
    .select({
      code: materialCategoriesTable.code,
      family: materialCategoriesTable.linkedMasterType,
      engineeringMasterRequired: materialCategoriesTable.engineeringMasterRequired,
    })
    .from(materialCategoriesTable)
    .where(eq(materialCategoriesTable.id, categoryId))
    .limit(1);
  if (!cat) return fail(400, "Invalid Material Master: category not found.");

  // Check 5 — the LINK REQUIREMENT, conditional on the category flag ONLY.
  if (cat.engineeringMasterRequired && !hasLink) {
    return fail(
      422,
      `Category '${cat.code}' requires a linked component master (set Link Type and Master).`,
    );
  }
  // Optional case: a category that does not require a link, and none was supplied,
  // is valid — imported/finished-goods materials simply carry no component master.
  if (!hasLink) return { ok: true };

  // ── component path (hasLink guaranteed) — all link checks below are UNCHANGED ──
  // Check 4 — category must declare a component family before it can hold components.
  if (!cat.family) {
    return fail(
      422,
      `Category '${cat.code}' has no declared component family; set its Link Type before linking materials.`,
    );
  }
  // Check 3 — the link family must match the category's declared family.
  if (linkedMasterType !== cat.family) {
    return fail(
      422,
      `Link type ${linkedMasterType} does not match category family ${cat.family}.`,
    );
  }

  // Checks 1 + 2 — the linked master EXISTS and is ACTIVE.
  const master = await resolveLinkedMaster(linkedMasterType as LinkedMasterType, linkedMasterId as string, dbx);
  if (!master) return fail(422, `Linked ${linkedMasterType} master not found.`);
  if (master.status !== "active") {
    return fail(422, `Linked ${linkedMasterType} master '${master.code}' is not active.`);
  }

  // Check 6 — at most ONE active material may link to a given master. The partial
  // unique index is the hard guard (race → 23505 → 409); this gives a clear message.
  const conds = [
    eq(materialsTable.linkedMasterType, linkedMasterType as LinkedMasterType),
    eq(materialsTable.linkedMasterId, linkedMasterId as string),
    eq(materialsTable.status, "active"),
  ];
  if (excludeMaterialId) conds.push(ne(materialsTable.id, excludeMaterialId));
  const [dup] = await dbx
    .select({ code: materialsTable.code })
    .from(materialsTable)
    .where(and(...conds))
    .limit(1);
  if (dup) {
    return fail(
      409,
      `This ${linkedMasterType} master is already linked to active material '${dup.code}'. Deactivate it first or pick another master.`,
    );
  }

  return { ok: true };
}

// Rules 4/5 — a material's usage type + component link are IMMUTABLE once it has
// any GRN line or inventory transaction. True = locked.
export async function isMaterialLinkLocked(materialId: string, dbx: Dbx = db): Promise<boolean> {
  const [g] = await dbx
    .select({ id: grnLineItemsTable.id })
    .from(grnLineItemsTable)
    .where(eq(grnLineItemsTable.materialId, materialId))
    .limit(1);
  if (g) return true;
  const [t] = await dbx
    .select({ id: inventoryTransactionsTable.id })
    .from(inventoryTransactionsTable)
    .where(eq(inventoryTransactionsTable.materialId, materialId))
    .limit(1);
  return !!t;
}

// Component masters are ENGINEERING masters, never inventory. Once a master is
// linked to an ACTIVE material that already has transactions, its engineering
// IDENTITY is frozen (changing it would silently re-mean historical GRNs). This
// returns a beforeWrite hook for createMasterRouter that blocks identity-field
// edits in that state (409) while still allowing descriptive edits (name/notes).
export function componentMasterIdentityGuard(
  family: LinkedMasterType,
  identityFields: string[],
): MasterWriteHook {
  return async ({ mode, existing, tx }, values) => {
    if (mode !== "update" || !existing) return;
    const changed = identityFields.some(
      (f) => values[f] !== undefined && String(values[f]) !== String(existing[f]),
    );
    if (!changed) return;

    // The master row is locked FOR UPDATE in `tx`; run the link + lock reads on it
    // so the identity check + write stay atomic (closes the TOCTOU).
    const dbx: Dbx = tx ?? db;
    const [mat] = await dbx
      .select({ id: materialsTable.id, code: materialsTable.code })
      .from(materialsTable)
      .where(
        and(
          eq(materialsTable.linkedMasterType, family),
          eq(materialsTable.linkedMasterId, existing.id as string),
          eq(materialsTable.status, "active"),
        ),
      )
      .limit(1);
    if (!mat) return;

    if (await isMaterialLinkLocked(mat.id, dbx)) {
      return {
        status: 409,
        error: `This ${family} master is in use by active material '${mat.code}' with recorded transactions; its engineering identity is locked. Create a new master and a Rev-2 material to change it. Descriptive fields (name, notes, datasheet) can still be edited.`,
      };
    }
    return;
  };
}
