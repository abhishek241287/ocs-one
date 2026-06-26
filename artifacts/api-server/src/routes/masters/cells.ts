import { 
  GetCellMasterResponse, 
  CreateCellMasterBody, 
  UpdateCellMasterBody 
} from "@workspace/api-zod";
import { masterCellsTable } from "@workspace/db";
import { createMasterRouter } from "./common";

const router = createMasterRouter({
  table: masterCellsTable,
  schema: GetCellMasterResponse,
  inputSchema: CreateCellMasterBody,
  updateSchema: UpdateCellMasterBody,
  resourceName: "Cell Master",
});

export default router;
