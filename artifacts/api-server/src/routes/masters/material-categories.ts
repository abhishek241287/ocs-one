import {
  GetMaterialCategoryResponse,
  CreateMaterialCategoryBody,
  UpdateMaterialCategoryBody,
} from "@workspace/api-zod";
import { materialCategoriesTable } from "@workspace/db";
import { createMasterRouter } from "./common";

// Material Category master (Inventory lookup) — read for any authed user;
// writes director-only (mirrors Product Category governance).
const router = createMasterRouter({
  table: materialCategoriesTable,
  schema: GetMaterialCategoryResponse,
  inputSchema: CreateMaterialCategoryBody,
  updateSchema: UpdateMaterialCategoryBody,
  resourceName: "Material Category",
  writeRoles: ["owner", "director"],
});

export default router;
