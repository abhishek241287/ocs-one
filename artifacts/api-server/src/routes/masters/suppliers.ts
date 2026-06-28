import {
  GetSupplierResponse,
  CreateSupplierBody,
  UpdateSupplierBody,
} from "@workspace/api-zod";
import { suppliersTable } from "@workspace/db";
import { createMasterRouter } from "./common";

// Supplier Master (Inventory) — read for any authed user; writes supervisor/director.
// A GRN references a supplier by FK (no free-text supplier names).
const router = createMasterRouter({
  table: suppliersTable,
  schema: GetSupplierResponse,
  inputSchema: CreateSupplierBody,
  updateSchema: UpdateSupplierBody,
  resourceName: "Supplier",
});

export default router;
