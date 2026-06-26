import { 
  GetCableMasterResponse, 
  CreateCableMasterBody, 
  UpdateCableMasterBody 
} from "@workspace/api-zod";
import { masterCablesTable } from "@workspace/db";
import { createMasterRouter } from "./common";

const router = createMasterRouter({
  table: masterCablesTable,
  schema: GetCableMasterResponse,
  inputSchema: CreateCableMasterBody,
  updateSchema: UpdateCableMasterBody,
  resourceName: "Cable Master",
});

export default router;
