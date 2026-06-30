import { 
  GetBmsMasterResponse, 
  CreateBmsMasterBody, 
  UpdateBmsMasterBody 
} from "@workspace/api-zod";
import { masterBmsTable } from "@workspace/db";
import { createMasterRouter } from "./common";
import { componentMasterIdentityGuard } from "../../lib/linked-master";

const router = createMasterRouter({
  table: masterBmsTable,
  schema: GetBmsMasterResponse,
  inputSchema: CreateBmsMasterBody,
  updateSchema: UpdateBmsMasterBody,
  resourceName: "BMS Master",
  // Identity-lock once linked to an active material with transactions.
  beforeWrite: componentMasterIdentityGuard("BMS", [
    "currentRatingA",
    "cellSupportCount",
  ]),
});

export default router;
