import { 
  GetCabinetMasterResponse, 
  CreateCabinetMasterBody, 
  UpdateCabinetMasterBody 
} from "@workspace/api-zod";
import { masterCabinetsTable } from "@workspace/db";
import { createMasterRouter } from "./common";
import { componentMasterIdentityGuard } from "../../lib/linked-master";

const router = createMasterRouter({
  table: masterCabinetsTable,
  schema: GetCabinetMasterResponse,
  inputSchema: CreateCabinetMasterBody,
  updateSchema: UpdateCabinetMasterBody,
  resourceName: "Cabinet Master",
  // Identity-lock once linked to an active material with transactions.
  beforeWrite: componentMasterIdentityGuard("CABINET", [
    "material",
    "dimensions",
  ]),
});

export default router;
