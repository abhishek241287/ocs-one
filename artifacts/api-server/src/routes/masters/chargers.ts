import { 
  GetChargerMasterResponse, 
  CreateChargerMasterBody, 
  UpdateChargerMasterBody 
} from "@workspace/api-zod";
import { masterChargersTable } from "@workspace/db";
import { createMasterRouter } from "./common";

const router = createMasterRouter({
  table: masterChargersTable,
  schema: GetChargerMasterResponse,
  inputSchema: CreateChargerMasterBody,
  updateSchema: UpdateChargerMasterBody,
  resourceName: "Charger Master",
});

export default router;
