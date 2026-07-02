import {
  GetProductCategoryResponse,
  CreateProductCategoryBody,
  UpdateProductCategoryBody,
} from "@workspace/api-zod";
import { productCategoriesTable } from "@workspace/db";
import { createMasterRouter } from "./common";

// Product Category master (A) — read for any authed user; writes director-only.
const router = createMasterRouter({
  table: productCategoriesTable,
  schema: GetProductCategoryResponse,
  inputSchema: CreateProductCategoryBody,
  updateSchema: UpdateProductCategoryBody,
  resourceName: "Product Category",
  writeRoles: ["owner", "director"],
});

export default router;
