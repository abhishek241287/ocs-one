import { 
  GetCabinetMasterResponse, 
  CreateCabinetMasterBody, 
  UpdateCabinetMasterBody 
} from "@workspace/api-zod";
import { masterCabinetsTable } from "@workspace/db";
import { createMasterRouter } from "./common";

const router = createMasterRouter({
  table: masterCabinetsTable,
  schema: GetCabinetMasterResponse,
  inputSchema: CreateCabinetMasterBody,
  updateSchema: UpdateCabinetMasterBody,
  resourceName: "Cabinet Master",
});

export default router;
