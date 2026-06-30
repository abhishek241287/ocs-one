import { 
  GetCableMasterResponse, 
  CreateCableMasterBody, 
  UpdateCableMasterBody 
} from "@workspace/api-zod";
import { masterCablesTable } from "@workspace/db";
import { createMasterRouter } from "./common";
import { componentMasterIdentityGuard } from "../../lib/linked-master";

const router = createMasterRouter({
  table: masterCablesTable,
  schema: GetCableMasterResponse,
  inputSchema: CreateCableMasterBody,
  updateSchema: UpdateCableMasterBody,
  resourceName: "Cable Master",
  // Identity-lock once linked to an active material with transactions.
  beforeWrite: componentMasterIdentityGuard("CABLE", [
    "sizeSqmm",
    "currentRatingA",
  ]),
});

export default router;
