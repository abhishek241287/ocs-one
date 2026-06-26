import { 
  GetBusbarMasterResponse, 
  CreateBusbarMasterBody, 
  UpdateBusbarMasterBody 
} from "@workspace/api-zod";
import { masterBusbarsTable } from "@workspace/db";
import { createMasterRouter } from "./common";

const router = createMasterRouter({
  table: masterBusbarsTable,
  schema: GetBusbarMasterResponse,
  inputSchema: CreateBusbarMasterBody,
  updateSchema: UpdateBusbarMasterBody,
  resourceName: "Busbar Master",
});

export default router;
