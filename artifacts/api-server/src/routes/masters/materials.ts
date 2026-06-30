import {
  GetMaterialMasterResponse,
  CreateMaterialMasterBody,
  UpdateMaterialMasterBody,
} from "@workspace/api-zod";
import { materialsTable } from "@workspace/db";
import { createMasterRouter } from "./common";
import {
  validateLinkedMaster,
  isMaterialLinkLocked,
  resolveLinkedMaster,
  type LinkedMasterType,
  type MaterialUsageType,
} from "../../lib/linked-master";

// Material Master (Inventory) — read for any authed user; writes supervisor/director.
// The Material Master is the SINGLE place a material→component-master link is set;
// GRN/inventory derive it read-only. All linkage integrity flows through the shared
// validateLinkedMaster() (Rule 3); Rules 4/5 lock usage/link once the material has
// any GRN or inventory activity (isMaterialLinkLocked). cell_master_id is kept in
// sync for CELL materials so the frozen Receive-From-Inventory flow keeps working.
const router = createMasterRouter({
  table: materialsTable,
  schema: GetMaterialMasterResponse,
  inputSchema: CreateMaterialMasterBody,
  updateSchema: UpdateMaterialMasterBody,
  resourceName: "Material Master",
  beforeWrite: async ({ mode, id, existing, tx }, values) => {
    // On update the row is locked FOR UPDATE in `tx`; run every integrity read on
    // it so the check + write stay atomic (Rule 4/5 TOCTOU). Create has no tx.
    const dbx = tx ?? undefined;
    // Effective values: a PATCH may omit fields, so fall back to the existing row.
    const usageType = (values.usageType ?? existing?.usageType ?? "INVENTORY_COMPONENT") as MaterialUsageType;
    const categoryId = (values.categoryId ?? existing?.categoryId) as string;
    const linkedMasterType = (("linkedMasterType" in values ? values.linkedMasterType : existing?.linkedMasterType) ??
      null) as LinkedMasterType | null;
    const linkedMasterId = (("linkedMasterId" in values ? values.linkedMasterId : existing?.linkedMasterId) ??
      null) as string | null;

    // Rules 4/5 — usage type + link are immutable once the material has activity.
    if (mode === "update" && existing) {
      const changingLockedField =
        (values.usageType !== undefined && values.usageType !== existing.usageType) ||
        ("linkedMasterType" in values && (values.linkedMasterType ?? null) !== (existing.linkedMasterType ?? null)) ||
        ("linkedMasterId" in values && (values.linkedMasterId ?? null) !== (existing.linkedMasterId ?? null));
      if (changingLockedField && (await isMaterialLinkLocked(id!, dbx))) {
        return {
          status: 409,
          error:
            "This material has GRN or inventory activity; its usage type and component link are locked. Create a NEW material (Rev-2) to change them.",
        };
      }
    }

    // Only run linkage validation (and resync cell_master_id) when the write
    // actually touches usage / link / category — a purely descriptive edit (e.g.
    // renaming) must not be blocked by drift in a previously valid link.
    const touchingLinkage =
      mode === "create" ||
      values.usageType !== undefined ||
      "linkedMasterType" in values ||
      "linkedMasterId" in values ||
      values.categoryId !== undefined;

    if (touchingLinkage) {
      const result = await validateLinkedMaster(
        {
          categoryId,
          usageType,
          linkedMasterType,
          linkedMasterId,
          excludeMaterialId: id ?? null,
        },
        dbx,
      );
      if (!result.ok) return { status: result.status, error: result.error };

      // Keep cell_master_id in lockstep with the generic link (CELL only).
      values.cellMasterId = linkedMasterType === "CELL" ? linkedMasterId : null;
      // Persist the effective usage type explicitly when it was defaulted on create.
      if (mode === "create" && values.usageType === undefined) values.usageType = usageType;
    }
    return;
  },
  enrichRow: async (row) => {
    const type = row.linked_master_type as LinkedMasterType | null;
    const linkedId = row.linked_master_id as string | null;
    if (!type || !linkedId) return { linked_master: null };
    const m = await resolveLinkedMaster(type, linkedId);
    return {
      linked_master: m ? { type: m.type, id: m.id, code: m.code, name: m.name } : null,
    };
  },
});

export default router;
