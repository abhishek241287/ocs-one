import { 
  GetBusbarMasterResponse, 
  CreateBusbarMasterBody, 
  UpdateBusbarMasterBody 
} from "@workspace/api-zod";
import { masterBusbarsTable } from "@workspace/db";
import { createMasterRouter } from "./common";
import { componentMasterIdentityGuard } from "../../lib/linked-master";

const router = createMasterRouter({
  table: masterBusbarsTable,
  schema: GetBusbarMasterResponse,
  inputSchema: CreateBusbarMasterBody,
  updateSchema: UpdateBusbarMasterBody,
  resourceName: "Busbar Master",
  // Identity-lock once linked to an active material with transactions.
  beforeWrite: componentMasterIdentityGuard("BUSBAR", [
    "material",
    "thicknessMm",
    "widthMm",
  ]),
});

export default router;
