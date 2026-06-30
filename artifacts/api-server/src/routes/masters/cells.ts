import { 
  GetCellMasterResponse, 
  CreateCellMasterBody, 
  UpdateCellMasterBody 
} from "@workspace/api-zod";
import { masterCellsTable } from "@workspace/db";
import { createMasterRouter } from "./common";
import { componentMasterIdentityGuard } from "../../lib/linked-master";

const router = createMasterRouter({
  table: masterCellsTable,
  schema: GetCellMasterResponse,
  inputSchema: CreateCellMasterBody,
  updateSchema: UpdateCellMasterBody,
  resourceName: "Cell Master",
  // Identity-lock once linked to an active material with transactions.
  beforeWrite: componentMasterIdentityGuard("CELL", [
    "chemistry",
    "capacityMah",
    "nominalVoltageV",
  ]),
});

export default router;
