import { 
  GetProductMasterResponse, 
  CreateProductMasterBody, 
  UpdateProductMasterBody 
} from "@workspace/api-zod";
import { masterProductsTable } from "@workspace/db";
import { createMasterRouter } from "./common";

const router = createMasterRouter({
  table: masterProductsTable,
  schema: GetProductMasterResponse,
  inputSchema: CreateProductMasterBody,
  updateSchema: UpdateProductMasterBody,
  resourceName: "Product Master",
});

export default router;
