import {
  GetProductWorkflowResponse,
  CreateProductWorkflowBody,
  UpdateProductWorkflowBody,
} from "@workspace/api-zod";
import { productWorkflowsTable } from "@workspace/db";
import { createMasterRouter } from "./common";

// Product Workflow master (C) — read for any authed user; writes director-only.
// `stage_sequence` is DATA (ordered stage codes) carried through the generic
// create/update bodies; no enum migration is needed for new workflows.
const router = createMasterRouter({
  table: productWorkflowsTable,
  schema: GetProductWorkflowResponse,
  inputSchema: CreateProductWorkflowBody,
  updateSchema: UpdateProductWorkflowBody,
  resourceName: "Product Workflow",
  writeRoles: ["owner", "director"],
});

export default router;
