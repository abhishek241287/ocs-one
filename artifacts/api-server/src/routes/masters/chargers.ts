import { 
  GetChargerMasterResponse, 
  CreateChargerMasterBody, 
  UpdateChargerMasterBody 
} from "@workspace/api-zod";
import { masterChargersTable } from "@workspace/db";
import { createMasterRouter } from "./common";
import { componentMasterIdentityGuard } from "../../lib/linked-master";

const router = createMasterRouter({
  table: masterChargersTable,
  schema: GetChargerMasterResponse,
  inputSchema: CreateChargerMasterBody,
  updateSchema: UpdateChargerMasterBody,
  resourceName: "Charger Master",
  // Identity-lock once linked to an active material with transactions.
  beforeWrite: componentMasterIdentityGuard("CHARGER", [
    "outputVoltageV",
    "outputCurrentA",
    "powerKw",
  ]),
});

export default router;
