import {
  GetMaterialMasterResponse,
  CreateMaterialMasterBody,
  UpdateMaterialMasterBody,
} from "@workspace/api-zod";
import { materialsTable } from "@workspace/db";
import { createMasterRouter } from "./common";

// Material Master (Inventory) — read for any authed user; writes supervisor/director.
// category_id is an FK → master_material_categories; a bad id surfaces as 400 via
// the shared factory's pg-error handler (23503), never a 500.
const router = createMasterRouter({
  table: materialsTable,
  schema: GetMaterialMasterResponse,
  inputSchema: CreateMaterialMasterBody,
  updateSchema: UpdateMaterialMasterBody,
  resourceName: "Material Master",
});

export default router;
