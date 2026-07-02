import {
  GetMaterialWorkflowResponse,
  CreateMaterialWorkflowBody,
  UpdateMaterialWorkflowBody,
} from "@workspace/api-zod";
import { materialWorkflowsTable } from "@workspace/db";
import { createMasterRouter } from "./common";

// Material Workflow master (Inventory) — read for any authed user; writes director-only
// (mirrors Product Workflow governance). `post_receipt_action` drives the GRN posting
// engine's routing; it is part of the create/update body (both values are implemented).
const router = createMasterRouter({
  table: materialWorkflowsTable,
  schema: GetMaterialWorkflowResponse,
  inputSchema: CreateMaterialWorkflowBody,
  updateSchema: UpdateMaterialWorkflowBody,
  resourceName: "Material Workflow",
  writeRoles: ["owner", "director"],
});

export default router;
