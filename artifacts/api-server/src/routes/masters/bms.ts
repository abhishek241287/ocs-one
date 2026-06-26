import { 
  GetBmsMasterResponse, 
  CreateBmsMasterBody, 
  UpdateBmsMasterBody 
} from "@workspace/api-zod";
import { masterBmsTable } from "@workspace/db";
import { createMasterRouter } from "./common";

const router = createMasterRouter({
  table: masterBmsTable,
  schema: GetBmsMasterResponse,
  inputSchema: CreateBmsMasterBody,
  updateSchema: UpdateBmsMasterBody,
  resourceName: "BMS Master",
});

export default router;
